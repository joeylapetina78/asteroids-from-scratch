import { buildPhysicalTransportationRoute, createTransportationNetwork, findTransportationRoute } from "./transportationPlanning.js?v=fresh-20260804-2105-207b171";
import { FIRST_REACH_TRANSPORT_CONNECTIONS } from "../content/transportation/firstReachNetwork.js?v=fresh-20260804-2105-207b171";
import { evaluateSupplierAsk } from "./valuation.js?v=fresh-20260804-2105-207b171";
import { resolveInstitutionPolicy } from "./institutionDecision.js?v=fresh-20260804-2105-207b171";
import { INSTITUTION_ARCHETYPES } from "../content/institutions/institutionArchetypes.js?v=fresh-20260804-2105-207b171";
import { getActorProtectedCash, getActorTraits } from "./actorConfig.js?v=fresh-20260804-2105-207b171";
import { getServiceCost, recordServiceCost } from "./costBasis.js?v=fresh-20260804-2105-207b171";
import { getRelationshipProjection, recordDeliveryOutcome } from "./relationshipProjections.js?v=fresh-20260804-2105-207b171";
import { authorizeWreckSalvage, completeWreckSalvage } from "./wreckRegistry.js?v=fresh-20260804-2105-207b171";
import { applyCraftUse, ensureCraftComponents, getWorstComponent } from "./componentCondition.js?v=fresh-20260804-2105-207b171";
import { DIAGNOSTIC_STATE, recordDiagnostic } from "./diagnostics.js?v=fresh-20260804-2105-207b171";

const REPAIR_SITE_ID = "scrap-porch";
const RECOVERY_COMPONENTS = Object.freeze([
  { id: "propulsion", label: "Recovery Propulsion", capabilityIds: ["travel"] },
  { id: "tow-coupling", label: "Tow Coupling", capabilityIds: ["attach-casualty"] },
  { id: "winch", label: "Winch", capabilityIds: ["tow-load"] },
  { id: "navigation", label: "Recovery Navigation", capabilityIds: ["route-recovery"] },
  { id: "hull", label: "Hull Structure", capabilityIds: ["survive-recovery"] },
]);

function ensureRecoveryCondition(vehicle) {
  ensureCraftComponents(vehicle, RECOVERY_COMPONENTS);
  return vehicle;
}

// Recovery pricing is no longer written here at all.
//
// It used to be `140 + distance * 0.012` — an authored number at the
// pre-redenomination tier, in an economy where hauling the same lane pays about
// a thousand. Recovery was the cheapest thing in the world, and got cheaper
// relative to everything else every time the economy was rescaled.
//
// The cost model now belongs to the `recovery-service` ARCHETYPE, this firm's
// overrides to its instance policy, and the margin to its operator's traits.
// Nell is a recovery-oriented actor because of what she has and values, and
// there is no tow-specific pricing left to change.
//
// INTENDED BEHAVIOUR, NOT A BUG: a carrier that cannot afford recovery stays
// stranded. Recovery is now priced against real distance, so the long lanes are
// genuinely expensive and a poor carrier far from help may not be able to pay.
// It is refused once, visibly, with `carrier-cannot-protect-operating-cash`, and
// it does not retry until something changes.
//
// **Guaranteed recovery is not an invariant.** Do not "fix" an expensive lane by
// lowering the price or adding an automatic bailout — that would remove the only
// real consequence distance currently has. Permanent ship loss, wrecks, salvage
// rights, insurance and replacement are a later slice; this is the state the
// world sits in until they exist.

export function createInitialTowServiceState(now = Date.now()) {
  return {
    institution: {
      id: "first-reach-recovery",
      name: "First Reach Recovery",
      archetypeId: "recovery-service",
      controllerInstitutionId: "nell-winch",
      accounts: { operating: { id: "FRR-ACCT-01", balance: 900, committed: 0, transactions: [] } },
      // Only what makes THIS firm different from any other recovery outfit.
      // The cost model comes from the archetype.
      policies: { protectedCash: 250, servicePriorities: ["loaded-disabled-carrier", "disabled-carrier", "stranded-pilot"] },
      createdAt: now,
    },
    // Nell works thin and takes the jobs nobody else will: low margin appetite,
    // low caution. Her quote comes from these and from what a recovery actually
    // costs her — there is no tow-specific pricing code left.
    controller: { id: "nell-winch", name: "Nell Winch", archetypeId: "person", controls: ["first-reach-recovery"], traits: { caution: 0.3, growthBias: 0.25, urgencyBias: 0.7 }, license: { id: "TOW-FRR-001", class: "commercial-recovery", status: "active" }, authority: { mayTow: true, mayClearLanes: true, mayInvoice: true } },
    vehicle: { id: "ship:first-reach-recovery-1", name: "Blue Hook", archetypeId: "recovery-ship", controllerInstitutionId: "first-reach-recovery", referenceId: "TOW-01-BLUE-HOOK", status: "available" },
    requests: {},
    counters: { request: 0, transaction: 0 },
    lastLedgerEventId: 0,
  };
}

