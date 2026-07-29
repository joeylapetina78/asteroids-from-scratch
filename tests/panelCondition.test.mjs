import assert from "node:assert/strict";
import test from "node:test";
import {
  accumulatePanelWear,
  createPanelCondition,
  ensurePanelCondition,
  panelStageIndex,
  repairPanelCondition,
  stageForWear,
} from "../src/systems/panelMaintenance.js";
import {
  ENGINE_CONDITION_CONFIG,
  computeEngineWearDelta,
  getEngineStageEffects,
} from "../src/systems/engineCondition.js";
import { createGameState } from "../src/state/gameState.js";

const T = ENGINE_CONDITION_CONFIG.thresholds;

test("stageForWear maps wear totals to stages by threshold", () => {
  assert.equal(stageForWear(0, T), "healthy");
  assert.equal(stageForWear(T.degraded - 1, T), "healthy");
  assert.equal(stageForWear(T.degraded, T), "degraded");
  assert.equal(stageForWear(T.emergency, T), "emergency");
  assert.equal(stageForWear(T.failed + 50, T), "failed");
});

test("accumulatePanelWear advances stages and reports the transition", () => {
  const c = createPanelCondition();
  const step1 = accumulatePanelWear(c, T.degraded - 5, T);
  assert.equal(step1.changed, false, "still healthy below the first threshold");
  assert.equal(c.stage, "healthy");

  const step2 = accumulatePanelWear(c, 10, T);
  assert.equal(step2.changed, true);
  assert.equal(step2.previousStage, "healthy");
  assert.equal(step2.stage, "degraded");
});

test("stages only worsen with continued wear (grace window between thresholds)", () => {
  const c = createPanelCondition();
  accumulatePanelWear(c, T.degraded, T); // just entered degraded
  const midWindow = accumulatePanelWear(c, (T.emergency - T.degraded) / 2, T);
  assert.equal(midWindow.changed, false, "half-way through the grace window it stays degraded");
  assert.equal(c.stage, "degraded");
});

test("repairPanelCondition clears to healthy and returns the prior stage", () => {
  const c = createPanelCondition();
  accumulatePanelWear(c, T.emergency, T);
  assert.equal(c.stage, "emergency");
  const prior = repairPanelCondition(c);
  assert.equal(prior, "emergency");
  assert.equal(c.stage, "healthy");
  assert.equal(c.wear, 0);
});

test("ensurePanelCondition migrates missing or stale condition data", () => {
  const missing = {};
  ensurePanelCondition(missing);
  assert.deepEqual(missing.condition, { stage: "healthy", wear: 0 });

  const stale = { condition: "healthy" }; // old string placeholder
  const migrated = ensurePanelCondition(stale);
  assert.equal(migrated.stage, "healthy");
  assert.equal(migrated.wear, 0);
});

test("panelStageIndex orders severity", () => {
  assert.ok(panelStageIndex("failed") > panelStageIndex("emergency"));
  assert.ok(panelStageIndex("emergency") > panelStageIndex("degraded"));
  assert.ok(panelStageIndex("degraded") > panelStageIndex("healthy"));
});

test("engine wear is use-driven: idle drift never wears, thrust is the main driver", () => {
  const idle = computeEngineWearDelta({ thrusting: false, speed: 0, boosting: false, deltaSeconds: 1 });
  assert.equal(idle, 0, "parked/idle ship earns no wear");

  const thrusting = computeEngineWearDelta({ thrusting: true, speed: 100, boosting: false, deltaSeconds: 1 });
  const travelOnly = computeEngineWearDelta({ thrusting: false, speed: 100, boosting: false, deltaSeconds: 1 });
  assert.ok(thrusting > travelOnly, "thrusting wears faster than coasting");
  assert.ok(travelOnly > 0 && travelOnly < thrusting, "ordinary travel is gentle, not punishing");

  const boosting = computeEngineWearDelta({ thrusting: true, speed: 100, boosting: true, deltaSeconds: 1 });
  assert.ok(boosting > thrusting, "boost stresses the drive hardest");
});

test("pure-thrust time to first Degraded fault is in a sane minutes range", () => {
  const perSecond = computeEngineWearDelta({ thrusting: true, speed: 100, boosting: false, deltaSeconds: 1 });
  const secondsToDegraded = T.degraded / perSecond;
  const minutes = secondsToDegraded / 60;
  // Aggressive continuous-thrust flying hits it faster than representative play;
  // sanity-bound it so a tuning slip can't make faults instant or never happen.
  assert.ok(minutes > 10 && minutes < 45, `pure-thrust to degraded = ${minutes.toFixed(1)} min`);
});

test("engine stage effects escalate: thrust falls, misfire rises, failed kills thrust", () => {
  assert.equal(getEngineStageEffects("healthy").thrustScale, 1);
  assert.ok(getEngineStageEffects("degraded").thrustScale < 1);
  assert.ok(getEngineStageEffects("emergency").thrustScale < getEngineStageEffects("degraded").thrustScale);
  assert.ok(getEngineStageEffects("emergency").misfireChance > getEngineStageEffects("degraded").misfireChance);
  assert.equal(getEngineStageEffects("failed").thrustScale, 0, "failed engine produces no thrust");
});

test("fresh state seeds an engine condition object", () => {
  const state = createGameState();
  assert.deepEqual(state.components.engine.condition, { stage: "healthy", wear: 0 });
});
