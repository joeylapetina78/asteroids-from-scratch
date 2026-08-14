// Assembles a complete "what are you doing, and why?" view for one actor by
// reading existing projections. Pure read-only aggregation: it never mutates
// domain state and never scans the raw ledger for present-tense answers — it
// reads the diagnostic record and the projections, and only reaches into the
// ledger to fetch the handful of events a record already references.

import { formatBlockerChain, getDiagnostic, resolveBlockerChain } from "./diagnostics.js?v=fresh-20260813-2143-3cd1c72";
import { collectIntentions } from "./intentions.js?v=fresh-20260813-2143-3cd1c72";
import { getServiceCost } from "./costBasis.js?v=fresh-20260813-2143-3cd1c72";
import { describeActorResolution, getActorFinances } from "./actorConfig.js?v=fresh-20260813-2143-3cd1c72";
import { getRelationshipProjection } from "./relationshipProjections.js?v=fresh-20260813-2143-3cd1c72";
import { MINING_ALLOCATION_SIZE } from "./miningOperation.js?v=fresh-20260813-2143-3cd1c72";
import { listExtractionOffers } from "./extractionOffers.js?v=fresh-20260813-2143-3cd1c72";
import { getProcurementFreightOffers } from "./hubProcurement.js?v=fresh-20260813-2143-3cd1c72";

