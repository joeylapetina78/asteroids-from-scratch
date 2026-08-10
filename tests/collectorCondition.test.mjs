import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTOR_CONDITION_CONFIG, computeCollectorWearPerSecond, getCollectorStageEffects } from "../src/systems/collectorCondition.js";
import { accumulatePanelWear, createPanelCondition } from "../src/systems/panelMaintenance.js";

test("tractor-field effects worsen by stage; healthy carries no penalty", () => {
  const healthy = getCollectorStageEffects("healthy");
  assert.equal(healthy.radiusScale, 1);
  assert.equal(healthy.strengthScale, 1);
  assert.equal(healthy.dropoutChance, 0);
  assert.equal(healthy.swirl, 0);
  assert.equal(healthy.pushChance, 0);

  const degraded = getCollectorStageEffects("degraded");
  const emergency = getCollectorStageEffects("emergency");
  const failed = getCollectorStageEffects("failed");

  // Reach and pull only weaken; flicker and swirl only grow.
  assert.ok(degraded.radiusScale < healthy.radiusScale && emergency.radiusScale < degraded.radiusScale && failed.radiusScale < emergency.radiusScale);
  assert.ok(degraded.strengthScale < healthy.strengthScale && emergency.strengthScale < degraded.strengthScale && failed.strengthScale < emergency.strengthScale);
  for (const key of ["dropoutChance", "swirl"]) {
    assert.ok(degraded[key] > healthy[key] && emergency[key] > degraded[key] && failed[key] > emergency[key], `${key} grows`);
  }

  // Only a failed field shoves objects away.
  assert.equal(emergency.pushChance, 0);
  assert.ok(failed.pushChance > 0);

  assert.deepEqual(getCollectorStageEffects("???"), healthy);
});

test("even a failed field still grips a little rather than switching OFF", () => {
  const failed = getCollectorStageEffects("failed");
  assert.ok(failed.radiusScale > 0 && failed.strengthScale > 0, "it still reaches and pulls, just weakly");
  assert.ok(failed.dropoutChance < 1, "and does not flicker off every single frame");
});

test("holding the field wears it into Degraded after the expected active time", () => {
  const condition = createPanelCondition();
  const perSecond = computeCollectorWearPerSecond();
  assert.ok(perSecond > 0);
  const thresholds = COLLECTOR_CONDITION_CONFIG.thresholds;

  // Accrue one second of active use at a time.
  const secondsToDegraded = Math.ceil(thresholds.degraded / perSecond);
  let stage = "healthy";
  for (let i = 0; i < secondsToDegraded - 1; i += 1) stage = accumulatePanelWear(condition, perSecond, thresholds).stage;
  assert.equal(stage, "healthy", "still healthy just before the threshold");
  assert.equal(accumulatePanelWear(condition, perSecond, thresholds).stage, "degraded");
});
