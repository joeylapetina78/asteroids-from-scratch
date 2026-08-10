import assert from "node:assert/strict";
import test from "node:test";
import { MINER_CONDITION_CONFIG, computeMinerWearPerShot, getMinerStageEffects } from "../src/systems/minerCondition.js";
import { accumulatePanelWear, createPanelCondition } from "../src/systems/panelMaintenance.js";

test("mining-laser effects worsen by stage; healthy carries no penalty", () => {
  const healthy = getMinerStageEffects("healthy");
  assert.equal(healthy.cooldownScale, 1);
  assert.equal(healthy.ammoScale, 1);
  assert.equal(healthy.misfireChance, 0);
  assert.equal(healthy.aimDrift, 0);

  const degraded = getMinerStageEffects("degraded");
  const emergency = getMinerStageEffects("emergency");
  const failed = getMinerStageEffects("failed");
  for (const key of ["cooldownScale", "ammoScale", "misfireChance", "aimDrift"]) {
    assert.ok(degraded[key] > healthy[key], `degraded ${key} worsens`);
    assert.ok(emergency[key] > degraded[key], `emergency ${key} worsens`);
    assert.ok(failed[key] > emergency[key], `failed ${key} worsens`);
  }

  // Unknown stage is treated as healthy.
  assert.deepEqual(getMinerStageEffects("???"), healthy);
});

test("the laser sputters and drifts at Failed rather than switching fully OFF", () => {
  const failed = getMinerStageEffects("failed");
  assert.ok(failed.misfireChance < 1, "a failed laser still fires between sputters");
  assert.ok(Number.isFinite(failed.cooldownScale) && failed.cooldownScale > 0, "it still charges, just slowly");
});

test("firing wears the laser into Degraded at the expected shot count", () => {
  const condition = createPanelCondition();
  const perShot = computeMinerWearPerShot();
  assert.ok(perShot > 0);
  const thresholds = MINER_CONDITION_CONFIG.thresholds;
  const fire = () => accumulatePanelWear(condition, perShot, thresholds).stage;

  const shotsToDegraded = Math.ceil(thresholds.degraded / perShot);
  let stage = "healthy";
  for (let i = 0; i < shotsToDegraded - 1; i += 1) stage = fire();
  assert.equal(stage, "healthy", "still healthy just before the threshold");
  assert.equal(fire(), "degraded", "crosses into degraded on the threshold shot");
});
