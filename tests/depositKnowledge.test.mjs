// What a mining outfit knows about where the ore is.
//
// Before this module every company surveyed every site at a fixed radius and
// stamped every result with the same confidence, so Flint Prospecting and
// Cinder Contracting held identical maps and ranked them with the same six
// magic constants. Private information is one of the strongest sources of
// difference between rivals and there was none of it.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import {
  DEPOSIT_KNOWLEDGE_DEFAULTS,
  createObservedDeposit,
  createSurveyedDeposit,
  depositId,
  invalidateDepositIndex,
  rankDepositCandidates,
  recordDepositObservation,
  rememberSurveyedDeposit,
  resolveProspectingPolicy,
  scoreDeposit,
} from "../src/systems/depositKnowledge.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { CINDER_MINING_SEED, FLINT_MINING_SEED } from "../src/content/economy/miningInstitutions.js";

const NOW = 1_000_000;
const ORIGIN = { x: 0, y: 0 };

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const game = {
    worldSites: [
      { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
      { id: "blue-lantern", name: "Blue Lantern", position: { x: 2950, y: 2180 } },
      { id: "morrow-shoal", name: "Morrow Shoal", position: { x: -3820, y: 2320 } },
      { id: "ore-station-one", name: "Ore Station One", position: { x: 40000, y: -24000 } },
      { id: "coldwater-depot", name: "Coldwater Depot", position: { x: 70000, y: 46000 } },
      { id: "deep-research", name: "Deep Research", position: { x: -72000, y: 53000 } },
    ],
    addWorkerShip: () => {},
  };
  createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  createMiningOperation({ state, game, now: () => 1_000, seed: FLINT_MINING_SEED });
  return state;
}

function knowledgeOf(deposits) {
  return Object.fromEntries(deposits.map((deposit) => [deposit.id, deposit]));
}

// ── The conversion is faithful ──────────────────────────────────────────────

test("a trait-neutral operator reproduces the constants this replaced", () => {
  const state = createWorld();
  state.logistics.institutions["neutral-co"] = {
    id: "neutral-co",
    name: "Neutral Co",
    traits: { caution: 0.5, growthBias: 0.5, urgencyBias: 0.5 },
  };

  const policy = resolveProspectingPolicy(state, "neutral-co");
  assert.equal(policy.surveyRadius, DEPOSIT_KNOWLEDGE_DEFAULTS.surveyRadius);
  assert.equal(policy.surveyConfidence, DEPOSIT_KNOWLEDGE_DEFAULTS.surveyConfidence);
  assert.equal(policy.experienceWeight, DEPOSIT_KNOWLEDGE_DEFAULTS.experienceWeight);
  assert.equal(policy.distanceFloor, DEPOSIT_KNOWLEDGE_DEFAULTS.distanceFloor);
  assert.equal(policy.candidateCount, DEPOSIT_KNOWLEDGE_DEFAULTS.candidateCount);
});

// ── Two companies, two maps ─────────────────────────────────────────────────

test("a grower surveys further out than a careful operator", () => {
  const state = createWorld();
  const cinder = resolveProspectingPolicy(state, "miner:cinder-contracting");  // Ivo: growth 0.55
  const flint = resolveProspectingPolicy(state, "miner:flint-prospecting");    // Rhea: growth 0.28

  assert.ok(cinder.surveyRadius > flint.surveyRadius,
    `Ivo ranges wider (${Math.round(cinder.surveyRadius)} vs ${Math.round(flint.surveyRadius)})`);
});

test("a cautious operator discounts somebody else's chart", () => {
  const state = createWorld();
  const cinder = resolveProspectingPolicy(state, "miner:cinder-contracting");  // Ivo: caution 0.40
  const flint = resolveProspectingPolicy(state, "miner:flint-prospecting");    // Rhea: caution 0.72

  assert.ok(flint.surveyConfidence < cinder.surveyConfidence,
    `Rhea trusts the regional survey less (${flint.surveyConfidence.toFixed(3)} vs ${cinder.surveyConfidence.toFixed(3)})`);
  assert.ok(flint.experienceWeight > cinder.experienceWeight,
    "and leans harder on deposits that have already paid out");
});

