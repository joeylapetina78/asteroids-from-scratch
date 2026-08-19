import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { ensureLogisticsState } from "../src/systems/logistics.js";
import { findActorRecord, getActorCapabilities, getActorOfferTypes } from "../src/systems/actorConfig.js";
import {
  actorHasCapability,
  getActorCapabilityPortfolio,
  listAssets,
  registerAssetSource,
  unregisterAssetSource,
} from "../src/systems/assetCapabilities.js";

test("every settlement is an institutional NPC with an asset-derived portfolio", () => {
  const state = createGameState();
  const ids = ["yard-exchange", "scrap-forge", "the-ledge", "blue-lantern", "morrow-shoal", "kiln-crossing", "ore-station-one", "coldwater-depot", "deep-research"];

  ids.forEach((id) => {
    const institution = findActorRecord(state, id);
    const portfolio = getActorCapabilityPortfolio(state, id);
    assert.equal(institution.actorKind, "institutional-npc");
    assert.equal(institution.agency.kind, "institutional");
    assert.ok(institution.agency.organizationType);
    assert.ok(institution.agency.mandate);
    assert.equal(portfolio.assets.length >= 3, true);
    assert.equal(actorHasCapability(state, id, "govern-settlement"), true);
    assert.equal(actorHasCapability(state, id, "recruit-crew"), true);
    assert.equal(actorHasCapability(state, id, "issue-extraction-charter"), true);
    for (const capabilityId of [
      "commission-mining-operator", "commission-freight-operator", "commission-patrol-service",
      "commission-maintenance-service", "commission-repair-facility", "commission-parts-factory",
    ]) assert.equal(actorHasCapability(state, id, capabilityId), true, `${id} may ${capabilityId}`);
  });
});

test("a mining charter grants scoped powers rather than changing the NPC type", () => {
  const state = createGameState();
  const grants = getActorCapabilities(state, "ore-station-one", "authorize-extraction");
  assert.equal(grants.length, 1);
  assert.deepEqual(grants[0].scope.resourceIds, ["aluminum"]);
  assert.deepEqual(grants[0].scope.resourceFamilies, ["structural"]);
  assert.equal(getActorOfferTypes(state, "ore-station-one").includes("extraction"), true);

  const institution = findActorRecord(state, "ore-station-one");
  institution.assets = institution.assets.filter((asset) => asset.archetypeId !== "mining-charter");
  assert.equal(actorHasCapability(state, "ore-station-one", "authorize-extraction"), false);
  assert.equal(getActorOfferTypes(state, "ore-station-one").includes("extraction"), false);
  assert.equal(actorHasCapability(state, "ore-station-one", "govern-settlement"), true,
    "losing a charter removes the power, not the institutional identity");
});

test("a live parts factory gives its owner manufacturing and market powers", () => {
  const state = createGameState();
  const factories = listAssets(state, { ownerActorId: "yard-exchange", archetypeId: "parts-factory" });
  assert.equal(factories.length, 1);
  assert.equal(actorHasCapability(state, "yard-exchange", "manufacture-parts"), true);
  assert.equal(actorHasCapability(state, "yard-exchange", "price-parts"), true);
  assert.equal(getActorOfferTypes(state, "yard-exchange").includes("sale"), true);

  delete state.industrial.factories[factories[0].id];
  assert.equal(actorHasCapability(state, "yard-exchange", "manufacture-parts"), false);
});

test("a new asset domain plugs into the portfolio without editing the NPC", () => {
  const state = createGameState();
  registerAssetSource(state, "orchards", () => [{
    id: "asset:yard-orchard",
    name: "Yard Test Orchard",
    archetypeId: "farm",
    ownerActorId: "yard-exchange",
    status: "active",
    scope: { cropIds: ["test-fruit"] },
  }]);

  assert.equal(actorHasCapability(state, "yard-exchange", "cultivate", (scope) => scope.cropIds.includes("test-fruit")), true);
  assert.equal(getActorOfferTypes(state, "yard-exchange").includes("sale"), true);

  unregisterAssetSource(state, "orchards");
  assert.equal(actorHasCapability(state, "yard-exchange", "cultivate"), false);
});

test("an older settlement record acquires institutional identity and charter assets without losing live state", () => {
  const state = createGameState();
  const hub = state.logistics.institutions["yard-exchange"];
  delete hub.actorKind;
  delete hub.agency;
  delete hub.assets;
  hub.accounts.operating.balance = 12_345;

  ensureLogisticsState(state, 2_000);

  assert.equal(hub.actorKind, "institutional-npc");
  assert.equal(hub.agency.kind, "institutional");
  assert.equal(hub.assets.length, 5);
  assert.equal(hub.accounts.operating.balance, 12_345, "migration does not replace the live treasury");
});
