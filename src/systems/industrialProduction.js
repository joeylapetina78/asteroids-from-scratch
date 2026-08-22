import { PROCUREMENT_STATUS, estimateOpeningFreightBudget } from "./hubProcurement.js?v=fresh-20260822-1330-factories";
import { listShipyards, shipyardPartShortage } from "./shipyards.js?v=fresh-20260822-1330-factories";
import { FIRST_REACH_TRANSPORT_CONNECTIONS } from "../content/transportation/firstReachNetwork.js?v=fresh-20260822-1330-factories";
import { createTransportationNetwork, findTransportationRoute } from "./transportationPlanning.js?v=fresh-20260822-1330-factories";
import { getResourceFamily, getResourceTradeValue } from "./resourceDefinitions.js?v=fresh-20260822-1330-factories";
import { getActorProtectedCash } from "./actorConfig.js?v=fresh-20260822-1330-factories";
import { findHubPopulation, getPopulationLaborSummary, recruitPopulationLabor } from "./populationLabor.js?v=fresh-20260822-1330-factories";
import { recordHubNeed, resolveHubNeed, transitionHubProject } from "./hubActors.js?v=fresh-20260822-1330-factories";
import { HUB_RESPONSE_KIND, planHubNeed } from "./hubPlanning.js?v=fresh-20260822-1330-factories";
import { isHubAggregated } from "./simulationMode.js?v=fresh-20260822-1330-factories";

export const INDUSTRIAL_PARTS = Object.freeze(["hull-plate", "machine-part"]);

// The first regional industrial triangle. Each works from the material its hub
// is unusually good at obtaining; auxiliary labor and tooling live in the
// conversion charge. These are deliberately not identical copies of The Maw.
export const FIRST_REACH_PART_FACTORIES = Object.freeze([
  {
    id: "yard-plate-works", name: "Yard Plate Works", institutionId: "yard-exchange",
    recipes: [{ output: "hull-plate", amount: 1, inputs: { "iron-nickel": 2 }, credits: 28, seconds: 24 }],
  },
  {
    id: "ledge-machine-works", name: "Ledge Machine Works", institutionId: "the-ledge",
    recipes: [{ output: "machine-part", amount: 1, inputs: { silicate: 2 }, credits: 34, seconds: 24 }],
  },
  {
    id: "ore-light-alloy-works", name: "Ore Light-Alloy Works", institutionId: "ore-station-one",
    recipes: [{ output: "hull-plate", amount: 2, inputs: { aluminum: 2 }, credits: 44, seconds: 30 }],
  },
]);

const PART_PRICES = Object.freeze({ "hull-plate": 125, "machine-part": 115 });
const PART_BUFFER_TARGETS = Object.freeze({ "hull-plate": 10, "machine-part": 8 });
const FACTORY_SHELF_TARGET = 3;
const MAX_PART_ORDER_UNITS = 8;
const MAX_OPEN_PART_ORDERS = 3;
const SCRAP_PORCH_ID = "scrap-forge";
const EXPANSION_PRESSURE_SECONDS = 180;
const FABRICATOR_CAPITAL_COST = 900;
const FABRICATOR_CONSTRUCTION_SECONDS = 60;
const FABRICATOR_WORKERS = 4;

export function createInitialIndustrialState() {
  return {
    version: 1,
    factories: Object.fromEntries(FIRST_REACH_PART_FACTORIES.map((factory) => [factory.id, {
      ...structuredClone(factory), status: "available", activeRun: null, completedRuns: 0,
    }])),
    expansionPressure: {},
    constructionProjects: {},
    counters: { order: 0, run: 0 },
  };
}

