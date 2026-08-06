import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createSprcOperation } from "../src/systems/sprcOperation.js";
import { acquireWreckForSprc, authorizeWreckSalvage, completeWreckSalvage, createWreckSalvageContract, registerOwnedWreck } from "../src/systems/wreckRegistry.js";

function ownedWreck(state, at = 100) {
  return registerOwnedWreck(state, {
    shipId: "ship:one", shipName: "One", position: { x: 12, y: 34 }, cause: "incursion",
    identity: { shipVin: "VIN-1", ownerInstitutionId: "carrier:yard-hauler", titleId: "TITLE-VIN-1", titleStatus: "active" },
    at,
  });
}

test("destruction preserves title and declares a recoverable material plan", () => {
  const state = createGameState();
  const wreck = ownedWreck(state);
  assert.equal(wreck.ownerInstitutionId, "carrier:yard-hauler");
  assert.equal(wreck.titleStatus, "wreck-title");
  assert.equal(wreck.status, "awaiting-owner-disposition");
  assert.deepEqual(wreck.plannedSalvageYield.produced, { "hull-plate": 2, "machine-part": 2 });
});

test("SPRC buys a needed wreck without crossing protected cash", () => {
  const state = createGameState();
  const wreck = ownedWreck(state);
  const owner = state.logistics.institutions["carrier:yard-hauler"].accounts.operating;
  const ownerBefore = owner.balance;
  const sprcBefore = state.sprc.account.balance;
  const result = acquireWreckForSprc(state, { wreckId: wreck.id, at: 200 });
  assert.equal(result.acquired, true);
  assert.equal(wreck.previousOwnerInstitutionId, "carrier:yard-hauler");
  assert.equal(wreck.ownerInstitutionId, "sprc");
  assert.equal(wreck.titleStatus, "transferred-for-salvage");
  assert.equal(owner.balance, ownerBefore + result.evaluation.acquisitionPrice);
  assert.equal(state.sprc.account.balance, sprcBefore - result.evaluation.acquisitionPrice);
  assert.equal(state.sprc.account.committed, result.evaluation.recoveryFee + result.evaluation.dismantlingCost);
});

test("SPRC refuses acquisition when future recovery would cross its reserve", () => {
  const state = createGameState();
  const wreck = ownedWreck(state);
  state.sprc.account.balance = state.sprc.operatingPlan.protectedCashReserve + 10;
  const result = acquireWreckForSprc(state, { wreckId: wreck.id });
  assert.equal(result.acquired, false);
  assert.equal(result.evaluation.reason, "protected-cash");
  assert.equal(wreck.ownerInstitutionId, "carrier:yard-hauler");
});

test("only SPRC-owned wrecks become recovery contracts", () => {
  const state = createGameState();
  const wreck = ownedWreck(state);
  assert.equal(createWreckSalvageContract(state, { wreckId: wreck.id }), null);
  acquireWreckForSprc(state, { wreckId: wreck.id });
  const contract = createWreckSalvageContract(state, { wreckId: wreck.id });
  assert.equal(contract.issuer, "Scrap Porch Recovery Cooperative");
  assert.equal(contract.reward.credits, 120);
});

test("authorized delivery queues real dismantling before materials exist", () => {
  let clock = 1_000;
  const state = createGameState();
  const manager = createSprcOperation({ state, now: () => clock, registerContractDefinition: () => {} });
  const wreck = ownedWreck(state, clock);
  acquireWreckForSprc(state, { wreckId: wreck.id, at: clock });
  const contract = createWreckSalvageContract(state, { wreckId: wreck.id });
  state.contracts.records[contract.id] = { ...contract, status: "active" };
  authorizeWreckSalvage(state, { wreckId: wreck.id, authorizationId: "SALVAGE-1", salvagerId: "player", destinationSiteId: "scrap-porch", at: clock });
  const platesBefore = state.sprc.inventories.produced["hull-plate"];
  assert.equal(completeWreckSalvage(state, { wreckId: wreck.id, salvagerId: "wrong-party", destinationSiteId: "scrap-porch" }), null);
  completeWreckSalvage(state, { wreckId: wreck.id, salvagerId: "player", destinationSiteId: "scrap-porch", at: clock });
  state.ledger.recordEvent("wreck.salvageDelivered", { wreckId: wreck.id, destinationSiteId: "scrap-porch", salvagerId: "player" });
  manager.update();
  assert.equal(wreck.status, "queued-for-dismantling");
  assert.equal(state.sprc.inventories.produced["hull-plate"], platesBefore, "delivery itself creates no material");

  clock += 26_000;
  manager.update();
  assert.equal(wreck.status, "salvaged");
  assert.equal(wreck.titleStatus, "retired-after-salvage");
  assert.equal(state.sprc.inventories.produced["hull-plate"], platesBefore + 2);
  assert.ok(state.ledger.getRecentEvents(20, { includeHidden: true }).some((event) => event.type === "sprc.salvageDismantled"));
});
