// One order book for the world.
//
// What the hubs are asking to have dug up was stored once per mining company —
// each operation derived it and kept its own `postedOrders`. Two outside
// readers then took CINDER's private copy to be the world's: `contractBoard`
// rendered the public job board from it, and `hubInventory` searched every
// operation's copy for whichever happened to hold an order. A fact one company
// could see and another could not was quietly authoritative for everybody.

import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureMiningOrderBook,
  getMiningOrderBook,
  getPostedMiningOrder,
  setMiningOrderBook,
} from "../src/systems/miningOrderBook.js";
import { createMiningOperation, refreshMiningOrderBook } from "../src/systems/miningOperation.js";
import { listContracts } from "../src/systems/contractBoard.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { CINDER_MINING_SEED, FLINT_MINING_SEED } from "../src/content/economy/miningInstitutions.js";

// Empty shelves everywhere, so the hubs keep asking for material for the whole
// test. Left stocked, the board legitimately empties as soon as the first
// company's workers are dispatched — their in-flight allocations count as
// incoming and close the gap — which is correct behaviour but makes a poor
// fixture for testing the book itself.
function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (!institution.inventories) return;
    Object.keys(institution.inventories).forEach((resourceId) => { institution.inventories[resourceId] = 0; });
  });
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
  return { state, game };
}

// ── One book ────────────────────────────────────────────────────────────────

test("both companies read the same board, not a copy each", () => {
  const { state, game } = createWorld();
  const cinder = createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const flint = createMiningOperation({ state, game, now: () => 1_000, seed: FLINT_MINING_SEED });

  cinder.update();
  flint.update();

  // The thing that used to be impossible: neither operation carries a private
  // board any more, so there is nothing for the two of them to disagree about.
  assert.equal(cinder.getState().postedOrders, undefined);
  assert.equal(flint.getState().postedOrders, undefined);
  assert.ok(Object.keys(getMiningOrderBook(state)).length > 0, "and the world has one");
});

test("a change to the board is seen by every reader at once", () => {
  const { state, game } = createWorld();
  createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  refreshMiningOrderBook(state, 1_000);

  const book = getMiningOrderBook(state);
  const orderId = Object.keys(book)[0];
  assert.ok(orderId, "the fixture world posts something");

  book[orderId].withheld = "buyer-cannot-fund";
  book[orderId].amount = 0;

  const entry = listContracts(state).find((contract) => contract.id === orderId);
  assert.equal(entry.state, "blocked", "the public job board sees it immediately");
  assert.match(entry.note, /buyer-cannot-fund/);
});

// The reason the book is mutated in place rather than swapped: a reader holding
// the orders object must keep seeing the truth, not a snapshot that went stale.
test("refreshing keeps the same object so held references stay live", () => {
  const { state, game } = createWorld();
  createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });

  const held = getMiningOrderBook(state);
  refreshMiningOrderBook(state, 2_000);
  assert.equal(held, getMiningOrderBook(state), "same object across a refresh");
  assert.equal(ensureMiningOrderBook(state).at, 2_000, "and it records when it was taken");
});

test("an order that stops being posted leaves the book", () => {
  const state = createGameState();
  setMiningOrderBook(state, { "order-a": { id: "order-a" }, "order-b": { id: "order-b" } }, 1_000);
  assert.deepEqual(Object.keys(getMiningOrderBook(state)).sort(), ["order-a", "order-b"]);

  setMiningOrderBook(state, { "order-b": { id: "order-b" } }, 2_000);
  assert.deepEqual(Object.keys(getMiningOrderBook(state)), ["order-b"]);
  assert.equal(getPostedMiningOrder(state, "order-a"), null);
});

test("an empty world has an empty book rather than no book", () => {
  const state = createGameState();
  assert.deepEqual(getMiningOrderBook(state), {});
  assert.equal(getPostedMiningOrder(state, "anything"), null);
  assert.equal(ensureMiningOrderBook(state).at, null);
});

// ── The observe step ────────────────────────────────────────────────────────

// The clock runs this once for everybody in OBSERVE, before any company
// decides. But a bare `update()` — which every other test in the suite does —
// must still be a complete, self-contained tick.
test("an operation updating alone still fills the book", () => {
  const { state, game } = createWorld();
  const cinder = createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });

  // Wipe what construction observed, so the refill is unambiguously update()'s.
  Object.keys(getMiningOrderBook(state)).forEach((orderId) => { delete getMiningOrderBook(state)[orderId]; });
  assert.equal(Object.keys(getMiningOrderBook(state)).length, 0);

  cinder.update();
  assert.ok(Object.keys(getMiningOrderBook(state)).length > 0, "update() observes for itself");
});

test("a company arriving later inherits the board rather than building its own", () => {
  const { state, game } = createWorld();
  createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const board = getMiningOrderBook(state);

  const flint = createMiningOperation({ state, game, now: () => 1_000, seed: FLINT_MINING_SEED });

  assert.equal(getMiningOrderBook(state), board, "still the one board");
  assert.equal(flint.getState().postedOrders, undefined, "and the newcomer brought no copy of its own");
  assert.ok(flint.workers.length > 0);
});
