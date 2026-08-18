import test from "node:test";
import assert from "node:assert/strict";

import { Game } from "../src/game.js";

test("economy update keeps freight, worker physics, and pickup motion", () => {
  const calls = [];
  const livingNpc = { isAlive: true };
  const deadNpc = { isAlive: false };
  const livingWorker = { isAlive: true };
  const deadWorker = { isAlive: false };
  const pickup = { update: (step) => calls.push(["pickup", step]) };
  const game = {
    npcShips: [livingNpc, deadNpc],
    workerShips: [livingWorker, deadWorker],
    pickups: [pickup],
    updateNpcShips: (asteroids, step) => calls.push(["freight", asteroids, step]),
    updateWorkerShips: (step) => calls.push(["workers", step]),
  };

  Game.prototype.updateEconomy.call(game, 0.1);

  assert.deepEqual(calls, [
    ["freight", [], 0.1],
    ["workers", 0.1],
    ["pickup", 0.1],
  ]);
  assert.deepEqual(game.npcShips, [livingNpc]);
  assert.deepEqual(game.workerShips, [livingWorker]);
});

test("economy update lets worker collection replace the pickup array before drift", () => {
  const collected = { update: () => assert.fail("a collected pickup must not move") };
  let remainingUpdates = 0;
  const remaining = { update: () => { remainingUpdates += 1; } };
  const game = {
    npcShips: [],
    workerShips: [],
    pickups: [collected, remaining],
    updateNpcShips() {},
    updateWorkerShips() { this.pickups = [remaining]; },
  };

  Game.prototype.updateEconomy.call(game, 1 / 30);

  assert.equal(remainingUpdates, 1);
});
