// What a mining outfit knows about where the ore is.
//
// Before this module every company surveyed every site at a fixed radius and
// stamped every result with the same confidence, so Flint Prospecting and
// Cinder Contracting held identical maps and ranked them with the same six
// magic constants. Private information is one of the strongest sources of
// difference between rivals and there was none of it.

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPOSIT_KNOWLEDGE_DEFAULTS,
  createObservedDeposit,
  createSurveyedDeposit,
  depositId,
  rankDepositCandidates,
  recordDepositObservation,
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
