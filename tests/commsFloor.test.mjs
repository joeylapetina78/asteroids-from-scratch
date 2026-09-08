import assert from "node:assert/strict";
import test from "node:test";
import { COMMS_SOURCES, createCommsDirector } from "../src/systems/commsDirector.js";
import { createJourneyDirector } from "../src/systems/journeyDirector.js";
import { createGameState } from "../src/state/gameState.js";
import { chapterOneInterviewMission } from "../src/content/missions/chapterOneInterview.js";

function world() {
  const state = createGameState();
  const spoken = [];
  const journeyDirector = createJourneyDirector({
    state,
    showComponent: () => {},
    // sayAsNpc is the seam commsDirector delivers through.
  });
  const realSay = journeyDirector.sayAsNpc;
  journeyDirector.sayAsNpc = (...args) => { spoken.push(args[0]); return realSay(...args); };
  const comms = createCommsDirector({ state, journeyDirector });
  return { state, journeyDirector, comms, spoken };
}

test("the interview declares that it speaks alone until the player has flown", () => {
  assert.equal(chapterOneInterviewMission.exclusiveCommsUntilStepId, "first-thrust");
});

test("Murmur and the hubs cannot talk over Rook during the induction", () => {
  const { state, journeyDirector, comms, spoken } = world();
  state.journey.mission = { id: "chapter-1-yard-exchange", status: "active" };
  state.journey.completedStepIds = ["show-hull", "open-drawer"];

  assert.equal(journeyDirector.isCommsFloorHeld(), true, "the floor is held before first thrust");

  const delivered = comms.say({
    source: COMMS_SOURCES.worldNpc, speaker: "Murmur",
    text: "Psst. Captain. Meet the wall people.",
  });
  assert.equal(delivered, false, "Murmur does not reach the panel");
  assert.ok(!spoken.includes("Murmur"), "and nothing of his was rendered");

  // A hub hailing about paperwork is held back too — priority does not buy a
  // way past the induction.
  assert.equal(comms.say({
    source: COMMS_SOURCES.hubAuthority, speaker: "Yard Control", text: "Present your VIN.",
  }), false);
});

test("once the player has flown, the world gets its say", () => {
  const { state, journeyDirector, comms } = world();
  state.journey.mission = { id: "chapter-1-yard-exchange", status: "active" };
  state.journey.completedStepIds = ["show-hull", "power-on", "first-thrust"];

  assert.equal(journeyDirector.isCommsFloorHeld(), false,
    "the floor is released the moment first-thrust is behind the player");
});

test("a mission that claims no floor never blocks anyone", () => {
  const { state, journeyDirector, comms, spoken } = world();
  state.journey.mission = { id: "chapter-1-red-work", status: "active" };
  state.journey.completedStepIds = [];

  assert.equal(journeyDirector.isCommsFloorHeld(), false);
  comms.say({ source: COMMS_SOURCES.worldNpc, speaker: "Murmur", text: "Hello." });
  assert.ok(spoken.includes("Murmur"));
});

test("a completed interview releases the floor even if first-thrust was skipped", () => {
  // Belt and braces: a mission that ends some other way must not leave the
  // world permanently muted.
  const { state, journeyDirector } = world();
  state.journey.mission = { id: "chapter-1-yard-exchange", status: "completed" };
  state.journey.completedStepIds = [];
  assert.equal(journeyDirector.isCommsFloorHeld(), false);
});
