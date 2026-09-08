import assert from "node:assert/strict";
import test from "node:test";
import { hubServiceDefinitions } from "../src/content/hubs/yardExchangeServices.js";
import { getProcessorOutputs, normalizeProcessorOutput } from "../src/components/componentRules.js";
import { createGameState } from "../src/state/gameState.js";

function modworksOffers() {
  const services = Object.values(hubServiceDefinitions).flatMap((entry) =>
    Array.isArray(entry) ? entry : Object.values(entry ?? {}).flat());
  const modworks = services.find((service) => Array.isArray(service?.componentOffers));
  return modworks?.componentOffers ?? [];
}

test("the yard does not sell a pilot the drive already bolted to their ship", () => {
  const offers = modworksOffers();
  const rook = offers.find((offer) => offer.id === "rook-standard-braking-drive");
  const vektor = offers.find((offer) => offer.id === "vektor-reversing-drive");

  assert.ok(rook, "the Rook Standard offer still exists for pilots who arrive on something else");
  assert.ok(vektor, "and a Standard owner has something to move up to");
  // The guard that makes that possible: an offer can be satisfied by the drive
  // the ship is RUNNING, not only by an upgrade record.
  assert.equal(rook.installedWhenEngineModelId, "rook-standard-drive");
  assert.equal(vektor.installedWhenEngineModelId, "vektor-reversing-drive");
  assert.notEqual(rook.apply.engine.engineModelId, vektor.apply.engine.engineModelId);
});

test("replacing a failed processor restores real routing", () => {
  // The player's complaint in one test: the shop said "already installed",
  // which was true and useless, because the fitted unit was dead.
  const state = createGameState();
  const c = state.components;
  c.engine.installed = true; c.miner.installed = true; c.hull.installed = true; c.cargoHold.installed = true;
  c.processor.installed = true;
  c.processor.condition.stage = "failed";
  normalizeProcessorOutput(c);

  assert.deepEqual(getProcessorOutputs(c).map((o) => o.id), ["cargo"], "a dead unit routes nowhere else");

  // Buying a replacement fits a NEW unit, so the condition record starts clean.
  c.processor.condition = { ...c.processor.condition, stage: "healthy", wear: 0, currentCondition: 100 };
  normalizeProcessorOutput(c);

  const outputs = getProcessorOutputs(c).map((o) => o.id);
  assert.ok(outputs.includes("fuel") && outputs.includes("ammo") && outputs.includes("cargo"),
    `a replaced processor converts again (got ${outputs.join(", ")})`);
});
