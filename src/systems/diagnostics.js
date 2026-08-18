// Developer-facing diagnostics: the third layer, alongside the raw event stream
// and the projections.
//
//   1. eventLedger        — what happened (append-only history)
//   2. projections        — current summaries (cost basis, relationships, ...)
//   3. diagnostics (here) — WHY an actor is doing what it is doing now
//
// This is a compact CURRENT projection, upserted at decision points and state
// transitions. It must never answer a present-tense question by scanning the
// ledger; it keeps bounded `eventIds` purely as references for history.
//
// Domain systems stay authoritative. Diagnostics adapts their assignments,
// allocations, service requests, and intention records rather than owning them.

export const DIAGNOSTIC_STATE = Object.freeze({
  FREE: "free",
  WORKING: "working",
  COMMITTED: "committed",
  WAITING: "waiting",
  DEFERRED: "deferred",
  DISABLED: "disabled",
  INSOLVENT: "insolvent",
  RETIRED: "retired",
});

// States in which an actor is not making progress — the observatory's blocker list.
const STALLED_STATES = new Set([
  DIAGNOSTIC_STATE.WAITING,
  DIAGNOSTIC_STATE.DEFERRED,
  DIAGNOSTIC_STATE.DISABLED,
  DIAGNOSTIC_STATE.INSOLVENT,
]);

export const BLOCKER_KIND = Object.freeze({
  NO_ELIGIBLE_WORK: "no-eligible-work",
  NO_ELIGIBLE_CARGO: "no-eligible-cargo",
  SOURCE_OUT_OF_STOCK: "source-out-of-stock",
  BELOW_COST: "below-carrier-cost",
  PAYER_CANNOT_FUND: "payer-cannot-fund",
  PAYER_CANNOT_AFFORD: "payer-cannot-afford",
  AWAITING_MATERIAL: "awaiting-material",
  AWAITING_SERVICE: "awaiting-service",
  AWAITING_PRODUCTION: "awaiting-production",
  UNFILLED_ORDER: "unfilled-order",
  ORDER_FULLY_ALLOCATED: "order-fully-allocated",
  OUTBID: "outbid",
  NO_ROUTE: "no-route-to-destination",
  ALL_SUPPLIERS_COMMITTED: "all-suppliers-committed",
  UNPAID_SERVICE_DEBT: "unpaid-service-debt",
  FACILITY_OCCUPIED: "facility-occupied",
  MAINTENANCE_POLICY: "maintenance-policy",
});

const MAX_EVENT_REFS = 10;
const MAX_ALTERNATIVES = 6;
const MAX_BLOCKER_DEPTH = 8;
const MAX_RETIRED_TOMBSTONES = 100;

export function ensureDiagnostics(state) {
  state.diagnostics ??= { actors: {}, updatedAt: null };
  state.diagnostics.actors ??= {};
  return state.diagnostics;
}

function ensureRecord(state, actorId) {
  const diagnostics = ensureDiagnostics(state);
  diagnostics.actors[actorId] ??= {
    actorId,
    actorName: actorId,
    actorKind: "actor",
    controllerId: null,
    state: DIAGNOSTIC_STATE.FREE,
    summary: null,
    locationSiteId: null,
    position: null,
    intention: null,
    lastDecision: null,
    blocker: null,
    waitingFor: null,
    wakeOn: [],
    nextReconsiderAt: null,
    refs: { contractIds: [], targetIds: [], dependencyIds: [] },
    eventIds: [],
    updatedAt: null,
  };
  return diagnostics.actors[actorId];
}

// Upsert the current explanation for an actor. Only supplied fields change, so
// callers can report just the part they know about.
export function recordDiagnostic(state, actorId, patch = {}, at = Date.now()) {
  if (!actorId) return null;
  const record = ensureRecord(state, actorId);

  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === "refs") {
      record.refs = { ...record.refs, ...value };
      return;
    }
    if (key === "eventId") {
      record.eventIds.push(value);
      if (record.eventIds.length > MAX_EVENT_REFS) record.eventIds.shift();
      return;
    }
    record[key] = value;
  });

  record.updatedAt = at;
  ensureDiagnostics(state).updatedAt = at;
  return record;
}

// Record a choice along with what lost and why — the "what alternatives did it
// consider?" answer. Alternatives are bounded so this stays a compact snapshot.
export function recordDecision(state, actorId, { chosen = null, alternatives = [], reasons = [], at = Date.now() } = {}) {
  return recordDiagnostic(state, actorId, {
    lastDecision: {
      at,
      chosen,
      alternatives: alternatives.slice(0, MAX_ALTERNATIVES),
      reasons,
    },
  }, at);
}

export function createBlocker({
  kind,
  summary,
  subjectId = null,
  objectId = null,
  waitingFor = null,
  wakeOn = [],
  nextReconsiderAt = null,
  causedBy = [],
  detail = null,
  at = Date.now(),
} = {}) {
  return { kind, summary, subjectId, objectId, waitingFor, wakeOn, nextReconsiderAt, causedBy, detail, at };
}

