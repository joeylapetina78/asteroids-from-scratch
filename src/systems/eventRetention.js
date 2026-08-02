// Ledger retention + integrity classification.
//
// Event definitions declare how long they matter and at what detail, instead of
// every event being treated alike. This module ships the CLASSIFICATION and the
// helpers; actual pruning and aggregation are deliberately not implemented yet
// (see `describeRetentionPolicy` for the intended policy per class).
//
// `visibility` is declared now and NOT enforced. It reserves room for the later
// investigation/criminal systems, where an event may be known only partially,
// concealed, faked, or discoverable.

export const RETENTION_CLASS = Object.freeze({
  // Telemetry. Expires quickly; aggregate to counters almost immediately.
  EPHEMERAL: "ephemeral",
  // Decisions and operations. Keep detailed long enough to diagnose, then
  // summarize.
  OPERATIONAL: "operational",
  // History that supports relationships, biography, legal record, and
  // investigation. May persist indefinitely.
  DURABLE: "durable",
});

export const EVENT_VISIBILITY = Object.freeze({
  PUBLIC: "public",
  PRIVATE: "private",
  RESTRICTED: "restricted",
  HIDDEN: "hidden",
  ENCRYPTED: "encrypted",
  SUPPRESSED: "suppressed",
  FALSIFIED: "falsified",
  DISPUTED: "disputed",
  PARTIALLY_KNOWN: "partially-known",
  DISCOVERABLE: "discoverable",
});

// Exact-match classifications. Anything unmatched falls back to prefix rules,
// then to OPERATIONAL — the safe middle: diagnosable, not kept forever.
const EXPLICIT_CLASSES = Object.freeze({
  // ── Ephemeral telemetry ──────────────────────────────────────────────
  "player.thrust": RETENTION_CLASS.EPHEMERAL,
  "ship.moved": RETENTION_CLASS.EPHEMERAL,
  "weapon.fired": RETENTION_CLASS.EPHEMERAL,
  "scanner.activated": RETENTION_CLASS.EPHEMERAL,
  "scanner.subjectScanned": RETENTION_CLASS.EPHEMERAL,
  "tractor.toggled": RETENTION_CLASS.EPHEMERAL,
  "resource.processed": RETENTION_CLASS.EPHEMERAL,
  "resource.collected": RETENTION_CLASS.EPHEMERAL,
  "resource.processingRejected": RETENTION_CLASS.EPHEMERAL,

  // ── Operational ──────────────────────────────────────────────────────
  "institution.jobValued": RETENTION_CLASS.OPERATIONAL,
  "institution.pricedOffer": RETENTION_CLASS.OPERATIONAL,
  "institution.servicePriced": RETENTION_CLASS.OPERATIONAL,
  "institution.offerRepriced": RETENTION_CLASS.OPERATIONAL,
  "institution.askShaded": RETENTION_CLASS.OPERATIONAL,
  "procurement.counterOffered": RETENTION_CLASS.OPERATIONAL,
  "institution.freightRepriced": RETENTION_CLASS.OPERATIONAL,
  "institution.valuationDeclined": RETENTION_CLASS.OPERATIONAL,
  "institution.costBasisUpdated": RETENTION_CLASS.OPERATIONAL,
  "institution.contractAllocated": RETENTION_CLASS.OPERATIONAL,
  "mining.contractAccepted": RETENTION_CLASS.OPERATIONAL,
  "mining.waitingForFundedWork": RETENTION_CLASS.OPERATIONAL,
  "mining.deliveryAbandoned": RETENTION_CLASS.OPERATIONAL,
  "worker.delivery.rejected": RETENTION_CLASS.OPERATIONAL,
  "worker.delivery.abandoned": RETENTION_CLASS.OPERATIONAL,
  "mining.surplusSold": RETENTION_CLASS.OPERATIONAL,
  "carrier.contractAccepted": RETENTION_CLASS.OPERATIONAL,
  "carrier.contractFulfilled": RETENTION_CLASS.OPERATIONAL,
  "sprc.repairCreated": RETENTION_CLASS.OPERATIONAL,
  "sprc.repairDeferred": RETENTION_CLASS.OPERATIONAL,
  "sprc.repairRetryAdmitted": RETENTION_CLASS.OPERATIONAL,
  "sprc.repairDeclined": RETENTION_CLASS.OPERATIONAL,
  "sprc.productionCompleted": RETENTION_CLASS.OPERATIONAL,
  "contract.offered": RETENTION_CLASS.OPERATIONAL,
  "contract.accepted": RETENTION_CLASS.OPERATIONAL,
  "contract.deadlineExtended": RETENTION_CLASS.OPERATIONAL,
  "ship.panelConditionChanged": RETENTION_CLASS.OPERATIONAL,
  "ship.repairReserveEmpty": RETENTION_CLASS.OPERATIONAL,
  "population.demandRaised": RETENTION_CLASS.OPERATIONAL,
  "population.productionStarted": RETENTION_CLASS.OPERATIONAL,
  "population.productionCompleted": RETENTION_CLASS.OPERATIONAL,

  // ── Durable history ──────────────────────────────────────────────────
  "sprc.repairCompleted": RETENTION_CLASS.DURABLE,
  "mining.maintenanceCompleted": RETENTION_CLASS.DURABLE,
  "mining.serviceDebtOutstanding": RETENTION_CLASS.DURABLE,
  "ship.repaired": RETENTION_CLASS.DURABLE,
  "ship.towed": RETENTION_CLASS.DURABLE,
  "ship.stranded": RETENTION_CLASS.DURABLE,
  "ship.purchased": RETENTION_CLASS.DURABLE,
  "ship.titleIssued": RETENTION_CLASS.DURABLE,
  "ship.registered": RETENTION_CLASS.DURABLE,
  "wreck.created": RETENTION_CLASS.DURABLE,
  "wreck.salvageAuthorized": RETENTION_CLASS.DURABLE,
  "wreck.salvagePosted": RETENTION_CLASS.DURABLE,
  "wreck.salvageDelivered": RETENTION_CLASS.DURABLE,
  "title.lienAttached": RETENTION_CLASS.DURABLE,
  "contract.paid": RETENTION_CLASS.DURABLE,
  // Money changing hands and goods leaving the world are both history.
  "population.goodsPurchased": RETENTION_CLASS.DURABLE,
  "population.goodsConsumed": RETENTION_CLASS.DURABLE,
  "population.incomeReceived": RETENTION_CLASS.DURABLE,
  "contract.expired": RETENTION_CLASS.DURABLE,
  "legal.zoneFlag": RETENTION_CLASS.DURABLE,
  "institution.action": RETENTION_CLASS.DURABLE,
});

