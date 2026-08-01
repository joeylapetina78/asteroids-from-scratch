// Shared valuation framework.
//
// This is a FRAMEWORK, not one equation. Every evaluator returns the same
// `ValuationResult` shape and draws on the same common influences —
// institution policy, decision-maker traits, relationships, and current
// circumstances — but each action type feeds in its own domain inputs:
//
//   procurement : urgency, scarcity, on-hand/reserved/incoming, cash, batch
//   mining/freight: payment, distance, time, risk, wear, opportunity cost
//   service     : materials (live cost basis), labor, facility, margin
//
// Policy (what the institution is for, and its financial constraints) is kept
// separate from traits (how this particular decision-maker behaves within
// them) — the existing `resolveInstitutionPolicy` / `scoreResponse` split.
//
// Performance: evaluators are pure functions. Call them on events or on an
// institution's planning tick, never per frame; cache the result and
// re-evaluate when a material input changes.

export const VALUATION_DECISION = Object.freeze({
  PROCEED: "proceed",
  DECLINE: "decline",
  DEFER: "defer",
});

// Ceiling on how far any valuation may drift from its base worth, so a
// desperate buyer cannot bid to infinity. Overridable per policy.
const DEFAULT_PRICE_CEILING_MULTIPLE = 2.5;

// The whole urgency vocabulary. Exported so call sites name a level rather than
// spelling one, because they cannot be trusted to spell it: both hub call sites
// passed "critical" for months, which is not a level, fell back to routine, and
// silently made the entire empty-shelf path — and `urgencyBias` with it — do
// nothing at all.
//
// The anchor is what an actor is unable to DO, not how it feels:
//   routine    it is topping up
//   urgent     coverage is thin and will run out
//   emergency  something already committed to is blocked right now
export const URGENCY = Object.freeze({
  ROUTINE: "routine",
  URGENT: "urgent",
  EMERGENCY: "emergency",
});

const URGENCY_BASE = Object.freeze({ [URGENCY.ROUTINE]: 1, [URGENCY.URGENT]: 1.25, [URGENCY.EMERGENCY]: 1.55 });

export function isKnownUrgency(urgency) {
  return Object.hasOwn(URGENCY_BASE, urgency);
}

// How pressing a shortage is, from the shortage itself. Both hubs and miners
// graded this with their own ternary; sharing it means one definition of "thin"
// and one place to argue about it.
export function urgencyFromCoverage({ onHand = 0, incoming = 0, target = 0 } = {}) {
  if (target <= 0) return URGENCY.ROUTINE;
  // Nothing on the shelf at all: whatever is asked for next cannot be served.
  if (onHand <= 0) return URGENCY.EMERGENCY;
  return (onHand + incoming) / target < 0.5 ? URGENCY.URGENT : URGENCY.ROUTINE;
}

export function createValuationResult({
  acceptable = false,
  affordable = false,
  recommendedPrice = 0,
  minAcceptablePrice = 0,
  maxAcceptablePrice = 0,
  decision = VALUATION_DECISION.DECLINE,
  reasons = [],
  metrics = {},
} = {}) {
  return { acceptable, affordable, recommendedPrice, minAcceptablePrice, maxAcceptablePrice, decision, reasons, metrics };
}

// ── Shared influence factors ───────────────────────────────────────────────

// Desperation. `urgencyBias` (a trait) steepens how much a decision-maker
// will pay when the need is pressing. Sal's 0.8 makes emergencies expensive.
export function urgencyFactor(urgency = "routine", urgencyBias = 0.5) {
  const base = URGENCY_BASE[urgency] ?? URGENCY_BASE.routine;
  return 1 + (base - 1) * (0.5 + urgencyBias * 0.6);
}

// Empty shelves raise what a unit is worth. `caution` (a trait) widens the
// buffer a decision-maker wants, so cautious actors feel scarcity sooner.
export function scarcityFactor({ onHand = 0, incoming = 0, target = 0 } = {}, caution = 0.5) {
  if (target <= 0) return 1;
  const covered = Math.max(0, onHand + incoming) / target;
  const shortfall = Math.max(0, 1 - covered);
  return 1 + shortfall * (0.2 + caution * 0.4);
}

