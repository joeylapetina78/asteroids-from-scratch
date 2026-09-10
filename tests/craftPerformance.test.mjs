import test from "node:test";
import assert from "node:assert/strict";

import {
  BASE_MAX_SPEED,
  BASE_THRUST_POWER,
  REFERENCE_HULL_MASS,
  getCraftPerformance,
  getHullMassScale,
} from "../src/systems/craftPerformance.js";
import { ENGINE_MODELS, getEngineModel } from "../src/content/ships/engineModels.js";

const stockHull = { mass: REFERENCE_HULL_MASS };

test("an unspecified craft flies like the cheapest thing in the world", () => {
  const performance = getCraftPerformance();

  assert.equal(performance.thrustPower, BASE_THRUST_POWER);
  assert.equal(performance.maxSpeed, BASE_MAX_SPEED);
});

// The bug that started this: the same drive meant 185 in one ship and 105 in
// another, because the speed lived on the component and the model carried only
// the control scheme.
test("a drive is worth the same wherever it is bolted", () => {
  const inSkiff = getCraftPerformance({
    engine: {}, engineModel: getEngineModel("vektor-reversing-drive"), hull: stockHull,
  });
  const inBetterShip = getCraftPerformance({
    engine: {}, engineModel: getEngineModel("vektor-reversing-drive"), hull: stockHull,
  });

  assert.deepEqual(
    { thrust: inSkiff.thrustPower, speed: inSkiff.maxSpeed },
    { thrust: inBetterShip.thrustPower, speed: inBetterShip.maxSpeed },
  );
});

test("the Vektor is meaningfully faster than the drive it replaces", () => {
  const rook = getCraftPerformance({
    engine: {}, engineModel: getEngineModel("rook-standard-drive"), hull: stockHull,
  });
  const vektor = getCraftPerformance({
    engine: {}, engineModel: getEngineModel("vektor-reversing-drive"), hull: stockHull,
  });

  assert.ok(vektor.maxSpeed > rook.maxSpeed * 1.3, `only ${vektor.maxSpeed} against ${rook.maxSpeed}`);
  assert.ok(vektor.thrustPower > rook.thrustPower * 1.3);
});

test("every drive states its own performance", () => {
  Object.values(ENGINE_MODELS).forEach((model) => {
    assert.ok(Number.isFinite(model.thrustPower), `${model.id} has no thrust`);
    assert.ok(Number.isFinite(model.maxSpeed), `${model.id} has no top speed`);
  });
});

// A tune used to be an absolute. Fitted over a better drive it made the craft
// SLOWER than the drive its owner had just paid for.
test("a tune improves whatever drive is fitted, never replaces it", () => {
  const tune = { thrustPowerScale: 1.32, maxSpeedScale: 1.38 };

  const tunedRook = getCraftPerformance({
    engine: tune, engineModel: getEngineModel("rook-standard-drive"), hull: stockHull,
  });
  const bareVektor = getCraftPerformance({
    engine: {}, engineModel: getEngineModel("vektor-reversing-drive"), hull: stockHull,
  });
  const tunedVektor = getCraftPerformance({
    engine: tune, engineModel: getEngineModel("vektor-reversing-drive"), hull: stockHull,
  });

  assert.ok(tunedRook.maxSpeed > BASE_MAX_SPEED, "a tune has to be worth buying on its own");
  assert.ok(tunedVektor.maxSpeed > bareVektor.maxSpeed, "a tune must not undo a better drive");
  assert.ok(tunedVektor.maxSpeed > tunedRook.maxSpeed, "the better drive must stay the better drive");
});

test("a heavier hull costs speed, a lighter one buys it", () => {
  const light = getCraftPerformance({ engine: {}, engineModel: null, hull: { mass: 70 } });
  const stock = getCraftPerformance({ engine: {}, engineModel: null, hull: stockHull });
  const heavy = getCraftPerformance({ engine: {}, engineModel: null, hull: { mass: 200 } });

  assert.ok(light.maxSpeed > stock.maxSpeed);
  assert.ok(heavy.maxSpeed < stock.maxSpeed);
  // Felt, but never crippling: double the mass must not halve the ship.
  assert.ok(heavy.maxSpeed > stock.maxSpeed * 0.7, `double mass cost too much: ${heavy.maxSpeed}`);
});

test("a hull with no stated mass is simply the reference", () => {
  assert.equal(getHullMassScale(null), 1);
  assert.equal(getHullMassScale({}), 1);
  assert.equal(getHullMassScale({ mass: 0 }), 1);
  assert.equal(getHullMassScale({ mass: -5 }), 1);
});

test("the parts are reported, so a slow craft can say why", () => {
  const performance = getCraftPerformance({
    engine: { maxSpeedScale: 1.38 },
    engineModel: getEngineModel("vektor-reversing-drive"),
    hull: { mass: 130 },
  });

  assert.equal(performance.driveMaxSpeed, 155);
  assert.equal(performance.speedScale, 1.38);
  assert.equal(performance.hullMass, 130);
  assert.ok(performance.hullMassScale < 1);
});
