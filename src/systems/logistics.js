import { createResponseRecord, evaluateAffordability, generateCapabilityResponses, resolveInstitutionPolicy } from "./institutionDecision.js?v=fresh-20260815-0001-50065bb";
import { evaluateSupplierAsk } from "./valuation.js?v=fresh-20260815-0001-50065bb";
import { getResourceTradeValue } from "./resourceDefinitions.js?v=fresh-20260815-0001-50065bb";
import { PROCUREMENT_STATUS, getProcurementFreightOffers, listOrders } from "./hubProcurement.js?v=fresh-20260815-0001-50065bb";
import { getServiceCost, getUnitCost, recordAcquisition, recordServiceCost } from "./costBasis.js?v=fresh-20260815-0001-50065bb";
import { getActorProtectedCash, getActorTraits } from "./actorConfig.js?v=fresh-20260815-0001-50065bb";
import { adaptShipment } from "./intentions.js?v=fresh-20260815-0001-50065bb";
import { buildPhysicalTransportationRoute, createTransportationNetwork, evaluateTransportPlan, findTransportationRoute } from "./transportationPlanning.js?v=fresh-20260815-0001-50065bb";
import { FIRST_REACH_TRANSPORT_CONNECTIONS } from "../content/transportation/firstReachNetwork.js?v=fresh-20260815-0001-50065bb";
import { BLOCKER_KIND, DIAGNOSTIC_STATE, createBlocker, recordBlocker, recordDecision, recordDiagnostic, retireDiagnostic } from "./diagnostics.js?v=fresh-20260815-0001-50065bb";
import { FIRST_REACH_SETTLEMENTS, settlementInstitutionRecords } from "../content/economy/firstReachSettlements.js?v=fresh-20260815-0001-50065bb";
import { FIRST_REACH_CARRIERS, carrierInstitutionRecords } from "../content/transportation/firstReachCarriers.js?v=fresh-20260815-0001-50065bb";
import { DEFAULT_RELATIONSHIP_WEIGHT, rankCarrierBids } from "./carrierSelection.js?v=fresh-20260815-0001-50065bb";
import { getRelationshipProjection } from "./relationshipProjections.js?v=fresh-20260815-0001-50065bb";
import { applyCraftUse, ensureCraftComponents, getWorstComponent, serviceCraftComponent } from "./componentCondition.js?v=fresh-20260815-0001-50065bb";
import { appendBoundedHistory } from "./boundedHistory.js?v=fresh-20260815-0001-50065bb";
import { issuerTreasuryRecords, seedIssuerTreasuries } from "./contractTreasury.js?v=fresh-20260815-0001-50065bb";

// Until a carrier has actually paid for a repair, assume this much for upkeep.
const FREIGHT_REFERENCE_SERVICE_COST = 180;
const FREIGHT_REPRICE_INTERVAL_MS = 45 * 1000;
const FREIGHT_REPRICE_MAX_CREDITS = 10_000;
const CARRIER_DEFAULT_TRAITS = Object.freeze({ caution: 0.5, growthBias: 0.3 });
const LEGACY_FREIGHT_WEAR_LIMIT = 6;
const FREIGHT_COMPONENTS = Object.freeze([
  Object.freeze({ id: "propulsion", label: "Propulsion", capabilityIds: ["travel"], initialWearFactor: 1 }),
  Object.freeze({ id: "steering", label: "Steering", capabilityIds: ["maneuver"], initialWearFactor: 0.55 }),
  Object.freeze({ id: "docking-gear", label: "Docking Gear", capabilityIds: ["dock"], initialWearFactor: 0.25 }),
  Object.freeze({ id: "hull", label: "Hull Structure", capabilityIds: ["carry-load"], initialWearFactor: 0.4 }),
  Object.freeze({ id: "cargo-handling", label: "Cargo Handling", capabilityIds: ["transfer-cargo"], initialWearFactor: 0.3 }),
]);

const FREIGHT_COMPONENT_ISSUES = Object.freeze({
  propulsion: "drive-fatigue",
  steering: "maneuvering-strain",
  "docking-gear": "control-fault",
  hull: "hull-fatigue",
  "cargo-handling": "control-fault",
});

function ensureFreightComponents(shipInstitution) {
  const initialLegacyWear = Math.max(0, shipInstitution.wear ?? 0);
  ensureCraftComponents(shipInstitution, FREIGHT_COMPONENTS, { initialWear: initialLegacyWear / LEGACY_FREIGHT_WEAR_LIMIT });
  projectFreightWear(shipInstitution);
  return shipInstitution.components;
}

function projectFreightWear(shipInstitution) {
  shipInstitution.wear = (shipInstitution.aggregateWear ?? 0) * LEGACY_FREIGHT_WEAR_LIMIT;
  return shipInstitution.wear;
}

function freightComponentForIssue(shipInstitution, issueType) {
  const authored = Object.entries(FREIGHT_COMPONENT_ISSUES).find(([, issue]) => issue === issueType)?.[0] ?? null;
  return authored && shipInstitution.components?.[authored] ? shipInstitution.components[authored] : getWorstComponent(shipInstitution);
}

// Rolling carrier fleet policy, the same shape as Cinder's hiring: a carrier
// buys a ship when its own are plainly all committed, and lays one up when it
// plainly is not needed. Both are SUSTAINED conditions, not single ticks.
const HAULER_HIRE_AFTER_BUSY_SECONDS = 60;
const HAULER_RELEASE_AFTER_IDLE_SECONDS = 120;
const HAULER_COST = 6000;
const MIN_HAULERS = 1;
const MAX_HAULERS_PER_CARRIER = 4;
const MAX_REGIONAL_HAULERS = 12;
const EMERGENCY_REPLACE_AFTER_SECONDS = 20;

const SITE_NAMES = Object.freeze({
  "yard-exchange": "Yard Exchange",
  "scrap-porch": "Scrap Porch",
  "the-ledge": "The Ledge",
  "blue-lantern": "Blue Lantern",
});

// The four authored freight routes that used to live here are gone.
//
// They ran whether or not anyone wanted the cargo: no buyer, no agreed sale, no
// downstream use. Every freight run is now generated by hubProcurement from a
// real purchase order — a buyer short of a family it may not mine, a supplier
// that agreed to sell, and goods that actually exist — so the offer board is
// derived rather than authored. See getProcurementFreightOffers.
//
// Kept as an empty export only so a save written before this still loads.
export const STANDING_FREIGHT_TEMPLATES = Object.freeze([]);

// Greedy, deterministic milk-run planner. It deliberately chooses only among
// cargo already aboard; accepting new work is a dockside decision elsewhere.
// Nearest-next-stop is modest rather than globally optimal, but it prevents
// registry order from becoming route policy and gives later planners one pure
// seam to replace.
export function buildFreightItinerary({ network, startId, destinationIds = [] }) {
  if (!network || !startId) return [];
  const pending = Array.from(new Set(destinationIds.filter((id) => id && id !== startId)));
  const route = [];
  let cursor = startId;
  while (pending.length > 0) {
    const choices = pending
      .map((destinationId) => ({ destinationId, plan: findTransportationRoute(network, cursor, destinationId) }))
      .filter((choice) => choice.plan)
      .sort((a, b) => a.plan.distance - b.plan.distance || a.destinationId.localeCompare(b.destinationId));
    if (choices.length === 0) return [];
    const selected = choices[0];
    const leg = buildPhysicalTransportationRoute(network, selected.plan);
    if (leg.length < 2) return [];
    route.push(...(route.length === 0 ? leg : leg.slice(1)));
    cursor = selected.destinationId;
    pending.splice(pending.indexOf(selected.destinationId), 1);
  }
  return route;
}

export function getNextFreightLeg(plannedRoute = [], destinationIds = []) {
  const stops = new Set(destinationIds);
  const nextStopIndex = plannedRoute.findIndex((site, index) => index > 0 && stops.has(site?.id));
  return nextStopIndex > 0 ? plannedRoute.slice(0, nextStopIndex + 1) : [];
}

export function createInitialLogisticsState(now = Date.now()) {
  // Hubs open holding a working stock of the family they MINE, and nothing of
  // the families they must import. A settlement that has been feeding a
  // population does not start with an empty warehouse, and starting every hub
  // at zero made all three post critical-urgency mining orders at once and
  // outbid Sal's repair work. Import families stay at zero on purpose: that
  // shortfall is the interdependence, and it is what procurement has to solve.
  const settlementRecords = Object.fromEntries(settlementInstitutionRecords().map((record) => [
    record.id,
    JSON.parse(JSON.stringify(record)),
  ]));
  const carrierRecords = Object.fromEntries(carrierInstitutionRecords().map((record) => [record.id, record]));
  // Contract issuers hold real money, and they exist from the first tick so the
  // economy sampler never sees one ARRIVE mid-run — an arrival that pays out
  // before the next sample reads as a residual the size of the payout.
  const issuerRecords = Object.fromEntries(issuerTreasuryRecords().map((record) => [record.id, record]));
  const haulers = Object.fromEntries(FIRST_REACH_CARRIERS.map((seed) => [seed.ship.physicalId, {
    shipInstitutionId: seed.ship.id,
    carrierInstitutionId: seed.institution.id,
    currentSiteId: seed.ship.homeSiteId,
    activeShipmentId: null,
    activeMovementId: null,
    maintenanceRequested: false,
    lastDecisionKey: null,
    status: "seeking-work",
  }]));
  return {
    version: 1,
    institutions: {
      ...settlementRecords,
      ...carrierRecords,
      ...issuerRecords,
      // The people who actually run the three settlements. Their traits are the
      // ONLY thing that makes the hubs price differently from one another —
      // there is no per-hub code anywhere.
      //
      // Read them through the two factors that consume them: `caution` widens
      // the buffer a buyer wants, so it is willingness to PAY UP when short;
      // `growthBias` sets a seller's margin, so it is how hard they price what
      // they dig. Bex runs a supplied depot and does neither. Ivry runs the
      // furthest outpost, closest to going without, so she pays rather than run
      // dry and charges hard for the silicate only she has.
      // Dara runs thin and hungry; Mara is the careful one. `evaluateCarrierAsk`
      // has always read the controller's traits — until now neither person had
      // any, so both carriers quoted identically off a module constant.
    },
    haulers,
    shipments: {}, movements: {}, containers: {}, responses: {}, history: [{ id: "log-history-1", type: "logistics.instantiated", at: now }],
    counters: { shipment: 0, movement: 0, container: 0, response: 0, transaction: 0 }, lastLedgerEventId: 0,
  };
}

