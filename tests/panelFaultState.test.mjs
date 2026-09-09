import test from "node:test";
import assert from "node:assert/strict";

import { COCKPIT_MODULE_IDS } from "../src/systems/cockpitLayout.js";
import { COMPONENT_STATE_BY_PANEL_ID } from "../src/systems/componentRegistry.js";
import { PANEL_STAGES, createPanelCondition } from "../src/systems/panelMaintenance.js";
import { CAMPAIGN_BROKEN_COMPONENT_IDS } from "../src/content/ships/campaignLoadout.js";

// The cockpit paints a dead unit off the LAST rung of the shared wear ladder.
// If that name ever changes, the visual silently stops appearing — nothing
// throws, panels just quietly stop looking broken.
test("failed is the terminal stage of the shared wear ladder", () => {
  assert.equal(PANEL_STAGES.at(-1), "failed");
  assert.ok(PANEL_STAGES.includes("degraded"));
  assert.ok(PANEL_STAGES.includes("emergency"));
  assert.equal(createPanelCondition().stage, "healthy");
});

// The fault reflection walks every cockpit module and looks its component up in
// this map. A module missing from the map can never show a fault.
test("every cockpit module that is a ship system can report a fault", () => {
  const unmapped = COCKPIT_MODULE_IDS.filter((panelId) => !COMPONENT_STATE_BY_PANEL_ID[panelId]);
  assert.deepEqual(unmapped, [], `these cockpit modules have no component state: ${unmapped}`);
});

test("the campaign's broken units are real component states", () => {
  const known = new Set(Object.values(COMPONENT_STATE_BY_PANEL_ID));
  CAMPAIGN_BROKEN_COMPONENT_IDS.forEach((componentId) => {
    assert.ok(known.has(componentId), `${componentId} is not a panel-backed component`);
  });
});
