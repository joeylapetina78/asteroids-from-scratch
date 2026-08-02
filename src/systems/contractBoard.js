// One board for every agreement in the world.
//
// Work is offered by five different systems in five different shapes: hubs
// posting extraction orders, hubs buying from each other, carriers hauling
// against those purchases, Sal buying repair feedstock, and Sal selling
// repairs. Each is inspectable on its own, which is precisely the problem —
// there was no way to stand back and see what everyone had agreed to.
//
// This is a read-only projection. It owns nothing and decides nothing; it reads
// the authoritative records and normalizes them into one shape so the observer
// can ask "what is on offer, who took what, and what actually finished".
//
// Every entry answers the same three questions:
//   WHO WANTS IT      issuer — the party that will pay
//   WHO IS DOING IT   supplier — null while it is still up for grabs
//   WHERE IS IT       one of available / taken / done / blocked

import { getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260801-2136-f7e757a";
import { findActorRecord } from "./actorConfig.js?v=fresh-20260801-2136-f7e757a";
import { PROCUREMENT_STATUS, listOrders } from "./hubProcurement.js?v=fresh-20260801-2136-f7e757a";
import { getPostedMiningOrders } from "./miningOperation.js?v=fresh-20260801-2136-f7e757a";

export const CONTRACT_STATE = Object.freeze({
  AVAILABLE: "available",   // posted, nobody has taken it
  TAKEN: "taken",           // somebody is working it
  DONE: "done",             // finished and settled
  BLOCKED: "blocked",       // posted but cannot proceed, and says why
});

export const CONTRACT_KIND = Object.freeze({
  EXTRACTION: "extraction",     // a hub paying for ore out of the ground
  PURCHASE: "purchase",         // a hub buying material from another hub
  FREIGHT: "freight",           // moving goods against a purchase
  FEEDSTOCK: "feedstock",       // Sal buying repair material
  REPAIR: "repair",             // Sal selling a repair
});

// What to call a party, and where it sits — both read off the record it
// already has. These were two hardcoded tables listing the same three
// settlements that `hubProcurement` also listed, so a fourth would have been
// unnamed here and placed nowhere.
export function actorLabel(state, id) {
  if (!id) return null;
  return findActorRecord(state, id)?.name ?? id;
}

function siteOf(state, institutionId) {
  return findActorRecord(state, institutionId)?.siteId ?? null;
}

// Ships and haulers carry their own names in their operation records, so the
// board shows "Cinder Two" rather than an id.
function nameFromState(state, id) {
  if (!id) return null;
  const miningShip = Object.values(state?.miningOperations ?? (state?.miningOperation ? { legacy: state.miningOperation } : {}))
    .map((operation) => operation?.ships?.[id]).find(Boolean);
  return miningShip?.name
    ?? state?.logistics?.institutions?.[id]?.name
    ?? state?.logistics?.haulers?.[id]?.name
    ?? null;
}

// A null field means the underlying record genuinely does not carry it, not
// that it was left out. Nothing here is inferred or filled in.
function entry(state, fields) {
  return {
    id: null, kind: null, state: null, title: null,
    issuerId: null, buyerId: null, sellerId: null, supplierId: null,
    originSiteId: null, siteId: null,
    resourceId: null, family: null,
    units: null, remainingUnits: null, unitPrice: null, value: null,
    goodsPayment: null, servicePayment: null,
    createdAt: null, closedAt: null,
    detail: null, note: null, at: null,
    ...fields,
    issuerName: nameFromState(state, fields.issuerId) ?? actorLabel(state, fields.issuerId),
    buyerName: nameFromState(state, fields.buyerId) ?? actorLabel(state, fields.buyerId),
    sellerName: nameFromState(state, fields.sellerId) ?? actorLabel(state, fields.sellerId),
    supplierName: nameFromState(state, fields.supplierId) ?? actorLabel(state, fields.supplierId),
  };
}

// ── Extraction: what hubs are paying to have dug up ────────────────────────
function collectExtraction(state) {
  const posted = state.miningOperation?.postedOrders && Object.keys(state.miningOperation.postedOrders).length > 0
    ? state.miningOperation.postedOrders
    : getPostedMiningOrders(state);
  const allocations = Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}))
    .flatMap((operation) => Object.values(operation?.allocations ?? {}));
  const rows = [];

  Object.values(posted).forEach((order) => {
    const active = allocations.filter((allocation) => allocation.orderId === order.id && allocation.status === "active");
    const blocked = Boolean(order.withheld);
    rows.push(entry(state, {
      id: order.id,
      kind: CONTRACT_KIND.EXTRACTION,
      state: blocked ? CONTRACT_STATE.BLOCKED : (active.length > 0 ? CONTRACT_STATE.TAKEN : CONTRACT_STATE.AVAILABLE),
      title: `${order.resourceName ?? order.resourceId} for ${actorLabel(state, order.buyerInstitutionId)}`,
      issuerId: order.buyerInstitutionId,
      buyerId: order.buyerInstitutionId,
      sellerId: active[0]?.supplierInstitutionId ?? null,
      supplierId: active[0]?.workerShipId ?? null,
      // No origin: the worker picks its own deposit, and which rock it chose is
      // not recorded on the order.
      originSiteId: null,
      siteId: order.siteId,
      resourceId: order.resourceId,
      family: getResourceFamily(order.resourceId),
      units: order.amount,
      // Standing extraction records no partial fill, so remaining is unknown
      // rather than assumed equal to the order size.
      remainingUnits: null,
      unitPrice: order.paymentPerUnit ?? null,
      value: order.amount && order.paymentPerUnit ? order.amount * order.paymentPerUnit : null,
      goodsPayment: order.amount && order.paymentPerUnit ? order.amount * order.paymentPerUnit : null,
      createdAt: order.at ?? null,
      note: blocked
        ? `withheld: ${order.withheld}`
        : `${order.inventory?.onHand ?? 0} on hand vs target ${order.inventory?.target ?? 0}`,
      at: order.at ?? null,
      detail: order.valuation?.reasons ?? null,
    }));
  });

  // Runs that already finished, so the board shows completed work too.
  allocations.filter((allocation) => allocation.status === "completed").forEach((allocation) => {
    rows.push(entry(state, {
      id: allocation.id,
      kind: CONTRACT_KIND.EXTRACTION,
      state: CONTRACT_STATE.DONE,
      title: `${allocation.orderId} filled`,
      issuerId: null,
      sellerId: allocation.supplierInstitutionId ?? null,
      supplierId: allocation.workerShipId,
      units: allocation.amount ?? null,
      remainingUnits: 0,
      createdAt: allocation.acceptedAt ?? null,
      closedAt: allocation.releasedAt ?? null,
      note: `delivered against ${allocation.orderId}`,
      at: allocation.acceptedAt ?? null,
    }));
  });
  return rows;
}