export function ensureLogisticsState(state, now = Date.now()) {
  state.logistics ??= createInitialLogisticsState(now);
  // Contract issuers hold real money and must exist before the first economy
  // sample, or their arrival is mistaken for flow.
  seedIssuerTreasuries(state, { now });
  state.logistics.institutions ??= {};
  FIRST_REACH_SETTLEMENTS.forEach((seed) => {
    state.logistics.institutions[seed.institution.id] ??= JSON.parse(JSON.stringify(seed.institution));
  });
  FIRST_REACH_CARRIERS.forEach((seed) => {
    const institutionId = seed.institution.id;
    const institution = state.logistics.institutions[institutionId] ??= structuredClone(seed.institution);
    institution.policies ??= {};
    institution.policies.transportation ??= structuredClone(seed.policy);
    institution.repairOptions ??= structuredClone(seed.repairOptions);
    institution.name ??= seed.institution.name;
    institution.referenceId ??= seed.institution.referenceId;
    institution.accounts ??= structuredClone(seed.institution.accounts);
    institution.accounts.operating.id ??= seed.institution.accounts.operating.id;
    institution.accounts.operating.transactions ??= [];
    institution.policies.transportation.minimumOperatingCash ??= seed.policy.minimumOperatingCash;
    institution.homeSiteId ??= seed.ship.homeSiteId;
    institution.capitalLoans ??= [];
    state.logistics.institutions[seed.controller.id] ??= structuredClone(seed.controller);
    state.logistics.institutions[seed.ship.id] ??= structuredClone(seed.ship);
    ensureFreightComponents(state.logistics.institutions[seed.ship.id]);
    state.logistics.haulers ??= {};
    state.logistics.haulers[seed.ship.physicalId] ??= {
      shipInstitutionId: seed.ship.id, carrierInstitutionId: institutionId,
      currentSiteId: seed.ship.homeSiteId, activeShipmentId: null, activeMovementId: null,
      maintenanceRequested: false, lastDecisionKey: null, status: "seeking-work",
    };
  });

  // Hub controllers, for saves written before settlements had anyone running
  // them. Without these the three hubs fall back to one shared trait constant
  // and price identically, which is the thing this replaces.
  const hubControllers = Object.fromEntries(FIRST_REACH_SETTLEMENTS.map((seed) => [seed.institution.id, {
    ...seed.controller,
    siteId: seed.institution.siteId,
    hubName: seed.institution.name,
  }]));
  // Saves written when each settlement had its own decorative archetype id.
  // One `settlement` archetype now owns what all three actually share; what
  // makes them differ is their quartermaster, their rights and their shelf.
  const RETIRED_HUB_ARCHETYPES = ["trade-hub", "resource-outpost", "frontier-outpost"];
  Object.entries(hubControllers).forEach(([hubId, controller]) => {
    const hub = state.logistics.institutions[hubId];
    if (!hub) return;
    if (!hub.archetypeId || RETIRED_HUB_ARCHETYPES.includes(hub.archetypeId)) hub.archetypeId = "settlement";
    hub.siteId ??= controller.siteId;
    hub.name ??= controller.hubName;
    hub.controllerInstitutionId ??= controller.id;
    state.logistics.institutions[controller.id] ??= {
      id: controller.id, name: controller.name, archetypeId: "person",
      controls: [hubId], traits: controller.traits,
    };
  });
  state.logistics.movements ??= {};
  state.logistics.counters.movement ??= 0;
  state.logistics.counters.transaction ??= 0;
  Object.values(state.logistics.haulers ?? {}).forEach((hauler) => {
    hauler.activeMovementId ??= null;
    hauler.activeShipmentIds ??= hauler.activeShipmentId ? [hauler.activeShipmentId] : [];
    hauler.activeShipmentId = hauler.activeShipmentIds[0] ?? null;
    hauler.maintenanceRequested ??= false;
    hauler.lastDecisionKey ??= null;
  });
  return state.logistics;
}

