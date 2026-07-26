import { depositCredits } from "./accounts.js?v=fresh-20260726-1547-ca4bfea";
import { issueWorldDocument, upsertWorldEntity } from "./worldRecords.js?v=fresh-20260726-1547-ca4bfea";
import { createNeedRecord, createResponseRecord, evaluateAffordability, generateCapabilityResponses, resolveInstitutionPolicy } from "./institutionDecision.js";
import { INSTITUTION_ARCHETYPES } from "../content/institutions/institutionArchetypes.js";
import { createSalInstitutionInstance, createSprcInstitutionInstance } from "../content/institutions/institutionInstances.js";
import { matchMaintenanceService } from "./maintenanceService.js";

export const SPRC = Object.freeze({
  actorId: "organization:sprc",
  siteId: "scrap-porch",
  serviceId: "scrap-porch-recovery",
  factorId: "sal",
  facilityId: "facility:sprc-maw",
  berthId: "facility:sprc-berth-two",
  firstHaulerId: "hauler-scrap-yard",
  secondHaulerId: "hauler-yard-scrap",
});

export const SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK = Object.freeze({
  "iron-nickel": 1,
  aluminum: 2,
});

const ROUTES_BEFORE_PROVISIONAL_REPAIR = 2;
const PLATE_BATCH_SECONDS = 30;
const REPAIR_SECONDS = 30;
const DIRECT_PROCUREMENT = Object.freeze({
  copper: { price: 60, title: "SPRC Control Conductor", description: "copper units" },
  silicate: { price: 20, title: "SPRC Machine-Part Silicate", description: "silicate units" },
});
const SERVICE_REPAIR_RECIPES = Object.freeze({
  "maneuvering-strain": { produced: { "hull-plate": 1, "machine-part": 1 }, raw: {} },
  "hull-fatigue": { produced: { "hull-plate": 2, "machine-part": 0 }, raw: {} },
  "control-fault": { produced: { "hull-plate": 0, "machine-part": 2 }, raw: {} },
  "preventive-service": { produced: { "hull-plate": 0, "machine-part": 1 }, raw: {} },
  "structural-fatigue": { produced: { "hull-plate": 1, "machine-part": 1 }, raw: {} },
  "tractor-field-instability": { produced: { "machine-part": 1 }, raw: { copper: 1 } },
  "field-control-failure": { produced: {}, raw: { copper: 1 } },
  "preventive-calibration": { produced: { "machine-part": 1 }, raw: {} },
});

export function createInitialSprcState(now = Date.now()) {
  const institution = createSprcInstitutionInstance(now);
  const controller = createSalInstitutionInstance();
  return {
    version: 2,
    institution: { id: institution.id, archetypeId: institution.archetypeId, controllerInstitutionId: institution.controllerInstitutionId, siteId: institution.siteId, serviceCapabilities: institution.serviceCapabilities },
    controller,
    actor: {
      id: SPRC.actorId,
      name: "Scrap Porch Recovery Cooperative",
      factorEntityId: `person:${SPRC.factorId}`,
      siteId: SPRC.siteId,
      relationship: { playerReliability: 0 },
    },
    account: { ...institution.accounts.operating, protectedReserve: institution.policies.protectedCash },
    operatingPlan: {
      id: "sprc-plan-frontier-reliability",
      name: "Keep one berth working, then build the next one",
      inventoryTargets: institution.policies.inventoryTargets,
      safetyStock: institution.policies.safetyStock,
      projectedRepairCoverageTarget: institution.policies.projectedServiceCoverageTarget,
      protectedCashReserve: institution.policies.protectedCash,
      servicePriorities: institution.policies.servicePriorities,
      procurementBatchSizes: institution.policies.procurementBatchSizes,
      rationale: "Cover two likely repairs without betting the cooperative's last credits.",
      lastAssessedAt: now,
    },
    projects: institution.projects,
    inventories: institution.inventories,
    facilities: {
      maw: { id: SPRC.facilityId, name: "The Maw", facilityType: "recovery-mill", status: "working", capacity: 1, activeProductionOrderId: null },
      berthTwo: { id: SPRC.berthId, name: "Berth Two", facilityType: "repair-berth", status: "available", capacity: 1, activeRepairOrderId: null },
    },
    haulers: {
      [SPRC.secondHaulerId]: {
        id: SPRC.secondHaulerId, pilotEntityId: "person:hauler-yard-scrap-operator", pilotName: "Yard Hauler Operator",
        shipVin: "HAUL-01-HAULER-YARD-SCRAP", shipName: "Yard Hauler", homeOrganizationId: "carrier:yard-hauler",
        assignment: { type: "standing-freight", routeId: "yard-exchange-scrap-porch", provisional: false }, cargoCustody: [], condition: "serviceable", maintenanceStatus: "available", routeCompletions: 0, lastMaintenanceTriggerRouteCompletion: 0, repairHistory: [], currentLocationSiteId: "yard-exchange", availableForWork: true,
      },
      [SPRC.firstHaulerId]: {
        id: SPRC.firstHaulerId,
        pilotEntityId: "person:hauler-scrap-yard-operator",
        pilotName: "Mara Venn",
        shipVin: "HAUL-02-HAULER-SCRAP-YARD",
        shipName: "Porch Runner Two",
        homeOrganizationId: "organization:scrap-porch-carriers",
        assignment: { type: "legacy-route", routeId: "scrap-porch-yard-exchange", provisional: true },
        cargoCustody: [],
        condition: "serviceable",
        maintenanceStatus: "available",
        routeCompletions: 0,
        lastMaintenanceTriggerRouteCompletion: 0,
        repairHistory: [],
        currentLocationSiteId: SPRC.siteId,
        availableForWork: true,
      },
    },
    repairOrders: {},
    repairQueue: [],
    productionOrders: {},
    productionQueue: [],
    needs: {},
    responses: {},
    procurementOrders: {},
    history: [{ id: "sprc-founded", type: "operation.instantiated", at: now }],
    counters: { repair: 0, production: 0, need: 0, response: 0, procurement: 0 },
    lastLedgerEventId: 0,
  };
}

