import test from "node:test";
import assert from "node:assert/strict";

import {
  GREATBLOOM_DEEP_RADIUS,
  GREATBLOOM_EYE_RADIUS,
  GREATBLOOM_HEALTH,
  GREATBLOOM_RADIUS,
  GREATBLOOM_SURFACE_SECONDS,
  Lifeform,
} from "../src/entities/Lifeform.js";
import { BLOOM_KILLS_PER_GREATBLOOM, createSurfacingGreatbloom } from "../src/systems/lifeField.js";

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

const tick = (beast, seconds) => {
  const steps = Math.round(seconds * 60);
  for (let step = 0; step < steps; step += 1) {
    beast.update(1 / 60, {
      ship: { position: { x: 4000, y: 0 } }, shipPowered: true,
      lifeforms: [], asteroids: [], disturbances: [],
    });
  }
};

// A ship at the centre of a 1440x900 view: the camera puts world (0,0) at the
// middle of the screen.
const VIEW = { width: 1440, height: 900 };
const CAMERA = { x: -720, y: -450 };

test("a summoned one comes up small, and close enough to watch", () => {
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0 };
  const beast = createSurfacingGreatbloom({
    ship, asteroids: [], camera: CAMERA, view: VIEW, random: () => 0.5, seed: 10,
  });

  assert.equal(beast.isSurfaced, false);
  assert.equal(beast.surfaceProgress, 0);
  assert.equal(beast.radius, GREATBLOOM_DEEP_RADIUS);

  const reach = Math.hypot(beast.position.x - ship.position.x, beast.position.y - ship.position.y);
  assert.ok(reach > 140, `surfaced ${reach} away — right on top of the player`);
  assert.ok(reach < 450, `surfaced ${reach} away — the ascent would happen off screen`);
});

test("it comes up out from under a rock the player can see", () => {
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0 };
  const rock = { position: { x: 300, y: 0 } };
  const beast = createSurfacingGreatbloom({
    ship, asteroids: [rock], camera: CAMERA, view: VIEW, random: () => 0.5, seed: 3,
  });

  assert.equal(beast.cameFromRock, true);
  assert.deepEqual(beast.position, { x: 300, y: 0 });
});

// The ascent IS the warning. A rock off the edge of the screen would hide it,
// and the first the player would know of the animal is being eaten by it.
test("a rock off the edge of the screen is not used", () => {
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0 };
  const offScreen = { position: { x: 4000, y: 0 } };
  const beast = createSurfacingGreatbloom({
    ship, asteroids: [offScreen], camera: CAMERA, view: VIEW, random: () => 0.5, seed: 4,
  });

  assert.equal(beast.cameFromRock, false);
  assert.notDeepEqual(beast.position, offScreen.position);
});

// "It should be right behind me until it's big enough to eat me."
test("while rising it chases the wake, and only lunges at the ship once grown", () => {
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 100, y: 0 }, angle: 0 };
  const beast = createSurfacingGreatbloom({
    ship, asteroids: [], camera: CAMERA, view: VIEW, random: () => 0.5, seed: 12,
  });

  const rising = beast.getGreatbloomPursuitTarget(ship);
  assert.ok(rising.x < ship.position.x, "it should aim behind a ship travelling +x");

  beast.isSurfaced = true;
  assert.deepEqual(beast.getGreatbloomPursuitTarget(ship), ship.position);
});

test("it goes as fast as it must to stay on a fleeing ship", () => {
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 231, y: 0 }, angle: 0 };
  const beast = createSurfacingGreatbloom({
    ship, asteroids: [], camera: CAMERA, view: VIEW, random: () => 0.5, seed: 13,
  });

  beast.update(1 / 60, { ship, shipPowered: true, lifeforms: [], asteroids: [], disturbances: [] });

  // A ship at full boost must not simply leave the ascent behind.
  assert.ok(beast.maxSpeed > 231, `only managed ${Math.round(beast.maxSpeed)} against a boosting ship`);
});