export function createLogisticsManager({ state, ships = [], destinations = [], now = () => Date.now(), onProcurementDelivered = null, onProcurementShipped = null, commissionHauler = null, decommissionHauler = null }) {
  const logistics = ensureLogisticsState(state, now());
  const shipById = new Map(ships.map((ship) => [ship.id, ship]));
  const destinationRecords = destinations.length > 0
    ? destinations
    : Array.from(new Set(FIRST_REACH_TRANSPORT_CONNECTIONS.flatMap((connection) => [connection.fromId, connection.toId]))).map((id) => ({ id }));
  const transportationNetwork = createTransportationNetwork({ destinations: destinationRecords, connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
  for (const [shipId, hauler] of Object.entries(logistics.haulers)) {
    const ship = shipById.get(shipId);
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    if (shipInstitution) ensureFreightComponents(shipInstitution);
    if (ship && shipInstitution) {
      ship.wear = projectFreightWear(shipInstitution);
      ship.wearIssueCount = shipInstitution.issueCount ?? 0;
      applyFreightConditionEffects(ship, shipInstitution);
    }
  }

  // ── The tick, in phases ─────────────────────────────────────────────────
  //
  // Every step keeps the exact position it held before; the split only states
  // the structure that was already there. See `worldClock`.
  //
  // There is deliberately NO settle phase. A delivery lands as a
  // `npc.routeCompleted` event raised by the ship movement running in the game
  // loop, so logistics learns about arrivals by OBSERVING them like any other
  // outside fact — not by settling its own decisions. Inventing an empty settle
  // step to make the set look complete would be a label with nothing behind it.

  // What has become true since last tick: shipments delivered, wear reported,
  // damage taken, repairs finished.
  //
  // Pruning stays ahead of the event drain, as it always has. A shipment
  // delivered this tick must survive to be consumed; trimming after the drain
  // would let a just-finished run be discarded before anything read it.
  function observe() {
    pruneCompletedOperations();
    consumeEvents();
  }

  function decide() {
    assessCarrierFleet();
    // Price against bids made from the current fleet state, not whichever ask
    // happened to be recorded on a previous assignment pass. If the issuer
    // moves, rank once more at the new rate so the contract can clear now.
    let freightWinners = selectFreightWinners({ recordAsks: true });
    if (repriceUnclaimedFreight()) {
      freightWinners = selectFreightWinners({ recordAsks: true });
    }
    Object.entries(logistics.haulers).forEach(([shipId, hauler]) => {
      const ship = shipById.get(shipId);
      if (!ship) return;
      const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
      synchronizeFreightUse(ship, shipInstitution, hauler);
      if (hauler.activeShipmentId && ship.operationalStatus === "seeking-work") {
        (hauler.activeShipmentIds ?? [hauler.activeShipmentId]).forEach((shipmentId) => {
          const shipment = logistics.shipments[shipmentId];
          if (shipment?.status === "loaded") ship.assignShipment({
            shipmentId: shipment.id,
            originSiteId: shipment.originSiteId,
            destinationSiteId: shipment.destinationSiteId,
            quantity: shipment.quantity,
          });
        });
      }
      if (hauler.activeShipmentId
        && !hauler.activeMovementId
        && ship.dockedSiteId === hauler.currentSiteId
        && ship.operationalStatus === "awaiting-assignment") {
        // A stop is the only reconsideration point. Deliveries have already
        // freed their space in consumeEvents(); use it for local pickups, then
        // freeze one itinerary until the next dock.
        assignNpcShipment(shipId, freightWinners, { extendPortfolio: true });
        dispatchShipmentPortfolio(shipId);
      }
      if (!hauler.activeShipmentId && !hauler.activeMovementId && hauler.status === "seeking-work" && ship.operationalStatus !== "maintenance") {
        if (hauler.combatMaintenanceIssue) assignMaintenanceAction(shipId, { force: true, issueType: hauler.combatMaintenanceIssue });
        else if (!assignNpcShipment(shipId, freightWinners)) assignMaintenanceAction(shipId);
      }
    });
  }

  // One whole tick. The clock drives the phases separately; every test and the
  // boot sequence drives this.
  function update() {
    observe();
    decide();
  }

  function pruneCompletedOperations() {
    const terminal = Object.values(logistics.shipments)
      .filter((shipment) => ["delivered", "cancelled", "expired"].includes(shipment.status) && !shipment.contractId)
      .sort((a, b) => (a.deliveredAt ?? a.createdAt ?? 0) - (b.deliveredAt ?? b.createdAt ?? 0));
    const excess = Math.max(0, terminal.length - 400);
    for (const shipment of terminal.slice(0, excess)) {
      delete logistics.containers[shipment.containerId];
      delete logistics.shipments[shipment.id];
    }
  }

  function consumeEvents() {
    for (const event of state.ledger.getEventsAfterId(logistics.lastLedgerEventId, { includeHidden: true })) {
      logistics.lastLedgerEventId = Math.max(logistics.lastLedgerEventId, event.id);
      if (event.type === "npc.routeCompleted" && event.payload.shipmentId) {
        if (logistics.shipments[event.payload.shipmentId]) completeNpcShipmentPortfolio(event.payload.npcId, event.payload.siteId);
        else if (logistics.movements[event.payload.shipmentId]) completeMovement(event.payload.npcId, event.payload.shipmentId, event.payload.siteId);
      }
      if (event.type === "npc.wearIssue") recordWearIssue(event.payload);
      if (event.type === "incursion.npcHit") recordCombatDamage(event.payload);
      if (event.type === "sprc.repairCompleted") {
        settleRepairInvoice(event.payload.haulerId, event.payload.serviceRevenue ?? 180, event.payload.repairOrderId);
        restoreAfterMaintenance(event.payload.haulerId, event.payload.componentId, event.payload.repairOrderId);
      }
    }
  }

  // ── Supplier-side freight pricing ────────────────────────────────────────
  // The rate actually on offer for a template: the authored base until an
  // issuer raises it to attract a carrier.
  function getFreightRate(template) {
    logistics.postedFreightRates ??= {};
    return logistics.postedFreightRates[template.id] ?? template.payment;
  }

  // What this run costs the carrier, and therefore what it must be paid.
  // Maintenance is valued at what repairs CURRENTLY cost this carrier, so a
  // repair-price rise flows straight into freight asks.
  // How much a carrier lets an established relationship outweigh raw money when
  // choosing between runs. Neutral caution reproduces the flat weight this
  // module used for everybody, so the baseline is unchanged and only the spread
  // is new. See `carrierSelection` for why the number rides on the bid.
  function carrierRelationshipWeight(carrierInstitutionId) {
    const caution = getActorTraits(state, carrierInstitutionId)?.caution;
    const scaled = Number.isFinite(caution) ? caution : 0.5;
    return DEFAULT_RELATIONSHIP_WEIGHT * (0.5 + scaled);
  }

  function isDueForMaintenance(carrier, shipInstitution) {
    const policy = carrier.policies?.transportation ?? {};
    const threshold = (policy.maximumWear ?? Infinity) - (policy.minimumReturnMargin ?? 0);
    return (shipInstitution?.wear ?? 0) >= threshold;
  }

  function repositionDistance(fromSiteId, toSiteId) {
    if (!fromSiteId || fromSiteId === toSiteId) return 0;
    const route = findTransportationRoute(transportationNetwork, fromSiteId, toSiteId);
    return route?.distance ?? 0;
  }

  function canReposition(fromSiteId, toSiteId) {
    return repositionDistance(fromSiteId, toSiteId) > 0;
  }

  function evaluateCarrierAsk({ template, plan, carrier, currentWear = 0, offeredPrice, repositionFrom = null }) {
    const distance = (plan?.route?.distance ?? 0) + repositionDistance(repositionFrom, template.originSiteId);
    const policy = carrier.policies?.transportation ?? {};
    const serviceCost = getServiceCost(state, carrier.id, "maintenance", FREIGHT_REFERENCE_SERVICE_COST);
    const maxWear = policy.maximumWear ?? 6;
    // Charge only the wear THIS run adds (plan.projectedWear is cumulative and
    // includes the ship's existing wear — billing that to one trip would make
    // every worn carrier refuse all work).
    const incrementalWear = Math.max(0, (plan?.projectedWear ?? currentWear) - currentWear);
    return evaluateSupplierAsk({
      workId: template.id,
      costComponents: {
        travel: distance * (policy.operatingCostPerDistance ?? 0.01),
        // Amortize: this run consumes incrementalWear/maxWear of a service cycle.
        maintenance: maxWear > 0 ? (incrementalWear / maxWear) * serviceCost : 0,
        time: 0,
      },
      offeredPrice,
      traits: getActorTraits(state, carrier.id, CARRIER_DEFAULT_TRAITS),
      policy,
      relationship: getRelationshipProjection(state, { fromId: carrier.id, toId: template.issuerInstitutionId }),
    });
  }

  function recordFreightAsk(template, ask) {
    logistics.freightAsks ??= {};
    const quote = {
      templateId: template.id,
      ask: ask.recommendedPrice,
      floor: ask.minAcceptablePrice,
      costToServe: Math.round(ask.metrics.costToServe),
      acceptable: ask.acceptable,
      reasons: ask.reasons,
      at: now(),
    };
    const current = logistics.freightAsks[template.id];
    // The buyer needs the cheapest carrier that can actually serve the lane,
    // not whichever ship happened to be evaluated last.
    if (!current || quote.ask < current.ask) logistics.freightAsks[template.id] = quote;
  }

  // A hub whose freight nobody will carry raises what it pays — bounded,
  // throttled, and logged, mirroring how Sal reprices unfilled purchase orders.
  function repriceUnclaimedFreight() {
    let changed = false;
    logistics.postedFreightRates ??= {};
    getProcurementFreightOffers(state).forEach((template) => {
      const ask = logistics.freightAsks?.[template.id];
      if (!ask || ask.acceptable) return;
      if (countActiveForTemplate(template.id) > 0) return;
      const lastRepricedAt = logistics.freightRepricedAt?.[template.id] ?? 0;
      if (now() - lastRepricedAt < FREIGHT_REPRICE_INTERVAL_MS) return;

      const current = getFreightRate(template);
      const next = Math.min(ask.ask, FREIGHT_REPRICE_MAX_CREDITS);
      logistics.freightRepricedAt ??= {};
      logistics.freightRepricedAt[template.id] = now();
      if (next <= current) return;

      const issuer = logistics.institutions[template.issuerInstitutionId];
      const funding = evaluateAffordability({ account: issuer.accounts.operating, policy: { protectedCash: 0 }, cost: next });
      if (!funding.affordable) {
        appendHistory("freight.repriceDeferred", { templateId: template.id, wanted: next, reason: "issuer-cannot-fund" });
        return;
      }
      logistics.postedFreightRates[template.id] = next;
      changed = true;
      appendHistory("freight.repriced", { templateId: template.id, previousPayment: current, payment: next, carrierCost: ask.costToServe });
      state.ledger.recordEvent("institution.freightRepriced", {
        institutionId: template.issuerInstitutionId, templateId: template.id, previousPayment: current, payment: next,
        carrierCost: ask.costToServe,
        reasons: [`No carrier would run ${template.originName}→${template.destinationName} at ${current} cr.`, ...ask.reasons],
      }, { visible: true, message: `${siteName(template.destinationSiteId)} raises ${template.commodityName} freight to ${next} cr — carriers cannot cover ${ask.costToServe} cr of cost at ${current}.` });
    });
    return changed;
  }

  function synchronizeFreightUse(ship, shipInstitution, hauler) {
    ensureFreightComponents(shipInstitution);
    const projectedLegacyWear = projectFreightWear(shipInstitution);
    if (!ship) return projectedLegacyWear;
    const legacyDelta = Math.max(0, (ship.wear ?? projectedLegacyWear) - projectedLegacyWear);
    if (legacyDelta > 0) {
      const normalizedDelta = legacyDelta / LEGACY_FREIGHT_WEAR_LIMIT;
      applyCraftUse(shipInstitution, {
        propulsion: normalizedDelta,
        steering: normalizedDelta * (ship.isCarefulMode ? 0.9 : 0.3),
        hull: normalizedDelta * (hauler.activeShipmentId ? 0.35 : 0.18),
        "cargo-handling": normalizedDelta * (hauler.activeShipmentId ? 0.25 : 0.08),
      }, { at: now() });
    }
    ship.wear = projectFreightWear(shipInstitution);
    applyFreightConditionEffects(ship, shipInstitution);
  }

  function applyFreightConditionEffects(ship, shipInstitution) {
    const propulsionStage = shipInstitution.components?.propulsion?.condition?.stage ?? "healthy";
    ship.conditionSpeedMultiplier = propulsionStage === "failed" ? 0
      : propulsionStage === "emergency" ? 0.72
        : propulsionStage === "degraded" ? 0.9 : 1;
  }

  function applyFreightTaskUse(shipId, usage) {
    const hauler = logistics.haulers[shipId];
    const shipInstitution = hauler ? logistics.institutions[hauler.shipInstitutionId] : null;
    if (!shipInstitution) return;
    ensureFreightComponents(shipInstitution);
    applyCraftUse(shipInstitution, usage, { at: now() });
    const ship = shipById.get(shipId);
    if (ship) {
      ship.wear = projectFreightWear(shipInstitution);
      applyFreightConditionEffects(ship, shipInstitution);
    }
  }

  // Diagnostics for an idle carrier. The chain matters most here: "no cargo"
  // is usually caused by a source hub being empty, which is caused by whoever
  // was supposed to supply it.
  function publishCarrierDiagnosticBlocker(shipId, hauler, candidates, declined) {
    const context = getCarrierContext(shipId);
    const site = hauler.currentSiteId;
    const localTemplates = getProcurementFreightOffers(state).filter((template) => template.originSiteId === site);
    const outOfStock = localTemplates.filter((template) => (logistics.institutions[template.sourceInstitutionId]?.inventories?.[template.commodity] ?? 0) < template.amount);

    const causes = [];
    // Nothing on the board is now usually caused by a supplier that has agreed
    // to sell and not yet dug the material up. Name it, so the chain continues
    // into that hub's own record rather than stopping at "no cargo".
    if (localTemplates.length === 0) {
      listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED }).forEach((order) => {
        const held = logistics.institutions[order.supplierInstitutionId]?.inventories?.[order.resourceId] ?? 0;
        causes.push({
          kind: BLOCKER_KIND.SOURCE_OUT_OF_STOCK,
          summary: `${order.supplierInstitutionId} owes ${order.units} ${order.resourceId.replaceAll("-", " ")} on ${order.id} and holds ${held}`,
          subjectId: order.supplierInstitutionId,
          objectId: order.id,
          causedBy: [{ actorId: order.supplierInstitutionId }],
        });
      });
    }
    outOfStock.forEach((template) => {
      // Who is supposed to be filling that shelf? Point at the supplier so the
      // chain continues into their own reasoning.
      const supplierId = state.miningOperation?.institution?.id ?? null;
      causes.push({
        kind: BLOCKER_KIND.SOURCE_OUT_OF_STOCK,
        summary: `${siteName(template.originSiteId)} has no ${template.commodityName} to ship (${template.sourceInstitutionId} holds ${logistics.institutions[template.sourceInstitutionId]?.inventories?.[template.commodity] ?? 0})`,
        subjectId: template.sourceInstitutionId,
        objectId: template.id,
        waitingFor: `${template.commodityName} to arrive in local supply`,
        wakeOn: ["inventory-delivered"],
        causedBy: supplierId ? [{ actorId: supplierId, note: `no ${template.commodityName} has been delivered` }] : [],
        at: now(),
      });
    });
    candidates.filter((candidate) => !candidate.plan.eligible && candidate.plan.reason === "below-carrier-cost").forEach((candidate) => {
      causes.push({
        kind: BLOCKER_KIND.BELOW_COST,
        summary: `${candidate.template.id} pays ${candidate.rate} but costs ${Math.round(candidate.ask?.metrics?.costToServe ?? 0)} to run`,
        subjectId: shipId,
        objectId: candidate.template.id,
        waitingFor: `a rate of at least ${candidate.ask?.minAcceptablePrice ?? "cost"}`,
        wakeOn: ["freight-repriced"],
        at: now(),
      });
    });
    candidates.filter((candidate) => !candidate.plan.eligible && candidate.plan.reason === "payer-cannot-fund").forEach((candidate) => {
      causes.push({
        kind: BLOCKER_KIND.PAYER_CANNOT_FUND,
        summary: `${candidate.template.issuerInstitutionId} cannot fund ${candidate.rate} cr for ${candidate.template.id}`,
        subjectId: candidate.template.issuerInstitutionId,
        objectId: candidate.template.id,
        waitingFor: "the issuer to hold enough cash",
        wakeOn: ["issuer-income"],
        at: now(),
      });
    });

    recordDiagnostic(state, shipId, {
      actorName: context.carrierName ?? shipId,
      actorKind: "ship",
      controllerId: hauler.carrierInstitutionId,
      locationSiteId: site,
      intention: null,
    }, now());
    const rejectionCounts = candidates.reduce((counts, candidate) => {
      if (!candidate.plan.eligible) counts[candidate.plan.reason] = (counts[candidate.plan.reason] ?? 0) + 1;
      return counts;
    }, {});
    const rejectionSummary = Object.entries(rejectionCounts)
      .map(([reason, count]) => `${count} ${formatReason(reason)}`)
      .join(", ");
    recordBlocker(state, shipId, createBlocker({
      kind: BLOCKER_KIND.NO_ELIGIBLE_CARGO,
      summary: `${context.pilotName ?? shipId} is docked at ${siteName(site)} with no eligible freight${rejectionSummary ? ` (${rejectionSummary})` : ""}`,
      subjectId: shipId,
      objectId: site,
      waitingFor: outOfStock.length ? "cargo to appear in local supply" : "an offer that clears its cost",
      wakeOn: ["inventory-delivered", "freight-repriced", "offer-posted"],
      causedBy: causes,
      detail: { evaluated: candidates.length, declinedReason: declined?.plan.reason ?? "none-offered", rejectionCounts },
      at: now(),
    }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
  }

  function buildCarrierCandidates(shipId, { recordAsks = false, allowPortfolioExtension = false, includeRemoteObservation = false } = {}) {
    const hauler = logistics.haulers[shipId];
    const ship = shipById.get(shipId);
    const extending = Boolean(allowPortfolioExtension && hauler.activeShipmentId);
    if (!ship || ship.dockedSiteId !== hauler.currentSiteId || hauler.activeMovementId || ship.operationalStatus === "maintenance") return [];
    if (!extending && (hauler.activeShipmentId || hauler.status !== "seeking-work")) return [];
    const carrier = logistics.institutions[hauler.carrierInstitutionId];
    const account = carrier.accounts.operating;
    if (account.balance < 0) return [];
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    // Every run on the board is backed by a purchase order whose goods exist.
    const offered = getProcurementFreightOffers(state);
    const hasLoadableLocalWork = offered.some((entry) => entry.originSiteId === hauler.currentSiteId
      && countActiveForTemplate(entry.id) < 1 && availableToLoad(entry) >= entry.amount);
    const candidates = offered
      // Remote postings may inform travel, but accepting work is a physical
      // market action. Do not reserve, purchase, or load until docked there.
      .filter((entry) => includeRemoteObservation || entry.originSiteId === hauler.currentSiteId)
      .filter((entry) => countActiveForTemplate(entry.id) < 1)
      .filter((entry) => availableToLoad(entry) >= entry.amount)
      .filter((entry) => !extending || (entry.originSiteId === hauler.currentSiteId
        && ship.canAcceptShipment?.({ originSiteId: entry.originSiteId, destinationSiteId: entry.destinationSiteId, quantity: entry.amount })))
      // A hauler may take a contract from either end of the relationship: if it
      // is not already at the pickup, it flies there empty first and the cost of
      // that leg is priced into what it will accept.
      .map((template) => ({ template, repositionFrom: template.originSiteId === hauler.currentSiteId ? null : hauler.currentSiteId }))
      // Take what is in front of you. A hauler only flies to the far end of a
      // relationship when there is nothing loadable where it already is, and
      // never when it is due for service — reaching further is for healthy
      // hulls. This is what lets either end of a trade lane be served without
      // changing how a carrier behaves when work is already local.
      .filter(({ template, repositionFrom }) => {
        if (!repositionFrom) return true;
        if (!includeRemoteObservation || hasLoadableLocalWork || isDueForMaintenance(carrier, shipInstitution)) return false;
        return canReposition(hauler.currentSiteId, template.originSiteId);
      })
      .map(({ template, repositionFrom }) => {
        const rate = getFreightRate(template);
        const plan = evaluateTransportPlan({ network: transportationNetwork, originId: template.originSiteId, destinationId: template.destinationSiteId, payment: rate, currentWear: shipInstitution.wear ?? 0, policy: carrier.policies?.transportation, repairOptions: carrier.repairOptions });
        const issuer = logistics.institutions[template.issuerInstitutionId];
        const funding = evaluateAffordability({ account: issuer.accounts.operating, policy: { protectedCash: 0 }, cost: rate });
        // Supplier-side pricing: the carrier totals what the run costs it —
        // including the maintenance it will owe at CURRENT repair prices — and
        // refuses work that does not clear that cost.
        const ask = evaluateCarrierAsk({ template, plan, carrier, currentWear: shipInstitution.wear ?? 0, offeredPrice: rate, repositionFrom });
        if (recordAsks) recordFreightAsk(template, ask);
        let resolved = plan;
        if (plan.eligible && !funding.affordable) resolved = { ...plan, eligible: false, reason: "payer-cannot-fund", funding };
        else if (plan.eligible && !ask.acceptable) resolved = { ...plan, eligible: false, reason: "below-carrier-cost", ask };
        return { template, plan: resolved, ask, rate, repositionFrom };
      });
    return candidates;
  }

  function assignMarketReposition(shipId) {
    const hauler = logistics.haulers[shipId];
    const ship = shipById.get(shipId);
    const carrier = logistics.institutions[hauler?.carrierInstitutionId];
    const shipInstitution = logistics.institutions[hauler?.shipInstitutionId];
    if (!hauler || !ship || ship.dockedSiteId !== hauler.currentSiteId || hauler.activeShipmentId
      || hauler.activeMovementId || hauler.status !== "seeking-work" || isDueForMaintenance(carrier, shipInstitution)) return null;

    const choices = getProcurementFreightOffers(state)
      .filter((offer) => offer.originSiteId !== hauler.currentSiteId)
      .filter((offer) => countActiveForTemplate(offer.id) < 1 && availableToLoad(offer) >= offer.amount)
      .map((template) => {
        const approach = findTransportationRoute(transportationNetwork, hauler.currentSiteId, template.originSiteId, carrier.policies?.transportation?.knownDestinationIds);
        const plan = evaluateTransportPlan({ network: transportationNetwork, originId: template.originSiteId, destinationId: template.destinationSiteId, payment: getFreightRate(template), currentWear: shipInstitution.wear ?? 0, policy: carrier.policies?.transportation, repairOptions: carrier.repairOptions });
        const ask = evaluateCarrierAsk({ template, plan, carrier, currentWear: shipInstitution.wear ?? 0, offeredPrice: getFreightRate(template), repositionFrom: hauler.currentSiteId });
        return { template, approach, plan, ask };
      })
      .filter(({ approach, plan, ask }) => approach?.path?.length > 1 && plan.eligible && ask.acceptable)
      .sort((a, b) => b.plan.score - a.plan.score || a.approach.distance - b.approach.distance || a.template.id.localeCompare(b.template.id));
    const selected = choices[0];
    if (!selected) return null;
    const routeSites = buildPhysicalTransportationRoute(transportationNetwork, selected.approach);
    if (ship.canAcceptRoute ? !ship.canAcceptRoute(routeSites) : routeSites.length < 2) return null;

    const id = `MOVE-${String(++logistics.counters.movement).padStart(4, "0")}`;
    logistics.movements[id] = {
      id, type: "market-reposition", shipId, originSiteId: hauler.currentSiteId,
      destinationSiteId: selected.template.originSiteId, observedOfferId: selected.template.id,
      status: "active", createdAt: now(),
    };
    hauler.activeMovementId = id;
    hauler.status = "seeking-market";
    ship.assignShipment({ shipmentId: id, destinationSiteId: selected.template.originSiteId, route: routeSites });
    appendHistory("market.repositionStarted", { movementId: id, shipId, destinationSiteId: selected.template.originSiteId, observedOfferId: selected.template.id });
    publishCarrierEvent("carrier.marketReposition", shipId, {
      movementId: id, destinationSiteId: selected.template.originSiteId, observedOfferId: selected.template.id,
    }, `${getCarrierContext(shipId).pilotName} saw work posted at ${siteName(selected.template.originSiteId)} and is traveling there to seek it; the contract is not reserved.`);
    return logistics.movements[id];
  }

  function selectFreightWinners({ recordAsks = false } = {}) {
    if (recordAsks) logistics.freightAsks = {};
    const bidsByTemplate = new Map();
    Object.keys(logistics.haulers).sort().forEach((shipId) => {
      const hauler = logistics.haulers[shipId];
      const carrier = logistics.institutions[hauler.carrierInstitutionId];
      const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
      const ship = shipById.get(shipId);
      const canExtendPortfolio = Boolean(hauler.activeShipmentId
        && ship?.dockedSiteId === hauler.currentSiteId
        && ship?.remainingCargoCapacity > 0
        && ship?.operationalStatus === "awaiting-assignment");
      buildCarrierCandidates(shipId, { recordAsks, allowPortfolioExtension: canExtendPortfolio, includeRemoteObservation: true }).forEach((candidate) => {
        const bid = {
          offerId: candidate.template.id,
          carrierId: carrier.id,
          shipId,
          eligible: candidate.plan.eligible,
          committed: Boolean(hauler.activeMovementId || (hauler.activeShipmentId && !canExtendPortfolio)),
          offeredPrice: candidate.rate,
          askingPrice: candidate.ask.recommendedPrice,
          costToServe: candidate.ask.metrics.costToServe,
          currentWear: shipInstitution.wear ?? 0,
          repositionDistance: repositionDistance(candidate.repositionFrom, candidate.template.originSiteId),
          relationship: getRelationshipProjection(state, { fromId: candidate.template.issuerInstitutionId, toId: carrier.id }),
          // What a trusted issuer is worth to THIS carrier on top of the money.
          // Caution buys preference for the counterparty already known, the same
          // mapping `workQueue` uses for a service business choosing a customer.
          // A carrier at the neutral middle values it exactly as everybody did
          // before this was a per-carrier judgement.
          relationshipWeight: carrierRelationshipWeight(carrier.id),
        };
        const list = bidsByTemplate.get(candidate.template.id) ?? [];
        list.push(bid);
        bidsByTemplate.set(candidate.template.id, list);
      });
    });
    const winners = new Map();
    logistics.carrierBidDiagnostics ??= {};
    bidsByTemplate.forEach((bids, templateId) => {
      const ranked = rankCarrierBids(bids);
      const winner = ranked.find((bid) => Number.isFinite(bid.selectionScore)) ?? null;
      logistics.carrierBidDiagnostics[templateId] = { templateId, bids: ranked.map((bid) => ({ ...bid, relationship: bid.relationship ? { id: bid.relationship.id } : null })), winnerShipId: winner?.shipId ?? null, at: now() };
      if (winner) winners.set(templateId, winner.shipId);
    });
    return winners;
  }

  function assignNpcShipment(shipId, freightWinners = null, { extendPortfolio = false } = {}) {
    const hauler = logistics.haulers[shipId];
    const ship = shipById.get(shipId);
    if (!ship) return null;
    if (ship.dockedSiteId !== hauler.currentSiteId) {
      publishDecisionOnce(shipId, `waiting-dock:${hauler.currentSiteId}:${ship.dockedSiteId ?? "none"}`, `${getCarrierContext(shipId).pilotName} is holding outside ${siteName(hauler.currentSiteId)}; a freight contract cannot be accepted until the hauler docks.`, { reason: "not-docked", currentSiteId: hauler.currentSiteId, dockedSiteId: ship.dockedSiteId ?? null });
      return null;
    }
    const carrier = logistics.institutions[hauler.carrierInstitutionId];
    const account = carrier.accounts.operating;
    if (account.balance < 0) {
      publishDecisionOnce(shipId, `insolvent:${account.balance}`, `${getCarrierContext(shipId).carrierName} cannot accept freight: account ${account.id} is overdrawn at ${account.balance} cr.`, { reason: "insolvent", balance: account.balance });
      return null;
    }
    const candidates = buildCarrierCandidates(shipId, { recordAsks: true, allowPortfolioExtension: extendPortfolio });
    candidates.filter((candidate) => !candidate.plan.eligible).forEach((candidate) => appendHistory("freight.declined", { shipId, templateId: candidate.template.id, reason: candidate.plan.reason }));
    const selected = candidates.filter((candidate) => candidate.plan.eligible)
      .filter((candidate) => !freightWinners || freightWinners.get(candidate.template.id) === shipId)
      .sort((a, b) => b.plan.score - a.plan.score || a.template.id.localeCompare(b.template.id))[0];
    if (!selected) {
      // An intermediate pickup is optional. Existing cargo still gives this
      // carrier useful work, so the absence of an extra local load is not a
      // blocker and should not replace its active itinerary diagnostics.
      if (extendPortfolio && ship.shipments?.length) return null;
      const observedCandidates = candidates.length ? candidates : buildCarrierCandidates(shipId, { includeRemoteObservation: true });
      if (observedCandidates.some((candidate) => candidate.plan.reason === "maintenance-policy")) {
        return assignMaintenanceAction(shipId, { force: true });
      }
      const marketMovement = assignMarketReposition(shipId);
      if (marketMovement) return marketMovement;
      const declined = candidates.find((candidate) => !candidate.plan.eligible);
      publishCarrierDiagnosticBlocker(shipId, hauler, candidates, declined);
      publishDecisionOnce(shipId, `no-work:${hauler.currentSiteId}:${declined?.plan.reason ?? "none-offered"}`, `${getCarrierContext(shipId).pilotName} is docked at ${siteName(hauler.currentSiteId)} but found no eligible freight${declined ? ` (${formatReason(declined.plan.reason)})` : ""}; checking service needs.`, { reason: declined?.plan.reason ?? "no-offer", currentSiteId: hauler.currentSiteId });
      return null;
    }
    const { template, plan } = selected;
    const responseId = `LOG-RSP-${++logistics.counters.response}`;
    const policy = resolveInstitutionPolicy({ institutionPolicy: { protectedCash: 100 } });
    const capability = { id: "transport-freight", canAddress: () => true, propose: () => [{ capabilityId: "transport-freight", action: "accept-shipment", purpose: "earn-operating-revenue", estimatedCost: 0, rationale: `Carry available freight from ${template.originName} to ${template.destinationName}.` }] };
    const proposal = generateCapabilityResponses({ institution: carrier, needs: [{ id: `work:${shipId}`, status: "open", urgency: "routine", purpose: "earn-operating-revenue" }], capabilities: [capability], policy })[0];
    logistics.responses[responseId] = { ...createResponseRecord({ id: responseId, needIds: [`work:${shipId}`], capabilityId: proposal.capabilityId, action: proposal.action, rationale: proposal.rationale, priorityScore: proposal.priorityScore, selectedAt: now() }), status: "active" };
    const shipment = createShipment({ template, assigneeType: "npc", assigneeId: shipId, responseId, plan, repositionFrom: selected.repositionFrom ?? null });
    if (!shipment) {
      logistics.responses[responseId].status = "blocked";
      logistics.responses[responseId].lastOutcome = { type: "execution-route-rejected", at: now() };
      appendHistory("freight.declined", { shipId, templateId: template.id, reason: "execution-route-rejected" });
    } else {
      hauler.lastDecisionKey = null;
      // Diagnostics: committed to a run, with the cost/ask that justified it and
      // the alternatives that lost.
      recordDiagnostic(state, shipId, {
        actorName: getCarrierContext(shipId).carrierName ?? shipId,
        actorKind: "ship",
        controllerId: hauler.carrierInstitutionId,
        state: DIAGNOSTIC_STATE.COMMITTED,
        summary: `Hauling ${template.commodityName} ${template.originName} → ${template.destinationName} for ${shipment.payment} cr`,
        locationSiteId: hauler.currentSiteId,
        // The shared record, not a second shape describing the same thing.
        intention: adaptShipment(shipment),
        blocker: null,
        waitingFor: null,
        wakeOn: ["shipment-delivered", "breakdown"],
        nextReconsiderAt: null,
        refs: { contractIds: [shipment.contractId].filter(Boolean), targetIds: [template.destinationSiteId], dependencyIds: [shipment.containerId] },
      }, now());
      recordDecision(state, shipId, {
        chosen: { id: template.id, label: `${template.commodityName} → ${template.destinationName}`, score: shipment.payment },
        alternatives: candidates
          .filter((candidate) => candidate.template.id !== template.id)
          .map((candidate) => ({
            id: candidate.template.id,
            label: `${candidate.template.commodityName} → ${candidate.template.destinationName}`,
            score: candidate.rate,
            rejectedBecause: candidate.plan.eligible ? "lower score" : formatReason(candidate.plan.reason),
          })),
        reasons: selected.ask?.reasons ?? [],
        at: now(),
      });
      publishCarrierEvent("carrier.contractAccepted", shipId, { shipmentId: shipment.id, templateId: template.id, payment: shipment.payment, originSiteId: template.originSiteId, destinationSiteId: template.destinationSiteId, projectedWear: plan.projectedWear, carrierCost: Math.round(selected.ask?.metrics?.costToServe ?? 0), carrierAsk: selected.ask?.recommendedPrice ?? null }, `${getCarrierContext(shipId).pilotName} accepted ${shipment.payment} cr freight from ${template.originName} to ${template.destinationName}; account balance is ${account.balance} cr.`);
      bundleCompatibleFreight(shipId, selected, candidates, freightWinners);
      dispatchShipmentPortfolio(shipId);
    }
    return shipment;
  }

  function bundleCompatibleFreight(shipId, primary, candidates, freightWinners) {
    const ship = shipById.get(shipId);
    if (!ship?.activeShipmentId) return;
    candidates
      .filter((candidate) => candidate.template.id !== primary.template.id)
      .filter((candidate) => candidate.plan.eligible)
      .filter((candidate) => candidate.template.originSiteId === primary.template.originSiteId)
      .filter((candidate) => !freightWinners || freightWinners.get(candidate.template.id) === shipId)
      .sort((a, b) => b.plan.score - a.plan.score || a.template.id.localeCompare(b.template.id))
      .forEach((candidate) => {
        if (!ship.canAcceptShipment?.({
          originSiteId: candidate.template.originSiteId,
          destinationSiteId: candidate.template.destinationSiteId,
          quantity: candidate.template.amount,
        })) return;
        const bundled = createShipment({
          template: candidate.template,
          assigneeType: "npc",
          assigneeId: shipId,
          plan: candidate.plan,
          repositionFrom: candidate.repositionFrom ?? null,
        });
        if (!bundled) return;
        publishCarrierEvent("carrier.contractBundled", shipId, {
          shipmentId: bundled.id, templateId: candidate.template.id,
          originSiteId: candidate.template.originSiteId,
          destinationSiteId: candidate.template.destinationSiteId,
          commodity: candidate.template.commodity, quantity: candidate.template.amount,
          portfolioSize: ship.shipmentCommitments?.length ?? 1,
          remainingCapacity: ship.remainingCargoCapacity ?? null,
        }, `${getCarrierContext(shipId).pilotName} added ${candidate.template.amount} ${candidate.template.commodityName} to ${getCarrierContext(shipId).shipName}'s existing run.`);
      });
  }

  function buildShipmentPortfolioRoute(shipId) {
    const hauler = logistics.haulers[shipId];
    const startId = hauler?.currentSiteId;
    if (!startId) return [];
    const pendingDestinations = Array.from(new Set(
      (hauler.activeShipmentIds ?? [])
        .map((shipmentId) => logistics.shipments[shipmentId])
        .filter((shipment) => shipment?.status === "loaded" && shipment.destinationSiteId !== startId)
        .map((shipment) => shipment.destinationSiteId),
    ));
    return buildFreightItinerary({ network: transportationNetwork, startId, destinationIds: pendingDestinations });
  }

  function dispatchShipmentPortfolio(shipId) {
    const hauler = logistics.haulers[shipId];
    const ship = shipById.get(shipId);
    if (!hauler?.activeShipmentId || !ship || ship.dockedSiteId !== hauler.currentSiteId) return false;
    const plannedRoute = buildShipmentPortfolioRoute(shipId);
    const destinationIds = new Set((hauler.activeShipmentIds ?? [])
      .map((shipmentId) => logistics.shipments[shipmentId]?.destinationSiteId)
      .filter(Boolean));
    const route = getNextFreightLeg(plannedRoute, destinationIds);
    if (route.length < 2 || !ship.assignItinerary?.(route)) return false;
    hauler.status = "transporting";
    const stops = plannedRoute.filter((site, index) => destinationIds.has(site?.id)
      && (index === 0 || plannedRoute[index - 1]?.id !== site.id)).map((site) => site.id);
    publishCarrierEvent("carrier.itineraryPlanned", shipId, {
      shipmentIds: [...(hauler.activeShipmentIds ?? [])], stops, nextStopId: route.at(-1)?.id ?? null,
      usedCapacity: (ship.shipmentCommitments ?? []).reduce((sum, entry) => sum + (entry.reservedCapacity ?? 0), 0),
      capacity: ship.commitmentPortfolio?.capacity ?? null,
    }, `${getCarrierContext(shipId).pilotName} planned ${getCarrierContext(shipId).shipName}'s next freight itinerary through ${stops.map(siteName).join(" → ")}.`);
    return true;
  }

  // A run carrying goods that already belong to the destination. No sale, no
  // payment to the seller: the only money here is the carrier's fee, which the
  // owner of the cargo pays.
  function createPrepaidShipment({ template, assigneeType, assigneeId, responseId, contractId, plan, repositionFrom, routeSites, rate, held }) {
    const issuer = logistics.institutions[template.issuerInstitutionId];
    issuer.accounts.operating.committed += rate;
    const id = `SHIP-${String(++logistics.counters.shipment).padStart(4, "0")}`;
    const containerId = `CONT-${String(++logistics.counters.container).padStart(4, "0")}`;
    logistics.containers[containerId] = {
      id: containerId, shipmentId: id, commodity: template.commodity, quantity: template.amount,
      // Custody sits with the carrier; ownership never leaves the buyer.
      ownerInstitutionId: template.destinationInstitutionId,
      custodianInstitutionId: template.sourceInstitutionId,
      manifestId: held.manifestId ?? null,
      custody: [{ institutionId: template.sourceInstitutionId, action: "released-to-carrier", siteId: template.originSiteId, at: now() }],
    };
    const shipment = logistics.shipments[id] = {
      id, templateId: template.id, contractId, responseId, assigneeType, assigneeId, containerId,
      originSiteId: template.originSiteId, destinationSiteId: template.destinationSiteId,
      sourceInstitutionId: template.sourceInstitutionId, destinationInstitutionId: template.destinationInstitutionId,
      issuerInstitutionId: template.issuerInstitutionId, commodity: template.commodity, quantity: template.amount,
      payment: rate, committedPayment: rate, basePayment: template.payment,
      goodsPayment: 0, prepaid: true, manifestId: held.manifestId ?? null,
      procurementOrderId: template.procurementOrderId ?? null, repositionedFrom: repositionFrom ?? null,
      status: "assigned", createdAt: now(), loadedAt: null,
    };
    appendHistory("shipment.assigned", { shipmentId: id, containerId, assigneeId, commodity: template.commodity, prepaid: true });
    state.ledger.recordEvent("logistics.prepaidCargoCollected", {
      shipmentId: id, manifestId: held.manifestId ?? null, ownerId: template.destinationInstitutionId,
      heldAtId: template.sourceInstitutionId, commodity: template.commodity, quantity: template.amount, freight: rate,
    }, { visible: true, message: `A carrier collected ${template.amount} ${template.commodityName} held at ${template.originName} under ${held.manifestId ?? "manifest"} and owned by ${template.destinationName}.` });

    const assignedShip = assigneeType === "npc" ? shipById.get(assigneeId) : null;
    if (assigneeType === "npc" && assignedShip) {
      loadShipment(shipment);
      if (shipment.procurementOrderId) onProcurementShipped?.(shipment.procurementOrderId, shipment.id);
      const hauler = logistics.haulers[assigneeId];
      trackHaulerShipment(hauler, id); hauler.status = "transporting";
      assignedShip.assignShipment({ shipmentId: id, originSiteId: template.originSiteId, destinationSiteId: template.destinationSiteId, quantity: template.amount, route: routeSites });
    }
    return shipment;
  }

  function createShipment({ template, assigneeType, assigneeId, responseId = null, contractId = null, plan = null, repositionFrom = null }) {
    const haulRoute = plan?.route ? buildPhysicalTransportationRoute(transportationNetwork, plan.route) : [];
    // A hauler taking work from the far end flies to the pickup empty first, so
    // its route is the deadhead leg followed by the loaded leg.
    const approach = repositionFrom ? findTransportationRoute(transportationNetwork, repositionFrom, template.originSiteId) : null;
    const approachSites = approach ? buildPhysicalTransportationRoute(transportationNetwork, approach) : [];
    const routeSites = approachSites.length > 1 ? [...approachSites.slice(0, -1), ...haulRoute] : haulRoute;
    const assignedShip = assigneeType === "npc" ? shipById.get(assigneeId) : null;
    if (assigneeType === "npc" && (!assignedShip
      || (assignedShip.canAcceptRoute ? !assignedShip.canAcceptRoute(routeSites) : routeSites.length < 2)
      || (assignedShip.canAcceptShipment && !assignedShip.canAcceptShipment({ originSiteId: template.originSiteId, destinationSiteId: template.destinationSiteId, quantity: template.amount })))) return null;
    const issuer = logistics.institutions[template.issuerInstitutionId];
    // The posted rate, which may have been raised above the authored base to
    // attract a carrier, is the single price used for funding, commitment, and
    // settlement.
    const rate = getFreightRate(template);
    const affordability = evaluateAffordability({ account: issuer.accounts.operating, policy: { protectedCash: 0 }, cost: rate });
    if (!affordability.affordable) return null;
    const source = logistics.institutions[template.sourceInstitutionId];
    if (!template.prepaid && (source.inventories[template.commodity] ?? 0) < template.amount) return null;

    // Prepaid freight is moving property the buyer already owns: title changed
    // hands when the sale completed, so there is nothing to buy here and the
    // goods come out of the awaiting-pickup manifest rather than the seller's
    // own shelf.
    if (template.prepaid) {
      const held = source.awaitingPickup?.[template.procurementOrderId];
      if (!held || held.units < template.amount) return null;
      delete source.awaitingPickup[template.procurementOrderId];
      return createPrepaidShipment({ template, assigneeType, assigneeId, responseId, contractId, plan, repositionFrom, routeSites, rate, held });
    }

    // Buy the goods from the seller. The buyer must be able to cover the sale
    // AND the freight, or no shipment is created — an unaffordable trade is
    // withheld rather than half-executed.
    const goods = quoteGoods(template.sourceInstitutionId, template.commodity, template.amount);
    const buyerId = template.destinationInstitutionId;
    const buyerAccount = logistics.institutions[buyerId]?.accounts?.operating ?? {};
    if ((buyerAccount.balance ?? 0) < goods.price + rate) {
      recordBlocker(state, buyerId, createBlocker({
        kind: BLOCKER_KIND.PAYER_CANNOT_AFFORD,
        summary: `${buyerId} cannot buy ${template.amount} ${template.commodityName}: ${goods.price} cr of goods plus ${rate} cr freight exceeds its balance`,
        subjectId: buyerId, objectId: template.id,
        waitingFor: "revenue, or a cheaper supplier",
        wakeOn: ["population.goodsPurchased", "order-repriced"],
        detail: { templateId: template.id, goodsPrice: goods.price, freight: rate, balance: Math.round(buyerAccount.balance ?? 0) },
        at: now(),
      }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
      return null;
    }

    source.inventories[template.commodity] -= template.amount;
    recordAccountTransaction(buyerId, -goods.price, "goods-purchase", template.id, `Bought ${template.amount} ${template.commodityName} from ${template.sourceInstitutionId}`);
    recordAccountTransaction(template.sourceInstitutionId, goods.price, "goods-sale", template.id, `Sold ${template.amount} ${template.commodityName} to ${buyerId}`);
    state.ledger.recordEvent("logistics.goodsSold", {
      sellerId: template.sourceInstitutionId, buyerId, commodity: template.commodity,
      quantity: template.amount, price: goods.price, unitCost: Math.round(goods.unitCost),
      freight: rate, reasons: goods.valuation.reasons,
    }, { visible: true, message: `${template.sourceInstitutionId} sold ${template.amount} ${template.commodityName} to ${buyerId} for ${goods.price} cr, with ${rate} cr freight on top.` });

    issuer.accounts.operating.committed += rate;
    const id = `SHIP-${String(++logistics.counters.shipment).padStart(4, "0")}`;
    const containerId = `CONT-${String(++logistics.counters.container).padStart(4, "0")}`;
    const container = logistics.containers[containerId] = { id: containerId, shipmentId: id, commodity: template.commodity, quantity: template.amount, ownerInstitutionId: template.sourceInstitutionId, custodianInstitutionId: template.sourceInstitutionId, custody: [{ institutionId: template.sourceInstitutionId, action: "created", siteId: template.originSiteId, at: now() }] };
    const shipment = logistics.shipments[id] = { id, templateId: template.id, contractId, responseId, assigneeType, assigneeId, containerId, originSiteId: template.originSiteId, destinationSiteId: template.destinationSiteId, sourceInstitutionId: template.sourceInstitutionId, destinationInstitutionId: template.destinationInstitutionId, issuerInstitutionId: template.issuerInstitutionId, commodity: template.commodity, quantity: template.amount, payment: rate, committedPayment: rate, basePayment: template.payment, goodsPayment: goods.price, goodsUnitCost: goods.unitCost, procurementOrderId: template.procurementOrderId ?? null, repositionedFrom: repositionFrom ?? null, status: "assigned", createdAt: now(), loadedAt: null };
    appendHistory("shipment.assigned", { shipmentId: id, containerId, assigneeId, commodity: template.commodity });
    if (assigneeType === "npc") {
      loadShipment(shipment);
      if (shipment.procurementOrderId) onProcurementShipped?.(shipment.procurementOrderId, shipment.id);
      const hauler = logistics.haulers[assigneeId];
      trackHaulerShipment(hauler, id); hauler.status = "transporting";
      assignedShip.assignShipment({ shipmentId: id, originSiteId: template.originSiteId, destinationSiteId: template.destinationSiteId, quantity: template.amount, route: routeSites });
      publishCarrierEvent("carrier.freightLoaded", assigneeId, { shipmentId: id, commodity: template.commodity, quantity: template.amount, destinationSiteId: template.destinationSiteId }, `${getCarrierContext(assigneeId).shipName} loaded ${template.amount} ${template.commodityName} for ${template.destinationName}.`);
    }
    return shipment;
  }

  function assignMaintenanceAction(shipId, options = {}) {
    const hauler = logistics.haulers[shipId];
    const ship = shipById.get(shipId);
    const carrier = logistics.institutions[hauler.carrierInstitutionId];
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    const policy = carrier.policies?.transportation ?? {};
    const threshold = (policy.maximumWear ?? Infinity) - (policy.minimumReturnMargin ?? 0);
    if (!options.force && (shipInstitution.wear ?? 0) < threshold) return null;
    const repairRoutes = carrier.repairOptions
      .map((option) => ({ option, route: findTransportationRoute(transportationNetwork, hauler.currentSiteId, option.destinationId, policy.knownDestinationIds) }))
      .filter((entry) => entry.route)
      .sort((a, b) => (a.option.priority ?? 0) - (b.option.priority ?? 0) || a.route.distance - b.route.distance);
    const selected = repairRoutes[0];
    if (!selected) { appendHistory("maintenance.blocked", { shipId, reason: "no-reachable-maintenance" }); return null; }
    if (hauler.currentSiteId === selected.option.destinationId) return requestPreventiveMaintenance(shipId, options.issueType);
    const routeSites = selected.route.path.map((id) => transportationNetwork.destinations[id]);
    if (ship.canAcceptRoute ? !ship.canAcceptRoute(routeSites) : routeSites.length < 2) { appendHistory("maintenance.blocked", { shipId, reason: "execution-route-rejected" }); return null; }
    const id = `MOVE-${String(++logistics.counters.movement).padStart(4, "0")}`;
    logistics.movements[id] = { id, type: "service-return", shipId, originSiteId: hauler.currentSiteId, destinationSiteId: selected.option.destinationId, providerInstitutionId: selected.option.institutionId, issueType: options.issueType ?? "preventive-service", status: "active", createdAt: now() };
    hauler.activeMovementId = id; hauler.status = "returning-maintenance";
    ship.assignShipment({ shipmentId: id, destinationSiteId: selected.option.destinationId, route: routeSites });
    appendHistory("maintenance.returnStarted", { movementId: id, shipId, destinationSiteId: selected.option.destinationId });
    publishCarrierEvent("carrier.maintenanceReturn", shipId, { movementId: id, destinationSiteId: selected.option.destinationId, wear: shipInstitution.wear ?? 0 }, `${getCarrierContext(shipId).pilotName} declined further freight and is returning ${getCarrierContext(shipId).shipName} to ${siteName(selected.option.destinationId)} for service.`);
    return logistics.movements[id];
  }

  function completeMovement(shipId, movementId, siteId) {
    const movement = logistics.movements[movementId];
    if (movement?.type === "market-reposition") return completeMarketReposition(shipId, movementId, siteId);
    return completeMaintenanceMovement(shipId, movementId, siteId);
  }

  function completeMarketReposition(shipId, movementId, siteId) {
    const movement = logistics.movements[movementId];
    if (!movement || movement.status !== "active" || movement.destinationSiteId !== siteId) return false;
    movement.status = "completed";
    movement.completedAt = now();
    const hauler = logistics.haulers[shipId];
    hauler.currentSiteId = siteId;
    hauler.activeMovementId = null;
    hauler.status = "seeking-work";
    hauler.lastDecisionKey = null;
    shipById.get(shipId)?.clearShipment();
    appendHistory("market.repositionCompleted", { movementId, shipId, siteId, observedOfferId: movement.observedOfferId });
    publishCarrierEvent("carrier.marketArrived", shipId, {
      movementId, siteId, observedOfferId: movement.observedOfferId,
    }, `${getCarrierContext(shipId).shipName} arrived at ${siteName(siteId)} and may now compete for contracts posted there.`);
    return true;
  }

  function completeMaintenanceMovement(shipId, movementId, siteId) {
    const movement = logistics.movements[movementId];
    if (!movement || movement.status !== "active" || movement.destinationSiteId !== siteId) return false;
    movement.status = "completed"; movement.completedAt = now();
    const hauler = logistics.haulers[shipId];
    hauler.currentSiteId = siteId; hauler.activeMovementId = null;
    shipById.get(shipId)?.clearShipment();
    appendHistory("maintenance.returnCompleted", { movementId, shipId, siteId });
    publishCarrierEvent("carrier.arrivedForMaintenance", shipId, { movementId, siteId }, `${getCarrierContext(shipId).shipName} arrived at ${siteName(siteId)} and is requesting service.`);
    requestPreventiveMaintenance(shipId, movement.issueType);
    return true;
  }

  function requestPreventiveMaintenance(shipId, issueType = "preventive-service") {
    const hauler = logistics.haulers[shipId];
    if (hauler.maintenanceRequested) return null;
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    ensureFreightComponents(shipInstitution);
    const component = freightComponentForIssue(shipInstitution, issueType);
    const resolvedIssueType = issueType === "preventive-service"
      ? (FREIGHT_COMPONENT_ISSUES[component?.id] ?? issueType)
      : issueType;
    hauler.maintenanceRequested = true; hauler.status = "maintenance-required";
    const ship = shipById.get(shipId); if (ship) ship.operationalStatus = "maintenance";
    const maintenancePayload = { npcId: shipId, componentId: component?.id ?? null, issueType: resolvedIssueType, wear: projectFreightWear(shipInstitution), issueCount: shipInstitution.issueCount ?? 0, causedByCarefulMode: false, cause: resolvedIssueType === "hull-fatigue" ? "combat-damage" : "operational-wear" };
    state.ledger.recordEvent("logistics.maintenanceRequired", maintenancePayload, { visible: false });
    publishMaintenanceRequest(shipId, maintenancePayload);
    publishCarrierEvent("carrier.maintenanceRequested", shipId, maintenancePayload, `${getCarrierContext(shipId).pilotName} placed ${getCarrierContext(shipId).shipName} in Scrap Porch's service queue at wear ${(shipInstitution.wear ?? 0).toFixed(2)}.`);
    appendHistory("maintenance.requested", { shipId, componentId: maintenancePayload.componentId, issueType: resolvedIssueType });
    return true;
  }

  function restoreAfterMaintenance(shipId, componentId = null, repairOrderId = null) {
    const hauler = logistics.haulers[shipId];
    if (!hauler) return;
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    ensureFreightComponents(shipInstitution);
    const component = componentId ? shipInstitution.components?.[componentId] : getWorstComponent(shipInstitution);
    if (component) serviceCraftComponent(shipInstitution, component.id, { at: now(), providerId: "sprc", repairOrderId });
    projectFreightWear(shipInstitution);
    shipInstitution.issueCount = 0;
    hauler.maintenanceRequested = false; hauler.status = "seeking-work"; hauler.lastDecisionKey = null;
    const ship = shipById.get(shipId);
    if (ship) { ship.wear = shipInstitution.wear; ship.wearIssueCount = 0; ship.pendingWearIssue = null; ship.hull = ship.maxHull ?? 680; ship.operationalStatus = "seeking-work"; applyFreightConditionEffects(ship, shipInstitution); }
    hauler.combatMaintenanceIssue = null;
    appendHistory("maintenance.restored", { shipId, componentId: component?.id ?? null, repairOrderId });
    publishCarrierEvent("carrier.maintenanceCompleted", shipId, { componentId: component?.id ?? null, wear: shipInstitution.wear }, `${getCarrierContext(shipId).shipName} cleared maintenance and returned to freight service.`);
  }

  function completeNpcShipment(shipId, shipmentId, siteId) {
    const shipment = logistics.shipments[shipmentId];
    if (!shipment || shipment.status !== "loaded" || shipment.destinationSiteId !== siteId) return false;
    completeShipment(shipment);
    const hauler = logistics.haulers[shipId];
    hauler.currentSiteId = siteId;
    hauler.activeShipmentIds = (hauler.activeShipmentIds ?? []).filter((id) => id !== shipmentId);
    hauler.activeShipmentId = hauler.activeShipmentIds[0] ?? null;
    hauler.status = hauler.activeShipmentId ? "transporting" : "seeking-work";
    hauler.lastDecisionKey = null;
    shipById.get(shipId)?.clearShipment(shipmentId);
    applyFreightTaskUse(shipId, { "docking-gear": 0.012, "cargo-handling": 0.018, hull: 0.004 });
    return true;
  }

  function completeNpcShipmentPortfolio(shipId, siteId) {
    const hauler = logistics.haulers[shipId];
    const shipmentIds = [...(hauler?.activeShipmentIds ?? [hauler?.activeShipmentId].filter(Boolean))];
    let completed = 0;
    shipmentIds.forEach((shipmentId) => { if (completeNpcShipment(shipId, shipmentId, siteId)) completed += 1; });
    return completed > 0;
  }

  function trackHaulerShipment(hauler, shipmentId) {
    hauler.activeShipmentIds ??= hauler.activeShipmentId ? [hauler.activeShipmentId] : [];
    if (!hauler.activeShipmentIds.includes(shipmentId)) hauler.activeShipmentIds.push(shipmentId);
    hauler.activeShipmentId = hauler.activeShipmentIds[0] ?? null;
  }

  function completeShipment(shipment) {
    const container = logistics.containers[shipment.containerId];
    transferCustody(container, shipment.destinationInstitutionId, "unloaded", shipment.destinationSiteId);
    container.ownerInstitutionId = shipment.destinationInstitutionId;
    logistics.institutions[shipment.destinationInstitutionId].inventories[shipment.commodity] = (logistics.institutions[shipment.destinationInstitutionId].inventories[shipment.commodity] ?? 0) + shipment.quantity;
    // Landed cost, not just the sale price: the buyer really paid for the
    // goods and the freight to get them here, and anything built from this
    // material should carry both.
    recordAcquisition(state, {
      institutionId: shipment.destinationInstitutionId, itemId: shipment.commodity,
      units: shipment.quantity, totalCost: (shipment.goodsPayment ?? 0) + (shipment.payment ?? 0),
      source: "freight-purchase", at: now(),
    });
    const issuer = logistics.institutions[shipment.issuerInstitutionId];
    recordAccountTransaction(shipment.issuerInstitutionId, -shipment.payment, "freight-payment", shipment.id, `Paid freight delivery ${shipment.id}`);
    issuer.accounts.operating.committed = Math.max(0, issuer.accounts.operating.committed - shipment.payment);
    shipment.committedPayment = 0; shipment.status = "delivered"; shipment.deliveredAt = now();
    if (shipment.assigneeType === "npc") {
      const carrierId = logistics.haulers[shipment.assigneeId].carrierInstitutionId;
      const transaction = recordAccountTransaction(carrierId, shipment.payment, "freight-income", shipment.id, `Completed freight delivery ${shipment.id}`);
      const loanRepayment = repayEmergencyFleetLoan(carrierId, shipment.payment);
      const balance = logistics.institutions[carrierId].accounts.operating.balance;
      shipById.get(shipment.assigneeId)?.queueCargoTransfer?.({ commodity: shipment.commodity, direction: "to-hub" });
      publishCarrierEvent("carrier.contractFulfilled", shipment.assigneeId, { shipmentId: shipment.id, payment: shipment.payment, loanRepayment, transactionId: transaction.id, balance, destinationSiteId: shipment.destinationSiteId }, `${getCarrierContext(shipment.assigneeId).pilotName} delivered ${shipment.commodity} to ${siteName(shipment.destinationSiteId)}, earned ${shipment.payment} cr${loanRepayment ? `, repaid ${loanRepayment} cr of fleet finance,` : ","} and now has ${balance} cr.`);
    }
    // A procurement-backed run closes the order that caused it, which is what
    // reduces the buyer's real need rather than just moving material about.
    if (shipment.procurementOrderId) {
      onProcurementDelivered?.(shipment.procurementOrderId, {
        deliveredUnits: shipment.quantity,
        goodsPayment: shipment.goodsPayment ?? 0,
        freightPaid: shipment.payment ?? 0,
      });
    }
    appendHistory("shipment.delivered", { shipmentId: shipment.id, containerId: container.id, payment: shipment.payment });
  }

  function acceptPlayerContract(contract, playerInstitutionId, pickupSiteId = null) {
    const template = getProcurementFreightOffers(state).find((entry) => entry.id === contract.terms.standingFreightTemplateId);
    if (!template || pickupSiteId !== template.originSiteId || countActiveForTemplate(template.id) >= 2) return null;
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
    if (shipment.assigneeType === "npc") {
      shipById.get(shipment.assigneeId)?.queueCargoTransfer?.({ commodity: shipment.commodity, direction: "from-hub" });
      applyFreightTaskUse(shipment.assigneeId, { "docking-gear": 0.008, "cargo-handling": 0.015, hull: 0.003 });
    }
    shipment.status = "loaded"; shipment.loadedAt = now();
    appendHistory("shipment.loaded", { shipmentId: shipment.id, containerId: shipment.containerId, assigneeId: shipment.assigneeId });
    return true;
  }

  function recordWearIssue(payload) {
    const hauler = logistics.haulers[payload.npcId];
    if (!hauler) return;
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    const ship = shipById.get(payload.npcId);
    synchronizeFreightUse(ship, shipInstitution, hauler);
    const component = getWorstComponent(shipInstitution);
    const resolvedPayload = {
      ...payload,
      componentId: component?.id ?? null,
      issueType: FREIGHT_COMPONENT_ISSUES[component?.id] ?? payload.issueType,
      wear: projectFreightWear(shipInstitution),
    };
    shipInstitution.issueCount = payload.issueCount;
    hauler.maintenanceRequested = true; hauler.status = "maintenance-required";
    ship.operationalStatus = "maintenance";
    appendHistory("ship.issue", resolvedPayload);
    state.ledger.recordEvent("logistics.maintenanceRequired", resolvedPayload, { visible: false });
    publishMaintenanceRequest(payload.npcId, resolvedPayload);
    publishCarrierEvent("carrier.breakdown", payload.npcId, resolvedPayload, `${getCarrierContext(payload.npcId).shipName} suffered a ${formatReason(resolvedPayload.issueType ?? "wear issue")} in ${component?.label ?? "a working system"} at wear ${(resolvedPayload.wear ?? 0).toFixed(2)}; ${getCarrierContext(payload.npcId).pilotName} is seeking repair.`);
  }

  function recordCombatDamage(payload) {
    const hauler = logistics.haulers[payload.npcId];
    if (!hauler || payload.hullAfter <= 0 || payload.hullAfter / 180 > 0.5 || hauler.maintenanceRequested) return;
    applyFreightTaskUse(payload.npcId, { hull: 1 });
    // Keep cargo already accepted in custody. Once it unloads, this flag wins
    // over every new freight offer and routes the craft to public maintenance.
    hauler.combatMaintenanceIssue = "hull-fatigue";
    publishCarrierEvent("carrier.combatDamage", payload.npcId, payload, `${getCarrierContext(payload.npcId).shipName} took heavy incursion damage and will withdraw to Scrap Porch after clearing its current custody obligation.`);
    appendHistory("maintenance.combatDamage", { shipId: payload.npcId, hullAfter: payload.hullAfter });
  }

  function publishMaintenanceRequest(shipId, payload) {
    const hauler = logistics.haulers[shipId];
    const carrier = logistics.institutions[hauler.carrierInstitutionId];
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    const requiredCapabilities = payload.issueType === "hull-fatigue" ? ["structural-repair"] : payload.issueType === "control-fault" ? ["control-systems"] : ["mechanical-repair"];
    state.ledger.recordEvent("maintenance.requested", { subjectId: shipId, subjectName: shipInstitution.name, referenceId: shipInstitution.referenceId, craftClass: "freight-hauler", componentId: payload.componentId ?? null, issueType: payload.issueType, requiredCapabilities, locationSiteId: "scrap-porch", mobility: "recovered", payerInstitutionId: carrier.id, payer: { balance: carrier.accounts.operating.balance, committed: carrier.accounts.operating.committed ?? 0, protectedCash: carrier.policies?.transportation?.minimumOperatingCash ?? 0 }, servicePrice: 180, wear: payload.wear, issueCount: payload.issueCount, causedByCarefulMode: payload.causedByCarefulMode }, { visible: false });
  }

  function settleRepairInvoice(shipId, amount, referenceId) {
    const hauler = logistics.haulers[shipId];
    if (!hauler || !Number.isFinite(amount) || amount <= 0) return null;
    const transaction = recordAccountTransaction(hauler.carrierInstitutionId, -amount, "repair-expense", referenceId, `Paid Scrap Porch repair invoice ${referenceId}`);
    state.sprc.account.balance += amount;
    // Book the real upkeep cost so this carrier's future freight asks reflect
    // what maintenance now costs it.
    recordServiceCost(state, { institutionId: hauler.carrierInstitutionId, serviceType: "maintenance", price: amount, at: now() });
    publishCarrierEvent("carrier.repairPaid", shipId, { repairOrderId: referenceId, amount, transactionId: transaction.id, balance: transaction.balance }, `${getCarrierContext(shipId).carrierName} paid Scrap Porch ${amount} cr for repairs; operating balance is ${transaction.balance} cr.`);
    return transaction;
  }

  // What the supplying institution charges for the GOODS. Freight is a separate
  // payment to the carrier; this is the sale itself, which previously never
  // happened at all — a source hub simply lost material for nothing.
  //
  // The ask is built from what the material actually cost the seller, so the
  // cost basis recorded when it bought ore propagates into what it resells for.
  function quoteGoods(sellerInstitutionId, commodity, quantity) {
    // Floored at plain market worth. A seller that has not recorded a cost
    // basis yet would otherwise part with material for a single credit.
    const marketUnitValue = getResourceTradeValue(commodity);
    const unitCost = Math.max(getUnitCost(state, sellerInstitutionId, commodity) || 0, marketUnitValue);
    const ask = evaluateSupplierAsk({
      workId: `${quantity} ${commodity}`,
      costComponents: { other: unitCost * quantity },
      traits: getActorTraits(state, sellerInstitutionId),
    });
    return { price: ask.recommendedPrice, unitCost, marketUnitValue, valuation: ask };
  }

  function recordAccountTransaction(institutionId, amount, type, referenceId, description) {
    const institution = logistics.institutions[institutionId];
    institution.accounts ??= {};
    institution.accounts.operating ??= { balance: 0, committed: 0 };
    const account = institution.accounts.operating;
    account.transactions ??= [];
    account.balance = (account.balance ?? 0) + amount;
    const transaction = { id: `TX-${String(++logistics.counters.transaction).padStart(5, "0")}`, at: now(), accountId: account.id ?? `${institutionId}:operating`, institutionId, type, amount, balance: account.balance, referenceId, description };
    account.transactions.push(transaction);
    if (account.transactions.length > 50) account.transactions.splice(0, account.transactions.length - 50);
    return transaction;
  }

  function getCarrierContext(shipId) {
    const hauler = logistics.haulers[shipId] ?? {};
    const carrier = logistics.institutions[hauler.carrierInstitutionId] ?? {};
    const person = logistics.institutions[carrier.controllerInstitutionId] ?? {};
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId] ?? {};
    return { carrierInstitutionId: carrier.id, carrierName: carrier.name ?? carrier.id ?? "Unknown carrier", carrierReferenceId: carrier.referenceId, accountId: carrier.accounts?.operating?.id, pilotInstitutionId: person.id, pilotName: person.name ?? shipId, licenseId: person.license?.id ?? person.referenceId, shipInstitutionId: shipInstitution.id, shipName: shipInstitution.name ?? shipId, shipReferenceId: shipInstitution.referenceId };
  }

  function publishCarrierEvent(type, shipId, payload, message) {
    state.ledger.recordEvent(type, { ...getCarrierContext(shipId), ...payload }, { visible: true, message });
  }

  function publishDecisionOnce(shipId, key, message, payload = {}) {
    const hauler = logistics.haulers[shipId];
    if (!hauler || hauler.lastDecisionKey === key) return;
    hauler.lastDecisionKey = key;
    publishCarrierEvent("carrier.decision", shipId, payload, message);
  }

  function siteName(siteId) { return transportationNetwork.destinations[siteId]?.name ?? SITE_NAMES[siteId] ?? siteId; }
  function formatReason(value) { return String(value).replaceAll("-", " "); }

  function transferCustody(container, institutionId, action, siteId) { container.custodianInstitutionId = institutionId; container.custody.push({ institutionId, action, siteId, at: now() }); }
  // What a carrier can actually load. Prepaid freight draws from goods the
  // buyer already owns and that are sitting at the seller awaiting pickup; only
  // an unpaid run draws from the seller's own stock.
  function availableToLoad(template) {
    const source = logistics.institutions[template.sourceInstitutionId];
    if (!template.prepaid) return source?.inventories?.[template.commodity] ?? 0;
    const held = source?.awaitingPickup?.[template.procurementOrderId];
    return held?.units ?? 0;
  }

  // A carrier that has had every ship committed for a minute buys another, and
  // lays one up after two minutes idle. Ships are never laid up loaded, under
  // tow, or if it would leave the region with none.
  function assessCarrierFleet() {
    logistics.fleetPolicy ??= {};
    // Carrier institutions remain actors after their final physical craft is
    // lost. Deriving this set only from extant hauler records made a zero-fleet
    // company disappear from planning precisely when it most needed to decide.
    const carriers = new Set([
      ...FIRST_REACH_CARRIERS.map((seed) => seed.institution.id),
      ...Object.values(logistics.haulers).map((hauler) => hauler.carrierInstitutionId),
    ]);

    carriers.forEach((carrierId) => {
      const carrier = logistics.institutions[carrierId];
      if (!carrier?.accounts?.operating) return;
      const owned = Object.entries(logistics.haulers).filter(([, hauler]) => hauler.carrierInstitutionId === carrierId);
      const policy = logistics.fleetPolicy[carrierId] ??= { allBusySince: null };
      const operational = owned.filter(([shipId, hauler]) => {
        const ship = shipById.get(shipId);
        return ship?.isAlive !== false && hauler.status !== "destroyed";
      });

      if (operational.length === 0) {
        policy.fleetLostSince ??= now();
        policy.allBusySince = null;
        const lossSeconds = (now() - policy.fleetLostSince) / 1000;
        if (lossSeconds < EMERGENCY_REPLACE_AFTER_SECONDS || !commissionHauler) return;
        if (!ensureEmergencyReplacementFunding(carrierId, carrier)) return;
        if (hireHauler(carrierId, carrier, owned, carrier.homeSiteId)) {
          policy.fleetLostSince = null;
          policy.lastRecoveryDecisionKey = null;
        }
        return;
      }
      policy.fleetLostSince = null;

      // Maintenance is real lost capacity. Previously a carrier with one ship
      // immobilized in Sal's queue looked "not busy", so a growing freight
      // backlog could never justify investment in a replacement/relief craft.
      const allCapacityCommitted = operational.every(([shipId, hauler]) => {
        const ship = shipById.get(shipId);
        return Boolean(hauler.activeShipmentId || hauler.activeMovementId
          || hauler.maintenanceRequested
          || hauler.status === "maintenance-required"
          || ship?.operationalStatus === "maintenance");
      });
      // Busy craft alone are not evidence that another ship is useful. Growth
      // requires actual loadable freight waiting behind them; conversely the
      // old six-ship regional singleton cap must not prevent one carrier from
      // responding just because unrelated firms already own the slots.
      const waitingFreightCount = getProcurementFreightOffers(state)
        .filter((offer) => countActiveForTemplate(offer.id) < 1 && availableToLoad(offer) >= offer.amount).length;
      const capacityPressure = allCapacityCommitted && waitingFreightCount > 0;
      if (!capacityPressure) policy.allBusySince = null;
      else policy.allBusySince ??= now();

      const busyLongEnough = policy.allBusySince != null
        && now() - policy.allBusySince >= HAULER_HIRE_AFTER_BUSY_SECONDS * 1000;
      const totalHaulers = Object.entries(logistics.haulers)
        .filter(([shipId, hauler]) => shipById.get(shipId)?.isAlive !== false && hauler.status !== "destroyed").length;

      if (busyLongEnough && operational.length < MAX_HAULERS_PER_CARRIER
        && totalHaulers < MAX_REGIONAL_HAULERS && commissionHauler) {
        if (carrier.accounts.operating.balance - HAULER_COST < 0) {
          const decisionKey = `${waitingFreightCount}:${Math.round(carrier.accounts.operating.balance)}`;
          if (policy.lastHireDeferredKey !== decisionKey) {
            policy.lastHireDeferredKey = decisionKey;
            appendHistory("carrier.hireDeferred", { carrierInstitutionId: carrierId, cost: HAULER_COST, balance: Math.round(carrier.accounts.operating.balance), waitingFreightCount });
            state.ledger.recordEvent("carrier.hireDeferred", { carrierInstitutionId: carrierId, carrierName: carrier.name, cost: HAULER_COST, balance: Math.round(carrier.accounts.operating.balance), waitingFreightCount }, { visible: true, message: `${carrier.name} sees ${waitingFreightCount} waiting freight ${waitingFreightCount === 1 ? "job" : "jobs"}, but cannot yet fund another hauler.` });
          }
        } else if (hireHauler(carrierId, carrier, operational)) {
          policy.allBusySince = null;   // earn the next one from scratch
          policy.lastHireDeferredKey = null;
          return;
        }
      }

      // ── laying one up ─────────────────────────────────────────────────
      if (Object.keys(logistics.haulers).length <= MIN_HAULERS) return;
      owned.forEach(([haulerId, hauler]) => {
        if (hauler.activeShipmentId || hauler.activeMovementId) { hauler.idleSince = null; return; }
        hauler.idleSince ??= now();
        if (now() - hauler.idleSince < HAULER_RELEASE_AFTER_IDLE_SECONDS * 1000) return;
        const ship = shipById.get(haulerId);
        // Never lay up a ship that is carrying something or under tow: the
        // cargo would go with it.
        if (ship?.activeTowRequestId || ship?.cargoTransfers?.length) return;
        if (Object.keys(logistics.haulers).length <= MIN_HAULERS) return;
        layUpHauler(haulerId, hauler, carrierId, carrier);
      });
    });
  }

  function ensureEmergencyReplacementFunding(carrierId, carrier) {
    const minimumCash = carrier.policies?.transportation?.minimumOperatingCash ?? 0;
    const needed = Math.max(0, HAULER_COST + minimumCash - carrier.accounts.operating.balance);
    if (needed <= 0) return true;
    const financePolicy = carrier.policies?.transportation?.emergencyFleetFinance ?? {};
    const homeInstitution = Object.values(logistics.institutions).find((institution) =>
      institution.siteId === carrier.homeSiteId && institution.accounts?.operating);
    const lenderAccount = homeInstitution?.accounts?.operating;
    const lenderReserve = homeInstitution ? getActorProtectedCash(state, homeInstitution.id) : 0;
    const affordable = lenderAccount && lenderAccount.balance - lenderReserve >= needed;
    const eligible = financePolicy.enabled !== false && needed <= (financePolicy.maximumPrincipal ?? 0);
    if (!homeInstitution || !affordable || !eligible) {
      const policy = logistics.fleetPolicy[carrierId];
      const decisionKey = `${Math.round(carrier.accounts.operating.balance)}:${homeInstitution?.id ?? "no-lender"}:${Math.round(lenderAccount?.balance ?? 0)}`;
      if (policy.lastRecoveryDecisionKey !== decisionKey) {
        policy.lastRecoveryDecisionKey = decisionKey;
        appendHistory("carrier.replacementBlocked", { carrierInstitutionId: carrierId, needed, lenderInstitutionId: homeInstitution?.id ?? null });
        state.ledger.recordEvent("carrier.replacementBlocked", {
          carrierInstitutionId: carrierId, carrierName: carrier.name, needed,
          lenderInstitutionId: homeInstitution?.id ?? null, balance: Math.round(carrier.accounts.operating.balance),
        }, { visible: true, message: `${carrier.name} has lost its operating fleet and cannot yet finance a replacement.` });
      }
      return false;
    }

    const loanId = `FLEET-LOAN-${carrierId}-${logistics.counters.transaction + 1}`;
    lenderAccount.balance -= needed;
    carrier.accounts.operating.balance += needed;
    carrier.capitalLoans ??= [];
    carrier.capitalLoans.push({ id: loanId, lenderInstitutionId: homeInstitution.id, principal: needed, outstanding: needed, repaymentShare: financePolicy.repaymentShare ?? 0.25, status: "active", createdAt: now() });
    lenderAccount.transactions ??= [];
    lenderAccount.transactions.push({ id: `${loanId}-OUT`, at: now(), type: "fleet-recovery-loan", amount: -needed, balance: lenderAccount.balance, referenceId: carrierId });
    carrier.accounts.operating.transactions.push({ id: `${loanId}-IN`, at: now(), type: "fleet-recovery-finance", amount: needed, balance: carrier.accounts.operating.balance, referenceId: homeInstitution.id });
    state.ledger.recordEvent("carrier.emergencyFleetFinanced", {
      carrierInstitutionId: carrierId, carrierName: carrier.name, lenderInstitutionId: homeInstitution.id,
      lenderName: homeInstitution.name, principal: needed, outstanding: needed,
    }, { visible: true, message: `${homeInstitution.name} financed ${needed} cr for ${carrier.name} to restore regional freight capacity.` });
    return true;
  }

  function repayEmergencyFleetLoan(carrierId, freightIncome) {
    const carrier = logistics.institutions[carrierId];
    const loan = carrier?.capitalLoans?.find((candidate) => candidate.status === "active" && candidate.outstanding > 0);
    if (!loan) return 0;
    const payment = Math.min(loan.outstanding, Math.floor(freightIncome * (loan.repaymentShare ?? 0.25)));
    const lender = logistics.institutions[loan.lenderInstitutionId];
    if (payment <= 0 || !lender?.accounts?.operating) return 0;
    carrier.accounts.operating.balance -= payment;
    lender.accounts.operating.balance += payment;
    loan.outstanding -= payment;
    if (loan.outstanding <= 0) { loan.outstanding = 0; loan.status = "repaid"; loan.repaidAt = now(); }
    carrier.accounts.operating.transactions ??= [];
    lender.accounts.operating.transactions ??= [];
    carrier.accounts.operating.transactions.push({ id: `${loan.id}-PAY-${logistics.counters.transaction + 1}`, at: now(), type: "fleet-loan-repayment", amount: -payment, balance: carrier.accounts.operating.balance, referenceId: loan.id });
    lender.accounts.operating.transactions.push({ id: `${loan.id}-REC-${logistics.counters.transaction + 1}`, at: now(), type: "fleet-loan-repayment", amount: payment, balance: lender.accounts.operating.balance, referenceId: loan.id });
    state.ledger.recordEvent("carrier.fleetLoanRepaid", { carrierInstitutionId: carrierId, lenderInstitutionId: lender.id, loanId: loan.id, payment, outstanding: loan.outstanding }, { visible: true, message: `${carrier.name} repaid ${payment} cr of its emergency fleet loan; ${loan.outstanding} cr remains.` });
    return payment;
  }

  function hireHauler(carrierId, carrier, owned, homeSiteId = null) {
    const index = (logistics.counters.hauler = (logistics.counters.hauler ?? 0) + 1);
    const id = `hauler-hired-${index}`;
    homeSiteId ??= logistics.haulers[owned[0]?.[0]]?.currentSiteId ?? "yard-exchange";
    const created = commissionHauler({ id, name: `Relief Hauler ${index}`, homeSiteId, seed: 10 + index, carrierInstitutionId: carrier.id });
    if (!created) return false;

    carrier.accounts.operating.balance -= HAULER_COST;
    carrier.capitalSpend = (carrier.capitalSpend ?? 0) + HAULER_COST;
    recordAccountTransaction(carrierId, 0, "capital-expense", id, `Commissioned ${created.name}`);
    const shipInstitutionId = `ship:${id}`;
    logistics.institutions[shipInstitutionId] = {
      id: shipInstitutionId, name: created.name, referenceId: `HAUL-${index}-RELIEF`,
      archetypeId: "cargo-ship", controllerInstitutionId: carrierId, wear: 0, issueCount: 0,
    };
    logistics.haulers[id] = {
      shipInstitutionId, carrierInstitutionId: carrierId, currentSiteId: homeSiteId,
      activeShipmentId: null, activeMovementId: null, maintenanceRequested: false,
      lastDecisionKey: null, status: "seeking-work", idleSince: null,
    };
    shipById.set(id, created);
    appendHistory("carrier.haulerHired", { carrierInstitutionId: carrierId, haulerId: id, cost: HAULER_COST });
    state.ledger.recordEvent("carrier.haulerHired", {
      carrierInstitutionId: carrierId, haulerId: id, shipName: created.name,
      cost: HAULER_COST, fleetSize: Object.keys(logistics.haulers).length,
      balance: Math.round(carrier.accounts.operating.balance),
    }, { visible: true, message: `${carrier.name ?? carrierId} put ${created.name} into service for ${HAULER_COST} cr — every ship it had was committed with freight still waiting.` });
    return true;
  }

  function layUpHauler(haulerId, hauler, carrierId, carrier) {
    const idleSeconds = Math.round((now() - (hauler.idleSince ?? now())) / 1000);
    const ship = shipById.get(haulerId);
    if (ship) ship.isAlive = false;
    shipById.delete(haulerId);
    delete logistics.haulers[haulerId];
    const shipInstitution = logistics.institutions[hauler.shipInstitutionId];
    if (shipInstitution) {
      shipInstitution.status = "retired";
      shipInstitution.retiredAt = now();
    }
    retireDiagnostic(state, haulerId, {
      summary: `Laid up by ${carrier.name ?? carrierId} after ${idleSeconds}s without freight`,
      at: now(),
    });
    decommissionHauler?.(haulerId);
    appendHistory("carrier.haulerLaidUp", { carrierInstitutionId: carrierId, haulerId, idleSeconds });
    state.ledger.recordEvent("carrier.haulerLaidUp", {
      carrierInstitutionId: carrierId, haulerId, idleSeconds,
      fleetSize: Object.keys(logistics.haulers).length,
    }, { visible: true, message: `${carrier.name ?? carrierId} laid up ${haulerId} after ${idleSeconds}s with no freight to carry.` });
  }

  function countActiveForTemplate(templateId) { return Object.values(logistics.shipments).filter((entry) => entry.templateId === templateId && ["assigned", "loaded"].includes(entry.status)).length; }
  function appendHistory(type, payload) {
    logistics.counters.history = (logistics.counters.history ?? logistics.history.length) + 1;
    appendBoundedHistory(logistics.history, { id: `log-history-${logistics.counters.history}`, type, at: now(), ...payload });
  }
  // `update` runs a whole tick; `observe`/`decide` let the clock place each
  // phase against every other system's matching phase. There is no `settle` —
  // see the note above `observe`.
  return { update, observe, decide, assignNpcShipment, acceptPlayerContract, loadPlayerContract, deliverPlayerContract, getState: () => logistics };
}

export function createStandingFreightJob(template, issuer = null, postedRate = null) {
  // The player is offered the rate the carriers are actually being offered. It
  // may have been raised above the opening budget to attract somebody, and
  // quoting the base here would undercut the player against the NPC market.
  const credits = postedRate ?? template.payment;
  return { id: `player-${template.id}`, type: "cargo-run", group: "standing-freight", jobKind: "logistics", repeatable: true, jobTier: "standing", jobTierLabel: "Standing Freight", title: `${template.commodityName} to ${template.destinationName}`, issuer: issuer ?? template.originName, summary: `Load ${template.amount} ${template.commodityName} at ${template.originName} and deliver to ${template.destinationName}.`, terms: { commodity: template.commodity, commodityName: template.commodityName, amount: template.amount, originSiteId: template.originSiteId, originName: template.originName, destinationSiteId: template.destinationSiteId, destinationName: template.destinationName, standingFreightTemplateId: template.id }, reward: { credits }, clauses: ["This is a standing regional freight offer shared with independent and institutional carriers.", "One real container is assigned on acceptance; custody and inventory transfer are recorded.", `Load at ${template.originName} and unload at ${template.destinationName}.`], };
}

// The player sees the same board the carriers do: real runs, backed by real
// purchase orders, and nothing at all where no hub has asked for anything.
export function getStandingFreightJobsForSite(siteId, issuer = null, state = null) {
  if (!state) return [];
  const posted = state.logistics?.postedFreightRates ?? {};
  // Offered at BOTH ends of the lane. An NPC hauler may take a run from the far
  // end and fly to the pickup, so the player sees the same board rather than
  // only what happens to originate where they are standing.
  return getProcurementFreightOffers(state)
    .filter((template) => template.originSiteId === siteId || template.destinationSiteId === siteId)
    .map((template) => createStandingFreightJob(template, issuer, posted[template.id] ?? null));
}