export function ensureSprcOperation(state, now = Date.now()) {
  state.sprc ??= createInitialSprcState(now);
  const sprc = state.sprc;
  sprc.inventories.reserved ??= { raw: {}, produced: {} };
  sprc.repairOrders ??= {};
  sprc.serviceSubjects ??= sprc.haulers;
  Object.entries(sprc.haulers ?? {}).forEach(([id, hauler]) => { sprc.serviceSubjects[id] = hauler; });
  sprc.repairQueue ??= [];
  sprc.productionOrders ??= {};
  sprc.productionQueue ??= [];
  sprc.needs ??= {};
  sprc.responses ??= {};
  sprc.procurementOrders ??= {};
  Object.values(sprc.procurementOrders).forEach((order) => {
    order.paidAmount ??= order.status === "paid" ? order.maximumPayment ?? 0 : 0;
    order.supplierDeliveries ??= [];
    order.allocations ??= {};
    if (order.acceptedAt && !order.playerAcceptedAt) order.playerAcceptedAt = order.acceptedAt;
  });
  sprc.history ??= [];
  sprc.counters ??= { repair: 0, production: 0, need: 0, response: 0, procurement: 0 };
  sprc.lastLedgerEventId ??= 0;
  sprc.account.committed ??= 0;
  sprc.operatingPlan.protectedCashReserve ??= sprc.account.protectedReserve ?? 900;
  sprc.account.protectedReserve = sprc.operatingPlan.protectedCashReserve;
  sprc.institution ??= { id: "sprc", archetypeId: "repair-cooperative", controllerInstitutionId: "sal" };
  const institutionDefaults = createSprcInstitutionInstance(now);
  sprc.institution.siteId ??= institutionDefaults.siteId;
  sprc.institution.serviceCapabilities ??= institutionDefaults.serviceCapabilities;
  sprc.facilities.maw.facilityType ??= "recovery-mill";
  sprc.facilities.berthTwo.facilityType ??= "repair-berth";
  sprc.operatingPlan.inventoryTargets.copper ??= 1;
  sprc.operatingPlan.safetyStock.copper ??= 1;
  sprc.operatingPlan.procurementBatchSizes ??= { copper: 3, silicate: 6 };
  sprc.inventories.raw.copper ??= 1;
  sprc.controller ??= createSalInstitutionInstance();
  seedSprcWorldRecords(state);
  return sprc;
}

