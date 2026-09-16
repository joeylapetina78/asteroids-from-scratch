import assert from "node:assert/strict";
import test from "node:test";
import { chapterOneInterviewMission } from "../src/content/missions/chapterOneInterview.js";
import { MISSION_ACTION_DEFINITIONS, MISSION_ACTION_TYPES } from "../src/systems/missionActions.js";

const beatById = new Map(chapterOneInterviewMission.beats.map((beat) => [beat.id, beat]));
const quickStart = beatById.get("quick-start");

test("quick start opens the interview at its own beat, and only when the run asked for it", () => {
  assert.ok(quickStart, "the quick-start beat exists");
  assert.equal(chapterOneInterviewMission.selectStartBeat({ state: { journey: { globalFlags: { quickStart: true } } } }), "quick-start");
  assert.equal(chapterOneInterviewMission.selectStartBeat({ state: { journey: {} } }), null);
  assert.equal(chapterOneInterviewMission.startBeatId, "show-license", "campaign proper still starts at the paperwork");
});

test("quick start hands over everything the first leg needs except the engine", () => {
  const actions = quickStart.onEnter;
  const shown = actions.filter((action) => action.type === "showComponent").map((action) => action.componentId);
  const floated = actions.filter((action) => action.type === "floatComponent").map((action) => action.componentId);
  assert.deepEqual([...shown].sort(), ["beacon-locator", "hull", "license", "viewport"]);
  assert.deepEqual([...floated].sort(), ["beacon-locator", "hull"]);
  assert.ok(!shown.includes("engine") && !floated.includes("engine"), "the engine stays for the lesson");
  assert.ok(actions.some((action) => action.type === "openModuleBay"));
  assert.ok(actions.some((action) => action.type === "grantContract" && action.contractId === "rook-yard-exchange-delivery"));
  const filed = actions.filter((action) => action.type === "filePaperwork").map((action) => action.componentId);
  assert.deepEqual([...filed].sort(), ["contract", "license"]);
  const beacon = actions.find((action) => action.type === "setComponentValue" && action.key === "activeBeaconId");
  assert.equal(beacon?.value, "yard-exchange", "the locator is already on the destination");
});

test("Rook's second line is said by the beat, and the beat leads straight to the engine", () => {
  const line = quickStart.onEnter.find((action) => action.type === "say");
  assert.match(line.text, /I have both right here/);
  assert.ok(line.acknowledgement, "the line waits to be read");
  assert.equal(quickStart.onAcknowledge.find((action) => action.type === "goToStep")?.stepId, "show-engine");
});

test("floatComponent is a declared action with the same shape as dockComponent", () => {
  assert.ok(MISSION_ACTION_TYPES.includes("floatComponent"));
  assert.deepEqual(MISSION_ACTION_DEFINITIONS.floatComponent.required, MISSION_ACTION_DEFINITIONS.dockComponent.required);
});
