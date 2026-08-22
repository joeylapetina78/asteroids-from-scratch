import { DETAIL, DETAIL_DEFAULTS, detailCadence, resolveDetailLevel, getRuntimeSimulationSites } from "./detailLevel.js?v=fresh-20260822-1304-slipway";
import { DISTANT_DEFAULTS } from "./distantSimulation.js?v=fresh-20260822-1304-slipway";
import { listHubIds } from "./hubActors.js?v=fresh-20260822-1304-slipway";
import { describeObservation, estimateFlowDrift } from "./regionFlow.js?v=fresh-20260822-1304-slipway";
import { getEconomySamples } from "./economySampler.js?v=fresh-20260822-1304-slipway";
import { ensureDistantSimulationState } from "./simulationMode.js?v=fresh-20260822-1304-slipway";

// What the level-of-detail boundary is currently doing, as a read model.
//
// Until now the only way to answer "why is that hub still detailed?" was to open
// a console and read `distantSimulation.getState()`, which meant the answer was
// available to whoever already knew the shape of the state and to nobody else.
// A simulation boundary that silently refuses to engage is exactly the kind of
// thing that has to be VISIBLE, because its failure mode is not a crash — it is
// a world that quietly keeps paying full price for places nobody is watching.
//
// This module reads; it never advances a flow, mutates a record or forces a
// transition. Rendering must not be able to change what it is describing.

// Why a hub is in the mode it is in. These are the only answers, and each one
// names a different fix: a blocked hub needs its work to finish or to be
// checkpointed, an observing hub needs time, an unknown-supply hub needs to
// have been watched for longer.
export const SIMULATION_REASON = Object.freeze({
  AGGREGATED: "aggregated",
  NEARBY: "in-detail-range",
  OBSERVING: "waiting-for-far-window",
  BLOCKED: "blocked-by-open-work",
  SUPPLY_UNKNOWN: "supply-rate-unknown",
});

// How a blocker reads to somebody who is not holding the source open.
const BLOCKER_LABELS = Object.freeze({
  "open-orders": "open procurement orders",
  "active-shipments": "shipments in flight",
  "active-extraction": "extraction allocations working",
  "population-production": "population production runs",
  "active-protection": "protection requests open",
  "industrial-work": "factory or construction work",
  "supply-rate-unknown": "supply rate never observed",
  "hub-missing": "no hub record",
});

export function describeBlocker(blocker) {
  const [kind, rawCount] = String(blocker ?? "").split(":");
  const count = Number(rawCount);
  return {
    kind,
    count: Number.isFinite(count) ? count : null,
    label: BLOCKER_LABELS[kind] ?? kind,
  };
}

// One hub's simulation state, with the reason it is in it and — for an
// aggregate — how far its model can be trusted.
export function describeHubSimulation(state, hubId, { at = Date.now(), policy = DISTANT_DEFAULTS, detailPolicy = DETAIL_DEFAULTS, sites = null, samples = null } = {}) {
  const simulation = ensureDistantSimulationState(state);
  const record = simulation.hubs[hubId] ?? null;
  const institution = state.logistics?.institutions?.[hubId] ?? null;
  const detail = record?.detail ?? resolveDetailLevel(state, hubId, { policy: detailPolicy, sites });
  const mode = record?.mode ?? "detailed";
  const farForSeconds = record?.farSince ? Math.max(0, (at - record.farSince) / 1000) : null;
  const transitions = simulation.transitions.filter((entry) => entry.institutionId === hubId);
  const lastTransition = transitions[transitions.length - 1] ?? null;

  const row = {
    institutionId: hubId,
    name: institution?.name ?? hubId,
    siteId: record?.siteId ?? institution?.siteId ?? null,
    detail,
    mode,
    cadenceEveryTicks: detailCadence(detail, detailPolicy),
    farForSeconds,
    blockers: (record?.blockers ?? []).map(describeBlocker),
    // The number that separates a busy hub from a stuck one. Continuous, so it
    // resets the moment a hub goes quiet for even one tick.
    blockedForSeconds: record?.blockedSince ? Math.max(0, (at - record.blockedSince) / 1000) : null,
    // A hub that is far but not yet eligible is not blocked — it is being given
    // the policy window to settle. Reporting that as a blocker would send a
    // reader looking for work that does not exist.
    eligibleInSeconds: null,
    observedSeconds: record?.flow?.observedSeconds ?? null,
    // The second gate, and the one that is invisible until it bites: a hub can
    // be perfectly quiet and still refuse to aggregate because nobody has
    // watched it for a full cycle of its own slowest need yet. A small
    // settlement waits proportionally longer, so this is minutes, not seconds.
    observation: describeObservation(samples ?? getEconomySamples(state, { windowMs: Infinity, now: at }), hubId, state),
    aggregateForSeconds: null,
    observationAgeSeconds: null,
    drift: null,
    transitionCount: record?.transitionCount ?? 0,
    lastTransition: lastTransition
      ? { type: lastTransition.type, at: lastTransition.at, agoSeconds: Math.max(0, (at - lastTransition.at) / 1000), detail: lastTransition.detail ?? null }
      : null,
    reason: SIMULATION_REASON.NEARBY,
  };

  if (mode === "aggregate") {
    row.reason = SIMULATION_REASON.AGGREGATED;
    row.aggregateForSeconds = Math.max(0, (at - (record.aggregatedAt ?? at)) / 1000);
    // The supply rate stopped being re-measured the moment the flow took
    // custody, so the age of the observation IS the age of the aggregate.
    row.observationAgeSeconds = row.aggregateForSeconds;
    row.drift = estimateFlowDrift(record.flow, row.observationAgeSeconds);
    return row;
  }

  if (detail !== DETAIL.FAR) return row;

  const blockerKinds = new Set(row.blockers.map((blocker) => blocker.kind));
  if (blockerKinds.has("supply-rate-unknown")) {
    row.reason = SIMULATION_REASON.SUPPLY_UNKNOWN;
    return row;
  }
  if (row.blockers.length > 0) {
    row.reason = SIMULATION_REASON.BLOCKED;
    return row;
  }
  const waited = farForSeconds ?? 0;
  const window = (policy.aggregateAfterMs ?? DISTANT_DEFAULTS.aggregateAfterMs) / 1000;
  if (waited < window) {
    row.reason = SIMULATION_REASON.OBSERVING;
    row.eligibleInSeconds = Math.max(0, window - waited);
    return row;
  }
  // Far, past the window, nothing open, and still detailed: the eligibility
  // check has not run yet this tick. Say so rather than inventing a cause.
  row.reason = SIMULATION_REASON.OBSERVING;
  row.eligibleInSeconds = 0;
  return row;
}

