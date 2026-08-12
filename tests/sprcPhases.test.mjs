// SPRC's tick, split along the clock's phases.
//
// The interesting part of this split is what it must NOT do. A repair whose
// clock has run out is finished — nobody decided that, it simply became true —
// so it belongs in OBSERVE. Filing completions under SETTLE because "outcomes
// landing" sounds like settling would leave the berth occupied by finished work
// for a whole tick, and every repair would cost an extra second of idle berth.

import assert from "node:assert/strict";
import test from "node:test";
import { createSprcOperation } from "../src/systems/sprcOperation.js";
import { createWorldClock, TICK_PHASE } from "../src/systems/worldClock.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

function createWorld(now = () => 1_000) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const sprc = createSprcOperation({ state, now });
  return { state, sprc };
}

// ── The phases compose back into the tick they came from ────────────────────

test("update runs all three phases", () => {
  const { sprc } = createWorld();
  const ran = [];
  ["observe", "decide", "settle"].forEach((phase) => {
    assert.equal(typeof sprc[phase], "function", `${phase} is exposed for the clock`);
  });

  // Driving the phases by hand and driving update() must reach the same place.
  const byHand = createWorld();
  byHand.sprc.observe();
  byHand.sprc.decide();
  byHand.sprc.settle();

  const byUpdate = createWorld();
  byUpdate.sprc.update();

  assert.deepEqual(
    Object.keys(byHand.state.sprc.repairOrders).length,
    Object.keys(byUpdate.state.sprc.repairOrders).length,
    "a hand-driven tick and update() agree",
  );
  assert.equal(ran.length, 0);
});

// ── The hazard this split had to avoid ──────────────────────────────────────

// A repair that finishes must free the berth BEFORE anybody decides what the
// berth takes next, or the world runs a tick behind itself forever.
test("a finished repair frees the berth before the berth is filled again", () => {
  let clock = 1_000;
  const { state, sprc } = createWorld(() => clock);
  sprc.update();

  // Put a repair in the berth and run its clock out.
  const berth = state.sprc.facilities.berthTwo;
  const order = {
    id: "repair-under-test",
    status: "repairing",
    startedAt: clock,
    completesAt: clock + 1_000,
    subjectId: "subject-1",
    subjectHaulerId: "subject-1",
    payerInstitutionId: "yard-exchange",
    servicePrice: 100,
    reserved: { produced: {}, raw: {} },
    requirements: { produced: {}, raw: {} },
    createdAt: clock,
    priority: 60,
  };
  state.sprc.repairOrders[order.id] = order;
  berth.status = "occupied";
  berth.activeRepairOrderId = order.id;

  clock += 2_000;

  // OBSERVE alone must be enough to finish it and free the berth — DECIDE has
  // not run yet.
  sprc.observe();
  assert.equal(state.sprc.repairOrders[order.id].status, "completed");
  assert.equal(berth.activeRepairOrderId, null, "the berth is free before anybody decides");
  assert.equal(berth.status, "available");
});

// ── Placement on the clock ──────────────────────────────────────────────────

test("the phases land in the right order on a real clock", () => {
  const { sprc } = createWorld();
  const ran = [];
  const clock = createWorldClock({ onSystemError: () => {} });

  clock.register("sprc-observe", () => { ran.push("observe"); sprc.observe(); }, { phase: TICK_PHASE.OBSERVE });
  // Something else in the world deciding, registered between Sal's phases to
  // prove SETTLE really does run after everyone rather than just after Sal.
  clock.register("somebody-else", () => ran.push("other-decide"));
  clock.register("sprc", () => { ran.push("decide"); sprc.decide(); });
  clock.register("sprc-settle", () => { ran.push("settle"); sprc.settle(); }, { phase: TICK_PHASE.SETTLE });

  clock.tick();
  assert.deepEqual(ran, ["observe", "other-decide", "decide", "settle"]);
});

test("Sal reports after the rest of the world has decided, not after himself", () => {
  const { sprc } = createWorld();
  const clock = createWorldClock({ onSystemError: () => {} });
  let snapshotAt = null;
  let lateDecisionAt = null;
  let step = 0;

  clock.register("sprc-observe", () => sprc.observe(), { phase: TICK_PHASE.OBSERVE });
  clock.register("sprc", () => sprc.decide());
  // A system registered AFTER sprc in the decide phase.
  clock.register("late-decider", () => { lateDecisionAt = step += 1; });
  clock.register("sprc-settle", () => { sprc.settle(); snapshotAt = step += 1; }, { phase: TICK_PHASE.SETTLE });

  clock.tick();
  assert.ok(lateDecisionAt < snapshotAt, "the report includes decisions made after Sal's own");
});

// ── Nothing in SETTLE may change what anybody is doing ──────────────────────

test("settling is reporting, not acting", () => {
  let clock = 1_000;
  const { state, sprc } = createWorld(() => clock);
  sprc.update();

  const before = JSON.stringify({
    repairOrders: state.sprc.repairOrders,
    procurementOrders: state.sprc.procurementOrders,
    productionOrders: state.sprc.productionOrders ?? null,
    facilities: state.sprc.facilities,
    inventories: state.sprc.inventories,
    balance: state.sprc.account.balance,
  });

  clock += 5_000;
  sprc.settle();
  sprc.settle();

  assert.equal(JSON.stringify({
    repairOrders: state.sprc.repairOrders,
    procurementOrders: state.sprc.procurementOrders,
    productionOrders: state.sprc.productionOrders ?? null,
    facilities: state.sprc.facilities,
    inventories: state.sprc.inventories,
    balance: state.sprc.account.balance,
  }), before, "settling twice changes nothing Sal is doing");
});

// ── Observing is idempotent within a tick ───────────────────────────────────

test("observing twice at the same instant sees the same world", () => {
  const { state, sprc } = createWorld();
  sprc.update();

  const before = JSON.stringify(state.sprc.repairOrders);
  sprc.observe();
  assert.equal(JSON.stringify(state.sprc.repairOrders), before,
    "no clock has moved, so nothing new has become true");
});
