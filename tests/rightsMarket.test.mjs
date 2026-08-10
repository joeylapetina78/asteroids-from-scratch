import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createContractManager } from "../src/systems/contractManager.js";
import { depositCredits, getCredits } from "../src/systems/accounts.js";

function buy(state, contractId) {
  const manager = createContractManager({ state });
  manager.offerContract(contractId);
  return manager.acceptContract(contractId);
}

function authorityBalance(state) {
  return state.authorities["yard-exchange-authority"].account.balance;
}

test("the Yard Exchange Work Pass grants flight AND mining, and pays the authority", () => {
  const state = createGameState();
  depositCredits(state, 2000);
  assert.equal(state.legal.pilotLicense.authorizedZones.includes("copper-drift"), false);
  assert.equal(state.legal.operatingRights.mining.authorityIds.includes("copperline-prospectors"), false);

  assert.equal(buy(state, "yard-exchange-work-pass"), true);

  // Flight clearance for the home belt.
  assert.ok(state.legal.pilotLicense.authorizedZones.includes("copper-drift"));
  // Mining rights under the Copperline subsidiary — added alongside the Rook
  // permit the pilot already held.
  assert.ok(state.legal.operatingRights.mining.authorityIds.includes("copperline-prospectors"));
  assert.ok(state.legal.operatingRights.mining.authorityIds.includes("rook-industries"));
  // The player paid 800; the capital authority collected it (a transfer, not a
  // sink).
  assert.equal(getCredits(state), 1200);
  assert.equal(authorityBalance(state), 800);
});

test("the Copper Wake mining lease grants mining only, not flight", () => {
  const state = createGameState();
  depositCredits(state, 800);
  assert.equal(buy(state, "yard-copper-wake-mining-lease"), true);
  assert.ok(state.legal.operatingRights.mining.authorityIds.includes("copperline-prospectors"));
  assert.equal(state.legal.pilotLicense.authorizedZones.includes("copper-drift"), false,
    "a mining lease is not flight clearance");
  assert.equal(authorityBalance(state), 500);
});

test("an existing single flight permit still grants its one zone and routes the fee to the authority", () => {
  const state = createGameState();
  depositCredits(state, 800);
  assert.equal(buy(state, "rtc-copper-drift-flight-permit"), true);
  assert.ok(state.legal.pilotLicense.authorizedZones.includes("copper-drift"));
  assert.equal(state.legal.operatingRights.mining.authorityIds.includes("copperline-prospectors"), false,
    "a flight permit is not mining rights");
  assert.equal(authorityBalance(state), 500);
});

test("a pass cannot be bought without the credits, and grants nothing", () => {
  const state = createGameState();
  depositCredits(state, 100); // short of the 800 pass
  assert.equal(buy(state, "yard-exchange-work-pass"), false);
  assert.equal(state.legal.pilotLicense.authorizedZones.includes("copper-drift"), false);
  assert.equal(authorityBalance(state), 0);
  assert.equal(getCredits(state), 100);
});
