import { createResponseRecord, evaluateAffordability, generateCapabilityResponses, resolveInstitutionPolicy } from "./institutionDecision.js";
import { createTransportationNetwork, evaluateTransportPlan, findTransportationRoute } from "./transportationPlanning.js";
import { FIRST_REACH_CARRIER_POLICY, FIRST_REACH_REPAIR_OPTIONS, FIRST_REACH_TRANSPORT_CONNECTIONS } from "../content/transportation/firstReachNetwork.js";

export const STANDING_FREIGHT_TEMPLATES = Object.freeze([
  { id: "standing-water-scrap-yard", originSiteId: "scrap-porch", originName: "Scrap Porch", destinationSiteId: "yard-exchange", destinationName: "Yard Exchange", commodity: "water-ice", commodityName: "Water Ice", amount: 1, payment: 90, issuerInstitutionId: "yard-exchange", sourceInstitutionId: "scrap-forge", destinationInstitutionId: "yard-exchange" },
  { id: "standing-iron-yard-scrap", originSiteId: "yard-exchange", originName: "Yard Exchange", destinationSiteId: "scrap-porch", destinationName: "Scrap Porch", commodity: "iron-nickel", commodityName: "Iron Nickel", amount: 1, payment: 95, issuerInstitutionId: "scrap-forge", sourceInstitutionId: "yard-exchange", destinationInstitutionId: "scrap-forge" },
  { id: "standing-iron-yard-ledge", originSiteId: "yard-exchange", originName: "Yard Exchange", destinationSiteId: "the-ledge", destinationName: "The Ledge", commodity: "iron-nickel", commodityName: "Iron Nickel", amount: 1, payment: 210, issuerInstitutionId: "the-ledge", sourceInstitutionId: "yard-exchange", destinationInstitutionId: "the-ledge" },
  { id: "standing-silicate-ledge-yard", originSiteId: "the-ledge", originName: "The Ledge", destinationSiteId: "yard-exchange", destinationName: "Yard Exchange", commodity: "silicate", commodityName: "Silicate", amount: 1, payment: 190, issuerInstitutionId: "yard-exchange", sourceInstitutionId: "the-ledge", destinationInstitutionId: "yard-exchange" },
]);

export function createInitialLogisticsState(now = Date.now()) {
  return {
    version: 1,
    institutions: {
      "yard-exchange": { id: "yard-exchange", archetypeId: "trade-hub", accounts: { operating: { balance: 5000, committed: 0 } }, inventories: { "iron-nickel": 0, "water-ice": 0 }, renewableResources: ["iron-nickel"] },
      "scrap-forge": { id: "scrap-forge", archetypeId: "resource-outpost", accounts: { operating: { balance: 3000, committed: 0 } }, inventories: { "water-ice": 0, "iron-nickel": 0 }, renewableResources: ["water-ice"] },
      "the-ledge": { id: "the-ledge", archetypeId: "frontier-outpost", accounts: { operating: { balance: 4200, committed: 0 } }, inventories: { "iron-nickel": 0, silicate: 0 }, renewableResources: ["silicate"] },
      "carrier:yard-hauler": { id: "carrier:yard-hauler", archetypeId: "hauling-business", controllerInstitutionId: "person:yard-hauler-operator", accounts: { operating: { balance: 400, committed: 0 } }, policies: { transportation: { ...FIRST_REACH_CARRIER_POLICY } }, repairOptions: FIRST_REACH_REPAIR_OPTIONS.map((entry) => ({ ...entry })) },
      "person:yard-hauler-operator": { id: "person:yard-hauler-operator", archetypeId: "person", controls: ["carrier:yard-hauler"] },
      "ship:hauler-yard-scrap": { id: "ship:hauler-yard-scrap", archetypeId: "cargo-ship", controllerInstitutionId: "carrier:yard-hauler", wear: 0, issueCount: 0 },
      "carrier:porch-runner": { id: "carrier:porch-runner", archetypeId: "hauling-business", controllerInstitutionId: "person:hauler-scrap-yard-operator", accounts: { operating: { balance: 350, committed: 0 } }, policies: { transportation: { ...FIRST_REACH_CARRIER_POLICY } }, repairOptions: FIRST_REACH_REPAIR_OPTIONS.map((entry) => ({ ...entry })) },
      "person:hauler-scrap-yard-operator": { id: "person:hauler-scrap-yard-operator", archetypeId: "person", name: "Mara Venn", controls: ["carrier:porch-runner"] },
      "ship:hauler-scrap-yard": { id: "ship:hauler-scrap-yard", archetypeId: "cargo-ship", controllerInstitutionId: "carrier:porch-runner", wear: 0, issueCount: 0 },
    },
    haulers: {
      "hauler-yard-scrap": { shipInstitutionId: "ship:hauler-yard-scrap", carrierInstitutionId: "carrier:yard-hauler", currentSiteId: "yard-exchange", activeShipmentId: null, activeMovementId: null, maintenanceRequested: false, status: "seeking-work" },
      "hauler-scrap-yard": { shipInstitutionId: "ship:hauler-scrap-yard", carrierInstitutionId: "carrier:porch-runner", currentSiteId: "scrap-porch", activeShipmentId: null, activeMovementId: null, maintenanceRequested: false, status: "seeking-work" },
    },
    shipments: {}, movements: {}, containers: {}, responses: {}, history: [{ id: "log-history-1", type: "logistics.instantiated", at: now }],
    counters: { shipment: 0, movement: 0, container: 0, response: 0 }, lastLedgerEventId: 0,
  };
}