export function createSprcOperation({ state, registerContractDefinition = () => {}, now = () => Date.now(), onChange = () => {} }) {
  const sprc = ensureSprcOperation(state, now());
  restoreContractDefinitions();

  function update() {
    sprc.account.protectedReserve = sprc.operatingPlan.protectedCashReserve;
    consumeLedgerEvents();
    expireProcurementOrders();
    completeDueProduction();
    completeDueRepairs();
    startNextProduction();
    startNextRepair();
    assessOpenRepairs();
    assessOperatingPlan();
    restoreContractDefinitions();
    onChange(getSnapshot());
  }

  function consumeLedgerEvents() {
    const events = state.ledger.getEventsAfterId(sprc.lastLedgerEventId, { includeHidden: true });
    events.forEach((event) => {
      sprc.lastLedgerEventId = Math.max(sprc.lastLedgerEventId, event.id);
      if (event.type === "npc.routeCompleted" && event.payload.npcId === SPRC.firstHaulerId) {
        recordRouteCompletion(event.payload);
      } else if (event.type === "maintenance.requested") {
        createServiceRepairOrder(event.payload);
      } else if (event.type === "logistics.maintenanceRequired" && sprc.serviceSubjects[event.payload.npcId]) {
        createServiceRepairOrder(createLegacyFreightRequest(event.payload));
      }
    });
  }

  function recordRouteCompletion(payload) {
    const hauler = sprc.haulers[SPRC.firstHaulerId];
    if (!hauler || !hauler.availableForWork) return;
    hauler.routeCompletions += 1;
    hauler.currentLocationSiteId = payload.siteId ?? hauler.currentLocationSiteId;
    appendHistory("hauler.routeCompleted", { haulerId: hauler.id, routeCompletions: hauler.routeCompletions, siteId: payload.siteId });
  }

  function createLegacyFreightRequest(payload) {
    const subject = sprc.serviceSubjects[payload.npcId];
    return { ...payload, subjectId: payload.npcId, subjectName: subject.shipName, craftClass: "freight-hauler", locationSiteId: SPRC.siteId, mobility: "recovered", requiredCapabilities: payload.issueType === "hull-fatigue" ? ["structural-repair"] : payload.issueType === "control-fault" ? ["control-systems"] : ["mechanical-repair"], payer: { balance: 1000, committed: 0, protectedCash: 0 }, payerInstitutionId: subject.homeOrganizationId, servicePrice: 180 };
  }

  function createServiceRepairOrder(payload) {
    const subjectId = payload.subjectId ?? payload.npcId;
    let subject = sprc.serviceSubjects[subjectId];
    if (!subject) {
      subject = sprc.serviceSubjects[subjectId] = { id: subjectId, shipVin: payload.referenceId ?? payload.shipVin ?? subjectId, shipName: payload.subjectName ?? payload.npcName ?? subjectId, homeOrganizationId: payload.payerInstitutionId, craftClass: payload.craftClass, condition: "serviceable", maintenanceStatus: "available", repairHistory: [], currentLocationSiteId: payload.locationSiteId, availableForWork: true };
    }
    const requirements = SERVICE_REPAIR_RECIPES[payload.issueType];
    const match = matchMaintenanceService({ request: { ...payload, subjectId }, institution: sprc.institution, facilities: Object.values(sprc.facilities), repairRecipe: requirements, inventories: sprc.inventories, procurableItemIds: ["hull-plate", "machine-part", "copper", "silicate"] });
    if (!match.eligible) {
      appendHistory("repair.declined", { subjectId, issueType: payload.issueType, reason: match.reason });
      state.ledger.recordEvent("sprc.repairDeclined", { subjectId, issueType: payload.issueType, reason: match.reason }, { visible: true });
      return null;
    }
    const existing = Object.values(sprc.repairOrders).some((repair) => (repair.subjectId ?? repair.subjectHaulerId) === subjectId && !["completed", "canceled"].includes(repair.status));
    if (existing) return null;
    const id = nextId("repair", "SPRC-RPR");
    const order = sprc.repairOrders[id] = { id, facilityId: match.facility.id, serviceCapabilityId: match.capability.id, subjectId, subjectHaulerId: subjectId, subjectShipVin: subject.shipVin, craftClass: payload.craftClass, payerInstitutionId: payload.payerInstitutionId, servicePrice: payload.servicePrice ?? match.capability.servicePrice, condition: payload.issueType, origin: { type: "operational-wear", wear: payload.wear, issueCount: payload.issueCount, causedByCarefulMode: payload.causedByCarefulMode }, requirements: { produced: { ...requirements.produced }, raw: { ...requirements.raw } }, reserved: { produced: {}, raw: {} }, status: "waiting-stock", priority: payload.issueType.includes("failure") || payload.issueType === "control-fault" ? 80 : 60, createdAt: now(), startedAt: null, completesAt: null };
    sprc.repairQueue.push(id);
    subject.condition = payload.issueType; subject.maintenanceStatus = "queued"; subject.availableForWork = false; subject.currentLocationSiteId = payload.locationSiteId;
    appendHistory("repair.created", { repairOrderId: id, subjectId, haulerId: subjectId, issueType: payload.issueType, wear: payload.wear });
    state.ledger.recordEvent("sprc.repairCreated", { repairOrderId: id, subjectId, haulerId: subjectId, shipName: subject.shipName, craftClass: payload.craftClass, condition: order.condition }, { visible: true });
    return order;
  }

  function createProvisionalRepairOrder(haulerId) {
    const hauler = sprc.haulers[haulerId];
    if (!hauler) return null;
    const id = nextId("repair", "SPRC-RPR");
    const order = {
      id,
      facilityId: SPRC.berthId,
      subjectHaulerId: haulerId,
      subjectShipVin: hauler.shipVin,
      condition: "damaged-hull",
      origin: { type: "provisional-route-count", routeCompletions: hauler.routeCompletions, replaceWith: "unified-wear-assessment" },
      requirements: { produced: { "hull-plate": 2, "machine-part": 1 } },
      reserved: { produced: {} },
      status: "waiting-stock",
      priority: 50,
      createdAt: now(),
      startedAt: null,
      completesAt: null,
    };
    sprc.repairOrders[id] = order;
    sprc.repairQueue.push(id);
    hauler.condition = "damaged-hull";
    hauler.lastMaintenanceTriggerRouteCompletion = hauler.routeCompletions;
    hauler.maintenanceStatus = "queued";
    hauler.availableForWork = false;
    appendHistory("repair.created", { repairOrderId: id, haulerId, provisionalOrigin: true });
    state.ledger.recordEvent("sprc.repairCreated", { repairOrderId: id, haulerId, shipName: hauler.shipName, condition: order.condition }, { visible: true });
    return order;
  }

  function assessOpenRepairs() {
    sprc.repairQueue.forEach((repairId) => {
      const repair = sprc.repairOrders[repairId];
      if (!repair || !["waiting-stock", "waiting-production"].includes(repair.status)) return;
      reserveProducedForRepair(repair);
      reserveRawForRepair(repair);
      const missingPlates = getMissingRequirement(repair, "hull-plate");
      const missingParts = getMissingRequirement(repair, "machine-part");
      if (missingParts > 0) reserveAndQueuePartsProduction(repair, missingParts);
      if (missingPlates > 0) reserveAndQueuePlateProduction(repair, missingPlates);
      reserveProducedForRepair(repair);
      reserveRawForRepair(repair);
      Object.entries(repair.requirements.raw ?? {}).forEach(([itemId, required]) => {
        const missing = Math.max(0, required - (repair.reserved.raw[itemId] ?? 0));
        if (missing > 0) createOrUpdateNeed(repair, itemId, missing, { itemId, required, available: getAvailable("raw", itemId) });
      });
      repair.status = getRepairMissing(repair).total > 0 ? "waiting-production" : "ready";
    });
  }

  function assessOperatingPlan() {
    const plan = sprc.operatingPlan;
    if (!plan) return;
    const onHand = Object.entries(SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK)
      .reduce((sum, [itemId, equivalents]) => sum + (sprc.inventories.raw[itemId] ?? 0) * equivalents, 0);
    const incoming = Object.values(sprc.procurementOrders)
      .filter((order) => ["offered", "active"].includes(order.status))
      .reduce((sum, order) => sum + Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits), 0);
    const target = plan.inventoryTargets.structuralFeedstockEquivalents;
    plan.lastAssessedAt = now();
    plan.projected = {
      structuralFeedstockEquivalents: onHand + incoming,
      hullPlates: getAvailable("produced", "hull-plate"),
      machineParts: getAvailable("produced", "machine-part"),
      technologyReserve: getAvailable("raw", "copper"),
      repairCoverage: Math.min(Math.floor((sprc.inventories.produced["hull-plate"] ?? 0) / 2), sprc.inventories.produced["machine-part"] ?? 0),
      spendableCash: getSpendableCash(),
    };
    assessTechnologyReserve();
    if (onHand + incoming >= target) return;
    let need = Object.values(sprc.needs).find((entry) => entry.objectiveType === "reserve-replenishment" && entry.status === "open");
    if (!need) {
      const id = nextId("need", "SPRC-NEED");
      need = sprc.needs[id] = {
        ...createNeedRecord({ id, kind: "inventory-reserve", subject: { itemId: "structural-feedstock" }, target, current: onHand + incoming, shortage: target - onHand - incoming, urgency: "routine", purpose: "restore-operating-reserve", context: { planId: plan.id, target, onHand, incoming }, createdAt: now() }),
        type: "operating-need", sourceActivity: "inventory-plan", sourceRepairOrderId: null,
        objectiveType: "reserve-replenishment", itemId: "structural-feedstock", missingAmount: target - onHand - incoming,
      };
      appendHistory("need.identified", { needId: id, objectiveType: need.objectiveType, itemId: need.itemId, missingAmount: need.missingAmount });
    }
    chooseProcurementResponse(need);
    const openOrder = Object.values(sprc.procurementOrders).find((order) => ["offered", "active"].includes(order.status) && order.needId === need.id);
    if (openOrder) plan.projected.structuralFeedstockEquivalents = onHand + Math.max(0, openOrder.requiredEquivalentUnits - openOrder.deliveredEquivalentUnits);
  }

  function assessTechnologyReserve() {
    const knownDemand = sprc.repairQueue.map((id) => sprc.repairOrders[id]).filter((repair) => repair && !["completed", "canceled"].includes(repair.status)).reduce((sum, repair) => sum + (repair.requirements.raw?.copper ?? 0), 0);
    const target = (sprc.operatingPlan.inventoryTargets.copper ?? 1) + knownDemand;
    const onHand = getAvailable("raw", "copper");
    const incoming = Object.values(sprc.procurementOrders).filter((order) => ["offered", "active"].includes(order.status) && order.procurementItemId === "copper").reduce((sum, order) => sum + Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits), 0);
    if (onHand + incoming >= target) return;
    let need = Object.values(sprc.needs).find((entry) => entry.itemId === "copper" && entry.objectiveType === "technology-reserve" && entry.status === "open");
    if (!need) {
      const id = nextId("need", "SPRC-NEED");
      need = sprc.needs[id] = { ...createNeedRecord({ id, kind: "inventory-reserve", subject: { itemId: "copper" }, target, current: onHand + incoming, shortage: target - onHand - incoming, urgency: knownDemand ? "urgent" : "routine", purpose: knownDemand ? "complete-accepted-service" : "restore-operating-reserve", createdAt: now() }), type: "operating-need", sourceActivity: "inventory-plan", sourceRepairOrderId: null, objectiveType: "technology-reserve", itemId: "copper", missingAmount: target - onHand - incoming };
      appendHistory("need.identified", { needId: id, objectiveType: need.objectiveType, itemId: need.itemId, missingAmount: need.missingAmount });
    }
    chooseProcurementResponse(need);
  }

  function reserveProducedForRepair(repair) {
    Object.entries(repair.requirements.produced).forEach(([itemId, required]) => {
      const already = repair.reserved.produced[itemId] ?? 0;
      const need = Math.max(0, required - already);
      const available = getAvailable("produced", itemId);
      const amount = Math.min(need, available);
      if (amount <= 0) return;
      repair.reserved.produced[itemId] = already + amount;
      addReserved("produced", itemId, amount);
      appendHistory("inventory.reserved", { ownerType: "repair", ownerId: repair.id, inventory: "produced", itemId, amount });
    });
  }

  function reserveRawForRepair(repair) {
    Object.entries(repair.requirements.raw ?? {}).forEach(([itemId, required]) => {
      const already = repair.reserved.raw[itemId] ?? 0;
      const amount = Math.min(Math.max(0, required - already), getAvailable("raw", itemId));
      if (amount <= 0) return;
      repair.reserved.raw[itemId] = already + amount;
      addReserved("raw", itemId, amount);
      appendHistory("inventory.reserved", { ownerType: "repair", ownerId: repair.id, inventory: "raw", itemId, amount });
    });
  }

  function reserveAndQueuePlateProduction(repair, missingPlates) {
    const existing = findOpenProductionForRepair(repair.id, "hull-plate");
    if (existing) return;
    const batches = Math.ceil(missingPlates / 2);
    const feedstockUnits = batches * 4;
    const allocation = allocateStructuralFeedstock(feedstockUnits);
    if (allocation.equivalentUnits < feedstockUnits) {
      createOrUpdateNeed(repair, "structural-feedstock", feedstockUnits - allocation.equivalentUnits, allocation);
      return;
    }
    queueProduction(repair, "hull-plate", batches * 2, { ...allocation.items, "water-ice": batches }, batches * PLATE_BATCH_SECONDS);
  }

  function reserveAndQueuePartsProduction(repair, missingParts) {
    const existing = findOpenProductionForRepair(repair.id, "machine-part");
    if (existing) return;
    const batches = Math.ceil(missingParts / 2);
    const inputs = { silicate: batches * 2, copper: batches };
    const canRun = Object.entries(inputs).every(([itemId, amount]) => getAvailable("raw", itemId) >= amount);
    if (!canRun) {
      Object.entries(inputs).forEach(([itemId, amount]) => {
        const missing = Math.max(0, amount - getAvailable("raw", itemId));
        if (missing > 0) createOrUpdateNeed(repair, itemId, missing, { itemId, required: amount, available: getAvailable("raw", itemId), purpose: "machine-part-production" });
      });
      return;
    }
    queueProduction(repair, "machine-part", batches * 2, inputs, batches * PLATE_BATCH_SECONDS);
  }

  function queueProduction(repair, outputItemId, outputAmount, inputs, durationSeconds) {
    const id = nextId("production", "SPRC-PRD");
    Object.entries(inputs).forEach(([itemId, amount]) => addReserved("raw", itemId, amount));
    sprc.productionOrders[id] = {
      id, facilityId: SPRC.facilityId, sourceRepairOrderId: repair.id,
      inputs, output: { itemId: outputItemId, amount: outputAmount },
      status: "queued", createdAt: now(), startedAt: null, completesAt: null, durationSeconds,
    };
    sprc.productionQueue.push(id);
    appendHistory("production.queued", { productionOrderId: id, repairOrderId: repair.id, outputItemId, outputAmount });
  }

  function startNextProduction() {
    if (sprc.facilities.maw.status !== "working" || sprc.facilities.maw.activeProductionOrderId) return;
    const order = sprc.productionQueue.map((id) => sprc.productionOrders[id]).find((entry) => entry?.status === "queued");
    if (!order) return;
    Object.entries(order.inputs).forEach(([itemId, amount]) => {
      removeInventory("raw", itemId, amount);
      addReserved("raw", itemId, -amount);
    });
    order.status = "running";
    order.startedAt = now();
    order.completesAt = order.startedAt + order.durationSeconds * 1000;
    sprc.facilities.maw.activeProductionOrderId = order.id;
    appendHistory("production.started", { productionOrderId: order.id, inputs: order.inputs });
  }

  function completeDueProduction() {
    Object.values(sprc.productionOrders).forEach((order) => {
      if (order.status !== "running" || order.completesAt > now()) return;
      addInventory("produced", order.output.itemId, order.output.amount);
      order.status = "completed";
      order.completedAt = now();
      sprc.facilities.maw.activeProductionOrderId = null;
      appendHistory("production.completed", { productionOrderId: order.id, output: order.output });
      state.ledger.recordEvent("sprc.productionCompleted", { productionOrderId: order.id, ...order.output }, { visible: true });
    });
  }

  function startNextRepair() {
    if (sprc.facilities.berthTwo.activeRepairOrderId) return;
    const order = sprc.repairQueue.map((id) => sprc.repairOrders[id])
      .filter((entry) => entry?.status === "ready")
      .sort((first, second) => (second.priority ?? 0) - (first.priority ?? 0) || (first.createdAt ?? 0) - (second.createdAt ?? 0))[0];
    if (!order) return;
    Object.entries(order.reserved.produced).forEach(([itemId, amount]) => {
      removeInventory("produced", itemId, amount);
      addReserved("produced", itemId, -amount);
    });
    Object.entries(order.reserved.raw ?? {}).forEach(([itemId, amount]) => {
      removeInventory("raw", itemId, amount);
      addReserved("raw", itemId, -amount);
    });
    order.status = "repairing";
    order.startedAt = now();
    order.completesAt = order.startedAt + REPAIR_SECONDS * 1000;
    sprc.facilities.berthTwo.status = "occupied";
    sprc.facilities.berthTwo.activeRepairOrderId = order.id;
    appendHistory("repair.started", { repairOrderId: order.id, consumed: { produced: order.reserved.produced, raw: order.reserved.raw } });
  }

  function completeDueRepairs() {
    Object.values(sprc.repairOrders).forEach((order) => {
      if (order.status !== "repairing" || order.completesAt > now()) return;
      order.status = "completed";
      order.completedAt = now();
      const subject = sprc.serviceSubjects[order.subjectId ?? order.subjectHaulerId];
      if (subject) {
        subject.condition = "serviceable";
        subject.maintenanceStatus = "available";
        subject.availableForWork = true;
        subject.repairHistory.push(order.id);
      }
      sprc.facilities.berthTwo.status = "available";
      sprc.facilities.berthTwo.activeRepairOrderId = null;
      appendHistory("repair.completed", { repairOrderId: order.id, subjectId: order.subjectId, haulerId: order.subjectHaulerId, serviceRevenue: order.servicePrice ?? 180 });
      state.ledger.recordEvent("sprc.repairCompleted", { repairOrderId: order.id, subjectId: order.subjectId, haulerId: order.subjectHaulerId, shipName: subject?.shipName, craftClass: order.craftClass, payerInstitutionId: order.payerInstitutionId, serviceRevenue: order.servicePrice ?? 180 }, { visible: true });
    });
  }

  function createOrUpdateNeed(repair, itemId, missingAmount, context) {
    let need = Object.values(sprc.needs).find((entry) => entry.sourceRepairOrderId === repair.id && entry.itemId === itemId && entry.status === "open");
    if (!need) {
      const id = nextId("need", "SPRC-NEED");
      need = sprc.needs[id] = {
        ...createNeedRecord({ id, kind: "blocked-activity-input", subject: { itemId }, shortage: missingAmount, urgency: "emergency", purpose: "complete-accepted-service", context, createdAt: now() }),
        type: "operating-need", sourceActivity: "repair", sourceRepairOrderId: repair.id,
        objectiveType: "emergency-repair", itemId, missingAmount,
      };
      appendHistory("need.identified", { needId: id, repairOrderId: repair.id, itemId, missingAmount });
    } else {
      need.missingAmount = missingAmount;
      need.context = context;
    }
    if (["structural-feedstock", "copper", "silicate"].includes(itemId)) chooseProcurementResponse(need);
  }

  function chooseProcurementResponse(need) {
    if (DIRECT_PROCUREMENT[need.itemId] && joinOpenMaterialProcurement(need)) return;
    if (need.objectiveType === "emergency-repair") {
      const procurementItemId = need.itemId === "structural-feedstock" ? "structural-feedstock" : need.itemId;
      const routineOrder = Object.values(sprc.procurementOrders).find((order) => ["offered", "active"].includes(order.status) && order.objectiveType === "reserve-replenishment" && (order.procurementItemId ?? "structural-feedstock") === procurementItemId);
      if (routineOrder) {
        routineOrder.objectiveType = "emergency-repair";
        routineOrder.sourceRepairOrderId = need.sourceRepairOrderId;
        routineOrder.emergencyNeedId = need.id;
        const responseId = nextId("response", "SPRC-RSP");
        sprc.responses[responseId] = {
          id: responseId, needId: need.id, strategy: "promote-existing-procurement", status: "active", selectedAt: now(), procurementOrderId: routineOrder.id,
          reason: "The reserve order already covers this material, so the accepted repair makes it urgent instead of creating a duplicate order.",
        };
        need.responseIds.push(responseId);
        const contract = state.contracts.records[routineOrder.contractId];
        if (contract) {
          contract.summary = `Urgent: deliver ${routineOrder.requiredEquivalentUnits} ${DIRECT_PROCUREMENT[procurementItemId]?.description ?? "feedstock equivalents"}. Known service demand now has priority; any remainder restores SPRC's reserve.`;
          contract.causal.repairOrderId = need.sourceRepairOrderId;
        }
        appendHistory("procurement.promoted", { procurementOrderId: routineOrder.id, emergencyNeedId: need.id, repairOrderId: need.sourceRepairOrderId });
        return;
      }
    }
    const existing = Object.values(sprc.responses).find((entry) => entry.needId === need.id && ["active", "blocked"].includes(entry.status));
    if (existing?.status === "active") return;
    if (existing?.status === "blocked") {
      const amount = Math.max(1, need.missingAmount);
      const affordability = getProcurementAffordability(amount * (DIRECT_PROCUREMENT[need.itemId]?.price ?? 34));
      if (!affordability.affordable) return;
      existing.status = "superseded";
      existing.reconsideredAt = now();
      appendHistory("response.reconsidered", { responseId: existing.id, needId: need.id, trigger: "account-affordability-changed" });
    }
    if ((need.retryAfter ?? 0) > now()) return;
    const policy = getResolvedPolicy();
    const procurementCapability = {
      id: "procure-input",
      canAddress: ({ need: candidate }) => ["structural-feedstock", "copper", "silicate"].includes(candidate?.itemId),
      propose: ({ need: candidate }) => [{
        capabilityId: "procure-input",
        action: "post-procurement-contract",
        purpose: candidate.purpose,
        estimatedCost: Math.max(1, candidate.missingAmount) * (DIRECT_PROCUREMENT[candidate.itemId]?.price ?? 34),
        risk: 0,
        rationale: candidate.itemId === "copper"
          ? "SPRC holds one common Scannergy conductor for field-control emergencies and buys additional copper against known repair or production demand."
          : candidate.itemId === "silicate"
          ? "Machine-part production is short of ordinary silicate, so Sal is replenishing the shop input."
          : candidate.objectiveType === "reserve-replenishment"
          ? "Projected repair coverage is below Sal's target, so SPRC is buying feedstock before the next repair arrives."
          : "On-hand feedstock cannot schedule the required plate batch; the blocked repair makes procurement urgent.",
      }],
    };
    const proposal = generateCapabilityResponses({ institution: sprc, controller: sprc.controller, needs: [need], capabilities: [procurementCapability], policy })[0];
    if (!proposal) return;
    const responseId = nextId("response", "SPRC-RSP");
    const reason = proposal.rationale;
    const response = sprc.responses[responseId] = {
      ...createResponseRecord({ id: responseId, needIds: [need.id], capabilityId: proposal.capabilityId, action: proposal.action, rationale: reason, estimatedCost: proposal.estimatedCost, priorityScore: proposal.priorityScore, reconsiderWhen: ["account-balance-changed", "commitment-released", "policy-changed"], selectedAt: now() }),
      needId: need.id, strategy: "procurement-contract", status: "active", reason,
    };
    need.responseIds.push(responseId);
    createProcurementOrder(need, response);
  }

  function joinOpenMaterialProcurement(need) {
    const order = Object.values(sprc.procurementOrders).find((entry) =>
      ["offered", "active"].includes(entry.status) && entry.procurementItemId === need.itemId
    );
    if (!order) return false;
    const existingResponse = Object.values(sprc.responses).find((entry) =>
      entry.needId === need.id && entry.procurementOrderId === order.id && entry.status === "active"
    );
    if (existingResponse) return true;
    order.needIds ??= [order.needId].filter(Boolean);
    if (!order.needIds.includes(need.id)) order.needIds.push(need.id);
    order.sourceRepairOrderIds ??= [order.sourceRepairOrderId].filter(Boolean);
    if (need.sourceRepairOrderId && !order.sourceRepairOrderIds.includes(need.sourceRepairOrderId)) {
      order.sourceRepairOrderIds.push(need.sourceRepairOrderId);
    }
    const responseId = nextId("response", "SPRC-RSP");
    sprc.responses[responseId] = {
      ...createResponseRecord({ id: responseId, needIds: [need.id], capabilityId: "procure-input", action: "join-material-procurement", rationale: `The open ${need.itemId} order covers this need, so Sal is using it instead of publishing another contract.`, estimatedCost: 0, selectedAt: now() }),
      needId: need.id, strategy: "shared-procurement-contract", status: "active", procurementOrderId: order.id,
    };
    need.responseIds.push(responseId);
    appendHistory("procurement.needJoined", { procurementOrderId: order.id, needId: need.id, repairOrderId: need.sourceRepairOrderId });
    return true;
  }

  function expireProcurementOrders() {
    Object.values(sprc.procurementOrders).forEach((order) => {
      if (!["offered", "active"].includes(order.status) || order.deadlineAt > now()) return;
      order.status = "expired";
      order.expiredAt = now();
      const contract = state.contracts.records[order.contractId];
      if (contract) {
        contract.status = "expired";
        contract.expiredAt = now();
      }
      Object.values(sprc.responses).forEach((response) => {
        if (response.procurementOrderId === order.id && response.status === "active") response.status = "failed";
      });
      sprc.account.committed = Math.max(0, sprc.account.committed - (order.committedPayment ?? 0));
      order.committedPayment = 0;
      const linkedNeeds = (order.needIds ?? [order.needId]).map((id) => sprc.needs[id]).filter(Boolean);
      linkedNeeds.forEach((need) => {
        need.status = "open";
        need.retryAfter = now() + 2 * 60 * 1000;
        need.lastOutcome = { type: "procurement-expired", procurementOrderId: order.id, at: now() };
      });
      if (order.emergencyNeedId && sprc.needs[order.emergencyNeedId]) {
        sprc.needs[order.emergencyNeedId].lastOutcome = { type: "procurement-expired", procurementOrderId: order.id, at: now() };
      }
      appendHistory("procurement.expired", { procurementOrderId: order.id, needId: order.needId, repairOrderId: order.sourceRepairOrderId, operationalConsequence: "repair-remains-blocked" });
      state.ledger.recordEvent("contract.expired", { contractId: order.contractId, sourceNeedId: order.needId, repairOrderId: order.sourceRepairOrderId }, { visible: true });
    });
  }

  function createProcurementOrder(need, response) {
    const id = nextId("procurement", "SPRC-PO");
    const directMaterial = DIRECT_PROCUREMENT[need.itemId] ?? null;
    const procurementItemId = directMaterial ? need.itemId : "structural-feedstock";
    const amount = directMaterial
      ? Math.max(1, need.missingAmount, sprc.operatingPlan.procurementBatchSizes?.[need.itemId] ?? 1)
      : Math.max(1, need.missingAmount);
    const pricePerEquivalent = directMaterial?.price ?? 34;
    const maximumPayment = amount * pricePerEquivalent;
    const affordability = getProcurementAffordability(maximumPayment);
    if (!affordability.affordable) {
      response.status = "blocked";
      response.reason = `SPRC cannot commit ${maximumPayment} credits without crossing its protected reserve.`;
      need.lastOutcome = { type: "insufficient-spendable-cash", required: maximumPayment, spendable: getSpendableCash(), at: now() };
      appendHistory("procurement.blocked", { needId: need.id, required: maximumPayment, spendable: getSpendableCash() });
      return;
    }
    sprc.account.committed += maximumPayment;
    const record = sprc.procurementOrders[id] = {
      id, type: directMaterial ? "shop-input-procurement" : "structural-feedstock-procurement", procurementItemId, needId: need.id, needIds: [need.id],
      sourceRepairOrderId: need.sourceRepairOrderId, responseId: response.id, objectiveType: need.objectiveType,
      sourceRepairOrderIds: [need.sourceRepairOrderId].filter(Boolean),
      acceptedMaterials: directMaterial ? { [need.itemId]: 1 } : { ...SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK }, requiredEquivalentUnits: amount,
      deliveredEquivalentUnits: 0, deliveredMaterials: {}, paidAmount: 0, supplierDeliveries: [], allocations: {}, destinationSiteId: SPRC.siteId,
      pricePerEquivalent, maximumPayment, committedPayment: maximumPayment,
      titleTerms: "Title transfers to SPRC only upon accepted delivery at Scrap Porch.",
      status: "offered", createdAt: now(), deadlineAt: now() + 20 * 60 * 1000,
      contractId: `contract:${id}`,
    };
    response.procurementOrderId = id;
    registerProcurementContract(record);
    state.contracts.records[record.contractId] ??= buildContractDefinition(record);
    appendHistory("procurement.created", { procurementOrderId: id, needId: need.id, repairOrderId: need.sourceRepairOrderId, amount });
    state.ledger.recordEvent("contract.offered", { contractId: record.contractId, contractTitle: directMaterial?.title ?? "SPRC Structural Feedstock", sourceNeedId: need.id }, { visible: true });
  }

  function acceptProcurement(contractId) {
    const order = getOrderByContract(contractId);
    const contract = state.contracts.records[contractId];
    if (!order || !contract || contract.status !== "offered") return false;
    order.status = "active";
    order.acceptedAt = now();
    order.playerAcceptedAt = order.acceptedAt;
    contract.status = "active";
    contract.acceptedAt = order.acceptedAt;
    state.contracts.currentContractId = contractId;
    issueProcurementDocuments(order);
    issueCargoManifest(order);
    appendHistory("procurement.accepted", { procurementOrderId: order.id, contractId });
    state.ledger.recordEvent("contract.accepted", { contractId, contractTitle: contract.title, sourceNeedId: order.needId }, { visible: true });
    onChange(getSnapshot());
    return true;
  }

  function reserveProcurementAllocation({ contractId, supplierInstitutionId, equivalentUnits }) {
    const order = getOrderByContract(contractId);
    const contract = state.contracts.records[contractId];
    if (!order || !contract || !["offered", "active"].includes(order.status) || !supplierInstitutionId || equivalentUnits <= 0) return null;
    order.allocations ??= {};
    const reservedElsewhere = Object.values(order.allocations).reduce((sum, allocation) => sum + Math.max(0, allocation.reservedEquivalentUnits - allocation.deliveredEquivalentUnits), 0);
    const unallocated = Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits - reservedElsewhere);
    const reservedEquivalentUnits = Math.min(equivalentUnits, unallocated);
    if (reservedEquivalentUnits <= 0) return null;
    const allocation = order.allocations[supplierInstitutionId] ??= { supplierInstitutionId, reservedEquivalentUnits: 0, deliveredEquivalentUnits: 0, status: "active", createdAt: now() };
    allocation.reservedEquivalentUnits += reservedEquivalentUnits;
    appendHistory("procurement.allocated", { procurementOrderId: order.id, supplierInstitutionId, equivalentUnits: reservedEquivalentUnits });
    state.ledger.recordEvent("institution.contractAllocated", { contractId, procurementOrderId: order.id, supplierInstitutionId, equivalentUnits: reservedEquivalentUnits }, { visible: true, message: `${supplierInstitutionId} reserved ${reservedEquivalentUnits} equivalents on ${order.id}.` });
    return allocation;
  }

  function deliverMaterial({ contractId, materialId, amount, supplierInstitutionId = "player", creditSupplier = null }) {
    const order = getOrderByContract(contractId);
    const contract = state.contracts.records[contractId];
    const equivalence = order?.acceptedMaterials?.[materialId] ?? 0;
    const isPlayerSupplier = supplierInstitutionId === "player";
    const allocation = order?.allocations?.[supplierInstitutionId];
    const supplierMayDeliver = isPlayerSupplier ? order?.status === "active" : ["offered", "active"].includes(order?.status) && allocation?.status === "active";
    if (!order || !contract || !supplierMayDeliver || equivalence <= 0 || amount <= 0) return { acceptedUnits: 0, equivalentUnits: 0, paid: 0 };
    const remaining = Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits);
    const supplierRemaining = allocation ? Math.max(0, allocation.reservedEquivalentUnits - allocation.deliveredEquivalentUnits) : remaining;
    const acceptedUnits = Math.min(amount, Math.ceil(Math.min(remaining, supplierRemaining) / equivalence));
    const equivalentUnits = Math.min(remaining, acceptedUnits * equivalence);
    addInventory("raw", materialId, acceptedUnits);
    order.deliveredMaterials[materialId] = (order.deliveredMaterials[materialId] ?? 0) + acceptedUnits;
    order.deliveredEquivalentUnits += equivalentUnits;
    order.paidAmount ??= 0;
    order.supplierDeliveries ??= [];
    const paymentDue = Math.min(equivalentUnits * order.pricePerEquivalent, order.committedPayment ?? 0, sprc.account.balance);
    sprc.account.balance -= paymentDue;
    sprc.account.committed = Math.max(0, sprc.account.committed - paymentDue);
    order.committedPayment = Math.max(0, (order.committedPayment ?? 0) - paymentDue);
    order.paidAmount += paymentDue;
    if (creditSupplier) creditSupplier(paymentDue);
    else if (supplierInstitutionId === "player") depositCredits(state, paymentDue);
    order.supplierDeliveries.push({ supplierInstitutionId, materialId, acceptedUnits, equivalentUnits, paid: paymentDue, at: now() });
    if (allocation) {
      allocation.deliveredEquivalentUnits += equivalentUnits;
      if (allocation.deliveredEquivalentUnits >= allocation.reservedEquivalentUnits) allocation.status = "completed";
    }
    contract.deliveredAmount = order.deliveredEquivalentUnits;
    appendHistory("procurement.delivered", { procurementOrderId: order.id, supplierInstitutionId, materialId, acceptedUnits, equivalentUnits, paid: paymentDue });
    let paid = paymentDue;
    if (order.deliveredEquivalentUnits >= order.requiredEquivalentUnits) {
      order.status = order.paidAmount >= order.maximumPayment ? "paid" : "payment-shortfall";
      order.completedAt = now();
      contract.status = order.status === "paid" ? "paid" : "fulfilled";
      contract.fulfilledAt = now();
      contract.paidAt = order.status === "paid" ? now() : null;
      contract.paymentShortfall = Math.max(0, order.maximumPayment - order.paidAmount);
      (order.needIds ?? [order.needId]).forEach((needId) => {
        const need = sprc.needs[needId];
        if (need) need.status = "resolved";
      });
      if (order.emergencyNeedId && sprc.needs[order.emergencyNeedId]) sprc.needs[order.emergencyNeedId].status = "resolved";
      Object.values(sprc.responses).forEach((response) => {
        if (response.procurementOrderId === order.id && response.status === "active") response.status = "completed";
      });
      if (isPlayerSupplier) sprc.actor.relationship.playerReliability += 1;
      appendHistory("procurement.completed", { procurementOrderId: order.id, paid: order.paidAmount, paymentShortfall: contract.paymentShortfall });
      state.ledger.recordEvent("contract.paid", { contractId, creditsPaid: order.paidAmount, payerAccountId: sprc.account.id, sourceNeedId: order.needId }, { visible: true });
    }
    update();
    return { acceptedUnits, equivalentUnits, paid };
  }

  function getSnapshot() {
    const openRepair = sprc.repairQueue.map((id) => sprc.repairOrders[id]).find((repair) => repair && repair.status !== "completed") ?? null;
    const missing = openRepair ? getRepairMissing(openRepair) : { items: {}, total: 0 };
    const activeNeed = Object.values(sprc.needs).find((need) => need.status === "open") ?? null;
    const activeResponse = activeNeed?.responseIds?.map((id) => sprc.responses[id]).find((response) => response?.status === "active") ?? null;
    return { sprc, openRepair, missing, activeNeed, activeResponse };
  }

  function restoreContractDefinitions() {
    Object.values(sprc.procurementOrders).forEach(registerProcurementContract);
  }

  function registerProcurementContract(order) {
    registerContractDefinition(buildContractDefinition(order));
  }

  function buildContractDefinition(order) {
    const isRoutineReserve = order.objectiveType === "reserve-replenishment" && !order.sourceRepairOrderId;
    const directMaterial = DIRECT_PROCUREMENT[order.procurementItemId] ?? null;
    return {
      id: order.contractId,
      type: "resource-procurement",
      group: "sprc-procurement",
      title: directMaterial?.title ?? "SPRC Structural Feedstock",
      issuer: "Scrap Porch Recovery Cooperative",
      summary: isRoutineReserve
        ? directMaterial
          ? `Sal is restoring SPRC's working reserve. Deliver ${order.requiredEquivalentUnits} ${directMaterial.description}.`
          : `Sal is rebuilding SPRC's working reserve before the next repair arrives. Deliver ${order.requiredEquivalentUnits} feedstock equivalents.`
        : directMaterial
          ? `Known repair or shop demand requires ${order.requiredEquivalentUnits} ${directMaterial.description}.`
          : `Urgent feedstock for a blocked repair, with any surplus restoring SPRC's working reserve. Deliver ${order.requiredEquivalentUnits} equivalents.`,
      clauses: [
        isRoutineReserve
          ? "Objective: restore projected repair coverage to Sal's operating target."
          : `Objective: unblock repair ${order.sourceRepairOrderId} without abandoning SPRC's safety-stock plan.`,
        directMaterial ? `Accepted: ${order.procurementItemId} (1 unit/unit).` : "Accepted: iron-nickel (1 equivalent/unit) or aluminum (2 equivalents/unit).",
        order.titleTerms,
        "This purchase order does not grant extraction or salvage rights.",
      ],
      terms: { destinationSiteId: SPRC.siteId, destinationName: "Scrap Porch", amount: order.requiredEquivalentUnits, acceptedMaterials: order.acceptedMaterials, sourceNeedId: order.needId, sourceRepairOrderId: order.sourceRepairOrderId },
      reward: { credits: order.maximumPayment },
      status: order.status === "paid" ? "paid" : order.playerAcceptedAt ? "active" : "offered",
      offeredAt: order.createdAt,
      deliveredAmount: order.deliveredEquivalentUnits,
      presentation: { offerSiteId: SPRC.siteId, offerServiceId: SPRC.serviceId, portableAfterAcceptance: true },
      offerSource: { type: "institution-local", siteId: SPRC.siteId, serviceId: SPRC.serviceId, npcName: "Sal" },
      causal: { needId: order.needId, repairOrderId: order.sourceRepairOrderId, responseId: order.responseId },
    };
  }

  function issueProcurementDocuments(order) {
    issueWorldDocument(state, {
      document: { id: order.id, type: "procurement-order", title: `SPRC Procurement Order ${order.id}`, status: "offered", sourceNeedId: order.needId, sourceRepairOrderId: order.sourceRepairOrderId, terms: { acceptedMaterials: order.acceptedMaterials, requiredEquivalentUnits: order.requiredEquivalentUnits, destinationSiteId: SPRC.siteId } },
      issuerEntityId: SPRC.actorId,
    });
  }

  function issueCargoManifest(order) {
    const holderEntityId = state.character.controlledPersonEntityId;
    issueWorldDocument(state, {
      document: { id: `manifest:${order.id}`, type: "cargo-manifest", title: `Open Manifest for ${order.id}`, status: "active", procurementOrderId: order.id, cargo: [], destinationSiteId: SPRC.siteId, custodyTerms: order.titleTerms },
      issuerEntityId: SPRC.actorId,
      holderEntityId,
      assetEntityId: state.character.activeHullVin ? `ship:${state.character.activeHullVin}` : null,
    });
  }

  function seedSprcWorldRecords(localState) {
    upsertWorldEntity(localState, { id: SPRC.actorId, type: "organization", name: "Scrap Porch Recovery Cooperative", siteId: SPRC.siteId });
    upsertWorldEntity(localState, { id: SPRC.facilityId, type: "facility", facilityType: "recovery-mill", name: "The Maw", ownerEntityId: SPRC.actorId, siteId: SPRC.siteId });
    upsertWorldEntity(localState, { id: SPRC.berthId, type: "facility", facilityType: "repair-berth", name: "Berth Two", ownerEntityId: SPRC.actorId, siteId: SPRC.siteId });
    const hauler = localState.sprc?.haulers?.[SPRC.firstHaulerId];
    if (hauler) {
      upsertWorldEntity(localState, { id: `ship:${hauler.shipVin}`, type: "asset", assetType: "ship", vin: hauler.shipVin, name: hauler.shipName, operatorEntityId: hauler.pilotEntityId });
      upsertWorldEntity(localState, { id: hauler.pilotEntityId, type: "person", name: hauler.pilotName });
    }
  }

  function allocateStructuralFeedstock(requiredEquivalentUnits) {
    let remaining = requiredEquivalentUnits;
    const items = {};
    for (const materialId of ["aluminum", "iron-nickel"]) {
      const equivalence = SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK[materialId];
      const available = getAvailable("raw", materialId);
      const units = Math.min(available, Math.ceil(remaining / equivalence));
      if (units > 0) {
        items[materialId] = units;
        remaining = Math.max(0, remaining - units * equivalence);
      }
    }
    return { items, equivalentUnits: requiredEquivalentUnits - remaining };
  }

  function findOpenProductionForRepair(repairId, outputItemId) {
    return Object.values(sprc.productionOrders).find((order) => order.sourceRepairOrderId === repairId && order.output.itemId === outputItemId && ["queued", "running"].includes(order.status));
  }

  function getMissingRequirement(repair, itemId) {
    return Math.max(0, (repair.requirements.produced[itemId] ?? 0) - (repair.reserved.produced[itemId] ?? 0));
  }

  function getRepairMissing(repair) {
    const produced = Object.fromEntries(Object.keys(repair.requirements.produced ?? {}).map((itemId) => [itemId, Math.max(0, (repair.requirements.produced[itemId] ?? 0) - (repair.reserved.produced?.[itemId] ?? 0))]));
    const raw = Object.fromEntries(Object.keys(repair.requirements.raw ?? {}).map((itemId) => [itemId, Math.max(0, (repair.requirements.raw[itemId] ?? 0) - (repair.reserved.raw?.[itemId] ?? 0))]));
    const items = { ...produced, ...raw };
    return { items, buckets: { produced, raw }, total: Object.values(items).reduce((sum, amount) => sum + amount, 0) };
  }

  function getAvailable(bucket, itemId) {
    return Math.max(0, (sprc.inventories[bucket][itemId] ?? 0) - (sprc.inventories.reserved[bucket][itemId] ?? 0));
  }

  function getSpendableCash() {
    return getProcurementAffordability(0).spendable;
  }

  function getProcurementAffordability(cost) {
    return evaluateAffordability({ account: sprc.account, policy: getResolvedPolicy(), cost });
  }

  function getResolvedPolicy() {
    const archetype = INSTITUTION_ARCHETYPES[sprc.institution.archetypeId];
    return resolveInstitutionPolicy({ archetypePolicy: archetype?.defaultPolicy, institutionPolicy: { protectedCash: sprc.operatingPlan.protectedCashReserve } });
  }

  function addInventory(bucket, itemId, amount) {
    sprc.inventories[bucket][itemId] = (sprc.inventories[bucket][itemId] ?? 0) + amount;
  }

  function removeInventory(bucket, itemId, amount) {
    if ((sprc.inventories[bucket][itemId] ?? 0) < amount) throw new Error(`SPRC inventory underflow: ${bucket}.${itemId}`);
    sprc.inventories[bucket][itemId] -= amount;
  }

  function addReserved(bucket, itemId, amount) {
    const next = (sprc.inventories.reserved[bucket][itemId] ?? 0) + amount;
    if (next < 0) throw new Error(`SPRC reservation underflow: ${bucket}.${itemId}`);
    sprc.inventories.reserved[bucket][itemId] = next;
  }

  function getOrderByContract(contractId) {
    return Object.values(sprc.procurementOrders).find((order) => order.contractId === contractId) ?? null;
  }

  function nextId(counter, prefix) {
    sprc.counters[counter] = (sprc.counters[counter] ?? 0) + 1;
    return `${prefix}-${String(sprc.counters[counter]).padStart(4, "0")}`;
  }

  function appendHistory(type, payload = {}) {
    sprc.history.push({ id: `sprc-history-${sprc.history.length + 1}`, type, at: now(), ...payload });
    const message = getSalActionMessage(type, payload);
    if (message) {
      state.ledger.recordEvent("institution.action", {
        institutionId: sprc.institution.id,
        institutionName: "Scrap Porch Recovery Cooperative",
        actorInstitutionId: sprc.controller.id,
        actorName: sprc.controller.name ?? "Sal",
        actionType: type,
        ...payload,
      }, { visible: true, message });
    }
  }

  return { update, acceptProcurement, reserveProcurementAllocation, deliverMaterial, getSnapshot, createProvisionalRepairOrder };
}

