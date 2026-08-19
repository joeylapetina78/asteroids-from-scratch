import assert from "node:assert/strict";
import test from "node:test";
import { chapterOneContracts } from "../src/content/contracts/chapterOneContracts.js";
import { hubServiceDefinitions } from "../src/content/hubs/yardExchangeServices.js";
import { createGameState } from "../src/state/gameState.js";
import { depositCredits, getCredits } from "../src/systems/accounts.js";
import { createContractManager } from "../src/systems/contractManager.js";

function buy(state, contractId) {
  const manager = createContractManager({ state });
  manager.offerContract(contractId);
  return manager.acceptContract(contractId);
}

test("Travel Authority offers exactly one work pass for each of the nine hubs", () => {
  const travel = hubServiceDefinitions["yard-exchange"].find((service) => service.serviceType === "permits");
  assert.equal(travel.contractIds.length, 9);
  assert.ok(travel.contractIds.every((id) => id === "yard-exchange-work-pass" || /^territory-.+-work-pass$/.test(id)));
  const definitions = new Set(chapterOneContracts.map((contract) => contract.id));
  travel.contractIds.forEach((id) => assert.ok(definitions.has(id), `${id} has a contract definition`));
  assert.equal(travel.contractIds.includes("rtc-copper-drift-flight-permit"), false);
  assert.equal(travel.contractIds.includes("yard-copper-wake-mining-lease"), false);
  assert.equal(travel.contractIds.includes("rtc-the-ledge-docking-permit"), false);
});

test("the Yard Exchange pass grants only the new territorial bundle", () => {
  const state = createGameState();
  depositCredits(state, 2000);
  assert.equal(buy(state, "yard-exchange-work-pass"), true);
  assert.equal(getCredits(state), 1200);
  assert.equal(state.authorities["yard-exchange-authority"].account.balance, 800);
  assert.equal(state.legal.pilotLicense.authorizedZones.includes("copper-drift"), false, "retired zone permits stay dormant");
  assert.equal(state.legal.operatingRights.mining.authorityIds.includes("copperline-prospectors"), false, "retired regional grants stay dormant");
  assert.deepEqual(state.legal.operatingRights.territories.grants[0].rights, ["transit", "docking", "mining", "trade"]);
});

test("a pass cannot be bought without the credits and grants nothing", () => {
  const state = createGameState();
  depositCredits(state, 100);
  assert.equal(buy(state, "yard-exchange-work-pass"), false);
  assert.equal(state.legal.operatingRights.territories.grants.length, 0);
  assert.equal(getCredits(state), 100);
});

test("a hub work pass grants only that institution's territory and pays its treasury", () => {
  const state = createGameState();
  const openingTreasury = state.logistics.institutions["scrap-forge"].accounts.operating.balance;
  depositCredits(state, 1000);
  assert.equal(buy(state, "territory-scrap-porch-work-pass"), true);
  const grant = state.legal.operatingRights.territories.grants[0];
  assert.equal(grant.territoryId, "territory:scrap-porch");
  assert.deepEqual(grant.rights, ["transit", "docking", "mining", "trade"]);
  assert.equal(state.authorities["scrap-porch-authority"].account.balance, 420);
  assert.equal(state.logistics.institutions["scrap-forge"].accounts.operating.balance, openingTreasury + 420);
  assert.equal(getCredits(state), 580);
});