// Not a temperament — a fact about information. A crew that has stood on the
// rock beats a chart for everybody, however trusting they are.
test("firsthand always beats secondhand, however trusting the operator", () => {
  const state = createWorld();
  state.logistics.institutions["credulous-co"] = {
    id: "credulous-co",
    name: "Credulous Co",
    traits: { caution: 0, growthBias: 1, urgencyBias: 0.5 },
  };

  const policy = resolveProspectingPolicy(state, "credulous-co");
  assert.ok(policy.surveyConfidence <= policy.observationConfidence,
    "a chart never outranks having been there");
});

// The headline. Two companies looking at the SAME map go to different rocks.
test("the same map sends two companies to different deposits", () => {
  const state = createWorld();
  const cinder = resolveProspectingPolicy(state, "miner:cinder-contracting");
  const flint = resolveProspectingPolicy(state, "miner:flint-prospecting");

  // A proven rock out in the field, against an unproven one close by. Both
  // companies read the SAME records — confidence is stamped on the deposit when
  // it is charted — so the only thing separating them here is how much a
  // deposit that has already paid out is worth to each of them.
  const nearby = createSurveyedDeposit({ x: 900, y: 0, resourceId: "iron-nickel", policy: cinder, at: NOW });
  const trips = 6;
  const nearScore = scoreDeposit(nearby, ORIGIN, cinder);
  // The range at which each operator stops preferring the proven rock. Derived
  // rather than written as a literal, so tuning the traits or the weights
  // cannot quietly turn this into a test of nothing.
  const crossover = (policy) => (DEPOSIT_KNOWLEDGE_DEFAULTS.observationConfidence + trips * policy.experienceWeight) / nearScore;
  assert.ok(crossover(flint) > crossover(cinder), "Rhea will travel further for a rock she has worked");

  const farX = (crossover(cinder) + crossover(flint)) / 2;
  const proven = { ...createObservedDeposit({ x: farX, y: 0, resourceId: "iron-nickel", policy: cinder, at: NOW }), successfulSelections: trips };
  const knowledge = knowledgeOf([proven, nearby]);

  const cinderPick = rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy: cinder })[0];
  const flintPick = rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy: flint })[0];

  assert.equal(cinderPick.id, nearby.id, "Ivo takes the close one and gets on with it");
  assert.equal(flintPick.id, proven.id, "Rhea goes the distance for the rock she has already worked");
});

// ── Ranking behaves ─────────────────────────────────────────────────────────

test("only deposits of the asked-for resource are offered", () => {
  const state = createWorld();
  const policy = resolveProspectingPolicy(state, "miner:cinder-contracting");
  const knowledge = knowledgeOf([
    createSurveyedDeposit({ x: 100, y: 0, resourceId: "iron-nickel", policy, at: NOW }),
    createSurveyedDeposit({ x: 120, y: 0, resourceId: "silicate", policy, at: NOW }),
  ]);

  const candidates = rankDepositCandidates({ knowledge, resourceId: "silicate", position: ORIGIN, policy });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, depositId({ x: 120, y: 0, resourceId: "silicate" }));
});

test("a worker is never handed more candidates than the policy allows", () => {
  const state = createWorld();
  const policy = resolveProspectingPolicy(state, "miner:cinder-contracting");
  const knowledge = knowledgeOf(
    Array.from({ length: policy.candidateCount + 20 }, (_, index) =>
      createSurveyedDeposit({ x: 1000 + index * 100, y: 0, resourceId: "iron-nickel", policy, at: NOW })),
  );

  assert.equal(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy }).length, policy.candidateCount);
});

