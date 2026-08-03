import { depositCredits } from "./accounts.js?v=fresh-20260803-1827-46bd67b";
import { issueWorldDocument, upsertWorldEntity } from "./worldRecords.js?v=fresh-20260803-1827-46bd67b";
import { createNeedRecord, createResponseRecord, evaluateAffordability, generateCapabilityResponses, resolveInstitutionPolicy } from "./institutionDecision.js?v=fresh-20260803-1827-46bd67b";
import { INSTITUTION_ARCHETYPES } from "../content/institutions/institutionArchetypes.js?v=fresh-20260803-1827-46bd67b";
import { createSalInstitutionInstance, createSprcInstitutionInstance } from "../content/institutions/institutionInstances.js?v=fresh-20260803-1827-46bd67b";
import { matchMaintenanceService } from "./maintenanceService.js?v=fresh-20260803-1827-46bd67b";
import { evaluateProcurement, evaluateServicePrice } from "./valuation.js?v=fresh-20260803-1827-46bd67b";
import { getBundleCost, getReplacementUnitCost, getUnitCost, recordAcquisition, recordProduction } from "./costBasis.js?v=fresh-20260803-1827-46bd67b";
import { getRelationshipProjection, recordDeliveryOutcome } from "./relationshipProjections.js?v=fresh-20260803-1827-46bd67b";
import { getResourceTradeValue } from "./resourceDefinitions.js?v=fresh-20260803-1827-46bd67b";
import { BLOCKER_KIND, DIAGNOSTIC_STATE, clearBlocker, createBlocker, recordBlocker, recordDiagnostic } from "./diagnostics.js?v=fresh-20260803-1827-46bd67b";
import { createExtractionOffer, registerExtractionOfferSource } from "./extractionOffers.js?v=fresh-20260803-1827-46bd67b";
import { getActorAccount } from "./actorConfig.js?v=fresh-20260803-1827-46bd67b";

