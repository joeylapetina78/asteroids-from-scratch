// Assembles a complete "what are you doing, and why?" view for one actor by
// reading existing projections. Pure read-only aggregation: it never mutates
// domain state and never scans the raw ledger for present-tense answers — it
// reads the diagnostic record and the projections, and only reaches into the
// ledger to fetch the handful of events a record already references.

import { formatBlockerChain, getDiagnostic, resolveBlockerChain } from "./diagnostics.js?v=fresh-20260906-2103-9bc38bc0";
import { collectIntentions } from "./intentions.js?v=fresh-20260906-2103-9bc38bc0";
import { getServiceCost } from "./costBasis.js?v=fresh-20260906-2103-9bc38bc0";
import { describeActorResolution, findActorRecord, getActorFinances } from "./actorConfig.js?v=fresh-20260906-2103-9bc38bc0";
import { getRelationshipProjection } from "./relationshipProjections.js?v=fresh-20260906-2103-9bc38bc0";
import { MINING_ALLOCATION_SIZE } from "./miningOperation.js?v=fresh-20260906-2103-9bc38bc0";
import { listExtractionOffers } from "./extractionOffers.js?v=fresh-20260906-2103-9bc38bc0";
import { getProcurementFreightOffers } from "./hubProcurement.js?v=fresh-20260906-2103-9bc38bc0";
import { getActorCapabilityPortfolio } from "./assetCapabilities.js?v=fresh-20260906-2103-9bc38bc0";
import { getHubActor } from "./hubActors.js?v=fresh-20260906-2103-9bc38bc0";

export function inspectActor(state, actorId, { game = null } = {}) {
  if (!actorId) return null;
  const infrastructure = findInfrastructure(state, actorId);
  if (infrastructure) return inspectInfrastructure(state, infrastructure, game);
  const actorRecord = findActorRecord(state, actorId);
  const hubActor = getHubActor(state, actorId);
  const diagnostic = getDiagnostic(state, actorId);
  const miningOperations = Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}));
  const miningOperation = miningOperations.find((operation) => operation?.ships?.[actorId]) ?? null;
  const miningShip = miningOperation?.ships?.[actorId] ?? null;
  const logisticsHauler = state.logistics?.haulers?.[actorId] ?? null;
  const physicalNpc = (game?.npcShips ?? []).find((entry) => entry.id === actorId) ?? null;
  const isInstitution = diagnostic?.actorKind === "institution";
  const isPhysicalTransit = Boolean(physicalNpc && physicalNpc.dockedSiteId == null
    && ["loading", "available", "tow-loading", "being-towed"].includes(physicalNpc.operationalStatus));
  const locationSiteId = isPhysicalTransit
    ? null
    : physicalNpc?.dockedSiteId ?? resolveActorSiteId(state, actorId, diagnostic?.locationSiteId, game);
  const worldSite = (game?.worldSites ?? []).find((site) => site.id === locationSiteId) ?? null;

  const view = {
    actorId,
    name: diagnostic?.actorName ?? miningShip?.name ?? actorId,
    kind: diagnostic?.actorKind ?? (miningShip ? "ship" : logisticsHauler ? "ship" : "actor"),
    controllerId: diagnostic?.controllerId ?? null,
    state: diagnostic?.state ?? "unknown",
    summary: diagnostic?.summary ?? null,
    locationSiteId: isPhysicalTransit ? "in-transit" : locationSiteId ?? miningShip?.currentSiteId ?? logisticsHauler?.currentSiteId ?? null,
    position: physicalNpc?.position ?? diagnostic?.position ?? miningShip?.position ?? worldSite?.position ?? null,
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
    capabilityPortfolio: null,
    agency: actorRecord?.agency ?? null,
    hubActor: null,
    history: null,
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
    const npc = physicalNpc;
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
      uncommitted: shipments.length > 0 ? null : {},
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
  const finances = getActorFinances(state, hubActor ? actorId : controllerId);
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
  const portfolio = getActorCapabilityPortfolio(state, actorId);
  if (portfolio.found) {
    view.capabilityPortfolio = {
      assets: portfolio.assets.map((asset) => ({
        id: asset.id, name: asset.name, archetypeId: asset.archetypeId,
        status: asset.status ?? "active", scope: asset.scope ?? {},
      })),
      capabilities: portfolio.capabilities.map((grant) => ({
        id: grant.id, scope: grant.scope ?? {}, source: grant.source,
      })),
      offerTypes: portfolio.offerTypes,
    };
  }
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

  if (hubActor) {
    view.hubActor = {
      population: hubActor.population ? { id: hubActor.population.id, name: hubActor.population.name, size: hubActor.population.size } : null,
      facilityCount: hubActor.facilities.length,
      assetCount: hubActor.assets.length,
      needCount: hubActor.needs.filter((need) => !["resolved", "completed", "canceled"].includes(need.status)).length,
      projectCount: hubActor.projects.filter((project) => !["completed", "failed", "canceled"].includes(project.status)).length,
      relationshipCount: hubActor.relationships.length,
      historyCount: hubActor.history.length,
    };
    view.institution = describeHubActor(hubActor);
  } else if (isInstitution) view.institution = describeInstitution(state, actorId);
  if (controllerId) {
    view.relationships = Object.values(state.relationships?.projections ?? {})
      .filter((projection) => projection.fromId === controllerId || projection.toId === controllerId)
      .slice(0, 6);
  }

  view.history = describeHistory(state, actorId, actorRecord);

  return view;
}