// The whole boundary at once: every hub, plus what the current split is costing.
export function summarizeSimulationDetail(state, { at = Date.now(), policy = DISTANT_DEFAULTS, detailPolicy = DETAIL_DEFAULTS } = {}) {
  const sites = getRuntimeSimulationSites(state);
  // One pass over the sampler for all nine hubs; this read runs on the
  // diagnostics cadence and must not cost more than what it describes.
  const samples = getEconomySamples(state, { windowMs: Infinity, now: at });
  const rows = listHubIds(state)
    .map((hubId) => describeHubSimulation(state, hubId, { at, policy, detailPolicy, sites, samples }));

  const detailCounts = { [DETAIL.NEAR]: 0, [DETAIL.MID]: 0, [DETAIL.FAR]: 0 };
  const modeCounts = { detailed: 0, aggregate: 0 };
  const reasonCounts = {};
  const blockerCounts = {};
  rows.forEach((row) => {
    detailCounts[row.detail] = (detailCounts[row.detail] ?? 0) + 1;
    modeCounts[row.mode] = (modeCounts[row.mode] ?? 0) + 1;
    reasonCounts[row.reason] = (reasonCounts[row.reason] ?? 0) + 1;
    row.blockers.forEach((blocker) => { blockerCounts[blocker.kind] = (blockerCounts[blocker.kind] ?? 0) + 1; });
  });

  // Share of full-detail transactional work still being paid for. A hub that
  // aggregated costs nothing here; a distant one that refuses to still costs
  // its cadence share. This is the number the whole phase exists to lower, so
  // it should be readable without arithmetic.
  const total = rows.length || 1;
  const workShare = rows.reduce((sum, row) => sum + (row.mode === "aggregate" ? 0 : 1 / row.cadenceEveryTicks), 0) / total;

  // Only rows with a real ratio can be ranked. An aggregate whose flow carries
  // no observation window has a null staleness, and putting "null× window" in
  // the summary would be worse than saying nothing.
  const stalest = rows
    .filter((row) => Number.isFinite(row.drift?.staleness))
    .sort((first, second) => second.drift.staleness - first.drift.staleness)[0] ?? null;

  return {
    at,
    rows,
    detailCounts,
    modeCounts,
    reasonCounts,
    blockerCounts,
    workShare,
    stalest,
    transitions: listSimulationTransitions(state, { at }),
  };
}

export function listSimulationTransitions(state, { at = Date.now(), limit = 20 } = {}) {
  const simulation = ensureDistantSimulationState(state);
  return simulation.transitions.slice(-limit).reverse().map((entry) => ({
    ...entry,
    agoSeconds: Math.max(0, (at - entry.at) / 1000),
  }));
}
