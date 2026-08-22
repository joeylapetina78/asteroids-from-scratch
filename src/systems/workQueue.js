import { resolveInstitutionPolicy } from "./institutionDecision.js?v=fresh-20260821-2304-60f29300";
import { getActorTraits } from "./actorConfig.js?v=fresh-20260821-2304-60f29300";

// How a provider orders the work it has already agreed to do.
//
// WHY THIS EXISTS: Sal is authored with `urgencyBias: 0.8` — the most
// urgency-driven person in the game — and ran a two-tier FIFO queue:
//
//     priority = issueType.includes("failure") ? 80 : 60
//     sort by priority desc, then createdAt asc
//
// Nothing about how long a job had sat, what it paid, or who it was for
// entered into it, so `urgencyBias` was inert in the one place it most
// obviously belonged, and SPRC's relationship projections — which Sal already
// consults when PRICING a repair — had no bearing on what he actually did next.
//
// A queue is where a service business's character is most visible: everybody
// can see who got seen first. So the order becomes a preference function over
// four legible factors, weighted by whoever runs the shop.
//
// SEVERITY IS NOT A TEMPERAMENT, AND IT IS NOT A NUMBER TO BE TRADED AGAINST.
// A failed machine really is worse than one due for calibration — the same
// split as `depositKnowledge`, where firsthand beat secondhand for everyone.
//
// So severity is a HARD TIER, sorted before anything else, and temperament only
// ever orders work WITHIN a tier. The first version of this module made it one
// term in a weighted sum and tried to keep the secondary weights small enough
// that they could never outweigh it. That is a arithmetic promise sitting on
// top of tuneable constants — it was already wrong when written (the weights
// summed to twice the gap they were supposed to fit under), and any later
// tuning would have broken it silently. A shop that leaves a failed machine
// stranded to serve a friend is not characterful, it is broken, and that
// guarantee should be structural rather than a sum that happens to work out.

const NEUTRAL = 0.5;

export const WORK_QUEUE_DEFAULTS = Object.freeze({
  // What counts as having waited a long time.
  waitingReferenceSeconds: 120,
  // What counts as a big job.
  revenueReference: 3000,
  // Ceilings for each preference factor at maximum trait. These are free to be
  // as expressive as they like: they only ever order work within one severity
  // tier, so no value here can strand a broken machine.
  waitingScale: 20,
  revenueScale: 12,
  goodwillScale: 8,
});

// Only a trait ABOVE the neutral middle buys an opinion. At neutral every
// preference weight is zero, so every job scores the same and the ordering
// falls through to severity then arrival — exactly the sort this replaced.
function aboveNeutral(trait) {
  return Math.max(0, (Number.isFinite(trait) ? trait : NEUTRAL) - NEUTRAL) / NEUTRAL;
}

// Each trait does exactly one job here:
//   urgencyBias  responsiveness to how long something has sat
//   growthBias   appetite for the job that pays best
//   caution      preference for the customer already known and trusted
export function resolveWorkQueuePolicy(state, institutionId, overrides = {}) {
  const traits = getActorTraits(state, institutionId);
  const base = { ...WORK_QUEUE_DEFAULTS, ...overrides };

  return resolveInstitutionPolicy({
    institutionPolicy: {
      ...base,
      waitingWeight: aboveNeutral(traits?.urgencyBias) * base.waitingScale,
      revenueWeight: aboveNeutral(traits?.growthBias) * base.revenueScale,
      goodwillWeight: aboveNeutral(traits?.caution) * base.goodwillScale,
    },
    controllerModifiers: { traits },
  });
}

// A `WorkItem` is `{ id, severity, createdAt, revenue, goodwill }`. Nothing here
// knows what the work is — a repair berth, a production line and a tow queue are
// all the same shape.
//
// This is the PREFERENCE score only. It deliberately excludes severity, which
// orders the queue above it and cannot be outweighed. At neutral traits every
// weight is zero and this returns 0 for everything, leaving severity and
// arrival time to decide — exactly the sort this replaced.
export function scoreWorkItem(item, { policy, now }) {
  const waited = Math.max(0, now - (item.createdAt ?? now)) / 1000;
  const waitingFactor = Math.min(1, waited / policy.waitingReferenceSeconds);
  const revenueFactor = Math.min(1, Math.max(0, item.revenue ?? 0) / policy.revenueReference);
  // Goodwill runs negative for a customer who has been let down, so resentment
  // pushes a job back rather than merely failing to pull it forward.
  const goodwill = Math.max(-1, Math.min(1, item.goodwill ?? 0));

  return waitingFactor * policy.waitingWeight
    + revenueFactor * policy.revenueWeight
    + goodwill * policy.goodwillWeight;
}

// The queue, best first: severity tier, then temperament, then arrival.
//
// Ties break oldest-first, so a provider with no opinion at all is still
// first-come-first-served rather than arbitrary.
export function orderWorkQueue(items, { policy, now }) {
  return [...items]
    .map((item) => ({ item, score: scoreWorkItem(item, { policy, now }) }))
    .sort((first, second) => (second.item.severity ?? 0) - (first.item.severity ?? 0)
      || second.score - first.score
      || (first.item.createdAt ?? 0) - (second.item.createdAt ?? 0)
      || String(first.item.id).localeCompare(String(second.item.id)))
    .map(({ item }) => item);
}

// Why this job and not the others — the numbers behind the choice, so a reader
// can see a queue position rather than infer it.
export function explainWorkQueue(items, { policy, now }) {
  return orderWorkQueue(items, { policy, now }).map((item, index) => ({
    id: item.id,
    position: index + 1,
    score: Math.round(scoreWorkItem(item, { policy, now }) * 100) / 100,
    severity: item.severity ?? 0,
    waitedSeconds: Math.round(Math.max(0, now - (item.createdAt ?? now)) / 1000),
    revenue: item.revenue ?? 0,
    goodwill: Math.round((item.goodwill ?? 0) * 100) / 100,
  }));
}