// Relationship influence. Reads the multi-dimensional projection (never a
// single score): trusted, reliable counterparties earn better terms;
// resentment costs them. Kept small — relationships shade prices, and their
// larger role is gating ACCESS (see relationshipProjections.js).
export function relationshipFactor(projection = null, weight = 1) {
  if (!projection) return 1;
  const trust = clamp01(projection.trust ?? 0);
  const reliability = clamp01(projection.reliability ?? 0);
  const gratitude = clamp01(projection.gratitude ?? 0);
  const resentment = clamp01(projection.resentment ?? 0);
  const goodwill = (trust * 0.4 + reliability * 0.4 + gratitude * 0.2) - resentment * 0.6;
  return 1 + goodwill * 0.12 * weight;
}

// ── Procurement (buyer: what is this input worth to me right now?) ─────────

export function evaluateProcurement({
  itemId,
  baseUnitPrice = 0,
  marketUnitValue = 0,
  urgency = "routine",
  inventory = {},           // { onHand, incoming, reserved, target }
  requestedUnits = 1,
  batchSize = 1,
  account = {},             // { balance, committed }
  policy = {},              // { protectedCash, priceCeilingMultiple }
  traits = {},              // { urgencyBias, caution, growthBias }
  relationship = null,
  substitutes = [],         // outcome-equivalent materials already available
} = {}) {
  const reasons = [];
  // Base worth: the institution's authored reference price, floored at raw
  // market value so a buyer never bids below what the material is plainly
  // worth. Authored references already embed a procurement premium.
  const base = Math.max(baseUnitPrice, marketUnitValue);
  if (marketUnitValue > baseUnitPrice) reasons.push(`Market value of ${itemId} (${round(marketUnitValue)}) floors the authored reference ${baseUnitPrice}.`);

  // A level nobody recognises is a bug at the call site, and it used to be
  // invisible: it quietly priced as routine. Say so in the reasons, which is
  // where every other pricing surprise already explains itself.
  if (!isKnownUrgency(urgency)) reasons.push(`Unrecognised urgency '${urgency}' priced as ${URGENCY.ROUTINE} — the caller named a level that does not exist.`);
  const uFactor = urgencyFactor(urgency, traits.urgencyBias ?? 0.5);
  const sFactor = scarcityFactor(inventory, traits.caution ?? 0.5);
  const rFactor = relationshipFactor(relationship);
  const substituteRelief = substitutes.length > 0 ? 0.9 : 1;
  if (substitutes.length > 0) reasons.push(`Outcome-equivalent substitutes on hand (${substitutes.join(", ")}) reduce what Sal must pay.`);

  const ceiling = base * (policy.priceCeilingMultiple ?? DEFAULT_PRICE_CEILING_MULTIPLE);
  const rawPrice = base * uFactor * sFactor * rFactor * substituteRelief;
  const recommendedPrice = Math.max(1, Math.round(Math.min(rawPrice, ceiling)));

  reasons.push(`Urgency ${urgency} ×${round(uFactor)}; scarcity (${inventory.onHand ?? 0} on hand + ${inventory.incoming ?? 0} incoming vs target ${inventory.target ?? 0}) ×${round(sFactor)}.`);
  if (rawPrice > ceiling) reasons.push(`Clamped to the price ceiling of ${round(ceiling)} per unit.`);

  // Batch sizing: buy a meaningful quantity, not repeated tiny requests.
  const minimumUnits = Math.max(1, Math.ceil(requestedUnits));
  const desiredUnits = Math.max(minimumUnits, batchSize);
  const spendable = getSpendable(account, policy);

  // Trim the batch toward the minimum if the full batch would cross protected
  // cash — a partial meaningful order beats no order.
  let units = desiredUnits;
  while (units > minimumUnits && units * recommendedPrice > spendable) units -= 1;
  const totalCost = units * recommendedPrice;
  const affordable = totalCost <= spendable;

  if (units < desiredUnits) reasons.push(`Batch trimmed ${desiredUnits}→${units} to stay inside protected cash.`);
  else if (desiredUnits > minimumUnits) reasons.push(`Batched ${minimumUnits}→${units} units to avoid repeated tiny requests.`);

  if (!affordable) {
    reasons.push(`Cannot commit ${totalCost} credits: only ${round(spendable)} is spendable above the ${policy.protectedCash ?? 0} protected reserve.`);
    return createValuationResult({
      acceptable: true, affordable: false, recommendedPrice,
      minAcceptablePrice: base, maxAcceptablePrice: Math.round(ceiling),
      decision: VALUATION_DECISION.DEFER, reasons,
      metrics: { units, totalCost, spendable, base, urgencyFactor: uFactor, scarcityFactor: sFactor },
    });
  }

  return createValuationResult({
    acceptable: true, affordable: true, recommendedPrice,
    minAcceptablePrice: base, maxAcceptablePrice: Math.round(ceiling),
    decision: VALUATION_DECISION.PROCEED, reasons,
    metrics: { units, totalCost, spendable, base, urgencyFactor: uFactor, scarcityFactor: sFactor },
  });
}