export function ensureTowServiceState(state, now = Date.now()) {
  state.towing ??= createInitialTowServiceState(now);
  state.towing.requests ??= {};
  state.towing.counters ??= { request: 0, transaction: 0 };
  state.towing.lastLedgerEventId ??= 0;
  ensureRecoveryCondition(state.towing.vehicle);
  if (state.logistics?.institutions) {
    state.logistics.institutions[state.towing.institution.id] ??= state.towing.institution;
    state.logistics.institutions[state.towing.controller.id] ??= state.towing.controller;
  }
  recordRecoveryDiagnostic(state, now);
  return state.towing;
}

function recordRecoveryDiagnostic(state, now = Date.now()) {
  const towing = state.towing;
  if (!towing?.vehicle) return null;
  return recordDiagnostic(state, towing.vehicle.id, {
    actorName: towing.vehicle.name,
    actorKind: "ship",
    controllerId: towing.institution.id,
    state: towing.vehicle.status === "available" ? DIAGNOSTIC_STATE.FREE : DIAGNOSTIC_STATE.WORKING,
    summary: towing.vehicle.status === "available" ? "Available for recovery work" : `Recovery craft is ${towing.vehicle.status}`,
    locationSiteId: towing.vehicle.siteId ?? REPAIR_SITE_ID,
    detail: { referenceId: towing.vehicle.referenceId, components: towing.vehicle.components },
  }, now);
}

function applyRecoveryWork(towing, distance, now) {
  const distanceWear = Math.max(0, distance ?? 0) / 300000;
  return applyCraftUse(towing.vehicle, {
    propulsion: 0.018 + distanceWear,
    navigation: 0.012 + distanceWear * 0.4,
    "tow-coupling": 0.018,
    winch: 0.028 + distanceWear * 0.6,
    hull: 0.008 + distanceWear * 0.2,
  }, { at: now });
}

