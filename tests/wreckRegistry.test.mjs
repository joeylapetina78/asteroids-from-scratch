import assert from "node:assert/strict";
import test from "node:test";
import { authorizeWreckSalvage, registerOwnedWreck } from "../src/systems/wreckRegistry.js";

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

