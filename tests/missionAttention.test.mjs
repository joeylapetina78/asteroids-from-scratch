import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowMissionTaskAttention } from "../src/systems/missionAttention.js";

const beaconTask = {
  flag: "leadReached",
  attention: "selector:.beacon-locator-panel .system-readout",
  attentionUnlessActiveBeaconId: "contract-rook-red-resource-run-5-lead",
};

test("a beacon control gets an arrow only while it needs to be tuned", () => {
  assert.equal(shouldShowMissionTaskAttention(beaconTask, {
    activeBeaconId: "yard-exchange",
  }), true);
  assert.equal(shouldShowMissionTaskAttention(beaconTask, {
    activeBeaconId: "contract-rook-red-resource-run-5-lead",
  }), false);
});

test("finishing a task clears its attention regardless of control state", () => {
  assert.equal(shouldShowMissionTaskAttention(beaconTask, {
    flags: { leadReached: true },
    activeBeaconId: "yard-exchange",
  }), false);
});

test("a dock arrow waits for the hub to be in range, and a power-down arrow for the dock", () => {
  const dock = { attention: "element:dock-toggle", flag: "docked", attentionWhenNearSiteId: "yard-exchange" };
  const power = { attention: "element:ship-power", flag: "down", attentionWhenDockedAtSiteId: "yard-exchange" };
  assert.equal(shouldShowMissionTaskAttention(dock, { flags: {} }), false, "far away: no dock arrow");
  assert.equal(shouldShowMissionTaskAttention(dock, { flags: {}, nearbySiteId: "scrap-porch" }), false, "the wrong hub: no dock arrow");
  assert.equal(shouldShowMissionTaskAttention(dock, { flags: {}, nearbySiteId: "yard-exchange" }), true, "in range: dock arrow");
  assert.equal(shouldShowMissionTaskAttention(dock, { flags: {}, dockedSiteId: "yard-exchange" }), true, "docked counts as near");
  assert.equal(shouldShowMissionTaskAttention(power, { flags: {}, nearbySiteId: "yard-exchange" }), false, "near but not docked: no power arrow");
  assert.equal(shouldShowMissionTaskAttention(power, { flags: {}, dockedSiteId: "yard-exchange" }), true, "docked: power arrow");
  assert.equal(shouldShowMissionTaskAttention(power, { flags: {}, dockedSiteId: "scrap-porch" }), false, "docked elsewhere: no power arrow");
});
