import test from "node:test";
import assert from "node:assert/strict";

import {
  GREATBLOOM_DEEP_RADIUS,
  GREATBLOOM_EYE_RADIUS,
  GREATBLOOM_HEALTH,
  GREATBLOOM_LUNGE_RANGE,
  GREATBLOOM_LUNGE_SECONDS,
  GREATBLOOM_RADIUS,
  GREATBLOOM_SINK_SECONDS,
} from "../src/entities/Lifeform.js";
import { BLOOM_KILLS_PER_GREATBLOOM, createSurfacingGreatbloom } from "../src/systems/lifeField.js";

// A ship at the centre of a 1440x900 view: the camera puts world (0,0) mid-screen.
const VIEW = { width: 1440, height: 900 };
const CAMERA = { x: -720, y: -450 };

const summon = (overrides = {}) => createSurfacingGreatbloom({
  ship: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0 },
  asteroids: [], camera: CAMERA, view: VIEW, random: () => 0.5, seed: 1, ...overrides,
});

const run = (beast, ship, seconds, { powered = true } = {}) => {
  const steps = Math.round(seconds * 60);
  for (let step = 0; step < steps; step += 1) {
    beast.update(1 / 60, { ship, shipPowered: powered, lifeforms: [], asteroids: [], disturbances: [] });
  }
};

const still = (x, y) => ({ position: { x, y }, velocity: { x: 0, y: 0 }, angle: 0 });

test("a greatbloom is big enough to hold the ship and takes a fight to kill", () => {
  const beast = summon();
  assert.equal(beast.health, GREATBLOOM_HEALTH);
  assert.equal(beast.isHolding, false);
  // The ship's collision radius is 18, so there has to be real room to fly in.
  assert.ok(GREATBLOOM_RADIUS - 18 > 40, "the arena would be too tight to survive");
});

test("it comes up small, on screen, and close enough to watch", () => {
  const beast = summon({ seed: 10 });
  assert.equal(beast.isSurfaced, false);
  assert.equal(beast.surfaceProgress, 0);
  assert.equal(beast.radius, GREATBLOOM_DEEP_RADIUS);

  const reach = Math.hypot(beast.position.x, beast.position.y);
  assert.ok(reach > 140, "surfaced right on top of the player: " + reach);
  assert.ok(reach < 450, "surfaced too far to watch: " + reach);
});

test("it comes up out from under a rock the player can see", () => {
  const beast = summon({ asteroids: [{ position: { x: 300, y: 0 } }], seed: 3 });
  assert.equal(beast.cameFromRock, true);
  assert.deepEqual(beast.position, { x: 300, y: 0 });
});

// The approach IS the warning. A rock off the edge of the screen would hide it.
test("a rock off the edge of the screen is not used", () => {
  const beast = summon({ asteroids: [{ position: { x: 4000, y: 0 } }], seed: 4 });
  assert.equal(beast.cameFromRock, false);
});

// "Stay small till it's right behind me, then get big and get me all at once."
test("it stays small the whole way in", () => {
  const beast = summon({ seed: 12 });
  const ship = still(0, 0);
  const samples = [];

  for (let step = 0; step < 40; step += 1) {
    // Held out at arm's length, well beyond the range where it commits.
    beast.position = { x: GREATBLOOM_LUNGE_RANGE * 3, y: 0 };
    run(beast, ship, 0.1);
    samples.push(beast.radius);
  }

  assert.ok(
    Math.max(...samples) < GREATBLOOM_RADIUS * 0.5,
    "swelled to " + Math.max(...samples) + " while still far off",
  );
  assert.equal(beast.isSurfaced, false);
});

test("tucked in behind you it comes up all at once", () => {
  const beast = summon({ seed: 13 });
  beast.position = { x: GREATBLOOM_LUNGE_RANGE - 20, y: 0 };

  run(beast, still(0, 0), GREATBLOOM_LUNGE_SECONDS + 0.4);

  assert.equal(beast.isSurfaced, true);
  assert.equal(beast.radius, GREATBLOOM_RADIUS);
});

// Boosting away has to be a real answer, not a delay.
test("break away and it sinks back down", () => {
  const beast = summon({ seed: 14 });
  const ship = still(0, 0);
  beast.position = { x: GREATBLOOM_LUNGE_RANGE - 20, y: 0 };
  run(beast, ship, GREATBLOOM_LUNGE_SECONDS * 0.6);

  const swollen = beast.radius;
  assert.ok(swollen > GREATBLOOM_DEEP_RADIUS * 1.5, "it should have started coming up");

  for (let step = 0; step < 240; step += 1) {
    beast.position = { x: GREATBLOOM_LUNGE_RANGE * 4, y: 0 };
    run(beast, ship, 1 / 60);
  }

  assert.ok(beast.radius < swollen, "stayed swollen at " + beast.radius);
  assert.equal(beast.isSurfaced, false);
});

