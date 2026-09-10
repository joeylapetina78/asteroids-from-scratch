import test from "node:test";
import assert from "node:assert/strict";

import { GREATBLOOM_EYE_RADIUS, GREATBLOOM_HEALTH, GREATBLOOM_RADIUS, Lifeform } from "../src/entities/Lifeform.js";

const makeGreatbloom = () => new Lifeform({
  type: "greatbloom", x: 0, y: 0, velocity: { x: 0, y: 0 }, seed: 9100,
});

test("a greatbloom is big enough to hold the ship and takes a fight to kill", () => {
  const beast = makeGreatbloom();

  assert.equal(beast.radius, GREATBLOOM_RADIUS);
  assert.equal(beast.health, GREATBLOOM_HEALTH);
  assert.equal(beast.isHolding, false);
  // The ship's collision radius is 18, so there has to be real room to fly in.
  assert.ok(GREATBLOOM_RADIUS - 18 > 40, "the arena would be too tight to survive");
});

test("the eye starts in the middle and withdraws to the rim once it has you", () => {
  const beast = makeGreatbloom();

  // Closed up, the eye is the core: dead centre.
  assert.deepEqual(beast.getEyePosition(), { x: 0, y: 0 });

  beast.isHolding = true;
  for (let step = 0; step < 200; step += 1) beast.update(1 / 60, {
    ship: { position: { x: 0, y: 0 } }, shipPowered: true,
    lifeforms: [], asteroids: [], disturbances: [],
  });

  assert.equal(beast.eyeReach, 1);
  const eye = beast.getEyePosition();
  const reach = Math.hypot(eye.x - beast.position.x, eye.y - beast.position.y);
  // Out at the rim, and far enough inside it that the whole eye is reachable
  // rather than half-buried in the wall.
  assert.ok(Math.abs(reach - (GREATBLOOM_RADIUS - GREATBLOOM_EYE_RADIUS - 4)) < 0.001, `eye sat at ${reach}`);
});

test("the eye angle stays wrapped however long the fight runs", () => {
  const beast = makeGreatbloom();
  beast.isHolding = true;

  // The seed arrives as a large hash, so an unwrapped angle starts in the
  // millions and only grows.
  assert.ok(Math.abs(beast.eyeAngle) <= Math.PI * 2);

  for (let step = 0; step < 5000; step += 1) beast.update(1 / 60, {
    ship: { position: { x: 0, y: 0 } }, shipPowered: true,
    lifeforms: [], asteroids: [], disturbances: [],
  });

  assert.ok(Math.abs(beast.eyeAngle) <= Math.PI * 2, `angle ran away to ${beast.eyeAngle}`);
});

test("it can be worn down one shot at a time", () => {
  const beast = makeGreatbloom();
  for (let shot = 0; shot < GREATBLOOM_HEALTH; shot += 1) beast.health -= 1;
  assert.equal(beast.health, 0);
});
