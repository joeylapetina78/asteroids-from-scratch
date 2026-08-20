import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { createDistantSimulationOperation } from "../src/systems/distantSimulation.js";
import { DRIFT_BAND, MEASURED_DRIFT_PER_WINDOW, estimateFlowDrift } from "../src/systems/regionFlow.js";
import {
  SIMULATION_REASON,
  describeBlocker,
  describeHubSimulation,
  summarizeSimulationDetail,
} from "../src/systems/simulationObservatory.js";

const HUB_ID = "coldwater-depot";
const NEAR_FOCUS = { x: 380, y: -180 };
const HUB_POSITION = { x: 70_000, y: 46_000 };
const FAR_ENOUGH_HISTORY_MS = 2_000_000;

function createObservedWorld() {
  const state = createGameState();
  const first = { t: 0, actors: {}, populations: {} };
  const last = { t: FAR_ENOUGH_HISTORY_MS, actors: {}, populations: {} };
  first.actors[HUB_ID] = { cash: 30_000, byFamily: { structural: 10, industrial: 10, volatile: 10 } };
  last.actors[HUB_ID] = { cash: 30_000, byFamily: { structural: 30, industrial: 30, volatile: 30 } };
  state.economyHistory = { samples: [first, last], startedAt: 0, lastSampleAt: FAR_ENOUGH_HISTORY_MS, dropped: 0 };
  return state;
}

test("a blocked far hub reports what is holding it and for how long", () => {
  const state = createObservedWorld();
  // The hub's own production: still a blocker, and the one that now stands in
  // for "work that keeps a settlement detailed".
  state.population.productionOrders = { stuck: { id: "stuck", hubInstitutionId: HUB_ID, status: "producing" } };
  let clock = FAR_ENOUGH_HISTORY_MS;
  const operation = createDistantSimulationOperation({
    state, getFocusPoints: () => [NEAR_FOCUS], now: () => clock, policy: { aggregateAfterMs: 0 },
  });
  operation.observe();
  clock += 600_000;
  operation.observe();

  const row = describeHubSimulation(state, HUB_ID, { at: clock, policy: { aggregateAfterMs: 0 } });
  assert.equal(row.detail, "far");
  assert.equal(row.mode, "detailed");
  assert.equal(row.reason, SIMULATION_REASON.BLOCKED);
  assert.deepEqual(row.blockers.map((blocker) => blocker.kind), ["population-production"]);
  assert.equal(row.blockers[0].count, 1);
  // The whole point of the counter: this hub is not busy, it is stuck.
  assert.equal(row.blockedForSeconds, 600);
});

test("a hub that goes quiet clears the blocked clock rather than accumulating", () => {
  const state = createObservedWorld();
  // The hub's own production: still a blocker, and the one that now stands in
  // for "work that keeps a settlement detailed".
  state.population.productionOrders = { stuck: { id: "stuck", hubInstitutionId: HUB_ID, status: "producing" } };
  let clock = FAR_ENOUGH_HISTORY_MS;
  const operation = createDistantSimulationOperation({
    state, getFocusPoints: () => [NEAR_FOCUS], now: () => clock, policy: { aggregateAfterMs: 999_999_999 },
  });
  operation.observe();
  clock += 300_000;
  operation.observe();
  assert.equal(describeHubSimulation(state, HUB_ID, { at: clock }).blockedForSeconds, 300);

  state.population.productionOrders.stuck.status = "completed";
  clock += 1_000;
  operation.observe();
  const row = describeHubSimulation(state, HUB_ID, { at: clock, policy: { aggregateAfterMs: 999_999_999 } });
  assert.equal(row.blockedForSeconds, null);
  assert.equal(row.reason, SIMULATION_REASON.OBSERVING);
  assert.ok(row.eligibleInSeconds > 0, "a hub waiting out the policy window is not reported as blocked");
});

