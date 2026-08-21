import assert from "node:assert/strict";
import test from "node:test";

import { hasNearbyObstacle, steerAroundObstacles } from "../src/systems/obstacleNavigation.js";
import { MiningWorkerShip } from "../src/entities/MiningWorkerShip.js";
import { SHIP_DRIVES } from "../src/systems/shipDrives.js";

// One law, stated once:
//
//   A craft is either in NORMAL SPACE, where it must work around what is in the
//   way, or in SUBSPACE, where there is nothing to work around. Nothing is half
//   of each.
//
// Before this, the answer depended on which entity happened to get collision
// code: haulers steered around rocks they could not have hit, miners and patrols
// flew straight through them, and a tow truck's cable collided while the hull it
// was attached to did not.

test("a rock in the way pushes a normal-space craft off its heading", () => {
  const craft = { position: { x: 0, y: 0 }, velocity: { x: 100, y: 0 }, radius: 20 };
  const clear = steerAroundObstacles(craft, []);
  assert.deepEqual(clear, { x: 0, y: 0 }, "empty space steers nothing");

  const blocked = steerAroundObstacles(craft, [{ position: { x: 160, y: 0 }, radius: 120 }]);
  assert.ok(Math.hypot(blocked.x, blocked.y) > 0, "a rock ahead produces a steering force");
});

test("the rock a craft was sent to is not an obstacle", () => {
  const craft = { position: { x: 0, y: 0 }, velocity: { x: 100, y: 0 }, radius: 20 };
  const target = { position: { x: 160, y: 0 }, radius: 120 };
  const pushed = steerAroundObstacles(craft, [target]);
  const exempted = steerAroundObstacles(craft, [target], { exempt: target });

  assert.ok(Math.hypot(pushed.x, pushed.y) > 0);
  assert.deepEqual(exempted, { x: 0, y: 0 },
    "a miner must be able to close on the rock it is cutting");
});

test("a craft passes an obstacle on a consistent side", () => {
  // Dithering left and right against the same rock looks worse than ghosting.
  const craft = { position: { x: 0, y: 0 }, velocity: { x: 100, y: 0 }, radius: 20 };
  const rock = [{ position: { x: 150, y: 0 }, radius: 110 }];
  const left = steerAroundObstacles(craft, rock, { side: 1 });
  const right = steerAroundObstacles(craft, rock, { side: -1 });
  assert.ok(Math.sign(left.y) !== Math.sign(right.y) || left.y === 0,
    "the pass side decides which way it goes around");
});

test("a miner routes around a rock that is not its target", () => {
  const miner = new MiningWorkerShip({ id: "miner-1", name: "Miner", x: 0, y: 0, angle: 0 });
  const blocker = { position: { x: 700, y: 0 }, radius: 260 };
  const destination = { x: 2_400, y: 0 };

  let closest = Infinity;
  for (let tick = 0; tick < 600; tick += 1) {
    miner.flyTo(1 / 30, destination, 60, null, [blocker]);
    closest = Math.min(closest, Math.hypot(miner.position.x - blocker.position.x, miner.position.y - blocker.position.y));
    if (miner.position.x > destination.x - 100) break;
  }
  assert.ok(closest > blocker.radius,
    `the miner never flew through the rock (closest approach ${Math.round(closest)} vs radius ${blocker.radius})`);
  assert.ok(Math.abs(miner.position.y) > 1,
    "it went around rather than straight through");
});

test("a miner still reaches the rock it was sent to cut", () => {
  const miner = new MiningWorkerShip({ id: "miner-2", name: "Miner", x: 0, y: 0, angle: 0 });
  const target = { position: { x: 1_400, y: 0 }, radius: 260 };

  for (let tick = 0; tick < 900; tick += 1) {
    miner.flyTo(1 / 30, target.position, 200, null, [target], target);
  }
  const reached = Math.hypot(miner.position.x - target.position.x, miner.position.y - target.position.y);
  assert.ok(reached < 400,
    `exempting the target lets the miner close on it (ended ${Math.round(reached)} away)`);
});

test("the two sides of the law are declared, not implied", () => {
  assert.equal(SHIP_DRIVES["normal-space"].phasesThroughObstacles, false);
  assert.equal(SHIP_DRIVES.subspace.phasesThroughObstacles, true);
});

test("nearby-obstacle check is a cheap pre-filter, not a second opinion", () => {
  const craft = { position: { x: 0, y: 0 }, velocity: { x: 1, y: 0 }, radius: 20 };
  assert.equal(hasNearbyObstacle(craft, []), false);
  assert.equal(hasNearbyObstacle(craft, [{ position: { x: 10_000, y: 0 }, radius: 50 }]), false);
  assert.equal(hasNearbyObstacle(craft, [{ position: { x: 200, y: 0 }, radius: 50 }]), true);
});
