// Shared intention vocabulary + read-only adapter seam.
//
// An INTENTION is an actor's active commitment: what it decided to do, what it
// has tied up doing it, whether it may change its mind, and how it ended.
//
// IMPORTANT — this layer is NOT authoritative yet. Miner assignments
// (`miningOperation.allocations` + `worker.assignment`) and SPRC procurement
// allocations remain the source of truth and keep running exactly as they do.
// This module only ADAPTS them into a common shape so the broader framework can
// ask uniform questions across domains. A later slice may migrate ownership;
// nothing here writes to those systems.
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
    goal: `deliver ${allocation.amount ?? 0} ${worker?.assignment?.resourceId ?? "material"}`,
    objectId: allocation.orderId ?? null,
    contractId: worker?.assignment?.contractId ?? null,
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

// ── Query seam ─────────────────────────────────────────────────────────────

// Every intention currently visible across the authoritative domain systems.
export function collectIntentions(state, { game = null } = {}) {
  const intentions = [];

  const mining = state.miningOperation;
  if (mining?.allocations) {
    const workersById = new Map((game?.workerShips ?? []).map((worker) => [worker.id, worker]));
    Object.values(mining.allocations).forEach((allocation) => {
      const record = adaptMiningAllocation(allocation, {
        worker: workersById.get(allocation.workerShipId) ?? null,
        shipRecord: mining.ships?.[allocation.workerShipId] ?? null,
      });
      if (record) intentions.push(record);
    });
  }

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