export function createTowServiceManager({ state, ships = [], destinations = [], now = () => Date.now(), onWreckRecovered = () => {} }) {
  const towing = ensureTowServiceState(state, now());
  const shipById = new Map(ships.map((ship) => [ship.id, ship]));
  const network = createTransportationNetwork({ destinations, connections: FIRST_REACH_TRANSPORT_CONNECTIONS });

  function update() {
    consumeEvents();
    advanceSalvageWork();
    claimNextSalvageJob();
    Object.values(towing.requests)
      .filter((request) => request.status === "delivered-cargo" && !request.followupRequestId)
      .forEach((request) => {
        const hauler = state.logistics.haulers[request.haulerId];
        if (hauler?.activeShipmentId) return;
        const followup = dispatchRequest({ ...request.issue, npcId: request.haulerId, shipmentId: null }, { destinationSiteId: REPAIR_SITE_ID, purpose: "service-return", parentRequestId: request.id });
        if (followup) request.followupRequestId = followup.id;
      });
  }

  function claimNextSalvageJob() {
    if (towing.vehicle.status !== "available") return null;
    if (getWorstComponent(towing.vehicle)?.condition?.stage === "failed") return null;
    const contract = Object.values(state.contracts?.records ?? {}).find((candidate) =>
      candidate.type === "wreck-salvage" && candidate.status === "offered");
    if (!contract) return null;
    const wreck = state.wrecks?.records?.[contract.terms?.wreckId];
    if (!wreck || wreck.status !== "awaiting-owner-disposition") return null;
    const reward = contract.reward?.credits ?? 0;
    const payer = state.sprc?.account;
    const protectedCash = state.sprc?.operatingPlan?.protectedCashReserve ?? 0;
    if (!payer || payer.balance - reward < protectedCash) return null;
    const authorizationId = `SALVAGE-AUTH-${contract.id}`;
    if (!authorizeWreckSalvage(state, { wreckId: wreck.id, authorizationId, salvagerId: towing.institution.id, destinationSiteId: contract.terms.destinationSiteId, at: now() })) return null;
    contract.status = "active";
    contract.acceptedBy = towing.institution.id;
    contract.acceptedAt = now();
    payer.committed = (payer.committed ?? 0) + reward;
    const distance = Math.hypot(wreck.position.x - (network.destinations[contract.terms.destinationSiteId]?.position?.x ?? 0), wreck.position.y - (network.destinations[contract.terms.destinationSiteId]?.position?.y ?? 0));
    const id = `SALVAGE-TOW-${String(++towing.counters.request).padStart(4, "0")}`;
    const request = towing.requests[id] = { id, purpose: "authorized-wreck-salvage", wreckId: wreck.id, contractId: contract.id, destinationSiteId: contract.terms.destinationSiteId, routeDistance: distance, fee: reward, committedPayment: reward, status: "recovering-wreck", startedAt: now(), completesAt: now() + Math.max(12000, distance / 85 * 1000) };
    towing.vehicle.status = "recovering-wreck";
    recordRecoveryDiagnostic(state, now());
    state.ledger.recordEvent("towService.salvageAccepted", { institutionId: towing.institution.id, actorInstitutionId: towing.controller.id, vehicleId: towing.vehicle.id, requestId: id, contractId: contract.id, wreckId: wreck.id, fee: reward }, { visible: true, message: `${towing.controller.name} accepted the recovery of ${wreck.shipName}; ${towing.vehicle.name} is bringing the titled wreck to Scrap Porch.` });
    return request;
  }

  function advanceSalvageWork() {
    Object.values(towing.requests).filter((request) => request.status === "recovering-wreck" && now() >= request.completesAt).forEach((request) => {
      const completed = completeWreckSalvage(state, { wreckId: request.wreckId, salvagerId: towing.institution.id, destinationSiteId: request.destinationSiteId, at: now() });
      if (!completed) { request.status = "failed"; towing.vehicle.status = "available"; return; }
      const contract = state.contracts?.records?.[request.contractId];
      const payer = state.sprc.account;
      payer.committed = Math.max(0, (payer.committed ?? 0) - request.committedPayment);
      payer.balance -= request.fee;
      const providerTransaction = recordTransaction(towing.institution, request.fee, "salvage-income", request.contractId);
      contract.status = "fulfilled";
      contract.fulfilledAt = now();
      contract.fulfilledBy = towing.institution.id;
      request.status = "completed";
      request.completedAt = now();
      request.providerTransactionId = providerTransaction.id;
      request.committedPayment = 0;
      towing.vehicle.status = "available";
      applyRecoveryWork(towing, request.routeDistance, now());
      recordRecoveryDiagnostic(state, now());
      onWreckRecovered(completed);
      state.ledger.recordEvent("towService.salvageCompleted", { institutionId: towing.institution.id, actorInstitutionId: towing.controller.id, vehicleId: towing.vehicle.id, requestId: request.id, contractId: contract.id, wreckId: completed.id, fee: request.fee, salvageYield: completed.salvageYield }, { visible: true, message: `${towing.controller.name} delivered ${completed.shipName} to Sal; First Reach Recovery earned ${request.fee} cr and SPRC received the recovered stock.` });
    });
  }

  function consumeEvents() {
    for (const event of state.ledger.getEventsAfterId(towing.lastLedgerEventId, { includeHidden: true })) {
      towing.lastLedgerEventId = Math.max(towing.lastLedgerEventId, event.id);
      if (event.type === "npc.assistanceRequired") dispatchRequest(event.payload);
      if (event.type === "npc.routeCompleted" && event.payload.towRequestId) completeRequest(event.payload.towRequestId, event.payload.siteId);
    }
  }

  // What Nell must be paid to take a recovery on. Identical in shape to how a
  // carrier prices a freight run and how Sal prices a repair: real costs, a
  // trait-shaped margin, cost as the hard floor, and terms that soften for a
  // customer she has served well before.
  function quoteRecovery(route, carrier) {
    // Archetype first, then this firm's overrides — the standard layering.
    const policy = resolveInstitutionPolicy({
      archetypePolicy: INSTITUTION_ARCHETYPES[towing.institution.archetypeId]?.defaultPolicy,
      institutionPolicy: towing.institution.policies,
    });
    const maximumWear = policy.maximumWear ?? 6;
    const serviceCost = getServiceCost(state, towing.institution.id, "maintenance", policy.referenceServiceCost ?? 0);
    const wear = route.distance * (policy.expectedWearPerDistance ?? 0);

    return evaluateSupplierAsk({
      workId: `recovery to ${route.destinationId ?? "site"}`,
      costComponents: {
        // Mobilising the rig costs the same however close the casualty is.
        callout: policy.calloutCost ?? 0,
        travel: route.distance * (policy.operatingCostPerDistance ?? 0),
        // This run consumes wear/maximumWear of a service cycle.
        maintenance: maximumWear > 0 ? ((wear / maximumWear) + (towing.vehicle.aggregateWear ?? 0)) * serviceCost : 0,
      },
      traits: getActorTraits(state, towing.institution.id),
      policy,
      // A carrier Nell has recovered reliably before gets better terms. This is
      // the second place in the world that reads a relationship projection, and
      // completion below is the second place that writes one.
      relationship: getRelationshipProjection(state, { fromId: towing.institution.id, toId: carrier?.id }),
    });
  }

  function dispatchRequest(issue, options = {}) {
    const hauler = state.logistics.haulers[issue.npcId];
    const ship = shipById.get(issue.npcId);
    if (!hauler || !ship) return null;
    const existing = Object.values(towing.requests).find((request) => request.haulerId === issue.npcId && ["dispatched", "attached"].includes(request.status));
    if (existing) return existing;
    if (towing.vehicle.status !== "available") return null;
    if (getWorstComponent(towing.vehicle)?.condition?.stage === "failed") return blockRequest(issue, "recovery-craft-needs-service");
    const carrier = state.logistics.institutions[hauler.carrierInstitutionId];
    const shipment = issue.shipmentId ? state.logistics.shipments[issue.shipmentId] : null;
    const destinationSiteId = options.destinationSiteId ?? shipment?.destinationSiteId ?? REPAIR_SITE_ID;
    const route = findTransportationRoute(network, hauler.currentSiteId, destinationSiteId, carrier.policies?.transportation?.knownDestinationIds);
    if (!route) return blockRequest(issue, "no-known-recovery-route");
    const quote = quoteRecovery(route, carrier);
    const fee = quote.recommendedPrice;
    const account = carrier.accounts.operating;
    const protectedCash = getActorProtectedCash(state, carrier.id);
    const securedReceivable = shipment?.payment ?? 0;
    if (account.balance + securedReceivable - (account.committed ?? 0) - fee < protectedCash) return blockRequest(issue, "carrier-cannot-protect-operating-cash", { fee, balance: account.balance, protectedCash, securedReceivable });
    const id = `TOW-REQ-${String(++towing.counters.request).padStart(4, "0")}`;
    const request = towing.requests[id] = { id, haulerId: issue.npcId, carrierInstitutionId: carrier.id, shipInstitutionId: hauler.shipInstitutionId, issue: { ...issue }, purpose: options.purpose ?? (shipment ? "preserve-loaded-delivery" : "service-return"), parentRequestId: options.parentRequestId ?? null, originSiteId: hauler.currentSiteId, destinationSiteId, routeDistance: route.distance, shipmentId: shipment?.id ?? null, securedReceivable, fee, committedPayment: fee, quote: { costToServe: Math.round(quote.metrics.costToServe), floor: quote.minAcceptablePrice, reasons: quote.reasons }, status: "dispatched", createdAt: now(), completedAt: null, followupRequestId: null };
    account.committed = (account.committed ?? 0) + fee;
    towing.vehicle.status = "dispatched";
    recordRecoveryDiagnostic(state, now());
    ship.assignTow({ requestId: id, destinationSiteId, route: buildPhysicalTransportationRoute(network, route) });
    publish("towService.dispatched", request, `${towing.controller.name} dispatched ${towing.vehicle.name} for ${ship.name}; ${carrier.name} approved a ${fee} cr recovery quote to ${network.destinations[destinationSiteId]?.name ?? destinationSiteId}.`);
    return request;
  }

  function completeRequest(requestId, siteId) {
    const request = towing.requests[requestId];
    if (!request || request.status !== "dispatched" || request.destinationSiteId !== siteId) return false;
    const hauler = state.logistics.haulers[request.haulerId];
    const carrier = state.logistics.institutions[request.carrierInstitutionId];
    const ship = shipById.get(request.haulerId);
    hauler.currentSiteId = siteId;
    carrier.accounts.operating.committed = Math.max(0, (carrier.accounts.operating.committed ?? 0) - request.committedPayment);
    const carrierTransaction = recordTransaction(carrier, -request.fee, "recovery-expense", request.id);
    const providerTransaction = recordTransaction(towing.institution, request.fee, "recovery-income", request.id);
    request.committedPayment = 0;
    request.completedAt = now();
    ship?.clearTow();
    towing.vehicle.status = "available";
    applyRecoveryWork(towing, request.routeDistance, now());
    recordRecoveryDiagnostic(state, now());
    if (request.shipmentId && siteId !== REPAIR_SITE_ID) {
      request.status = "delivered-cargo";
      publish("towService.cargoPreserved", request, `${towing.controller.name} recovered ${ship?.name ?? request.haulerId} to ${network.destinations[siteId]?.name ?? siteId}; its loaded contract can unload before repair recovery.`);
    } else {
      request.status = "completed";
      if (ship?.pendingWearIssue) {
        state.ledger.recordEvent("npc.wearIssue", ship.pendingWearIssue, { visible: false });
        ship.pendingWearIssue = null;
      }
      publish("towService.completed", request, `${towing.controller.name} delivered ${ship?.name ?? request.haulerId} to ${network.destinations[siteId]?.name ?? siteId}; ${carrier.name} paid ${request.fee} cr from ${carrierTransaction.accountId}.`);
    }
    request.carrierTransactionId = carrierTransaction.id;
    request.providerTransactionId = providerTransaction.id;

    // A recovery that landed where it was meant to, for the fee that was
    // quoted, is a deal kept — in both directions. Nell learns this carrier
    // pays; the carrier learns Nell turns up. Nothing reads the carrier's side
    // yet, and recording it now is what makes it available when something does.
    recordDeliveryOutcome(state, { fromId: towing.institution.id, toId: request.carrierInstitutionId, onTime: true, complete: true, at: now() });
    recordDeliveryOutcome(state, { fromId: request.carrierInstitutionId, toId: towing.institution.id, onTime: true, complete: true, at: now() });
    // What this recovery actually cost the carrier, so its own freight asks
    // carry the risk of breaking down instead of pretending recovery is free.
    recordServiceCost(state, { institutionId: request.carrierInstitutionId, serviceType: "recovery", price: request.fee, at: now() });
    return true;
  }

  function blockRequest(issue, reason, details = {}) {
    // Being unable to afford recovery is a STATE, not an event. A stranded
    // carrier that keeps calling for help must sit in one visible blocked
    // record that counts the attempts, rather than minting a new one and a new
    // ledger line every time it asks.
    const standing = Object.values(towing.requests)
      .find((request) => request.haulerId === issue.npcId && request.status === "blocked" && request.reason === reason);
    if (standing) {
      standing.attempts = (standing.attempts ?? 1) + 1;
      standing.lastAttemptAt = now();
      Object.assign(standing, details);
      return standing;
    }

    const id = `TOW-REQ-${String(++towing.counters.request).padStart(4, "0")}`;
    const request = towing.requests[id] = { id, haulerId: issue.npcId, issue: { ...issue }, status: "blocked", reason, attempts: 1, lastAttemptAt: now(), createdAt: now(), ...details };
    state.ledger.recordEvent("towService.blocked", { institutionId: towing.institution.id, institutionName: towing.institution.name, actorInstitutionId: towing.controller.id, actorName: towing.controller.name, requestId: id, haulerId: issue.npcId, reason, ...details }, { visible: true, message: `${towing.controller.name} could not dispatch recovery for ${issue.npcName ?? issue.npcId}: ${reason.replaceAll("-", " ")}.` });
    return request;
  }

  function recordTransaction(institution, amount, type, referenceId) {
    const account = institution.accounts.operating;
    account.transactions ??= [];
    account.balance += amount;
    const transaction = { id: `TOW-TX-${String(++towing.counters.transaction).padStart(5, "0")}`, at: now(), accountId: account.id, institutionId: institution.id, amount, type, referenceId, balance: account.balance };
    account.transactions.push(transaction);
    return transaction;
  }

  function publish(type, request, message) {
    state.ledger.recordEvent(type, { institutionId: towing.institution.id, institutionName: towing.institution.name, actorInstitutionId: towing.controller.id, actorName: towing.controller.name, vehicleId: towing.vehicle.id, vehicleName: towing.vehicle.name, requestId: request.id, haulerId: request.haulerId, carrierInstitutionId: request.carrierInstitutionId, destinationSiteId: request.destinationSiteId, fee: request.fee, purpose: request.purpose }, { visible: true, message });
  }

  return { update, dispatchRequest, getState: () => towing };
}
