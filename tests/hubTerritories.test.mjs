import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { RIGHT_TYPES } from "../src/systems/authorityModel.js";
import { findAuthorityGrants } from "../src/systems/authorityRegistry.js";
import { loadSavedProfile, saveProfile } from "../src/systems/saveManager.js";
import {
  FIRST_REACH_HUB_TERRITORIES,
  evaluateTerritoryAccess,
  getHubTerritory,
  getHubTerritoryAt,
  grantPlayerTerritoryRights,
  summarizePlayerTerritoryRights,
} from "../src/systems/hubTerritories.js";

test("all nine institutional hubs own a coherent bounded jurisdiction", () => {
  assert.equal(FIRST_REACH_HUB_TERRITORIES.length, 9);
  FIRST_REACH_HUB_TERRITORIES.forEach((territory) => {
    assert.ok(territory.hubInstitutionId);
    assert.ok(territory.radius >= 1400 && territory.radius <= 12000);
    assert.equal(getHubTerritoryAt(territory.center)?.territory.id, territory.id);
  });
  assert.equal(getHubTerritoryAt({ x: 25000, y: 25000 }), null, "the distant space between settlements remains frontier");
});

test("neighboring inner jurisdictions resolve their overlap by geography", () => {
  const yard = getHubTerritory("yard-exchange");
  const porch = getHubTerritory("scrap-porch");
  const nearYard = { x: yard.center.x * 0.75 + porch.center.x * 0.25, y: yard.center.y * 0.75 + porch.center.y * 0.25 };
  const nearPorch = { x: yard.center.x * 0.25 + porch.center.x * 0.75, y: yard.center.y * 0.25 + porch.center.y * 0.75 };
  assert.equal(getHubTerritoryAt(nearYard).territory.id, yard.id);
  assert.equal(getHubTerritoryAt(nearPorch).territory.id, porch.id);
});

test("a first-time visitor may approach a hub but may not extract there", () => {
  const state = createGameState();
  const porch = getHubTerritory("scrap-porch");
  assert.equal(evaluateTerritoryAccess(state, porch.center, RIGHT_TYPES.TRANSIT).via, "visitor-approach");
  const mining = evaluateTerritoryAccess(state, porch.center, RIGHT_TYPES.MINING);
  assert.equal(mining.controlled, true);
  assert.equal(mining.allowed, false);
});

test("a purchased territorial grant is scoped and written to the shared authority registry", () => {
  const state = createGameState();
  state.character.controlledPersonEntityId = "person:test-pilot";
  grantPlayerTerritoryRights(state, {
    territoryId: "territory:scrap-porch",
    rights: [RIGHT_TYPES.TRANSIT, RIGHT_TYPES.DOCKING, RIGHT_TYPES.MINING],
    issuerId: "scrap-porch-authority",
    basisDocumentId: "territory-scrap-porch-work-pass",
    at: 10,
  });
  assert.equal(evaluateTerritoryAccess(state, getHubTerritory("scrap-porch").center, RIGHT_TYPES.MINING).allowed, true);
  assert.equal(evaluateTerritoryAccess(state, getHubTerritory("the-ledge").center, RIGHT_TYPES.MINING).allowed, false);
  const records = findAuthorityGrants(state, { holderId: "person:test-pilot", jurisdictionId: "territory:scrap-porch" });
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].limits.rightTypes, [RIGHT_TYPES.TRANSIT, RIGHT_TYPES.DOCKING, RIGHT_TYPES.MINING]);
  assert.equal(summarizePlayerTerritoryRights(state).licenseClass, "Regional Operator");
});

test("a work grant upgrades the real pilot document from provisional", () => {
  const state = createGameState();
  state.legal.pilotLicense.licenseId = "RTC-TEST";
  state.legal.pilotLicenses["RTC-TEST"] = { id: "RTC-TEST", status: "provisional" };
  state.worldRecords.documents["RTC-TEST"] = { id: "RTC-TEST", title: "Provisional Flight Authorization" };
  grantPlayerTerritoryRights(state, {
    territoryId: "territory:the-ledge",
    rights: [RIGHT_TYPES.TRANSIT, RIGHT_TYPES.MINING],
    issuerId: "the-ledge-authority",
    basisDocumentId: "territory-the-ledge-work-pass",
  });
  assert.equal(state.legal.pilotLicense.class, "regional-operator");
  assert.equal(state.legal.pilotLicenses["RTC-TEST"].displayClass, "Regional Operator");
  assert.equal(state.worldRecords.documents["RTC-TEST"].title, "Regional Operator Authorization");
  assert.equal(state.worldRecords.documents["RTC-TEST"].territorialEndorsements[0].territoryId, "territory:the-ledge");
});

test("territorial grants, documents, and authority revenue survive save and restore", () => {
  const previousStorage = globalThis.localStorage;
  let stored = null;
  globalThis.localStorage = {
    setItem: (_key, value) => { stored = value; },
    getItem: () => stored,
    removeItem: () => { stored = null; },
  };
  try {
    const state = createGameState();
    state.legal.pilotLicense.licenseId = "RTC-SAVE";
    state.authorities["scrap-porch-authority"].account.balance = 420;
    grantPlayerTerritoryRights(state, {
      territoryId: "territory:scrap-porch",
      rights: [RIGHT_TYPES.TRANSIT, RIGHT_TYPES.MINING],
      issuerId: "scrap-porch-authority",
      basisDocumentId: "territory-scrap-porch-work-pass",
    });
    saveProfile({ state, game: null, cargoHold: null });
    const restored = createGameState();
    loadSavedProfile(restored);
    assert.equal(restored.legal.operatingRights.territories.grants[0].territoryId, "territory:scrap-porch");
    assert.equal(restored.authorities["scrap-porch-authority"].account.balance, 420);
    assert.equal(restored.worldRecords.authorityGrants["authority:person:player:territory-access:territory:scrap-porch"].status, "active");
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
