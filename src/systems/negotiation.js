import { resolveInstitutionPolicy } from "./institutionDecision.js?v=fresh-20260814-0656-3b0bba2";
import { getActorTraits } from "./actorConfig.js?v=fresh-20260814-0656-3b0bba2";

// How an actor moves on price — as a buyer bidding up, and as a seller coming
// down.
//
// WHY THIS EXISTS: `hubProcurement` carried seven module constants that decided
// the whole negotiation for everybody. `REPRICE_INTERVAL_MS`,
// `REPRICE_MAX_MULTIPLE`, `RETRY_AFTER_REFUSAL_MS`, `CONCESSION_INTERVAL_MS`,
// `CONCESSION_STEP`, `CONCESSION_FIRM_STEP` and `SLACK_CAPACITY_FRACTION`
// applied to all six settlements, so a stubborn old yard and a hungry new
// crossing bid up at the same speed, to the same ceiling, and discounted by the
// same step at the same moment. Six carefully authored temperaments met seven
// `const`s and haggled identically.
//
// Haggling is the most legible thing a trading post does — the player watches
// prices move — so it is the place where a flat constant costs the most
// character.
//
// EACH TRAIT DOES ONE KIND OF JOB, as in `workQueue`:
//
//   urgencyBias   TEMPO — how soon it comes back to try again
//   growthBias    REACH — how far it will move on price to win business
//   caution       MARGIN — how fiercely it protects what it charges
//
// A trait at the neutral middle reproduces the constant it replaced exactly, so
// the conversion is a change in who differs, not a change in the baseline.

const NEUTRAL = 0.5;

export const NEGOTIATION_DEFAULTS = Object.freeze({
  // Buyer: how long before it revisits an unfilled offer, and how long it waits
  // after being turned down before asking that family again.
  repriceIntervalMs: 60 * 1000,
  retryAfterRefusalMs: 60 * 1000,
  // Buyer: the hard ceiling on what it will ever pay, as a multiple of its own
  // opening judgement.
  repriceMaxMultiple: 2,
  // Seller: how often it revisits its ask, how much it comes down when business
  // is thin, and how much it firms back up once business returns.
  concessionIntervalMs: 60 * 1000,
  concessionStep: 0.2,
  concessionFirmStep: 0.5,
  // Seller: how empty its order book has to be before it counts as quiet enough
  // to discount at all.
  slackCapacityFraction: 0.5,
});

// Tempo: a trait above the middle makes an actor come back sooner. Bounded to
// [0.5x, 1.5x] of the interval, so nobody thrashes and nobody stops trying.
const tempo = (trait) => 1.5 - clampTrait(trait);

// Step size: how big a move it makes when it does move. Same shape as
// `fleetCapacity` uses for its thresholds.
const step = (trait) => NEUTRAL + clampTrait(trait);

// Reach is deliberately GENTLER than the other two — [0.75x, 1.25x] rather than
// [0.5x, 1.5x]. This is a hard ceiling on what a buyer will EVER pay, so a
// half-strength one does not make a hub cautious, it makes it unable to trade
// at all: its ceiling collapses onto its opening price, every raise is refused
// as exhausted, and it quietly starves. Temperament should colour how a hub
// bargains, never decide whether it can participate.
const reach = (trait) => 0.75 + clampTrait(trait) * 0.5;

function clampTrait(trait) {
  return Math.min(1, Math.max(0, Number.isFinite(trait) ? trait : NEUTRAL));
}

export function resolveNegotiationPolicy(state, institutionId, overrides = {}) {
  const traits = getActorTraits(state, institutionId);
  const base = { ...NEGOTIATION_DEFAULTS, ...overrides };
  const urgencyBias = clampTrait(traits?.urgencyBias);
  const growthBias = clampTrait(traits?.growthBias);
  const caution = clampTrait(traits?.caution);

  return resolveInstitutionPolicy({
    institutionPolicy: {
      ...base,
      // TEMPO — an impatient hub is back within the minute; a placid one takes
      // its time on both sides of the table.
      repriceIntervalMs: Math.round(base.repriceIntervalMs * tempo(urgencyBias)),
      retryAfterRefusalMs: Math.round(base.retryAfterRefusalMs * tempo(urgencyBias)),
      concessionIntervalMs: Math.round(base.concessionIntervalMs * tempo(urgencyBias)),

      // REACH — a hub set on growing will chase a price well past its first
      // judgement to secure supply, and will cut deeper to win the business
      // when it is the one selling. One trait, both directions of the same
      // appetite.
      repriceMaxMultiple: base.repriceMaxMultiple * reach(growthBias),
      concessionStep: base.concessionStep * step(growthBias),

      // MARGIN — a careful seller restores its price the moment there is
      // business again, and wants the book clearly quiet before it discounts at
      // all. Both are the same instinct: do not work thin for longer than you
      // must.
      concessionFirmStep: base.concessionFirmStep * step(caution),
      slackCapacityFraction: base.slackCapacityFraction * tempo(caution),
    },
    controllerModifiers: { traits },
  });
}

// A one-line read of how this actor bargains, for diagnostics and for anyone
// trying to understand why two hubs behaved differently.
export function describeNegotiationStyle(policy) {
  const seconds = (ms) => Math.round(ms / 1000);
  return [
    `revisits an offer every ${seconds(policy.repriceIntervalMs)}s`,
    `will pay up to ${policy.repriceMaxMultiple.toFixed(2)}x its opening price`,
    `cuts ${Math.round(policy.concessionStep * 100)}% a step when quiet`,
    `firms back ${Math.round(policy.concessionFirmStep * 100)}% a step when busy`,
  ].join("; ");
}
