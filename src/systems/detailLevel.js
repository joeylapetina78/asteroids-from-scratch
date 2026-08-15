import { findActorRecord } from "./actorConfig.js?v=fresh-20260815-0001-50065bb";
import { getWorldSites } from "./worldSites.js?v=fresh-20260815-0001-50065bb";

// How closely the world is simulated, place by place.
//
// STEP 4, PHASE A. The universe is meant to grow, and every system that walks
// its actors costs more as it does. A settlement six jumps away does not need
// its purchasing reconsidered every second — nobody is watching it, and nothing
// it decides this second rather than in eight is observable.
//
// This phase is CADENCE ONLY. Nothing is aggregated, approximated or thrown
// away; a distant actor runs exactly the same code, just less often. That makes
// it reversible — set every actor to NEAR and the world behaves precisely as it
// did — and it is what the later phases stand on.
//
// NO FOCUS MEANS NO CHANGE. With `state.simulationFocus` unset, every actor
// resolves NEAR and every gate answers true, so introducing this module cannot
// alter a world that has not opted in. The current six-settlement world is
// small enough that everything is near anyway; the point is that the mechanism
// exists and is measured before it is needed, not after.

export const DETAIL = Object.freeze({
  NEAR: "near",   // under the player's nose: every tick, always
  MID: "mid",     // over the horizon but reachable
  FAR: "far",     // somewhere else entirely
});

export const DETAIL_DEFAULTS = Object.freeze({
  // Distances measured from the nearest focus point to the actor's site.
  nearRadius: 6000,
  midRadius: 20000,
  // How often a place at each level acts. NEAR is not listed because it is not
  // negotiable: anything the player can see runs every tick.
  midEveryTicks: 3,
  farEveryTicks: 8,
});

// Where the simulation is being watched from. A list rather than a single point
// because the player is not the only thing that can make a place matter — a
// player-owned ship parked somewhere, or a mission's subject, deserve the same
// attention, and adding one later should not need this shape to change.
export function setSimulationFocus(state, points = [], at = Date.now()) {
  state.simulationFocus = {
    points: points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      .map((point) => ({ x: point.x, y: point.y })),
    at,
  };
  return state.simulationFocus;
}

export function getSimulationFocus(state) {
  return state?.simulationFocus?.points ?? [];
}

export function clearSimulationFocus(state) {
  delete state.simulationFocus;
}

// Where an actor physically is, via the site it belongs to.
//
// An actor with no site — a carrier institution, a person — returns null and is
// treated as NEAR. That is deliberate: something whose position is unknown must
// not be quietly downgraded, because "I could not place it" is not evidence
// that nobody is looking at it.
export function getActorPosition(state, actorId, sites = getWorldSites()) {
  const record = findActorRecord(state, actorId);
  if (!record) return null;
  if (Number.isFinite(record.position?.x) && Number.isFinite(record.position?.y)) {
    return { x: record.position.x, y: record.position.y };
  }
  const siteId = record.siteId ?? record.currentSiteId ?? null;
  if (!siteId) return null;
  const site = sites.find((candidate) => candidate.id === siteId);
  return site?.position ? { x: site.position.x, y: site.position.y } : null;
}

export function resolveDetailLevel(state, actorId, { policy = DETAIL_DEFAULTS, sites = getWorldSites() } = {}) {
  const focus = getSimulationFocus(state);
  if (focus.length === 0) return DETAIL.NEAR;

  const position = getActorPosition(state, actorId, sites);
  if (!position) return DETAIL.NEAR;

  const nearest = focus.reduce((best, point) => {
    const distance = Math.hypot(position.x - point.x, position.y - point.y);
    return distance < best ? distance : best;
  }, Number.POSITIVE_INFINITY);

  if (nearest <= policy.nearRadius) return DETAIL.NEAR;
  if (nearest <= policy.midRadius) return DETAIL.MID;
  return DETAIL.FAR;
}

export function detailCadence(level, policy = DETAIL_DEFAULTS) {
  if (level === DETAIL.MID) return Math.max(1, Math.floor(policy.midEveryTicks));
  if (level === DETAIL.FAR) return Math.max(1, Math.floor(policy.farEveryTicks));
  return 1;
}

// Spread, not bunched.
//
// The obvious gate is `tick % everyTicks === 0`, and it is wrong: every distant
// actor in the world would then act on the SAME tick. One second in eight would
// carry the entire far field and the other seven would carry none, so the tick
// that was meant to get cheaper occasionally gets far more expensive. Offsetting
// each actor by a hash of its id spreads the same total work evenly, which is
// the difference between a lower cost and a worse spike.
function actorPhase(actorId, everyTicks) {
  let hash = 2166136261;
  const key = String(actorId ?? "");
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % everyTicks;
}

// Should this actor act on this tick? NEAR always answers true.
export function shouldActThisTick(state, actorId, { tick = 0, policy = DETAIL_DEFAULTS, sites = getWorldSites(), level = null } = {}) {
  const resolved = level ?? resolveDetailLevel(state, actorId, { policy, sites });
  const everyTicks = detailCadence(resolved, policy);
  if (everyTicks <= 1) return true;
  return (tick + actorPhase(actorId, everyTicks)) % everyTicks === 0;
}

// What the world currently looks like, for diagnostics and for measuring what a
// detail policy actually buys before trusting it.
export function summarizeDetail(state, actorIds, { policy = DETAIL_DEFAULTS, sites = getWorldSites() } = {}) {
  const counts = { [DETAIL.NEAR]: 0, [DETAIL.MID]: 0, [DETAIL.FAR]: 0 };
  actorIds.forEach((actorId) => { counts[resolveDetailLevel(state, actorId, { policy, sites })] += 1; });
  // Expected share of full-detail work, if every actor were equally expensive.
  const total = actorIds.length || 1;
  const workShare = (counts[DETAIL.NEAR]
    + counts[DETAIL.MID] / detailCadence(DETAIL.MID, policy)
    + counts[DETAIL.FAR] / detailCadence(DETAIL.FAR, policy)) / total;
  return { counts, total: actorIds.length, workShare };
}