// Without a floor, a deposit underfoot scores near-infinitely and nothing else
// is ever considered.
test("distance stops mattering below the floor", () => {
  const state = createWorld();
  const policy = resolveProspectingPolicy(state, "miner:cinder-contracting");
  const onTop = createSurveyedDeposit({ x: 0, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  const close = createSurveyedDeposit({ x: policy.distanceFloor - 1, y: 0, resourceId: "iron-nickel", policy, at: NOW });

  assert.equal(scoreDeposit(onTop, ORIGIN, policy), scoreDeposit(close, ORIGIN, policy));
});

test("ranking is stable rather than dependent on insertion order", () => {
  const state = createWorld();
  const policy = resolveProspectingPolicy(state, "miner:cinder-contracting");
  const first = createSurveyedDeposit({ x: 3000, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  const second = createSurveyedDeposit({ x: 0, y: 3000, resourceId: "iron-nickel", policy, at: NOW });

  const forward = rankDepositCandidates({ knowledge: knowledgeOf([first, second]), resourceId: "iron-nickel", position: ORIGIN, policy });
  const backward = rankDepositCandidates({ knowledge: knowledgeOf([second, first]), resourceId: "iron-nickel", position: ORIGIN, policy });
  assert.deepEqual(forward, backward, "equal-scoring deposits break their tie the same way either way round");
});

test("an empty map offers nothing rather than failing", () => {
  const state = createWorld();
  const policy = resolveProspectingPolicy(state, "miner:cinder-contracting");
  assert.deepEqual(rankDepositCandidates({ knowledge: {}, resourceId: "iron-nickel", position: ORIGIN, policy }), []);
  assert.deepEqual(rankDepositCandidates({ knowledge: null, resourceId: "iron-nickel", position: ORIGIN, policy }), []);
});

// ── Knowledge is earned ─────────────────────────────────────────────────────

test("working a rock raises confidence in it, up to certainty", () => {
  const state = createWorld();
  const policy = resolveProspectingPolicy(state, "miner:cinder-contracting");
  const knowledge = {};

  const first = recordDepositObservation(knowledge, { x: 500, y: 500, resourceId: "iron-nickel", policy, at: NOW });
  assert.equal(first.source, "worker-observation");
  assert.equal(first.successfulSelections, 1);
  assert.ok(first.confidence > policy.observationConfidence, "a worked rock beats an unworked observation");

  for (let trip = 0; trip < 50; trip += 1) {
    recordDepositObservation(knowledge, { x: 500, y: 500, resourceId: "iron-nickel", policy, at: NOW });
  }
  assert.equal(knowledge[first.id].confidence, 1, "confidence tops out at certainty");
  assert.equal(knowledge[first.id].successfulSelections, 51);
});

test("observing a charted deposit promotes it above the chart", () => {
  const state = createWorld();
  const policy = resolveProspectingPolicy(state, "miner:flint-prospecting");
  const surveyed = createSurveyedDeposit({ x: 800, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  const knowledge = knowledgeOf([surveyed]);

  const before = surveyed.confidence;
  recordDepositObservation(knowledge, { x: 800, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  assert.ok(knowledge[surveyed.id].confidence > before, "seeing it for yourself is worth something");
});

// ── The map is filed by resource ────────────────────────────────────────────
//
// Ranking used to walk every deposit a company knew and throw ~93% of it away.
// The map is now filed by resource, derived from the same flat records. These
// tests are about the one thing a derived index can do that no index at all
// cannot: answer confidently and wrongly.

function cinderPolicy() {
  return resolveProspectingPolicy(createWorld(), "miner:cinder-contracting");
}

// The oracle: the plain scan this replaced. Filing the map is supposed to be
// invisible from outside, so the two must agree on a map with real variety in
// it — several resources, worked and unworked rocks, near and far.
function scanForCandidates(knowledge, resourceId, position, policy) {
  return Object.values(knowledge)
    .filter((deposit) => deposit.resourceId === resourceId)
    .map((deposit) => ({ deposit, score: scoreDeposit(deposit, position, policy) }))
    .sort((first, second) => second.score - first.score || first.deposit.id.localeCompare(second.deposit.id))
    .slice(0, policy.candidateCount)
    .map(({ deposit }) => ({ id: deposit.id, x: deposit.x, y: deposit.y }));
}

test("filing the map by resource does not change what it offers", () => {
  const policy = cinderPolicy();
  const resources = ["iron-nickel", "silicate", "water-ice", "copper", "platinum"];
  const knowledge = knowledgeOf(Array.from({ length: 400 }, (_, index) => {
    const resourceId = resources[index % resources.length];
    const spot = { x: ((index * 977) % 20000) - 10000, y: ((index * 613) % 20000) - 10000, resourceId };
    return index % 3 === 0
      ? { ...createObservedDeposit({ ...spot, policy, at: NOW }), successfulSelections: index % 7 }
      : createSurveyedDeposit({ ...spot, policy, at: NOW });
  }));
  const position = { x: 380, y: -180 };

  resources.forEach((resourceId) => {
    assert.deepEqual(
      rankDepositCandidates({ knowledge, resourceId, position, policy }),
      scanForCandidates(knowledge, resourceId, position, policy),
      `${resourceId} is ranked exactly as the full scan ranked it`,
    );
  });
  // Asked for something nobody has charted, it offers nothing rather than failing.
  assert.deepEqual(rankDepositCandidates({ knowledge, resourceId: "unobtainium", position, policy }), []);
});

// The failure this whole design is arranged around: knowledge arrives at
// runtime, and a filing that missed it would quietly stop offering it.
test("a rock a crew has just worked is offered on the very next ranking", () => {
  const policy = cinderPolicy();
  const knowledge = knowledgeOf([createSurveyedDeposit({ x: 9000, y: 0, resourceId: "iron-nickel", policy, at: NOW })]);

  // Rank first, so a filing exists and has something to go stale about.
  assert.equal(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy }).length, 1);

  recordDepositObservation(knowledge, { x: 600, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  const offered = rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy });
  assert.equal(offered.length, 2);
  assert.equal(offered[0].id, depositId({ x: 600, y: 0, resourceId: "iron-nickel" }),
    "and it is the one underfoot, not the one nine kilometres out");
});

test("a newly charted deposit is offered on the very next ranking", () => {
  const policy = cinderPolicy();
  const knowledge = {};
  assert.deepEqual(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy }), []);

  rememberSurveyedDeposit(knowledge, createSurveyedDeposit({ x: 700, y: 0, resourceId: "iron-nickel", policy, at: NOW }));
  assert.equal(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy }).length, 1);
});

// The first deposit of a resource has no file to go in yet — the case where an
// index that only ever appends to what it already has would lose it.
test("the first deposit of a resource opens a new file rather than being lost", () => {
  const policy = cinderPolicy();
  const knowledge = knowledgeOf([createSurveyedDeposit({ x: 700, y: 0, resourceId: "iron-nickel", policy, at: NOW })]);
  assert.deepEqual(rankDepositCandidates({ knowledge, resourceId: "silicate", position: ORIGIN, policy }), []);

  recordDepositObservation(knowledge, { x: 800, y: 0, resourceId: "silicate", policy, at: NOW });
  assert.equal(rankDepositCandidates({ knowledge, resourceId: "silicate", position: ORIGIN, policy }).length, 1);
});

test("charting a deposit a company already has files it once, not twice", () => {
  const policy = cinderPolicy();
  const first = createSurveyedDeposit({ x: 700, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  const knowledge = {};
  rememberSurveyedDeposit(knowledge, first);
  rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy });

  const again = rememberSurveyedDeposit(knowledge, createSurveyedDeposit({ x: 700, y: 0, resourceId: "iron-nickel", policy, at: NOW + 1 }));
  assert.equal(again, first, "the record a company already holds is the one it keeps");
  assert.equal(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy }).length, 1);
});

