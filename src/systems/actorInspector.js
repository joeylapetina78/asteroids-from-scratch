// Assembles a complete "what are you doing, and why?" view for one actor by
// reading existing projections. Pure read-only aggregation: it never mutates
// domain state and never scans the raw ledger for present-tense answers — it
// reads the diagnostic record and the projections, and only reaches into the
// ledger to fetch the handful of events a record already references.

import { formatBlockerChain, getDiagnostic, resolveBlockerChain } from "./diagnostics.js?v=fresh-20260730-2038-909a1a1";
import { collectIntentions } from "./intentions.js?v=fresh-20260730-2038-909a1a1";
import { getServiceCost } from "./costBasis.js?v=fresh-20260730-2038-909a1a1";
import { getRelationshipProjection } from "./relationshipProjections.js?v=fresh-20260730-2038-909a1a1";
import { STANDING_MINING_ORDERS } from "./miningOperation.js?v=fresh-20260730-2038-909a1a1";
import { STANDING_FREIGHT_TEMPLATES } from "./logistics.js?v=fresh-20260730-2038-909a1a1";

export function inspectActor(state, actorId, { game = null } = {}) {
  if (!actorId) return null;
  const diagnostic = getDiagnostic(state, actorId);
  const miningShip = state.miningOperation?.ships?.[actorId] ?? null;
  const logisticsHauler = state.logistics?.haulers?.[actorId] ?? null;
  const isInstitution = diagnostic?.actorKind === "institution";

  const view = {
    actorId,
    name: diagnostic?.actorName ?? miningShip?.name ?? actorId,
    kind: diagnostic?.actorKind ?? (miningShip ? "ship" : logisticsHauler ? "ship" : "actor"),
    controllerId: diagnostic?.controllerId ?? null,
    state: diagnostic?.state ?? "unknown",
    summary: diagnostic?.summary ?? null,
    locationSiteId: diagnostic?.locationSiteId ?? miningShip?.currentSiteId ?? logisticsHauler?.currentSiteId ?? null,
    position: diagnostic?.position ?? miningShip?.position ?? null,
    intention: diagnostic?.intention ?? null,
    lastDecision: diagnostic?.lastDecision ?? null,
    blockerChain: diagnostic?.blocker ? formatBlockerChain(resolveBlockerChain(state, diagnostic.blocker)) : [],
    waitingFor: diagnostic?.waitingFor ?? null,
    wakeOn: diagnostic?.wakeOn ?? [],
    nextReconsiderAt: diagnostic?.nextReconsiderAt ?? null,
    refs: diagnostic?.refs ?? { contractIds: [], targetIds: [], dependencyIds: [] },
    detail: diagnostic?.detail ?? null,
    cargo: null,
    cash: null,
    condition: null,
    beaconAccess: null,
    visibleOffers: [],
    recentEvents: [],
    institution: null,
  };

  // Cargo: what it holds, and how much of that is already promised.
  const worker = (game?.workerShips ?? []).find((entry) => entry.id === actorId) ?? null;
  if (worker) {
    const committedUnits = worker.assignment?.quantity ?? 0;
    view.cargo = {
      held: { ...(worker.cargo ?? {}) },
      committedTo: worker.assignment?.contractId ?? null,
      committedUnits,
      // With no assignment nothing is promised, so everything aboard is free.
      uncommitted: worker.assignment ? null : { ...(worker.cargo ?? {}) },
    };
  }

  // Cash: balance, and what is genuinely available after commitments/reserves.
  const controllerId = view.controllerId;
  const account =
    state.miningOperation?.institution?.id === controllerId ? state.miningOperation.institution.accounts.operating :
    state.logistics?.institutions?.[controllerId]?.accounts?.operating ??
    (controllerId === "sprc" ? state.sprc?.account : null);
  if (account) {
    const protectedCash = controllerId === "sprc" ? (state.sprc?.operatingPlan?.protectedCashReserve ?? 0) : 0;
    view.cash = {
      balance: Math.round(account.balance ?? 0),
      committed: Math.round(account.committed ?? 0),
      protectedCash,
      available: Math.round(Math.max(0, (account.balance ?? 0) - (account.committed ?? 0) - protectedCash)),
      maintenanceCost: Math.round(getServiceCost(state, controllerId, "maintenance", 0)) || null,
    };
  }

  // Ship and panel condition.
  const shipInstitution = logisticsHauler ? state.logistics?.institutions?.[logisticsHauler.shipInstitutionId] : null;
  if (miningShip) {
    view.condition = {
      wear: round2(miningShip.wear),
      maintenanceStatus: miningShip.maintenanceStatus,
      pendingIssue: miningShip.pendingIssue ?? null,
      issueCount: miningShip.issueCount ?? 0,
    };
  } else if (shipInstitution) {
    const npc = (game?.npcShips ?? []).find((entry) => entry.id === actorId) ?? null;
    view.condition = {
      wear: round2(shipInstitution.wear ?? npc?.wear),
      maintenanceStatus: npc?.operationalStatus ?? logisticsHauler.status,
      pendingIssue: npc?.pendingWearIssue ?? null,
      issueCount: shipInstitution.issueCount ?? 0,
    };
  }

  // Beacon access — currently only the player carries beacon memory, so this
  // reports honestly rather than inventing institutional access.
  view.beaconAccess = getBeaconAccess(state, controllerId);

  // Public offers this actor could act on from where it stands.
  view.visibleOffers = getVisibleOffers(state, { actorId, siteId: view.locationSiteId, kind: view.kind, isMiner: Boolean(miningShip) });

  // Intentions the shared seam can see for this actor (authoritative records
  // stay where they are).
  view.intentions = collectIntentions(state, { game }).filter((intention) => intention.actorId === actorId);

  // Referenced events only — never a scan.
  const referenced = new Set(diagnostic?.eventIds ?? []);
  if (referenced.size > 0) {
    view.recentEvents = (state.ledger?.getRecentEvents?.(200) ?? [])
      .filter((event) => referenced.has(event.id))
      .map((event) => ({ id: event.id, type: event.type, message: event.message ?? null }));
  }

  if (isInstitution) view.institution = describeInstitution(state, actorId);
  if (controllerId) {
    view.relationships = Object.values(state.relationships?.projections ?? {})
      .filter((projection) => projection.fromId === controllerId || projection.toId === controllerId)
      .slice(0, 6);
  }

  return view;
}

