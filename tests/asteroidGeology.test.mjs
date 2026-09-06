import assert from "node:assert/strict";
import test from "node:test";
import { breakAsteroid, WHITE_ASTEROID_COLOR } from "../src/entities/Asteroid.js";
import { createAsteroidChunks } from "../src/systems/asteroidField.js";
import { createResourceField } from "../src/systems/resourceField.js";

const FAR_AWAY = { x: 100_000, y: 100_000 };

function createGeologyHarness(overrides = {}) {
  let clock = 1_000;
  const chunks = createAsteroidChunks(
    { width: 1_000 },
    createResourceField(),
    [],
    {
      now: () => clock,
      rubbleReformMs: 100,
      resourceRecoveryMs: 500,
      ...overrides,
    },
  );
  return {
    chunks,
    advance(milliseconds) { clock += milliseconds; },
  };
}

test("rested offscreen fragments coalesce while their surrounding chunk remains loaded", () => {
  const { chunks, advance } = createGeologyHarness({ geologyReviewIntervalMs: 0 });
  const initial = chunks.update(0, 0).added;
  const parent = initial.find((asteroid) => asteroid.tier > 1 && Math.hypot(asteroid.position.x, asteroid.position.y) > 2_200);
  assert.ok(parent);
  const sourceId = parent.geologySourceId;
  const fragments = breakAsteroid(parent, 83);
  chunks.recordBreak(parent, fragments);

  advance(100);
  const settled = chunks.update(0, 0);
  fragments.forEach((fragment) => assert.ok(settled.removedSet.has(fragment)));
  assert.equal(settled.added.some((asteroid) => asteroid.geologySourceId === sourceId), true);
});

test("broken descendants remain owned by their chunk and unload with it", () => {
  const { chunks } = createGeologyHarness();
  const initial = chunks.update(0, 0).added;
  const parent = initial.find((asteroid) => asteroid.tier > 1);
  assert.ok(parent?.chunkKey);
  assert.ok(parent?.geologySourceId);

  const fragments = breakAsteroid(parent, 77);
  assert.ok(fragments.length > 1);
  assert.equal(chunks.recordBreak(parent, fragments), true);
  assert.ok(fragments.every((fragment) => fragment.chunkKey === parent.chunkKey));
  assert.ok(fragments.every((fragment) => fragment.geologySourceId === parent.geologySourceId));

  const unloaded = chunks.update(FAR_AWAY.x, FAR_AWAY.y);
  fragments.forEach((fragment) => assert.ok(unloaded.removedSet.has(fragment)));
});

test("unmined rubble reforms only after its locality has rested", () => {
  const { chunks, advance } = createGeologyHarness();
  const initial = chunks.update(0, 0).added;
  const parent = initial.find((asteroid) => asteroid.tier > 1);
  const sourceId = parent.geologySourceId;
  chunks.recordBreak(parent, breakAsteroid(parent, 91));

  chunks.update(FAR_AWAY.x, FAR_AWAY.y);
  advance(99);
  const earlyReturn = chunks.update(0, 0);
  assert.equal(earlyReturn.added.some((asteroid) => asteroid.geologySourceId === sourceId), false);

  chunks.update(FAR_AWAY.x, FAR_AWAY.y);
  advance(1);
  const settledReturn = chunks.update(0, 0);
  assert.equal(settledReturn.added.some((asteroid) => asteroid.geologySourceId === sourceId), true);
});

test("extracted ore stays depleted longer than ordinary rubble", () => {
  const { chunks, advance } = createGeologyHarness();
  const initial = chunks.update(0, 0).added;
  const resourceRock = initial.find((asteroid) => asteroid.color !== WHITE_ASTEROID_COLOR);
  assert.ok(resourceRock);
  const sourceId = resourceRock.geologySourceId;

  chunks.recordBreak(resourceRock, [], { resourceExtracted: true });
  chunks.update(FAR_AWAY.x, FAR_AWAY.y);
  advance(499);
  const depletedReturn = chunks.update(0, 0);
  assert.equal(depletedReturn.added.some((asteroid) => asteroid.geologySourceId === sourceId), false);

  chunks.update(FAR_AWAY.x, FAR_AWAY.y);
  advance(1);
  const recoveredReturn = chunks.update(0, 0);
  assert.equal(recoveredReturn.added.some((asteroid) => asteroid.geologySourceId === sourceId), true);
  assert.equal(chunks.getGeologySnapshot().depletedSources, 0);
});

test("a distant worker retains only its immediate asteroid neighbourhood", () => {
  const { chunks } = createGeologyHarness();

  chunks.update(0, 0, [FAR_AWAY]);

  // Player: 7x7 chunks. Distant worker: 3x3 chunks. They do not overlap.
  assert.equal(chunks.getGeologySnapshot().loadedChunks, 58);
});
