// Hub-to-hub procurement: how a settlement gets what it may not dig up itself.
//
// A hub may only commission extraction for the families it holds mining rights
// to, so everything else has to be bought. This module is the buying side of
// that split, and the reason a freight run exists at all.
//
// The chain, in order, with nothing invented at any step:
//
//   1. A hub has a gap in a family it may not mine.
//   2. It posts a purchase order at the hub that MAY mine that family, priced
//      through the shared valuation framework, and commits the money.
//   3. The supplier accepts only if the offer clears what the material costs it.
//      Accepting raises the supplier's own stock target, which is what makes it
//      commission more mining — it digs for a sale it has agreed to, not because
//      an authored order told it to.
//   4. Freight is offered only once the supplier actually holds the goods and
//      the buyer has committed to pay. No speculative hauling.
//   5. Delivery pays the supplier for the goods, pays the carrier separately,
//      moves the material into the buyer's inventory, and closes the order.
//
// The freight offer is deliberately shaped like a standing template so the
// existing carrier market prices and assigns it with no special case, and so a
// hauler at either end of the relationship can take it.

import { getResourceFamily, getResourceTradeValue } from "./resourceDefinitions.js?v=fresh-20260801-0028-87a1d54";
import { getImportFamilies, getInventoryPosition, getMinedFamilies } from "./hubInventory.js?v=fresh-20260801-0028-87a1d54";
import { STANDING_MINING_ORDERS } from "./miningOperation.js?v=fresh-20260801-0028-87a1d54";
import { evaluateProcurement, evaluateSupplierAsk } from "./valuation.js?v=fresh-20260801-0028-87a1d54";
import { getUnitCost } from "./costBasis.js?v=fresh-20260801-0028-87a1d54";
import { BLOCKER_KIND, DIAGNOSTIC_STATE, clearBlocker, createBlocker, recordBlocker } from "./diagnostics.js?v=fresh-20260801-0028-87a1d54";

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
const BUYER_PROTECTED_CASH = 300;
// A supplier will not owe more than it can realistically dig in the near term.
// Without this it says yes to everything, every acceptance raises its own stock
// target, and it ends up owing a hundred units it mines six at a time.
const MAX_OUTSTANDING_SALE_UNITS = 12;
// A buyer will not have more than this many purchases open on one family at
// once. The gap it is ordering against does not close until goods actually
// arrive, so without a cap it re-posts every single tick.
const MAX_OPEN_ORDERS_PER_FAMILY = 2;
// After a refusal a buyer waits before asking again. Without this it re-posts
// the same request every tick and is refused every tick.
const RETRY_AFTER_REFUSAL_MS = 60 * 1000;
// Refused orders are kept long enough to read, then cleared so the board stays
// legible instead of accumulating thousands of dead rows.
const DECLINED_RETENTION_MS = 5 * 60 * 1000;
// Repricing, mirroring how Sal reprices an unfilled purchase order: bounded so
// a hub cannot bid itself into ruin, throttled so it does not thrash, and
// logged with the reason it moved.
const REPRICE_INTERVAL_MS = 60 * 1000;
const REPRICE_MAX_MULTIPLE = 2;
const BUYER_TRAITS = Object.freeze({ urgencyBias: 0.5, caution: 0.5, growthBias: 0.3 });

const SITE_BY_INSTITUTION = Object.freeze({
  "yard-exchange": "yard-exchange",
  "scrap-forge": "scrap-porch",
  "the-ledge": "the-ledge",
});

const HUB_NAMES = Object.freeze({
  "yard-exchange": "Yard Exchange",
  "scrap-forge": "Scrap Porch",
  "the-ledge": "The Ledge",
});

export function createInitialProcurementState() {
  return { orders: {}, counter: 0 };
}

export function hubName(institutionId) {
  return HUB_NAMES[institutionId] ?? institutionId;
}

function siteOf(institutionId) {
  return SITE_BY_INSTITUTION[institutionId] ?? institutionId;
}

// Which institution may legally mine this family, and what it digs.
function findSupplier(family) {
  const definition = STANDING_MINING_ORDERS.find((order) => getResourceFamily(order.resourceId) === family
    && getMinedFamilies(order.buyerInstitutionId).includes(family));
  if (!definition) return null;
  return { institutionId: definition.buyerInstitutionId, resourceId: definition.resourceId };
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
    .reduce((sum, order) => sum + Math.max(0, order.units - order.deliveredUnits), 0);
}