export function listInspectableInfrastructure(state) {
  const facilities = [];
  Object.values(state.industrial?.factories ?? {}).forEach((factory) => facilities.push({
    id: factory.id, name: factory.name ?? factory.id, kind: "parts factory",
    facilityType: "parts-factory", siteId: state.logistics?.institutions?.[factory.institutionId]?.siteId ?? factory.institutionId,
    record: factory,
  }));
  Object.values(state.logistics?.institutions ?? {})
    .filter((institution) => institution?.archetypeId === "shipyard")
    .forEach((yard) => facilities.push({
      id: yard.id, name: yard.name ?? yard.id, kind: "shipyard",
      facilityType: "shipyard", siteId: yard.siteId, record: yard,
    }));
  Object.values(state.sprc?.facilities ?? {}).forEach((facility) => facilities.push({
    id: facility.id, name: facility.name ?? facility.id,
    kind: facility.facilityType === "repair-berth" ? "repair berth" : "recovery mill",
    facilityType: facility.facilityType, siteId: state.sprc?.institution?.siteId ?? "scrap-porch", record: facility,
  }));
  return facilities;
}

function findInfrastructure(state, id) {
  return listInspectableInfrastructure(state).find((facility) => facility.id === id) ?? null;
}

function inspectInfrastructure(state, facility, game) {
  const record = facility.record;
  const site = (game?.worldSites ?? []).find((candidate) => candidate.id === facility.siteId);
  const ownerId = record.ownerInstitutionId ?? record.institutionId ?? state.sprc?.institution?.ownerInstitutionId ?? null;
  const controllerId = record.operatorInstitutionId ?? ownerId;
  const history = describeFacilityHistory(state, facility);
  const workingOn = record.activeRun?.output
    ?? record.build?.hullClass
    ?? record.activeProductionOrderId
    ?? record.activeRepairOrderId
    ?? null;
  return {
    actorId: facility.id,
    name: facility.name,
    kind: facility.kind,
    controllerId,
    state: workingOn ? "working" : record.status ?? "available",
    summary: workingOn ? `Working on ${String(workingOn).replaceAll("-", " ")}` : "Available for work",
    locationSiteId: facility.siteId,
    position: site?.position ?? null,
    intention: null, lastDecision: null, blockerChain: [], waitingFor: null, wakeOn: [], nextReconsiderAt: null,
    refs: { contractIds: [], targetIds: [], dependencyIds: [] },
    detail: describeFacilitySnapshot(state, facility),
    cargo: null, freightPortfolio: null, cash: null, condition: null, beaconAccess: null,
    visibleOffers: [], recentEvents: history.recent, institution: null, capabilityPortfolio: null,
    agency: null, hubActor: null, history,
  };
}

function describeFacilitySnapshot(state, facility) {
  const record = facility.record;
  if (facility.facilityType === "parts-factory") return {
    output: record.recipes?.map((recipe) => recipe.output).join(", "),
    currentRun: record.activeRun?.id ?? null,
    completedRuns: record.completedRuns ?? 0,
    ordersAccepted: record.operatingHistory?.ordersAccepted ?? 0,
  };
  if (facility.facilityType === "shipyard") return {
    currentBuild: record.build?.hullClass ?? null,
    readyHulls: { ...(record.readyHulls ?? {}) },
    waitingOnParts: record.waitingOnParts ?? null,
  };
  if (facility.facilityType === "repair-berth") return {
    activeRepair: record.activeRepairOrderId ?? null,
    capacity: record.capacity ?? 1,
  };
  return {
    activeProduction: record.activeProductionOrderId ?? null,
    capacity: record.capacity ?? 1,
  };
}

