import assert from "node:assert/strict";
import test from "node:test";
import { createJourneyDirector } from "../src/systems/journeyDirector.js";
import { createGameState } from "../src/state/gameState.js";

// Nara's processor lesson is an interlude: it interrupts whatever mission is
// open when the processor is bought, and hands that mission back — same beat,
// same flags — when it is done or waved off.

function world() {
  const state = createGameState();
  const calls = [];
  const journeyDirector = createJourneyDirector({
    state,
    showComponent: () => {},
    giveResource: (type, amount) => calls.push(["give", type, amount]),
    damageHull: (amount) => calls.push(["damage", amount]),
    drainFuel: (amount) => calls.push(["drain", amount]),
  });
  const lines = (speaker) => state.journey.messages.filter((m) => m.speaker === speaker).map((m) => m.text);
  const emit = (type, payload = {}) => { state.ledger.recordEvent(type, payload, { visible: false }); journeyDirector.update(); };
  return { state, journeyDirector, calls, lines, emit };
}

function midRedRun() {
  const w = world();
  w.journeyDirector.startMission("chapter-1-red-work");
  w.state.journey.currentStepId = "mine-red-resources";
  w.state.journey.flags["explained-mined-resource"] = true;
  w.state.journey.messages = [];
  w.state.journey.pendingAcknowledgement = null;
  return w;
}

test("buying the processor mid-run puts the run aside and offers the lesson", () => {
  const w = midRedRun();
  w.emit("component.purchased", { componentId: "processor", offerId: "processor-mk1", price: 400 });

  assert.equal(w.state.journey.mission.id, "modworks-processor-lesson");
  assert.equal(w.state.journey.currentStepId, "offer");
  assert.match(w.lines("Nara Coil").join(" "), /walk you through/);
  assert.equal(w.state.journey.pendingAcknowledgement.label, "Walk Me Through It");
  assert.equal(w.state.journey.pendingAcknowledgement.decline.label, "I'm Good");
  assert.equal(w.state.journey.interludeStack.length, 1);
  assert.equal(w.state.journey.interludeStack[0].mission.id, "chapter-1-red-work");
});

test("waving the lesson off hands the run back exactly where it was", () => {
  const w = midRedRun();
  w.emit("component.purchased", { componentId: "processor", offerId: "processor-mk1", price: 400 });
  w.journeyDirector.acknowledge("decline");

  assert.equal(w.state.journey.mission.id, "chapter-1-red-work");
  assert.equal(w.state.journey.mission.status, "active");
  assert.equal(w.state.journey.currentStepId, "mine-red-resources");
  assert.equal(w.state.journey.flags["explained-mined-resource"], true, "the run's flags come back");
  assert.match(w.lines("Nara Coil").join(" "), /Suit yourself/);
  assert.deepEqual(w.calls, [], "no dent, no bleed, when the lesson is declined");
  assert.equal(w.state.journey.interludeStack.length, 0);

  // The run is live again: its own considerations answer events.
  w.state.journey.messages = [];
  w.emit("enemy.destroyed", { enemyType: "hunter", cause: "weapon", byPlayer: true });
  assert.match(w.lines("Rook").join(" "), /Not bad, rookie/);
});

test("the lesson announces each thing it does to the ship, then does it on the click", async () => {
  const w = midRedRun();
  w.emit("component.purchased", { componentId: "processor", offerId: "processor-mk1", price: 400 });
  w.journeyDirector.acknowledge("confirm");

  // She says she is about to dent the hull; nothing has happened yet.
  assert.equal(w.state.journey.currentStepId, "intake");
  assert.match(w.lines("Nara Coil").join(" "), /put a dent in your hull/);
  assert.deepEqual(w.calls, []);
  w.journeyDirector.acknowledge("confirm");
  assert.equal(w.state.journey.currentStepId, "patch");
  assert.deepEqual(w.calls, [["damage", 30], ["give", "iron-nickel", 3]]);
  assert.match(w.lines("Nara Coil").join(" "), /fills your repair reserve/);

  w.emit("resource.processingRejected", { resourceType: "iron-nickel", output: "fuel", reason: "incompatible-resource-output" });
  assert.match(w.lines("Nara Coil").join(" "), /Wrong socket/);

  w.emit("processor.routed", { output: "hull-repair" });
  assert.equal(w.state.journey.flags.routedHull, true);
  w.calls.length = 0;
  w.emit("resource.processed", { resourceType: "iron-nickel", output: "hull-repair", amount: 20 });
  // The step change is on a short delay, and events during it are held back
  // and replayed after — so wait for it, as the game would.
  await new Promise((resolve) => setTimeout(resolve, 1400));
  // Same again for the drive: announced, then done on the click.
  assert.equal(w.state.journey.currentStepId, "bleed");
  assert.deepEqual(w.calls, []);
  w.journeyDirector.acknowledge("confirm");
  assert.equal(w.state.journey.currentStepId, "refuel");
  assert.deepEqual(w.calls, [["drain", 400], ["give", "water-ice", 2]]);
  w.calls.length = 0;
  w.emit("processor.routed", { output: "fuel" });
  w.emit("resource.processed", { resourceType: "water-ice", output: "fuel", amount: 250 });
  await new Promise((resolve) => setTimeout(resolve, 1400));

  // And the hold: crystal is money, not ship.
  assert.equal(w.state.journey.currentStepId, "hold");
  assert.deepEqual(w.calls, [["give", "crystal-matrix", 1]]);
  assert.match(w.lines("Nara Coil").join(" "), /Finley at Supply/);
  w.emit("resource.processed", { resourceType: "crystal-matrix", output: "cargo", amount: 1 });

  assert.match(w.lines("Nara Coil").join(" "), /Route before you pick up/);
  assert.equal(w.state.journey.mission.id, "chapter-1-red-work", "the run is handed back");
  assert.equal(w.state.journey.currentStepId, "mine-red-resources");
  assert.equal(w.state.journey.interludeStack.length, 0);
});

test("the lesson is offered once, and never when nothing is running", () => {
  const w = world();
  w.state.journey.mission = null;
  w.emit("component.purchased", { componentId: "processor", offerId: "processor-mk1", price: 400 });
  assert.equal(w.state.journey.mission.id, "modworks-processor-lesson", "free play still gets the lesson");
  w.journeyDirector.acknowledge("decline");
  assert.equal(w.state.journey.mission, null, "and free play is handed back its nothing");
  assert.equal(w.state.journey.globalFlags.naraOfferedProcessorLesson, true);
});
