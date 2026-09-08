import assert from "node:assert/strict";
import test from "node:test";
import { getProcessorConsumptionQuantity } from "../src/systems/processor.js";

// The Processor class itself needs a canvas, so the tunable behaviour is pinned
// by reading the module source. That is deliberately stated rather than hidden:
// a jsdom canvas stub would let the physics pass without ever running.
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/systems/processor.js", import.meta.url), "utf8");

function constantValue(name) {
  const match = source.match(new RegExp(`const ${name} = ([0-9.]+)`));
  return match ? Number(match[1]) : null;
}

test("a burst gets time to be a burst before anything gathers it", () => {
  const settle = constantValue("SCATTER_SETTLE_SECONDS");
  assert.ok(settle !== null, "the settle window exists");
  assert.ok(settle >= 0.5, `fragments are left alone long enough to read as scattered (${settle}s)`);

  // The candidate scan must actually honour it, or the constant is decoration.
  assert.match(source, /\(unit\.settleUntil \?\? 0\) > now/,
    "startCompaction consults the settle window when choosing candidates");
  assert.match(source, /settleUntil: \(this\.elapsed \?\? 0\) \+ SCATTER_SETTLE_SECONDS/,
    "explodeBundle stamps the settle window onto every fragment it scatters");
});

test("the gather is a field that builds, not a snap", () => {
  const duration = constantValue("COMPACTION_DURATION");
  const start = constantValue("COMPACTION_PULL_START");
  const end = constantValue("COMPACTION_PULL_END");

  assert.ok(duration >= 1 && duration <= 4, `it takes a second or three, not a third of one (${duration}s)`);
  assert.ok(start < end, "weak at first, stronger later");
  assert.ok(end / start >= 5, `and meaningfully stronger by the end (x${(end / start).toFixed(1)})`);

  // Acceleration toward the target, not a per-frame lerp of the remaining gap —
  // the old form compounded and was most of the way home before it was visible.
  assert.match(source, /unit\.vx \+= dx \* pull \* deltaSeconds/);
  assert.doesNotMatch(source, /unit\.x \+= \(compaction\.target\.x - unit\.x\) \* easedProgress/);
});

test("consumption quantity is unchanged by the gather rework", () => {
  assert.equal(getProcessorConsumptionQuantity(10, 1, 4), 4);
  assert.equal(getProcessorConsumptionQuantity(10, 1, Infinity), 10);
  assert.equal(getProcessorConsumptionQuantity(0, 1, 5), 0);
});

// Chambers are bays, not hoppers.
//
// With gravity, however much ore you have ends up in a strip along the floor.
// Without it the pile grows into the space it occupies and packs against the
// things sharing that space — the viewport scope bulging in, the module bay
// sliding across. These pin the seams that make that possible; the physics
// itself needs a canvas and is verified in the running game.
test("a chamber can be told to have no gravity, and says so in its options", () => {
  assert.match(source, /this\.gravityScale = options\.gravityScale \?\? 1/);
  assert.match(source, /unit\.vy \+= GRAVITY \* this\.gravityScale \* deltaSeconds/,
    "the scale actually multiplies gravity rather than sitting unused");
  // Without gravity nothing settles on its own, so drifting has to decay.
  assert.match(source, /if \(this\.gravityScale === 0\)/);
  assert.ok(constantValue("DRIFT_DAMPING") < 1, "free-floating material gives up speed");
  assert.ok(constantValue("DRIFT_DAMPING") > 0.9, "but slowly enough that a shove crosses the bay");
});

test("obstacles are re-read every frame, because the furniture moves", () => {
  assert.match(source, /this\.obstacles = this\.getObstacles\(\) \?\? \[\]/);
  // Resolved both in the movement pass and inside the solver, or a unit pinned
  // between another unit and a wall would be pushed back into the wall.
  const resolves = source.match(/this\.resolveObstacles\(unit\)/g) ?? [];
  assert.ok(resolves.length >= 2, `obstacles are resolved in the solver too (found ${resolves.length})`);
});

test("a round scope is treated as an ellipse, not a circle", () => {
  // The two canvas axes scale differently from CSS pixels, so a circle on
  // screen is an ellipse in chamber coordinates. Solving it as a circle would
  // push material along the wrong normal.
  assert.match(source, /pushOutOfEllipse/);
  assert.match(source, /obstacle\.rx \+ half/);
  assert.match(source, /obstacle\.ry \+ half/);
});

test("a burst of arrivals queues in the pipe instead of stacking in its mouth", () => {
  // The slot pattern cycled `units.length % 4`, so more than four units
  // arriving at once spawned on top of each other; the pair solver pushed the
  // overlapping pair apart, cancelled the velocity they came in with, and the
  // whole burst stalled at the mouth. Units are still created immediately —
  // cargo value is summed from the list — but they enter one at a time.
  assert.ok(constantValue("SPAWN_RELEASE_INTERVAL") > 0, "arrivals are spaced in time");
  assert.match(source, /this\.spawnIndex = \(this\.spawnIndex \?\? -1\) \+ 1/,
    "the slot counter is its own, not units.length, which moves as material is consumed");
  assert.match(source, /inPipe: true/, "a new unit starts held");
  // Held units must be outside physics, collision AND compaction, or the queue
  // shoves itself apart before any of it has left.
  assert.match(source, /compactingUnits\?\.has\(unit\) \|\| unit\.inPipe/);
  assert.match(source, /first\.inPipe \|\| second\.inPipe/);
  assert.match(source, /> now \|\| unit\.inPipe/);
});

test("a wall that arrives shoves; a wall that is there merely blocks", () => {
  assert.match(source, /shoveFrom\(obstacle/);
  assert.match(source, /pushOutOfRect/);
});