// Prefix fallbacks for families of events not listed individually.
const PREFIX_CLASSES = Object.freeze([
  ["player.", RETENTION_CLASS.EPHEMERAL],
  ["worker.", RETENTION_CLASS.EPHEMERAL],
  ["lifeform.", RETENTION_CLASS.EPHEMERAL],
  ["freight.", RETENTION_CLASS.OPERATIONAL],
  ["logistics.", RETENTION_CLASS.OPERATIONAL],
  ["mining.", RETENTION_CLASS.OPERATIONAL],
  ["carrier.", RETENTION_CLASS.OPERATIONAL],
  ["sprc.", RETENTION_CLASS.OPERATIONAL],
  ["institution.", RETENTION_CLASS.OPERATIONAL],
  ["contract.", RETENTION_CLASS.OPERATIONAL],
  ["population.", RETENTION_CLASS.OPERATIONAL],
]);

export function getRetentionClass(eventType) {
  if (!eventType) return RETENTION_CLASS.OPERATIONAL;
  if (EXPLICIT_CLASSES[eventType]) return EXPLICIT_CLASSES[eventType];
  const prefix = PREFIX_CLASSES.find(([candidate]) => eventType.startsWith(candidate));
  return prefix ? prefix[1] : RETENTION_CLASS.OPERATIONAL;
}

export function isDurable(eventType) {
  return getRetentionClass(eventType) === RETENTION_CLASS.DURABLE;
}

export function isEphemeral(eventType) {
  return getRetentionClass(eventType) === RETENTION_CLASS.EPHEMERAL;
}

// Default integrity for a newly recorded event. Everything is public until the
// concealment systems exist; kept as a function so those systems can override
// per event without touching call sites.
export function getDefaultVisibility() {
  return EVENT_VISIBILITY.PUBLIC;
}

// The intended policy per class. Not yet applied — documented here so the
// pruning pass has a single source of truth when retention pressure is real.
export function describeRetentionPolicy(retentionClass) {
  switch (retentionClass) {
    case RETENTION_CLASS.EPHEMERAL:
      return { detailWindowMs: 30 * 1000, aggregate: "counters", keepIndefinitely: false };
    case RETENTION_CLASS.DURABLE:
      return { detailWindowMs: Infinity, aggregate: "none", keepIndefinitely: true };
    case RETENTION_CLASS.OPERATIONAL:
    default:
      return { detailWindowMs: 20 * 60 * 1000, aggregate: "summaries", keepIndefinitely: false };
  }
}

// Annotate an event with its retention class and integrity, for the ledger and
// the observatory to filter on.
export function classifyEvent(eventType) {
  const retentionClass = getRetentionClass(eventType);
  return {
    retentionClass,
    visibility: getDefaultVisibility(),
    policy: describeRetentionPolicy(retentionClass),
  };
}