test("having eaten, it sinks away and is gone -- it is not a kill", () => {
  const beast = summon({ seed: 15 });
  beast.position = { x: 0, y: 0 };
  beast.surfaceProgress = 1;
  beast.isSurfaced = true;

  // What game.js does the moment the hull is gone.
  beast.isHolding = false;
  beast.isDeparting = true;

  run(beast, still(0, 0), GREATBLOOM_SINK_SECONDS + 1);

  assert.equal(beast.isAlive, false, "it should be gone once it is fully back down");
  assert.ok(beast.surfaceProgress <= 0);
});

test("the eye starts in the middle and withdraws to the rim once it has you", () => {
  const beast = summon({ seed: 16 });
  assert.deepEqual(beast.getEyePosition(), { x: beast.position.x, y: beast.position.y });

  beast.surfaceProgress = 1;
  beast.isSurfaced = true;
  beast.isHolding = true;
  run(beast, still(beast.position.x, beast.position.y), 3);

  assert.equal(beast.eyeReach, 1);
  const eye = beast.getEyePosition();
  const reach = Math.hypot(eye.x - beast.position.x, eye.y - beast.position.y);
  assert.ok(
    Math.abs(reach - (GREATBLOOM_RADIUS - GREATBLOOM_EYE_RADIUS - 4)) < 0.001,
    "eye sat at " + reach,
  );
});

test("the eye angle stays wrapped however long the fight runs", () => {
  const beast = summon({ seed: 17 });
  beast.isHolding = true;
  assert.ok(Math.abs(beast.eyeAngle) <= Math.PI * 2);
  run(beast, still(0, 0), 80);
  assert.ok(Math.abs(beast.eyeAngle) <= Math.PI * 2, "angle ran away to " + beast.eyeAngle);
});

// The bug this guards: the chase used to be gated on `perception`, but a summon
// surfaces outside it, so the boss milled about out of sight and never arrived.
test("it closes on the ship from further than it could ever perceive", () => {
  const beast = summon({ seed: 5 });
  beast.position = { x: 1400, y: 0 };
  assert.ok(beast.position.x > beast.perception, "the test must start beyond perception to mean anything");

  run(beast, still(0, 0), 10);

  const closed = Math.hypot(beast.position.x, beast.position.y);
  assert.ok(closed < 1200, "only closed from 1400 to " + Math.round(closed));
});

test("an unpowered ship still loses it, the same escape a hunter allows", () => {
  const beast = summon({ seed: 6 });
  beast.position = { x: 900, y: 0 };

  run(beast, still(0, 0), 10, { powered: false });

  const closed = 900 - Math.hypot(beast.position.x, beast.position.y);
  assert.ok(closed < 200, "it hunted a dark ship, closing " + Math.round(closed));
});

test("it goes as fast as it must to stay on a fleeing ship", () => {
  const beast = summon({ seed: 13 });
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 231, y: 0 }, angle: 0 };

  run(beast, ship, 1 / 60);

  // A ship at full boost must not simply leave the approach behind.
  assert.ok(beast.maxSpeed > 231, "only managed " + Math.round(beast.maxSpeed) + " against a boosting ship");
});

test("while hiding it chases the wake, and lunges at the ship once committed", () => {
  const beast = summon({ seed: 18 });
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 100, y: 0 }, angle: 0 };

  beast.surfaceProgress = 0;
  assert.ok(beast.getGreatbloomPursuitTarget(ship).x < ship.position.x, "should aim behind a ship travelling +x");

  beast.surfaceProgress = 1;
  beast.isSurfaced = true;
  assert.deepEqual(beast.getGreatbloomPursuitTarget(ship), ship.position);
});

test("it slows down once it has someone inside, so the arena can be ridden", () => {
  const beast = summon({ seed: 8 });
  const ship = still(0, 0);
  beast.isSurfaced = true;
  beast.surfaceProgress = 1;

  run(beast, ship, 1 / 60);
  const chasing = beast.maxSpeed;
  beast.isHolding = true;
  run(beast, ship, 1 / 60);

  assert.ok(beast.maxSpeed < chasing, "holding should be slower than chasing");
  // The ship cruises at 105; riding the wall has to be possible without boost.
  assert.ok(beast.maxSpeed < 105, "holding pace " + beast.maxSpeed + " outruns an unboosted ship");
});

test("the summon threshold is a whole number of rams", () => {
  assert.ok(Number.isInteger(BLOOM_KILLS_PER_GREATBLOOM));
  assert.ok(BLOOM_KILLS_PER_GREATBLOOM >= 1);
});
