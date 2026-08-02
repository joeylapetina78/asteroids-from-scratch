// Shared intention vocabulary + read-only adapter seam.
//
// An INTENTION is an actor's active commitment: what it decided to do, what it
// has tied up doing it, whether it may change its mind, and how it ended.
//
// IMPORTANT — this layer is NOT authoritative yet. Miner assignments
// (`miningOperation.allocations` + `worker.assignment`), SPRC procurement
// allocations, hub purchase orders and carrier shipments remain the source of
// truth and keep running exactly as they do. This module only ADAPTS them into
// a common shape so the broader framework can ask uniform questions across
// domains. A later slice may migrate ownership; nothing here writes to those
// systems.
//
// COVERAGE IS THE POINT. Every system that commits an actor to something must
// be adapted here, or "what is this actor doing?" quietly has holes — hubs and
// carriers were both missing while the whole hub economy was built on top of
// them, and `logistics` grew a second, inline intention shape of its own inside
// diagnostics because this one did not know about it.
//
// Answers the five questions the shared layer needs:
//   isActorCommitted()      — is this actor busy?
//   getActorIntentions()    — committed to what?
//   getReservedResources()  — what is tied up?
//   mayReconsider()         — can this be revisited?
//   getIntentionOutcome()   — completed, failed, or interrupted?

export const INTENTION_STATUS = Object.freeze({
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed",
  INTERRUPTED: "interrupted",
  ABANDONED: "abandoned",
});

export const INTENTION_KIND = Object.freeze({
  EXTRACTION: "extraction",
  SUPPLY: "supply",
  SERVICE: "service",
  TRANSPORT: "transport",
  // The buying half of a trade. A purchase is a commitment in its own right —
  // the buyer has money set aside and is waiting on somebody — and it is held
  // by a different actor than the SUPPLY intention facing it.
  PROCUREMENT: "procurement",
});

// Canonical record shape. Adapters below produce these; a future migration can
// have domains store them directly without changing consumers.
export function createIntentionRecord({
  id,
  actorId,
  kind,
  goal = null,
  objectId = null,
  contractId = null,
  reservedResources = {},
  status = INTENTION_STATUS.ACTIVE,
  reconsiderPolicy = "until-complete",
  reconsiderWhen = [],
  committedAt = Date.now(),
  resolvedAt = null,
  outcomeReason = null,
  source = null,
} = {}) {
  return {
    id, actorId, kind, goal, objectId, contractId,
    reservedResources, status, reconsiderPolicy, reconsiderWhen,
    committedAt, resolvedAt, outcomeReason, source,
  };
}

// ── Adapters (read-only views over authoritative domain state) ─────────────

// A Cinder mining allocation → an extraction intention.
// Non-preemptive by design this slice: `reconsiderPolicy: "until-complete"`
// tells the shared layer it must not expect to redirect an in-flight worker.
export function adaptMiningAllocation(allocation, { worker = null, shipRecord = null } = {}) {
  if (!allocation) return null;
  const status = allocation.status === "active"
    ? INTENTION_STATUS.ACTIVE
    : allocation.status === "completed"
      ? INTENTION_STATUS.COMPLETED
      : allocation.status === "failed"
        ? INTENTION_STATUS.FAILED
        : INTENTION_STATUS.ABANDONED;

  return createIntentionRecord({
    id: `intention:${allocation.id}`,
    actorId: allocation.workerShipId ?? worker?.id ?? null,
    kind: INTENTION_KIND.EXTRACTION,
    goal: `deliver ${allocation.amount ?? 0} ${allocation.resourceId ?? worker?.assignment?.resourceId ?? "material"}`
      + (allocation.destinationSiteName ? ` to ${allocation.destinationSiteName}` : ""),
    objectId: allocation.orderId ?? null,
    contractId: allocation.contractId ?? worker?.assignment?.contractId ?? null,
    reservedResources: {
      workerShipId: allocation.workerShipId ?? null,
      equivalentUnits: allocation.equivalentAmount ?? allocation.amount ?? 0,
      cargo: worker?.cargo ? { ...worker.cargo } : {},
    },
    status,
    // Existing behavior: a worker keeps its assignment until delivery.
    reconsiderPolicy: "until-complete",
    reconsiderWhen: ["order-canceled", "buyer-cannot-fund", "ship-disabled"],
    committedAt: allocation.acceptedAt ?? null,
    resolvedAt: allocation.completedAt ?? null,
    outcomeReason: allocation.outcomeReason ?? null,
    source: { system: "miningOperation", recordType: "allocation", recordId: allocation.id, shipStatus: shipRecord?.maintenanceStatus ?? null },
  });
}

