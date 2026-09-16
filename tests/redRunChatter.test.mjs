import assert from "node:assert/strict";
import test from "node:test";
import { createJourneyDirector } from "../src/systems/journeyDirector.js";
import { createGameState } from "../src/state/gameState.js";
import { matchesEventRule } from "../src/systems/missionRules.js";

// Rook's coaching on the first mining run has to be keyed to what the PLAYER
// did. Patrol kills, hauler breaks and copper rocks all fire the same event
// names; the payload attribution is what keeps him honest.

function world() {
  const state = createGameState();
  const journeyDirector = createJourneyDirector({ state, showComponent: () => {} });
  const rookLines = () => state.journey.messages.filter((m) => m.speaker === "Rook").map((m) => m.text);
  const emit = (type, payload = {}) => {
    state.ledger.recordEvent(type, payload, { visible: false });
    journeyDirector.update();
  };
  return { state, journeyDirector, rookLines, emit };
}

function startRedRunAt(stepId) {
  const w = world();
  w.journeyDirector.startMission("chapter-1-red-work");
  // The runner reads the current beat from state on every event, so the
  // test can stand the mission where it likes without waiting on the real
  // delayed transitions.
  w.state.journey.currentStepId = stepId;
  w.state.journey.messages = [];
  w.state.journey.pendingAcknowledgement = null;
  return w;
}

test("a hunter killed by a patrol earns the rookie no credit; the rookie's own kill does", () => {
  const w = startRedRunAt("mine-red-resources");

  w.emit("enemy.destroyed", { enemyType: "hunter", cause: "patrol-defense", byPlayer: false });
  assert.deepEqual(w.rookLines(), [], "Rook says nothing about the patrol's kill");

  w.emit("enemy.destroyed", { enemyType: "hunter", cause: "weapon", byPlayer: true });
  assert.match(w.rookLines().join(" "), /Not bad, rookie/);
});