test("an aggregate reports its observation window, its age and its estimated drift", () => {
  const state = createObservedWorld();
  let clock = FAR_ENOUGH_HISTORY_MS;
  const operation = createDistantSimulationOperation({
    state, getFocusPoints: () => [NEAR_FOCUS], now: () => clock, policy: { aggregateAfterMs: 0 },
  });
  operation.observe();
  const observed = state.distantSimulation.hubs[HUB_ID].flow.observedSeconds;
  assert.ok(observed > 0);

  clock += observed * 1000 * 2;
  operation.observe();
  const row = describeHubSimulation(state, HUB_ID, { at: clock });
  assert.equal(row.mode, "aggregate");
  assert.equal(row.reason, SIMULATION_REASON.AGGREGATED);
  assert.equal(row.observedSeconds, observed);
  assert.equal(Math.round(row.observationAgeSeconds), observed * 2);
  assert.equal(row.drift.staleness, 2);
  assert.equal(row.drift.band, DRIFT_BAND.STRETCHED);
  assert.equal(row.drift.stockFraction, 2 * MEASURED_DRIFT_PER_WINDOW.stockFraction);
  assert.equal(row.drift.estimated, true);
});

test("restoring on approach shows up as a transition the observatory can read", () => {
  const state = createObservedWorld();
  let clock = FAR_ENOUGH_HISTORY_MS;
  let focus = NEAR_FOCUS;
  const operation = createDistantSimulationOperation({
    state, getFocusPoints: () => [focus], now: () => clock, policy: { aggregateAfterMs: 0 },
  });
  operation.observe();
  clock += 120_000;
  focus = HUB_POSITION;
  operation.observe();

  const summary = summarizeSimulationDetail(state, { at: clock });
  const row = summary.rows.find((entry) => entry.institutionId === HUB_ID);
  assert.equal(row.mode, "detailed");
  assert.equal(row.transitionCount, 1, "the aggregate/restore round trip is counted");
  assert.equal(row.lastTransition.type, "restored");
  assert.equal(Math.round(row.lastTransition.agoSeconds), 0);
  assert.equal(summary.transitions[0].type, "restored");
  assert.equal(summary.transitions[1].type, "aggregated");
});

test("the summary reports the share of detailed work still being paid for", () => {
  const state = createObservedWorld();
  let clock = FAR_ENOUGH_HISTORY_MS;
  const operation = createDistantSimulationOperation({
    state, getFocusPoints: () => [NEAR_FOCUS], now: () => clock, policy: { aggregateAfterMs: 0 },
  });
  const before = summarizeSimulationDetail(state, { at: clock });
  operation.observe();
  const after = summarizeSimulationDetail(state, { at: clock });

  assert.ok(after.modeCounts.aggregate >= 1);
  assert.ok(after.workShare < before.workShare, "an aggregated hub stops costing detailed work");
  assert.equal(after.detailCounts.far >= 1, true);
  assert.equal(after.rows.length, before.rows.length);
});

test("a quiet hub still shows how much history it is short of", () => {
  // A hub with nothing open and nothing watched is not "ready"; it is waiting
  // out an observation floor set by its own slowest need. That floor is minutes
  // for a small settlement, and it is invisible until it refuses.
  const state = createGameState();
  state.economyHistory = {
    samples: [
      { t: 0, actors: { [HUB_ID]: { cash: 30_000, byFamily: { structural: 10, industrial: 10, volatile: 10 } } }, populations: {} },
      { t: 60_000, actors: { [HUB_ID]: { cash: 30_000, byFamily: { structural: 12, industrial: 12, volatile: 12 } } }, populations: {} },
    ],
    startedAt: 0, lastSampleAt: 60_000, dropped: 0,
  };
  const row = describeHubSimulation(state, HUB_ID, { at: 60_000 });
  assert.equal(row.observation.availableSeconds, 60);
  assert.ok(row.observation.requiredSeconds > 60, "a small settlement's slowest need sets a floor above one minute");
  assert.equal(row.observation.sufficient, false);
});

test("a flow that was never observed reports unknown drift rather than none", () => {
  const drift = estimateFlowDrift({ observedSeconds: 0 }, 600);
  assert.equal(drift.staleness, null);
  assert.equal(drift.band, null);
  assert.equal(drift.stockFraction, null);
});

test("blockers are described without needing the source open", () => {
  assert.deepEqual(describeBlocker("open-orders:4"), { kind: "open-orders", count: 4, label: "open procurement orders" });
  assert.deepEqual(describeBlocker("supply-rate-unknown"), { kind: "supply-rate-unknown", count: null, label: "supply rate never observed" });
});
