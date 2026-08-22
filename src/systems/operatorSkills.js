import { deriveOperatorEvidence } from "./npcDevelopment.js?v=fresh-20260821-2304-60f29300";

// What a person has actually learned to do.
//
// Capability in this world comes from controlled assets: a mining charter grants
// extraction, a freight craft grants transport. That answers what an actor may
// ATTEMPT. It has never answered whether the person at the controls can pull it
// off — so a hull bolted to a rookie behaved exactly like the same hull in the
// hands of a veteran, and a career record earned somebody a title and nothing
// else.
//
// Skill is the missing gate, and it is a PROJECTION, never a stored stat.
// `npcDevelopment` already records what each operator has really done — freight
// completed, revenue earned, ports served, factory runs finished — and skill is
// read out of that same evidence. Nobody can be handed a level; you get it by
// having done the work, and if the record changes the level changes with it.
// A second stored number would be a second source of truth, free to drift from
// the career it claims to describe.

export const SKILL = Object.freeze({
  // Holding a line, judging an approach, handling a hull that does not fly
  // itself. Earned by arriving places, repeatedly, in varied conditions.
  PRECISION_FLIGHT: "precision-flight",
  // Loading, custody, manifests, delivering what you said you would.
  CARGO_HANDLING: "cargo-handling",
  // Running a production floor without wasting stock.
  INDUSTRIAL_CRAFT: "industrial-craft",
  // Cutting rock efficiently without wrecking the equipment.
  EXTRACTION: "extraction",
});

// Why an operator does not meet a requirement. The distinction matters and this
// session keeps re-learning it: a person with NO record has not been shown to be
// incapable, they have not been shown at all. Both refuse the qualification, but
// only one of them is fixed by more work — and only one of them might mean the
// evidence path itself is missing.
export const SKILL_VERDICT = Object.freeze({
  QUALIFIED: "qualified",
  UNDER_QUALIFIED: "under-qualified",
  NO_RECORD: "no-recorded-work",
});

// Diminishing returns: the first dozen deliveries teach far more than the
// hundredth. Levels are 0-100 and asymptotic, so nobody is ever finished
// learning and nobody grinds to omniscience.
function curve(amount, halfway) {
  const value = Math.max(0, amount ?? 0);
  if (!(halfway > 0)) return 0;
  return Math.round(100 * (value / (value + halfway)));
}

export function getOperatorSkills(state, operator) {
  const resolved = typeof operator === "string"
    ? state?.population?.operators?.[operator] ?? null
    : operator;
  const blank = {
    [SKILL.PRECISION_FLIGHT]: 0,
    [SKILL.CARGO_HANDLING]: 0,
    [SKILL.INDUSTRIAL_CRAFT]: 0,
    [SKILL.EXTRACTION]: 0,
  };
  if (!resolved) return { skills: blank, evidence: null, hasRecord: false };

  const evidence = deriveOperatorEvidence(state, resolved);
  const measures = evidence?.measures ?? {};
  // An operator whose vocation records nothing has no record at all, however
  // long they have been employed. Time served is not evidence.
  const hasRecord = Object.values(measures).some((value) => (value ?? 0) > 0);

  const skills = { ...blank };
  if (evidence?.sourceKind === "freight") {
    const trips = measures.completedFreight ?? 0;
    const ports = measures.servedSites ?? 0;
    // Varied destinations teach handling that repetition on one lane does not.
    skills[SKILL.PRECISION_FLIGHT] = curve(trips + ports * 3, 18);
    skills[SKILL.CARGO_HANDLING] = curve(trips * 2 + (measures.lifetimeRevenue ?? 0) / 400, 20);
  } else if (evidence?.sourceKind === "factory") {
    skills[SKILL.INDUSTRIAL_CRAFT] = curve((measures.completedRuns ?? 0) * 2 + (measures.ordersAccepted ?? 0), 16);
    skills[SKILL.CARGO_HANDLING] = curve(measures.ordersAccepted ?? 0, 30);
  } else if (evidence?.sourceKind === "extraction") {
    skills[SKILL.EXTRACTION] = curve((measures.completedExtractions ?? 0) * 2 + (measures.unitsCut ?? 0) / 12, 18);
    // Varied fields teach a miner handling for the same reason varied ports
    // teach a hauler: an unfamiliar approach is the thing being learned, and
    // grinding one seam is not it. Weighted as the freight branch weights ports.
    skills[SKILL.PRECISION_FLIGHT] = curve((measures.completedExtractions ?? 0) + (measures.servedSites ?? 0) * 3, 26);
  }

  return { skills, evidence, hasRecord };
}

export function getSkillLevel(state, operator, skill) {
  return getOperatorSkills(state, operator).skills[skill] ?? 0;
}

// Does this person meet a stated requirement, and if not, why not.
//
// Returns a verdict rather than a boolean because "has never been assessed" and
// "assessed and not good enough" call for different responses: the first may
// mean the work simply is not being recorded anywhere.
export function checkSkillRequirement(state, operator, requirement) {
  if (!requirement?.skill) return { verdict: SKILL_VERDICT.QUALIFIED, ok: true, level: null, required: null };
  const { skills, hasRecord, evidence } = getOperatorSkills(state, operator);
  const level = skills[requirement.skill] ?? 0;
  const required = requirement.level ?? 0;
  if (level >= required) {
    return { verdict: SKILL_VERDICT.QUALIFIED, ok: true, skill: requirement.skill, level, required, evidence };
  }
  return {
    verdict: hasRecord ? SKILL_VERDICT.UNDER_QUALIFIED : SKILL_VERDICT.NO_RECORD,
    ok: false,
    skill: requirement.skill,
    level,
    required,
    shortfall: required - level,
    evidence,
  };
}

export function describeSkillVerdict(result, operatorName = "the operator") {
  if (!result || result.ok) return `${operatorName} is qualified`;
  if (result.verdict === SKILL_VERDICT.NO_RECORD) {
    return `${operatorName} has no recorded work to judge ${result.skill} by`;
  }
  return `${operatorName} is ${result.shortfall} short of the ${result.skill} needed (${result.level}/${result.required})`;
}

// Can this person be put at the controls of this equipment?
//
// The equipment states what it asks for; the operator's record answers. Kept
// here rather than in the flight code so that every future piece of gear with a
// handling requirement is judged the same way, and so a refusal can say WHY.
export function canOperateEquipment(state, operator, equipment) {
  const requirement = equipment?.requiresSkill ?? null;
  const result = checkSkillRequirement(state, operator, requirement);
  return { ...result, equipmentId: equipment?.id ?? null, requirement };
}