export function ensureLogisticsState(state, now = Date.now()) {
  state.logistics ??= createInitialLogisticsState(now);
  state.logistics.institutions ??= {};
  state.logistics.institutions["the-ledge"] ??= { id: "the-ledge", archetypeId: "frontier-outpost", accounts: { operating: { balance: 4200, committed: 0 } }, inventories: { "iron-nickel": 0, silicate: 0 }, renewableResources: ["silicate"] };
  ["carrier:yard-hauler", "carrier:porch-runner"].forEach((institutionId) => {
    const institution = state.logistics.institutions?.[institutionId];
    if (!institution) return;
    institution.policies ??= {};
    institution.policies.transportation ??= { ...FIRST_REACH_CARRIER_POLICY };
    institution.repairOptions ??= FIRST_REACH_REPAIR_OPTIONS.map((entry) => ({ ...entry }));
  });
  state.logistics.movements ??= {};
  state.logistics.counters.movement ??= 0;
  Object.values(state.logistics.haulers ?? {}).forEach((hauler) => { hauler.activeMovementId ??= null; hauler.maintenanceRequested ??= false; });
  return state.logistics;
}

export function createLogisticsManager({ state, ships = [], destinations = [], now = () => Date.now() }) {
  const logistics = ensureLogisticsState(state, now());
  const shipById = new Map(ships.map((ship) => [ship.id, ship]));
  const destinationRecords = destinations.length > 0
    ? destinations
    : Array.from(new Set(FIRST_REACH_TRANSPORT_CONNECTIONS.flatMap((connection) => [connection.fromId, connection.toId]))).map((id) => ({ id }));
  const transportationNetwork = createTransportationNetwork({ destinations: destinationRecords, connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
  for (const [shipId, hauler] of Object.entries(logistics.haulers)) {
    const ship = shipById.get(shipId);
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    if (ship && shipInstitution) { ship.wear = shipInstitution.wear ?? 0; ship.wearIssueCount = shipInstitution.issueCount ?? 0; }
  }

  function update() {
    consumeEvents();
    Object.entries(logistics.haulers).forEach(([shipId, hauler]) => {
      const ship = shipById.get(shipId);
      if (!ship) return;
      const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
      shipInstitution.wear = Math.max(shipInstitution.wear ?? 0, ship.wear ?? 0);
      if (hauler.activeShipmentId && ship.operationalStatus === "seeking-work") {
        const shipment = logistics.shipments[hauler.activeShipmentId];
        if (shipment?.status === "loaded") ship.assignShipment({ shipmentId: shipment.id, destinationSiteId: shipment.destinationSiteId });
      }
      if (!hauler.activeShipmentId && !hauler.activeMovementId && hauler.status === "seeking-work" && ship.operationalStatus !== "maintenance") {
        if (!assignNpcShipment(shipId)) assignMaintenanceAction(shipId);
      }
    });
  }

  function consumeEvents() {
    for (const event of state.ledger.getEventsAfterId(logistics.lastLedgerEventId, { includeHidden: true })) {
      logistics.lastLedgerEventId = Math.max(logistics.lastLedgerEventId, event.id);
      if (event.type === "npc.routeCompleted" && event.payload.shipmentId) {
        if (logistics.shipments[event.payload.shipmentId]) completeNpcShipment(event.payload.npcId, event.payload.shipmentId, event.payload.siteId);
        else if (logistics.movements[event.payload.shipmentId]) completeMaintenanceMovement(event.payload.npcId, event.payload.shipmentId, event.payload.siteId);
      }
      if (event.type === "npc.wearIssue") recordWearIssue(event.payload);
      if (event.type === "sprc.repairCompleted") restoreAfterMaintenance(event.payload.haulerId);
    }
  }

  function assignNpcShipment(shipId) {
    const hauler = logistics.haulers[shipId];
    const ship = shipById.get(shipId);
    if (!ship || ship.dockedSiteId !== hauler.currentSiteId) return null;
    const carrier = logistics.institutions[hauler.carrierInstitutionId];
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    const candidates = STANDING_FREIGHT_TEMPLATES
      .filter((entry) => entry.originSiteId === hauler.currentSiteId && countActiveForTemplate(entry.id) < 1)
      .map((template) => ({ template, plan: evaluateTransportPlan({ network: transportationNetwork, originId: template.originSiteId, destinationId: template.destinationSiteId, payment: template.payment, currentWear: shipInstitution.wear ?? 0, policy: carrier.policies?.transportation, repairOptions: carrier.repairOptions }) }));
    candidates.filter((candidate) => !candidate.plan.eligible).forEach((candidate) => appendHistory("freight.declined", { shipId, templateId: candidate.template.id, reason: candidate.plan.reason }));
    const selected = candidates.filter((candidate) => candidate.plan.eligible).sort((a, b) => b.plan.score - a.plan.score)[0];
    if (!selected) return null;
    const { template, plan } = selected;
    const responseId = `LOG-RSP-${++logistics.counters.response}`;
    const policy = resolveInstitutionPolicy({ institutionPolicy: { protectedCash: 100 } });
    const capability = { id: "transport-freight", canAddress: () => true, propose: () => [{ capabilityId: "transport-freight", action: "accept-shipment", purpose: "earn-operating-revenue", estimatedCost: 0, rationale: `Carry available freight from ${template.originName} to ${template.destinationName}.` }] };
    const proposal = generateCapabilityResponses({ institution: carrier, needs: [{ id: `work:${shipId}`, status: "open", urgency: "routine", purpose: "earn-operating-revenue" }], capabilities: [capability], policy })[0];
    logistics.responses[responseId] = { ...createResponseRecord({ id: responseId, needIds: [`work:${shipId}`], capabilityId: proposal.capabilityId, action: proposal.action, rationale: proposal.rationale, priorityScore: proposal.priorityScore, selectedAt: now() }), status: "active" };
    const shipment = createShipment({ template, assigneeType: "npc", assigneeId: shipId, responseId, plan });
    if (!shipment) {
      logistics.responses[responseId].status = "blocked";
      logistics.responses[responseId].lastOutcome = { type: "execution-route-rejected", at: now() };
      appendHistory("freight.declined", { shipId, templateId: template.id, reason: "execution-route-rejected" });
    }
    return shipment;
  }

  function createShipment({ template, assigneeType, assigneeId, responseId = null, contractId = null, plan = null }) {
    const routeSites = plan?.route?.path?.map((id) => transportationNetwork.destinations[id]) ?? [];
    const assignedShip = assigneeType === "npc" ? shipById.get(assigneeId) : null;
    if (assigneeType === "npc" && (!assignedShip || (assignedShip.canAcceptRoute ? !assignedShip.canAcceptRoute(routeSites) : routeSites.length < 2))) return null;
    const issuer = logistics.institutions[template.issuerInstitutionId];
    const affordability = evaluateAffordability({ account: issuer.accounts.operating, policy: { protectedCash: 0 }, cost: template.payment });
    if (!affordability.affordable) return null;
    renewSourceUnit(template);
    const source = logistics.institutions[template.sourceInstitutionId];
    source.inventories[template.commodity] -= template.amount;
    issuer.accounts.operating.committed += template.payment;
    const id = `SHIP-${String(++logistics.counters.shipment).padStart(4, "0")}`;
    const containerId = `CONT-${String(++logistics.counters.container).padStart(4, "0")}`;
    const container = logistics.containers[containerId] = { id: containerId, shipmentId: id, commodity: template.commodity, quantity: template.amount, ownerInstitutionId: template.sourceInstitutionId, custodianInstitutionId: template.sourceInstitutionId, custody: [{ institutionId: template.sourceInstitutionId, action: "created", siteId: template.originSiteId, at: now() }] };
    const shipment = logistics.shipments[id] = { id, templateId: template.id, contractId, responseId, assigneeType, assigneeId, containerId, originSiteId: template.originSiteId, destinationSiteId: template.destinationSiteId, sourceInstitutionId: template.sourceInstitutionId, destinationInstitutionId: template.destinationInstitutionId, issuerInstitutionId: template.issuerInstitutionId, commodity: template.commodity, quantity: template.amount, payment: template.payment, committedPayment: template.payment, status: "assigned", createdAt: now(), loadedAt: null };
    appendHistory("shipment.assigned", { shipmentId: id, containerId, assigneeId, commodity: template.commodity });
    if (assigneeType === "npc") {
      loadShipment(shipment);
      const hauler = logistics.haulers[assigneeId];
      hauler.activeShipmentId = id; hauler.status = "transporting";
      assignedShip.assignShipment({ shipmentId: id, destinationSiteId: template.destinationSiteId, route: routeSites });
    }
    return shipment;
  }

  function assignMaintenanceAction(shipId) {
    const hauler = logistics.haulers[shipId];
    const ship = shipById.get(shipId);
    const carrier = logistics.institutions[hauler.carrierInstitutionId];
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    const policy = carrier.policies?.transportation ?? {};
    const threshold = (policy.maximumWear ?? Infinity) - (policy.minimumReturnMargin ?? 0);
    if ((shipInstitution.wear ?? 0) < threshold) return null;
    const repairRoutes = carrier.repairOptions
      .map((option) => ({ option, route: findTransportationRoute(transportationNetwork, hauler.currentSiteId, option.destinationId, policy.knownDestinationIds) }))
      .filter((entry) => entry.route)
      .sort((a, b) => (a.option.priority ?? 0) - (b.option.priority ?? 0) || a.route.distance - b.route.distance);
    const selected = repairRoutes[0];
    if (!selected) { appendHistory("maintenance.blocked", { shipId, reason: "no-reachable-maintenance" }); return null; }
    if (hauler.currentSiteId === selected.option.destinationId) return requestPreventiveMaintenance(shipId);
    const routeSites = selected.route.path.map((id) => transportationNetwork.destinations[id]);
    if (ship.canAcceptRoute ? !ship.canAcceptRoute(routeSites) : routeSites.length < 2) { appendHistory("maintenance.blocked", { shipId, reason: "execution-route-rejected" }); return null; }
    const id = `MOVE-${String(++logistics.counters.movement).padStart(4, "0")}`;
    logistics.movements[id] = { id, type: "service-return", shipId, originSiteId: hauler.currentSiteId, destinationSiteId: selected.option.destinationId, providerInstitutionId: selected.option.institutionId, status: "active", createdAt: now() };
    hauler.activeMovementId = id; hauler.status = "returning-maintenance";
    ship.assignShipment({ shipmentId: id, destinationSiteId: selected.option.destinationId, route: routeSites });
    appendHistory("maintenance.returnStarted", { movementId: id, shipId, destinationSiteId: selected.option.destinationId });
    return logistics.movements[id];
  }

  function completeMaintenanceMovement(shipId, movementId, siteId) {
    const movement = logistics.movements[movementId];
    if (!movement || movement.status !== "active" || movement.destinationSiteId !== siteId) return false;
    movement.status = "completed"; movement.completedAt = now();
    const hauler = logistics.haulers[shipId];
    hauler.currentSiteId = siteId; hauler.activeMovementId = null;
    shipById.get(shipId)?.clearShipment();
    appendHistory("maintenance.returnCompleted", { movementId, shipId, siteId });
    requestPreventiveMaintenance(shipId);
    return true;
  }

  function requestPreventiveMaintenance(shipId) {
    const hauler = logistics.haulers[shipId];
    if (hauler.maintenanceRequested) return null;
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    hauler.maintenanceRequested = true; hauler.status = "maintenance-required";
    const ship = shipById.get(shipId); if (ship) ship.operationalStatus = "maintenance";
    state.ledger.recordEvent("logistics.maintenanceRequired", { npcId: shipId, issueType: "preventive-service", wear: shipInstitution.wear ?? 0, issueCount: shipInstitution.issueCount ?? 0, causedByCarefulMode: false }, { visible: true });
    appendHistory("maintenance.requested", { shipId, issueType: "preventive-service" });
    return true;
  }

  function restoreAfterMaintenance(shipId) {
    const hauler = logistics.haulers[shipId];
    if (!hauler) return;
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    shipInstitution.wear = 0; shipInstitution.issueCount = 0;
    hauler.maintenanceRequested = false; hauler.status = "seeking-work";
    const ship = shipById.get(shipId);
    if (ship) { ship.wear = 0; ship.wearIssueCount = 0; ship.pendingWearIssue = null; ship.operationalStatus = "seeking-work"; }
    appendHistory("maintenance.restored", { shipId });
  }

  function completeNpcShipment(shipId, shipmentId, siteId) {
    const shipment = logistics.shipments[shipmentId];
    if (!shipment || shipment.status !== "loaded" || shipment.destinationSiteId !== siteId) return false;
    completeShipment(shipment);
    const hauler = logistics.haulers[shipId];
    hauler.currentSiteId = siteId; hauler.activeShipmentId = null; hauler.status = "seeking-work";
    shipById.get(shipId)?.clearShipment();
    return true;
  }

  function completeShipment(shipment) {
    const container = logistics.containers[shipment.containerId];
    transferCustody(container, shipment.destinationInstitutionId, "unloaded", shipment.destinationSiteId);
    container.ownerInstitutionId = shipment.destinationInstitutionId;
    logistics.institutions[shipment.destinationInstitutionId].inventories[shipment.commodity] = (logistics.institutions[shipment.destinationInstitutionId].inventories[shipment.commodity] ?? 0) + shipment.quantity;
    const issuer = logistics.institutions[shipment.issuerInstitutionId];
    issuer.accounts.operating.balance -= shipment.payment;
    issuer.accounts.operating.committed = Math.max(0, issuer.accounts.operating.committed - shipment.payment);
    shipment.committedPayment = 0; shipment.status = "delivered"; shipment.deliveredAt = now();
    if (shipment.assigneeType === "npc") {
      logistics.institutions[logistics.haulers[shipment.assigneeId].carrierInstitutionId].accounts.operating.balance += shipment.payment;
      shipById.get(shipment.assigneeId)?.queueCargoTransfer?.({ commodity: shipment.commodity, direction: "to-hub" });
    }
    appendHistory("shipment.delivered", { shipmentId: shipment.id, containerId: container.id, payment: shipment.payment });
  }

  function acceptPlayerContract(contract, playerInstitutionId) {
    const template = STANDING_FREIGHT_TEMPLATES.find((entry) => entry.id === contract.terms.standingFreightTemplateId);
    if (!template || countActiveForTemplate(template.id) >= 2) return null;
    return createShipment({ template, assigneeType: "player", assigneeId: playerInstitutionId, contractId: contract.id });
  }

  function loadPlayerContract(contractId) {
    const shipment = Object.values(logistics.shipments).find((entry) => entry.contractId === contractId && entry.status === "assigned");
    return shipment ? loadShipment(shipment) : false;
  }

  function deliverPlayerContract(contractId) {
    const shipment = Object.values(logistics.shipments).find((entry) => entry.contractId === contractId && entry.status === "loaded");
    if (!shipment) return false;
    completeShipment(shipment);
    return true;
  }

  function loadShipment(shipment) {
    if (shipment.status !== "assigned") return false;
    const custodianId = shipment.assigneeType === "npc" ? logistics.haulers[shipment.assigneeId].carrierInstitutionId : shipment.assigneeId;
    transferCustody(logistics.containers[shipment.containerId], custodianId, "loaded", shipment.originSiteId);
    if (shipment.assigneeType === "npc") shipById.get(shipment.assigneeId)?.queueCargoTransfer?.({ commodity: shipment.commodity, direction: "from-hub" });
    shipment.status = "loaded"; shipment.loadedAt = now();
    appendHistory("shipment.loaded", { shipmentId: shipment.id, containerId: shipment.containerId, assigneeId: shipment.assigneeId });
    return true;
  }

  function recordWearIssue(payload) {
    const hauler = logistics.haulers[payload.npcId];
    if (!hauler) return;
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    shipInstitution.wear = payload.wear; shipInstitution.issueCount = payload.issueCount;
    hauler.maintenanceRequested = true; hauler.status = "maintenance-required";
    shipById.get(payload.npcId).operationalStatus = "maintenance";
    appendHistory("ship.issue", payload);
    state.ledger.recordEvent("logistics.maintenanceRequired", payload, { visible: true });
  }

  function renewSourceUnit(template) {
    const source = logistics.institutions[template.sourceInstitutionId];
    if ((source.inventories[template.commodity] ?? 0) >= template.amount) return;
    if (!source.renewableResources.includes(template.commodity)) throw new Error(`Nonrenewable logistics inventory shortfall: ${template.sourceInstitutionId}.${template.commodity}`);
    source.inventories[template.commodity] += template.amount;
    appendHistory("inventory.renewed", { institutionId: source.id, commodity: template.commodity, quantity: template.amount });
  }

  function transferCustody(container, institutionId, action, siteId) { container.custodianInstitutionId = institutionId; container.custody.push({ institutionId, action, siteId, at: now() }); }
  function countActiveForTemplate(templateId) { return Object.values(logistics.shipments).filter((entry) => entry.templateId === templateId && ["assigned", "loaded"].includes(entry.status)).length; }
  function appendHistory(type, payload) { logistics.history.push({ id: `log-history-${logistics.history.length + 1}`, type, at: now(), ...payload }); }
  return { update, assignNpcShipment, acceptPlayerContract, loadPlayerContract, deliverPlayerContract, getState: () => logistics };
}

export function createStandingFreightJob(template, issuer = null) {
  return { id: `player-${template.id}`, type: "cargo-run", group: "standing-freight", jobKind: "logistics", repeatable: true, jobTier: "standing", jobTierLabel: "Standing Freight", title: `${template.commodityName} to ${template.destinationName}`, issuer: issuer ?? template.originName, summary: `Load one sealed ${template.commodityName} container at ${template.originName} and deliver it to ${template.destinationName}.`, terms: { commodity: template.commodity, commodityName: template.commodityName, amount: template.amount, originSiteId: template.originSiteId, originName: template.originName, destinationSiteId: template.destinationSiteId, destinationName: template.destinationName, standingFreightTemplateId: template.id }, reward: { credits: template.payment }, clauses: ["This is a standing regional freight offer shared with independent and institutional carriers.", "One real container is assigned on acceptance; custody and inventory transfer are recorded.", "Load at origin and unload at destination."], };
}

export function getStandingFreightJobsForSite(siteId, issuer = null) { return STANDING_FREIGHT_TEMPLATES.filter((template) => template.originSiteId === siteId).map((template) => createStandingFreightJob(template, issuer)); }
