import test from "node:test";
import assert from "node:assert/strict";

import { createBayInertia } from "../src/systems/bayInertia.js";

function accelerate(inertia, velocity, { frames, deltaSeconds = 1 / 60 }) {
  let felt = { x: 0, y: 0 };
  for (let i = 0; i < frames; i += 1) {
    felt = inertia.sample(deltaSeconds);
  }
  return { x: felt.x, y: felt.y };
}

test("a bay feels a shove opposite the ship's acceleration", () => {
  const velocity = { x: 0, y: 0 };
  const inertia = createBayInertia({ getVelocity: () => velocity });

  inertia.sample(1 / 60);
  // Ship accelerates to the right; loose material slides left.
  for (let i = 0; i < 40; i += 1) {
    velocity.x += 95 / 60;
    inertia.sample(1 / 60);
  }

  const felt = inertia.sample(1 / 60);
  assert.ok(felt.x < 0, `expected a leftward shove, got ${felt.x}`);
  assert.equal(Math.round(felt.y), 0);
});

test("the felt force lags rather than snapping to the real one", () => {
  const velocity = { x: 0, y: 0 };
  const inertia = createBayInertia({ getVelocity: () => velocity, scale: 1, catchUpPerSecond: 6 });

  inertia.sample(1 / 60);
  velocity.x += 600 / 60;
  const firstFrame = inertia.sample(1 / 60);

  // A 600 u/s^2 acceleration is felt as far less than 600 on the frame it
  // starts: the bay leans into it over about a sixth of a second.
  assert.ok(Math.abs(firstFrame.x) < 600 * 0.25, `expected a lagged response, got ${firstFrame.x}`);

  for (let i = 0; i < 60; i += 1) {
    velocity.x += 600 / 60;
    inertia.sample(1 / 60);
  }
  const settled = inertia.sample(1 / 60);
  assert.ok(Math.abs(settled.x) > 600 * 0.7, `expected it to catch up, got ${settled.x}`);
});

test("a single-frame collision cannot fire the bay through a wall", () => {
  const velocity = { x: 0, y: 0 };
  const inertia = createBayInertia({ getVelocity: () => velocity, maxAcceleration: 600 });

  inertia.sample(1 / 60);
  // 180 u/s reversed inside one frame is on the order of 20,000 u/s^2 raw.
  velocity.x = -180;
  const felt = accelerate(inertia, velocity, { frames: 30 });

  assert.ok(Math.abs(felt.x) <= 600, `expected the ceiling to hold, got ${felt.x}`);
});

test("the lean is frame-rate independent", () => {
  function run(deltaSeconds) {
    const velocity = { x: 0, y: 0 };
    const inertia = createBayInertia({ getVelocity: () => velocity, scale: 1 });
    inertia.sample(deltaSeconds);
    const steps = Math.round(0.25 / deltaSeconds);
    let felt = 0;
    for (let i = 0; i < steps; i += 1) {
      velocity.x += 300 * deltaSeconds;
      // Read the accelerating frame itself. Sampling once more afterwards
      // measures a frame of relaxation toward zero instead, which really is
      // twice as large at half the frame rate.
      felt = inertia.sample(deltaSeconds).x;
    }
    return felt;
  }

  assert.ok(Math.abs(run(1 / 60) - run(1 / 30)) < 12, "60fps and 30fps should feel the same lean");
});

test("a bay with no ship to feel returns to neutral instead of staying leant", () => {
  let velocity = { x: 0, y: 0 };
  const inertia = createBayInertia({ getVelocity: () => velocity });

  inertia.sample(1 / 60);
  for (let i = 0; i < 30; i += 1) {
    velocity.x += 300 / 60;
    inertia.sample(1 / 60);
  }
  assert.ok(Math.abs(inertia.sample(1 / 60).x) > 1);

  velocity = null;
  const felt = inertia.sample(1 / 60);
  assert.equal(felt.x, 0);
  assert.equal(felt.y, 0);
});
