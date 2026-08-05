import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { inspectActor } from "../src/systems/actorInspector.js";
import { recordDiagnostic } from "../src/systems/diagnostics.js";
import { ensureCraftComponents } from "../src/systems/componentCondition.js";

test("an institution card projects the condition of its active representative craft", () => {
  const state = createGameState();
  const craft = { id: "test-craft", name: "Test Craft" };
  ensureCraftComponents(craft, [
    { id: "drive", label: "Drive" },
    { id: "hull", label: "Hull" },
  ]);
  craft.components.drive.condition.currentCondition = 61;
  craft.components.drive.condition.stage = "degraded";

  recordDiagnostic(state, "test-firm", {
    actorName: "Test Firm", actorKind: "institution", state: "working",
  }, 1);
  recordDiagnostic(state, craft.id, {
    actorName: craft.name,
    actorKind: "ship",
    controllerId: "test-firm",
    state: "working",
    detail: { components: craft.components },
  }, 2);

  const view = inspectActor(state, "test-firm");
  assert.deepEqual(view.condition.representedBy, { id: craft.id, name: craft.name });
  assert.equal(view.condition.components.find((component) => component.id === "drive").currentCondition, 61);
  assert.equal(view.condition.components.find((component) => component.id === "drive").stage, "degraded");
});

test("representative selection prefers a craft doing work over an idle fleetmate", () => {
  const state = createGameState();
  recordDiagnostic(state, "fleet", { actorName: "Fleet", actorKind: "institution", state: "working" }, 1);
  for (const [id, name, actorState] of [["idle", "Idle One", "free"], ["active", "Active Two", "committed"]]) {
    const craft = { id, name };
    ensureCraftComponents(craft, [{ id: "drive", label: "Drive" }]);
    recordDiagnostic(state, id, {
      actorName: name, actorKind: "ship", controllerId: "fleet", state: actorState,
      detail: { components: craft.components },
    }, 2);
  }
  assert.equal(inspectActor(state, "fleet").condition.representedBy.id, "active");
});
