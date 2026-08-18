import { PROCUREMENT_STATUS, estimateOpeningFreightBudget } from "./hubProcurement.js?v=fresh-20260818-0644-d8d52fb";
import { FIRST_REACH_TRANSPORT_CONNECTIONS } from "../content/transportation/firstReachNetwork.js?v=fresh-20260818-0644-d8d52fb";
import { createTransportationNetwork, findTransportationRoute } from "./transportationPlanning.js?v=fresh-20260818-0644-d8d52fb";
import { getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260818-0644-d8d52fb";

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

export function createInitialIndustrialState() {
  return {
    version: 1,
    factories: Object.fromEntries(FIRST_REACH_PART_FACTORIES.map((factory) => [factory.id, {
      ...structuredClone(factory), status: "available", activeRun: null, completedRuns: 0,
    }])),
    expansionPressure: {},
    counters: { order: 0, run: 0 },
  };
}

export function createIndustrialProductionOperation({ state, now = () => Date.now() } = {}) {
  state.industrial ??= createInitialIndustrialState();
  state.industrial.factories ??= createInitialIndustrialState().factories;
  state.industrial.counters ??= { order: 0, run: 0 };
  const industrial = state.industrial;

  const institutions = () => state.logistics?.institutions ?? {};
  const factoryHub = (factory) => institutions()[factory.institutionId] ?? null;
  const openPartOrders = (part = null) => Object.values(state.hubProcurement?.orders ?? {})
    .filter((order) => order.orderKind === "industrial-part"
      && (!part || order.resourceId === part)
      && ![PROCUREMENT_STATUS.DELIVERED, PROCUREMENT_STATUS.WITHHELD, PROCUREMENT_STATUS.DECLINED].includes(order.status));

  function finishRuns() {
    Object.values(industrial.factories).forEach((factory) => {
      const run = factory.activeRun;
      if (!run || run.completesAt > now()) return;
      const hub = factoryHub(factory);
      if (!hub) return;
      hub.inventories[run.output] = (hub.inventories[run.output] ?? 0) + run.amount;
      factory.activeRun = null;
      factory.status = "available";
      factory.completedRuns += 1;
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

  function startRuns() {
    Object.values(industrial.factories).forEach((factory) => {
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

  function postPartOrders() {
    const buyer = institutions()[SCRAP_PORCH_ID];
    if (!buyer?.accounts?.operating) return;
    INDUSTRIAL_PARTS.forEach((part) => {
      const existingOrders = openPartOrders(part);
      if (existingOrders.length >= MAX_OPEN_PART_ORDERS) return;
      const shortage = partDemand(part);
      if (shortage <= 0) return;
      const committedSuppliers = new Set(existingOrders.map((order) => order.supplierInstitutionId));
      const candidates = Object.values(industrial.factories)
        .filter((factory) => factory.recipes.some((recipe) => recipe.output === part))
        .filter((factory) => !committedSuppliers.has(factory.institutionId))
        .map((factory) => ({
          factory,
          route: routeBetween(factoryHub(factory)?.siteId ?? factory.institutionId, buyer.siteId ?? SCRAP_PORCH_ID),
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
        id, orderKind: "industrial-part", buyerInstitutionId: SCRAP_PORCH_ID,
        supplierInstitutionId: selected.factory.institutionId,
        family: "repair-parts", resourceId: part, units, effectiveUnits: units,
        pricePerUnit, originalPricePerUnit: pricePerUnit, committedPayment, freightBudget,
        deliveredUnits: 0, status: PROCUREMENT_STATUS.ACCEPTED,
        reasons: [`SPRC repair demand requires ${shortage} additional ${part}.`, `${selected.factory.name} is the best reachable producer.`],
        createdAt: now(), acceptedAt: now(), shipmentId: null,
      };
      buyer.accounts.operating.committed = (buyer.accounts.operating.committed ?? 0) + committedPayment;
      state.ledger.recordEvent("industry.partsOrdered", {
        procurementOrderId: id, buyerId: SCRAP_PORCH_ID, sellerId: selected.factory.institutionId,
        factoryId: selected.factory.id, itemId: part, units, committedPayment, freightBudget,
      }, { visible: true, message: `Scrap Porch ordered ${units} ${part.replaceAll("-", " ")} from ${selected.factory.name} for Sal's repair queue.` });
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
      const candidates = Object.values(institutions())
        .filter((hub) => hub.archetypeId === "settlement" && hub.siteId && !existingOwners.has(hub.id)
          && hub.accounts?.operating && (hub.renewableResources?.length ?? 0) > 0)
        .map((hub) => {
          const localInput = hub.renewableResources.find((resourceId) => getResourceFamily(resourceId) === preferredFamily)
            ?? hub.renewableResources[0];
          const matched = getResourceFamily(localInput) === preferredFamily;
          const inputUnits = matched ? 3 : 5;
          const protectedCash = hub.protectionPolicy?.protectedCash ?? 0;
          const freeCash = (hub.accounts.operating.balance ?? 0) - (hub.accounts.operating.committed ?? 0) - protectedCash;
          return { hub, localInput, matched, inputUnits, freeCash };
        })
        .filter((candidate) => candidate.freeCash >= FABRICATOR_CAPITAL_COST
          && (candidate.hub.inventories?.[candidate.localInput] ?? 0) >= candidate.inputUnits)
        .sort((first, second) => Number(second.matched) - Number(first.matched)
          || second.freeCash - first.freeCash
          || first.hub.id.localeCompare(second.hub.id));
      const selected = candidates[0];
      if (!selected) return;
      selected.hub.accounts.operating.balance -= FABRICATOR_CAPITAL_COST;
      selected.hub.inventories[selected.localInput] -= selected.inputUnits;
      const id = `${selected.hub.siteId}-${part}-fabricator`;
      industrial.factories[id] = {
        id, name: `${selected.hub.name} ${part === "hull-plate" ? "Plate" : "Parts"} Fabricator`,
        institutionId: selected.hub.id, status: "available", activeRun: null, completedRuns: 0,
        emergedFromPressure: true,
        recipes: [{
          output: part, amount: 1, inputs: { [selected.localInput]: selected.matched ? 2 : 4 },
          credits: selected.matched ? 38 : 64, seconds: selected.matched ? 30 : 45,
        }],
      };
      pressure.since = null;
      pressure.lastBuiltAt = now();
      state.ledger.recordEvent("industry.factoryCommissioned", {
        institutionId: selected.hub.id, factoryId: id, itemId: part,
        capitalCost: FABRICATOR_CAPITAL_COST, constructionInput: selected.localInput,
        locallyAdvantaged: selected.matched,
      }, { visible: true, message: `${selected.hub.name} commissioned a ${part.replaceAll("-", " ")} fabricator after sustained regional shortages.` });
    });
  }

  // Scrap Porch is Sal's local factor. It takes title through ordinary hub
  // procurement, then SPRC buys the landed parts across the counter. This keeps
  // both money movements visible and prevents imported parts teleporting into
  // a repair reservation.
  function transferLocalPartsToSprc() {
    const porch = institutions()[SCRAP_PORCH_ID];
    if (!porch || !state.sprc?.account) return;
    INDUSTRIAL_PARTS.forEach((part) => {
      const available = Math.floor(porch.inventories?.[part] ?? 0);
      if (available <= 0) return;
      const unitPrice = PART_PRICES[part];
      const spendable = Math.max(0, state.sprc.account.balance - state.sprc.account.protectedReserve - state.sprc.account.committed);
      const units = Math.min(available, Math.floor(spendable / unitPrice));
      if (units <= 0) return;
      const payment = units * unitPrice;
      porch.inventories[part] -= units;
      porch.accounts.operating.balance += payment;
      state.sprc.account.balance -= payment;
      state.sprc.inventories.produced[part] = (state.sprc.inventories.produced[part] ?? 0) + units;
      state.ledger.recordEvent("industry.partsTransferred", {
        sellerId: SCRAP_PORCH_ID, buyerId: "sprc", itemId: part, units, payment,
      }, { visible: true, message: `Sal bought ${units} imported ${part.replaceAll("-", " ")} from Scrap Porch.` });
    });
  }

  function observe() {
    finishRuns();
    transferLocalPartsToSprc();
  }

  function decide() {
    assessFactoryExpansion();
    postPartOrders();
    startRuns();
  }

  function update() { observe(); decide(); }
  return { observe, decide, update, getState: () => industrial, partDemand };
}
