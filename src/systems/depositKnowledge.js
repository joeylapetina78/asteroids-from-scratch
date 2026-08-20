import { resolveInstitutionPolicy } from "./institutionDecision.js?v=fresh-20260820-1818-9a1a051";
import { getActorTraits } from "./actorConfig.js?v=fresh-20260820-1818-9a1a051";

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

// ── Filing the map by resource ──────────────────────────────────────────────
//
// WHY THIS EXISTS: a company's map is one flat record per deposit, and picking
// somewhere to send a worker meant walking ALL of it and throwing most of it
// away. Cinder Contracting knows 7,751 deposits and 567 iron-nickel ones, so
// ~93% of every scan was discarded — 2.0ms a ranking, several rankings in the
// tick that assigns workers, and it grows with the world.
//
// So the map gets filed by resource. `knowledge` stays exactly what it was —
// the authoritative flat `{id: record}` map, saved and mutated in place — and
// the filing is DERIVED: buckets of live references to those same records, so
// a deposit's confidence rising is visible through both without a write here.
//
// WHY NOT A "COUNT THE KEYS" SIGNATURE, the way `actorRegistry` checks whether
// its index went stale: at this size counting is not cheap. `Object.keys()` on
// 7,751 entries measures 0.64ms against a 1.86ms scan — a third of the cost we
// are here to remove, paid on every call forever. That signature is right for
// `actorRegistry`, whose tables hold tens of records, and wrong for this one.
//
// WHAT KEEPS IT HONEST INSTEAD: this module owns every write. A deposit enters
// a map through `rememberSurveyedDeposit` or `recordDepositObservation` and
// through nothing else, and both file it as they store it, so the index cannot
// drift from the map it describes. That is an invariant rather than a habit —
// `deposit knowledge is only ever added through this module` in the tests is
// what holds the door shut. Anything that must write directly anyway has to
// call `invalidateDepositIndex` and say so.
//
// The index hangs off the map under a GLOBAL symbol, not in a module-level
// WeakMap, for the reason `extractionOffers` documents: a bare and a
// `?v=`-suffixed specifier are DIFFERENT modules, so module-level state forks
// silently between the game and the tests. Two copies of this module reaching
// the same map must reach the same index — `Symbol.for` is what guarantees it.
// It is non-enumerable, so `Object.keys`/`Object.values`, spread and
// `JSON.stringify` cannot see it and no save file ever carries it.

const DEPOSIT_INDEX = Symbol.for("asteroids.depositKnowledge.byResource");

function bucketFor(index, resourceId) {
  let bucket = index.get(resourceId);
  if (!bucket) index.set(resourceId, bucket = []);
  return bucket;
}

function depositIndex(knowledge) {
  const existing = knowledge[DEPOSIT_INDEX];
  if (existing) return existing;

  const index = new Map();
  Object.values(knowledge).forEach((deposit) => {
    if (deposit?.resourceId) bucketFor(index, deposit.resourceId).push(deposit);
  });
  // A frozen or sealed map is nobody's normal case, but it must not throw —
  // it simply pays for the filing again next time.
  if (Object.isExtensible(knowledge)) {
    Object.defineProperty(knowledge, DEPOSIT_INDEX, { value: index, writable: true, configurable: true, enumerable: false });
  }
  return index;
}

// File a deposit that has just been stored. A map nobody has ranked against
// yet has no index; it will be built from the map when somebody asks.
function fileDeposit(knowledge, deposit) {
  const index = knowledge[DEPOSIT_INDEX];
  if (index) bucketFor(index, deposit.resourceId).push(deposit);
}

// Throw the filing away. Only needed if something writes into a map without
// going through this module — see above for why that is a thing to avoid
// rather than a thing to do carefully.
export function invalidateDepositIndex(knowledge) {
  if (knowledge) delete knowledge[DEPOSIT_INDEX];
}

// Chart a deposit somebody else surveyed, if this company has not got it
// already. The one door into a map for secondhand knowledge.
export function rememberSurveyedDeposit(knowledge, deposit) {
  const existing = knowledge[deposit.id];
  if (existing) return existing;
  knowledge[deposit.id] = deposit;
  fileDeposit(knowledge, deposit);
  return deposit;
}

// A crew worked this rock and it paid. Knowledge earned, not granted.
export function recordDepositObservation(knowledge, { x, y, resourceId, policy, at = null }) {
  const id = depositId({ x, y, resourceId });
  let deposit = knowledge[id];
  if (!deposit) {
    deposit = createObservedDeposit({ x, y, resourceId, policy, at });
    knowledge[id] = deposit;
    fileDeposit(knowledge, deposit);
  }
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
  if (!knowledge) return [];
  const bucket = depositIndex(knowledge).get(resourceId);
  if (!bucket?.length) return [];

  return bucket
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
