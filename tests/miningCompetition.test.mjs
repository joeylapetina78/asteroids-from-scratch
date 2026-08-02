import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { CINDER_MINING_SEED, FLINT_MINING_SEED } from "../src/content/economy/miningInstitutions.js";
import { findActorRecord } from "../src/systems/actorConfig.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (institution.inventories) Object.keys(institution.inventories).forEach((resourceId) => { institution.inventories[resourceId] = 0; });
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

test("a second mining institution enters the same extraction market from data", () => {
  const { state, game } = createWorld();
  const cinder = createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const flint = createMiningOperation({ state, game, now: () => 1_000, seed: FLINT_MINING_SEED });

  assert.equal(Object.keys(state.miningOperations).length, 2);
  assert.equal(flint.getState().institution.id, "miner:flint-prospecting");
  assert.equal(findActorRecord(state, "person:rhea-flint")?.name, "Rhea Flint");
  assert.notEqual(flint.workers[0].palette.hullStroke, cinder.workers[0].palette.hullStroke,
    "the competing fleets are visually distinct from their data");
  assert.ok(flint.workers.some((worker) => worker.assignment), "Flint wins at least one live order");

  const allocations = [...Object.values(cinder.getState().allocations), ...Object.values(flint.getState().allocations)]
    .filter((allocation) => allocation.status === "active");
  assert.equal(new Set(allocations.map((allocation) => allocation.orderId)).size, allocations.length,
    "the companies compete for shared work instead of double-booking it");
});

test("the competing fleets start with distinct, meaningful maintenance histories", () => {
  const { state, game } = createWorld();
  const cinder = createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const flint = createMiningOperation({ state, game, now: () => 1_000, seed: FLINT_MINING_SEED });
  const wear = [...Object.values(cinder.getState().ships), ...Object.values(flint.getState().ships)].map((ship) => ship.wear);
  assert.ok(Math.max(...wear) >= 0.6, "one veteran craft is already nearing service");
  assert.ok(new Set(wear).size >= 4, "the fleets do not begin on a synchronized maintenance clock");
  assert.ok(wear.every((value) => value < 1), "none begins already failed");
});

test("an unknown mining craft withdraws for public repair after critical incursion damage", () => {
  const { state, game } = createWorld();
  const mining = createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const worker = mining.worker;
  const record = mining.getState().ships[worker.id];
  worker.hull = 50;

  state.ledger.recordEvent("incursion.npcHit", {
    npcId: worker.id, npcName: worker.name, npcType: "mining-worker", damage: 10, hullAfter: 50,
  }, { visible: false });
  mining.update();

  assert.equal(record.pendingIssue, "structural-fatigue");
  assert.equal(record.maintenanceStatus, "returning-for-service");
  assert.equal(worker.miningDisabled, true);
  assert.ok(state.ledger.getRecentEvents(20).some((event) =>
    event.type === "mining.maintenanceRequired" && event.payload.cause === "combat-damage"));
});
