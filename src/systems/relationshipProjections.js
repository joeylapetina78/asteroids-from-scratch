// Relationship projections.
//
// A compact, directional summary of how one actor regards another, updated
// from meaningful events rather than by rescanning the ledger. Deliberately
// MULTI-DIMENSIONAL — never a single positive/negative score — because
// relationships must eventually govern more than price.
//
// Dimensions are independent on purpose: you can be highly reliable but
// resented, or liked but untrusted with credit.
//
//   trust       — willingness to be exposed to this actor (credit, advances)
//   reliability — track record of doing what they said (delivery, deadlines)
//   gratitude   — owed goodwill from favors received
//   resentment  — grievance from harm, defaults, or broken deals
//   familiarity — how well known they are at all
//
// ACCESS EXTENSION POINT (not implemented this slice):
// `access` is where relationships stop shading prices and start gating what a
// planner can even see or reach — which actors will deal with you, which
// private opportunities and services are offered, what credit is extended, and
// who will introduce you to whom. Populating and enforcing this is future work;
// the schema exists now so the projection is not retrofitted later.

export const RELATIONSHIP_DIMENSIONS = Object.freeze(["trust", "reliability", "gratitude", "resentment", "familiarity"]);

const MAX_SIGNIFICANT_EVENTS = 12;

export function ensureRelationshipProjections(state) {
  state.relationships ??= { projections: {} };
  state.relationships.projections ??= {};
  return state.relationships;
}

function projectionKey(fromId, toId) {
  return `${fromId}=>${toId}`;
}

export function ensureRelationshipProjection(state, { fromId, toId }) {
  const store = ensureRelationshipProjections(state);
  const key = projectionKey(fromId, toId);
  store.projections[key] ??= {
    id: key,
    fromId,
    toId,
    trust: 0,
    reliability: 0,
    gratitude: 0,
    resentment: 0,
    familiarity: 0,
    dealCount: 0,
    completedDeals: 0,
    failedDeals: 0,
    lastOutcome: null,
    lastInteractionAt: null,
    // Extension point — see header. Shape declared, not yet enforced.
    access: {
      tier: "public",              // public | known | preferred | inner
      creditLimit: 0,
      privateOpportunities: [],    // opportunity ids only this relationship reveals
      introductions: [],           // actor ids this actor would vouch for you with
      deniedServices: [],
    },
    significantEventIds: [],
  };
  return store.projections[key];
}

export function getRelationshipProjection(state, { fromId, toId }) {
  return state.relationships?.projections?.[projectionKey(fromId, toId)] ?? null;
}

// Apply signed deltas to any dimensions, clamped to [0,1]. Callers pass only
// the dimensions an event actually speaks to.
export function updateRelationshipProjection(state, {
  fromId,
  toId,
  deltas = {},
  outcome = null,
  eventId = null,
  significant = false,
  at = Date.now(),
}) {
  if (!fromId || !toId) return null;
  const projection = ensureRelationshipProjection(state, { fromId, toId });

  RELATIONSHIP_DIMENSIONS.forEach((dimension) => {
    if (deltas[dimension] === undefined) return;
    projection[dimension] = clamp01((projection[dimension] ?? 0) + deltas[dimension]);
  });

  if (outcome) {
    projection.lastOutcome = outcome;
    projection.dealCount += 1;
    if (outcome === "completed") projection.completedDeals += 1;
    if (outcome === "failed" || outcome === "expired") projection.failedDeals += 1;
  }
  projection.lastInteractionAt = at;

  // Keep a bounded set of back-references so an explanation can cite real
  // events without the projection growing without limit.
  if (eventId && significant) {
    projection.significantEventIds.push(eventId);
    if (projection.significantEventIds.length > MAX_SIGNIFICANT_EVENTS) projection.significantEventIds.shift();
  }

  return projection;
}

// Convenience: a supplier delivered against a contract as promised.
export function recordDeliveryOutcome(state, { fromId, toId, onTime = true, complete = true, eventId = null, at = Date.now() }) {
  return updateRelationshipProjection(state, {
    fromId,
    toId,
    deltas: {
      reliability: complete && onTime ? 0.08 : complete ? 0.03 : -0.06,
      trust: complete ? 0.05 : -0.04,
      familiarity: 0.06,
      resentment: complete ? 0 : 0.04,
    },
    outcome: complete ? "completed" : "failed",
    eventId,
    significant: !complete,
    at,
  });
}

// A rough single-number read for callers that only need a scalar (e.g. a
// pricing nudge). The underlying dimensions remain the real model.
export function getGoodwill(projection) {
  if (!projection) return 0;
  return clamp01(
    (projection.trust ?? 0) * 0.4 +
    (projection.reliability ?? 0) * 0.4 +
    (projection.gratitude ?? 0) * 0.2,
  ) - clamp01(projection.resentment ?? 0);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
