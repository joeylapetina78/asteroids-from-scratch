// Rock-life eating what nobody came back for.
//
// The rules that matter are the ones protecting the player's ordinary loop: a
// fresh drop is never touched, nothing feeds while you are standing over it, and
// the rare material you were flying back for is not on the menu. Most of what
// follows guards those rather than the eating itself.

import assert from "node:assert/strict";
import test from "node:test";
import {
  GRAZING_DEFAULTS,
  advanceGrazing,
  isEdible,
  isSettled,
  planGrazing,
} from "../src/systems/grazing.js";

const FAR_FROM_SHIP = { x: 100_000, y: 100_000 };

function pickup({ type = "iron-nickel", x = 0, y = 0, age = 999, strain = null } = {}) {
  return { type, position: { x, y }, age, grazedSeconds: 0, quantity: 1, strain };
}

function grazer({ x = 0, y = 0, seed = 1 } = {}) {
  return { type: "grazer", position: { x, y }, seed, grazingTarget: null, isAlive: true };
}

// ── What counts as food ─────────────────────────────────────────────────────

test("rock-life browses what a rock is made of", () => {
  assert.ok(isEdible(pickup({ type: "iron-nickel" })), "structural");
  assert.ok(isEdible(pickup({ type: "water-ice" })), "volatile");
  assert.ok(isEdible(pickup({ type: "silicate" })), "industrial");
  assert.ok(isEdible(pickup({ type: "rockmoss-crawler" })), "a living spore most of all");
});

// The whole point of sparing these: the valuable thing you were flying back for
// is still there when you return. Only the bulk ore goes.
test("refined and exotic material is not food", () => {
  assert.equal(isEdible(pickup({ type: "copper" })), false, "conductor");
  assert.equal(isEdible(pickup({ type: "crystal-matrix" })), false, "advanced");
});

test("a rift trophy is a bounty claim, not a substance", () => {
  assert.equal(isEdible(pickup({ type: "rift-trophy" })), false);
});

// ── The player's loop is never interfered with ──────────────────────────────

test("a fresh drop is not food yet", () => {
  assert.equal(isSettled(pickup({ age: 0 })), false, "just cracked open");
  assert.equal(isSettled(pickup({ age: GRAZING_DEFAULTS.settleSeconds - 1 })), false);
  assert.ok(isSettled(pickup({ age: GRAZING_DEFAULTS.settleSeconds })), "abandoned long enough");
});

test("nothing is touched while it lies fresh, however hungry the field is", () => {
  const assignments = planGrazing([grazer()], [pickup({ age: 0, x: 10 })], { shipPosition: FAR_FROM_SHIP });
  assert.equal(assignments.length, 0, "cracking a rock and scooping it up is never disturbed");
});

test("your presence protects your haul", () => {
  const ship = { x: 0, y: 0 };
  const underTheShip = pickup({ x: 40, y: 0 });
  assert.equal(planGrazing([grazer({ x: 120 })], [underTheShip], { shipPosition: ship }).length, 0,
    "a creature that flees you does not also feed in front of you");

  // The same drop, once you have gone.
  assert.equal(planGrazing([grazer({ x: 120 })], [underTheShip], { shipPosition: FAR_FROM_SHIP }).length, 1,
    "what gets eaten is what was abandoned");
});

test("a grazer standing near the ship will not feed even on distant food", () => {
  const assignments = planGrazing([grazer({ x: 50 })], [pickup({ x: 260 })], { shipPosition: { x: 0, y: 0 } });
  assert.equal(assignments.length, 0);
});

// ── One ranked clearing, not a race ─────────────────────────────────────────

// The same update-order privilege the extraction market had: a loop over
// creatures hands whoever is first in the array its pick of the whole field.
test("the nearest grazer gets the food, not the one earliest in the array", () => {
  const far = grazer({ x: 400, y: 0, seed: 1 });
  const near = grazer({ x: 20, y: 0, seed: 2 });
  const meal = pickup({ x: 0, y: 0 });

  const assignments = planGrazing([far, near], [meal], { shipPosition: FAR_FROM_SHIP });
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].grazer, near, "distance decides, not position in memory");
});

test("two grazers never share one drop", () => {
  const meal = pickup({ x: 0, y: 0 });
  const assignments = planGrazing([grazer({ x: 20, seed: 1 }), grazer({ x: 25, seed: 2 })], [meal],
    { shipPosition: FAR_FROM_SHIP });
  assert.equal(assignments.length, 1, "awarded once, like every other clearing in the game");
});

test("food beyond sight is not noticed", () => {
  const assignments = planGrazing([grazer({ x: 0 })], [pickup({ x: GRAZING_DEFAULTS.senseRadius + 50 })],
    { shipPosition: FAR_FROM_SHIP });
  assert.equal(assignments.length, 0);
});

// ── Eating takes time, and interrupting it means something ──────────────────

test("a drop is finished only after being worked on, not on contact", () => {
  const meal = pickup({ x: 0 });
  const hungry = [grazer({ x: 5 })];
  const world = { deltaSeconds: 1, shipPosition: FAR_FROM_SHIP };

  const first = advanceGrazing(hungry, [meal], world);
  assert.equal(first.eaten.length, 0, "one second in, still eating");
  assert.equal(hungry[0].grazingTarget, meal, "and it is visibly going for it");

  for (let second = 0; second < GRAZING_DEFAULTS.biteSeconds; second += 1) {
    var result = advanceGrazing(hungry, [meal], world);
  }
  assert.deepEqual(result.eaten, [meal], "finished, and handed back for the caller to remove");
});

test("a grazer out of reach steers toward food without consuming it", () => {
  const meal = pickup({ x: 300 });
  const hungry = [grazer({ x: 0 })];

  for (let second = 0; second < 30; second += 1) {
    advanceGrazing(hungry, [meal], { deltaSeconds: 1, shipPosition: FAR_FROM_SHIP });
  }
  assert.equal(meal.grazedSeconds, 0, "it has to actually get there");
  assert.equal(hungry[0].grazingTarget, meal);
});

// You came back and scared it off — it does not get to resume mid-meal.
test("interrupted feeding is forgotten rather than banked", () => {
  const meal = pickup({ x: 0 });
  const hungry = [grazer({ x: 5 })];
  advanceGrazing(hungry, [meal], { deltaSeconds: 3, shipPosition: FAR_FROM_SHIP });
  const progress = meal.grazedSeconds;
  assert.ok(progress > 0, "it had started");

  // The ship arrives; the grazer is now too close to feed.
  advanceGrazing(hungry, [meal], { deltaSeconds: 2, shipPosition: { x: 0, y: 0 } });
  assert.ok(meal.grazedSeconds < progress, "progress decays once nobody is working on it");
  assert.equal(hungry[0].grazingTarget, null, "and it has given up on the meal");
});

test("an empty field asks nothing of the simulation", () => {
  assert.deepEqual(advanceGrazing([], [], { deltaSeconds: 1 }).eaten, []);
  assert.deepEqual(advanceGrazing([grazer()], [], { deltaSeconds: 1 }).eaten, []);
});