// Confidence and successful trips are mutated in place on the record itself.
// The filing holds the live record, so there is nothing to keep in step.
test("a deposit's rising confidence is visible through the filing", () => {
  const policy = cinderPolicy();
  const near = createSurveyedDeposit({ x: 900, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  const far = createSurveyedDeposit({ x: 1400, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  const knowledge = knowledgeOf([near, far]);
  assert.equal(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy })[0].id, near.id);

  for (let trip = 0; trip < 20; trip += 1) {
    recordDepositObservation(knowledge, { x: 1400, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  }
  assert.equal(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy })[0].id, far.id,
    "twenty paying trips move it to the front without the filing being rebuilt");
});

// Survey radius is per-actor, so companies hold different-sized maps. A filing
// shared across them would hand Flint rocks it never charted.
test("one company's filing is never another's", () => {
  const policy = cinderPolicy();
  const shared = createSurveyedDeposit({ x: 900, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  const wide = knowledgeOf([shared, createSurveyedDeposit({ x: 11000, y: 0, resourceId: "iron-nickel", policy, at: NOW })]);
  const narrow = knowledgeOf([shared]);

  assert.equal(rankDepositCandidates({ knowledge: wide, resourceId: "iron-nickel", position: ORIGIN, policy }).length, 2);
  assert.equal(rankDepositCandidates({ knowledge: narrow, resourceId: "iron-nickel", position: ORIGIN, policy }).length, 1,
    "the smaller map is not lent the wider company's chart");
  assert.equal(rankDepositCandidates({ knowledge: wide, resourceId: "iron-nickel", position: ORIGIN, policy }).length, 2);
});

// `depositKnowledge` is saved. The filing is derived, so it must be invisible
// to everything that copies or serialises the map.
test("the filing is derived and never reaches a save file", () => {
  const policy = cinderPolicy();
  const knowledge = knowledgeOf([
    createSurveyedDeposit({ x: 700, y: 0, resourceId: "iron-nickel", policy, at: NOW }),
    createSurveyedDeposit({ x: 0, y: 700, resourceId: "silicate", policy, at: NOW }),
  ]);
  const before = rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy });

  assert.equal(Object.keys(knowledge).length, 2, "only deposits are enumerable");
  assert.deepEqual(Object.getOwnPropertySymbols({ ...knowledge }), [], "a spread copy does not carry it");
  const restored = JSON.parse(JSON.stringify(knowledge));
  assert.deepEqual(Object.keys(restored), Object.keys(knowledge));
  assert.deepEqual(rankDepositCandidates({ knowledge: restored, resourceId: "iron-nickel", position: ORIGIN, policy }), before,
    "a map that came back off disk ranks the same, filing itself again from scratch");
});

test("a frozen map is ranked rather than refused", () => {
  const policy = cinderPolicy();
  const knowledge = Object.freeze(knowledgeOf([createSurveyedDeposit({ x: 700, y: 0, resourceId: "iron-nickel", policy, at: NOW })]));
  assert.equal(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy }).length, 1);
});