// ── Purchase and freight: hub-to-hub trade ─────────────────────────────────
const PURCHASE_STATE = Object.freeze({
  [PROCUREMENT_STATUS.OFFERED]: CONTRACT_STATE.AVAILABLE,
  [PROCUREMENT_STATUS.ACCEPTED]: CONTRACT_STATE.TAKEN,
  [PROCUREMENT_STATUS.READY]: CONTRACT_STATE.TAKEN,
  [PROCUREMENT_STATUS.SHIPPED]: CONTRACT_STATE.TAKEN,
  [PROCUREMENT_STATUS.DELIVERED]: CONTRACT_STATE.DONE,
  [PROCUREMENT_STATUS.DECLINED]: CONTRACT_STATE.BLOCKED,
  [PROCUREMENT_STATUS.WITHHELD]: CONTRACT_STATE.BLOCKED,
});

function collectPurchases(state) {
  return listOrders(state).map((order) => entry(state, {
    id: order.id,
    kind: CONTRACT_KIND.PURCHASE,
    state: PURCHASE_STATE[order.status] ?? CONTRACT_STATE.AVAILABLE,
    title: `${actorLabel(state, order.buyerInstitutionId)} buys ${order.units} ${order.resourceId.replaceAll("-", " ")}`,
    issuerId: order.buyerInstitutionId,
    buyerId: order.buyerInstitutionId,
    sellerId: order.supplierInstitutionId,
    supplierId: order.status === PROCUREMENT_STATUS.OFFERED ? null : order.supplierInstitutionId,
    originSiteId: siteOf(state, order.supplierInstitutionId),
    siteId: siteOf(state, order.buyerInstitutionId),
    resourceId: order.resourceId,
    family: order.family,
    units: order.units,
    remainingUnits: Math.max(0, (order.units ?? 0) - (order.deliveredUnits ?? 0)),
    unitPrice: order.pricePerUnit,
    value: order.committedPayment,
    goodsPayment: order.committedPayment ?? null,
    servicePayment: order.freightBudget ?? null,
    createdAt: order.createdAt ?? null,
    closedAt: order.deliveredAt ?? null,
    note: order.status === PROCUREMENT_STATUS.DECLINED
      ? (order.declinedReason ?? "declined")
      : `${order.status}${order.deliveredUnits ? ` · ${order.deliveredUnits} delivered` : ""}`,
    at: order.createdAt ?? null,
    detail: order.reasons ?? null,
  }));
}