// An SPRC procurement allocation (a supplier's reservation against an order)
// → a supply intention held by that supplier.
export function adaptProcurementAllocation(order, allocation) {
  if (!order || !allocation) return null;
  const outstanding = Math.max(0, (allocation.reservedEquivalentUnits ?? 0) - (allocation.deliveredEquivalentUnits ?? 0));
  const status = allocation.status === "completed"
    ? INTENTION_STATUS.COMPLETED
    : ["expired", "canceled"].includes(order.status)
      ? INTENTION_STATUS.INTERRUPTED
      : allocation.status === "active"
        ? INTENTION_STATUS.ACTIVE
        : INTENTION_STATUS.ABANDONED;

  return createIntentionRecord({
    id: `intention:${order.id}:${allocation.supplierInstitutionId}`,
    actorId: allocation.supplierInstitutionId,
    kind: INTENTION_KIND.SUPPLY,
    goal: `supply ${allocation.reservedEquivalentUnits ?? 0} ${order.procurementItemId ?? "equivalents"} to ${order.destinationSiteId}`,
    objectId: order.id,
    contractId: order.contractId ?? null,
    reservedResources: { equivalentUnits: outstanding, committedPayment: order.committedPayment ?? 0 },
    status,
    reconsiderPolicy: "until-complete",
    reconsiderWhen: ["order-expired", "order-canceled"],
    committedAt: allocation.createdAt ?? null,
    resolvedAt: allocation.completedAt ?? null,
    outcomeReason: order.status === "expired" ? "procurement-expired" : null,
    source: { system: "sprcOperation", recordType: "procurementAllocation", recordId: order.id, orderStatus: order.status },
  });
}

// An SPRC repair order → a service intention held by the servicing institution.
export function adaptRepairOrder(repairOrder, { institutionId = "sprc" } = {}) {
  if (!repairOrder) return null;
  const status = repairOrder.status === "completed"
    ? INTENTION_STATUS.COMPLETED
    : repairOrder.status === "canceled"
      ? INTENTION_STATUS.ABANDONED
      : INTENTION_STATUS.ACTIVE;

  return createIntentionRecord({
    id: `intention:${repairOrder.id}`,
    actorId: institutionId,
    kind: INTENTION_KIND.SERVICE,
    goal: `repair ${repairOrder.subjectId} (${repairOrder.condition})`,
    objectId: repairOrder.id,
    reservedResources: {
      produced: { ...(repairOrder.reserved?.produced ?? {}) },
      raw: { ...(repairOrder.reserved?.raw ?? {}) },
      facilityId: repairOrder.facilityId ?? null,
    },
    status,
    // A repair waiting on stock is genuinely revisitable — Sal reprices and
    // re-procures for it — unlike an in-flight worker.
    reconsiderPolicy: ["waiting-stock", "waiting-production"].includes(repairOrder.status) ? "on-material-change" : "until-complete",
    reconsiderWhen: ["materials-delivered", "account-balance-changed", "price-changed"],
    committedAt: repairOrder.createdAt ?? null,
    resolvedAt: repairOrder.completedAt ?? null,
    source: { system: "sprcOperation", recordType: "repairOrder", recordId: repairOrder.id, orderStatus: repairOrder.status },
  });
}

// ── Hub-to-hub trade: two actors, two intentions, one order ────────────────
//
// A purchase order binds both parties, but not to the same thing and not from
// the same moment. The buyer is committed as soon as it sets the money aside;
// the supplier only once it has agreed to dig. Adapting them separately is what
// lets "what is this hub committed to?" be asked of either side.

