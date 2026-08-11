import { resolveInstitutionPolicy } from "./institutionDecision.js?v=fresh-20260810-2036-26fcabd";
import { getActorTraits } from "./actorConfig.js?v=fresh-20260810-2036-26fcabd";

// What a mining outfit knows about where the ore is, and how much it trusts it.
//
// WHY THIS EXISTS: `miningOperation` seeded deposit knowledge by surveying
// EVERY site in the world at a fixed 12,000-unit radius and stamping every
// result with `confidence: 0.65`. Every company therefore knew exactly the same
// deposits to exactly the same degree — Flint Prospecting and Cinder Contracting
// held identical maps — and ranked them with the same six magic constants.
// Private information is one of the strongest sources of difference between
// rivals, and there was none of it.
//
// So knowledge becomes a function of who is doing the knowing:
//
//   REACH        how far out a company bothers to survey. A grower ranges wide
//                for prospects; a careful operator works a smaller patch.
//   TRUST        how much a REGIONAL survey is taken at face value. A cautious
//                operator discounts somebody else's paperwork.
//   EXPERIENCE   how much a deposit that has already paid out counts for.
//                Caution leans on the proven thing.
//
// The result is two legible strategies out of traits that were already authored:
// Cinder ranges wide and believes the survey; Flint works a smaller area it has
// seen with its own eyes. Neither has a line of code written for it.
//
// FIRSTHAND BEATS SECONDHAND, for everybody. A crew that has actually stood on a
// rock is worth more than a chart, so an observation always outranks a survey.
// That is a fact about information, not a temperament, so it is not up for
// negotiation by traits.

const NEUTRAL = 0.5;

export const DEPOSIT_KNOWLEDGE_DEFAULTS = Object.freeze({
  surveyRadius: 12000,
  // What a regional chart is worth before anybody has checked it.
  surveyConfidence: 0.65,
  // What a crew reporting from the spot is worth.
  observationConfidence: 0.85,
  // What each further successful trip adds.
  confidenceGain: 0.05,
  // How much proven success counts against raw proximity in the ranking.
  experienceWeight: 0.15,
  // Below this range, closer stops mattering — otherwise a deposit underfoot
  // scores near-infinitely and nothing else is ever considered.
  distanceFloor: 500,
  // How many candidates a worker is sent out with.
  candidateCount: 12,
});

export function resolveProspectingPolicy(state, institutionId, overrides = {}) {
  const traits = getActorTraits(state, institutionId);
  const caution = Number.isFinite(traits?.caution) ? traits.caution : NEUTRAL;
  const growthBias = Number.isFinite(traits?.growthBias) ? traits.growthBias : NEUTRAL;
  const base = { ...DEPOSIT_KNOWLEDGE_DEFAULTS, ...overrides };

  return resolveInstitutionPolicy({
    institutionPolicy: {
      ...base,
      surveyRadius: base.surveyRadius * (NEUTRAL + growthBias),
      // Clamped below observation confidence: however trusting an operator is,
      // a chart never beats having been there.
      surveyConfidence: clamp(
        base.surveyConfidence * (1 + (NEUTRAL - caution)),
        0.05,
        base.observationConfidence,
      ),
      experienceWeight: base.experienceWeight * (NEUTRAL + caution),
    },
    controllerModifiers: { traits },
  });
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

export function depositId({ x, y, resourceId }) {
  return `deposit:${Math.round(x)}:${Math.round(y)}:${resourceId}`;
}

// A charted deposit somebody else found.
export function createSurveyedDeposit({ x, y, resourceId, policy, at = null }) {
  return {
    id: depositId({ x, y, resourceId }),
    resourceId,
    x,
    y,
    source: "regional-survey",
    confidence: policy.surveyConfidence,
    successfulSelections: 0,
    lastObservedAt: at,
  };
}

// A deposit one of this company's own crews has worked.
export function createObservedDeposit({ x, y, resourceId, policy, at = null }) {
  return {
    id: depositId({ x, y, resourceId }),
    resourceId,
    x,
    y,
    source: "worker-observation",
    confidence: policy.observationConfidence,
    successfulSelections: 0,
    lastObservedAt: at,
  };
}

// A crew worked this rock and it paid. Knowledge earned, not granted.
export function recordDepositObservation(knowledge, { x, y, resourceId, policy, at = null }) {
  const id = depositId({ x, y, resourceId });
  const deposit = knowledge[id] ??= createObservedDeposit({ x, y, resourceId, policy, at });
  deposit.confidence = Math.min(1, deposit.confidence + policy.confidenceGain);
  deposit.successfulSelections += 1;
  deposit.lastObservedAt = at;
  return deposit;
}

// What this company would send a worker to, best first.
//
// Confidence and proven success pull one way, distance the other. The weights
// are the operator's, so two companies looking at the identical map still go to
// different rocks.
export function rankDepositCandidates({ knowledge, resourceId, position, policy }) {
  return Object.values(knowledge ?? {})
    .filter((deposit) => deposit.resourceId === resourceId)
    .map((deposit) => ({ deposit, score: scoreDeposit(deposit, position, policy) }))
    .sort((first, second) => second.score - first.score || first.deposit.id.localeCompare(second.deposit.id))
    .slice(0, policy.candidateCount)
    .map(({ deposit }) => ({ id: deposit.id, x: deposit.x, y: deposit.y }));
}

export function scoreDeposit(deposit, position, policy) {
  const worth = (deposit.confidence ?? 0) + (deposit.successfulSelections ?? 0) * policy.experienceWeight;
  const range = Math.max(policy.distanceFloor, Math.hypot(deposit.x - position.x, deposit.y - position.y));
  return worth / range;
}
