// The remaining small systems, split along the clock's phases.
//
// Population and towing are both order-preserving splits, so what these tests
// guard is the two judgement calls inside them: the population loop stays
// whole, and finishing a recovery frees the vehicle in OBSERVE.

import assert from "node:assert/strict";
import test from "node:test";
import { createPopulationOperation } from "../src/systems/populationDemand.js";
import { createInitialTowServiceState, createTowServiceManager } from "../src/systems/towService.js";
import { createWorldClock, TICK_PHASE } from "../src/systems/worldClock.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

function createPopulationWorld(now = () => 1_000) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const manager = createPopulationOperation({ state, now });
  return { state, manager };
}

function createTowWorld(now = () => 1_000) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  state.towing = createInitialTowServiceState(1_000);
  const manager = createTowServiceManager({ state, ships: [], destinations: [], now });
  return { state, manager };
}

// ── Population ──────────────────────────────────────────────────────────────

test("population exposes observe and decide, and update runs both", () => {
  const { manager } = createPopulationWorld();
  assert.equal(typeof manager.observe, "function");
  assert.equal(typeof manager.decide, "function");
  // Diagnostics are published inside the loop, against the hub each population
  // actually bought from, so there is nothing left to report afterwards.
  assert.equal(manager.settle, undefined);
});

test("a hand-driven population tick and update() reach the same place", () => {
  const byHand = createPopulationWorld();
  byHand.manager.observe();
  byHand.manager.decide();

  const byUpdate = createPopulationWorld();
  byUpdate.manager.update();

  assert.equal(
    JSON.stringify(byHand.state.population.populations),
    JSON.stringify(byUpdate.state.population.populations),
  );
});

// Accruing income and generating demand LOOK observational, and they stay in
// decide with the buying. Populations sharing a hub buy off the same shelf, so
// hoisting every population's demand ahead of every population's purchases
// would change which of them reaches scarce stock first. This test exists to
// make that "tidy-up" fail loudly.
test("observing does not accrue income, generate demand, or buy anything", () => {
  let clock = 1_000;
  const { state, manager } = createPopulationWorld(() => clock);
  manager.update();

  const before = JSON.stringify(state.population.populations);
  // Far enough forward that income and demand would certainly have moved.
  clock += 600_000;
  manager.observe();

  assert.equal(JSON.stringify(state.population.populations), before,
    "observing touched no population at all");

  manager.decide();
  assert.notEqual(JSON.stringify(state.population.populations), before,
    "deciding is what moves them");
});

// ── Towing ──────────────────────────────────────────────────────────────────

test("towing exposes observe and decide, and update runs both", () => {
  const { manager } = createTowWorld();
  assert.equal(typeof manager.observe, "function");
  assert.equal(typeof manager.decide, "function");
  // Its outcomes land as ledger events other systems observe.
  assert.equal(manager.settle, undefined);
});

// The same shape as SPRC's repair berth: finishing a job returns the vehicle to
// `available`, and that must be known before anything decides what to take
// next. Filing it after the decisions would leave the vehicle held by finished
// work for a whole tick.
test("a finished recovery frees the vehicle during observe", () => {
  let clock = 1_000;
  const { state, manager } = createTowWorld(() => clock);
  const towing = state.towing;

  // A recovery in progress whose clock is about to run out. The wreck itself is
  // absent, which is the failure path — and it still has to free the vehicle,
  // because a vehicle left "recovering" against a job that cannot finish would
  // be stuck forever.
  towing.requests["recovery-under-test"] = {
    id: "recovery-under-test",
    status: "recovering-wreck",
    wreckId: "wreck-that-is-not-there",
    destinationSiteId: "scrap-porch",
    completesAt: clock + 1_000,
    committedPayment: 0,
    fee: 0,
    routeDistance: 100,
    contractId: null,
  };
  towing.vehicle.status = "recovering";

  clock += 2_000;
  manager.observe();

  assert.equal(towing.requests["recovery-under-test"].status, "failed");
  assert.equal(towing.vehicle.status, "available", "the vehicle is free before anybody decides");
});

test("observing twice at the same instant sees the same world", () => {
  const { state, manager } = createTowWorld();
  manager.update();

  const before = JSON.stringify(state.towing.requests);
  manager.observe();
  assert.equal(JSON.stringify(state.towing.requests), before);
});

// ── Placement on the clock ──────────────────────────────────────────────────

test("both systems observe ahead of every decider", () => {
  const population = createPopulationWorld();
  const towing = createTowWorld();
  const ran = [];
  const clock = createWorldClock({ onSystemError: () => {} });

  // Registered after the deciders on purpose: phase must beat registration order.
  clock.register("somebody-else", () => ran.push("other-decide"));
  clock.register("population", () => { ran.push("population-decide"); population.manager.decide(); });
  clock.register("towing", () => { ran.push("towing-decide"); towing.manager.decide(); });
  clock.register("population-observe", () => { ran.push("population-observe"); population.manager.observe(); }, { phase: TICK_PHASE.OBSERVE });
  clock.register("towing-observe", () => { ran.push("towing-observe"); towing.manager.observe(); }, { phase: TICK_PHASE.OBSERVE });

  clock.tick();
  assert.deepEqual(ran, [
    "population-observe", "towing-observe",
    "other-decide", "population-decide", "towing-decide",
  ]);
});