// The escape hatch, and the reason it exists: a write that goes around the
// module is exactly what the filing cannot see.
test("a map written behind the module's back is repaired by invalidating the filing", () => {
  const policy = cinderPolicy();
  const knowledge = knowledgeOf([createSurveyedDeposit({ x: 700, y: 0, resourceId: "iron-nickel", policy, at: NOW })]);
  assert.equal(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy }).length, 1);

  const rogue = createSurveyedDeposit({ x: 800, y: 0, resourceId: "iron-nickel", policy, at: NOW });
  knowledge[rogue.id] = rogue;
  assert.equal(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy }).length, 1,
    "the filing cannot know about a deposit nobody told it about");

  invalidateDepositIndex(knowledge);
  assert.equal(rankDepositCandidates({ knowledge, resourceId: "iron-nickel", position: ORIGIN, policy }).length, 2);
});

// The invariant the whole design rests on. `rankDepositCandidates` trusts its
// filing without re-counting the map, which is only safe while every write
// goes through this module. A reintroduced `knowledge[id] = deposit` elsewhere
// would not fail — it would quietly stop offering that rock, which is the
// expensive kind of wrong. This catches the obvious form of it; the comment in
// `depositKnowledge.js` is what covers the rest.
test("deposit knowledge is only ever added through its own module", () => {
  const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const ownModule = join(srcDir, "systems", "depositKnowledge.js");
  // `x.depositKnowledge[…] =` / `??=`, and `Object.assign(x.depositKnowledge, …)`.
  const directWrite = /depositKnowledge\s*\[[^\]]*\]\s*(?:\?\?)?=[^=]|Object\.assign\(\s*[\w.]*depositKnowledge\b/g;

  const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith(".js")) out.push(full);
    }
    return out;
  };

  const offenders = walk(srcDir)
    .filter((file) => file !== ownModule)
    .flatMap((file) => [...readFileSync(file, "utf8").matchAll(directWrite)]
      .map((match) => `${relative(srcDir, file)} → ${match[0].trim()}`));

  assert.deepEqual(offenders, [],
    `Deposits must be added with rememberSurveyedDeposit/recordDepositObservation, or the resource filing goes stale:\n  ${offenders.join("\n  ")}`);
});

// ── End to end, through the operation ───────────────────────────────────────

test("two companies stand up genuinely different maps of the same world", () => {
  const state = createWorld();
  const cinder = state.miningOperations["cinder-contracting"].depositKnowledge;
  const flint = state.miningOperations["flint-prospecting"].depositKnowledge;

  // Without a resource field there is nothing to survey; the point of this test
  // is only meaningful when both actually charted something.
  if (Object.keys(cinder).length === 0 && Object.keys(flint).length === 0) return;

  const cinderConfidences = new Set(Object.values(cinder).map((deposit) => deposit.confidence));
  const flintConfidences = new Set(Object.values(flint).map((deposit) => deposit.confidence));
  assert.notDeepEqual([...cinderConfidences], [...flintConfidences],
    "the two companies do not trust their charts equally");
});
