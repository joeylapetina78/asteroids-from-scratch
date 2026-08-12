// Logistics' tick, split along the clock's phases.
//
// Every step kept the exact position it held before — the split only states the
// structure that was already there. What these tests guard is that the two
// phases stay SEPARATE: observing must not decide anything, and deciding must
// not be where the world's news gets read.

import assert from "node:assert/strict";
import test from "node:test";
import { createInitialLogisticsState, createLogisticsManager } from "../src/systems/logistics.js";
import { createWorldClock, TICK_PHASE } from "../src/systems/worldClock.js";
import { createGameState } from "../src/state/gameState.js";

function createWorld(now = () => 1_000) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const manager = createLogisticsManager({ state, ships: [], now });
  return { state, manager };
}

// ── The phases compose back into the tick they came from ────────────────────

test("observe and decide are exposed for the clock", () => {
  const { manager } = createWorld();
  assert.equal(typeof manager.observe, "function");
  assert.equal(typeof manager.decide, "function");
  assert.equal(typeof manager.update, "function");
});

// A delivery lands as an `npc.routeCompleted` event raised by ship movement in
// the game loop, so logistics learns about arrivals by OBSERVING them like any
// other outside fact. There is nothing for it to settle, and an empty settle
// step would be a label with nothing behind it.
test("logistics has no settle phase, deliberately", () => {
  const { manager } = createWorld();
  assert.equal(manager.settle, undefined);
});

test("a hand-driven tick and update() reach the same place", () => {
  const byHand = createWorld();
  byHand.manager.observe();
  byHand.manager.decide();

  const byUpdate = createWorld();
  byUpdate.manager.update();

  assert.equal(
    JSON.stringify(byHand.state.logistics.shipments),
    JSON.stringify(byUpdate.state.logistics.shipments),
  );
  assert.equal(byHand.state.logistics.lastLedgerEventId, byUpdate.state.logistics.lastLedgerEventId);
});

// ── The phases do not overlap ───────────────────────────────────────────────

// Reading the world's news is observing. If deciding also drained the ledger,
// the phase boundary would be decorative.
test("observing drains the ledger and deciding does not", () => {
  const { state, manager } = createWorld();
  state.ledger.recordEvent("npc.wearIssue", { npcId: "nobody", issueType: "test" }, { visible: false });
  const pending = state.logistics.lastLedgerEventId;

  manager.decide();
  assert.equal(state.logistics.lastLedgerEventId, pending, "deciding read no news");

  manager.observe();
  assert.ok(state.logistics.lastLedgerEventId > pending, "observing did");
});

test("observing twice at the same instant sees the same world", () => {
  const { state, manager } = createWorld();
  manager.update();

  const before = JSON.stringify({
    shipments: state.logistics.shipments,
    lastLedgerEventId: state.logistics.lastLedgerEventId,
  });
  manager.observe();

  assert.equal(JSON.stringify({
    shipments: state.logistics.shipments,
    lastLedgerEventId: state.logistics.lastLedgerEventId,
  }), before, "no clock has moved, so nothing new has become true");
});

// Pruning stays ahead of the event drain, as it always has: a shipment
// delivered this tick must survive to be consumed. Trimming after the drain
// would let a just-finished run be discarded before anything read it.
test("a delivered shipment survives the tick it was delivered in", () => {
  let clock = 1_000;
  const { state, manager } = createWorld(() => clock);
  const logistics = state.logistics;

  // Well past the retention ceiling, so pruning is definitely active.
  for (let index = 0; index < 420; index += 1) {
    logistics.shipments[`old-${index}`] = {
      id: `old-${index}`, status: "delivered", containerId: `container-${index}`,
      createdAt: clock - 10_000, deliveredAt: clock - 10_000 + index,
    };
  }
  clock += 1_000;
  logistics.shipments["just-delivered"] = {
    id: "just-delivered", status: "delivered", containerId: "container-fresh",
    createdAt: clock - 10, deliveredAt: clock,
  };

  manager.observe();

  assert.ok(logistics.shipments["just-delivered"], "the newest delivery is still there to be read");
  assert.ok(Object.keys(logistics.shipments).length < 421, "and the old ones were trimmed");
});

// ── Placement on the clock ──────────────────────────────────────────────────

test("observing lands ahead of every decider on a real clock", () => {
  const { manager } = createWorld();
  const ran = [];
  const clock = createWorldClock({ onSystemError: () => {} });

  // Registered AFTER the deciders on purpose: phase must win over registration
  // order, or a system's news would arrive after somebody had already acted.
  clock.register("somebody-else", () => ran.push("other-decide"));
  clock.register("logistics", () => { ran.push("decide"); manager.decide(); });
  clock.register("logistics-observe", () => { ran.push("observe"); manager.observe(); }, { phase: TICK_PHASE.OBSERVE });

  clock.tick();
  assert.deepEqual(ran, ["observe", "other-decide", "decide"]);
});
