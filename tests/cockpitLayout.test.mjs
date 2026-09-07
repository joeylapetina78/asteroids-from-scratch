import test from "node:test";
import assert from "node:assert/strict";

import {
  COCKPIT_MODULE_IDS,
  COCKPIT_PRESETS,
  applyCockpitPreset,
  assignCockpitModule,
  createCockpitLayoutState,
} from "../src/systems/cockpitLayout.js";

test("every cockpit preset assigns every module to a fixed slot", () => {
  Object.values(COCKPIT_PRESETS).forEach((preset) => {
    assert.deepEqual(Object.keys(preset).sort(), [...COCKPIT_MODULE_IDS].sort());
    assert.ok(Object.values(preset).every((slot) => ["left", "right", "bottom"].includes(slot)));
  });
});

test("an invalid saved layout falls back without losing valid choices", () => {
  const layout = createCockpitLayoutState({
    preset: "hauling",
    assignments: { engine: "bottom", hull: "somewhere" },
  });

  assert.equal(layout.assignments.engine, "bottom");
  assert.equal(layout.assignments.hull, COCKPIT_PRESETS.hauling.hull);
});

test("choosing a preset resets custom assignments", () => {
  const layout = createCockpitLayoutState();
  assignCockpitModule(layout, "engine", "bottom");
  applyCockpitPreset(layout, "exploration");

  assert.equal(layout.preset, "exploration");
  assert.deepEqual(layout.assignments, COCKPIT_PRESETS.exploration);
});

test("moving a module makes the layout custom and rejects unknown targets", () => {
  const layout = createCockpitLayoutState();

  assert.equal(assignCockpitModule(layout, "engine", "right"), true);
  assert.equal(layout.preset, "custom");
  assert.equal(layout.assignments.engine, "right");
  assert.equal(assignCockpitModule(layout, "engine", "drawer"), false);
  assert.equal(assignCockpitModule(layout, "unknown", "left"), false);
});

test("floating module positions survive loading and reset with a preset", () => {
  const layout = createCockpitLayoutState({
    floatingPositions: {
      processor: { x: 123.4, y: 87.8 },
      engine: { x: "far", y: 20 },
      unknown: { x: 1, y: 2 },
    },
  });

  assert.deepEqual(layout.floatingPositions, { processor: { x: 123, y: 88 } });
  applyCockpitPreset(layout, "mining");
  assert.deepEqual(layout.floatingPositions, {});
  assert.equal(layout.processorClawTarget, "cargo");
});

test("the processor plug defaults to cargo", () => {
  assert.equal(createCockpitLayoutState().processorClawTarget, "cargo");
  assert.equal(createCockpitLayoutState({ processorClawTarget: "unknown" }).processorClawTarget, "cargo");
  assert.equal(createCockpitLayoutState({ processorClawTarget: "engine" }).processorClawTarget, "engine");
  assert.equal(createCockpitLayoutState({ processorClawTarget: "collector" }).processorClawTarget, "collector");
});

test("the selected phosphor color survives loading and invalid colors fall back safely", () => {
  assert.equal(createCockpitLayoutState({ phosphorColor: "#ff5a9d" }).phosphorColor, "#ff5a9d");
  assert.equal(createCockpitLayoutState({ phosphorColor: "chartreuse" }).phosphorColor, "#7dffe0");
});
