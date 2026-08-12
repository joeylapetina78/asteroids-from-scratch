// Mining's tick, split along the clock's phases.
//
// Mining is the one system with TWO operations sharing a clock slot, so the
// property that matters here is that both companies read the world before
// either acts on it — neither is looking at a board the other has changed.

import assert from "node:assert/strict";
import test from "node:test";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { getMiningOrderBook } from "../src/systems/miningOrderBook.js";
import { createWorldClock, TICK_PHASE } from "../src/systems/worldClock.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { CINDER_MINING_SEED, FLINT_MINING_SEED } from "../src/content/economy/miningInstitutions.js";

const GAME = {
  worldSites: [
    { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
    { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
    { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
    { id: "blue-lantern", name: "Blue Lantern", position: { x: 2950, y: 2180 } },
    { id: "morrow-shoal", name: "Morrow Shoal", position: { x: -3820, y: 2320 } },
  ],
  addWorkerShip: () => {},
};

// Empty shelves, so the hubs keep asking for material for the whole test.
function createWorld(now = () => 1_000) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (!institution.inventories) return;
    Object.keys(institution.inventories).forEach((resourceId) => { institution.inventories[resourceId] = 0; });
  });
  const cinder = createMiningOperation({ state, game: GAME, now, seed: CINDER_MINING_SEED });
  const flint = createMiningOperation({ state, game: GAME, now, seed: FLINT_MINING_SEED });
  return { state, cinder, flint };
}

// ── The phases compose back into the tick they came from ────────────────────

test("observe and decide are exposed, and update runs both", () => {
  const { cinder } = createWorld();
  assert.equal(typeof cinder.observe, "function");
  assert.equal(typeof cinder.decide, "function");
  // Dispatch is recorded as it happens; the fleet diagnostic is published
  // inside decide against the pre-dispatch fleet.
  assert.equal(cinder.settle, undefined);
});

test("a hand-driven tick and update() reach the same place", () => {
  const byHand = createWorld();
  byHand.cinder.observe();
  byHand.cinder.decide();

  const byUpdate = createWorld();
  byUpdate.cinder.update();

  assert.equal(
    JSON.stringify(byHand.state.miningOperations["cinder-contracting"].allocations),
    JSON.stringify(byUpdate.state.miningOperations["cinder-contracting"].allocations),
  );
});

// ── The phases do not overlap ───────────────────────────────────────────────

test("observing fills the order book and commits nobody", () => {
  const { state, cinder } = createWorld();
  const operation = state.miningOperations["cinder-contracting"];

  // Clear what construction left behind, and free every worker.
  Object.keys(getMiningOrderBook(state)).forEach((id) => { delete getMiningOrderBook(state)[id]; });
  Object.keys(operation.allocations).forEach((id) => { delete operation.allocations[id]; });
  cinder.workers.forEach((worker) => { worker.assignment = null; worker.marketVisit = null; });

  cinder.observe();
  assert.ok(Object.keys(getMiningOrderBook(state)).length > 0, "the board was read");
  assert.equal(Object.keys(operation.allocations).length, 0, "and nobody was committed to anything");

  cinder.decide();
  assert.ok(Object.keys(operation.allocations).length > 0, "deciding is what commits ships");
});

test("observing twice at the same instant sees the same world", () => {
  const { state, cinder } = createWorld();
  cinder.update();

  const before = JSON.stringify(state.miningOperations["cinder-contracting"].allocations);
  cinder.observe();
  assert.equal(JSON.stringify(state.miningOperations["cinder-contracting"].allocations), before,
    "no clock has moved, so nothing new has become true");
});

// ── Two companies, one slot ─────────────────────────────────────────────────

// The reason mining is worth splitting at all: both read the world before
// either acts, so neither is looking at a board the other has already changed.
test("both companies observe before either decides", () => {
  const { cinder, flint } = createWorld();
  const ran = [];
  const clock = createWorldClock({ onSystemError: () => {} });

  clock.register("mining", () => { ran.push("cinder-decide"); cinder.decide(); ran.push("flint-decide"); flint.decide(); });
  clock.register("mining-observe", () => {
    ran.push("cinder-observe"); cinder.observe();
    ran.push("flint-observe"); flint.observe();
  }, { phase: TICK_PHASE.OBSERVE });

  clock.tick();
  assert.deepEqual(ran, ["cinder-observe", "flint-observe", "cinder-decide", "flint-decide"]);
});

// Which company decides first must not decide who gets the work — that is
// settled inside the shared clearing, and it was the whole point of building
// `extractionMarket`. Splitting the tick must not quietly reintroduce it.
test("which company decides first does not decide who wins", () => {
  const forward = createWorld();
  forward.cinder.observe();
  forward.flint.observe();
  forward.cinder.decide();
  forward.flint.decide();

  const backward = createWorld();
  backward.cinder.observe();
  backward.flint.observe();
  backward.flint.decide();
  backward.cinder.decide();

  const claimed = (world) => Object.values(world.state.miningOperations)
    .flatMap((operation) => Object.values(operation.allocations ?? {}))
    .filter((allocation) => allocation.status === "active")
    .map((allocation) => `${allocation.supplierInstitutionId}:${allocation.orderId}`)
    .sort();

  assert.deepEqual(claimed(forward), claimed(backward),
    "the same company wins the same order either way round");
});

test("two companies never double-book the same order", () => {
  const { state, cinder, flint } = createWorld();
  cinder.observe();
  flint.observe();
  cinder.decide();
  flint.decide();

  const active = Object.values(state.miningOperations)
    .flatMap((operation) => Object.values(operation.allocations ?? {}))
    .filter((allocation) => allocation.status === "active");

  assert.equal(new Set(active.map((allocation) => allocation.orderId)).size, active.length);
});