function collectFreight(state) {
  const shipments = Object.values(state.logistics?.shipments ?? {});
  const shippedOrders = new Set(shipments.map((shipment) => shipment.procurementOrderId).filter(Boolean));
  const rows = shipments.map((shipment) => entry(state, {
    id: shipment.id,
    kind: CONTRACT_KIND.FREIGHT,
    state: shipment.status === "delivered" ? CONTRACT_STATE.DONE : CONTRACT_STATE.TAKEN,
    title: `${shipment.quantity} ${String(shipment.commodity).replaceAll("-", " ")} → ${actorLabel(state, shipment.destinationInstitutionId)}`,
    issuerId: shipment.issuerInstitutionId,
    buyerId: shipment.destinationInstitutionId,
    sellerId: shipment.sourceInstitutionId,
    supplierId: shipment.assigneeId ?? null,
    originSiteId: shipment.originSiteId,
    siteId: shipment.destinationSiteId,
    resourceId: shipment.commodity,
    family: getResourceFamily(shipment.commodity),
    units: shipment.quantity,
    remainingUnits: shipment.status === "delivered" ? 0 : shipment.quantity,
    value: shipment.payment,
    goodsPayment: shipment.goodsPayment ?? null,
    servicePayment: shipment.payment ?? null,
    createdAt: shipment.createdAt ?? null,
    closedAt: shipment.deliveredAt ?? null,
    note: `${shipment.status} · goods ${shipment.goodsPayment ?? 0} cr, freight ${shipment.payment ?? 0} cr`,
    at: shipment.createdAt ?? null,
  }));

  // Runs on the board that nobody has picked up yet.
  listOrders(state, { status: PROCUREMENT_STATUS.READY })
    .filter((order) => !shippedOrders.has(order.id))
    .forEach((order) => {
      rows.push(entry(state, {
        id: `freight:${order.id}`,
        kind: CONTRACT_KIND.FREIGHT,
        state: CONTRACT_STATE.AVAILABLE,
        title: `${order.units} ${order.resourceId.replaceAll("-", " ")} → ${actorLabel(state, order.buyerInstitutionId)}`,
        issuerId: order.buyerInstitutionId,
        buyerId: order.buyerInstitutionId,
        sellerId: order.supplierInstitutionId,
        supplierId: null,
        originSiteId: siteOf(state, order.supplierInstitutionId),
        siteId: siteOf(state, order.buyerInstitutionId),
        resourceId: order.resourceId,
        family: order.family,
        units: order.units,
        remainingUnits: order.units,
        value: order.freightBudget,
        servicePayment: order.freightBudget ?? null,
        createdAt: order.readyAt ?? order.createdAt ?? null,
        note: `awaiting a carrier · ${order.freightBudget} cr offered`,
        at: order.readyAt ?? null,
      }));
    });
  return rows;
}

