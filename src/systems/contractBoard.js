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

import { getEffectiveMaterialUnits, getResourceEffectiveYield, getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260822-1330-factories";
import { findActorRecord } from "./actorConfig.js?v=fresh-20260822-1330-factories";
import { PROCUREMENT_STATUS, listOrders } from "./hubProcurement.js?v=fresh-20260822-1330-factories";
import { getPostedMiningOrders } from "./miningOperation.js?v=fresh-20260822-1330-factories";
import { getMiningOrderBook } from "./miningOrderBook.js?v=fresh-20260822-1330-factories";
import { listProtectionRequests, PROTECTION_REQUEST_STATUS } from "./protectionPlanning.js?v=fresh-20260822-1330-factories";
import { ensureGateBounty } from "./gateBounty.js?v=fresh-20260822-1330-factories";

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
  PROTECTION: "protection",     // a place hiring defense against a real threat
  SALVAGE: "salvage",           // recovering titled wreckage for its owner
  BOUNTY: "bounty",             // evergreen bearer-token redemption
});

const MAX_COMPLETED_CONTRACT_ROWS = 200;

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
    originSiteId: null, siteId: null, acceptanceSiteId: null,
    eligibility: null, reservationMode: null, settlementMode: null,
    resourceId: null, family: null,
    units: null, effectiveUnits: null, remainingUnits: null, unitPrice: null, effectiveUnitPrice: null, value: null,
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
  // The world's order book, not one company's copy of it. This used to read
  // `state.miningOperation.postedOrders` — Cinder's private snapshot — so the
  // public job board showed whatever Cinder happened to know.
  const book = getMiningOrderBook(state);
  const posted = Object.keys(book).length > 0 ? book : getPostedMiningOrders(state);
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
      acceptanceSiteId: order.siteId,
      eligibility: "licensed-miner",
      reservationMode: "allocation",
      settlementMode: "delivery",
      resourceId: order.resourceId,
      family: getResourceFamily(order.resourceId),
      units: order.amount,
      // Standing extraction records no partial fill, so remaining is unknown
      // rather than assumed equal to the order size.
      effectiveUnits: getEffectiveMaterialUnits(order.resourceId, order.amount),
      remainingUnits: null,
      unitPrice: order.paymentPerUnit ?? null,
      effectiveUnitPrice: order.paymentPerUnit != null ? order.paymentPerUnit / getResourceEffectiveYield(order.resourceId) : null,
      value: order.amount && order.paymentPerUnit ? order.amount * order.paymentPerUnit : null,
      goodsPayment: order.amount && order.paymentPerUnit ? order.amount * order.paymentPerUnit : null,
      createdAt: order.at ?? null,
      note: blocked
        ? `withheld: ${order.withheld}`
        : `${formatMaterial(order.inventory?.onHand ?? 0)} effective on hand vs target ${formatMaterial(order.inventory?.target ?? 0)}`,
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
    effectiveUnits: order.effectiveUnits ?? getEffectiveMaterialUnits(order.resourceId, order.units),
    remainingUnits: Math.max(0, (order.units ?? 0) - (order.deliveredUnits ?? 0)),
    unitPrice: order.pricePerUnit,
    effectiveUnitPrice: order.pricePerUnit / getResourceEffectiveYield(order.resourceId),
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
    effectiveUnits: getEffectiveMaterialUnits(shipment.commodity, shipment.quantity),
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
        effectiveUnits: order.effectiveUnits ?? getEffectiveMaterialUnits(order.resourceId, order.units),
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