const HUB_ORDER_OUTCOME = Object.freeze({
  delivered: INTENTION_STATUS.COMPLETED,
  declined: INTENTION_STATUS.FAILED,
  withheld: INTENTION_STATUS.ABANDONED,
});

// The BUYER's side: money committed, waiting on somebody else.
export function adaptHubPurchase(order) {
  if (!order) return null;
  const status = HUB_ORDER_OUTCOME[order.status] ?? INTENTION_STATUS.ACTIVE;
  // Before a supplier has agreed, a buyer genuinely does revisit this — it
  // reprices unfilled orders and reopens declined ones. Once title and money
  // are moving, it does not.
  const stillNegotiating = ["offered", "declined"].includes(order.status);

  return createIntentionRecord({
    id: `intention:${order.id}:buyer`,
    actorId: order.buyerInstitutionId,
    kind: INTENTION_KIND.PROCUREMENT,
    goal: `buy ${order.units} ${order.resourceId} from ${order.supplierInstitutionId}`,
    objectId: order.id,
    reservedResources: {
      committedPayment: order.status === "delivered" ? 0 : (order.committedPayment ?? 0),
      freightBudget: order.freightBudget ?? 0,
    },
    status,
    reconsiderPolicy: stillNegotiating ? "on-material-change" : "until-complete",
    reconsiderWhen: ["price-changed", "supplier-conceded", "account-balance-changed", "order-declined"],
    committedAt: order.createdAt ?? null,
    resolvedAt: order.deliveredAt ?? order.declinedAt ?? null,
    outcomeReason: order.declinedReason ?? null,
    source: { system: "hubProcurement", recordType: "purchaseOrder", recordId: order.id, orderStatus: order.status, side: "buyer" },
  });
}

// The SELLER's side: ore promised and not yet handed over. Exists only once the
// supplier has actually agreed — an offer it has not answered binds nobody.
export function adaptHubSale(order) {
  if (!order || ["offered", "declined", "withheld"].includes(order.status)) return null;
  const owed = Math.max(0, (order.units ?? 0) - (order.deliveredUnits ?? 0));

  return createIntentionRecord({
    id: `intention:${order.id}:supplier`,
    actorId: order.supplierInstitutionId,
    kind: INTENTION_KIND.SUPPLY,
    goal: `supply ${order.units} ${order.resourceId} to ${order.buyerInstitutionId}`,
    objectId: order.id,
    reservedResources: {
      units: owed,
      // Once title has passed the goods are the buyer's, held under a manifest.
      manifestId: order.manifestId ?? null,
    },
    status: order.status === "delivered" ? INTENTION_STATUS.COMPLETED : INTENTION_STATUS.ACTIVE,
    // A supplier that has agreed a price is bound to it. It may shade what it
    // asks on the NEXT order, never on this one.
    reconsiderPolicy: "until-complete",
    reconsiderWhen: ["order-canceled", "buyer-cannot-pay"],
    committedAt: order.acceptedAt ?? null,
    resolvedAt: order.deliveredAt ?? null,
    source: { system: "hubProcurement", recordType: "purchaseOrder", recordId: order.id, orderStatus: order.status, side: "supplier" },
  });
}

// A carrier's run. Held by the SHIP, which is the actor that cannot be
// redirected — the same reason a mining assignment is non-preemptive.
export function adaptShipment(shipment) {
  if (!shipment) return null;
  const status = shipment.status === "delivered" ? INTENTION_STATUS.COMPLETED : INTENTION_STATUS.ACTIVE;

  return createIntentionRecord({
    id: `intention:${shipment.id}`,
    actorId: shipment.assigneeId ?? null,
    kind: INTENTION_KIND.TRANSPORT,
    goal: `deliver ${shipment.quantity} ${shipment.commodity} to ${shipment.destinationSiteId}`,
    objectId: shipment.id,
    contractId: shipment.contractId ?? null,
    reservedResources: {
      containerId: shipment.containerId ?? null,
      quantity: shipment.quantity ?? 0,
      payment: shipment.payment ?? 0,
      // Prepaid freight is carrying somebody else's property, not buying it.
      manifestId: shipment.manifestId ?? null,
    },
    status,
    // A loaded hauler is never released mid-run; that guard is load-bearing.
    reconsiderPolicy: "until-complete",
    reconsiderWhen: ["shipment-canceled", "ship-disabled"],
    committedAt: shipment.createdAt ?? null,
    resolvedAt: shipment.deliveredAt ?? null,
    source: { system: "logistics", recordType: "shipment", recordId: shipment.id, shipmentStatus: shipment.status },
  });
}

