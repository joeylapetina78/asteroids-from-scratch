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
  GRAZING_STAGE,
  advanceGrazing,
  findGrazingClusters,
  getGrazerSporeYield,
  getGrowthScale,
  isEdible,
  isRipe,
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
  const world = { deltaSeconds: 1 / 30, shipPosition: FAR_FROM_SHIP };

  const first = advanceGrazing(hungry, [meal], world);
  assert.equal(first.eaten.length, 0, "arriving is not eating");
  assert.equal(hungry[0].grazingTarget, meal, "but it is visibly going for it");

  // Watch the whole performance: it must taste, flinch off, and come back before
  // anything disappears.
  const stages = new Set();
  let eaten = [];
  for (let tick = 0; tick < 400 && eaten.length === 0; tick += 1) {
    stages.add(hungry[0].grazingStage);
    eaten = advanceGrazing(hungry, [meal], world).eaten;
  }

  assert.deepEqual(eaten, [meal], "finished, and handed back for the caller to remove");
  assert.ok(stages.has(GRAZING_STAGE.NIBBLE), "it tasted it");
  assert.ok(stages.has(GRAZING_STAGE.RECOIL), "and flinched back off it at least once");
  assert.ok(stages.has(GRAZING_STAGE.FINISH), "and settled before it vanished");
});

test("eating fattens the creature, and a fed one eventually goes ripe", () => {
  const hungry = grazer({ x: 0 });
  assert.equal(isRipe(hungry), false, "a lean grazer is not worth shooting");
  assert.equal(getGrazerSporeYield(hungry), 0, "and carries nothing");

  const world = { deltaSeconds: 1 / 30, shipPosition: FAR_FROM_SHIP };
  for (let meal = 0; meal < GRAZING_DEFAULTS.ripeAt; meal += 1) {
    const food = pickup({ x: 2, y: 0 });
    let eaten = [];
    for (let tick = 0; tick < 400 && eaten.length === 0; tick += 1) {
      eaten = advanceGrazing([hungry], [food], world).eaten;
    }
    assert.equal(eaten.length, 1, `meal ${meal + 1} finished`);
  }

  assert.equal(hungry.fullness, GRAZING_DEFAULTS.ripeAt);
  assert.ok(isRipe(hungry), "fed enough to be worth harvesting");
  assert.ok(getGrazerSporeYield(hungry) > 0, "and carrying spores to show for it");
  assert.ok(getGrowthScale(hungry) > 1, "and visibly bigger than it started");
});

// The entity does the moving, so a stationary fixture never arrives — which is
// exactly the point: distance, not a timer, is what starts a meal.
test("a grazer out of reach steers toward food without consuming it", () => {
  const meal = pickup({ x: 300 });
  const hungry = [grazer({ x: 0 })];

  const { eaten } = advanceGrazing(hungry, [meal], { deltaSeconds: 1, shipPosition: FAR_FROM_SHIP });
  assert.equal(eaten.length, 0, "nothing is eaten from across the field");
  assert.equal(hungry[0].grazingTarget, meal, "it is on its way");
  assert.equal(hungry[0].grazingStage, GRAZING_STAGE.APPROACH, "and still only travelling");
});

// A drop resting against a rock sits exactly where a creature's approach and its
// asteroid-avoidance cancel out. It hung there at a fixed distance forever,
// holding a claim on food nothing could reach — which stranded the last two
// units of a fourteen-unit spill indefinitely. Wanting is not reaching.
test("food it cannot get to is released rather than claimed forever", () => {
  const unreachable = pickup({ x: 300 });
  const stuck = grazer({ x: 0 });
  stuck.age = 0;

  // Claim it first, then let it fail to make progress.
  advanceGrazing([stuck], [unreachable], { deltaSeconds: 0.5, shipPosition: FAR_FROM_SHIP });
  assert.equal(stuck.grazingTarget, unreachable, "it set off toward the drop");

  let ticks = 1;
  while (stuck.grazingTarget && ticks < 200) {
    stuck.age += 0.5;
    advanceGrazing([stuck], [unreachable], { deltaSeconds: 0.5, shipPosition: FAR_FROM_SHIP });
    ticks += 1;
  }

  assert.equal(stuck.grazingTarget, null, "it gave up instead of hanging there");
  assert.ok(ticks * 0.5 <= GRAZING_DEFAULTS.approachTimeoutSeconds + 1, "and gave up promptly");

  // And it does not immediately re-claim the same trap.
  advanceGrazing([stuck], [unreachable], { deltaSeconds: 0.5, shipPosition: FAR_FROM_SHIP });
  assert.equal(stuck.grazingTarget, null, "the drop it failed to reach is somebody else's problem for a while");
});