// ── Sal: buying feedstock and selling repairs ──────────────────────────────
function collectSprc(state) {
  const rows = [];
  Object.values(state.sprc?.procurementOrders ?? {}).forEach((order) => {
    const takers = Object.values(order.allocations ?? {}).filter((allocation) => allocation.status === "active");
    const done = ["paid", "expired", "canceled"].includes(order.status);
    rows.push(entry(state, {
      id: order.id,
      kind: CONTRACT_KIND.FEEDSTOCK,
      state: done ? CONTRACT_STATE.DONE : (takers.length > 0 ? CONTRACT_STATE.TAKEN : CONTRACT_STATE.AVAILABLE),
      title: `Sal buys ${order.requiredEquivalentUnits} ${String(order.procurementItemId ?? "material").replaceAll("-", " ")}`,
      issuerId: "sprc",
      buyerId: "sprc",
      sellerId: takers[0]?.supplierInstitutionId ?? null,
      supplierId: takers[0]?.supplierInstitutionId ?? null,
      siteId: order.destinationSiteId,
      resourceId: order.procurementItemId ?? null,
      units: order.requiredEquivalentUnits,
      remainingUnits: Math.max(0, (order.requiredEquivalentUnits ?? 0) - (order.deliveredEquivalentUnits ?? 0)),
      unitPrice: order.pricePerEquivalent,
      value: order.committedPayment ?? order.maximumPayment ?? null,
      goodsPayment: order.paidAmount ?? order.committedPayment ?? null,
      createdAt: order.createdAt ?? null,
      note: `${order.status} · ${order.deliveredEquivalentUnits ?? 0}/${order.requiredEquivalentUnits} delivered`,
      at: order.createdAt ?? null,
    }));
  });

  Object.values(state.sprc?.repairOrders ?? {}).forEach((order) => {
    const done = ["completed", "paid"].includes(order.status);
    rows.push(entry(state, {
      id: order.id,
      kind: CONTRACT_KIND.REPAIR,
      state: done ? CONTRACT_STATE.DONE
        : (order.status === "waiting-stock" ? CONTRACT_STATE.BLOCKED : CONTRACT_STATE.TAKEN),
      title: `Repair ${actorLabel(state, order.subjectId) ?? order.subjectId} (${String(order.condition ?? "fault").replaceAll("-", " ")})`,
      issuerId: order.payerInstitutionId,
      buyerId: order.payerInstitutionId,
      sellerId: "sprc",
      // The subject is the ship on the bench, which is what there is to look at.
      supplierId: order.subjectId ?? null,
      siteId: order.facilityId ?? null,
      resourceId: order.condition ?? null,
      units: 1,
      remainingUnits: done ? 0 : 1,
      value: order.servicePrice ?? null,
      servicePayment: order.servicePrice ?? null,
      createdAt: order.createdAt ?? null,
      closedAt: order.completesAt ?? null,
      note: order.status,
      at: order.createdAt ?? null,
    }));
  });
  return rows;
}

// Every agreement in the world, newest first within each state.
export function listContracts(state) {
  return [
    ...collectExtraction(state),
    ...collectPurchases(state),
    ...collectFreight(state),
    ...collectSprc(state),
  ].sort((first, second) => (second.at ?? 0) - (first.at ?? 0));
}

export function summarizeContracts(contracts) {
  const counts = { available: 0, taken: 0, done: 0, blocked: 0 };
  contracts.forEach((contract) => { counts[contract.state] = (counts[contract.state] ?? 0) + 1; });
  return counts;
}

// Every party that appears on the board, for the filter control. A hub shows up
// whether it is buying or selling.
export function listContractParties(contracts) {
  const parties = new Map();
  contracts.forEach((contract) => {
    [[contract.issuerId, contract.issuerName], [contract.supplierId, contract.supplierName]]
      .forEach(([id, name]) => { if (id) parties.set(id, name ?? id); });
  });
  return [...parties.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function filterContracts(contracts, { party = null, kind = null, search = "" } = {}) {
  const needle = search.trim().toLowerCase();
  return contracts.filter((contract) => {
    if (party && contract.issuerId !== party && contract.supplierId !== party) return false;
    if (kind && contract.kind !== kind) return false;
    if (!needle) return true;
    return JSON.stringify(contract).toLowerCase().includes(needle);
  });
}
