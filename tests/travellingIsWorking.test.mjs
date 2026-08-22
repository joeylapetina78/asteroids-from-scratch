// A ship flying out to accept an offer is working, not idle.
//
// `trackFleetClocks` decided "the whole fleet is committed" by counting both an
// assignment AND a market visit, then decided each ship's own idle clock by
// counting only the assignment. One function, two answers.
//
// Live consequence: Flint One was stood down "after 413s with nothing to do"
// while it was 26,000 units into a trip to Ore Station One with that order's id
// in its marketVisit. The bias is systematic rather than random — the longer the
// voyage, the more likely the hull is retired before arriving — so it fell
// hardest on the frontier, whose runs are the longest in the world and the whole
// point of the reach work.

import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { CINDER_MINING_SEED } from "../src/content/economy/miningInstitutions.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const clock = { at: 1_000 };
  const game = {
    worldSites: [
      { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
      { id: "ore-station-one", name: "Ore Station One", position: { x: 40000, y: -24000 } },
    ],
    addWorkerShip: () => {},
  };
  const operation = createMiningOperation({ state, game, now: () => clock.at, seed: CINDER_MINING_SEED });
  return { state, clock, operation };
}

const recordFor = (operation, worker) => operation.getState().ships[worker.id];

test("a hull on a market visit never starts an idle clock", () => {
  const { clock, operation } = createWorld();
  const worker = operation.workers[0];

  worker.assignment = null;
  worker.marketVisit = { destinationSiteId: "ore-station-one", offerId: "mine-ore-station-aluminum" };

  for (let tick = 0; tick < 10; tick += 1) {
    clock.at += 60_000;
    worker.marketVisit = { destinationSiteId: "ore-station-one", offerId: "mine-ore-station-aluminum" };
    operation.update();
  }

  assert.equal(recordFor(operation, worker).idleSince, null,
    "ten minutes into a voyage is not ten minutes with nothing to do");
});

test("the same hull does start one once the visit ends", () => {
  const { clock, operation } = createWorld();
  const worker = operation.workers[0];

  worker.assignment = null;
  worker.marketVisit = null;
  clock.at += 60_000;
  operation.update();

  assert.notEqual(recordFor(operation, worker).idleSince, null,
    "genuinely idle ships must still be visible to the fleet planner");
});