// Freight offers derived from orders whose goods actually exist. Shaped like a
// standing template so the carrier market handles them with no special case.
export function getProcurementFreightOffers(state) {
  return listOrders(state, { status: PROCUREMENT_STATUS.READY }).map((order) => ({
    id: `procurement-${order.id}`,
    procurementOrderId: order.id,
    dynamic: true,
    originSiteId: siteOf(order.supplierInstitutionId),
    originName: hubName(order.supplierInstitutionId),
    destinationSiteId: siteOf(order.buyerInstitutionId),
    destinationName: hubName(order.buyerInstitutionId),
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

  const institution = (id) => state.logistics?.institutions?.[id] ?? null;

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
  function postNeeds() {
    Object.keys(SITE_BY_INSTITUTION).forEach((buyerInstitutionId) => {
      const buyer = institution(buyerInstitutionId);
      if (!buyer) return;

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
          .some((entry) => entry.family === position.family && now() - (entry.declinedAt ?? 0) < RETRY_AFTER_REFUSAL_MS);
        if (refusedRecently) return;

        const supplier = findSupplier(position.family);
        if (!supplier || supplier.institutionId === buyerInstitutionId) return;

        if (outstanding < MIN_ORDER_UNITS) return;
        const units = Math.min(outstanding, MAX_ORDER_UNITS);
        const valuation = evaluateProcurement({
          itemId: supplier.resourceId,
          baseUnitPrice: getResourceTradeValue(supplier.resourceId),
          marketUnitValue: getResourceTradeValue(supplier.resourceId),
          urgency: position.onHand === 0 ? "critical" : "routine",
          inventory: { onHand: position.onHand, incoming: position.incoming + onOrder, target: position.target },
          requestedUnits: units,
          account: buyer.accounts?.operating ?? {},
          policy: { protectedCash: BUYER_PROTECTED_CASH },
          traits: BUYER_TRAITS,
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
        const committedPayment = orderUnits * valuation.recommendedPrice;
        // Freight is budgeted separately from the goods, so a carrier is paid
        // for hauling and the supplier is paid for the material.
        const freightBudget = Math.max(40, Math.round(committedPayment * 0.45));
        if ((buyer.accounts.operating.balance ?? 0) < committedPayment + freightBudget + BUYER_PROTECTED_CASH) return;

        const id = `HPO-${String(++procurement.counter).padStart(4, "0")}`;
        procurement.orders[id] = {
          id,
          buyerInstitutionId, supplierInstitutionId: supplier.institutionId,
          family: position.family, resourceId: supplier.resourceId,
          units: orderUnits, pricePerUnit: valuation.recommendedPrice,
          // The ceiling is anchored to what this buyer first judged the goods
          // worth, captured at creation. Capturing it at the first reprice
          // instead would let a bad opening price become the baseline.
          originalPricePerUnit: valuation.recommendedPrice,
          committedPayment, freightBudget,
          deliveredUnits: 0, status: PROCUREMENT_STATUS.OFFERED,
          reasons: valuation.reasons, createdAt: now(), shipmentId: null,
        };
        buyer.accounts.operating.committed = (buyer.accounts.operating.committed ?? 0) + committedPayment;

        emit("procurement.orderPosted", `${hubName(buyerInstitutionId)} offered ${hubName(supplier.institutionId)} ${valuation.recommendedPrice} cr per unit for ${orderUnits} ${order2Label(supplier.resourceId)}, because it cannot mine ${position.family} itself.`, {
          procurementOrderId: id, buyerId: buyerInstitutionId, sellerId: supplier.institutionId,
          family: position.family, resourceId: supplier.resourceId, units: orderUnits,
          pricePerUnit: valuation.recommendedPrice, committedPayment, freightBudget,
          gap: position.gap, target: position.target, onHand: position.onHand,
          reasons: valuation.reasons,
        });
      });
    });
  }

  // ── 3: a supplier accepts only if the price clears what the goods cost it ──
  function considerOffers() {
    listOrders(state, { status: PROCUREMENT_STATUS.OFFERED }).forEach((order) => {
      const supplier = institution(order.supplierInstitutionId);
      if (!supplier) return;

      // Can it actually deliver this on top of what it already owes? Price is
      // not the only reason to say no, and a promise it cannot keep is worse
      // for the buyer than a refusal it can act on.
      const alreadyOwed = getCommittedSupply(state, order.supplierInstitutionId, order.family);
      if (alreadyOwed + order.units > MAX_OUTSTANDING_SALE_UNITS) {
        order.status = PROCUREMENT_STATUS.DECLINED;
        order.declinedReason = "supplier-at-capacity";
        order.declinedAt = now();
        order.reasons = [
          `${hubName(order.supplierInstitutionId)} already owes ${alreadyOwed} ${order2Label(order.resourceId)} it has not delivered.`,
          `Taking another ${order.units} would put it past the ${MAX_OUTSTANDING_SALE_UNITS} it can dig in reasonable time.`,
        ];
        releaseCommitment(order);
        emit("procurement.orderDeclined", `${hubName(order.supplierInstitutionId)} turned down ${order.units} ${order2Label(order.resourceId)}: it already owes ${alreadyOwed} and will not promise what it cannot mine.`, {
          procurementOrderId: order.id, sellerId: order.supplierInstitutionId, buyerId: order.buyerInstitutionId,
          reason: "supplier-at-capacity", alreadyOwed, requested: order.units, capacity: MAX_OUTSTANDING_SALE_UNITS,
        });
        return;
      }

      const unitCost = Math.max(getUnitCost(state, order.supplierInstitutionId, order.resourceId) || 0, getResourceTradeValue(order.resourceId));
      const ask = evaluateSupplierAsk({
        workId: order.id,
        costComponents: { other: unitCost * order.units },
        offeredPrice: order.pricePerUnit * order.units,
        traits: { growthBias: 0.3, caution: 0.5 },
      });

      if (!ask.acceptable) {
        order.status = PROCUREMENT_STATUS.DECLINED;
        order.declinedReason = "below-supplier-cost";
        order.declinedAt = now();
        order.reasons = ask.reasons;
        // What the seller said it needs. This is the number the buyer moves
        // toward when it reprices, which is what lets the two sides converge
        // instead of restating the same offer at each other.
        order.supplierFloor = ask.minAcceptablePrice ?? null;
        order.supplierAsk = ask.recommendedPrice ?? null;
        releaseCommitment(order);
        emit("procurement.orderDeclined", `${hubName(order.supplierInstitutionId)} will not sell ${order.units} ${order2Label(order.resourceId)} for ${order.committedPayment} cr; it needs at least ${ask.minAcceptablePrice}.`, {
          procurementOrderId: order.id, sellerId: order.supplierInstitutionId, buyerId: order.buyerInstitutionId,
          offered: order.committedPayment, floor: ask.minAcceptablePrice, reasons: ask.reasons,
        });
        return;
      }

      order.status = PROCUREMENT_STATUS.ACCEPTED;
      order.acceptedAt = now();
      order.supplierReasons = ask.reasons;
      emit("procurement.orderAccepted", `${hubName(order.supplierInstitutionId)} accepted ${order.committedPayment} cr for ${order.units} ${order2Label(order.resourceId)} and will mine toward it.`, {
        procurementOrderId: order.id, sellerId: order.supplierInstitutionId, buyerId: order.buyerInstitutionId,
        units: order.units, committedPayment: order.committedPayment, reasons: ask.reasons,
      });
    });
  }

  // ── 4: goods must actually exist before anything is hauled ───────────────
  // A supplier that owes goods and cannot yet cover them says so, and the
  // buyer can see exactly how short it is.
  function reportOutstandingReservations() {
    listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED }).forEach((order) => {
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
      // Paying more does not conjure ore. A capacity refusal is answered by
      // waiting, not by bidding.
      if (order.declinedReason === "supplier-at-capacity") return;
      const lastPricedAt = order.lastRepricedAt ?? order.createdAt ?? 0;
      if (now() - lastPricedAt < REPRICE_INTERVAL_MS) return;

      const buyer = institution(order.buyerInstitutionId);
      if (!buyer) return;
      order.originalPricePerUnit ??= order.pricePerUnit;
      const ceiling = Math.round(order.originalPricePerUnit * REPRICE_MAX_MULTIPLE);
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
      const spendable = (buyer.accounts?.operating?.balance ?? 0) - (buyer.accounts?.operating?.committed ?? 0) - BUYER_PROTECTED_CASH;
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

  function update() {
    pruneDeclinedOrders();
    postNeeds();
    repriceUnfilledOrders();
    considerOffers();
    // Mined ore lands in the seller's own stock; move what is owed into the
    // contract reserve before anything else can consume it, then settle any
    // reserve that is now whole.
    fillReservations();
    completeSalesWhenReserved();
    reportOutstandingReservations();
  }

  update();
  return { update, getState: () => procurement, completeOrder, markShipped, listOrders: (filter) => listOrders(state, filter) };
}

function order2Label(resourceId) {
  return resourceId.replaceAll("-", " ");
}