export function createIndustrialProductionOperation({ state, now = () => Date.now() } = {}) {
  state.industrial ??= createInitialIndustrialState();
  state.industrial.factories ??= createInitialIndustrialState().factories;
  state.industrial.counters ??= { order: 0, run: 0 };
  state.industrial.constructionProjects ??= {};
  const industrial = state.industrial;

  function finishFactoryConstruction() {
    Object.values(industrial.constructionProjects).forEach((project) => {
      if (isHubAggregated(state, project.institutionId)) return;
      if (project.status !== "building" || project.completesAt > now()) return;
      industrial.factories[project.factory.id] = project.factory;
      project.status = "completed";
      project.completedAt = now();
      if (project.hubProjectId) {
        transitionHubProject(state, project.institutionId, project.hubProjectId, "completed",
          { assetId: project.factory.id, operatorId: project.operatorId }, now());
      }
      if (project.hubNeedId) {
        resolveHubNeed(state, project.institutionId, project.hubNeedId,
          { projectId: project.hubProjectId, assetId: project.factory.id }, now());
      }
      state.ledger.recordEvent("industry.factoryCommissioned", {
        institutionId: project.institutionId, factoryId: project.factory.id, itemId: project.itemId,
        capitalCost: project.capitalCost, constructionInput: project.constructionInput,
        constructionUnits: project.constructionUnits, laborAssignmentId: project.laborAssignmentId,
        operatorId: project.operatorId, locallyAdvantaged: project.locallyAdvantaged,
      }, { visible: true, message: `${project.hubName} opened its new ${project.itemId.replaceAll("-", " ")} fabricator under ${project.operatorName}'s charter.` });
    });
  }

  const institutions = () => state.logistics?.institutions ?? {};
  const factoryHub = (factory) => institutions()[factory.institutionId] ?? null;
  const openPartOrders = (part = null) => Object.values(state.hubProcurement?.orders ?? {})
    .filter((order) => order.orderKind === "industrial-part"
      && (!part || order.resourceId === part)
      && ![PROCUREMENT_STATUS.DELIVERED, PROCUREMENT_STATUS.WITHHELD, PROCUREMENT_STATUS.DECLINED].includes(order.status));

  function finishRuns() {
    Object.values(industrial.factories).forEach((factory) => {
      if (isHubAggregated(state, factory.institutionId)) return;
      const run = factory.activeRun;
      if (!run || run.completesAt > now()) return;
      const hub = factoryHub(factory);
      if (!hub) return;
      hub.inventories[run.output] = (hub.inventories[run.output] ?? 0) + run.amount;
      factory.activeRun = null;
      factory.status = "available";
      factory.completedRuns += 1;
      factory.operatingHistory ??= { ordersAccepted: 0, contractedRevenue: 0, firstRunAt: run.startedAt, lastRunAt: null };
      factory.operatingHistory.firstRunAt ??= run.startedAt;
      factory.operatingHistory.lastRunAt = now();
      state.ledger.recordEvent("industry.partsProduced", {
        factoryId: factory.id, institutionId: factory.institutionId,
        itemId: run.output, units: run.amount, runId: run.id,
      }, { visible: true, message: `${factory.name} completed ${run.amount} ${run.output.replaceAll("-", " ")}.` });
    });
  }

  function committedOutput(factory, part) {
    return openPartOrders(part)
      .filter((order) => order.supplierInstitutionId === factory.institutionId)
      .reduce((sum, order) => sum + Math.max(0, order.units - (order.deliveredUnits ?? 0)), 0);
  }

  // A spun-out works buys feedstock from its former municipal parent under the
  // local supply agreement created at independence. This is a real same-site
  // sale: material and credits both move, the parent keeps a working reserve,
  // and the business can continue after its opening inventory is consumed.
  function replenishSpinoutInputs() {
    Object.values(industrial.factories).filter((factory) => factory.spinoutInstitutionId).forEach((factory) => {
      if (isHubAggregated(state, factory.institutionId) || isHubAggregated(state, factory.formerInstitutionId)) return;
      const business = factoryHub(factory);
      const parent = institutions()[factory.formerInstitutionId];
      if (!business?.accounts?.operating || !parent?.accounts?.operating) return;
      factory.recipes.forEach((recipe) => Object.entries(recipe.inputs ?? {}).forEach(([itemId, unitsPerRun]) => {
        const target = unitsPerRun * 4;
        const onHand = business.inventories?.[itemId] ?? 0;
        if (onHand >= target) return;
        const parentAvailable = Math.max(0, (parent.inventories?.[itemId] ?? 0) - unitsPerRun * 2);
        const unitPrice = Math.max(1, Math.ceil(getResourceTradeValue(itemId) * 1.05));
        const spendable = Math.max(0, business.accounts.operating.balance
          - (business.accounts.operating.committed ?? 0) - getActorProtectedCash(state, business.id));
        const units = Math.min(target - onHand, parentAvailable, Math.floor(spendable / unitPrice));
        if (units <= 0) return;
        const payment = units * unitPrice;
        parent.inventories[itemId] -= units;
        business.inventories[itemId] = onHand + units;
        business.accounts.operating.balance -= payment;
        parent.accounts.operating.balance += payment;
        business.accounts.operating.transactions ??= [];
        parent.accounts.operating.transactions ??= [];
        business.accounts.operating.transactions.push({ id: `SUPPLY-${factory.id}-${itemId}-${now()}-OUT`, at: now(),
          type: "production-input-purchase", amount: -payment, balance: business.accounts.operating.balance, referenceId: parent.id });
        parent.accounts.operating.transactions.push({ id: `SUPPLY-${factory.id}-${itemId}-${now()}-IN`, at: now(),
          type: "production-input-sale", amount: payment, balance: parent.accounts.operating.balance, referenceId: business.id });
        state.ledger.recordEvent("industry.spinoutInputPurchased", {
          factoryId: factory.id, buyerInstitutionId: business.id, sellerInstitutionId: parent.id,
          itemId, units, unitPrice, payment,
        }, { visible: false });
      }));
    });
  }

  function startRuns() {
    Object.values(industrial.factories).forEach((factory) => {
      if (isHubAggregated(state, factory.institutionId)) return;
      if (factory.activeRun) return;
      const hub = factoryHub(factory);
      if (!hub?.accounts?.operating) return;
      const recipe = factory.recipes.find((candidate) => {
        const target = FACTORY_SHELF_TARGET + committedOutput(factory, candidate.output);
        if ((hub.inventories[candidate.output] ?? 0) >= target) return false;
        if ((hub.accounts.operating.balance ?? 0) - (hub.accounts.operating.committed ?? 0) < candidate.credits) return false;
        return Object.entries(candidate.inputs).every(([itemId, units]) => (hub.inventories[itemId] ?? 0) >= units);
      });
      if (!recipe) return;
      Object.entries(recipe.inputs).forEach(([itemId, units]) => { hub.inventories[itemId] -= units; });
      hub.accounts.operating.balance -= recipe.credits;
      const id = `IND-RUN-${String(++industrial.counters.run).padStart(4, "0")}`;
      factory.activeRun = { id, output: recipe.output, amount: recipe.amount, startedAt: now(), completesAt: now() + recipe.seconds * 1000 };
      factory.status = "working";
      state.ledger.recordEvent("industry.productionStarted", {
        factoryId: factory.id, institutionId: factory.institutionId, runId: id,
        itemId: recipe.output, inputs: recipe.inputs, conversionCost: recipe.credits,
      }, { visible: false });
    });
  }

  function partDemand(part) {
    const repairs = Object.values(state.sprc?.repairOrders ?? {})
      .filter((repair) => !["completed", "canceled"].includes(repair.status));
    const required = repairs.reduce((sum, repair) => sum + (repair.requirements?.produced?.[part] ?? 0), 0);
    const reserved = repairs.reduce((sum, repair) => sum + (repair.reserved?.produced?.[part] ?? 0), 0);
    const onHand = state.sprc?.inventories?.produced?.[part] ?? 0;
    const porchStock = institutions()[SCRAP_PORCH_ID]?.inventories?.[part] ?? 0;
    const incoming = openPartOrders(part).reduce((sum, order) => sum + Math.max(0, order.units - (order.deliveredUnits ?? 0)), 0);
    const configuredTarget = state.sprc?.operatingPlan?.inventoryTargets?.[part] ?? 0;
    const safetyTarget = Math.max(configuredTarget, PART_BUFFER_TARGETS[part] ?? 6, Math.ceil(repairs.length * 0.75));
    const projectUnits = Object.values(state.sprc?.projects ?? {})
      .filter((project) => ["funding", "building"].includes(project?.status))
      .reduce((sum, project) => sum + Math.max(0, (project.requirements?.[part] ?? 0) - (project.reserved?.[part] ?? 0)), 0);
    return Math.max(0, required - reserved + safetyTarget + projectUnits - onHand - porchStock - incoming);
  }

  function routeBetween(fromId, toId) {
    const ids = Array.from(new Set(FIRST_REACH_TRANSPORT_CONNECTIONS.flatMap((connection) => [connection.fromId, connection.toId])));
    const network = createTransportationNetwork({ destinations: ids.map((id) => ({ id })), connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
    return findTransportationRoute(network, fromId, toId);
  }

  // Who wants parts, and how badly.
  //
  // Repair work was the only buyer this market had ever had. Shipbuilding is the
  // second, and it competes on the same footing rather than being given a
  // private supply — which is what makes added demand show up as expansion
  // pressure on the factories instead of as a quiet shortage nobody can see.
  function partsBuyers() {
    const buyers = [{ buyerId: SCRAP_PORCH_ID, reason: "Sal's repair queue", demandFor: partDemand }];
    listShipyards(state).forEach((yard) => {
      const ownerId = yard.ownerInstitutionId;
      if (!ownerId) return;
      buyers.push({
        buyerId: ownerId,
        reason: `${yard.name} has a hull to lay`,
        demandFor: (part) => shipyardPartShortage(state, yard, part),
      });
    });
    return buyers;
  }

  function postPartOrders() {
    partsBuyers().forEach((demand) => postPartOrdersFor(demand));
  }

  function postPartOrdersFor({ buyerId, reason, demandFor }) {
    const buyer = institutions()[buyerId];
    if (!buyer?.accounts?.operating || isHubAggregated(state, buyerId)) return;
    INDUSTRIAL_PARTS.forEach((part) => {
      const existingOrders = openPartOrders(part).filter((order) => order.buyerInstitutionId === buyerId);
      if (existingOrders.length >= MAX_OPEN_PART_ORDERS) return;
      const shortage = demandFor(part);
      if (shortage <= 0) return;
      const committedSuppliers = new Set(existingOrders.map((order) => order.supplierInstitutionId));
      const candidates = Object.values(industrial.factories)
        .filter((factory) => !isHubAggregated(state, factory.institutionId))
        .filter((factory) => factory.recipes.some((recipe) => recipe.output === part))
        .filter((factory) => !committedSuppliers.has(factory.institutionId))
        .map((factory) => ({
          factory,
          route: routeBetween(factoryHub(factory)?.siteId ?? factory.institutionId, buyer.siteId ?? buyerId),
        }))
        .filter(({ route }) => route)
        .sort((first, second) => {
          const firstStock = factoryHub(first.factory)?.inventories?.[part] ?? 0;
          const secondStock = factoryHub(second.factory)?.inventories?.[part] ?? 0;
          return secondStock - firstStock || first.route.distance - second.route.distance;
        });
      const selected = candidates[0];
      if (!selected) return;
      const units = Math.min(MAX_PART_ORDER_UNITS, Math.ceil(shortage));
      const pricePerUnit = PART_PRICES[part];
      const committedPayment = units * pricePerUnit;
      const freightBudget = estimateOpeningFreightBudget(selected.route.distance);
      const protectedCash = buyer.protectionPolicy?.protectedCash ?? 0;
      const free = (buyer.accounts.operating.balance ?? 0) - (buyer.accounts.operating.committed ?? 0) - protectedCash;
      if (free < committedPayment + freightBudget) return;

      const id = `IND-PO-${String(++industrial.counters.order).padStart(4, "0")}`;
      state.hubProcurement.orders[id] = {
        id, orderKind: "industrial-part", buyerInstitutionId: buyerId,
        factoryId: selected.factory.id,
        supplierInstitutionId: selected.factory.institutionId,
        family: "repair-parts", resourceId: part, units, effectiveUnits: units,
        pricePerUnit, originalPricePerUnit: pricePerUnit, committedPayment, freightBudget,
        deliveredUnits: 0, status: PROCUREMENT_STATUS.ACCEPTED,
        reasons: [`${reason}: ${Math.ceil(shortage)} more ${part} needed.`, `${selected.factory.name} is the best reachable producer.`],
        createdAt: now(), acceptedAt: now(), shipmentId: null,
      };
      buyer.accounts.operating.committed = (buyer.accounts.operating.committed ?? 0) + committedPayment;
      selected.factory.operatingHistory ??= { ordersAccepted: 0, contractedRevenue: 0, firstRunAt: null, lastRunAt: null };
      selected.factory.operatingHistory.ordersAccepted += 1;
      selected.factory.operatingHistory.contractedRevenue += committedPayment;
      state.ledger.recordEvent("industry.partsOrdered", {
        procurementOrderId: id, buyerId, sellerId: selected.factory.institutionId,
        factoryId: selected.factory.id, itemId: part, units, committedPayment, freightBudget,
      }, { visible: true, message: `${buyer.name ?? buyerId} ordered ${units} ${part.replaceAll("-", " ")} from ${selected.factory.name} — ${reason}.` });
    });
  }

  function assessFactoryExpansion() {
    industrial.expansionPressure ??= {};
    INDUSTRIAL_PARTS.forEach((part) => {
      const shortage = partDemand(part);
      const pressure = industrial.expansionPressure[part] ??= { since: null, lastBuiltAt: null };
      if (shortage < 5) { pressure.since = null; return; }
      pressure.since ??= now();
      if (now() - pressure.since < EXPANSION_PRESSURE_SECONDS * 1000) return;

      const preferredFamily = part === "hull-plate" ? "structural" : "industrial";
      const existingOwners = new Set(Object.values(industrial.factories)
        .filter((factory) => factory.recipes.some((recipe) => recipe.output === part))
        .map((factory) => factory.institutionId));
      Object.values(industrial.constructionProjects)
        .filter((project) => project.status === "building" && project.itemId === part)
        .forEach((project) => existingOwners.add(project.institutionId));
      const candidates = Object.values(institutions())
        .filter((hub) => hub.archetypeId === "settlement" && hub.siteId && !existingOwners.has(hub.id)
          && hub.accounts?.operating && (hub.renewableResources?.length ?? 0) > 0 && !isHubAggregated(state, hub.id))
        .map((hub) => {
          const localInput = hub.renewableResources.find((resourceId) => getResourceFamily(resourceId) === preferredFamily)
            ?? hub.renewableResources[0];
          const matched = getResourceFamily(localInput) === preferredFamily;
          const inputUnits = matched ? 3 : 5;
          const protectedCash = hub.protectionPolicy?.protectedCash ?? 0;
          const freeCash = (hub.accounts.operating.balance ?? 0) - (hub.accounts.operating.committed ?? 0) - protectedCash;
          const labor = getPopulationLaborSummary(state, findHubPopulation(state, hub.id));
          return { hub, localInput, matched, inputUnits, freeCash, availableLabor: labor?.available ?? 0 };
        })
        .filter((candidate) => candidate.freeCash >= FABRICATOR_CAPITAL_COST
          && (candidate.hub.inventories?.[candidate.localInput] ?? 0) >= candidate.inputUnits
          && candidate.availableLabor >= FABRICATOR_WORKERS)
        .sort((first, second) => Number(second.matched) - Number(first.matched)
          || second.freeCash - first.freeCash
          || first.hub.id.localeCompare(second.hub.id));
      const selected = candidates[0];
      if (!selected) return;
      const id = `${selected.hub.siteId}-${part}-fabricator`;
      const projectId = `construction:${id}`;
      const hubNeedId = `hub-need:${selected.hub.id}:parts-capacity:${part}`;
      if (!selected.hub.hubState?.needs?.[hubNeedId] || selected.hub.hubState.needs[hubNeedId].status !== "open") {
        recordHubNeed(state, selected.hub.id, {
          id: hubNeedId, kind: "industrial-capacity", purpose: "growth", urgency: "urgent", shortage,
          context: { itemId: part, regionalDemand: shortage, locallyAdvantaged: selected.matched },
          responseOptions: [
            { id: `${hubNeedId}:build`, kind: HUB_RESPONSE_KIND.BUILD,
              capabilityId: "commission-parts-factory", executor: "industry", priority: 100,
              requirements: { credits: FABRICATOR_CAPITAL_COST, labor: FABRICATOR_WORKERS,
                materials: { [selected.localInput]: selected.inputUnits }, durationSeconds: FABRICATOR_CONSTRUCTION_SECONDS } },
            { id: `${hubNeedId}:import`, kind: HUB_RESPONSE_KIND.IMPORT,
              capabilityId: "procure-input", executor: "procurement", priority: 55,
              rationale: "Continue importing parts instead of adding permanent local plant." },
            { id: `${hubNeedId}:subsidize`, kind: HUB_RESPONSE_KIND.SUBSIDIZE,
              capabilityId: "sponsor-operator", executor: "industry", priority: 45 },
            { id: `${hubNeedId}:borrow`, kind: HUB_RESPONSE_KIND.BORROW,
              executor: "finance", priority: 35, allowDebt: false,
              requirements: { credits: FABRICATOR_CAPITAL_COST } },
            { id: `${hubNeedId}:delay`, kind: HUB_RESPONSE_KIND.DELAY, priority: 10 },
            { id: `${hubNeedId}:accept`, kind: HUB_RESPONSE_KIND.ACCEPT_SHORTAGE, priority: 1 },
          ],
        }, now());
      }
      const hubProject = planHubNeed(state, selected.hub.id, hubNeedId, now());
      if (hubProject?.responseKind !== HUB_RESPONSE_KIND.BUILD || hubProject.status !== "planned") return;
      const recruited = recruitPopulationLabor(state, {
        hubInstitutionId: selected.hub.id, assignmentId: `employment:${id}`, role: "factory-supervisor",
        workers: FABRICATOR_WORKERS, employerInstitutionId: selected.hub.id, assetId: id, at: now(),
        charter: { kind: "municipal-industrial-charter", facilityId: id, outputItemId: part },
      });
      if (!recruited.ok) {
        transitionHubProject(state, selected.hub.id, hubProject.id, "blocked", { blocker: recruited.reason }, now());
        return;
      }
      transitionHubProject(state, selected.hub.id, hubProject.id, "building", {}, now());
      selected.hub.accounts.operating.balance -= FABRICATOR_CAPITAL_COST;
      selected.hub.inventories[selected.localInput] -= selected.inputUnits;
      const factory = {
        id, name: `${selected.hub.name} ${part === "hull-plate" ? "Plate" : "Parts"} Fabricator`,
        institutionId: selected.hub.id, status: "available", activeRun: null, completedRuns: 0,
        operatorId: recruited.operator.id, laborAssignmentId: recruited.assignment.id,
        emergedFromPressure: true,
        recipes: [{
          output: part, amount: 1, inputs: { [selected.localInput]: selected.matched ? 2 : 4 },
          credits: selected.matched ? 38 : 64, seconds: selected.matched ? 30 : 45,
        }],
      };
      industrial.constructionProjects[projectId] = {
        id: projectId, status: "building", institutionId: selected.hub.id, hubName: selected.hub.name,
        itemId: part, factory, capitalCost: FABRICATOR_CAPITAL_COST,
        hubNeedId, hubProjectId: hubProject.id,
        constructionInput: selected.localInput, constructionUnits: selected.inputUnits,
        locallyAdvantaged: selected.matched, laborAssignmentId: recruited.assignment.id,
        operatorId: recruited.operator.id, operatorName: recruited.operator.name,
        startedAt: now(), completesAt: now() + FABRICATOR_CONSTRUCTION_SECONDS * 1000,
      };
      pressure.since = null;
      pressure.lastBuiltAt = now();
      state.ledger.recordEvent("industry.factoryConstructionStarted", {
        institutionId: selected.hub.id, factoryId: id, itemId: part,
        capitalCost: FABRICATOR_CAPITAL_COST, constructionInput: selected.localInput,
        constructionUnits: selected.inputUnits, laborAssignmentId: recruited.assignment.id,
        operatorId: recruited.operator.id, completesAt: now() + FABRICATOR_CONSTRUCTION_SECONDS * 1000,
        locallyAdvantaged: selected.matched,
      }, { visible: true, message: `${selected.hub.name} funded and staffed a new ${part.replaceAll("-", " ")} fabricator after sustained regional shortages.` });
    });
  }

  // Scrap Porch takes title through ordinary hub procurement. Moving landed
  // parts into its SPRC department changes custody, not ownership, so no money
  // crosses an imaginary counter inside the same institution.
  function transferLocalPartsToSprc() {
    const porch = institutions()[SCRAP_PORCH_ID];
    if (!porch || !state.sprc?.account || isHubAggregated(state, SCRAP_PORCH_ID)) return;
    INDUSTRIAL_PARTS.forEach((part) => {
      const available = Math.floor(porch.inventories?.[part] ?? 0);
      if (available <= 0) return;
      const units = available;
      porch.inventories[part] -= units;
      state.sprc.inventories.produced[part] = (state.sprc.inventories.produced[part] ?? 0) + units;
      state.ledger.recordEvent("industry.partsTransferred", {
        ownerInstitutionId: SCRAP_PORCH_ID, custodianOperationId: "sprc", itemId: part, units, payment: 0,
      }, { visible: true, message: `Scrap Porch allocated ${units} imported ${part.replaceAll("-", " ")} to Sal's repair department.` });
    });
  }

  function observe() {
    finishFactoryConstruction();
    finishRuns();
    transferLocalPartsToSprc();
  }

  function decide() {
    assessFactoryExpansion();
    postPartOrders();
    replenishSpinoutInputs();
    startRuns();
  }

  function update() { observe(); decide(); }
  return { observe, decide, update, getState: () => industrial, partDemand };
}
