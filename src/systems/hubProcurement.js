// Hub-to-hub procurement: how a settlement gets what it may not dig up itself.
//
// A hub may only commission extraction for the families it holds mining rights
// to, so everything else has to be bought. This module is the buying side of
// that split, and the reason a freight run exists at all.
//
// The chain, in order, with nothing invented at any step:
//
//   1. A hub has a gap in a family it may not mine.
//   2. It discovers every legal, reachable producer with capacity, compares
//      estimated delivered cost, and posts a purchase order to the best one,
//      priced through the shared valuation framework with money committed.
//   3. The supplier accepts only if the offer clears what the material costs it.
//      Accepting raises the supplier's own stock target, which is what makes it
//      commission more mining — it digs for a sale it has agreed to, not because
//      an authored order told it to. A supplier nobody is buying from walks that
//      price down toward what the next unit would cost it to dig, and comes back
//      to a buyer it has already refused. Both sides move, in both directions.
//   4. Freight is offered only once the supplier actually holds the goods and
//      the buyer has committed to pay. No speculative hauling.
//   5. Delivery pays the supplier for the goods, pays the carrier separately,
//      moves the material into the buyer's inventory, and closes the order.
//
// The freight offer is deliberately shaped like a standing template so the
// existing carrier market prices and assigns it with no special case, and so a
// hauler at either end of the relationship can take it.

