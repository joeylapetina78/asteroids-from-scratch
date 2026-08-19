import assert from "node:assert/strict";
import test from "node:test";

import { FIRST_REACH_SETTLEMENTS } from "../src/content/economy/firstReachSettlements.js";
import { createGameState } from "../src/state/gameState.js";
import { getActorRecord } from "../src/systems/actorRegistry.js";
import { actorHasPower } from "../src/systems/authorityRegistry.js";
import { getHubTerritory } from "../src/systems/hubTerritories.js";
import { getStandingMiningDefinitions } from "../src/systems/miningOperation.js";
import { ensurePatrolOperations } from "../src/systems/patrolOperations.js";
import {
  createProceduralSettlementSeed, registerGeneratedSettlement,
  settlementExtractionDefinition, settlementPopulationProfile,
} from "../src/systems/settlementSeedPipeline.js";

function generatedSeed() {
  return createProceduralSettlementSeed({
    id: "ember-rest", name: "Ember Rest", position: { x: 18000, y: 12000 },
    representativeName: "Kite Aven", resourceId: "silicate", resourceName: "Silicate",
    resourceFamily: "industrial", populationSize: 64,
    organizationProfile: {
      organizationType: "pilgrim-foundry-compact", governance: "hearth assembly",
      mandate: "Keep a safe works and refuge beyond the surveyed corridor.",
      values: ["shelter", "craft", "independence"],
    },
  });
}

test("authored and procedural hubs compile to the same institutional seed contract", () => {
  const authored = FIRST_REACH_SETTLEMENTS[0];
  const generated = generatedSeed();
  assert.deepEqual(Object.keys(generated).sort(), Object.keys(authored).sort());
  assert.deepEqual(Object.keys(generated.institution).sort(), Object.keys(authored.institution).sort());
  assert.equal(authored.origin, "authored");
  assert.equal(generated.origin, "procedural");
  assert.equal(generated.institution.actorKind, "institutional-npc");
  assert.equal(generated.institution.agency.governance, "hearth assembly");
  assert.ok(generated.institution.assets.some((asset) => asset.archetypeId === "municipal-capacity-charter"));
});

test("registering a procedural hub materializes every core runtime projection", () => {
  const state = createGameState();
  const seed = registerGeneratedSettlement(state, generatedSeed(), { now: 12_000 });

  assert.equal(getActorRecord(state, seed.institution.id), state.logistics.institutions[seed.institution.id]);
  assert.equal(getActorRecord(state, seed.population.id), state.population.populations[seed.population.id]);
  assert.deepEqual(
    getStandingMiningDefinitions(state).find((definition) => definition.id === seed.extraction.id),
    settlementExtractionDefinition(seed),
  );
  assert.equal(state.population.populations[seed.population.id].hubInstitutionId, seed.institution.id);
  assert.deepEqual(settlementPopulationProfile(seed).needIds, Object.keys(state.population.populations[seed.population.id].needs));

  const decision = actorHasPower(state, {
    actorId: `institution:${seed.institution.id}`, action: "mine",
    placeId: `hub:${seed.institution.siteId}`, resourceType: "silicate", at: 12_000,
  });
  assert.equal(decision.allowed, true);
  assert.equal(getHubTerritory(seed.institution.siteId, state).hubInstitutionId, seed.institution.id);
  assert.equal(ensurePatrolOperations(state, 12_000)[seed.institution.siteId].institution.siteId, seed.institution.siteId);
});

test("the procedural source seed survives serialization with its institutional history and geography", () => {
  const state = createGameState();
  const seed = registerGeneratedSettlement(state, generatedSeed(), { now: 42_000 });
  const restored = JSON.parse(JSON.stringify(state));
  const record = restored.settlements.generated[seed.institution.id];
  assert.equal(record.registeredAt, 42_000);
  assert.deepEqual(record.geography.position, { x: 18000, y: 12000 });
  assert.equal(record.institution.hubState.history[0].type, "institution.founded");
  assert.equal(restored.logistics.institutions[seed.institution.id].agency.kind, "institutional");
});