function getSalActionMessage(type, payload) {
  if (type === "need.identified") return `Sal identified a ${formatActionNoun(payload.itemId ?? payload.objectiveType)} shortage${payload.missingAmount ? ` of ${payload.missingAmount}` : ""}.`;
  if (type === "procurement.created") return `Sal committed SPRC funds and posted procurement order ${payload.procurementOrderId}.`;
  if (type === "procurement.promoted") return `Sal made ${payload.procurementOrderId} urgent to unblock the waiting repair.`;
  if (type === "procurement.blocked") return `Sal declined to spend ${payload.required} cr because only ${payload.spendable} cr is safely available.`;
  if (type === "response.reconsidered") return `Sal reconsidered a previously blocked response after SPRC's funding changed.`;
  if (type === "procurement.expired") return `Sal's procurement order ${payload.procurementOrderId} expired; the underlying need remains open.`;
  if (type === "procurement.accepted") return `Sal's procurement order ${payload.procurementOrderId} was accepted.`;
  if (type === "procurement.delivered") return `Sal accepted ${payload.equivalentUnits} feedstock equivalents into ${payload.procurementOrderId}.`;
  if (type === "procurement.completed") return `Sal closed ${payload.procurementOrderId} after paying ${payload.paid} cr.`;
  if (type === "production.queued") return `Sal queued ${payload.outputAmount} ${formatActionNoun(payload.outputItemId)} for repair work.`;
  if (type === "production.started") return `Sal started production order ${payload.productionOrderId} in The Maw.`;
  if (type === "production.completed") return `Sal completed production order ${payload.productionOrderId}.`;
  if (type === "repair.created") return `Sal opened repair order ${payload.repairOrderId}.`;
  if (type === "repair.started") return `Sal started repair order ${payload.repairOrderId} in Berth Two.`;
  if (type === "repair.completed") return `Sal completed repair order ${payload.repairOrderId}; SPRC invoiced 180 cr.`;
  return null;
}

function formatActionNoun(value) { return String(value ?? "operating").replaceAll("-", " "); }

function seedSprcWorldRecords(state) {
  upsertWorldEntity(state, { id: SPRC.actorId, type: "organization", name: "Scrap Porch Recovery Cooperative", siteId: SPRC.siteId });
  upsertWorldEntity(state, { id: SPRC.facilityId, type: "facility", facilityType: "recovery-mill", name: "The Maw", ownerEntityId: SPRC.actorId, siteId: SPRC.siteId });
  upsertWorldEntity(state, { id: SPRC.berthId, type: "facility", facilityType: "repair-berth", name: "Berth Two", ownerEntityId: SPRC.actorId, siteId: SPRC.siteId });
}