test("a hauler breaking a rock is not the rookie's first break", () => {
  const w = startRedRunAt("mine-red-resources");

  w.emit("resource.mined", { resourceType: "fuel", resourceId: "iron-nickel", brokenBy: "npc", byPlayer: false, method: "charge" });
  assert.deepEqual(w.rookLines(), []);
  assert.equal(w.state.journey.flags["explained-mined-resource"], undefined);

  w.emit("resource.mined", { resourceType: "fuel", resourceId: "iron-nickel", brokenBy: "player", byPlayer: true, method: "charge" });
  assert.match(w.rookLines().join(" "), /That's the break/);
  assert.equal(w.state.journey.flags["explained-mined-resource"], true);
});

test("breaking copper is the wrong colour, not the first break", () => {
  const w = startRedRunAt("mine-red-resources");

  // `resourceType` on this event is the coarse audio bucket, and copper
  // shares "fuel" with iron-nickel. Only `resourceId` tells them apart.
  w.emit("resource.mined", { resourceType: "fuel", resourceId: "copper", brokenBy: "player", byPlayer: true, method: "charge" });
  assert.match(w.rookLines().join(" "), /not red/);
  assert.equal(w.state.journey.flags["explained-mined-resource"], undefined);
});

test("the red-rock nag stops once a red rock has been broken", () => {
  const w = startRedRunAt("mine-red-resources");

  w.emit("ship.nearObject", { targetType: "asteroid", targetName: "fuel", resourceId: "iron-nickel" });
  assert.match(w.rookLines().join(" "), /red outline/i);

  w.state.journey.flags["explained-mined-resource"] = true;
  w.state.journey.messages = [];
  w.state.journey.flags["rule:near-red-rock-unmined:lastAt"] = 0;
  w.emit("ship.nearObject", { targetType: "asteroid", targetName: "fuel", resourceId: "iron-nickel" });
  assert.deepEqual(w.rookLines(), []);
});

test("arriving at the lead speaks to the instruments the hull actually has", () => {
  const noScanner = startRedRunAt("follow-the-lead");
  noScanner.emit("contract.leadReached", { contractId: "rook-red-resource-run-5", contractGroup: "rook-resource-run", hasScanner: false });
  assert.match(noScanner.rookLines().join(" "), /No scanner on this hull/);
  assert.equal(noScanner.state.journey.currentStepId, "mine-red-resources", "arrival advances the beat");

  const scanner = startRedRunAt("follow-the-lead");
  scanner.emit("contract.leadReached", { contractId: "rook-red-resource-run-5", contractGroup: "rook-resource-run", hasScanner: true });
  assert.match(scanner.rookLines().join(" "), /Fire off a scan/);
});

test("Rook complains about a bloom on the hull in any mission, and only counts the big one once", () => {
  const w = startRedRunAt("mine-red-resources");

  w.emit("life.harvested", { type: "bloom", crystals: 2 });
  assert.match(w.rookLines().join(" "), /bloom across the hood/);

  w.state.journey.messages = [];
  w.emit("life.greatbloomSurfacing", { fromRock: false });
  assert.match(w.rookLines().join(" "), /Told you they get big/);
  assert.equal(w.state.journey.globalFlags.rookWarnedGreatbloom, true);

  // A new mission wipes journey.flags but not globalFlags: once ever.
  w.journeyDirector.startMission("chapter-1-new-ship");
  w.state.journey.messages = [];
  w.emit("life.greatbloomSurfacing", { fromRock: true });
  assert.deepEqual(w.rookLines(), []);
});

test("the bloom warning waits while the interview holds the comms floor", () => {
  const w = world();
  w.journeyDirector.start();
  w.state.journey.mission.status = "active";
  w.state.journey.currentStepId = "show-license";
  w.state.journey.pendingAcknowledgement = null;
  w.state.journey.messages = [];

  w.emit("life.harvested", { type: "bloom", crystals: 1 });
  assert.deepEqual(w.rookLines(), []);
});

test("forbidFlag and payloadNotEquals are declarative", () => {
  const state = createGameState();
  const rule = { id: "r", eventType: "x", forbidFlag: "done", payloadNotEquals: { resourceId: ["iron-nickel", "common"] } };

  assert.equal(matchesEventRule(rule, { type: "x", payload: { resourceId: "copper" } }, { state }), true);
  assert.equal(matchesEventRule(rule, { type: "x", payload: { resourceId: "common" } }, { state }), false);
  state.journey.flags.done = true;
  assert.equal(matchesEventRule(rule, { type: "x", payload: { resourceId: "copper" } }, { state }), false);
});

test("Rook watches the count and says when to head home", () => {
  const w = startRedRunAt("mine-red-resources");
  const progress = (held, required, milestone) => w.emit("contract.cargoProgress", {
    contractId: "rook-red-resource-run-5", contractGroup: "rook-resource-run", resourceType: "iron-nickel",
    held, required, remaining: required - held, milestone,
  });

  progress(3, 5, "half");
  assert.match(w.rookLines().join(" "), /Halfway/);
  progress(4, 5, "one-more");
  assert.match(w.rookLines().join(" "), /One more/);

  w.emit("contract.cargoReady", { contractId: "rook-red-resource-run-5", contractGroup: "rook-resource-run", held: 5, required: 5, remaining: 0, milestone: "full" });
  assert.match(w.rookLines().join(" "), /head home/);
  assert.equal(w.state.journey.flags.cargoReady, true);

  // Still scooping after the count: told to stop, not congratulated. (The
  // first-scoop explainer has long since fired in real play.)
  w.state.journey.flags["explained-collected-resource"] = true;
  w.state.journey.messages = [];
  w.emit("resource.collected", { resourceType: "iron-nickel", amount: 1 });
  assert.match(w.rookLines().join(" "), /Head back/);
});

test("Rook leans on the reversing drive once Nara opens the real shelf, in any mission", () => {
  const w = startRedRunAt("rook-wrap-up");
  w.emit("hub.shopShelfOpened", { siteId: "yard-exchange", serviceId: "yard-modworks", stockGroup: "restock-1" });
  assert.match(w.rookLines().join(" "), /reversing drive/);
  assert.equal(w.state.journey.globalFlags.rookPushedReversingDrive, true);
});

test("at the Yard dock Rook asks for power-down, and stops recommending haulers", () => {
  const w = world();
  w.journeyDirector.start();
  w.state.journey.mission.status = "active";
  w.state.journey.currentStepId = "dock-yard-exchange";
  w.state.journey.pendingAcknowledgement = null;
  w.state.journey.messages = [];

  w.emit("npc.enteredViewport", { npcType: "route-hauler", npcName: "Hauler 3" });
  assert.deepEqual(w.rookLines(), [], "route advice ends before the dock");

  w.emit("site.docked", { siteId: "yard-exchange", siteName: "Yard Exchange", siteType: "hub" });
  assert.match(w.rookLines().join(" "), /power her down/);

  // Already off when docking: nothing to remind.
  const off = world();
  off.journeyDirector.start();
  off.state.journey.mission.status = "active";
  off.state.journey.currentStepId = "dock-yard-exchange";
  off.state.journey.pendingAcknowledgement = null;
  off.state.journey.flags.shipPoweredDown = true;
  off.state.journey.messages = [];
  off.emit("site.docked", { siteId: "yard-exchange", siteName: "Yard Exchange", siteType: "hub" });
  assert.deepEqual(off.rookLines(), []);
});
