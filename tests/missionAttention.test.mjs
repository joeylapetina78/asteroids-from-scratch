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