function getBeaconAccess(state, controllerId) {
  // The player's locator is the only beacon memory that exists today.
  const locator = state.components?.beaconLocator;
  if (controllerId === "player" && locator) {
    return { source: "beaconLocator", siteIds: [...(locator.beaconMemoryIds ?? [])] };
  }
  return { source: "not-modelled", siteIds: null, note: "Institutions do not carry beacon access yet; NPC visibility is unfiltered." };
}

// The public boards an actor can see from its current location. Beacon gating is
// not implemented yet, so this reports what it WOULD see at this site.
function getVisibleOffers(state, { siteId, isMiner }) {
  const offers = [];
  if (!siteId) return offers;

  if (isMiner) {
    STANDING_MINING_ORDERS.filter((order) => order.siteId === siteId).forEach((order) => {
      offers.push({ kind: "mining", id: order.id, label: `${order.resourceName} → ${order.siteName}`, price: order.amount * order.paymentPerUnit });
    });
    Object.values(state.sprc?.procurementOrders ?? {})
      .filter((order) => ["offered", "active"].includes(order.status) && order.destinationSiteId === siteId)
      .forEach((order) => {
        const remaining = Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits);
        offers.push({
          kind: "purchase-order",
          id: order.id,
          label: `${order.procurementItemId} ×${remaining} remaining @ ${order.pricePerEquivalent}/unit`,
          price: remaining * order.pricePerEquivalent,
          partialAllowed: true,
        });
      });
  }

  STANDING_FREIGHT_TEMPLATES.filter((template) => template.originSiteId === siteId).forEach((template) => {
    const rate = state.logistics?.postedFreightRates?.[template.id] ?? template.payment;
    const stock = state.logistics?.institutions?.[template.sourceInstitutionId]?.inventories?.[template.commodity] ?? 0;
    offers.push({
      kind: "freight",
      id: template.id,
      label: `${template.commodityName} → ${template.destinationName}`,
      price: rate,
      available: stock >= template.amount,
    });
  });

  return offers;
}

function describeInstitution(state, institutionId) {
  if (institutionId === "sprc" && state.sprc) {
    const sprc = state.sprc;
    const orders = Object.values(sprc.procurementOrders ?? {});
    return {
      inventories: sprc.inventories,
      openOrders: orders.filter((order) => ["offered", "active"].includes(order.status)).map((order) => ({
        id: order.id, item: order.procurementItemId, required: order.requiredEquivalentUnits,
        delivered: order.deliveredEquivalentUnits, unitPrice: order.pricePerEquivalent, status: order.status,
        repriceCount: order.repriceCount ?? 0,
      })),
      repairs: Object.values(sprc.repairOrders ?? {}).map((repair) => ({
        id: repair.id, subject: repair.subjectId, condition: repair.condition, status: repair.status, price: repair.servicePrice,
      })),
      deferred: Object.values(sprc.deferredServiceRequests ?? {}).map((entry) => ({
        subjectId: entry.subjectId, reason: entry.reason, quotedPrice: entry.quotedPrice, attempts: entry.attempts,
      })),
      needs: Object.values(sprc.needs ?? {}).filter((need) => need.status === "open").map((need) => ({
        id: need.id, itemId: need.itemId, missing: need.missingAmount, urgency: need.urgency, purpose: need.purpose,
      })),
      facilities: { berth: sprc.facilities?.berthTwo?.status, mill: sprc.facilities?.maw?.activeProductionOrderId ? "busy" : "idle" },
      costBasis: state.costBasis?.institutions?.sprc?.items ?? null,
    };
  }
  return null;
}

// Every actor that has a diagnostic, for the observatory's table.
export function listInspectableActors(state, { game = null } = {}) {
  return Object.values(state.diagnostics?.actors ?? {}).map((record) => {
    const blocker = record.blocker;
    return {
      actorId: record.actorId,
      name: record.actorName,
      kind: record.actorKind,
      controllerId: record.controllerId,
      state: record.state,
      summary: record.summary,
      locationSiteId: record.locationSiteId,
      intention: record.intention?.goal ?? null,
      blockerKind: blocker?.kind ?? null,
      blockerSummary: blocker?.summary ?? null,
      waitingFor: record.waitingFor,
      wakeOn: record.wakeOn,
      nextReconsiderAt: record.nextReconsiderAt,
      lastDecisionAt: record.lastDecision?.at ?? null,
      lastAction: record.lastDecision?.chosen?.label ?? record.summary ?? null,
      updatedAt: record.updatedAt,
    };
  });
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
