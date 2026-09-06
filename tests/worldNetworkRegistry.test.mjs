import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { createProceduralSettlementSeed, registerGeneratedSettlement } from "../src/systems/settlementSeedPipeline.js";
import { createTransportationNetwork, findTransportationRoute } from "../src/systems/transportationPlanning.js";
import {
  getRuntimeTradeCommunities, getRuntimeWorldConnections, getRuntimeWorldSites,
  registerWorldConnection, runtimeTradeCommunityForSite,
} from "../src/systems/worldNetworkRegistry.js";

function foundSettlement(state) {
  return registerGeneratedSettlement(state, createProceduralSettlementSeed({
    id: "ember-rest", name: "Ember Rest", position: { x: 18000, y: 12000 },
    resourceId: "silicate", resourceFamily: "industrial",
    tradeCommunityId: "first-reach-frontier",
    foundedBy: "yard-exchange", foundingReason: "surveyed silicate field",
    discoveryId: "survey:ember-field", projectId: "expedition:ember-rest",
    history: [{ id: "history:ember-survey", type: "site.surveyed", at: 9000 }],
  }), { now: 12000 });
}

test("the runtime world begins with authored sites, routes, communities, and historical provenance", () => {
  const state = createGameState();
  assert.ok(getRuntimeWorldSites(state).some((site) => site.id === "yard-exchange" && site.origin === "authored"));
  assert.ok(getRuntimeWorldConnections(state).some((route) => route.origin === "authored"));
  assert.ok(getRuntimeTradeCommunities(state).some((community) => community.siteIds.includes("yard-exchange")));
  assert.equal(state.worldNetwork.sites["yard-exchange"].provenance.kind, "established-settlement");
});

test("a founded settlement and road enter the same economic and transportation graph", () => {
  const state = createGameState();
  const seed = foundSettlement(state);
  const road = registerWorldConnection(state, {
    id: "route:yard-ember", fromId: "yard-exchange", toId: seed.institution.siteId,
    kind: "surveyed-corridor", bidirectional: true,
  }, {
    provenance: { kind: "founding-road", projectId: "expedition:ember-rest" },
    history: [{ id: "history:road-opened", type: "route.opened", at: 11500 }],
  });

  assert.ok(road.distance > 0);
  assert.equal(runtimeTradeCommunityForSite(state, "ember-rest"), "first-reach-frontier");
  assert.equal(state.worldNetwork.sites["ember-rest"].provenance.discoveryId, "survey:ember-field");
  const network = createTransportationNetwork({
    destinations: getRuntimeWorldSites(state), connections: getRuntimeWorldConnections(state),
  });
  assert.deepEqual(findTransportationRoute(network, "yard-exchange", "ember-rest")?.path, ["yard-exchange", "ember-rest"]);

  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(restored.worldNetwork.connections[road.id].provenance.projectId, "expedition:ember-rest");
  assert.equal(restored.worldNetwork.sites["ember-rest"].history[0].type, "site.surveyed");
});

test("roads cannot silently point to places outside the registered world", () => {
  const state = createGameState();
  assert.throws(() => registerWorldConnection(state, {
    id: "route:nowhere", fromId: "yard-exchange", toId: "missing-colony",
  }), /unregistered endpoint/);
});
