import assert from "node:assert/strict";
import test from "node:test";
import { CAMPAIGN_ENGINE_START_WEAR, ENGINE_CONDITION_CONFIG, getEngineStageEffects } from "../src/systems/engineCondition.js";
import { stageForWear, repairPanelCondition, createPanelCondition } from "../src/systems/panelMaintenance.js";
import { Ship } from "../src/entities/Ship.js";
import { createJourneyDirector } from "../src/systems/journeyDirector.js";
import { createGameState } from "../src/state/gameState.js";

// The campaign skiff leaves the Porch on a drive that is one stage from dead:
// it coughs on start-up, misfires under load, and a misfire at that stage
// shoves the ship off course. Rook's tune-up in The Deal is a service, not a
// replacement.

test("the campaign start wear sits inside Emergency with grace left before Failed", () => {
  const { thresholds } = ENGINE_CONDITION_CONFIG;
  assert.equal(stageForWear(CAMPAIGN_ENGINE_START_WEAR, thresholds), "emergency");
  assert.ok(thresholds.failed - CAMPAIGN_ENGINE_START_WEAR >= 20, "a few minutes of thrust before it dies");
});

test("Emergency misfires kick the ship and the drive coughs on power-up", () => {
  const emergency = getEngineStageEffects("emergency");
  assert.ok(emergency.misfireKick > 0 && emergency.misfireJolt > 0);
  assert.equal(emergency.startupCough, 1);
  const healthy = getEngineStageEffects("healthy");
  assert.equal(healthy.misfireKick, 0);
  assert.equal(healthy.startupCough, 0);
});

test("a stalled drive puffs instead of flaming, and the puffs fade", () => {
  const ship = new Ship(0, 0, { powered: true, fuel: 100, thrustVisual: {} }, {});
  assert.equal(ship.exhaustPuffs.length, 0);
  ship.emitExhaustPuff(1.4);
  assert.ok(ship.exhaustPuffs.length >= 3);
  assert.ok(ship.exhaustPuffs.every((puff) => puff.x < 0), "puffs come out of the back of a forward-thrusting hull");
  ship.updateExhaustPuffs(5);
  assert.equal(ship.exhaustPuffs.length, 0);
});

test("The Deal's serviceComponent action tunes the engine back to healthy without restoring its ceiling", () => {
  const state = createGameState();
  const engine = state.components.engine;
  engine.condition = { ...createPanelCondition(), stage: "emergency", wear: CAMPAIGN_ENGINE_START_WEAR, lifetimeDegradation: 7, maxRecoverableCondition: 93, serviceCount: 5 };
  const director = createJourneyDirector({ state, showComponent: () => {} });
  director.startMission("chapter-1-new-ship");
  assert.equal(engine.condition.stage, "healthy");
  assert.equal(engine.condition.wear, 0);
  assert.equal(engine.condition.serviceCount, 6);
  assert.equal(engine.condition.maxRecoverableCondition, 93, "a tune-up does not make it a new drive");
});

test("repairPanelCondition is the same seam Sal uses", () => {
  const condition = { ...createPanelCondition(), stage: "emergency", wear: 170 };
  assert.equal(repairPanelCondition(condition), "emergency");
  assert.equal(condition.stage, "healthy");
});