// ── Query seam ─────────────────────────────────────────────────────────────

// Every intention currently visible across the authoritative domain systems.
export function collectIntentions(state, { game = null } = {}) {
  const intentions = [];

  const workersById = new Map((game?.workerShips ?? []).map((worker) => [worker.id, worker]));
  Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {})).forEach((mining) => {
    Object.values(mining?.allocations ?? {}).forEach((allocation) => {
      const record = adaptMiningAllocation(allocation, {
        worker: workersById.get(allocation.workerShipId) ?? null,
        shipRecord: mining.ships?.[allocation.workerShipId] ?? null,
      });
      if (record) intentions.push(record);
    });
  });

  const sprc = state.sprc;
  if (sprc?.procurementOrders) {
    Object.values(sprc.procurementOrders).forEach((order) => {
      Object.values(order.allocations ?? {}).forEach((allocation) => {
        const record = adaptProcurementAllocation(order, allocation);
        if (record) intentions.push(record);
      });
    });
  }
  if (sprc?.repairOrders) {
    Object.values(sprc.repairOrders).forEach((repairOrder) => {
      const record = adaptRepairOrder(repairOrder, { institutionId: sprc.institution?.id ?? "sprc" });
      if (record) intentions.push(record);
    });
  }

  Object.values(state.hubProcurement?.orders ?? {}).forEach((order) => {
    const buyerSide = adaptHubPurchase(order);
    if (buyerSide) intentions.push(buyerSide);
    const supplierSide = adaptHubSale(order);
    if (supplierSide) intentions.push(supplierSide);
  });

  Object.values(state.logistics?.shipments ?? {}).forEach((shipment) => {
    const record = adaptShipment(shipment);
    if (record) intentions.push(record);
  });

  return intentions;
}

export function getActorIntentions(state, actorId, options = {}) {
  return collectIntentions(state, options).filter((intention) => intention.actorId === actorId);
}

export function getActiveActorIntentions(state, actorId, options = {}) {
  return getActorIntentions(state, actorId, options).filter((intention) => intention.status === INTENTION_STATUS.ACTIVE);
}

export function isActorCommitted(state, actorId, options = {}) {
  return getActiveActorIntentions(state, actorId, options).length > 0;
}

// Everything this intention has tied up — ships, units, cash, facilities.
export function getReservedResources(intention) {
  return intention?.reservedResources ?? {};
}

// May the shared layer revisit this commitment? Non-preemptive commitments
// answer false while active, which is what keeps in-flight workers stable.
export function mayReconsider(intention, { trigger = null } = {}) {
  if (!intention || intention.status !== INTENTION_STATUS.ACTIVE) return false;
  if (intention.reconsiderPolicy === "always") return true;
  if (intention.reconsiderPolicy === "until-complete") {
    return trigger ? (intention.reconsiderWhen ?? []).includes(trigger) : false;
  }
  if (intention.reconsiderPolicy === "on-material-change") {
    return trigger ? (intention.reconsiderWhen ?? []).includes(trigger) : true;
  }
  return false;
}

export function getIntentionOutcome(intention) {
  if (!intention) return null;
  return {
    status: intention.status,
    resolved: intention.status !== INTENTION_STATUS.ACTIVE,
    completed: intention.status === INTENTION_STATUS.COMPLETED,
    failed: intention.status === INTENTION_STATUS.FAILED,
    interrupted: intention.status === INTENTION_STATUS.INTERRUPTED,
    reason: intention.outcomeReason ?? null,
    resolvedAt: intention.resolvedAt ?? null,
  };
}