// ── Mining / freight job (supplier: is this work worth my time?) ───────────
//
// Deliberately has NO urgency term. A buyer's desperation reaches the supplier
// through the PRICE it is willing to pay, not through a hidden priority flag.
// That is what lets urgent SPRC work out-compete routine work for inspectable
// reasons.
export function evaluateMiningJob({
  jobId = null,
  payout = 0,
  units = 0,
  travelDistance = 0,
  operatingCostPerDistance = 0.004,
  wearPerDistance = 0.00004,
  wearCostPerPoint = 220,           // what a service visit costs
  risk = 0,
  traits = {},
  policy = {},
  opportunityCost = 0,              // best net value among the alternatives
} = {}) {
  const reasons = [];
  const travelCost = travelDistance * operatingCostPerDistance;
  const wearCost = travelDistance * wearPerDistance * wearCostPerPoint;
  const riskCost = payout * risk * (0.3 + (traits.caution ?? 0.5) * 0.7);
  const netValue = payout - travelCost - wearCost - riskCost;

  reasons.push(`${jobId ?? "job"}: pays ${round(payout)} for ${units} units; travel ${Math.round(travelDistance)}u costs ${round(travelCost)} plus ${round(wearCost)} in wear.`);
  if (riskCost > 0) reasons.push(`Risk discount ${round(riskCost)}.`);

  const acceptable = netValue > 0;
  const beatsAlternative = netValue > opportunityCost;
  if (!acceptable) reasons.push("Net value is negative — the run costs more than it pays.");
  else if (!beatsAlternative) reasons.push(`Net ${round(netValue)} does not beat the best alternative (${round(opportunityCost)}).`);

  return createValuationResult({
    acceptable,
    affordable: true,
    recommendedPrice: Math.round(payout),
    minAcceptablePrice: Math.round(travelCost + wearCost),
    maxAcceptablePrice: Math.round(payout),
    decision: acceptable && beatsAlternative ? VALUATION_DECISION.PROCEED : VALUATION_DECISION.DECLINE,
    reasons,
    metrics: { netValue, travelCost, wearCost, riskCost, payout, units },
  });
}

// ── Service pricing (seller: what must I charge to stay solvent?) ──────────
//
// Cost pass-through lives here: `materialCost` comes from the live CostBasis
// projection, so when inputs get expensive the service price rises on its own.
export function evaluateServicePrice({
  serviceId = null,
  materialCost = 0,
  laborCost = 0,
  facilityCost = 0,
  replacementCost = 0,      // what replacing the part outright would cost
  basePrice = 0,            // authored reference / floor
  traits = {},
  policy = {},
  relationship = null,
} = {}) {
  const reasons = [];
  const costToProvide = materialCost + laborCost + facilityCost;
  // Margin appetite: growth-hungry operators mark up more, cautious ones keep
  // a thinner, safer book.
  const marginRate = 0.18 + (traits.growthBias ?? 0.3) * 0.35 - (traits.caution ?? 0.5) * 0.06;
  const relationshipDiscount = 2 - relationshipFactor(relationship); // goodwill lowers the ask
  const rawPrice = costToProvide * (1 + Math.max(0.05, marginRate)) * relationshipDiscount;
  // Never charge more than replacing the whole part would cost the customer.
  const ceiling = replacementCost > 0 ? replacementCost : Infinity;
  const recommendedPrice = Math.max(1, Math.round(Math.min(Math.max(rawPrice, basePrice * 0.5), ceiling)));

  reasons.push(`${serviceId ?? "service"}: materials ${round(materialCost)} (live cost basis) + labor ${round(laborCost)} + facility ${round(facilityCost)} = ${round(costToProvide)}.`);
  reasons.push(`Margin ${Math.round(marginRate * 100)}% from traits (growthBias ${traits.growthBias ?? 0.3}, caution ${traits.caution ?? 0.5}).`);
  if (Number.isFinite(ceiling) && rawPrice > ceiling) reasons.push(`Capped at replacement cost ${round(ceiling)}.`);
  if (basePrice && recommendedPrice !== Math.round(rawPrice)) reasons.push(`Authored reference price ${basePrice} kept as a floor guard.`);

  return createValuationResult({
    acceptable: true,
    affordable: true,
    recommendedPrice,
    minAcceptablePrice: Math.round(costToProvide),
    maxAcceptablePrice: Number.isFinite(ceiling) ? Math.round(ceiling) : recommendedPrice,
    decision: VALUATION_DECISION.PROCEED,
    reasons,
    metrics: { costToProvide, marginRate, materialCost, laborCost, facilityCost, replacementCost },
  });
}

