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
  assert.deepEqual([...shown].sort(), ["beacon-locator", "cargo", "hull", "viewport"]);
  const emptyRacks = actions.filter((action) => action.type === "showEmptyRack").map((action) => action.componentId);
  assert.deepEqual(emptyRacks, ["processor"], "the dead processor is shown as the empty rack it is, not fitted");
  assert.deepEqual([...floated].sort(), ["beacon-locator", "hull"]);
  assert.ok(!shown.includes("engine") && !floated.includes("engine"), "the engine stays for the lesson");
  assert.ok(actions.some((action) => action.type === "openModuleBay"));
  assert.ok(!actions.some((action) => ["grantContract", "filePaperwork"].includes(action.type)), "nothing is signed or filed for the player");
  const beacon = actions.find((action) => action.type === "setComponentValue" && action.key === "activeBeaconId");
  assert.equal(beacon?.value, "yard-exchange", "the locator is already on the destination");
});

test("Rook's second line is said by the beat, and the papers come out with the rundown", () => {
  const line = quickStart.onEnter.find((action) => action.type === "say");
  assert.match(line.text, /I have both right here/);
  assert.ok(line.acknowledgement, "the line waits to be read");
  assert.equal(quickStart.onAcknowledge.find((action) => action.type === "goToStep")?.stepId, "qs-rundown");
  const rundown = beatById.get("qs-rundown");
  assert.ok(rundown.onEnter.some((action) => action.type === "placePaperworkOnDesk" && action.componentId === "license"));
  assert.ok(rundown.onEnter.some((action) => action.type === "offerContract" && action.contractId === "rook-yard-exchange-delivery"));
  assert.ok(!rundown.onEnter.some((action) => action.type === "filePaperwork"), "the sheets stay out; putting them away is the player's");
});

test("signing leads to the drive, and the drive is the module-bay lesson", () => {
  const sign = beatById.get("qs-sign");
  const accepted = sign.transitions.find((transition) => transition.eventType === "contract.accepted");
  assert.equal(accepted?.nextStepId, "qs-fit-engine");
  assert.equal(beatById.get("qs-fit-engine").onAcknowledge.find((action) => action.type === "goToStep")?.stepId, "qs-engine-fitted");
  const fitted = beatById.get("qs-engine-fitted");
  assert.ok(fitted.onEnter.some((action) => action.type === "showComponent" && action.componentId === "engine"));
  assert.ok(fitted.onEnter.some((action) => action.type === "dockComponent" && action.componentId === "engine"), "racked, so the player switches it on");
  const moved = fitted.transitions.find((transition) => transition.eventType === "component.dragged");
  assert.deepEqual([...moved.requiresFlags].sort(), ["enginePanelAdded", "enginePanelMoved"]);
  assert.equal(moved.nextStepId, "power-on");
  const considerations = chapterOneInterviewMission.considerations.filter((c) => c.fromBeat === "qs-engine-fitted");
  assert.deepEqual(considerations.map((c) => c.setFlag).sort(), ["enginePanelAdded", "enginePanelMoved"]);
});

test("floatComponent is a declared action with the same shape as dockComponent", () => {
  assert.ok(MISSION_ACTION_TYPES.includes("floatComponent"));
  assert.deepEqual(MISSION_ACTION_DEFINITIONS.floatComponent.required, MISSION_ACTION_DEFINITIONS.dockComponent.required);
});