// SPRC's open purchase orders, offered to anyone who digs.
//
// This lives here rather than in the mining system because it is SPRC's work,
// not the miner's business. A miner values it against every other offer on the
// board with no idea who posted it and no priority constant in its favour —
// urgent repair feedstock competes purely on the price Sal is willing to pay.
//
// The offer is sized to the CARRIER's capacity, which the miner advertises in
// `context.harvestCapacity`: how much can be lifted in one trip is the hauler's
// business, and how much is wanted and what it pays is the issuer's.
export function sprcProcurementOfferSource(state, context = {}) {
  const sprcOperation = context.sprcOperation;
  if (!sprcOperation || !state.sprc) return [];
  const allocations = context.allocations ?? {};
  const capacity = context.harvestCapacity ?? 1;

  return Object.values(state.sprc.procurementOrders ?? {})
    .filter((order) => ["offered", "active"].includes(order.status) && (order.committedPayment ?? 0) > 0)
    .map((order) => {
      const resourceId = Object.keys(order.acceptedMaterials ?? {}).find((id) => (order.acceptedMaterials[id] ?? 0) > 0);
      const equivalence = order.acceptedMaterials?.[resourceId] ?? 0;
      const activeReserved = Object.values(allocations)
        .filter((allocation) => allocation.orderId === order.id && allocation.status === "active")
        .reduce((sum, allocation) => sum + (allocation.equivalentAmount ?? allocation.amount ?? 0), 0);
      const remainingEquivalents = Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits - activeReserved);
      if (!resourceId || equivalence <= 0 || remainingEquivalents <= 0) return null;

      const equivalentAmount = Math.min(remainingEquivalents, capacity * equivalence);
      return createExtractionOffer({
        id: order.id, contractId: order.contractId,
        issuerInstitutionId: state.sprc.institution?.id ?? "sprc",
        siteId: order.destinationSiteId, siteName: "Scrap Porch",
        resourceId,
        amount: Math.ceil(equivalentAmount / equivalence),
        equivalentAmount,
        pricePerEquivalent: order.pricePerEquivalent ?? 0,
        // Sal buys a remainder but the worker still fills its hold, and selling
        // the surplus into local supply is what keeps a short order worth taking.
        harvestTarget: capacity, sellsSurplus: true,
        // A large purchase order can be supplied by several miners at once:
        // each offer is already sized against what is still unreserved, so
        // exclusivity would starve it.
        concurrent: true,
        // The claimant identifies itself AT RESERVATION rather than being baked
        // in when the offer was built: one shared market round values the same
        // offer for every miner's ships, so "who is asking" is no longer a
        // property of the listing.
        reserve: (claim = {}) => sprcOperation.reserveProcurementAllocation({
          contractId: order.contractId,
          supplierInstitutionId: claim.minerInstitutionId ?? context.minerInstitutionId,
          equivalentUnits: equivalentAmount,
        }),
        kind: "sprc",
        source: { system: "sprcOperation", record: "procurementOrder", objectiveType: order.objectiveType },
      });
    })
    .filter(Boolean);
}

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
// Overhead the mill adds converting raw stock into a finished part, and the
// labor/facility Sal charges for occupying a berth. Both feed service pricing
// alongside the live material cost basis.
const MILL_CONVERSION_COST = 120;
const REPAIR_LABOR_COST = 700;
const REPAIR_FACILITY_COST = 350;
// Fallback unit costs used only before anything has actually been bought.
const REFERENCE_UNIT_COSTS = Object.freeze({ "hull-plate": 80, "machine-part": 70, copper: 60, silicate: 20, "iron-nickel": 34, aluminum: 68 });
// Reprice an unfilled order at most this often, and never above this multiple
// of its original ask — an escalation the world can see, not a runaway bid.
const REPRICE_INTERVAL_MS = 60 * 1000;
const REPRICE_MAX_MULTIPLE = 2;
// How often a repair Sal could not admit is retried.
const SERVICE_RETRY_INTERVAL_MS = 15 * 1000;
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
  sprc.deferredServiceRequests ??= {};
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
  // SPRC's purchase orders go on the same board every other issuer posts to.
  // A miner weighs them on price alone and has no idea who Sal is.
  registerExtractionOfferSource(state, "sprc-procurement", sprcProcurementOfferSource);

  function update() {
    sprc.account.protectedReserve = sprc.operatingPlan.protectedCashReserve;
    consumeLedgerEvents();
    retryDeferredServiceRequests();
    expireProcurementOrders();
    completeDueProduction();
    completeDueRepairs();
    startNextProduction();
    startNextRepair();
    assessOpenRepairs();
    assessOperatingPlan();
    repriceOpenProcurement();
    publishInstitutionDiagnostic();
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
    return { ...payload, subjectId: payload.npcId, subjectName: subject.shipName, craftClass: "freight-hauler", locationSiteId: SPRC.siteId, mobility: "recovered", requiredCapabilities: payload.issueType === "hull-fatigue" ? ["structural-repair"] : payload.issueType === "control-fault" ? ["control-systems"] : ["mechanical-repair"], payer: { balance: 10000, committed: 0, protectedCash: 0 }, payerInstitutionId: subject.homeOrganizationId, servicePrice: 1800 };
  }

  function createServiceRepairOrder(payload) {
    const subjectId = payload.subjectId ?? payload.npcId;
    let subject = sprc.serviceSubjects[subjectId];
    if (!subject) {
      subject = sprc.serviceSubjects[subjectId] = { id: subjectId, shipVin: payload.referenceId ?? payload.shipVin ?? subjectId, shipName: payload.subjectName ?? payload.npcName ?? subjectId, homeOrganizationId: payload.payerInstitutionId, craftClass: payload.craftClass, condition: "serviceable", maintenanceStatus: "available", repairHistory: [], currentLocationSiteId: payload.locationSiteId, availableForWork: true };
    }
    const existing = Object.values(sprc.repairOrders).find((repair) => (repair.subjectId ?? repair.subjectHaulerId) === subjectId && !["completed", "canceled"].includes(repair.status));
    // Repeated maintenance events are allowed, but they must not leave a stale
    // deferred request beside a live order for the same craft. The live order
    // is authoritative and will publish its own waiting/working diagnostic.
    if (existing) {
      clearDeferredServiceRequest(subjectId);
      clearBlocker(state, subjectId, {
        state: existing.status === "servicing" ? DIAGNOSTIC_STATE.WORKING : DIAGNOSTIC_STATE.WAITING,
        summary: `Repair ${existing.id} is already ${existing.status}`,
        at: now(),
      });
      return existing;
    }
    const requirements = SERVICE_REPAIR_RECIPES[payload.issueType];
    // Quote-then-gate: price the job as soon as the capability is known, and let
    // the affordability check judge the customer against THAT price. The
    // accepted quote is the single price used for reservation, completion, and
    // settlement — the admission price and the billed price cannot diverge.
    let priceValuation = null;
    const match = matchMaintenanceService({
      request: { ...payload, subjectId },
      institution: sprc.institution,
      facilities: Object.values(sprc.facilities),
      repairRecipe: requirements,
      inventories: sprc.inventories,
      procurableItemIds: ["hull-plate", "machine-part", "copper", "silicate"],
      priceService: ({ capability }) => {
        priceValuation = valueRepairService(requirements, capability, payload);
        return priceValuation.recommendedPrice;
      },
    });
    if (!match.eligible) {
      // Not silent limbo: park the request in a retryable state so a change in
      // the payer's cash, Sal's stock, or his prices can admit it later.
      deferServiceRequest(payload, subjectId, match);
      return null;
    }
    clearDeferredServiceRequest(subjectId);
    const id = nextId("repair", "SPRC-RPR");
    const acceptedPrice = match.quotedPrice;
    const order = sprc.repairOrders[id] = { id, facilityId: match.facility.id, serviceCapabilityId: match.capability.id, subjectId, subjectHaulerId: subjectId, subjectShipVin: subject.shipVin, craftClass: payload.craftClass, payerInstitutionId: payload.payerInstitutionId, servicePrice: acceptedPrice, quotedPrice: acceptedPrice, referenceServicePrice: payload.servicePrice ?? match.capability.servicePrice, priceValuation: priceValuation ? summarizeValuation(priceValuation) : null, condition: payload.issueType, origin: { type: "operational-wear", wear: payload.wear, issueCount: payload.issueCount, causedByCarefulMode: payload.causedByCarefulMode }, requirements: { produced: { ...requirements.produced }, raw: { ...requirements.raw } }, reserved: { produced: {}, raw: {} }, status: "waiting-stock", priority: payload.issueType.includes("failure") || payload.issueType === "control-fault" ? 80 : 60, createdAt: now(), startedAt: null, completesAt: null };
    sprc.repairQueue.push(id);
    state.ledger.recordEvent("institution.servicePriced", {
      institutionId: sprc.institution.id, actorName: sprc.controller?.name ?? "Sal", repairOrderId: id, subjectId,
      servicePrice: order.servicePrice, referencePrice: order.referenceServicePrice, reasons: priceValuation.reasons,
    }, { visible: true, message: `${sprc.controller?.name ?? "Sal"} quotes ${order.servicePrice} cr to repair ${subject.shipName} (materials at live cost).` });
    subject.condition = payload.issueType; subject.maintenanceStatus = "queued"; subject.availableForWork = false; subject.currentLocationSiteId = payload.locationSiteId;
    appendHistory("repair.created", { repairOrderId: id, subjectId, haulerId: subjectId, issueType: payload.issueType, wear: payload.wear });
    state.ledger.recordEvent("sprc.repairCreated", { repairOrderId: id, subjectId, haulerId: subjectId, shipName: subject.shipName, craftClass: payload.craftClass, condition: order.condition }, { visible: true });
    return order;
  }

  // A repair Sal could not admit is held as an explicit, retryable request
  // rather than vanishing. Retried on the operating tick, so a payer that earns
  // more, stock that arrives, or a price that moves can still get the job done.
  function deferServiceRequest(payload, subjectId, match) {
    sprc.deferredServiceRequests ??= {};
    const existing = sprc.deferredServiceRequests[subjectId];
    const record = sprc.deferredServiceRequests[subjectId] = {
      subjectId,
      request: { ...payload, subjectId },
      status: "awaiting-retry",
      reason: match.reason,
      quotedPrice: match.quotedPrice ?? null,
      availableCash: match.availableCash ?? null,
      attempts: (existing?.attempts ?? 0) + 1,
      firstDeferredAt: existing?.firstDeferredAt ?? now(),
      lastAttemptAt: now(),
    };
    appendHistory("repair.declined", { subjectId, issueType: payload.issueType, reason: match.reason, quotedPrice: record.quotedPrice, attempts: record.attempts });
    // Diagnostics: the SUBJECT is deferred, and the blocker names the real
    // reason plus what will let it through.
    recordBlocker(state, subjectId, createBlocker({
      kind: match.reason === "payer-cannot-afford" ? BLOCKER_KIND.PAYER_CANNOT_AFFORD : BLOCKER_KIND.AWAITING_SERVICE,
      summary: `Service deferred (${match.reason})${record.quotedPrice ? ` at a quote of ${record.quotedPrice} cr` : ""}`,
      subjectId,
      objectId: sprc.institution.id,
      waitingFor: match.reason === "payer-cannot-afford"
        ? `the payer to hold ${record.quotedPrice} cr above its reserve`
        : "SPRC capability, facility, or materials",
      wakeOn: ["payer-balance-changed", "materials-delivered", "sprc-retry"],
      nextReconsiderAt: now() + SERVICE_RETRY_INTERVAL_MS,
      causedBy: match.reason === "payer-cannot-afford" ? [] : [{ actorId: sprc.institution.id, note: "SPRC cannot start the work yet" }],
      detail: { reason: match.reason, quotedPrice: record.quotedPrice, availableCash: record.availableCash, attempts: record.attempts },
      at: now(),
    }), { state: DIAGNOSTIC_STATE.DEFERRED, at: now() });
    // Announce only the first deferral; retries stay quiet until something changes.
    if (!existing) {
      state.ledger.recordEvent("sprc.repairDeferred", {
        subjectId, issueType: payload.issueType, reason: match.reason,
        quotedPrice: record.quotedPrice, availableCash: record.availableCash,
        retryable: true,
      }, { visible: true, message: `${sprc.controller?.name ?? "Sal"} cannot start work on ${payload.subjectName ?? subjectId} yet (${match.reason}); the request stays open.` });
    }
    return record;
  }

  function clearDeferredServiceRequest(subjectId) {
    if (sprc.deferredServiceRequests?.[subjectId]) delete sprc.deferredServiceRequests[subjectId];
  }

  function retryDeferredServiceRequests() {
    const deferred = Object.values(sprc.deferredServiceRequests ?? {});
    if (deferred.length === 0) return;
    deferred.forEach((record) => {
      if (record.status !== "awaiting-retry") return;
      if (now() - record.lastAttemptAt < SERVICE_RETRY_INTERVAL_MS) return;
      // Re-read the payer's CURRENT balance; the stale snapshot is why the
      // original attempt failed.
      const refreshed = { ...record.request, payer: getCurrentPayerSnapshot(record.request) };
      record.lastAttemptAt = now();
      const order = createServiceRepairOrder(refreshed);
      if (order) {
        state.ledger.recordEvent("sprc.repairRetryAdmitted", {
          subjectId: record.subjectId, repairOrderId: order.id, servicePrice: order.servicePrice, attempts: record.attempts,
        }, { visible: true, message: `${sprc.controller?.name ?? "Sal"} can now take ${record.subjectId} into the berth at ${order.servicePrice} cr.` });
      }
    });
  }

  // Live payer cash, preferring the real institution account over the snapshot
  // the requester sent when it first asked.
  function getCurrentPayerSnapshot(request) {
    const payerId = request.payerInstitutionId;
    const account = getActorAccount(state, payerId);
    if (!account) return request.payer;
    return { balance: account.balance ?? 0, committed: account.committed ?? 0, protectedCash: request.payer?.protectedCash ?? 0 };
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
    let onHand = Object.entries(SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK)
      .reduce((sum, [itemId, equivalents]) => sum + (sprc.inventories.raw[itemId] ?? 0) * equivalents, 0);
    const incoming = Object.values(sprc.procurementOrders)
      .filter((order) => ["offered", "active"].includes(order.status))
      .reduce((sum, order) => sum + Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits), 0);
    const target = plan.inventoryTargets.structuralFeedstockEquivalents;
    if (onHand + incoming < target) {
      buyStructuralFeedstockFromLocalSupply(target - onHand - incoming);
      onHand = Object.entries(SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK)
        .reduce((sum, [itemId, equivalents]) => sum + (sprc.inventories.raw[itemId] ?? 0) * equivalents, 0);
    }
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
    } else {
      need.missingAmount = target - onHand - incoming;
      need.shortage = need.missingAmount;
      need.context = { planId: plan.id, target, onHand, incoming };
    }
    chooseProcurementResponse(need);
    const openOrder = Object.values(sprc.procurementOrders).find((order) => ["offered", "active"].includes(order.status) && order.needId === need.id);
    if (openOrder) plan.projected.structuralFeedstockEquivalents = onHand + Math.max(0, openOrder.requiredEquivalentUnits - openOrder.deliveredEquivalentUnits);
  }

  function assessTechnologyReserve() {
    const knownDemand = sprc.repairQueue.map((id) => sprc.repairOrders[id]).filter((repair) => repair && !["completed", "canceled"].includes(repair.status)).reduce((sum, repair) => sum + (repair.requirements.raw?.copper ?? 0), 0);
    const target = (sprc.operatingPlan.inventoryTargets.copper ?? 1) + knownDemand;
    let onHand = getAvailable("raw", "copper");
    const incoming = Object.values(sprc.procurementOrders).filter((order) => ["offered", "active"].includes(order.status) && order.procurementItemId === "copper").reduce((sum, order) => sum + Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits), 0);
    if (onHand + incoming < target) {
      buyLocalSupplyMaterial("copper", target - onHand - incoming, 55);
      onHand = getAvailable("raw", "copper");
    }
    if (onHand + incoming >= target) return;
    let need = Object.values(sprc.needs).find((entry) => entry.itemId === "copper" && entry.objectiveType === "technology-reserve" && entry.status === "open");
    if (!need) {
      const id = nextId("need", "SPRC-NEED");
      need = sprc.needs[id] = { ...createNeedRecord({ id, kind: "inventory-reserve", subject: { itemId: "copper" }, target, current: onHand + incoming, shortage: target - onHand - incoming, urgency: knownDemand ? "urgent" : "routine", purpose: knownDemand ? "complete-accepted-service" : "restore-operating-reserve", createdAt: now() }), type: "operating-need", sourceActivity: "inventory-plan", sourceRepairOrderId: null, objectiveType: "technology-reserve", itemId: "copper", missingAmount: target - onHand - incoming };
      appendHistory("need.identified", { needId: id, objectiveType: need.objectiveType, itemId: need.itemId, missingAmount: need.missingAmount });
    }
    chooseProcurementResponse(need);
  }

  function buyStructuralFeedstockFromLocalSupply(requiredEquivalents) {
    let remaining = requiredEquivalents;
    for (const materialId of ["iron-nickel", "aluminum"]) {
      if (remaining <= 0) break;
      const equivalence = SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK[materialId];
      const unitPrice = materialId === "iron-nickel" ? 28 : 50;
      const bought = buyLocalSupplyMaterial(materialId, Math.ceil(remaining / equivalence), unitPrice);
      remaining = Math.max(0, remaining - bought * equivalence);
    }
  }

  function buyLocalSupplyMaterial(itemId, requestedUnits, unitPrice) {
    const supply = state.logistics?.institutions?.["scrap-forge"];
    const available = Math.max(0, supply?.inventories?.[itemId] ?? 0);
    const affordable = Math.floor(getSpendableCash() / unitPrice);
    const units = Math.min(Math.max(0, requestedUnits), available, affordable);
    if (!supply || units <= 0) return 0;
    const cost = units * unitPrice;
    supply.inventories[itemId] -= units;
    supply.accounts.operating.balance += cost;
    sprc.account.balance -= cost;
    addInventory("raw", itemId, units);
    appendHistory("procurement.localWholesale", { supplierInstitutionId: "scrap-forge", itemId, units, cost });
    state.ledger.recordEvent("sprc.localWholesalePurchased", { supplierInstitutionId: "scrap-forge", itemId, units, cost }, { visible: true });
    return units;
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
      // Carry input costs into the finished good: raw material price →
      // produced part → repair price. This is the cost-propagation link.
      recordProduction(state, {
        institutionId: sprc.institution.id,
        outputItemId: order.output.itemId,
        outputUnits: order.output.amount,
        inputs: order.inputs,
        conversionCost: MILL_CONVERSION_COST,
        at: now(),
      });
      appendHistory("production.completed", { productionOrderId: order.id, output: order.output, unitCost: Math.round(getUnitCost(state, sprc.institution.id, order.output.itemId) * 100) / 100 });
      state.ledger.recordEvent("sprc.productionCompleted", { productionOrderId: order.id, ...order.output }, { visible: true });
    });
  }

  // Does physical stock actually cover everything this order reserved? Within a
  // running session it always does — an order only reaches "ready" after
  // reserving against real available stock, and physical produced stock only
  // grows before it is consumed. But the reservation ledger, the repair orders,
  // and physical inventory are persisted SEPARATELY, so a save/load can restore
  // them out of step: a ready order claiming a machine-part while the global
  // reserved ledger is empty and only part of the stock came back. Consuming
  // anyway underflows the inventory and throws in the middle of the tick.
  function repairReservationIsBacked(order) {
    const backed = (bucket) => Object.entries(order.reserved?.[bucket] ?? {})
      .every(([itemId, amount]) => (sprc.inventories[bucket][itemId] ?? 0) >= amount);
    return backed("produced") && backed("raw");
  }

  // Unwind a drifted order's phantom reservation — releasing from the global
  // ledger only what it actually still holds — and send it back for
  // reassessment, so it re-reserves against real stock and re-queues any
  // production it needs. A recoverable refusal, not a frame-killing throw.
  function reconcileRepairReservation(order) {
    const dropped = {};
    ["produced", "raw"].forEach((bucket) => {
      Object.entries(order.reserved?.[bucket] ?? {}).forEach(([itemId, amount]) => {
        const held = sprc.inventories.reserved[bucket][itemId] ?? 0;
        const release = Math.min(amount, held);
        if (release > 0) addReserved(bucket, itemId, -release);
        dropped[`${bucket}.${itemId}`] = amount;
      });
      order.reserved[bucket] = {};
    });
    order.status = "waiting-production";
    appendHistory("repair.reservationReconciled", { repairOrderId: order.id, dropped });
    state.ledger.recordEvent("sprc.repairReservationReconciled", {
      repairOrderId: order.id, subjectId: order.subjectId, haulerId: order.subjectHaulerId, dropped,
    }, { visible: false });
  }

  function startNextRepair() {
    if (sprc.facilities.berthTwo.activeRepairOrderId) return;
    const order = sprc.repairQueue.map((id) => sprc.repairOrders[id])
      .filter((entry) => entry?.status === "ready")
      .sort((first, second) => (second.priority ?? 0) - (first.priority ?? 0) || (first.createdAt ?? 0) - (second.createdAt ?? 0))[0];
    if (!order) return;
    if (!repairReservationIsBacked(order)) {
      reconcileRepairReservation(order);
      return;
    }
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
      const inTransit = Object.values(order.allocations ?? {}).reduce((sum, allocation) =>
        sum + Math.max(0, (allocation.reservedEquivalentUnits ?? 0) - (allocation.deliveredEquivalentUnits ?? 0)), 0);
      if (inTransit > 0 && (order.deadlineExtensionCount ?? 0) < 3) {
        order.deadlineExtensionCount = (order.deadlineExtensionCount ?? 0) + 1;
        order.deadlineAt = now() + 20 * 60 * 1000;
        appendHistory("procurement.deadlineExtended", { procurementOrderId: order.id, inTransitEquivalentUnits: inTransit, extensionCount: order.deadlineExtensionCount });
        state.ledger.recordEvent("contract.deadlineExtended", { contractId: order.contractId, inTransitEquivalentUnits: inTransit }, { visible: true });
        return;
      }
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
    // Sal prices this order from live circumstances rather than a constant:
    // urgency and scarcity raise what he will pay, his traits set how steeply,
    // and protected cash bounds the batch. Reasons are kept for inspection.
    const valuation = valueProcurement(need, procurementItemId, directMaterial);
    const amount = valuation.metrics.units;
    const pricePerEquivalent = valuation.recommendedPrice;
    const maximumPayment = amount * pricePerEquivalent;
    if (!valuation.affordable) {
      response.status = "blocked";
      response.reason = `SPRC cannot commit ${maximumPayment} credits without crossing its protected reserve.`;
      response.valuation = summarizeValuation(valuation);
      need.lastOutcome = { type: "insufficient-spendable-cash", required: maximumPayment, spendable: getSpendableCash(), at: now() };
      appendHistory("procurement.blocked", { needId: need.id, required: maximumPayment, spendable: getSpendableCash(), reasons: valuation.reasons });
      state.ledger.recordEvent("institution.valuationDeclined", {
        institutionId: sprc.institution.id, actorName: sprc.controller?.name ?? "Sal", subject: procurementItemId,
        decision: valuation.decision, reasons: valuation.reasons,
      }, { visible: false });
      return;
    }
    response.valuation = summarizeValuation(valuation);
    sprc.account.committed += maximumPayment;
    const record = sprc.procurementOrders[id] = {
      id, type: directMaterial ? "shop-input-procurement" : "structural-feedstock-procurement", procurementItemId, needId: need.id, needIds: [need.id],
      sourceRepairOrderId: need.sourceRepairOrderId, responseId: response.id, objectiveType: need.objectiveType,
      sourceRepairOrderIds: [need.sourceRepairOrderId].filter(Boolean),
      acceptedMaterials: directMaterial ? { [need.itemId]: 1 } : { ...SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK }, requiredEquivalentUnits: amount,
      deliveredEquivalentUnits: 0, deliveredMaterials: {}, paidAmount: 0, supplierDeliveries: [], allocations: {}, destinationSiteId: SPRC.siteId,
      pricePerEquivalent, maximumPayment, committedPayment: maximumPayment,
      titleTerms: "Title transfers to SPRC only upon accepted delivery at Scrap Porch.",
      status: "offered", createdAt: now(), deadlineAt: now() + 45 * 60 * 1000, deadlineExtensionCount: 0,
      contractId: `contract:${id}`,
    };
    record.valuation = summarizeValuation(valuation);
    response.procurementOrderId = id;
    registerProcurementContract(record);
    state.contracts.records[record.contractId] ??= buildContractDefinition(record);
    appendHistory("procurement.created", { procurementOrderId: id, needId: need.id, repairOrderId: need.sourceRepairOrderId, amount, pricePerEquivalent, reasons: valuation.reasons });
    state.ledger.recordEvent("institution.pricedOffer", {
      institutionId: sprc.institution.id, actorName: sprc.controller?.name ?? "Sal",
      procurementOrderId: id, contractId: record.contractId, itemId: procurementItemId,
      units: amount, unitPrice: pricePerEquivalent, urgency: need.urgency, reasons: valuation.reasons,
    }, { visible: true, message: `${sprc.controller?.name ?? "Sal"} offers ${pricePerEquivalent} cr/unit for ${amount} ${procurementItemId} (${need.urgency}).` });
    state.ledger.recordEvent("contract.offered", { contractId: record.contractId, contractTitle: directMaterial?.title ?? "SPRC Structural Feedstock", sourceNeedId: need.id }, { visible: true });
  }

  // Assemble the live circumstances Sal's procurement valuation reads.
  function valueProcurement(need, procurementItemId, directMaterial) {
    const policy = { ...getResolvedPolicy(), protectedCash: sprc.operatingPlan.protectedCashReserve ?? 0 };
    const isFeedstock = procurementItemId === "structural-feedstock";
    const onHand = isFeedstock ? getStructuralFeedstockOnHand() : getAvailable("raw", procurementItemId);
    const incoming = getIncomingEquivalents(procurementItemId);
    const target = isFeedstock
      ? (sprc.operatingPlan.inventoryTargets.structuralFeedstockEquivalents ?? 0)
      : (sprc.operatingPlan.inventoryTargets[procurementItemId] ?? 0) + Math.max(0, need.missingAmount);
    // Outcome-equivalent stock already held (e.g. aluminum covers feedstock).
    const substitutes = isFeedstock
      ? Object.keys(SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK).filter((itemId) => (sprc.inventories.raw[itemId] ?? 0) > 0)
      : [];

    return evaluateProcurement({
      itemId: procurementItemId,
      baseUnitPrice: directMaterial?.price ?? 34,
      marketUnitValue: getResourceTradeValue(isFeedstock ? "iron-nickel" : procurementItemId),
      urgency: need.urgency ?? "routine",
      inventory: { onHand, incoming, target },
      requestedUnits: Math.max(1, need.missingAmount),
      batchSize: sprc.operatingPlan.procurementBatchSizes?.[procurementItemId] ?? (isFeedstock ? 4 : 1),
      account: sprc.account,
      policy,
      traits: sprc.controller?.traits ?? {},
      relationship: null,
      substitutes,
    });
  }

  function getStructuralFeedstockOnHand() {
    return Object.entries(SPRC_ACCEPTED_STRUCTURAL_FEEDSTOCK)
      .reduce((sum, [itemId, equivalents]) => sum + (sprc.inventories.raw[itemId] ?? 0) * equivalents, 0);
  }

  function getIncomingEquivalents(procurementItemId) {
    return Object.values(sprc.procurementOrders)
      .filter((order) => ["offered", "active"].includes(order.status) && (order.procurementItemId ?? "structural-feedstock") === procurementItemId)
      .reduce((sum, order) => sum + Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits), 0);
  }

  // Live material cost of a repair recipe + labor/facility, priced with Sal's
  // margin. Replacement cost caps the quote so a repair never exceeds what
  // swapping the part outright would cost.
  function valueRepairService(requirements, capability, payload = {}) {
    const institutionId = sprc.institution.id;
    const materialCost =
      getBundleCost(state, institutionId, requirements.produced ?? {}, REFERENCE_UNIT_COSTS) +
      getBundleCost(state, institutionId, requirements.raw ?? {}, REFERENCE_UNIT_COSTS);
    // Replacing outright means buying the parts new AND paying to fit them, so
    // the cap must sit above cost-to-provide or it would erase any margin.
    const replacementParts = Object.entries({ ...(requirements.produced ?? {}), ...(requirements.raw ?? {}) })
      .reduce((sum, [itemId, amount]) => sum + getReplacementUnitCost(state, institutionId, itemId, REFERENCE_UNIT_COSTS[itemId] ?? 0) * amount, 0);
    const replacementCost = replacementParts * 2.5 + REPAIR_LABOR_COST + REPAIR_FACILITY_COST;

    return evaluateServicePrice({
      serviceId: capability?.id ?? "repair",
      materialCost,
      laborCost: REPAIR_LABOR_COST,
      facilityCost: REPAIR_FACILITY_COST,
      replacementCost,
      basePrice: payload.servicePrice ?? capability?.servicePrice ?? 0,
      traits: sprc.controller?.traits ?? {},
      policy: getResolvedPolicy(),
      relationship: getRelationshipProjection(state, { fromId: institutionId, toId: payload.payerInstitutionId }),
    });
  }

  // Periodically revisit unfilled offers. If nobody has taken the work, Sal
  // raises his bid — bounded, throttled, and logged, so escalation is legible.
  function repriceOpenProcurement() {
    Object.values(sprc.procurementOrders).forEach((order) => {
      if (!["offered", "active"].includes(order.status)) return;
      if (order.deliveredEquivalentUnits > 0) return;
      if (Object.values(order.allocations ?? {}).some((allocation) => allocation.status === "active")) return;
      const lastPricedAt = order.lastRepricedAt ?? order.createdAt ?? 0;
      if (now() - lastPricedAt < REPRICE_INTERVAL_MS) return;

      const need = sprc.needs[order.needId] ?? Object.values(sprc.needs).find((entry) => (order.needIds ?? []).includes(entry.id));
      if (!need) return;
      const directMaterial = DIRECT_PROCUREMENT[order.procurementItemId] ?? null;
      const valuation = valueProcurement(need, order.procurementItemId, directMaterial);
      order.originalPricePerEquivalent ??= order.pricePerEquivalent;
      const ceiling = Math.round(order.originalPricePerEquivalent * REPRICE_MAX_MULTIPLE);
      const nextPrice = Math.min(valuation.recommendedPrice, ceiling);
      order.lastRepricedAt = now();
      if (nextPrice <= order.pricePerEquivalent) return;

      // Commit the extra cash the higher bid needs, or keep the old price.
      const additional = (nextPrice - order.pricePerEquivalent) * order.requiredEquivalentUnits;
      if (additional > getSpendableCash()) {
        appendHistory("procurement.repriceDeferred", { procurementOrderId: order.id, wanted: nextPrice, spendable: getSpendableCash() });
        return;
      }
      const previousPrice = order.pricePerEquivalent;
      order.pricePerEquivalent = nextPrice;
      order.maximumPayment = order.requiredEquivalentUnits * nextPrice;
      order.committedPayment = (order.committedPayment ?? 0) + additional;
      sprc.account.committed += additional;
      order.repriceCount = (order.repriceCount ?? 0) + 1;
      order.valuation = summarizeValuation(valuation);
      const contract = state.contracts.records[order.contractId];
      if (contract) contract.reward = { credits: order.maximumPayment };
      appendHistory("procurement.repriced", { procurementOrderId: order.id, previousPrice, nextPrice, reasons: valuation.reasons });
      state.ledger.recordEvent("institution.offerRepriced", {
        institutionId: sprc.institution.id, actorName: sprc.controller?.name ?? "Sal", contractId: order.contractId,
        itemId: order.procurementItemId, previousPrice, unitPrice: nextPrice, repriceCount: order.repriceCount,
        reasons: [`No supplier took the work at ${previousPrice} cr/unit.`, ...valuation.reasons],
      }, { visible: true, message: `${sprc.controller?.name ?? "Sal"} raises ${order.procurementItemId} to ${nextPrice} cr/unit — no takers at ${previousPrice}.` });
    });
  }

  // Publish SPRC's own current explanation: what it is working on, what is
  // holding it up, and what will move it. This is the node the ships' blocker
  // chains point into, so it must name the real bottleneck.
  function publishInstitutionDiagnostic() {
    const institutionId = sprc.institution.id;
    const allRepairs = sprc.repairQueue.map((id) => sprc.repairOrders[id]).filter(Boolean);
    const repairs = allRepairs.filter((repair) => !["completed", "canceled"].includes(repair.status));
    const repairCounts = allRepairs.reduce((counts, repair) => {
      const status = repair.status ?? "unknown";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});
    const active = repairs.find((repair) => repair.status === "repairing") ?? null;
    const blockedRepair = repairs.find((repair) => ["waiting-stock", "waiting-production"].includes(repair.status)) ?? null;
    const unfilled = Object.values(sprc.procurementOrders).filter((order) => ["offered", "active"].includes(order.status));
    const deferredCount = Object.keys(sprc.deferredServiceRequests ?? {}).length;

    let blocker = null;
    let actorState = active ? DIAGNOSTIC_STATE.WORKING : DIAGNOSTIC_STATE.FREE;
    let summary = active
      ? `Repairing ${active.subjectId} for ${active.servicePrice} cr`
      : `Idle: ${repairs.length} queued repair(s), ${unfilled.length} open purchase order(s)`;

    if (blockedRepair) {
      const missing = getRepairMissing(blockedRepair);
      const missingItems = Object.entries(missing.items ?? {}).filter(([, amount]) => amount > 0);
      // The order(s) that would unblock it, so the chain can continue. A
      // missing PRODUCED part (hull-plate, machine-part) is relieved by orders
      // for its recipe INPUTS, not by an order for the part itself — so prefer
      // a direct match and otherwise treat every open order as a relief path.
      const directOrders = unfilled.filter((order) => missingItems.some(([itemId]) => order.procurementItemId === itemId || order.acceptedMaterials?.[itemId]));
      const relatedOrders = directOrders.length > 0 ? directOrders : unfilled;
      const causes = relatedOrders.map((order) => ({
        kind: BLOCKER_KIND.UNFILLED_ORDER,
        summary: `${order.id} for ${order.requiredEquivalentUnits} ${order.procurementItemId} at ${order.pricePerEquivalent} cr/unit is unfilled (${order.deliveredEquivalentUnits} delivered)`,
        subjectId: institutionId,
        objectId: order.id,
        waitingFor: "a supplier to deliver against the order",
        wakeOn: ["material-delivered", "order-repriced"],
        // Point at the supplier institution so its own blocker continues the chain.
        causedBy: state.miningOperation ? [{ actorId: state.miningOperation.institution?.id, note: "no supplier has taken the order" }] : [],
        at: now(),
      }));

      actorState = DIAGNOSTIC_STATE.WAITING;
      summary = `Repair ${blockedRepair.id} is held for materials`;
      blocker = createBlocker({
        kind: missingItems.length ? BLOCKER_KIND.AWAITING_MATERIAL : BLOCKER_KIND.AWAITING_PRODUCTION,
        summary: missingItems.length
          ? `Short ${missingItems.map(([itemId, amount]) => `${amount} ${itemId}`).join(", ")} for ${blockedRepair.id}`
          : `Waiting on the mill to finish parts for ${blockedRepair.id}`,
        subjectId: institutionId,
        objectId: blockedRepair.id,
        waitingFor: missingItems.length ? missingItems.map(([itemId]) => itemId).join(", ") : "production to complete",
        wakeOn: ["material-delivered", "production-completed"],
        causedBy: causes,
        detail: { missing: missing.items, repairStatus: blockedRepair.status },
        at: now(),
      });
    }

    recordDiagnostic(state, institutionId, {
      actorName: sprc.actor?.name ?? "Scrap Porch Recovery Cooperative",
      actorKind: "institution",
      controllerId: sprc.institution.controllerInstitutionId,
      state: actorState,
      summary,
      locationSiteId: sprc.institution.siteId,
      intention: active ? { id: active.id, kind: "service", goal: `repair ${active.subjectId}`, objectId: active.id, contractId: null, reserved: active.reserved } : null,
      blocker,
      waitingFor: blocker?.waitingFor ?? null,
      wakeOn: blocker?.wakeOn ?? ["maintenance.requested", "material-delivered"],
      nextReconsiderAt: blocker ? now() + SERVICE_RETRY_INTERVAL_MS : null,
      refs: {
        contractIds: unfilled.map((order) => order.contractId).filter(Boolean),
        targetIds: repairs.map((repair) => repair.subjectId),
        dependencyIds: unfilled.map((order) => order.id),
      },
      detail: {
        cash: Math.round(sprc.account.balance),
        committed: Math.round(sprc.account.committed ?? 0),
        protectedCash: sprc.operatingPlan.protectedCashReserve,
        availableCash: Math.round(getSpendableCash()),
        inventories: sprc.inventories,
        openOrders: unfilled.length,
        deferredRequests: deferredCount,
        queuedRepairs: repairs.length,
        repairCounts,
        completedRepairs: repairCounts.completed ?? 0,
        berth: sprc.facilities.berthTwo.status,
        mill: sprc.facilities.maw.activeProductionOrderId ? "busy" : "idle",
      },
    }, now());
  }

  function summarizeValuation(valuation) {
    return {
      decision: valuation.decision,
      recommendedPrice: valuation.recommendedPrice,
      minAcceptablePrice: valuation.minAcceptablePrice,
      maxAcceptablePrice: valuation.maxAcceptablePrice,
      reasons: valuation.reasons,
      metrics: valuation.metrics,
      at: now(),
    };
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
    // A supplier that filled an earlier reservation was marked completed.
    // Taking a new reservation makes it active again — without this, the first
    // supplier to finish a run could never come back for the remainder, and the
    // order would sit part-filled forever while that supplier was refused with
    // "order-not-accepting" on every attempt.
    allocation.status = "active";
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
    // Book what this material ACTUALLY cost. Sal's service prices read this,
    // so an expensive purchase raises repair prices without any hand-tuning.
    recordAcquisition(state, {
      institutionId: sprc.institution.id,
      itemId: materialId,
      units: acceptedUnits,
      totalCost: paymentDue,
      source: `procurement:${order.id}`,
      at: now(),
    });
    state.ledger.recordEvent("institution.costBasisUpdated", {
      institutionId: sprc.institution.id, itemId: materialId, units: acceptedUnits, paid: paymentDue,
      unitCost: acceptedUnits > 0 ? Math.round((paymentDue / acceptedUnits) * 100) / 100 : 0,
      averageUnitCost: Math.round(getUnitCost(state, sprc.institution.id, materialId) * 100) / 100,
    }, { visible: false });
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
      // Multi-dimensional projection alongside the legacy scalar: who supplied,
      // how completely, and how that shapes future terms and access.
      recordDeliveryOutcome(state, {
        fromId: sprc.institution.id,
        toId: supplierInstitutionId,
        onTime: order.deadlineAt >= now(),
        complete: true,
        at: now(),
      });
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
