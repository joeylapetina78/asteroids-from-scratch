import { depositCredits } from "./accounts.js?v=fresh-20260725-2256-967035c";
import { issueWorldDocument, upsertWorldEntity } from "./worldRecords.js?v=fresh-20260725-2256-967035c";
import { createNeedRecord, createResponseRecord, evaluateAffordability, generateCapabilityResponses, resolveInstitutionPolicy } from "./institutionDecision.js";
import { INSTITUTION_ARCHETYPES } from "../content/institutions/institutionArchetypes.js";
import { createSalInstitutionInstance, createSprcInstitutionInstance } from "../content/institutions/institutionInstances.js";

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

export function createInitialSprcState(now = Date.now()) {
  const institution = createSprcInstitutionInstance(now);
  const controller = createSalInstitutionInstance();
  return {
    version: 2,
    institution: { id: institution.id, archetypeId: institution.archetypeId, controllerInstitutionId: institution.controllerInstitutionId },
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
      rationale: "Cover two likely repairs without betting the cooperative's last credits.",
      lastAssessedAt: now,
    },
    projects: institution.projects,
    inventories: institution.inventories,
    facilities: {
      maw: { id: SPRC.facilityId, name: "The Maw", status: "working", capacity: 1, activeProductionOrderId: null },
      berthTwo: { id: SPRC.berthId, name: "Berth Two", status: "available", capacity: 1, activeRepairOrderId: null },
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
  sprc.repairQueue ??= [];
  sprc.productionOrders ??= {};
  sprc.productionQueue ??= [];
  sprc.needs ??= {};
  sprc.responses ??= {};
  sprc.procurementOrders ??= {};
  sprc.history ??= [];
  sprc.counters ??= { repair: 0, production: 0, need: 0, response: 0, procurement: 0 };
  sprc.lastLedgerEventId ??= 0;
  sprc.account.committed ??= 0;
  sprc.operatingPlan.protectedCashReserve ??= sprc.account.protectedReserve ?? 900;
  sprc.account.protectedReserve = sprc.operatingPlan.protectedCashReserve;
  sprc.institution ??= { id: "sprc", archetypeId: "repair-cooperative", controllerInstitutionId: "sal" };
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
      } else if (event.type === "logistics.maintenanceRequired" && sprc.haulers[event.payload.npcId]) {
        createWearRepairOrder(event.payload);
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

  function createWearRepairOrder(payload) {
    const hauler = sprc.haulers[payload.npcId];
    if (!hauler) return null;
    const existing = Object.values(sprc.repairOrders).some((repair) => repair.subjectHaulerId === hauler.id && !["completed", "canceled"].includes(repair.status));
    if (existing) return null;
    const requirementsByIssue = {
      "maneuvering-strain": { "hull-plate": 1, "machine-part": 1 },
      "hull-fatigue": { "hull-plate": 2, "machine-part": 0 },
      "control-fault": { "hull-plate": 0, "machine-part": 2 },
    };
    const id = nextId("repair", "SPRC-RPR");
    const requirements = requirementsByIssue[payload.issueType] ?? { "hull-plate": 1, "machine-part": 1 };
    const order = sprc.repairOrders[id] = { id, facilityId: SPRC.berthId, subjectHaulerId: hauler.id, subjectShipVin: hauler.shipVin, condition: payload.issueType, origin: { type: "operational-wear", wear: payload.wear, issueCount: payload.issueCount, causedByCarefulMode: payload.causedByCarefulMode }, requirements: { produced: requirements }, reserved: { produced: {} }, status: "waiting-stock", priority: payload.issueType === "control-fault" ? 80 : 60, createdAt: now(), startedAt: null, completesAt: null };
    sprc.repairQueue.push(id);
    hauler.condition = payload.issueType; hauler.maintenanceStatus = "queued"; hauler.availableForWork = false;
    appendHistory("repair.created", { repairOrderId: id, haulerId: hauler.id, issueType: payload.issueType, wear: payload.wear });
    state.ledger.recordEvent("sprc.repairCreated", { repairOrderId: id, haulerId: hauler.id, shipName: hauler.shipName, condition: order.condition }, { visible: true });
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
      const missingPlates = getMissingRequirement(repair, "hull-plate");
      const missingParts = getMissingRequirement(repair, "machine-part");
      if (missingParts > 0) reserveAndQueuePartsProduction(repair, missingParts);
      if (missingPlates > 0) reserveAndQueuePlateProduction(repair, missingPlates);
      reserveProducedForRepair(repair);
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
      repairCoverage: Math.min(Math.floor((sprc.inventories.produced["hull-plate"] ?? 0) / 2), sprc.inventories.produced["machine-part"] ?? 0),
      spendableCash: getSpendableCash(),
    };
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
      createOrUpdateNeed(repair, "machine-parts-input", 1, { items: inputs });
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
    const order = sprc.repairQueue.map((id) => sprc.repairOrders[id]).find((entry) => entry?.status === "ready");
    if (!order) return;
    Object.entries(order.reserved.produced).forEach(([itemId, amount]) => {
      removeInventory("produced", itemId, amount);
      addReserved("produced", itemId, -amount);
    });
    order.status = "repairing";
    order.startedAt = now();
    order.completesAt = order.startedAt + REPAIR_SECONDS * 1000;
    sprc.facilities.berthTwo.status = "occupied";
    sprc.facilities.berthTwo.activeRepairOrderId = order.id;
    appendHistory("repair.started", { repairOrderId: order.id, consumed: order.reserved.produced });
  }

  function completeDueRepairs() {
    Object.values(sprc.repairOrders).forEach((order) => {
      if (order.status !== "repairing" || order.completesAt > now()) return;
      order.status = "completed";
      order.completedAt = now();
      const hauler = sprc.haulers[order.subjectHaulerId];
      if (hauler) {
        hauler.condition = "serviceable";
        hauler.maintenanceStatus = "available";
        hauler.availableForWork = true;
        hauler.repairHistory.push(order.id);
      }
      sprc.account.balance += 180;
      sprc.facilities.berthTwo.status = "available";
      sprc.facilities.berthTwo.activeRepairOrderId = null;
      appendHistory("repair.completed", { repairOrderId: order.id, haulerId: order.subjectHaulerId, serviceRevenue: 180 });
      state.ledger.recordEvent("sprc.repairCompleted", { repairOrderId: order.id, haulerId: order.subjectHaulerId, shipName: hauler?.shipName }, { visible: true });
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
    if (itemId === "structural-feedstock") chooseProcurementResponse(need);
  }

  function chooseProcurementResponse(need) {
    if (need.objectiveType === "emergency-repair") {
      const routineOrder = Object.values(sprc.procurementOrders).find((order) => ["offered", "active"].includes(order.status) && order.objectiveType === "reserve-replenishment");
      if (routineOrder) {
        routineOrder.objectiveType = "emergency-repair";
        routineOrder.sourceRepairOrderId = need.sourceRepairOrderId;
        routineOrder.emergencyNeedId = need.id;
        const responseId = nextId("response", "SPRC-RSP");
        sprc.responses[responseId] = {
          id: responseId, needId: need.id, strategy: "promote-existing-procurement", status: "active", selectedAt: now(), procurementOrderId: routineOrder.id,
          reason: "The reserve order already covers this material; Mara's repair makes it urgent instead of creating a duplicate order.",
        };
        need.responseIds.push(responseId);
        const contract = state.contracts.records[routineOrder.contractId];
        if (contract) {
          contract.summary = `Urgent: deliver ${routineOrder.requiredEquivalentUnits} feedstock equivalents. The first four unblock Porch Runner Two; the remainder restores SPRC's reserve.`;
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
      const affordability = getProcurementAffordability(amount * 34);
      if (!affordability.affordable) return;
      existing.status = "superseded";
      existing.reconsideredAt = now();
      appendHistory("response.reconsidered", { responseId: existing.id, needId: need.id, trigger: "account-affordability-changed" });
    }
    if ((need.retryAfter ?? 0) > now()) return;
    const policy = getResolvedPolicy();
    const procurementCapability = {
      id: "procure-input",
      canAddress: ({ need: candidate }) => candidate?.itemId === "structural-feedstock",
      propose: ({ need: candidate }) => [{
        capabilityId: "procure-input",
        action: "post-procurement-contract",
        purpose: candidate.purpose,
        estimatedCost: Math.max(1, candidate.missingAmount) * 34,
        risk: 0,
        rationale: candidate.objectiveType === "reserve-replenishment"
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
      const response = sprc.responses[order.responseId];
      if (response) response.status = "failed";
      sprc.account.committed = Math.max(0, sprc.account.committed - (order.committedPayment ?? 0));
      order.committedPayment = 0;
      const need = sprc.needs[order.needId];
      if (need) {
        need.status = "open";
        need.retryAfter = now() + 2 * 60 * 1000;
        need.lastOutcome = { type: "procurement-expired", procurementOrderId: order.id, at: now() };
      }
      if (order.emergencyNeedId && sprc.needs[order.emergencyNeedId]) {
        sprc.needs[order.emergencyNeedId].lastOutcome = { type: "procurement-expired", procurementOrderId: order.id, at: now() };
      }
      appendHistory("procurement.expired", { procurementOrderId: order.id, needId: order.needId, repairOrderId: order.sourceRepairOrderId, operationalConsequence: "repair-remains-blocked" });
      state.ledger.recordEvent("contract.expired", { contractId: order.contractId, sourceNeedId: order.needId, repairOrderId: order.sourceRepairOrderId }, { visible: true });
    });
  }

  function createProcurementOrder(need, response) {
    const id = nextId("procurement", "SPRC-PO");
    const amount = Math.max(1, need.missingAmount);
    const pricePerEquivalent = 34;
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
      id, type: "structural-feedstock-procurement", needId: need.id,
      sourceRepairOrderId: need.sourceRepairOrderId, responseId: response.id, objectiveType: need.objectiveType,
      acceptedMaterials: { ...SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK }, requiredEquivalentUnits: amount,
      deliveredEquivalentUnits: 0, deliveredMaterials: {}, destinationSiteId: SPRC.siteId,
      pricePerEquivalent, maximumPayment, committedPayment: maximumPayment,
      titleTerms: "Title transfers to SPRC only upon accepted delivery at Scrap Porch.",
      status: "offered", createdAt: now(), deadlineAt: now() + 20 * 60 * 1000,
      contractId: `contract:${id}`,
    };
    response.procurementOrderId = id;
    registerProcurementContract(record);
    state.contracts.records[record.contractId] ??= buildContractDefinition(record);
    appendHistory("procurement.created", { procurementOrderId: id, needId: need.id, repairOrderId: need.sourceRepairOrderId, amount });
    state.ledger.recordEvent("contract.offered", { contractId: record.contractId, contractTitle: "SPRC Structural Feedstock", sourceNeedId: need.id }, { visible: true });
  }

  function acceptProcurement(contractId) {
    const order = getOrderByContract(contractId);
    const contract = state.contracts.records[contractId];
    if (!order || !contract || contract.status !== "offered") return false;
    order.status = "active";
    order.acceptedAt = now();
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

  function deliverMaterial({ contractId, materialId, amount }) {
    const order = getOrderByContract(contractId);
    const contract = state.contracts.records[contractId];
    const equivalence = order?.acceptedMaterials?.[materialId] ?? 0;
    if (!order || !contract || order.status !== "active" || equivalence <= 0 || amount <= 0) return { acceptedUnits: 0, equivalentUnits: 0, paid: 0 };
    const remaining = Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits);
    const acceptedUnits = Math.min(amount, Math.ceil(remaining / equivalence));
    const equivalentUnits = Math.min(remaining, acceptedUnits * equivalence);
    addInventory("raw", materialId, acceptedUnits);
    order.deliveredMaterials[materialId] = (order.deliveredMaterials[materialId] ?? 0) + acceptedUnits;
    order.deliveredEquivalentUnits += equivalentUnits;
    contract.deliveredAmount = order.deliveredEquivalentUnits;
    appendHistory("procurement.delivered", { procurementOrderId: order.id, materialId, acceptedUnits, equivalentUnits });
    let paid = 0;
    if (order.deliveredEquivalentUnits >= order.requiredEquivalentUnits) {
      paid = Math.min(order.maximumPayment, order.committedPayment ?? 0, sprc.account.balance);
      sprc.account.balance -= paid;
      sprc.account.committed = Math.max(0, sprc.account.committed - paid);
      order.committedPayment = Math.max(0, (order.committedPayment ?? 0) - paid);
      depositCredits(state, paid);
      order.status = paid >= order.maximumPayment ? "paid" : "payment-shortfall";
      order.completedAt = now();
      contract.status = order.status === "paid" ? "paid" : "fulfilled";
      contract.fulfilledAt = now();
      contract.paidAt = order.status === "paid" ? now() : null;
      contract.paymentShortfall = Math.max(0, order.maximumPayment - paid);
      const need = sprc.needs[order.needId];
      if (need) need.status = "resolved";
      if (order.emergencyNeedId && sprc.needs[order.emergencyNeedId]) sprc.needs[order.emergencyNeedId].status = "resolved";
      const response = sprc.responses[order.responseId];
      if (response) response.status = "completed";
      sprc.actor.relationship.playerReliability += 1;
      appendHistory("procurement.completed", { procurementOrderId: order.id, paid, paymentShortfall: contract.paymentShortfall });
      state.ledger.recordEvent("contract.paid", { contractId, creditsPaid: paid, payerAccountId: sprc.account.id, sourceNeedId: order.needId }, { visible: true });
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
    return {
      id: order.contractId,
      type: "resource-procurement",
      group: "sprc-procurement",
      title: "SPRC Structural Feedstock",
      issuer: "Scrap Porch Recovery Cooperative",
      summary: isRoutineReserve
        ? `Sal is rebuilding SPRC's working reserve before the next repair arrives. Deliver ${order.requiredEquivalentUnits} feedstock equivalents.`
        : `Urgent feedstock for a blocked repair, with any surplus restoring SPRC's working reserve. Deliver ${order.requiredEquivalentUnits} equivalents.`,
      clauses: [
        isRoutineReserve
          ? "Objective: restore projected repair coverage to Sal's operating target."
          : `Objective: unblock repair ${order.sourceRepairOrderId} without abandoning SPRC's safety-stock plan.`,
        `Accepted: iron-nickel (1 equivalent/unit) or aluminum (2 equivalents/unit).`,
        order.titleTerms,
        "This purchase order does not grant extraction or salvage rights.",
      ],
      terms: { destinationSiteId: SPRC.siteId, destinationName: "Scrap Porch", amount: order.requiredEquivalentUnits, acceptedMaterials: order.acceptedMaterials, sourceNeedId: order.needId, sourceRepairOrderId: order.sourceRepairOrderId },
      reward: { credits: order.maximumPayment },
      status: order.status === "active" ? "active" : order.status === "paid" ? "paid" : "offered",
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
    const items = Object.fromEntries(Object.keys(repair.requirements.produced).map((itemId) => [itemId, getMissingRequirement(repair, itemId)]));
    return { items, total: Object.values(items).reduce((sum, amount) => sum + amount, 0) };
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
  }

  return { update, acceptProcurement, deliverMaterial, getSnapshot, createProvisionalRepairOrder };
}

function seedSprcWorldRecords(state) {
  upsertWorldEntity(state, { id: SPRC.actorId, type: "organization", name: "Scrap Porch Recovery Cooperative", siteId: SPRC.siteId });
  upsertWorldEntity(state, { id: SPRC.facilityId, type: "facility", facilityType: "recovery-mill", name: "The Maw", ownerEntityId: SPRC.actorId, siteId: SPRC.siteId });
  upsertWorldEntity(state, { id: SPRC.berthId, type: "facility", facilityType: "repair-berth", name: "Berth Two", ownerEntityId: SPRC.actorId, siteId: SPRC.siteId });
}