// Convenience: set a blocker and the stalled state that goes with it.
export function recordBlocker(state, actorId, blocker, { state: actorState = DIAGNOSTIC_STATE.WAITING, at = Date.now() } = {}) {
  return recordDiagnostic(state, actorId, {
    state: actorState,
    blocker,
    summary: blocker?.summary ?? null,
    waitingFor: blocker?.waitingFor ?? null,
    wakeOn: blocker?.wakeOn ?? [],
    nextReconsiderAt: blocker?.nextReconsiderAt ?? null,
  }, at);
}

export function clearBlocker(state, actorId, { state: actorState = DIAGNOSTIC_STATE.FREE, summary = null, at = Date.now() } = {}) {
  return recordDiagnostic(state, actorId, {
    state: actorState,
    blocker: null,
    summary,
    waitingFor: null,
    nextReconsiderAt: null,
  }, at);
}

// Retiring an actor removes it from the current simulation without erasing its
// ledger history. Keep a small tombstone so saved games and historical links can
// still explain what the actor was, while current-actor projections can omit it.
export function retireDiagnostic(state, actorId, { summary = "Retired", at = Date.now() } = {}) {
  if (!actorId) return null;
  const record = recordDiagnostic(state, actorId, {
    state: DIAGNOSTIC_STATE.RETIRED,
    summary,
    blocker: null,
    intention: null,
    waitingFor: null,
    wakeOn: [],
    nextReconsiderAt: null,
    retiredAt: at,
  }, at);
  const retired = Object.values(ensureDiagnostics(state).actors)
    .filter((candidate) => candidate.state === DIAGNOSTIC_STATE.RETIRED)
    .sort((first, second) => (first.retiredAt ?? first.updatedAt ?? 0) - (second.retiredAt ?? second.updatedAt ?? 0));
  retired.slice(0, Math.max(0, retired.length - MAX_RETIRED_TOMBSTONES))
    .forEach((candidate) => { delete state.diagnostics.actors[candidate.actorId]; });
  return record;
}

export function getDiagnostic(state, actorId) {
  return state.diagnostics?.actors?.[actorId] ?? null;
}

export function listDiagnostics(state, { kind = null, states = null, search = null } = {}) {
  const records = Object.values(state.diagnostics?.actors ?? {});
  return records.filter((record) => {
    if (kind && record.actorKind !== kind) return false;
    if (states && !states.includes(record.state)) return false;
    if (search) {
      const needle = String(search).toLowerCase();
      const haystack = `${record.actorId} ${record.actorName} ${record.summary ?? ""} ${record.blocker?.kind ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

// Every actor or institution that is not making progress, for the observatory's
// consolidated blocker list.
export function listBlocked(state) {
  return Object.values(state.diagnostics?.actors ?? {})
    .filter((record) => record.blocker || STALLED_STATES.has(record.state))
    .sort((first, second) => (second.updatedAt ?? 0) - (first.updatedAt ?? 0));
}

export function isStalledState(actorState) {
  return STALLED_STATES.has(actorState);
}

// Walk `causedBy` into an expandable why-chain. A cause may be an inline
// blocker or a reference to another actor, whose own current blocker is then
// followed. Depth-capped and cycle-safe.
export function resolveBlockerChain(state, blocker, { depth = MAX_BLOCKER_DEPTH, visited = new Set() } = {}) {
  if (!blocker || depth <= 0) return [];

  const node = {
    kind: blocker.kind,
    summary: blocker.summary,
    subjectId: blocker.subjectId ?? null,
    objectId: blocker.objectId ?? null,
    waitingFor: blocker.waitingFor ?? null,
    wakeOn: blocker.wakeOn ?? [],
    nextReconsiderAt: blocker.nextReconsiderAt ?? null,
    detail: blocker.detail ?? null,
    causes: [],
  };

  (blocker.causedBy ?? []).forEach((cause) => {
    if (!cause) return;
    if (cause.actorId) {
      if (visited.has(cause.actorId)) {
        node.causes.push({ kind: "cycle", summary: `(already shown: ${cause.actorId})`, causes: [] });
        return;
      }
      visited.add(cause.actorId);
      const referenced = getDiagnostic(state, cause.actorId);
      if (!referenced) {
        node.causes.push({ kind: "unknown-actor", summary: cause.note ?? `No diagnostic for ${cause.actorId}`, subjectId: cause.actorId, causes: [] });
        return;
      }
      if (referenced.blocker) {
        node.causes.push(...resolveBlockerChain(state, referenced.blocker, { depth: depth - 1, visited }));
      } else {
        node.causes.push({
          kind: referenced.state,
          summary: cause.note ?? referenced.summary ?? `${referenced.actorName} is ${referenced.state}`,
          subjectId: referenced.actorId,
          causes: [],
        });
      }
      return;
    }
    // An inline blocker cause.
    node.causes.push(...resolveBlockerChain(state, cause, { depth: depth - 1, visited }));
  });

  return [node];
}

// Flatten a chain into indented lines — what the UI and tests read.
export function formatBlockerChain(chain, indent = 0) {
  return chain.flatMap((node) => [
    { indent, kind: node.kind, summary: node.summary, subjectId: node.subjectId, waitingFor: node.waitingFor },
    ...formatBlockerChain(node.causes ?? [], indent + 1),
  ]);
}