// Another creature coming from a different angle may well manage it, so a
// refusal is personal rather than a global blacklist on the drop.
test("giving up is personal, not a mark on the food", () => {
  const awkward = pickup({ x: 300 });
  const quitter = grazer({ x: 0, seed: 1 });
  quitter.grazingAvoid = awkward;
  quitter.grazingAvoidUntil = 999;
  quitter.age = 0;

  const fresh = grazer({ x: 320, seed: 2 });
  const assignments = planGrazing([quitter, fresh], [awkward], { shipPosition: FAR_FROM_SHIP });

  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].grazer, fresh, "the one that has not failed at it still tries");
});

// ── A feast should draw a crowd ─────────────────────────────────────────────

test("a lone drop is not a feast", () => {
  const scattered = [pickup({ x: 0 }), pickup({ x: 4000 })];
  assert.deepEqual(findGrazingClusters(scattered, [], { shipPosition: FAR_FROM_SHIP }), []);
});

test("a pile of abandoned material with nobody on it wants mouths", () => {
  const pile = Array.from({ length: 9 }, (unused, index) => pickup({ x: index * 30, y: 0 }));
  const clusters = findGrazingClusters(pile, [], { shipPosition: FAR_FROM_SHIP });

  assert.equal(clusters.length, 1, "one spill, one crowd");
  assert.equal(clusters[0].units, 9);
  assert.ok(clusters[0].missing > 0, "and nothing is eating it yet");
  assert.ok(clusters[0].wanted <= GRAZING_DEFAULTS.maxGrazersPerCluster, "a spill is not a swarm");
});

test("a pile already being worked does not call for more", () => {
  const pile = Array.from({ length: 6 }, (unused, index) => pickup({ x: index * 30, y: 0 }));
  const crowd = Array.from({ length: GRAZING_DEFAULTS.maxGrazersPerCluster },
    (unused, index) => grazer({ x: 60, y: 0, seed: index }));
  assert.deepEqual(findGrazingClusters(pile, crowd, { shipPosition: FAR_FROM_SHIP }), []);
});

test("a pile you are standing over never calls anything up", () => {
  const pile = Array.from({ length: 9 }, (unused, index) => pickup({ x: index * 20, y: 0 }));
  assert.deepEqual(findGrazingClusters(pile, [], { shipPosition: { x: 80, y: 0 } }), [],
    "your presence protects the whole spill, not just the nearest drop");
});

test("fresh spill is not a feast until it has been abandoned", () => {
  const pile = Array.from({ length: 9 }, (unused, index) => pickup({ x: index * 30, y: 0, age: 0 }));
  assert.deepEqual(findGrazingClusters(pile, [], { shipPosition: FAR_FROM_SHIP }), []);
});

// You came back and scared it off — it does not get to resume mid-meal.
test("interrupted feeding is forgotten rather than banked", () => {
  const meal = pickup({ x: 0 });
  const hungry = [grazer({ x: 5 })];
  for (let tick = 0; tick < 10; tick += 1) {
    advanceGrazing(hungry, [meal], { deltaSeconds: 1 / 30, shipPosition: FAR_FROM_SHIP });
  }
  assert.ok(hungry[0].grazingStage, "it had started");

  // The ship arrives; the grazer is now too close to feed.
  advanceGrazing(hungry, [meal], { deltaSeconds: 1 / 30, shipPosition: { x: 0, y: 0 } });
  assert.equal(hungry[0].grazingTarget, null, "it gave up the meal");
  assert.equal(hungry[0].grazingStage, null, "and forgot how far through it was");
});

// A creature that re-auctioned its dinner every frame would twitch between
// meals and finish none of them.
test("a grazer keeps the meal it has already started", () => {
  const near = pickup({ x: 0, y: 0 });
  const hungry = [grazer({ x: 40, y: 0 })];
  advanceGrazing(hungry, [near], { deltaSeconds: 1 / 30, shipPosition: FAR_FROM_SHIP });
  assert.equal(hungry[0].grazingTarget, near);

  // Something closer appears. It should NOT abandon what it is already eating.
  const closer = pickup({ x: 41, y: 0 });
  advanceGrazing(hungry, [near, closer], { deltaSeconds: 1 / 30, shipPosition: FAR_FROM_SHIP });
  assert.equal(hungry[0].grazingTarget, near, "dinner is not re-auctioned mid-bite");
});

test("an empty field asks nothing of the simulation", () => {
  assert.deepEqual(advanceGrazing([], [], { deltaSeconds: 1 }).eaten, []);
  assert.deepEqual(advanceGrazing([grazer()], [], { deltaSeconds: 1 }).eaten, []);
});
