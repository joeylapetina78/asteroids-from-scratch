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

import { getResourceFamily, getResourceTradeValue } from "./resourceDefinitions.js?v=fresh-20260731-1759-df6d692";
import { getImportFamilies, getInventoryPosition, getMinedFamilies } from "./hubInventory.js?v=fresh-20260731-1759-df6d692";
import { STANDING_MINING_ORDERS } from "./miningOperation.js?v=fresh-20260731-1759-df6d692";
import { evaluateProcurement, evaluateSupplierAsk } from "./valuation.js?v=fresh-20260731-1759-df6d692";
import { getUnitCost } from "./costBasis.js?v=fresh-20260731-1759-df6d692";
import { BLOCKER_KIND, DIAGNOSTIC_STATE, clearBlocker, createBlocker, recordBlocker } from "./diagnostics.js?v=fresh-20260731-1759-df6d692";

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
  }));
}

export function createHubProcurementOperation({ state, now = () => Date.now() }) {
  state.hubProcurement ??= createInitialProcurementState();
  const procurement = state.hubProcurement;
  procurement.orders ??= {};
  procurement.counter ??= 0;

  const institution = (id) => state.logistics?.institutions?.[id] ?? null;

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
        order.reasons = ask.reasons;
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
  function markReadyWhenSupplied() {
    // A run already on offer whose goods have since been used or sold goes back
    // to waiting. Freight must never be offered against material that is gone.
    listOrders(state, { status: PROCUREMENT_STATUS.READY }).forEach((order) => {
      const supplier = institution(order.supplierInstitutionId);
      if ((supplier?.inventories?.[order.resourceId] ?? 0) >= order.units) return;
      order.status = PROCUREMENT_STATUS.ACCEPTED;
      order.readyAt = null;
    });

    listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED }).forEach((order) => {
      const supplier = institution(order.supplierInstitutionId);
      const onHand = supplier?.inventories?.[order.resourceId] ?? 0;
      if (onHand < order.units) {
        recordBlocker(state, order.supplierInstitutionId, createBlocker({
          kind: BLOCKER_KIND.AWAITING_MATERIAL,
          summary: `${hubName(order.supplierInstitutionId)} owes ${order.units} ${order2Label(order.resourceId)} on ${order.id} and holds ${onHand}`,
          subjectId: order.supplierInstitutionId, objectId: order.id,
          waitingFor: `${order.units - onHand} more ${order2Label(order.resourceId)} out of the ground`,
          wakeOn: ["mining.contractFulfilled"],
          detail: { procurementOrderId: order.id, owed: order.units, onHand },
          at: now(),
        }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
        return;
      }
      order.status = PROCUREMENT_STATUS.READY;
      order.readyAt = now();
      clearBlocker(state, order.supplierInstitutionId, {
        state: DIAGNOSTIC_STATE.FREE,
        summary: `${hubName(order.supplierInstitutionId)} has ${order.units} ${order2Label(order.resourceId)} ready for ${hubName(order.buyerInstitutionId)}`,
        at: now(),
      });
      emit("procurement.readyForFreight", `${hubName(order.supplierInstitutionId)} has ${order.units} ${order2Label(order.resourceId)} ready; freight to ${hubName(order.buyerInstitutionId)} is now on offer.`, {
        procurementOrderId: order.id, sellerId: order.supplierInstitutionId, buyerId: order.buyerInstitutionId,
        units: order.units, freightBudget: order.freightBudget,
      });
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

  function update() {
    postNeeds();
    considerOffers();
    markReadyWhenSupplied();
  }

  update();
  return { update, getState: () => procurement, completeOrder, markShipped, listOrders: (filter) => listOrders(state, filter) };
}

function order2Label(resourceId) {
  return resourceId.replaceAll("-", " ");
}
