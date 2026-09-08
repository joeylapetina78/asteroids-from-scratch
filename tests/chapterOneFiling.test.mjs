import assert from "node:assert/strict";
import test from "node:test";
import { chapterOneInterviewMission } from "../src/content/missions/chapterOneInterview.js";
import { MISSION_ACTION_DEFINITIONS, MISSION_ACTION_TYPES } from "../src/systems/missionActions.js";

const beats = chapterOneInterviewMission.beats;
const beatIds = beats.map((beat) => beat.id);
const beatById = new Map(beats.map((beat) => [beat.id, beat]));
const considerationById = new Map(chapterOneInterviewMission.considerations.map((c) => [c.id, c]));

test("filing counts from the moment the drawer is taught, not only when asked", () => {
  // A player who files as soon as the button appears was made to pull the paper
  // back out and file it again, because the flag only counted inside one beat.
  ["contract-filed", "license-filed"].forEach((id) => {
    const consideration = considerationById.get(id);
    assert.ok(consideration, `${id} exists`);
    assert.equal(consideration.fromBeat, "open-drawer");
    assert.equal(consideration.throughBeat, "file-contract");

    const from = beatIds.indexOf(consideration.fromBeat);
    const through = beatIds.indexOf(consideration.throughBeat);
    assert.ok(from >= 0 && through >= 0, "both endpoints are real beats");
    assert.ok(from < through, "the window spans the beats between the drawer and the ask");
  });
});

test("the filing beat checks whether it is already done before it speaks", () => {
  const beat = beatById.get("file-contract");
  const skip = beat.onEnter.find((action) => action.type === "goToStepIfFlags");

  assert.ok(skip, "the beat tests the flags on entry");
  assert.deepEqual([...skip.flags].sort(), ["contractFiled", "licenseFiled"]);
  assert.ok(beatById.has(skip.stepId), `${skip.stepId} is a real beat`);

  // Order matters: the check must come BEFORE Rook's line, or the player is
  // asked to do the thing and only then told they already did it.
  const skipIndex = beat.onEnter.indexOf(skip);
  const sayIndex = beat.onEnter.findIndex((action) => action.type === "say");
  assert.ok(sayIndex === -1 || skipIndex < sayIndex, "the check runs before the beat speaks");
});

test("the already-filed beat rejoins the normal sequence", () => {
  const beat = beatById.get("paperwork-already-filed");
  assert.ok(beat, "the alternate beat exists");
  assert.ok(beat.onEnter.some((a) => a.type === "say" && a.acknowledgement),
    "Rook says something different and waits for the player");

  const rejoin = beat.onAcknowledge.find((a) => a.type === "goToStep");
  const normal = beatById.get("file-contract").transitions.find((t) => t.nextStepId);
  assert.equal(rejoin.stepId, normal.nextStepId,
    "both paths continue to the same next beat, so the tutorial cannot fork");
});

test("goToStepIfFlags is a declared action, not an undeclared one that silently no-ops", () => {
  assert.ok(MISSION_ACTION_TYPES.includes("goToStepIfFlags"), "the action is in the schema");
  assert.deepEqual([...MISSION_ACTION_DEFINITIONS.goToStepIfFlags.required].sort(), ["flags", "stepId"]);
});
