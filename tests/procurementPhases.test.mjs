// Hub procurement's tick, split along the clock's phases.
//
// Every step kept the exact position it held before. The interesting part of
// this split is what stayed put: `fillReservations` and `completeSalesWhenReserved`
// look like settling — they resolve commitments — and they remain in DECIDE,
// because moving them after every decider would change who gets contested stock
// first. That is an economic decision, not a labelling one.

import assert from "node:assert/strict";
import test from "node:test";
import { createHubProcurementOperation } from "../src/systems/hubProcurement.js";
import { createWorldClock, TICK_PHASE } from "../src/systems/worldClock.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

function createWorld(now = () => 1_000) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const manager = createHubProcurementOperation({ state, now });
  return { state, manager };
}

const snapshot = (state) => JSON.stringify({
  orders: state.hubProcurement?.orders ?? null,
  reservations: state.hubProcurement?.reservations ?? null,
});

// ── The phases compose back into the tick they came from ────────────────────

test("all three phases are exposed for the clock", () => {
  const { manager } = createWorld();
  ["observe", "decide", "settle", "update"].forEach((name) => {
    assert.equal(typeof manager[name], "function", `${name} is available`);
  });
});

test("a hand-driven tick and update() reach the same place", () => {
  const byHand = createWorld();
  byHand.manager.observe();
  byHand.manager.decide();
  byHand.manager.settle();

  const byUpdate = createWorld();
  byUpdate.manager.update();

  assert.equal(snapshot(byHand.state), snapshot(byUpdate.state));
});

// ── Settling is reporting, not acting ───────────────────────────────────────

test("settling changes nothing anybody is doing", () => {
  let clock = 1_000;
  const { state, manager } = createWorld(() => clock);
  manager.update();

  const before = snapshot(state);
  clock += 5_000;
  manager.settle();
  manager.settle();

  assert.equal(snapshot(state), before, "settling twice moves nothing");
});

test("settling runs after the rest of the world has decided", () => {
  const { manager } = createWorld();
  const ran = [];
  const clock = createWorldClock({ onSystemError: () => {} });

  clock.register("procurement-observe", () => { ran.push("observe"); manager.observe(); }, { phase: TICK_PHASE.OBSERVE });
  clock.register("procurement", () => { ran.push("decide"); manager.decide(); });
  // A decider registered after procurement, whose choices the report must include.
  clock.register("late-decider", () => ran.push("late-decide"));
  clock.register("procurement-settle", () => { ran.push("settle"); manager.settle(); }, { phase: TICK_PHASE.SETTLE });

  clock.tick();
  assert.deepEqual(ran, ["observe", "decide", "late-decide", "settle"]);
});

// ── What deliberately did NOT move ──────────────────────────────────────────

// Reserving contested stock must stay inside DECIDE. Population consumes hub
// inventory earlier in that same phase and mining delivers ore later in it, so
// reserving before or after those is a claim-ranking decision. This test exists
// to make a later "tidy-up" that moves it into settle fail loudly.
test("reserving and completing sales stay in the decide phase", () => {
  let clock = 1_000;
  const { state, manager } = createWorld(() => clock);
  manager.update();

  const afterFullTick = snapshot(state);

  // The whole tick's work is done by observe + decide. If reserving or
  // completing sales ever moved into settle, this would stop being true.
  const decideOnly = createWorld(() => clock);
  decideOnly.manager.observe();
  decideOnly.manager.decide();

  assert.equal(snapshot(decideOnly.state), afterFullTick,
    "observe + decide already reaches the full tick's position — settle adds nothing");
});

// ── Observing precedes the reading it feeds ─────────────────────────────────

// `pruneDeclinedOrders` must precede `postNeeds`, which consults declined
// orders to decide whether a family was turned down too recently to ask again.
test("observing lands ahead of every decider on a real clock", () => {
  const { manager } = createWorld();
  const ran = [];
  const clock = createWorldClock({ onSystemError: () => {} });

  // Registered after the deciders on purpose: phase must beat registration order.
  clock.register("somebody-else", () => ran.push("other-decide"));
  clock.register("procurement", () => { ran.push("decide"); manager.decide(); });
  clock.register("procurement-observe", () => { ran.push("observe"); manager.observe(); }, { phase: TICK_PHASE.OBSERVE });

  clock.tick();
  assert.deepEqual(ran, ["observe", "other-decide", "decide"]);
});

test("observing twice at the same instant sees the same world", () => {
  const { state, manager } = createWorld();
  manager.update();

  const before = snapshot(state);
  manager.observe();
  assert.equal(snapshot(state), before, "no clock has moved, so nothing has aged out");
});