function formatMaterial(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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

function collectProtection(state) {
  return listProtectionRequests(state).map((request) => entry(state, {
    id: request.id,
    kind: CONTRACT_KIND.PROTECTION,
    state: request.status === PROTECTION_REQUEST_STATUS.CLOSED ? CONTRACT_STATE.DONE
      : request.status === PROTECTION_REQUEST_STATUS.WITHHELD ? CONTRACT_STATE.BLOCKED
        : request.status === PROTECTION_REQUEST_STATUS.FAILED ? CONTRACT_STATE.BLOCKED
          : [PROTECTION_REQUEST_STATUS.INTERNAL, PROTECTION_REQUEST_STATUS.CONTRACTED, PROTECTION_REQUEST_STATUS.ACTIVE].includes(request.status) ? CONTRACT_STATE.TAKEN
          : CONTRACT_STATE.AVAILABLE,
    title: `Protect ${actorLabel(state, request.issuerInstitutionId)} from ${request.threatType}`,
    issuerId: request.issuerInstitutionId,
    buyerId: request.issuerInstitutionId,
    sellerId: request.providerInstitutionId,
    supplierId: request.providerInstitutionId,
    siteId: request.siteId,
    acceptanceSiteId: request.siteId,
    eligibility: request.requiredCapabilities,
    reservationMode: "exclusive",
    settlementMode: "threat-cleared",
    units: 1,
    remainingUnits: request.status === PROTECTION_REQUEST_STATUS.CLOSED ? 0 : 1,
    value: request.agreedPayment ?? request.maximumPayment,
    servicePayment: request.agreedPayment ?? request.maximumPayment,
    createdAt: request.createdAt,
    closedAt: request.closedAt,
    note: `${request.status} · ${request.policyMode} policy · severity ${Math.round(request.severity * 100)}%`,
    detail: [`Expected loss ${request.expectedLoss} cr`, `Reason: ${request.reason}`, `Capabilities: ${request.requiredCapabilities.join(", ")}`],
    at: request.createdAt,
  }));
}

function collectWreckSalvage(state) {
  return Object.values(state.contracts?.records ?? {})
    .filter((contract) => contract.type === "wreck-salvage")
    .map((contract) => {
      const wreck = state.wrecks?.records?.[contract.terms?.wreckId] ?? null;
      const done = contract.status === "paid";
      const blocked = ["failed", "canceled", "expired"].includes(contract.status);
      const taken = ["active", "fulfilled"].includes(contract.status);
      return entry(state, {
        id: contract.id,
        kind: CONTRACT_KIND.SALVAGE,
        state: done ? CONTRACT_STATE.DONE : blocked ? CONTRACT_STATE.BLOCKED : taken ? CONTRACT_STATE.TAKEN : CONTRACT_STATE.AVAILABLE,
        title: contract.title,
        issuerId: contract.issuer,
        buyerId: contract.issuer,
        supplierId: taken || done ? "player" : null,
        originSiteId: null,
        siteId: contract.terms?.destinationSiteId ?? contract.presentation?.offerSiteId ?? null,
        resourceId: "titled-wreck",
        units: contract.terms?.amount ?? 1,
        remainingUnits: done ? 0 : 1,
        value: contract.reward?.credits ?? null,
        servicePayment: contract.reward?.credits ?? null,
        createdAt: contract.offeredAt ?? wreck?.createdAt ?? null,
        closedAt: contract.paidAt ?? null,
        note: contract.status === "offered"
          ? `Available from Scrap Porch Odd Jobs · ${wreck?.shipName ?? "titled wreck"}`
          : contract.status,
        detail: [
          contract.description,
          wreck?.titleId ? `Title: ${wreck.titleId}` : null,
          wreck?.position ? `Wreck position: ${wreck.position.x}, ${wreck.position.y}` : null,
          ...(contract.notes ?? []),
        ].filter(Boolean),
        at: contract.offeredAt ?? wreck?.createdAt ?? null,
      });
    });
}

function collectGateBounty(state) {
  const bounty = ensureGateBounty(state);
  return [entry(state, {
    id: "authority:gate-bounty",
    kind: CONTRACT_KIND.BOUNTY,
    state: bounty.fund > 0 ? CONTRACT_STATE.AVAILABLE : CONTRACT_STATE.BLOCKED,
    title: "Frontier Regional Authority gate bounty",
    issuerId: bounty.authorityId,
    buyerId: bounty.authorityId,
    siteId: bounty.officeSiteId,
    acceptanceSiteId: bounty.officeSiteId,
    resourceId: "rift-trophy",
    value: null,
    remainingUnits: null,
    eligibility: "any-bearer",
    reservationMode: "evergreen",
    settlementMode: "bearer-token-redemption",
    createdAt: null,
    note: bounty.fund > 0 ? `${Math.round(bounty.fund)} cr remains in the standing fund` : "authority fund depleted",
    detail: ["Bring a rift trophy to the authority office; payment is the value recorded on the token."],
    at: null,
  })];
}

// Every agreement in the world, newest first within each state.
export function listContracts(state) {
  const contracts = [
    ...collectExtraction(state),
    ...collectPurchases(state),
    ...collectFreight(state),
    ...collectSprc(state),
    ...collectProtection(state),
    ...collectWreckSalvage(state),
    ...collectGateBounty(state),
  ].sort((first, second) => (second.at ?? 0) - (first.at ?? 0));
  const live = contracts.filter((contract) => contract.state !== CONTRACT_STATE.DONE);
  const completed = contracts.filter((contract) => contract.state === CONTRACT_STATE.DONE)
    .slice(0, MAX_COMPLETED_CONTRACT_ROWS);
  return [...live, ...completed].sort((first, second) => (second.at ?? 0) - (first.at ?? 0));
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
