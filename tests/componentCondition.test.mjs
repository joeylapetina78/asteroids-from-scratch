import assert from "node:assert/strict";
import test from "node:test";
import { applyCraftUse, ensureCraftComponents, routineServiceCraft, serviceCraftComponent } from "../src/systems/componentCondition.js";

const DEFINITIONS = [
  { id: "drive", label: "Drive" },
  { id: "tool", label: "Tool", initialWearFactor: 0.5 },
];

test("a craft carries independent persistent component conditions", () => {
  const craft = {};
  ensureCraftComponents(craft, DEFINITIONS);
  applyCraftUse(craft, { drive: 0.6, tool: 0.1 }, { at: 10 });
  assert.equal(craft.components.drive.condition.stage, "degraded");
  assert.equal(craft.components.tool.condition.stage, "healthy");
  assert.equal(craft.aggregateWear, craft.components.drive.condition.wear);
});

test("servicing one component does not reset its neighbors or erase permanent aging", () => {
  const craft = {};
  ensureCraftComponents(craft, DEFINITIONS);
  applyCraftUse(craft, { drive: 0.8, tool: 0.7 });
  const toolWear = craft.components.tool.condition.wear;
  const agedMaximum = craft.components.drive.condition.maxRecoverableCondition;
  serviceCraftComponent(craft, "drive", { at: 20, providerId: "repair-yard", repairOrderId: "repair-1" });
  assert.equal(craft.components.drive.condition.wear, 0);
  assert.equal(craft.components.drive.condition.currentCondition, agedMaximum);
  assert.equal(craft.components.tool.condition.wear, toolWear);
  assert.equal(craft.components.drive.serviceHistory[0].repairOrderId, "repair-1");
});

test("routine maintenance tends the whole craft but leaves serious faults diagnosed", () => {
  const craft = {};
  ensureCraftComponents(craft, DEFINITIONS);
  applyCraftUse(craft, { drive: 0.6, tool: 0.85 });

  const result = routineServiceCraft(craft, { at: 500, providerId: "yard-exchange" });

  assert.deepEqual(result.serviced, ["drive"]);
  assert.deepEqual(result.diagnosed, ["tool"]);
  assert.equal(craft.components.drive.condition.stage, "healthy");
  assert.equal(craft.components.tool.condition.stage, "emergency");
  assert.equal(craft.components.drive.serviceHistory.at(-1).serviceType, "routine-maintenance");
});

test("seeded starting wear is distributed by component archetype data", () => {
  const craft = {};
  ensureCraftComponents(craft, DEFINITIONS, { initialWear: 0.4 });
  assert.equal(craft.components.drive.condition.wear, 0.4);
  assert.equal(craft.components.tool.condition.wear, 0.2);
});
