import { buildPhysicalTransportationRoute, createTransportationNetwork, findTransportationRoute } from "./transportationPlanning.js?v=fresh-20260730-1748-485ac03";
import { FIRST_REACH_TRANSPORT_CONNECTIONS } from "../content/transportation/firstReachNetwork.js?v=fresh-20260730-1748-485ac03";

const REPAIR_SITE_ID = "scrap-porch";
const BASE_NPC_TOW_FEE = 140;

export function createInitialTowServiceState(now = Date.now()) {
  return {
    institution: {
      id: "first-reach-recovery",
      name: "First Reach Recovery",
      archetypeId: "recovery-service",
      controllerInstitutionId: "nell-winch",
      accounts: { operating: { id: "FRR-ACCT-01", balance: 900, committed: 0, transactions: [] } },
      policies: { protectedCash: 250, baseTowFee: BASE_NPC_TOW_FEE, servicePriorities: ["loaded-disabled-carrier", "disabled-carrier", "stranded-pilot"] },
      createdAt: now,
    },
    controller: { id: "nell-winch", name: "Nell Winch", archetypeId: "person", controls: ["first-reach-recovery"], license: { id: "TOW-FRR-001", class: "commercial-recovery", status: "active" }, authority: { mayTow: true, mayClearLanes: true, mayInvoice: true } },
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
  return state.towing;
}

export function createTowServiceManager({ state, ships = [], destinations = [], now = () => Date.now() }) {
  const towing = ensureTowServiceState(state, now());
  const shipById = new Map(ships.map((ship) => [ship.id, ship]));
  const network = createTransportationNetwork({ destinations, connections: FIRST_REACH_TRANSPORT_CONNECTIONS });

  function update() {
    consumeEvents();
    Object.values(towing.requests)
      .filter((request) => request.status === "delivered-cargo" && !request.followupRequestId)
      .forEach((request) => {
        const hauler = state.logistics.haulers[request.haulerId];
        if (hauler?.activeShipmentId) return;
        const followup = dispatchRequest({ ...request.issue, npcId: request.haulerId, shipmentId: null }, { destinationSiteId: REPAIR_SITE_ID, purpose: "service-return", parentRequestId: request.id });
        if (followup) request.followupRequestId = followup.id;
      });
  }

  function consumeEvents() {
    for (const event of state.ledger.getEventsAfterId(towing.lastLedgerEventId, { includeHidden: true })) {
      towing.lastLedgerEventId = Math.max(towing.lastLedgerEventId, event.id);
      if (event.type === "npc.assistanceRequired") dispatchRequest(event.payload);
      if (event.type === "npc.routeCompleted" && event.payload.towRequestId) completeRequest(event.payload.towRequestId, event.payload.siteId);
    }
  }

  function dispatchRequest(issue, options = {}) {
    const hauler = state.logistics.haulers[issue.npcId];
    const ship = shipById.get(issue.npcId);
    if (!hauler || !ship) return null;
    const existing = Object.values(towing.requests).find((request) => request.haulerId === issue.npcId && ["dispatched", "attached"].includes(request.status));
    if (existing) return existing;
    const carrier = state.logistics.institutions[hauler.carrierInstitutionId];
    const shipment = issue.shipmentId ? state.logistics.shipments[issue.shipmentId] : null;
    const destinationSiteId = options.destinationSiteId ?? shipment?.destinationSiteId ?? REPAIR_SITE_ID;
    const route = findTransportationRoute(network, hauler.currentSiteId, destinationSiteId, carrier.policies?.transportation?.knownDestinationIds);
    if (!route) return blockRequest(issue, "no-known-recovery-route");
    const fee = Math.round(BASE_NPC_TOW_FEE + route.distance * 0.012);
    const account = carrier.accounts.operating;
    const protectedCash = carrier.policies?.transportation?.minimumOperatingCash ?? 0;
    const securedReceivable = shipment?.payment ?? 0;
    if (account.balance + securedReceivable - (account.committed ?? 0) - fee < protectedCash) return blockRequest(issue, "carrier-cannot-protect-operating-cash", { fee, balance: account.balance, protectedCash, securedReceivable });
    const id = `TOW-REQ-${String(++towing.counters.request).padStart(4, "0")}`;
    const request = towing.requests[id] = { id, haulerId: issue.npcId, carrierInstitutionId: carrier.id, shipInstitutionId: hauler.shipInstitutionId, issue: { ...issue }, purpose: options.purpose ?? (shipment ? "preserve-loaded-delivery" : "service-return"), parentRequestId: options.parentRequestId ?? null, originSiteId: hauler.currentSiteId, destinationSiteId, shipmentId: shipment?.id ?? null, securedReceivable, fee, committedPayment: fee, status: "dispatched", createdAt: now(), completedAt: null, followupRequestId: null };
    account.committed = (account.committed ?? 0) + fee;
    towing.vehicle.status = "dispatched";
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
    return true;
  }

  function blockRequest(issue, reason, details = {}) {
    const id = `TOW-REQ-${String(++towing.counters.request).padStart(4, "0")}`;
    const request = towing.requests[id] = { id, haulerId: issue.npcId, issue: { ...issue }, status: "blocked", reason, createdAt: now(), ...details };
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
