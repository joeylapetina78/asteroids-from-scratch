import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import {
  SKILL,
  SKILL_VERDICT,
  checkSkillRequirement,
  describeSkillVerdict,
  getOperatorSkills,
  getSkillLevel,
} from "../src/systems/operatorSkills.js";

// Skill is what a person has been SHOWN to be able to do.
//
// It is projected out of the career `npcDevelopment` already records, never
// stored, so nobody can be handed a level and a level cannot drift away from the
// work that earned it.

function worldWithCarrier({ completedFreight = 0, lifetimeFreightRevenue = 0, servedSiteIds = [] } = {}) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const carrierId = "carrier:test";
  state.logistics.institutions[carrierId] = {
    id: carrierId, archetypeId: "hauling-business", controllerInstitutionId: "person:test",
    operatingHistory: { completedFreight, lifetimeFreightRevenue, servedSiteIds },
    accounts: { operating: { balance: 1_000, committed: 0, transactions: [] } },
  };
  state.population ??= {};
  state.population.operators = {
    "person:test": { id: "person:test", name: "Test Operator", employerInstitutionId: carrierId, role: "freight-operator" },
  };
  return state;
}

test("a fresh operator has no skill and, more importantly, no record", () => {
  const state = worldWithCarrier();
  const { skills, hasRecord } = getOperatorSkills(state, "person:test");
  assert.equal(hasRecord, false, "employment is not evidence; only work is");
  Object.values(SKILL).forEach((skill) => assert.equal(skills[skill], 0));
});

test("skill is earned by doing the work, and keeps rising with diminishing returns", () => {
  const green = worldWithCarrier({ completedFreight: 2, lifetimeFreightRevenue: 800, servedSiteIds: ["a"] });
  const seasoned = worldWithCarrier({ completedFreight: 40, lifetimeFreightRevenue: 30_000, servedSiteIds: ["a", "b", "c", "d"] });
  const veteran = worldWithCarrier({ completedFreight: 200, lifetimeFreightRevenue: 200_000, servedSiteIds: ["a", "b", "c", "d", "e"] });

  const g = getSkillLevel(green, "person:test", SKILL.PRECISION_FLIGHT);
  const s = getSkillLevel(seasoned, "person:test", SKILL.PRECISION_FLIGHT);
  const v = getSkillLevel(veteran, "person:test", SKILL.PRECISION_FLIGHT);

  assert.ok(g < s && s < v, `experience raises skill (${g} < ${s} < ${v})`);
  assert.ok(v < 100, "nobody is ever finished learning");
  assert.ok((v - s) < (s - g), "the hundredth trip teaches less than the tenth");
});

test("varied ports teach handling that one lane does not", () => {
  const oneLane = worldWithCarrier({ completedFreight: 20, servedSiteIds: ["a"] });
  const wideRange = worldWithCarrier({ completedFreight: 20, servedSiteIds: ["a", "b", "c", "d", "e"] });
  assert.ok(
    getSkillLevel(wideRange, "person:test", SKILL.PRECISION_FLIGHT)
    > getSkillLevel(oneLane, "person:test", SKILL.PRECISION_FLIGHT),
    "the same number of trips across more ports is worth more",
  );
});

test("never assessed and not good enough are different refusals", () => {
  const unknown = worldWithCarrier();
  const tried = worldWithCarrier({ completedFreight: 1 });
  const requirement = { skill: SKILL.PRECISION_FLIGHT, level: 60 };

  const noRecord = checkSkillRequirement(unknown, "person:test", requirement);
  const short = checkSkillRequirement(tried, "person:test", requirement);

  assert.equal(noRecord.ok, false);
  assert.equal(noRecord.verdict, SKILL_VERDICT.NO_RECORD,
    "a person with no record has not been shown to be incapable — they have not been shown at all");
  assert.equal(short.ok, false);
  assert.equal(short.verdict, SKILL_VERDICT.UNDER_QUALIFIED);
  assert.ok(short.shortfall > 0);

  // Only one of these is fixed by more work; the other may mean the evidence
  // path itself is missing, which is exactly the case for mining crews today.
  assert.notEqual(noRecord.verdict, short.verdict);
});

test("a qualified operator passes, and the reason reads plainly", () => {
  const state = worldWithCarrier({ completedFreight: 60, lifetimeFreightRevenue: 40_000, servedSiteIds: ["a", "b", "c"] });
  const result = checkSkillRequirement(state, "person:test", { skill: SKILL.PRECISION_FLIGHT, level: 50 });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, SKILL_VERDICT.QUALIFIED);
  assert.match(describeSkillVerdict(result, "Vale"), /qualified/);

  const denied = checkSkillRequirement(worldWithCarrier(), "person:test", { skill: SKILL.PRECISION_FLIGHT, level: 50 });
  assert.match(describeSkillVerdict(denied, "Vale"), /no recorded work/);
});

test("a requirement with no skill named is not a gate", () => {
  const state = worldWithCarrier();
  assert.equal(checkSkillRequirement(state, "person:test", {}).ok, true);
  assert.equal(checkSkillRequirement(state, "person:test", null).ok, true);
});

test("an unknown operator is refused rather than crashing", () => {
  const state = worldWithCarrier();
  const result = checkSkillRequirement(state, "person:nobody", { skill: SKILL.CARGO_HANDLING, level: 10 });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, SKILL_VERDICT.NO_RECORD);
});

// ── The first thing skill actually gates ───────────────────────────────────
import { ENGINE_MODELS } from "../src/content/ships/engineModels.js";
import { canOperateEquipment } from "../src/systems/operatorSkills.js";

test("a standard drive asks nothing of the pilot; a reversing drive does", () => {
  const rookie = worldWithCarrier();
  const standard = ENGINE_MODELS["rook-standard-drive"];
  const reversing = ENGINE_MODELS["vektor-reversing-drive"];

  assert.equal(canOperateEquipment(rookie, "person:test", standard).ok, true,
    "a brake is forgiving — worst case you stop");
  assert.equal(canOperateEquipment(rookie, "person:test", reversing).ok, false,
    "reverse thrust is handling, and this pilot has never been assessed");
  assert.equal(canOperateEquipment(rookie, "person:test", reversing).verdict, SKILL_VERDICT.NO_RECORD);
});

test("a pilot who has flown enough earns the reversing drive", () => {
  const reversing = ENGINE_MODELS["vektor-reversing-drive"];
  const green = worldWithCarrier({ completedFreight: 3, servedSiteIds: ["a"] });
  const veteran = worldWithCarrier({ completedFreight: 80, lifetimeFreightRevenue: 60_000, servedSiteIds: ["a", "b", "c", "d"] });

  const denied = canOperateEquipment(green, "person:test", reversing);
  const allowed = canOperateEquipment(veteran, "person:test", reversing);

  assert.equal(denied.ok, false);
  assert.equal(denied.verdict, SKILL_VERDICT.UNDER_QUALIFIED,
    "this one HAS a record — it is simply not enough yet, which more work fixes");
  assert.equal(allowed.ok, true);
  assert.equal(allowed.level >= reversing.requiresSkill.level, true);
});

test("equipment that states no requirement is open to anyone", () => {
  const rookie = worldWithCarrier();
  assert.equal(canOperateEquipment(rookie, "person:test", { id: "crate" }).ok, true);
});