// ── Supplier ask (seller of WORK: what must I be paid to take this on?) ────
//
// The mirror of `evaluateProcurement`. A supplier totals what serving the job
// actually costs it — including maintenance it will owe later, priced from what
// repairs really cost right now — and asks for that plus a trait-shaped margin.
// `minAcceptablePrice` is the hard floor (bare cost): below it the work loses
// money and is declined. This is the third link of cost pass-through: when a
// repair shop raises its prices, its customers' asks rise with them.
//
// `concession` is the seller's side of a negotiation. Buyers bid UP when they
// are refused; without something that bids down, a price that has risen can
// never come back. A supplier sitting on capacity nobody is buying gives up
// margin — and only margin — to win the business.
export function evaluateSupplierAsk({
  workId = null,
  costComponents = {},      // { travel, maintenance, time, other } — all credits
  offeredPrice = null,      // null when quoting rather than judging an offer
  traits = {},
  policy = {},
  relationship = null,
  concession = 0,           // 0..1 — how much of the margin idle capacity gives back
} = {}) {
  const reasons = [];
  const entries = Object.entries(costComponents).filter(([, value]) => (value ?? 0) > 0);
  const costToServe = entries.reduce((sum, [, value]) => sum + value, 0);
  // Margin is the seller's own share, so it is the first thing to go when it has
  // capacity it cannot sell — a supplier with nothing to do would rather work
  // thin than not at all. What never moves is the floor: below bare cost the
  // work loses money however badly the seller wants the business.
  const shading = clamp01(concession);
  const listMarginRate = Math.max(0.05, 0.15 + (traits.growthBias ?? 0.3) * 0.3 - (traits.caution ?? 0.5) * 0.05);
  const marginRate = listMarginRate * (1 - shading);
  const relationshipDiscount = 2 - relationshipFactor(relationship);
  const ask = Math.max(1, Math.round(costToServe * (1 + marginRate) * relationshipDiscount));
  const floor = Math.max(1, Math.round(costToServe));

  reasons.push(`${workId ?? "work"} costs ${round(costToServe)} to serve (${entries.map(([key, value]) => `${key} ${round(value)}`).join(", ") || "no cost"}).`);
  reasons.push(`Asking ${ask} at a ${Math.round(marginRate * 100)}% margin; will not work below ${floor}.`);
  if (shading > 0) reasons.push(`Idle capacity: giving up ${Math.round(shading * 100)}% of the ${Math.round(listMarginRate * 100)}% list margin to win the work.`);

  const judged = offeredPrice != null;
  const acceptable = judged ? offeredPrice >= floor : true;
  if (judged && !acceptable) reasons.push(`Offered ${round(offeredPrice)} is below the ${floor} cost of doing it.`);
  else if (judged && offeredPrice < ask) reasons.push(`Offered ${round(offeredPrice)} clears cost but is under the ${ask} ask.`);

  return createValuationResult({
    acceptable,
    affordable: true,
    recommendedPrice: ask,
    minAcceptablePrice: floor,
    maxAcceptablePrice: ask,
    decision: acceptable ? VALUATION_DECISION.PROCEED : VALUATION_DECISION.DECLINE,
    reasons,
    metrics: { costToServe, marginRate, listMarginRate, concession: shading, ask, floor, offeredPrice, surplus: judged ? offeredPrice - costToServe : null },
  });
}

export function getSpendable(account = {}, policy = {}) {
  return Math.max(0, (account.balance ?? 0) - (account.committed ?? 0) - (policy.protectedCash ?? 0));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