import { getEffectiveMaterialUnits, getInstitutionalFeedstockTradeValue, getPhysicalUnitsForEffective, getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260822-1210-0987ae13";
import { getImportFamilies, getInventoryPosition, getMinedFamilies } from "./hubInventory.js?v=fresh-20260822-1210-0987ae13";
import { STANDING_MINING_ORDERS, getStandingMiningDefinitions } from "./miningOperation.js?v=fresh-20260822-1210-0987ae13";
import { isHubAggregated } from "./simulationMode.js?v=fresh-20260822-1210-0987ae13";
import { evaluateProcurement, evaluateSupplierAsk, urgencyFromCoverage } from "./valuation.js?v=fresh-20260822-1210-0987ae13";
import { getUnitCost } from "./costBasis.js?v=fresh-20260822-1210-0987ae13";
import { getActorOfferTypes, getActorProtectedCash, getActorTraits } from "./actorConfig.js?v=fresh-20260822-1210-0987ae13";
import { BLOCKER_KIND, DIAGNOSTIC_STATE, clearBlocker, createBlocker, recordBlocker, recordDecision } from "./diagnostics.js?v=fresh-20260822-1210-0987ae13";
import { getGoodwill, getRelationshipProjection } from "./relationshipProjections.js?v=fresh-20260822-1210-0987ae13";
import { resolveNegotiationPolicy } from "./negotiation.js?v=fresh-20260822-1210-0987ae13";
import { shouldActThisTick } from "./detailLevel.js?v=fresh-20260822-1210-0987ae13";
import { createTransportationNetwork, findTransportationRoute } from "./transportationPlanning.js?v=fresh-20260822-1210-0987ae13";
import { FIRST_REACH_TRANSPORT_CONNECTIONS } from "../content/transportation/firstReachNetwork.js?v=fresh-20260822-1210-0987ae13";

export const PROCUREMENT_STATUS = Object.freeze({
  OFFERED: "offered",       // posted, waiting for a supplier to accept
  ACCEPTED: "accepted",     // supplier committed; it will mine toward this
  READY: "ready",           // supplier holds the goods; freight may be offered
  SHIPPED: "shipped",       // a carrier has it
  DELIVERED: "delivered",   // goods and money have changed hands
  WITHHELD: "withheld",     // buyer cannot fund it; visible, not silent
  DECLINED: "declined",     // no supplier will sell at this price
});

const OPEN_STATUSES = Object.freeze([PROCUREMENT_STATUS.OFFERED, PROCUREMENT_STATUS.ACCEPTED, PROCUREMENT_STATUS.READY, PROCUREMENT_STATUS.SHIPPED]);

// Cap on a single purchase so a large gap arrives as several runs.
const MAX_ORDER_UNITS = 6;
// Below this a hub waits rather than opening an order: single-unit top-ups
// generate more paperwork and freight than the material is worth.
const MIN_ORDER_UNITS = 2;
// A supplier will not owe more than it can realistically dig in the near term.
// Without this it says yes to everything, every acceptance raises its own stock
// target, and it ends up owing a hundred units it mines six at a time.
const MAX_OUTSTANDING_SALE_UNITS = 12;
// A buyer will not have more than this many purchases open on one family at
// once. The gap it is ordering against does not close until goods actually
// arrive, so without a cap it re-posts every single tick.
const MAX_OPEN_ORDERS_PER_FAMILY = 1;
// Opening freight is a route quote, not a percentage of the ore invoice.
// Otherwise a cheap material on a long road can never pay the same ship that
// would happily carry an expensive material over that identical road.
const FREIGHT_BASE_OPERATING_COST_PER_DISTANCE = 0.004;
const FREIGHT_BASE_WEAR_PER_DISTANCE = 0.00016;
const FREIGHT_BASE_SERVICE_CYCLE_COST = 1800;
const FREIGHT_BASE_SERVICE_CYCLE_WEAR = 6;
const FREIGHT_BASE_MARGIN = 0.2;
// Refused orders are kept long enough to read, then cleared so the board stays
// legible instead of accumulating thousands of dead rows.
const DECLINED_RETENTION_MS = 5 * 60 * 1000;
const MAX_DELIVERED_ORDER_HISTORY = 80;
// Fallback only. A hub decides through whoever runs it, so both its buying and
// its selling read that person's traits — the same hub, two roles, one
// temperament. These constants apply only to a settlement with nobody in
// charge, which no seeded hub is.
const UNRUN_HUB_TRAITS = Object.freeze({ urgencyBias: 0.5, caution: 0.5, growthBias: 0.3 });
//
// HOW A HUB HAGGLES NOW LIVES IN `negotiation`.
//
// Seven constants used to sit here and decide the entire negotiation for
// everybody: how long a buyer waited before raising, how far it would ever go,
// how long a refused buyer sat out, how often a seller revisited its ask, how
// deep it cut, how fast it firmed back up, and how quiet its book had to be
// before it discounted at all. Six authored temperaments met those seven
// numbers and haggled identically.
//
// They are policy now, resolved per hub from whoever runs it — tempo from
// urgencyBias, reach from growthBias, margin from caution. A hub with neutral
// traits still gets exactly the numbers that were here, so the baseline did not
// move; only the spread around it appeared.
//
// The one downward force on price still works the same way: every repricing
// path is a BUYER bidding up, so without a seller conceding, a price that has
// risen could never come back. What changed is that a seller now comes down at
// its own pace rather than everyone's.

export function estimateOpeningFreightBudget(distance = 0) {
  const routeDistance = Math.max(0, Number(distance) || 0);
  const travel = routeDistance * FREIGHT_BASE_OPERATING_COST_PER_DISTANCE;
  const maintenance = (routeDistance * FREIGHT_BASE_WEAR_PER_DISTANCE / FREIGHT_BASE_SERVICE_CYCLE_WEAR)
    * FREIGHT_BASE_SERVICE_CYCLE_COST;
  return Math.max(80, Math.ceil((travel + maintenance) * (1 + FREIGHT_BASE_MARGIN)));
}

// The settlements in this world are whichever institutions their archetype says
// can buy and sell material. Nothing here enumerates them.
//
// This replaced a three-entry table whose KEYS were iterated to decide who
// posts purchase orders — so the hub roster was defined by a constant in a
// system module, and a fourth settlement could not exist without editing this
// file. A settlement is now a seed entry.
export function listSettlementIds(state) {
  return Object.values(state.logistics?.institutions ?? {})
    .filter((institution) => getActorOfferTypes(state, institution.id).includes("purchase"))
    .map((institution) => institution.id);
}

// Where an institution physically sits, and what to call it — both read off the
// record, so a settlement whose site is not its own id says so itself.
export function hubSiteId(state, institutionId) {
  return state.logistics?.institutions?.[institutionId]?.siteId ?? institutionId;
}

export function hubNameOf(state, institutionId) {
  return state.logistics?.institutions?.[institutionId]?.name ?? institutionId;
}

export function createInitialProcurementState() {
  return { orders: {}, counter: 0, asks: {}, unavailable: {} };
}

// How far a supplier has come down off its list price on one material, 0..1.
// Exported so the state can be inspected without reaching into the shape.
export function getAskConcession(state, supplierInstitutionId, resourceId) {
  return state.hubProcurement?.asks?.[`${supplierInstitutionId}|${resourceId}`]?.concession ?? 0;
}

// What this supplier is asking for one unit right now, and the band it moves
// in. The band is the reading: an ask sitting on `marginalCost` is a seller
// with nothing to sell, one pinned to `firmCost` is a seller with a full book.
//
// Exported because the operation's own pricing used to live only inside its
// closure, so anything wanting to READ the current ask — an inspector, a chart,
// a test — had to re-derive it and would silently drift from the real rule.
export function getSupplierAskPrice(state, supplierInstitutionId, resourceId) {
  const marginalCost = getInstitutionalFeedstockTradeValue(resourceId);
  const bookCost = getUnitCost(state, supplierInstitutionId, resourceId) || 0;
  const firmCost = Math.max(bookCost, marginalCost);
  const concession = getAskConcession(state, supplierInstitutionId, resourceId);
  return { ask: firmCost - (firmCost - marginalCost) * concession, marginalCost, firmCost, concession };
}



// Discover every institution that can legally produce this family, then rank
// the alternatives without depending on authored array order. The standing
// extraction definitions are content, not a routing table: more than one row
// may now offer the same family.
export function evaluateSupplierCandidates(state, {
  buyerInstitutionId,
  family,
  units = 1,
  definitions = null,
  connections = FIRST_REACH_TRANSPORT_CONNECTIONS,
} = {}) {
  definitions ??= getStandingMiningDefinitions(state);
  const institutions = state.logistics?.institutions ?? {};
  const destinationIds = Array.from(new Set(connections.flatMap((connection) => [connection.fromId, connection.toId])));
  const network = createTransportationNetwork({ destinations: destinationIds.map((id) => ({ id })), connections });
  const buyerSiteId = hubSiteId(state, buyerInstitutionId);
  const hasMiningAuthority = (institutionId, candidateFamily) => Object.values(state.worldRecords?.authorityGrants ?? {})
    .some((grant) => grant.holderId === `institution:${institutionId}`
      && grant.status !== "revoked" && grant.status !== "expired" && grant.status !== "void"
      && grant.limits?.rightTypes?.includes("mining")
      && (grant.limits?.resourceFamilies ?? []).includes(candidateFamily));

  return definitions
    .filter((definition) => !isHubAggregated(state, definition.buyerInstitutionId))
    .filter((definition) => getResourceFamily(definition.resourceId) === family)
    .map((definition) => {
      const institutionId = definition.buyerInstitutionId;
      const supplier = institutions[institutionId] ?? null;
      const reasons = [];
      // The definition is installed capacity; the grant is permission to use
      // it. Both are required, so a broad enabling charter cannot fabricate a
      // mine and a physical mine cannot operate without authority.
      const legal = hasMiningAuthority(institutionId, family);
      const route = supplier && institutionId !== buyerInstitutionId
        ? findTransportationRoute(network, hubSiteId(state, institutionId), buyerSiteId)
        : null;
      const committed = supplier ? getCommittedSupply(state, institutionId, family) : 0;
      const capacityRemaining = Math.max(0, MAX_OUTSTANDING_SALE_UNITS - committed);
      const availableUnits = supplier?.inventories?.[definition.resourceId] ?? 0;
      const relationship = getRelationshipProjection(state, { fromId: buyerInstitutionId, toId: institutionId });
      // The shortage is expressed in effective units, while the ship, title,
      // and supplier book remain physical. Keep each purchase inside the
      // ordinary six-crate freight lot even for bulky low-yield material.
      const physicalUnits = Math.min(MAX_ORDER_UNITS, getPhysicalUnitsForEffective(definition.resourceId, units));
      const effectiveUnits = getEffectiveMaterialUnits(definition.resourceId, physicalUnits);
      const unitCost = Math.max(getUnitCost(state, institutionId, definition.resourceId) || 0, getInstitutionalFeedstockTradeValue(definition.resourceId));
      const quote = supplier ? evaluateSupplierAsk({
        workId: `supply ${physicalUnits} ${definition.resourceId}`,
        costComponents: { other: unitCost * physicalUnits },
        traits: getActorTraits(state, institutionId, UNRUN_HUB_TRAITS),
        relationship,
        concession: getAskConcession(state, institutionId, definition.resourceId),
      }) : null;
      const freightCost = route ? estimateOpeningFreightBudget(route.distance) : Infinity;
      // Existing stock is preferable to promised future extraction, but the
      // penalty is deliberately modest: distance and price remain meaningful.
      const productionDelayCost = Math.max(0, physicalUnits - availableUnits) * getInstitutionalFeedstockTradeValue(definition.resourceId) * 0.05;
      const deliveredCost = quote ? quote.recommendedPrice + freightCost + productionDelayCost : Infinity;
      const deliveredCostPerEffectiveUnit = deliveredCost / Math.max(0.01, effectiveUnits);

      if (!supplier) reasons.push("supplier institution is not present");
      if (institutionId === buyerInstitutionId) reasons.push("buyer cannot supply itself through import procurement");
      if (!legal) reasons.push(`supplier holds no ${family} mining right`);
      if (!route) reasons.push("no transportation route reaches the buyer");
      if (capacityRemaining < physicalUnits) reasons.push(`only ${capacityRemaining} physical units of sale capacity remain`);
      if (quote) reasons.push(...quote.reasons);
      if (route) reasons.push(`Delivery route is ${route.distance}u; estimated freight cost ${freightCost} cr.`);
      if (productionDelayCost > 0) reasons.push(`${Math.max(0, physicalUnits - availableUnits)} physical units require production before pickup.`);

      const eligible = Boolean(supplier)
        && institutionId !== buyerInstitutionId
        && legal
        && Boolean(route)
        && capacityRemaining >= physicalUnits;
      return {
        institutionId,
        resourceId: definition.resourceId,
        physicalUnits,
        effectiveUnits,
        eligible,
        score: eligible ? -deliveredCostPerEffectiveUnit : -Infinity,
        deliveredCost,
        deliveredCostPerEffectiveUnit,
        goodsAsk: quote?.recommendedPrice ?? Infinity,
        freightCost,
        productionDelayCost,
        routeDistance: route?.distance ?? null,
        availableUnits,
        committedUnits: committed,
        capacityRemaining,
        reasons,
      };
    })
    .sort((first, second) => Number(second.eligible) - Number(first.eligible)
      || second.score - first.score
      || first.institutionId.localeCompare(second.institutionId)
      || first.resourceId.localeCompare(second.resourceId));
}

export function listOrders(state, { status = null, buyerInstitutionId = null, supplierInstitutionId = null } = {}) {
  return Object.values(state.hubProcurement?.orders ?? {}).filter((order) => {
    if (status && !(Array.isArray(status) ? status.includes(order.status) : order.status === status)) return false;
    if (buyerInstitutionId && order.buyerInstitutionId !== buyerInstitutionId) return false;
    if (supplierInstitutionId && order.supplierInstitutionId !== supplierInstitutionId) return false;
    return true;
  });
}

// Units a supplier has agreed to sell and not yet delivered. hubInventory adds
// this to the supplier's own target, so an accepted sale is what makes it mine.
// Material physically at this hub that belongs to somebody else, by resource.
export function getAwaitingPickup(state, hubInstitutionId, resourceId = null) {
  const held = state.logistics?.institutions?.[hubInstitutionId]?.awaitingPickup ?? {};
  return Object.values(held)
    .filter((entry) => !resourceId || entry.resourceId === resourceId)
    .reduce((sum, entry) => sum + (entry.units ?? 0), 0);
}

// Material this hub has mined against a sale but not yet been paid for.
export function getSaleReserve(state, hubInstitutionId, resourceId = null) {
  const reserve = state.logistics?.institutions?.[hubInstitutionId]?.saleReserve ?? {};
  const orders = state.hubProcurement?.orders ?? {};
  return Object.entries(reserve).reduce((sum, [orderId, units]) => {
    const order = orders[orderId];
    if (resourceId && order?.resourceId !== resourceId) return sum;
    return sum + (units ?? 0);
  }, 0);
}

export function getCommittedSupply(state, supplierInstitutionId, family) {
  return listOrders(state, { supplierInstitutionId, status: [PROCUREMENT_STATUS.ACCEPTED, PROCUREMENT_STATUS.READY] })
    .filter((order) => order.family === family)
    .reduce((sum, order) => sum + Math.max(0, order.units - order.deliveredUnits), 0);
}

// Units already on order for a buyer, so it does not order the same gap twice.
export function getIncomingProcurement(state, buyerInstitutionId, family) {
  return listOrders(state, { buyerInstitutionId, status: OPEN_STATUSES })
    .filter((order) => order.family === family)
    .reduce((sum, order) => sum + getEffectiveMaterialUnits(
      order.resourceId,
      Math.max(0, order.units - order.deliveredUnits),
    ), 0);
}

// Freight offers derived from orders whose goods actually exist. Shaped like a
// standing template so the carrier market handles them with no special case.
export function getProcurementFreightOffers(state) {
  return listOrders(state, { status: PROCUREMENT_STATUS.READY })
    .filter((order) => !isHubAggregated(state, order.buyerInstitutionId) && !isHubAggregated(state, order.supplierInstitutionId))
    .map((order) => ({
    id: `procurement-${order.id}`,
    procurementOrderId: order.id,
    dynamic: true,
    originSiteId: hubSiteId(state, order.supplierInstitutionId),
    originName: hubNameOf(state, order.supplierInstitutionId),
    destinationSiteId: hubSiteId(state, order.buyerInstitutionId),
    destinationName: hubNameOf(state, order.buyerInstitutionId),
    commodity: order.resourceId,
    commodityName: order.resourceId.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    amount: order.units,
    payment: order.freightBudget,
    issuerInstitutionId: order.buyerInstitutionId,
    sourceInstitutionId: order.supplierInstitutionId,
    destinationInstitutionId: order.buyerInstitutionId,
    // The goods are already bought and already the buyer's. Freight moves
    // property, it does not buy it, so the carrier run must not pay the seller
    // a second time or draw from the seller's own stock.
    prepaid: true,
    manifestId: order.manifestId ?? null,
  }));
}

export function createHubProcurementOperation({ state, now = () => Date.now() }) {
  state.hubProcurement ??= createInitialProcurementState();
  const procurement = state.hubProcurement;
  procurement.orders ??= {};
  procurement.counter ??= 0;
  procurement.asks ??= {};
  procurement.unavailable ??= {};

  const institution = (id) => state.logistics?.institutions?.[id] ?? null;
  const hubName = (id) => hubNameOf(state, id);
  const siteOf = (id) => hubSiteId(state, id);

  // Four distinct places material can be, and it is only ever in one:
  //
  //   hub.inventories          the hub's own stock, free to consume
  //   hub.saleReserve          mined against an accepted sale, earmarked, NOT
  //                            yet paid for and NOT available to consume
  //   hub.awaitingPickup       sold and paid for, owned by the BUYER, still
  //                            sitting physically at the seller
  //   buyer.inventories        delivered
  //
  // Keeping these apart is the whole point: a supplier that accepts a sale must
  // not be able to mine the ore and then eat it itself.
  function saleReserve(hub) {
    hub.saleReserve ??= {};
    return hub.saleReserve;
  }

  function awaitingPickup(hub) {
    hub.awaitingPickup ??= {};
    return hub.awaitingPickup;
  }

  // Move whatever the hub has spare into the allocations it owes, oldest first,
  // so an early contract is not starved by a later one.
  function fillReservations() {
    listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })
      .sort((first, second) => (first.acceptedAt ?? 0) - (second.acceptedAt ?? 0))
      .forEach((order) => {
        const supplier = institution(order.supplierInstitutionId);
        if (!supplier) return;
        const reserve = saleReserve(supplier);
        const already = reserve[order.id] ?? 0;
        const owed = Math.max(0, order.units - already);
        if (owed <= 0) return;

        const spare = supplier.inventories?.[order.resourceId] ?? 0;
        const moved = Math.min(owed, spare);
        if (moved <= 0) return;
        supplier.inventories[order.resourceId] = spare - moved;
        reserve[order.id] = already + moved;
        emit("procurement.reserveFilled", `${hubName(order.supplierInstitutionId)} set aside ${moved} ${order2Label(order.resourceId)} against ${order.id} (${reserve[order.id]}/${order.units}).`, {
          procurementOrderId: order.id, sellerId: order.supplierInstitutionId, buyerId: order.buyerInstitutionId,
          resourceId: order.resourceId, moved, reserved: reserve[order.id], owed: order.units,
        });
      });
  }

  // The sale completes when the reserve is whole: the buyer pays, ownership
  // moves, and the goods sit at the seller as the buyer's property awaiting
  // transport. Freight is a separate arrangement the BUYER then makes.
  function completeSalesWhenReserved() {
    listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED }).forEach((order) => {
      const supplier = institution(order.supplierInstitutionId);
      const buyer = institution(order.buyerInstitutionId);
      if (!supplier || !buyer) return;
      const reserve = saleReserve(supplier);
      if ((reserve[order.id] ?? 0) < order.units) return;

      const price = order.committedPayment ?? order.units * order.pricePerUnit;
      if ((buyer.accounts?.operating?.balance ?? 0) < price) return;

      // Money moves once, here, for the goods themselves.
      buyer.accounts.operating.balance -= price;
      buyer.accounts.operating.committed = Math.max(0, (buyer.accounts.operating.committed ?? 0) - price);
      supplier.accounts.operating.balance += price;

      delete reserve[order.id];
      const manifestId = `MANIFEST-${order.id}`;
      awaitingPickup(supplier)[order.id] = {
        manifestId,
        orderId: order.id,
        resourceId: order.resourceId,
        units: order.units,
        ownerInstitutionId: order.buyerInstitutionId,
        heldAtInstitutionId: order.supplierInstitutionId,
        paid: price,
        titledAt: now(),
      };
      order.status = PROCUREMENT_STATUS.READY;
      order.readyAt = now();
      order.paidAt = now();
      order.manifestId = manifestId;

      emit("procurement.titleTransferred", `${hubName(order.buyerInstitutionId)} paid ${hubName(order.supplierInstitutionId)} ${price} cr for ${order.units} ${order2Label(order.resourceId)}. The ore is now theirs, still held at ${hubName(order.supplierInstitutionId)} under ${manifestId}, awaiting transport they arrange.`, {
        procurementOrderId: order.id, manifestId,
        buyerId: order.buyerInstitutionId, sellerId: order.supplierInstitutionId,
        resourceId: order.resourceId, units: order.units, price,
        heldAt: order.supplierInstitutionId, ownedBy: order.buyerInstitutionId,
      });
    });
  }

  function emit(type, message, payload) {
    state.ledger.recordEvent(type, payload, { visible: true, message });
  }

  // ── 1 & 2: a gap in a family this hub may not mine becomes an order ──────
  function postNeeds(tick = 0) {
    listSettlementIds(state).forEach((buyerInstitutionId) => {
      if (isHubAggregated(state, buyerInstitutionId)) return;
      const buyer = institution(buyerInstitutionId);
      if (!buyer) return;
      // How closely this settlement is being simulated. A hub nobody is near
      // reconsiders its purchasing every few seconds instead of every one —
      // same code, less often. With no focus set, this is always true and the
      // world behaves exactly as it did. See `detailLevel`.
      if (!shouldActThisTick(state, buyerInstitutionId, { tick })) return;

      getImportFamilies(state, buyerInstitutionId).forEach((position) => {
        const onOrder = getIncomingProcurement(state, buyerInstitutionId, position.family);
        const outstanding = Math.max(0, position.gap - onOrder);
        if (outstanding <= 0) return;

        // An open order is a request already in flight. Piling more on does not
        // make the material arrive sooner, it just fills the board.
        const openForFamily = listOrders(state, { buyerInstitutionId, status: OPEN_STATUSES })
          .filter((entry) => entry.family === position.family).length;
        if (openForFamily >= MAX_OPEN_ORDERS_PER_FAMILY) return;

        // Asking again immediately after being turned down just produces the
        // same refusal, so wait before trying this family again.
        const refusedRecently = listOrders(state, { buyerInstitutionId, status: PROCUREMENT_STATUS.DECLINED })
          .some((entry) => entry.family === position.family
            && now() - (entry.declinedAt ?? 0) < negotiationPolicy(buyerInstitutionId).retryAfterRefusalMs);
        if (refusedRecently) return;

        if (outstanding < MIN_ORDER_UNITS) return;
        const units = Math.min(outstanding, MAX_ORDER_UNITS);
        const supplierCandidates = evaluateSupplierCandidates(state, {
          buyerInstitutionId,
          family: position.family,
          units,
        });
        const supplier = supplierCandidates.find((candidate) => candidate.eligible) ?? null;
        const alternatives = supplierCandidates.map((candidate) => ({
          id: candidate.institutionId,
          label: `${hubName(candidate.institutionId)} · ${order2Label(candidate.resourceId)}`,
          score: Number.isFinite(candidate.score) ? Math.round(candidate.score) : null,
          accepted: candidate.eligible && candidate.institutionId === supplier?.institutionId,
          reason: candidate.eligible
            ? `estimated delivered cost ${Math.round(candidate.deliveredCost)} cr (${Math.round(candidate.deliveredCostPerEffectiveUnit)} per effective unit)`
            : candidate.reasons.filter((reason) => !/^supply .* costs /i.test(reason) && !/^asking /i.test(reason)).join("; "),
          metrics: {
            deliveredCost: Number.isFinite(candidate.deliveredCost) ? Math.round(candidate.deliveredCost) : null,
            deliveredCostPerEffectiveUnit: Number.isFinite(candidate.deliveredCostPerEffectiveUnit)
              ? Math.round(candidate.deliveredCostPerEffectiveUnit)
              : null,
            goodsAsk: Number.isFinite(candidate.goodsAsk) ? candidate.goodsAsk : null,
            freightCost: Number.isFinite(candidate.freightCost) ? candidate.freightCost : null,
            routeDistance: candidate.routeDistance,
            availableUnits: candidate.availableUnits,
            physicalUnits: candidate.physicalUnits,
            effectiveUnits: candidate.effectiveUnits,
            capacityRemaining: candidate.capacityRemaining,
          },
        }));

        if (!supplier) {
          const unavailableKey = `${buyerInstitutionId}|${position.family}`;
          recordDecision(state, buyerInstitutionId, {
            chosen: null,
            alternatives,
            reasons: [`No legal, reachable supplier has capacity for ${units} units of ${position.family}.`],
            at: now(),
          });
          recordBlocker(state, buyerInstitutionId, createBlocker({
            kind: BLOCKER_KIND.ALL_SUPPLIERS_COMMITTED,
            summary: `${hubName(buyerInstitutionId)} found no available supplier for ${units} ${position.family} material`,
            subjectId: buyerInstitutionId,
            waitingFor: "supplier capacity or another supplier",
            wakeOn: ["procurement.orderDelivered", "mining.contractFulfilled", "order-repriced"],
            detail: { family: position.family, units, alternatives },
            at: now(),
          }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
          if (!procurement.unavailable[unavailableKey]) {
            procurement.unavailable[unavailableKey] = { at: now(), alternatives };
            emit("procurement.supplierUnavailable", `${hubName(buyerInstitutionId)} found no available supplier for ${units} ${position.family} material.`, {
              buyerId: buyerInstitutionId,
              family: position.family,
              units,
              reason: supplierCandidates.some((candidate) => candidate.capacityRemaining < units)
                ? "supplier-at-capacity"
                : "no-eligible-supplier",
              supplierCandidates: alternatives,
            });
          }
          return;
        }
        delete procurement.unavailable[`${buyerInstitutionId}|${position.family}`];

        const physicalUnits = supplier.physicalUnits;
        const valuation = evaluateProcurement({
          itemId: supplier.resourceId,
          baseUnitPrice: getInstitutionalFeedstockTradeValue(supplier.resourceId),
          marketUnitValue: getInstitutionalFeedstockTradeValue(supplier.resourceId),
          urgency: urgencyFromCoverage(position),
          inventory: { onHand: position.onHand, incoming: position.incoming + onOrder, target: position.target },
          requestedUnits: physicalUnits,
          account: buyer.accounts?.operating ?? {},
          policy: { protectedCash: getActorProtectedCash(state, buyerInstitutionId) },
          traits: getActorTraits(state, buyerInstitutionId, UNRUN_HUB_TRAITS),
          relationship: getRelationshipProjection(state, { fromId: buyerInstitutionId, toId: supplier.institutionId }),
        });

        if (!valuation.affordable) {
          recordBlocker(state, buyerInstitutionId, createBlocker({
            kind: BLOCKER_KIND.PAYER_CANNOT_AFFORD,
            summary: `${hubName(buyerInstitutionId)} cannot fund ${units} ${position.family} material from ${hubName(supplier.institutionId)}`,
            subjectId: buyerInstitutionId, objectId: supplier.institutionId,
            waitingFor: "sales revenue",
            wakeOn: ["population.goodsPurchased"],
            detail: { family: position.family, units, pricePerUnit: valuation.recommendedPrice },
            at: now(),
          }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
          return;
        }

        const orderUnits = valuation.metrics.units;
        const effectiveUnits = getEffectiveMaterialUnits(supplier.resourceId, orderUnits);
        const committedPayment = orderUnits * valuation.recommendedPrice;
        // Freight is budgeted separately from the goods, so a carrier is paid
        // for hauling and the supplier is paid for the material.
        const freightBudget = Math.max(80, Math.round(supplier.freightCost));
        if ((buyer.accounts.operating.balance ?? 0) < committedPayment + freightBudget + getActorProtectedCash(state, buyerInstitutionId)) return;

        const id = `HPO-${String(++procurement.counter).padStart(4, "0")}`;
        procurement.orders[id] = {
          id,
          buyerInstitutionId, supplierInstitutionId: supplier.institutionId,
          family: position.family, resourceId: supplier.resourceId,
          units: orderUnits, pricePerUnit: valuation.recommendedPrice,
          effectiveUnits,
          // The ceiling is anchored to what this buyer first judged the goods
          // worth, captured at creation. Capturing it at the first reprice
          // instead would let a bad opening price become the baseline.
          originalPricePerUnit: valuation.recommendedPrice,
          committedPayment, freightBudget,
          deliveredUnits: 0, status: PROCUREMENT_STATUS.OFFERED,
          reasons: valuation.reasons, createdAt: now(), shipmentId: null,
          supplierCandidates: alternatives,
        };
        buyer.accounts.operating.committed = (buyer.accounts.operating.committed ?? 0) + committedPayment;

        recordDecision(state, buyerInstitutionId, {
          chosen: {
            id: supplier.institutionId,
            label: `${hubName(supplier.institutionId)} · ${order2Label(supplier.resourceId)}`,
            score: Math.round(supplier.score),
            metrics: alternatives.find((candidate) => candidate.id === supplier.institutionId)?.metrics ?? {},
          },
          alternatives,
          reasons: [`Selected the lowest estimated delivered cost among ${supplierCandidates.filter((candidate) => candidate.eligible).length} eligible supplier(s).`],
          at: now(),
        });

        emit("procurement.orderPosted", `${hubName(buyerInstitutionId)} offered ${hubName(supplier.institutionId)} ${valuation.recommendedPrice} cr per unit for ${orderUnits} ${order2Label(supplier.resourceId)}, because it cannot mine ${position.family} itself.`, {
          procurementOrderId: id, buyerId: buyerInstitutionId, sellerId: supplier.institutionId,
          family: position.family, resourceId: supplier.resourceId, units: orderUnits, effectiveUnits,
          pricePerUnit: valuation.recommendedPrice, committedPayment, freightBudget,
          gap: position.gap, target: position.target, onHand: position.onHand,
          reasons: valuation.reasons,
          supplierCandidates: alternatives,
        });
      });
    });
  }

  // ── 2b: the seller's half of the negotiation ─────────────────────────────
  //
  // A hub sells at two different prices depending on how busy it is. With a
  // full book it holds out for what the material has actually cost it to put on
  // the shelf. With a slack one that history is sunk, and the only number that
  // matters is what digging one more unit would cost — which is what it walks
  // its ask down toward, one step a minute, and no further.
  function askRecord(supplierInstitutionId, resourceId) {
    const key = `${supplierInstitutionId}|${resourceId}`;
    procurement.asks[key] ??= { supplierInstitutionId, resourceId, concession: 0, lastMovedAt: 0 };
    return procurement.asks[key];
  }

  // What one more unit would really cost: the rate a miner takes at routine
  // urgency against a full shelf, which is the plain trade value. Scarcity
  // premiums this hub paid while it was short are history, not the cost of the
  // next unit — but they are what it holds out to recover while it can.
  //
  // Both now read `getSupplierAskPrice` so the exported rule and the rule the
  // operation actually prices with cannot drift apart.
  function unitCostBand(supplierInstitutionId, resourceId) {
    const { marginalCost, firmCost } = getSupplierAskPrice(state, supplierInstitutionId, resourceId);
    return { marginalCost, firmCost };
  }

  function shadedUnitCost(supplierInstitutionId, resourceId) {
    return getSupplierAskPrice(state, supplierInstitutionId, resourceId).ask;
  }

  // The supplier's terms on one order, at whatever it is currently asking.
  // Writing the result back onto the order keeps the numbers the buyer reprices
  // against live: a seller that has since come down pulls the buyer down with
  // it rather than leaving a stale demand standing.
  function evaluateAsk(order) {
    const concession = askRecord(order.supplierInstitutionId, order.resourceId).concession ?? 0;
    const unitCost = shadedUnitCost(order.supplierInstitutionId, order.resourceId);
    const ask = evaluateSupplierAsk({
      workId: order.id,
      costComponents: { other: unitCost * order.units },
      offeredPrice: order.pricePerUnit * order.units,
      traits: getActorTraits(state, order.supplierInstitutionId, UNRUN_HUB_TRAITS),
      concession,
    });
    order.supplierFloor = ask.minAcceptablePrice ?? null;
    order.supplierAsk = ask.recommendedPrice ?? null;
    return ask;
  }

  // Idle means two things at once: room on the order book it is not filling,
  // and nothing left to dig — its shelf already covers its own population and
  // everything it has promised. Ore it cannot move and capacity to spare.
  //
  // Deliberately NOT "owes nobody anything". A supplier with a trickle of
  // business is still mostly unsold, and requiring an empty book would mean a
  // price that has risen only ever comes back down in a dead economy.
  // How this hub bargains — tempo, reach and margin, resolved from whoever runs
  // it. See `negotiation`; these were seven module constants applied to every
  // settlement alike.
  function negotiationPolicy(institutionId) {
    return resolveNegotiationPolicy(state, institutionId);
  }

  function isSupplierIdle(supplierInstitutionId, resourceId) {
    const position = getInventoryPosition(state, supplierInstitutionId, getResourceFamily(resourceId));
    // How quiet the book must be before this seller counts it as quiet. A
    // careful one wants it clearly empty; an eager one calls it early.
    const slack = negotiationPolicy(supplierInstitutionId).slackCapacityFraction;
    return position.committedSales < MAX_OUTSTANDING_SALE_UNITS * slack
      && position.gap <= 0;
  }

  function updateSupplierAsks() {
    getStandingMiningDefinitions(state).forEach((definition) => {
      const supplierInstitutionId = definition.buyerInstitutionId;
      if (isHubAggregated(state, supplierInstitutionId)) return;
      if (!institution(supplierInstitutionId)) return;
      const record = askRecord(supplierInstitutionId, definition.resourceId);
      const policy = negotiationPolicy(supplierInstitutionId);
      if (now() - (record.lastMovedAt ?? 0) < policy.concessionIntervalMs) return;
      record.lastMovedAt = now();

      const idle = isSupplierIdle(supplierInstitutionId, definition.resourceId);
      const previous = record.concession ?? 0;
      // How far it moves in one step, each direction its own instinct: appetite
      // for business decides how deep it cuts, care for its margin decides how
      // fast it comes back up.
      // Rounded so repeated steps stay readable numbers rather than float dust.
      const concession = Math.round(100 * (idle
        ? Math.min(1, previous + policy.concessionStep)
        : Math.max(0, previous - policy.concessionFirmStep))) / 100;
      if (concession === previous) return;
      record.concession = concession;

      const { marginalCost, firmCost } = unitCostBand(supplierInstitutionId, definition.resourceId);
      const unitCost = shadedUnitCost(supplierInstitutionId, definition.resourceId);
      emit("institution.askShaded", idle
        ? `${hubName(supplierInstitutionId)} has ${order2Label(definition.resourceId)} it cannot move and room on its books, so it comes down to ${Math.round(unitCost)} cr per unit.`
        : `${hubName(supplierInstitutionId)} has its books full of ${order2Label(definition.resourceId)} again and firms back up toward ${Math.round(firmCost)} cr per unit.`, {
        sellerId: supplierInstitutionId, itemId: definition.resourceId,
        previousConcession: previous, concession, idle,
        unitCost: Math.round(unitCost), firmCost: Math.round(firmCost), marginalCost: Math.round(marginalCost),
        reasons: [
          idle
            ? `${hubName(supplierInstitutionId)} has dug everything it owes and everything its own population needs, and could sell more than it has.`
            : `${hubName(supplierInstitutionId)} has ${order2Label(definition.resourceId)} sold again, so it stops working thin.`,
          `It has paid ${Math.round(firmCost)} cr per unit on average and the next unit would cost it ${Math.round(marginalCost)}.`,
          `Now asking from ${Math.round(unitCost)} cr per unit, ${Math.round(concession * 100)}% of the way down.`,
        ],
      });
    });
  }

  // A seller that has come down far enough to live with an offer it already
  // refused goes back to the buyer rather than waiting to be asked again. This
  // is the counter-offer: the deal closes without the buyer moving at all.
  function reopenOnConcession() {
    listOrders(state, { status: PROCUREMENT_STATUS.DECLINED }).forEach((order) => {
      if (order.declinedReason !== "below-supplier-cost") return;
      const supplier = institution(order.supplierInstitutionId);
      const buyer = institution(order.buyerInstitutionId);
      if (!supplier || !buyer) return;

      // Restate the terms first even when nothing comes of it, so the number
      // the buyer reprices against is always the seller's current one.
      const previousFloor = order.supplierFloor;
      const ask = evaluateAsk(order);
      if (!ask.acceptable) return;

      // Price was the objection. Capacity is a different one, and asking less
      // no more answers it than paying more does.
      if (getCommittedSupply(state, order.supplierInstitutionId, order.family) + order.units > MAX_OUTSTANDING_SALE_UNITS) return;

      // The buyer released this money when it was turned down, so it has to be
      // able to set it aside again before the order can go back on the table.
      const spendable = (buyer.accounts?.operating?.balance ?? 0) - (buyer.accounts?.operating?.committed ?? 0) - getActorProtectedCash(state, order.buyerInstitutionId);
      if ((order.committedPayment ?? 0) > spendable) return;

      order.status = PROCUREMENT_STATUS.OFFERED;
      order.declinedReason = null;
      order.declinedAt = null;
      order.reopenedAt = now();
      // A buyer does not bid against a seller that just came to it.
      order.lastRepricedAt = now();
      order.repriceExhausted = false;
      buyer.accounts.operating.committed = (buyer.accounts.operating.committed ?? 0) + order.committedPayment;

      emit("procurement.counterOffered", `${hubName(order.supplierInstitutionId)} comes back to ${hubName(order.buyerInstitutionId)}: it will take the ${order.committedPayment} cr it turned down for ${order.units} ${order2Label(order.resourceId)} after all.`, {
        procurementOrderId: order.id, sellerId: order.supplierInstitutionId, buyerId: order.buyerInstitutionId,
        units: order.units, offered: order.committedPayment,
        previousFloor: previousFloor ?? null, floor: ask.minAcceptablePrice,
        concession: askRecord(order.supplierInstitutionId, order.resourceId).concession,
        reasons: [
          `${hubName(order.supplierInstitutionId)} wanted ${previousFloor ?? "more"} cr for this lot and was offered ${order.committedPayment}.`,
          `Sitting on ore it cannot move, it will now take ${ask.minAcceptablePrice}.`,
          ...ask.reasons,
        ],
      });
    });
  }

  // ── 3: a supplier accepts only if the price clears what the goods cost it ──
  // A seller answering everyone who asked, in one clearing.
  //
  // WHY THIS IS A CLEARING AND NOT A LOOP: this used to walk the offered orders
  // in creation order and accept greedily against live capacity, so the FIRST
  // offer written to a supplier took the room and later ones were told
  // `supplier-at-capacity`. Creation order comes from `postNeeds`, which
  // iterates `listSettlementIds` — `Object.values(logistics.institutions)`,
  // i.e. SEED INSERTION ORDER. So whichever settlement happened to be defined
  // first in the content files got served first whenever a supplier was
  // oversubscribed, and it read as commercial advantage when it was really
  // array order.
  //
  // That is exactly what `extractionMarket` was built to remove one domain
  // over, where Cinder won every auction because its `update()` ran first. Read
  // that module's header for the reasoning; this is the same fix on the selling
  // side.
  //
  // PRICE FIRST, THEN CAPACITY. A seller will not sell below its own cost to
  // anybody, and that judgement has nothing to do with who else is asking — so
  // unaffordable offers are refused before the room is shared out, and capacity
  // is only ever allocated among offers the seller would genuinely take.
  function considerOffers() {
    const viable = [];

    listOrders(state, { status: PROCUREMENT_STATUS.OFFERED }).forEach((order) => {
      const supplier = institution(order.supplierInstitutionId);
      if (!supplier) return;

      // The terms carry whatever this seller is currently asking, and are
      // written back onto the order: that floor is the number the buyer moves
      // toward when it reprices, which is what lets the two sides converge
      // instead of restating the same offer at each other.
      const ask = evaluateAsk(order);

      if (!ask.acceptable) {
        order.status = PROCUREMENT_STATUS.DECLINED;
        order.declinedReason = "below-supplier-cost";
        order.declinedAt = now();
        order.reasons = ask.reasons;
        releaseCommitment(order);
        emit("procurement.orderDeclined", `${hubName(order.supplierInstitutionId)} will not sell ${order.units} ${order2Label(order.resourceId)} for ${order.committedPayment} cr; it needs at least ${ask.minAcceptablePrice}.`, {
          procurementOrderId: order.id, sellerId: order.supplierInstitutionId, buyerId: order.buyerInstitutionId,
          offered: order.committedPayment, floor: ask.minAcceptablePrice, reasons: ask.reasons,
        });
        return;
      }

      viable.push({ order, ask });
    });

    // Capacity is held per supplier AND per family, so each is cleared on its
    // own book rather than against some pooled total.
    const books = new Map();
    viable.forEach((entry) => {
      const key = `${entry.order.supplierInstitutionId}|${entry.order.family}`;
      if (!books.has(key)) books.set(key, []);
      books.get(key).push(entry);
    });

    books.forEach((entries, key) => {
      const [supplierInstitutionId, family] = key.split("|");
      const ranked = [...entries].sort(compareSupplierOffers);
      let remaining = Math.max(0, MAX_OUTSTANDING_SALE_UNITS - getCommittedSupply(state, supplierInstitutionId, family));
      const taken = [];

      ranked.forEach(({ order, ask }) => {
        if (order.units <= remaining) {
          remaining -= order.units;
          taken.push(order);
          order.status = PROCUREMENT_STATUS.ACCEPTED;
          order.acceptedAt = now();
          order.supplierReasons = ask.reasons;
          emit("procurement.orderAccepted", `${hubName(order.supplierInstitutionId)} accepted ${order.committedPayment} cr for ${order.units} ${order2Label(order.resourceId)} and will mine toward it.`, {
            procurementOrderId: order.id, sellerId: order.supplierInstitutionId, buyerId: order.buyerInstitutionId,
            units: order.units, committedPayment: order.committedPayment, reasons: ask.reasons,
          });
          return;
        }

        // Turned down for room, not for price. Say who took it — a buyer told
        // only "at capacity" cannot tell being outbid from being unlucky, which
        // is the same hole `extractionMarket.getMarketOutbid` exists to close.
        const alreadyOwed = getCommittedSupply(state, supplierInstitutionId, family);
        order.status = PROCUREMENT_STATUS.DECLINED;
        order.declinedReason = "supplier-at-capacity";
        order.declinedAt = now();
        order.reasons = [
          `${hubName(supplierInstitutionId)} already owes ${alreadyOwed} ${order2Label(order.resourceId)} it has not delivered.`,
          `Taking another ${order.units} would put it past the ${MAX_OUTSTANDING_SALE_UNITS} it can dig in reasonable time.`,
          ...(taken.length > 0
            ? [`It took ${taken.map((entry) => `${hubName(entry.buyerInstitutionId)}'s ${entry.units} at ${Math.round(entry.pricePerUnit)} cr/unit`).join(" and ")} first.`]
            : []),
        ];
        releaseCommitment(order);
        emit("procurement.orderDeclined", `${hubName(supplierInstitutionId)} turned down ${order.units} ${order2Label(order.resourceId)}: it already owes ${alreadyOwed} and will not promise what it cannot mine.`, {
          procurementOrderId: order.id, sellerId: supplierInstitutionId, buyerId: order.buyerInstitutionId,
          reason: "supplier-at-capacity", alreadyOwed, requested: order.units, capacity: MAX_OUTSTANDING_SALE_UNITS,
          // Who got the room instead, so the refusal is falsifiable.
          preferredBuyerIds: taken.map((entry) => entry.buyerInstitutionId),
        });
      });
    });
  }

  // Which offer a seller would rather have, when it cannot have both.
  //
  // MARGIN PER UNIT, not total margin: the scarce thing is units of sale
  // capacity, so the offer worth taking is the one that pays best for each unit
  // of the book it consumes. Ranking by total would simply prefer big orders.
  //
  // Goodwill is a TIEBREAK rather than a weighted term. A seller preferring a
  // customer it trusts is right, but inventing a second weighting scheme here
  // without measuring it would be guessing — `workQueue` earns its weights by
  // being the only thing ordering that queue, and this ranking already has a
  // real economic quantity to lead with.
  //
  // A genuine dead heat breaks on the oldest request, then on a hash of the
  // pair. NOT on institution id: comparing ids would put every tie straight
  // back into the seed order this clearing exists to remove.
  function compareSupplierOffers(first, second) {
    const margin = (entry) => ((entry.order.committedPayment ?? 0) - (entry.ask.minAcceptablePrice ?? 0))
      / Math.max(1, entry.order.units ?? 1);
    const marginGap = margin(second) - margin(first);
    if (Math.abs(marginGap) > 0.000001) return marginGap;

    const goodwill = (entry) => getGoodwill(getRelationshipProjection(state, {
      fromId: entry.order.supplierInstitutionId,
      toId: entry.order.buyerInstitutionId,
    }));
    const goodwillGap = goodwill(second) - goodwill(first);
    if (Math.abs(goodwillGap) > 0.000001) return goodwillGap;

    const age = (first.order.createdAt ?? 0) - (second.order.createdAt ?? 0);
    if (age !== 0) return age;

    return offerTieHash(first.order) - offerTieHash(second.order);
  }

  // Capacity is a temporary refusal, not a terminal contract state. Reopen the
  // original order as soon as that supplier has room again, instead of leaving
  // a stale refusal until retention pruning and making the buyer post a copy.
  function reopenCapacityDeclines() {
    listOrders(state, { status: PROCUREMENT_STATUS.DECLINED }).forEach((order) => {
      if (order.declinedReason !== "supplier-at-capacity") return;
      const buyer = institution(order.buyerInstitutionId);
      const supplier = institution(order.supplierInstitutionId);
      if (!buyer || !supplier) return;
      const alreadyOwed = getCommittedSupply(state, order.supplierInstitutionId, order.family);
      if (alreadyOwed + order.units > MAX_OUTSTANDING_SALE_UNITS) return;

      const spendable = (buyer.accounts?.operating?.balance ?? 0)
        - (buyer.accounts?.operating?.committed ?? 0)
        - getActorProtectedCash(state, order.buyerInstitutionId);
      if ((order.committedPayment ?? 0) > spendable) return;

      order.status = PROCUREMENT_STATUS.OFFERED;
      order.declinedReason = null;
      order.declinedAt = null;
      order.reopenedAt = now();
      order.lastRepricedAt = now();
      buyer.accounts.operating.committed = (buyer.accounts.operating.committed ?? 0) + (order.committedPayment ?? 0);
      delete procurement.unavailable[`${order.buyerInstitutionId}|${order.family}`];
      emit("procurement.capacityReopened", `${hubName(order.supplierInstitutionId)} has room again and reopens ${order.id} for ${order.units} ${order2Label(order.resourceId)}.`, {
        procurementOrderId: order.id, sellerId: order.supplierInstitutionId, buyerId: order.buyerInstitutionId,
        units: order.units, alreadyOwed, capacity: MAX_OUTSTANDING_SALE_UNITS,
      });
    });
  }

  // ── 4: goods must actually exist before anything is hauled ───────────────
  // A supplier that owes goods and cannot yet cover them says so, and the
  // buyer can see exactly how short it is.
  function reportOutstandingReservations() {
    const accepted = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED });
    const suppliersStillOwing = new Set(accepted.map((order) => order.supplierInstitutionId));
    Object.values(state.diagnostics?.actors ?? {}).forEach((diagnostic) => {
      if (diagnostic.blocker?.kind !== BLOCKER_KIND.AWAITING_MATERIAL
        || !diagnostic.blocker?.detail?.procurementOrderId
        || suppliersStillOwing.has(diagnostic.actorId)) return;
      clearBlocker(state, diagnostic.actorId, {
        state: DIAGNOSTIC_STATE.FREE,
        summary: `${hubName(diagnostic.actorId)} has filled its outstanding sale reserve`,
        at: now(),
      });
    });
    accepted.forEach((order) => {
      const supplier = institution(order.supplierInstitutionId);
      const reserved = saleReserve(supplier ?? {})[order.id] ?? 0;
      recordBlocker(state, order.supplierInstitutionId, createBlocker({
        kind: BLOCKER_KIND.AWAITING_MATERIAL,
        summary: `${hubName(order.supplierInstitutionId)} owes ${order.units} ${order2Label(order.resourceId)} on ${order.id} and has set aside ${reserved}`,
        subjectId: order.supplierInstitutionId, objectId: order.id,
        waitingFor: `${order.units - reserved} more ${order2Label(order.resourceId)} mined against this contract`,
        wakeOn: ["mining.contractFulfilled"],
        detail: { procurementOrderId: order.id, owed: order.units, reserved },
        at: now(),
      }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
    });
  }
  function releaseCommitment(order) {
    const buyer = institution(order.buyerInstitutionId);
    if (!buyer?.accounts?.operating) return;
    buyer.accounts.operating.committed = Math.max(0, (buyer.accounts.operating.committed ?? 0) - (order.committedPayment ?? 0));
  }

  // Called by logistics when a shipment carrying this order is delivered.
  function completeOrder(orderId, { deliveredUnits, goodsPayment, freightPaid }) {
    const order = procurement.orders[orderId];
    if (!order || order.status === PROCUREMENT_STATUS.DELIVERED) return null;
    order.deliveredUnits += deliveredUnits;
    order.status = PROCUREMENT_STATUS.DELIVERED;
    order.deliveredAt = now();
    releaseCommitment(order);
    emit("procurement.orderDelivered", `${hubName(order.buyerInstitutionId)} received ${deliveredUnits} ${order2Label(order.resourceId)} from ${hubName(order.supplierInstitutionId)} for ${goodsPayment} cr, plus ${freightPaid} cr of freight.`, {
      procurementOrderId: order.id, buyerId: order.buyerInstitutionId, sellerId: order.supplierInstitutionId,
      units: deliveredUnits, goodsPayment, freightPaid, family: order.family,
    });
    return order;
  }

  function markShipped(orderId, shipmentId) {
    const order = procurement.orders[orderId];
    if (!order) return null;
    order.status = PROCUREMENT_STATUS.SHIPPED;
    order.shipmentId = shipmentId;
    return order;
  }

  // A purchase nobody will take raises what it offers, toward what the seller
  // actually said the goods cost it. Bounded by a ceiling on the opening price,
  // throttled to once a minute, and refused outright if the buyer cannot fund
  // the higher bid — an unaffordable raise is deferred and logged, never taken
  // out of the treasury.
  function repriceUnfilledOrders() {
    listOrders(state, { status: [PROCUREMENT_STATUS.OFFERED, PROCUREMENT_STATUS.DECLINED] }).forEach((order) => {
      // A capacity refusal USED TO be excluded here, on the reasoning that
      // "paying more does not conjure ore". That was true while a seller's
      // limited book went to whoever asked first: the price was irrelevant to
      // the refusal, so raising it was pure waste.
      //
      // It stopped being true when `considerOffers` became a clearing. A seller
      // facing more demand than capacity now takes the offers that pay best per
      // unit of book, so bidding up is precisely how an outbid buyer wins the
      // room next time — and refusing to let it try would leave the cheapest
      // bidder permanently starved with no way to answer.
      //
      // Still bounded by the same ceiling and the same throttle as any other
      // raise, so this cannot become a bidding war.
      const policy = negotiationPolicy(order.buyerInstitutionId);
      const lastPricedAt = order.lastRepricedAt ?? order.createdAt ?? 0;
      if (now() - lastPricedAt < policy.repriceIntervalMs) return;

      const buyer = institution(order.buyerInstitutionId);
      if (!buyer) return;
      order.originalPricePerUnit ??= order.pricePerUnit;
      // What this buyer will pay AT MOST, as a multiple of its own opening
      // judgement. A hub set on growing chases further than a conservative one.
      const ceiling = Math.round(order.originalPricePerUnit * policy.repriceMaxMultiple);
      // Move to what the seller said it needs, capped by what this buyer is
      // willing to go to at all.
      // The supplier quotes for the whole lot, so convert to a per-unit price
      // before comparing it with what this buyer is offering per unit.
      const units = Math.max(1, order.units ?? 1);
      const floorPerUnit = order.supplierFloor ? Math.ceil(order.supplierFloor / units) : 0;
      const askPerUnit = order.supplierAsk ? Math.ceil(order.supplierAsk / units) : 0;
      const wanted = Math.max(floorPerUnit, askPerUnit, order.pricePerUnit + 1);
      const nextPrice = Math.min(wanted, ceiling);
      order.lastRepricedAt = now();

      if (nextPrice <= order.pricePerUnit) {
        // Already at the ceiling and still refused: say so once rather than
        // silently retrying forever.
        if (!order.repriceExhausted) {
          order.repriceExhausted = true;
          emit("procurement.repriceExhausted", `${hubName(order.buyerInstitutionId)} will not go above ${order.pricePerUnit} cr per unit for ${order2Label(order.resourceId)}; ${hubName(order.supplierInstitutionId)} wants ${order.supplierFloor ?? "more"}.`, {
            procurementOrderId: order.id, buyerId: order.buyerInstitutionId, sellerId: order.supplierInstitutionId,
            pricePerUnit: order.pricePerUnit, ceiling, supplierFloor: order.supplierFloor ?? null,
          });
        }
        return;
      }

      const additional = (nextPrice - order.pricePerUnit) * order.units;
      const spendable = (buyer.accounts?.operating?.balance ?? 0) - (buyer.accounts?.operating?.committed ?? 0) - getActorProtectedCash(state, order.buyerInstitutionId);
      if (additional > spendable) {
        emit("procurement.repriceDeferred", `${hubName(order.buyerInstitutionId)} would pay ${nextPrice} cr per unit for ${order2Label(order.resourceId)} but cannot commit the extra ${Math.round(additional)} cr.`, {
          procurementOrderId: order.id, buyerId: order.buyerInstitutionId, wanted: nextPrice,
          additional: Math.round(additional), spendable: Math.round(spendable),
        });
        return;
      }

      const previousPrice = order.pricePerUnit;
      order.pricePerUnit = nextPrice;
      order.committedPayment = order.units * nextPrice;
      order.repriceCount = (order.repriceCount ?? 0) + 1;
      order.repriceExhausted = false;
      // A declined order goes back on the table at the new price rather than
      // staying dead, which is the whole point of moving.
      const wasDeclined = order.status === PROCUREMENT_STATUS.DECLINED;
      if (wasDeclined) {
        order.status = PROCUREMENT_STATUS.OFFERED;
        order.declinedReason = null;
      }
      buyer.accounts.operating.committed = (buyer.accounts.operating.committed ?? 0) + (wasDeclined ? order.committedPayment : additional);

      emit("institution.offerRepriced", `${hubName(order.buyerInstitutionId)} raises ${order2Label(order.resourceId)} to ${nextPrice} cr per unit — no deal at ${previousPrice}.`, {
        procurementOrderId: order.id, buyerId: order.buyerInstitutionId, sellerId: order.supplierInstitutionId,
        itemId: order.resourceId, previousPrice, unitPrice: nextPrice, repriceCount: order.repriceCount,
        ceiling,
        reasons: [
          `${hubName(order.supplierInstitutionId)} would not sell at ${previousPrice} cr per unit.`,
          order.supplierFloor ? `It needs at least ${order.supplierFloor} cr for the lot, ${floorPerUnit} per unit.` : "No counter-offer was given.",
          `This buyer will not go above ${ceiling} cr per unit, twice its opening price.`,
        ],
      });
    });
  }

  // Refused orders are readable history for a while, then they are noise.
  function pruneDeclinedOrders() {
    listOrders(state, { status: PROCUREMENT_STATUS.DECLINED }).forEach((order) => {
      if (now() - (order.declinedAt ?? order.createdAt ?? 0) < DECLINED_RETENTION_MS) return;
      delete procurement.orders[order.id];
    });
  }

  function pruneDeliveredOrders() {
    const delivered = listOrders(state, { status: PROCUREMENT_STATUS.DELIVERED })
      .sort((first, second) => (first.deliveredAt ?? first.createdAt ?? 0) - (second.deliveredAt ?? second.createdAt ?? 0));
    delivered.slice(0, Math.max(0, delivered.length - MAX_DELIVERED_ORDER_HISTORY))
      .forEach((order) => { delete procurement.orders[order.id]; });
  }

  // ── The tick, in phases ─────────────────────────────────────────────────
  //
  // Every step keeps the exact position it held before. See `worldClock`.

  // Clear out refusals that have aged out, so the board being read below is the
  // current one. This has to precede `postNeeds`, which consults declined
  // orders to decide whether a family was turned down too recently to ask again.
  function observe() {
    pruneDeclinedOrders();
    pruneDeliveredOrders();
  }

  function decide({ tick = 0 } = {}) {
    postNeeds(tick);
    // Sellers move first, so a buyer never bids up against an ask that has
    // already come down to meet it.
    updateSupplierAsks();
    reopenOnConcession();
    repriceUnfilledOrders();
    // Buyers refused for room get back on the board BEFORE the seller answers,
    // so they are ranked in the same clearing as everyone else.
    //
    // This used to run after `considerOffers`, on the reasoning that fresh
    // offers should resolve first and old refusals could return next pass. That
    // was survivable while a seller took offers in arrival order, but it means
    // a refused buyer is permanently one tick behind: every time room opens,
    // that tick's new orders take it and the buyer waiting longest is refused
    // again. It is the same "who got there first" privilege the clearing below
    // exists to remove, one step upstream, so it moves ahead of it.
    reopenCapacityDeclines();
    considerOffers();
    // Mined ore lands in the seller's own stock; move what is owed into the
    // contract reserve before anything else can consume it, then settle any
    // reserve that is now whole.
    //
    // These two look like settling — they resolve commitments — and they stay
    // in DECIDE anyway. Moving them after every decider would change WHO GETS
    // CONTESTED STOCK FIRST: population consumes hub inventory earlier in this
    // same phase, and mining delivers ore later in it. Reserving before or
    // after those is a real economic decision about whose claim ranks, and it
    // deserves to be made deliberately in its own change rather than as a side
    // effect of tidying phase labels.
    fillReservations();
    completeSalesWhenReserved();
  }

  // Reporting only — nothing here changes what anybody is doing, so it runs
  // after every decision in the world rather than just this system's.
  function settle() {
    reportOutstandingReservations();
  }

  // One whole tick. The clock drives the phases separately; every test and the
  // boot sequence drives this.
  function update({ tick = 0 } = {}) {
    observe();
    decide({ tick });
    settle();
  }

  update();
  return { update, observe, decide, settle, getState: () => procurement, completeOrder, markShipped, listOrders: (filter) => listOrders(state, filter) };
}

// A stable, arbitrary tiebreak for two offers a seller values identically.
// Deliberately a hash rather than an id comparison: sorting by id would put
// every dead heat straight back into the seed order this clearing removes.
// Same device, and the same reason, as `extractionMarket.pairHash`.
function offerTieHash(order) {
  const key = `${order.supplierInstitutionId}|${order.buyerInstitutionId}|${order.id}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function order2Label(resourceId) {
  return resourceId.replaceAll("-", " ");
}
