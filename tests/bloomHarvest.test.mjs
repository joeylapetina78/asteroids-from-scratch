import test from "node:test";
import assert from "node:assert/strict";

import { BLOOM_HARVEST_ODDS, BLOOM_HARVEST_RESOURCE, rollBloomHarvest } from "../src/systems/lifeField.js";
import { getResourceDefinition } from "../src/systems/resourceDefinitions.js";

test("a bloom usually gives up exactly one crystal", () => {
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  // Deterministic sweep across the whole probability space rather than a
  // sample, so this cannot fail intermittently.
  for (let step = 0; step < 10000; step += 1) {
    counts[rollBloomHarvest(() => step / 10000)] += 1;
  }

  assert.ok(counts[1] > counts[0] + counts[2] + counts[3], "one should be the common case");
  assert.ok(counts[3] > 0 && counts[3] < counts[2], "three should be rare but reachable");
  assert.ok(counts[0] > 0, "coming away with nothing has to be possible");
});

test("the odds are a well-formed table", () => {
  const total = BLOOM_HARVEST_ODDS.reduce((sum, outcome) => sum + outcome.weight, 0);
  assert.equal(total, 100);
  assert.deepEqual(BLOOM_HARVEST_ODDS.map((outcome) => outcome.crystals), [0, 1, 2, 3]);
  BLOOM_HARVEST_ODDS.forEach((outcome) => assert.ok(outcome.weight > 0));
});

test("the boundaries of the roll stay inside the table", () => {
  assert.equal(rollBloomHarvest(() => 0), 0);
  assert.equal(rollBloomHarvest(() => 0.999999), 3);
  // A generator that returns exactly 1 must not fall through to undefined.
  assert.equal(rollBloomHarvest(() => 1), 3);
});

test("what a bloom drops is a real material", () => {
  const definition = getResourceDefinition(BLOOM_HARVEST_RESOURCE);
  assert.ok(definition, `${BLOOM_HARVEST_RESOURCE} is not a known resource`);
  assert.equal(definition.family, "strange");
});
