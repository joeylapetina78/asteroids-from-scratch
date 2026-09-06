import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { createTransportationNetwork, findTransportationRoute } from "../src/systems/transportationPlanning.js";
import { compileOldUniverseHistory, getHistoricalMiningSeeds, surveyExpansionRegion } from "../src/systems/worldHistoryCompiler.js";
import { getRuntimeWorldConnections, getRuntimeWorldSites } from "../src/systems/worldNetworkRegistry.js";
import { getImportFamilies, getInventoryPositions, getMinedFamilies } from "../src/systems/hubInventory.js";
import { createMiningOperation, getPostedMiningOrders } from "../src/systems/miningOperation.js";

test("the old-universe compiler builds a causal neighboring cluster", () => {
  const state = createGameState();
  const chronicle = compileOldUniverseHistory(state);

  assert.equal(chronicle.siteIds.length, 3);
  assert.equal(chronicle.connectionIds.length, 3);
  assert.equal(state.worldNetwork.communities[chronicle.communityId].siteIds.length, 3);
  assert.equal(chronicle.evidence.surveyedCandidates, 72);
  assert.ok(chronicle.evidence.selectedScore > 0);
  assert.equal(chronicle.siteIds.filter((siteId) => state.worldNetwork.sites[siteId].tier === "capital").length, 1);

  const types = chronicle.eventIds.map((id) => state.worldHistory.events.find((event) => event.id === id)?.type);
  assert.ok(types.indexOf("survey.departed") < types.indexOf("site.opportunity-discovered"));
  assert.ok(types.indexOf("site.opportunity-discovered") < types.indexOf("expedition.approved"));
  assert.ok(types.indexOf("expedition.approved") < types.indexOf("outpost.founded"));
  assert.ok(types.includes("community.capital-designated"));
});

test("every historical settlement is reachable through the roads its expedition built", () => {
  const state = createGameState();
  const chronicle = compileOldUniverseHistory(state);
  const network = createTransportationNetwork({ destinations: getRuntimeWorldSites(state), connections: getRuntimeWorldConnections(state) });

  chronicle.siteIds.forEach((siteId) => {
    const route = findTransportationRoute(network, "ore-station-one", siteId);
    assert.ok(route, `${siteId} should be connected to its sponsoring frontier`);
    assert.equal(route.path.at(-1), siteId);
  });
});

test("a historical compilation is deterministic, serializable, and idempotent", () => {
  const first = createGameState();
  const second = createGameState();
  const firstChronicle = compileOldUniverseHistory(first, { seed: 8812 });
  const secondChronicle = compileOldUniverseHistory(second, { seed: 8812 });
  assert.deepEqual(firstChronicle, secondChronicle);
  assert.deepEqual(first.worldHistory.events, second.worldHistory.events);
  assert.deepEqual(firstChronicle.siteIds.map((id) => first.worldNetwork.sites[id].position), secondChronicle.siteIds.map((id) => second.worldNetwork.sites[id].position));

  const revision = first.worldNetwork.revision;
  assert.equal(compileOldUniverseHistory(first, { seed: 99 }), firstChronicle);
  assert.equal(first.worldNetwork.revision, revision);
  assert.equal(JSON.parse(JSON.stringify(first)).worldHistory.chronicles[firstChronicle.id].motive, firstChronicle.motive);
});

test("surveyors rank real geography rather than placing a hub at an arbitrary offset", () => {
  const candidates = surveyExpansionRegion({ origin: { x: 40000, y: -24000 }, seed: 1234, candidateCount: 24 });
  assert.equal(candidates.length, 24);
  assert.ok(candidates.every((candidate) => candidate.terrainId && candidate.resources.structural != null));
  assert.ok(candidates.every((candidate, index) => index === 0 || candidates[index - 1].score >= candidate.score));
  assert.ok(new Set(candidates.map((candidate) => `${candidate.position.x}:${candidate.position.y}`)).size > 20);
});

test("historical hubs derive real stock targets and recognize their installed extraction", () => {
  const state = createGameState();
  const chronicle = compileOldUniverseHistory(state);
  chronicle.siteIds.forEach((siteId) => {
    const settlement = state.settlements.generated[siteId];
    const minedFamily = settlement.extraction.miningFamilies[0];
    const positions = getInventoryPositions(state, siteId);
    assert.ok(positions.every((position) => position.target > 0), `${siteId} should plan for every consumed family`);
    assert.deepEqual(getMinedFamilies(siteId, state), [minedFamily]);
    assert.ok(getImportFamilies(state, siteId).every((position) => position.family !== minedFamily));
  });
});

test("the mature Ashfall settlements commissioned real local extraction capacity", () => {
  const state = createGameState();
  const chronicle = compileOldUniverseHistory(state);
  const seeds = getHistoricalMiningSeeds(state);
  const physical = [];
  const game = {
    worldSites: getRuntimeWorldSites(state),
    addWorkerShip: (worker) => physical.push(worker),
  };

  assert.equal(seeds.length, chronicle.siteIds.length);
  chronicle.siteIds.forEach((siteId) => {
    const settlement = state.settlements.generated[siteId];
    state.logistics.institutions[siteId].inventories[settlement.extraction.resourceId] = 0;
  });
  seeds.forEach((seed) => createMiningOperation({ state, game, seed, now: () => 1_000 }));
  assert.equal(physical.length, chronicle.siteIds.length);
  seeds.forEach((seed) => {
    const worker = physical.find((candidate) => candidate.id === seed.workers[0].id);
    const home = game.worldSites.find((site) => site.id === seed.homeSiteId);
    assert.ok(Math.hypot(worker.position.x - home.position.x, worker.position.y - home.position.y) < 200);
    assert.equal(seed.institution.sponsoredByInstitutionId, seed.homeSiteId);
    assert.ok(Object.values(getPostedMiningOrders(state)).some((order) => order.siteId === seed.homeSiteId && order.amount > 0));
  });
  assert.equal(state.worldHistory.events.filter((event) => event.type === "capacity.extraction-commissioned").length, 3);
});