export function inspectActor(state, actorId, { game = null } = {}) {
  if (!actorId) return null;
  const diagnostic = getDiagnostic(state, actorId);
  const miningOperations = Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}));
  const miningOperation = miningOperations.find((operation) => operation?.ships?.[actorId]) ?? null;
  const miningShip = miningOperation?.ships?.[actorId] ?? null;
  const logisticsHauler = state.logistics?.haulers?.[actorId] ?? null;
  const isInstitution = diagnostic?.actorKind === "institution";
  const locationSiteId = resolveActorSiteId(state, actorId, diagnostic?.locationSiteId, game);
  const worldSite = (game?.worldSites ?? []).find((site) => site.id === locationSiteId) ?? null;

  const view = {
    actorId,
    name: diagnostic?.actorName ?? miningShip?.name ?? actorId,
    kind: diagnostic?.actorKind ?? (miningShip ? "ship" : logisticsHauler ? "ship" : "actor"),
    controllerId: diagnostic?.controllerId ?? null,
    state: diagnostic?.state ?? "unknown",
    summary: diagnostic?.summary ?? null,
    locationSiteId: locationSiteId ?? miningShip?.currentSiteId ?? logisticsHauler?.currentSiteId ?? null,
    position: diagnostic?.position ?? miningShip?.position ?? worldSite?.position ?? null,
    intention: diagnostic?.intention ?? null,
    lastDecision: diagnostic?.lastDecision ?? null,
    blockerChain: diagnostic?.blocker ? formatBlockerChain(resolveBlockerChain(state, diagnostic.blocker)) : [],
    waitingFor: diagnostic?.waitingFor ?? null,
    wakeOn: diagnostic?.wakeOn ?? [],
    nextReconsiderAt: diagnostic?.nextReconsiderAt ?? null,
    refs: diagnostic?.refs ?? { contractIds: [], targetIds: [], dependencyIds: [] },
    detail: diagnostic?.detail ?? null,
    cargo: null,
    freightPortfolio: null,
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
  } else if (logisticsHauler) {
    const npc = (game?.npcShips ?? []).find((entry) => entry.id === actorId) ?? null;
    const shipments = (logisticsHauler.activeShipmentIds ?? [logisticsHauler.activeShipmentId].filter(Boolean))
      .map((shipmentId) => state.logistics?.shipments?.[shipmentId])
      .filter(Boolean);
    view.cargo = {
      held: shipments.reduce((held, shipment) => {
        held[shipment.commodity] = (held[shipment.commodity] ?? 0) + (shipment.quantity ?? 0);
        return held;
      }, {}),
      committedTo: shipments.map((shipment) => shipment.id).join(", ") || null,
      committedUnits: shipments.reduce((sum, shipment) => sum + (shipment.quantity ?? 0), 0),
      uncommitted: null,
    };
    view.freightPortfolio = {
      capacity: npc?.commitmentPortfolio?.capacity ?? null,
      remainingCapacity: npc?.remainingCargoCapacity ?? null,
      nextStopId: npc?.route?.at(-1)?.id ?? null,
      plannedStops: Array.from(new Set(shipments.map((shipment) => shipment.destinationSiteId).filter(Boolean))),
      shipments: shipments.map((shipment) => ({
        id: shipment.id, commodity: shipment.commodity, quantity: shipment.quantity,
        ownerInstitutionId: state.logistics?.containers?.[shipment.containerId]?.ownerInstitutionId ?? null,
        destinationSiteId: shipment.destinationSiteId, status: shipment.status,
      })),
    };
  }

  // Cash: balance, and what is genuinely available after commitments/reserves.
  //
  // This used to try three state shapes in sequence and special-case SPRC by
  // name to find a bank balance — the read side proving the write side had no
  // shared substrate. It now asks the same actor configuration the decision
  // side asks, so a new kind of actor is legible here for free.
  const controllerId = view.controllerId;
  const finances = getActorFinances(state, controllerId);
  if (finances) {
    view.cash = {
      balance: Math.round(finances.balance),
      committed: Math.round(finances.committed),
      protectedCash: Math.round(finances.protectedCash),
      available: Math.round(finances.available),
      maintenanceCost: Math.round(getServiceCost(state, controllerId, "maintenance", 0)) || null,
    };
  }

  // Ship and panel condition.
  const shipInstitution = logisticsHauler ? state.logistics?.institutions?.[logisticsHauler.shipInstitutionId] : null;
  if (miningShip) {
    view.condition = {
      representedBy: { id: actorId, name: view.name },
      wear: round2(miningShip.wear),
      maintenanceStatus: miningShip.maintenanceStatus,
      pendingIssue: miningShip.pendingIssue ?? null,
      issueCount: miningShip.issueCount ?? 0,
      components: Object.values(miningShip.components ?? {}).map((component) => ({
        id: component.id, label: component.label, stage: component.condition?.stage ?? "healthy",
        currentCondition: round2(component.condition?.currentCondition),
        maxRecoverableCondition: round2(component.condition?.maxRecoverableCondition),
        lifetimeDegradation: round2(component.condition?.lifetimeDegradation),
        serviceCount: component.condition?.serviceCount ?? 0,
      })),
    };
  } else if (shipInstitution) {
    const npc = (game?.npcShips ?? []).find((entry) => entry.id === actorId) ?? null;
    view.condition = {
      representedBy: { id: actorId, name: view.name },
      wear: round2(shipInstitution.wear ?? npc?.wear),
      maintenanceStatus: npc?.operationalStatus ?? logisticsHauler.status,
      pendingIssue: npc?.pendingWearIssue ?? null,
      issueCount: shipInstitution.issueCount ?? 0,
      components: Object.values(shipInstitution.components ?? {}).map((component) => ({
        id: component.id, label: component.label, stage: component.condition?.stage ?? "healthy",
        currentCondition: round2(component.condition?.currentCondition),
        maxRecoverableCondition: round2(component.condition?.maxRecoverableCondition),
        lifetimeDegradation: round2(component.condition?.lifetimeDegradation),
        serviceCount: component.condition?.serviceCount ?? 0,
      })),
    };
  } else if (diagnostic?.detail?.components) {
    view.condition = {
      representedBy: { id: actorId, name: view.name },
      wear: round2(diagnostic.detail.aggregateWear ?? Math.max(0, ...Object.values(diagnostic.detail.components).map((component) => component.condition?.wear ?? 0))),
      maintenanceStatus: diagnostic.state,
      pendingIssue: null,
      issueCount: 0,
      components: Object.values(diagnostic.detail.components).map((component) => ({
        id: component.id, label: component.label, stage: component.condition?.stage ?? "healthy",
        currentCondition: round2(component.condition?.currentCondition),
        maxRecoverableCondition: round2(component.condition?.maxRecoverableCondition),
        lifetimeDegradation: round2(component.condition?.lifetimeDegradation),
        serviceCount: component.condition?.serviceCount ?? 0,
      })),
    };
  }

  // An institution card represents the machine currently carrying out its
  // work. Craft diagnostics are the shared seam: mining firms, carriers,
  // patrol offices, and recovery providers can all expose components without
  // teaching this inspector their domain-specific storage shape.
  if (isInstitution && !view.condition) {
    const representative = selectRepresentativeCraftDiagnostic(state, actorId);
    if (representative?.detail?.components) view.condition = projectDiagnosticCondition(representative);
  }

  // Where this actor's configuration actually came from. Read it when an actor
  // is behaving like somebody else: a source of `unresolved` or
  // `framework-default` on anything that decides is the tell, and both of the
  // worst bugs in this system would have been one glance away.
  view.resolution = describeActorResolution(state, actorId);
  if (controllerId && controllerId !== actorId) {
    view.controllerResolution = describeActorResolution(state, controllerId);
  }

  // Beacon access — currently only the player carries beacon memory, so this
  // reports honestly rather than inventing institutional access.
  view.beaconAccess = getBeaconAccess(state, controllerId);

  // Public offers this actor could act on from where it stands.
  view.visibleOffers = getVisibleOffers(state, { actorId, siteId: view.locationSiteId, kind: view.kind, isMiner: Boolean(miningShip) });

  // The market-wide freight comparison that actually allocates work. Keep the
  // losing bids visible: otherwise a deterministic auction merely replaces
  // silent iteration order with an equally opaque score.
  if (logisticsHauler) {
    view.freightBids = Object.values(state.logistics?.carrierBidDiagnostics ?? {})
      .map((market) => ({
        templateId: market.templateId,
        winnerShipId: market.winnerShipId,
        at: market.at,
        bid: market.bids?.find((entry) => entry.shipId === actorId) ?? null,
      }))
      .filter((entry) => entry.bid)
      .slice(0, 8);
  }

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