function describeFacilityHistory(state, facility) {
  // Ownership is not identity: a factory card must not inherit every event at
  // its parent hub. Facility history includes only records that name it.
  const events = relatedEvents(state, facility.id);
  const counts = {};
  if (facility.facilityType === "parts-factory") {
    const orders = Object.values(state.hubProcurement?.orders ?? {}).filter((order) => order.factoryId === facility.id);
    const openOrders = orders.filter((order) => !["delivered", "withheld", "declined"].includes(order.status));
    counts["Units produced"] = facility.record.operatingHistory?.unitsProduced ?? facility.record.completedRuns ?? 0;
    counts["Production runs"] = facility.record.completedRuns ?? 0;
    counts["Raw units consumed"] = facility.record.operatingHistory?.rawUnitsConsumed ?? 0;
    counts["Orders completed"] = orders.filter((order) => order.status === "delivered").length;
    counts["Open backlog units"] = openOrders.reduce((sum, order) => sum + Math.max(0, (order.units ?? 0) - (order.deliveredUnits ?? 0)), 0);
  } else if (facility.facilityType === "shipyard") {
    counts["Hulls completed"] = facility.record.operatingHistory?.hullsCompleted
      ?? events.filter((event) => event.type === "shipyard.hullLaunched").length;
    counts["Hulls sold"] = facility.record.operatingHistory?.hullsSold
      ?? events.filter((event) => event.type === "shipyard.hullSold").length;
    counts["Sales revenue"] = Math.round(facility.record.operatingHistory?.salesRevenue ?? 0);
    counts["Hulls ready"] = Object.values(facility.record.readyHulls ?? {}).reduce((sum, value) => sum + value, 0);
  } else if (facility.facilityType === "repair-berth") {
    const orders = Object.values(state.sprc?.repairOrders ?? {}).filter((order) => (order.activeFacilityId ?? order.facilityId) === facility.id);
    counts["Repairs completed"] = orders.filter((order) => order.status === "completed").length;
    counts["Jobs handled"] = orders.length;
  } else {
    const orders = Object.values(state.sprc?.productionOrders ?? {}).filter((order) => order.facilityId === facility.id);
    counts["Batches completed"] = orders.filter((order) => order.status === "completed").length;
    counts["Wrecks dismantled"] = events.filter((event) => event.type === "sprc.salvageDismantled").length;
    counts["Jobs handled"] = orders.length;
  }
  return { counts, recent: recentHistory(events) };
}

function describeHistory(state, actorId, actorRecord) {
  const events = relatedEvents(state, actorId);
  const counts = {};
  events.forEach((event) => {
    const label = historyLabel(event.type);
    if (label) counts[label] = (counts[label] ?? 0) + 1;
  });
  if (actorRecord?.settlementTrade) {
    counts["Goods sold"] = actorRecord.settlementTrade.unitsSold ?? 0;
    counts["Trade revenue"] = Math.round(actorRecord.settlementTrade.revenue ?? 0);
  }
  const mining = Object.values(state.miningOperations ?? {}).find((operation) => operation?.institution?.id === actorId);
  if (mining?.throughput) {
    counts["Mining runs completed"] = mining.throughput.deliveries ?? 0;
    counts["Material delivered"] = mining.throughput.unitsDelivered ?? 0;
    counts["Mining revenue"] = Math.round(mining.throughput.revenue ?? 0);
    Object.entries(mining.throughput.unitsByResource ?? {}).forEach(([resourceId, units]) => {
      counts[`Delivered · ${resourceId.replaceAll("-", " ")}`] = units;
    });
    const ships = Object.values(mining.ships ?? {});
    counts["Fleet size"] = ships.length;
    counts["Fleet available"] = ships.filter((ship) => ship.maintenanceStatus === "available").length;
  }
  return { counts, recent: recentHistory(events) };
}

function relatedEvents(state, ...ids) {
  const wanted = new Set(ids.filter(Boolean));
  if (wanted.size === 0) return [];
  return (state.ledger?.getRetainedEvents?.({ includeHidden: true }) ?? []).filter((event) =>
    Object.values(event.payload ?? {}).some((value) => typeof value === "string" && wanted.has(value)));
}

function recentHistory(events) {
  return events.slice(-8).reverse().map((event) => ({
    id: event.id, type: event.type, at: event.time, message: event.message ?? event.type,
  }));
}

function historyLabel(type) {
  if (/delivery|delivered|fulfilled/i.test(type)) return "Deliveries completed";
  if (/sold|purchased/i.test(type)) return "Sales and purchases";
  if (/produced|completed|launched|dismantled/i.test(type)) return "Things completed";
  if (/mined|extracted|collected/i.test(type)) return "Material collected";
  if (/repair/i.test(type)) return "Repair events";
  return null;
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
      salvage: Object.values(state.wrecks?.records ?? {}).filter((wreck) => ["sprc", "scrap-forge"].includes(wreck.ownerInstitutionId) || wreck.previousOwnerInstitutionId).map((wreck) => ({
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

function describeHubActor(hub) {
  const account = hub.treasury;
  return {
    inventories: hub.inventory ?? {},
    account: account ? {
      balance: Math.round(account.balance ?? 0),
      committed: Math.round(account.committed ?? 0),
      available: Math.round((account.balance ?? 0) - (account.committed ?? 0)),
    } : null,
    renewableResources: hub.institution.renewableResources ?? [],
    openOrders: hub.domain.purchaseOrders.filter((order) => !["completed", "canceled", "expired", "delivered"].includes(order.status)).map((order) => ({
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
    needs: hub.needs.map((need) => ({
      id: need.id, itemId: need.itemId ?? need.kind,
      missing: need.shortage ?? need.missingAmount ?? 0,
      urgency: need.urgency ?? need.status, purpose: need.purpose ?? need.source,
    })),
    projects: hub.projects.map((project) => ({ id: project.id, name: project.name, kind: project.kind, status: project.status })),
    departments: hub.departments,
    facilities: {
      count: hub.facilities.length,
      names: hub.facilities.map((facility) => facility.name ?? facility.id),
    },
    policies: hub.policies,
    history: hub.history,
    costBasis: null,
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
