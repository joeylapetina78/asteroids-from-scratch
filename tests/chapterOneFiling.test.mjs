import assert from "node:assert/strict";
import test from "node:test";
import { chapterOneInterviewMission } from "../src/content/missions/chapterOneInterview.js";
import { MISSION_ACTION_DEFINITIONS, MISSION_ACTION_TYPES } from "../src/systems/missionActions.js";

const beats = chapterOneInterviewMission.beats;
const beatIds = beats.map((beat) => beat.id);
const beatById = new Map(beats.map((beat) => [beat.id, beat]));
const considerationById = new Map(chapterOneInterviewMission.considerations.map((c) => [c.id, c]));

test("filing counts throughout the drawer beat", () => {
  ["contract-filed", "license-filed"].forEach((id) => {
    const consideration = considerationById.get(id);
    assert.ok(consideration, `${id} exists`);
    assert.equal(consideration.fromBeat, "reveal-drawer");
    assert.equal(consideration.throughBeat, "reveal-drawer");

    const from = beatIds.indexOf(consideration.fromBeat);
    const through = beatIds.indexOf(consideration.throughBeat);
    assert.ok(from >= 0 && through >= 0, "both endpoints are real beats");
    assert.equal(from, through, "filing is observed in the beat that reveals the drawer");
  });
});

test("both filed sheets reveal the module bay next", () => {
  const beat = beatById.get("reveal-drawer");
  const transition = beat.transitions.find((candidate) => candidate.nextStepId === "reveal-module-bay");
  assert.ok(transition, "the filing beat leads to the hardware induction");
  assert.deepEqual([...transition.requiresFlags].sort(), ["contractFiled", "licenseFiled"]);
});

test("goToStepIfFlags is a declared action, not an undeclared one that silently no-ops", () => {
  assert.ok(MISSION_ACTION_TYPES.includes("goToStepIfFlags"), "the action is in the schema");
  assert.deepEqual([...MISSION_ACTION_DEFINITIONS.goToStepIfFlags.required].sort(), ["flags", "stepId"]);
});

test("the opening reveals paperwork before hardware", () => {
  const acknowledgedStep = (id) => beatById.get(id).onAcknowledge?.find((action) => action.type === "goToStep")?.stepId;
  assert.equal(chapterOneInterviewMission.startBeatId, "show-license");
  assert.equal(acknowledgedStep("want-stars"), "show-license");
  assert.equal(acknowledgedStep("show-license"), "offer-contract");
  assert.equal(acknowledgedStep("reveal-viewport"), "try-scanner");
  assert.ok(beatById.get("show-license").onEnter.some(
    (action) => action.type === "placePaperworkOnDesk" && action.componentId === "license",
  ));
  assert.ok(beatById.get("reveal-module-bay").onEnter.some(
    (action) => action.type === "setFlag" && action.flag === "moduleBayRevealed",
  ));
});

test("the arrival paperwork beat waits for a real patrol identity request", () => {
  const flightBeatIds = ["try-scanner", "power-on", "first-thrust", "find-yard-exchange"];

  flightBeatIds.forEach((beatId) => {
    const transitions = beatById.get(beatId).transitions.filter(
      (transition) => transition.nextStepId === "yard-traffic-check",
    );
    assert.equal(transitions.length, 1, `${beatId} has one route into the traffic check`);
    assert.equal(transitions[0].eventType, "authority.identityRequested",
      `${beatId} waits for the patrol's actual request`);
  });

  const prematureEvents = new Set(["site.enteredViewport", "site.nearby"]);
  assert.equal(
    flightBeatIds.some((beatId) => beatById.get(beatId).transitions.some(
      (transition) => transition.nextStepId === "yard-traffic-check" && prematureEvents.has(transition.eventType),
    )),
    false,
    "proximity alone never stages an inspection",
  );
});