function selectRepresentativeCraftDiagnostic(state, institutionId) {
  const candidates = Object.values(state.diagnostics?.actors ?? {})
    .filter((record) => record.actorKind === "ship"
      && record.controllerId === institutionId
      && record.state !== "retired"
      && record.detail?.components);
  const stateRank = { working: 0, committed: 1, waiting: 2, free: 3, disabled: 4 };
  return candidates.sort((left, right) =>
    (stateRank[left.state] ?? 5) - (stateRank[right.state] ?? 5)
      || String(left.actorName).localeCompare(String(right.actorName), undefined, { sensitivity: "base", numeric: true }))[0] ?? null;
}

function projectDiagnosticCondition(diagnostic) {
  const rawComponents = Object.values(diagnostic.detail.components);
  return {
    representedBy: { id: diagnostic.actorId, name: diagnostic.actorName },
    wear: round2(diagnostic.detail.aggregateWear ?? Math.max(0, ...rawComponents.map((component) => component.condition?.wear ?? 0))),
    maintenanceStatus: diagnostic.state,
    pendingIssue: null,
    issueCount: 0,
    components: rawComponents.map((component) => ({
      id: component.id,
      label: component.label,
      stage: component.condition?.stage ?? "healthy",
      currentCondition: round2(component.condition?.currentCondition),
      maxRecoverableCondition: round2(component.condition?.maxRecoverableCondition),
      lifetimeDegradation: round2(component.condition?.lifetimeDegradation),
      serviceCount: component.condition?.serviceCount ?? 0,
    })),
  };
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
    const miningOperations = Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}));
    // Every issuer, from the same board the miner actually chooses from.
    //
    // This used to read `amount * paymentPerUnit` off STANDING_MINING_ORDERS,
    // which has carried neither field since orders became derived from a real
    // inventory gap — so the price shown here was NaN — and it separately
    // enumerated SPRC's purchase orders by name, missing every other issuer.
    listExtractionOffers(state, {
      allocations: Object.assign({}, ...miningOperations.map((operation) => operation?.allocations ?? {})),
      harvestCapacity: MINING_ALLOCATION_SIZE,
    })
      .filter((offer) => offer.siteId === siteId)
      .forEach((offer) => {
        const price = offer.equivalentAmount != null
          ? offer.equivalentAmount * (offer.pricePerEquivalent ?? 0)
          : offer.amount * (offer.paymentPerUnit ?? 0);
        offers.push({
          kind: "extraction",
          id: offer.id,
          label: `${offer.amount} ${offer.resourceName} → ${offer.siteName}`,
          issuer: offer.issuerInstitutionId,
          price: Math.round(price),
          partialAllowed: Boolean(offer.concurrent),
        });
      });
  }

  getProcurementFreightOffers(state).filter((template) => template.originSiteId === siteId).forEach((template) => {
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
      salvage: Object.values(state.wrecks?.records ?? {}).filter((wreck) => wreck.ownerInstitutionId === "sprc" || wreck.previousOwnerInstitutionId).map((wreck) => ({
        id: wreck.id, shipName: wreck.shipName, previousOwnerInstitutionId: wreck.previousOwnerInstitutionId,
        status: wreck.status, acquisitionPrice: wreck.acquisitionPrice, recoveryBudget: wreck.recoveryBudget,
        dismantlingOrderId: wreck.dismantlingOrderId, plannedYield: wreck.plannedSalvageYield, recoveredYield: wreck.salvageYield,
      })),
      facilities: { berth: sprc.facilities?.berthTwo?.status, mill: sprc.facilities?.maw?.activeProductionOrderId ? "busy" : "idle" },
      costBasis: state.costBasis?.institutions?.sprc?.items ?? null,
    };
  }
  const institution = state.logistics?.institutions?.[institutionId];
  if (!institution) return null;
  const account = institution.accounts?.operating ?? institution.account ?? null;
  const purchaseOrders = Object.values(state.hubProcurement?.orders ?? state.hubProcurementOrders ?? {})
    .filter((order) => order.buyerInstitutionId === institutionId);
  return {
    inventories: institution.inventories ?? {},
    account: account ? {
      balance: Math.round(account.balance ?? 0),
      committed: Math.round(account.committed ?? 0),
      available: Math.round((account.balance ?? 0) - (account.committed ?? 0)),
    } : null,
    renewableResources: institution.renewableResources ?? [],
    openOrders: purchaseOrders.filter((order) => !["completed", "canceled", "expired"].includes(order.status)).map((order) => ({
      id: order.id,
      item: order.resourceId ?? order.family ?? order.resourceFamily ?? order.commodity ?? order.itemId,
      required: order.units ?? order.quantity ?? order.requiredAmount ?? order.requiredEquivalentUnits,
      delivered: order.deliveredUnits ?? order.deliveredAmount ?? order.deliveredEquivalentUnits ?? 0,
      unitPrice: order.unitPrice ?? order.pricePerUnit ?? order.pricePerEquivalent,
      status: order.status,
      repriceCount: order.repriceCount ?? 0,
    })),
    repairs: [],
    deferred: [],
    needs: [],
    facilities: null,
    costBasis: state.costBasis?.institutions?.[institutionId]?.items ?? null,
  };
}

// Every actor that has a diagnostic, for the observatory's table.
export function listInspectableActors(state, { game = null, includeRetired = false } = {}) {
  return Object.values(state.diagnostics?.actors ?? {})
    .filter((record) => includeRetired || record.state !== "retired")
    .map((record) => {
    const blocker = record.blocker;
    const locationSiteId = resolveActorSiteId(state, record.actorId, record.locationSiteId, game);
    return {
      actorId: record.actorId,
      name: record.actorName,
      kind: record.actorKind,
      controllerId: record.controllerId,
      state: record.state,
      summary: record.summary,
      locationSiteId,
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
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true }) || left.actorId.localeCompare(right.actorId));
}

function resolveActorSiteId(state, actorId, reportedSiteId, game) {
  const knownSites = game?.worldSites ?? [];
  if (reportedSiteId && (knownSites.length === 0 || knownSites.some((site) => site.id === reportedSiteId))) return reportedSiteId;
  const institutionSiteId = state.logistics?.institutions?.[actorId]?.siteId;
  if (institutionSiteId) return institutionSiteId;
  return reportedSiteId ?? null;
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
