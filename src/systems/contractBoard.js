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

import { getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260731-1824-94364a5";
import { PROCUREMENT_STATUS, hubName, listOrders } from "./hubProcurement.js?v=fresh-20260731-1824-94364a5";
import { getPostedMiningOrders } from "./miningOperation.js?v=fresh-20260731-1824-94364a5";

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

const HUB_LABELS = Object.freeze({
  "yard-exchange": "Yard Exchange",
  "scrap-forge": "Scrap Porch",
  "the-ledge": "The Ledge",
  sprc: "Scrap Porch Recovery Co-op",
  "miner:cinder-contracting": "Cinder Contracting",
});

export function actorLabel(id) {
  if (!id) return null;
  return HUB_LABELS[id] ?? hubName(id) ?? id;
}

// Ships and haulers carry their own names in their operation records, so the
// board shows "Cinder Two" rather than an id.
function nameFromState(state, id) {
  if (!id) return null;
  return state?.miningOperation?.ships?.[id]?.name
    ?? state?.logistics?.institutions?.[id]?.name
    ?? state?.logistics?.haulers?.[id]?.name
    ?? null;
}

function entry(state, fields) {
  return {
    id: null, kind: null, state: null, title: null,
    issuerId: null, supplierId: null, siteId: null,
    resourceId: null, family: null, units: null, unitPrice: null, value: null,
    detail: null, note: null, at: null,
    ...fields,
    issuerName: nameFromState(state, fields.issuerId) ?? actorLabel(fields.issuerId),
    supplierName: nameFromState(state, fields.supplierId) ?? actorLabel(fields.supplierId),
  };
}

// ── Extraction: what hubs are paying to have dug up ────────────────────────
function collectExtraction(state) {
  const posted = state.miningOperation?.postedOrders && Object.keys(state.miningOperation.postedOrders).length > 0
    ? state.miningOperation.postedOrders
    : getPostedMiningOrders(state);
  const allocations = Object.values(state.miningOperation?.allocations ?? {});
  const rows = [];

  Object.values(posted).forEach((order) => {
    const active = allocations.filter((allocation) => allocation.orderId === order.id && allocation.status === "active");
    const blocked = Boolean(order.withheld);
    rows.push(entry(state, {
      id: order.id,
      kind: CONTRACT_KIND.EXTRACTION,
      state: blocked ? CONTRACT_STATE.BLOCKED : (active.length > 0 ? CONTRACT_STATE.TAKEN : CONTRACT_STATE.AVAILABLE),
      title: `${order.resourceName ?? order.resourceId} for ${actorLabel(order.buyerInstitutionId)}`,
      issuerId: order.buyerInstitutionId,
      supplierId: active[0]?.workerShipId ?? null,
      siteId: order.siteId,
      resourceId: order.resourceId,
      family: getResourceFamily(order.resourceId),
      units: order.amount,
      unitPrice: order.paymentPerUnit ?? null,
      value: order.amount && order.paymentPerUnit ? order.amount * order.paymentPerUnit : null,
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
      supplierId: allocation.workerShipId,
      units: allocation.amount ?? null,
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
    title: `${actorLabel(order.buyerInstitutionId)} buys ${order.units} ${order.resourceId.replaceAll("-", " ")}`,
    issuerId: order.buyerInstitutionId,
    supplierId: order.status === PROCUREMENT_STATUS.OFFERED ? null : order.supplierInstitutionId,
    resourceId: order.resourceId,
    family: order.family,
    units: order.units,
    unitPrice: order.pricePerUnit,
    value: order.committedPayment,
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
    title: `${shipment.quantity} ${String(shipment.commodity).replaceAll("-", " ")} → ${actorLabel(shipment.destinationInstitutionId)}`,
    issuerId: shipment.issuerInstitutionId,
    supplierId: shipment.assigneeId ?? null,
    siteId: shipment.destinationSiteId,
    resourceId: shipment.commodity,
    family: getResourceFamily(shipment.commodity),
    units: shipment.quantity,
    value: shipment.payment,
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
        title: `${order.units} ${order.resourceId.replaceAll("-", " ")} → ${actorLabel(order.buyerInstitutionId)}`,
        issuerId: order.buyerInstitutionId,
        supplierId: null,
        resourceId: order.resourceId,
        family: order.family,
        units: order.units,
        value: order.freightBudget,
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
      supplierId: takers[0]?.supplierInstitutionId ?? null,
      siteId: order.destinationSiteId,
      units: order.requiredEquivalentUnits,
      unitPrice: order.pricePerEquivalent,
      value: order.committedPayment ?? order.maximumPayment ?? null,
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
      title: `Repair ${actorLabel(order.subjectId) ?? order.subjectId} (${String(order.condition ?? "fault").replaceAll("-", " ")})`,
      issuerId: order.payerInstitutionId,
      supplierId: "sprc",
      units: 1,
      value: order.servicePrice ?? null,
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
