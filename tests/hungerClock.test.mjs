// How long a hub has gone unanswered, and why it cannot be read off the order.
//
// `chaseMultiple` climbs with time unserved. The first version read that time
// from `order.at` — but the order book is REBUILT on every read, so `at` is
// always the moment of the read. Live, every reprice recorded
// `secondsUnserved: 0`, and a starving hub could never improve on its opening
// offer. Every test that shipped with the curve passed, because they all called
// `chaseMultiple` directly with an elapsed time they supplied themselves.
//
// The durable place is `state.miningOrderRates[order.id]`, which already
// survives the rebuild — it is why a raised price survives it too.
//
// WHAT THIS FILE DOES NOT COVER. The climb itself needs a hub whose orders are
// refused by every miner for minutes on end, which is a fact about distance and
// wear, not something this harness can manufacture: force a shortage here and
// the first raise makes the order acceptable, so repricing correctly stops
// after one round. Verifying the climb needs the running game. See the frontier
// notes in docs/HANDOFF.md.

import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { getPostedMiningOrders } from "../src/systems/miningOperation.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  return state;
}

test("the order book cannot be asked how long a hub has been waiting", () => {
  const state = createWorld();
  const first = getPostedMiningOrders(state, 5_000);
  const later = getPostedMiningOrders(state, 900_000);

  const id = Object.keys(first)[0];
  assert.ok(id, "a hub is asking for something");
  assert.equal(first[id].at, 5_000);
  assert.equal(later[id].at, 900_000,
    "`at` is whenever you looked — reading hunger from it always measures zero");
});

test("what a hub is owed is remembered somewhere the rebuild cannot reach", () => {
  const state = createWorld();
  const id = Object.keys(getPostedMiningOrders(state, 5_000))[0];

  // Standing in for a raise the reprice path has already made.
  state.miningOrderRates = { [id]: { rate: 999, repricedAt: 5_000, unservedSince: 5_000 } };

  const rebuilt = getPostedMiningOrders(state, 900_000);
  assert.equal(state.miningOrderRates[id].unservedSince, 5_000,
    "the clock outlives the order object it describes");
  assert.ok(rebuilt[id].paymentPerUnit >= 999 || rebuilt[id].withheld,
    "and so does the price it produced, unless the hub can no longer fund it");
});