// The whole point of the rise: it swells and shrinks on the way up, each swell
// reaching further than the last, rather than simply inflating.
test("it pulses bigger and smaller while it climbs, gaining each time", () => {
  const ship = { position: { x: 4000, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0 };
  const beast = createSurfacingGreatbloom({ ship, asteroids: [], random: () => 0.5, seed: 7 });

  const samples = [];
  for (let step = 0; step < 60; step += 1) {
    tick(beast, GREATBLOOM_SURFACE_SECONDS / 60);
    samples.push(beast.radius);
  }

  let shrinks = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index] < samples[index - 1]) shrinks += 1;
  }

  assert.ok(shrinks > 4, `only shrank ${shrinks} times — that is an inflation, not a rise`);
  assert.ok(Math.max(...samples.slice(0, 10)) < GREATBLOOM_RADIUS * 0.7, "it should start well under full size");
});

test("it reaches full size and stays there", () => {
  const ship = { position: { x: 4000, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0 };
  const beast = createSurfacingGreatbloom({ ship, asteroids: [], random: () => 0.5, seed: 11 });

  tick(beast, GREATBLOOM_SURFACE_SECONDS + 1);
  assert.equal(beast.isSurfaced, true);
  assert.equal(beast.radius, GREATBLOOM_RADIUS);

  // No wobble once it has surfaced.
  tick(beast, 3);
  assert.equal(beast.radius, GREATBLOOM_RADIUS);
});

test("the summon threshold is a whole number of rams", () => {
  assert.ok(Number.isInteger(BLOOM_KILLS_PER_GREATBLOOM));
  assert.ok(BLOOM_KILLS_PER_GREATBLOOM >= 1);
});

// The bug this guards: the chase used to be gated on `perception`, but a
// summoned one surfaces up to 900 away — outside it — so the boss politely
// milled about out of sight and never arrived.
test("it closes on the ship from further than it could ever perceive", () => {
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0 };
  const beast = createSurfacingGreatbloom({ ship, asteroids: [], random: () => 0.5, seed: 5 });
  beast.position = { x: 1400, y: 0 };

  const reachOf = () => Math.hypot(beast.position.x - ship.position.x, beast.position.y - ship.position.y);
  const opening = reachOf();
  assert.ok(opening > beast.perception, "the test has to start beyond perception to mean anything");

  for (let step = 0; step < 600; step += 1) {
    beast.update(1 / 60, {
      ship, shipPowered: true, lifeforms: [], asteroids: [], disturbances: [],
    });
  }

  assert.ok(reachOf() < opening - 200, `only closed from ${Math.round(opening)} to ${Math.round(reachOf())}`);
});

test("an unpowered ship still loses it, the same escape a hunter allows", () => {
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0 };
  const beast = createSurfacingGreatbloom({ ship, asteroids: [], random: () => 0.5, seed: 6 });
  beast.position = { x: 900, y: 0 };
  beast.isSurfaced = true;
  beast.surfaceProgress = 1;

  const opening = Math.hypot(beast.position.x, beast.position.y);
  for (let step = 0; step < 600; step += 1) {
    beast.update(1 / 60, {
      ship, shipPowered: false, lifeforms: [], asteroids: [], disturbances: [],
    });
  }

  const closed = opening - Math.hypot(beast.position.x, beast.position.y);
  assert.ok(closed < 200, `it hunted a dark ship, closing ${Math.round(closed)}`);
});

test("it slows down once it has someone inside, so the arena can be ridden", () => {
  const ship = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0 };
  const beast = createSurfacingGreatbloom({ ship, asteroids: [], random: () => 0.5, seed: 8 });
  beast.isSurfaced = true;
  beast.surfaceProgress = 1;

  const world = { ship, shipPowered: true, lifeforms: [], asteroids: [], disturbances: [] };
  beast.update(1 / 60, world);
  const chasing = beast.maxSpeed;

  beast.isHolding = true;
  beast.update(1 / 60, world);
  const holding = beast.maxSpeed;

  assert.ok(holding < chasing, "holding should be slower than chasing");
  // The ship cruises at 105; riding the wall has to be possible without boost.
  assert.ok(holding < 105, `holding pace ${holding} outruns an unboosted ship`);
});
