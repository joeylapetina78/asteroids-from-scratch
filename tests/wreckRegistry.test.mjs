import assert from "node:assert/strict";
import test from "node:test";
import { authorizeWreckSalvage, completeWreckSalvage, createWreckSalvageContract, registerOwnedWreck } from "../src/systems/wreckRegistry.js";

test("destruction preserves the ship owner's title in a distinct wreck record", () => {
  const state = {};
  const wreck = registerOwnedWreck(state, {
    shipId: "ship:one", shipName: "One", position: { x: 12, y: 34 }, cause: "incursion",
    identity: { shipVin: "VIN-1", ownerInstitutionId: "carrier:one", titleId: "TITLE-VIN-1", titleStatus: "active" },
    at: 100,
  });
  assert.equal(wreck.ownerInstitutionId, "carrier:one");
  assert.equal(wreck.titleId, "TITLE-VIN-1");
  assert.equal(wreck.titleStatus, "wreck-title");
  assert.equal(wreck.status, "awaiting-owner-disposition");
});

test("salvage requires an explicit authorization naming the salvor and destination", () => {
  const state = {};
  const wreck = registerOwnedWreck(state, {
    shipId: "ship:one", shipName: "One", position: { x: 0, y: 0 }, cause: "incursion",
    identity: { ownerInstitutionId: "carrier:one", titleId: "TITLE-1", titleStatus: "active" },
  });
  authorizeWreckSalvage(state, { wreckId: wreck.id, authorizationId: "SALVAGE-1", salvagerId: "player", destinationSiteId: "scrap-porch", at: 200 });
  assert.equal(wreck.status, "salvage-authorized");
  assert.equal(wreck.authorizedSalvagerId, "player");
  assert.equal(wreck.destinationSiteId, "scrap-porch");
});

test("a title holder can publish one bounded recovery contract for its wreck", () => {
  const state = {};
  const wreck = registerOwnedWreck(state, {
    shipId: "ship:one", shipName: "One", position: { x: 0, y: 0 }, cause: "incursion",
    identity: { ownerInstitutionId: "carrier:one", titleId: "TITLE-1", titleStatus: "active" },
  });
  const contract = createWreckSalvageContract(state, { wreckId: wreck.id, rewardCredits: 525 });
  assert.equal(contract.type, "wreck-salvage");
  assert.equal(contract.issuer, "carrier:one");
  assert.equal(contract.terms.wreckId, wreck.id);
  assert.equal(contract.presentation.offerSiteId, "scrap-porch");
  assert.equal(contract.reward.credits, 525);
});

test("authorized delivery retires the title and conserves wreck yield into SPRC stock", () => {
  const state = { sprc: { inventories: { raw: { "iron-nickel": 1, silicate: 0 } } } };
  const wreck = registerOwnedWreck(state, {
    shipId: "ship:one", shipName: "One", position: { x: 0, y: 0 }, cause: "incursion",
    identity: { ownerInstitutionId: "carrier:one", titleId: "TITLE-1", titleStatus: "active" },
  });
  authorizeWreckSalvage(state, { wreckId: wreck.id, authorizationId: "SALVAGE-1", salvagerId: "player", destinationSiteId: "scrap-porch" });
  assert.equal(completeWreckSalvage(state, { wreckId: wreck.id, salvagerId: "wrong-party", destinationSiteId: "scrap-porch" }), null);
  const completed = completeWreckSalvage(state, { wreckId: wreck.id, salvagerId: "player", destinationSiteId: "scrap-porch", at: 300 });
  assert.equal(completed.status, "salvaged");
  assert.equal(completed.titleStatus, "retired-after-salvage");
  assert.equal(state.sprc.inventories.raw["iron-nickel"], 3);
  assert.equal(state.sprc.inventories.raw.silicate, 1);
});
