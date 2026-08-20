import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import {
  createDistantSimulationOperation,
  explainAggregationEligibility,
  isHubAggregated,
} from "../src/systems/distantSimulation.js";
import { getHubActor } from "../src/systems/hubActors.js";
import { advanceRegionFlow } from "../src/systems/regionFlow.js";
import { createProceduralSettlementSeed, registerGeneratedSettlement } from "../src/systems/settlementSeedPipeline.js";

const HUB_ID = "coldwater-depot";
const FAR_ENOUGH_HISTORY_MS = 2_000_000;

function createObservedWorld() {
  const state = createGameState();
  const first = { t: 0, actors: {}, populations: {} };
  const last = { t: FAR_ENOUGH_HISTORY_MS, actors: {}, populations: {} };
  first.actors[HUB_ID] = { cash: 30_000, byFamily: { structural: 10, industrial: 10, volatile: 10 } };
  last.actors[HUB_ID] = { cash: 30_000, byFamily: { structural: 30, industrial: 30, volatile: 30 } };
  state.economyHistory = { samples: [first, last], startedAt: 0, lastSampleAt: FAR_ENOUGH_HISTORY_MS, dropped: 0 };
  return state;
}

test("a quiescent far hub aggregates and restores around the same institutional actor", () => {
  const state = createObservedWorld();
  let clock = FAR_ENOUGH_HISTORY_MS;
  let focus = { x: 380, y: -180 };
  const before = getHubActor(state, HUB_ID, { at: clock });
  const institution = before.institution;
  const durable = before.durable;
  const historyLength = durable.history.length;
  const cashBefore = institution.accounts.operating.balance;

  const operation = createDistantSimulationOperation({
    state,
    getFocusPoints: () => [focus],
    now: () => clock,
    policy: { aggregateAfterMs: 0 },
  });
  operation.observe();
  assert.equal(isHubAggregated(state, HUB_ID), true);
  assert.equal(getHubActor(state, HUB_ID, { at: clock }).institution, institution);

  clock += 60_000;
  operation.observe();
  assert.notEqual(institution.accounts.operating.balance, cashBefore, "the aggregate writes its economy into the live treasury");
  assert.ok(institution.settlementTrade.productionSpend > 0, "aggregate burn reaches the reconciliation books");

  focus = { x: 70_000, y: 46_000 };
  operation.observe();
  const restored = getHubActor(state, HUB_ID, { at: clock });
  assert.equal(isHubAggregated(state, HUB_ID), false);
  assert.equal(restored.institution, institution, "the institution was preserved, not reconstructed");
  assert.equal(restored.durable, durable, "assets, projects and history retain their identity");
  assert.equal(restored.history.length, historyLength);
  assert.equal(restored.simulation.mode, "detailed");
  assert.equal(state.distantSimulation.transitions.at(-1).type, "restored");
});

test("work done TO a far hub no longer keeps it detailed", () => {
  // Counterparty work — an order somebody else is filling, cargo already in
  // flight — used to block, because the aggregate would have overwritten the
  // delivery. It reads live state before writing now, so this can keep running.
  const state = createObservedWorld();
  state.hubProcurement.orders.inbound = {
    id: "inbound", buyerInstitutionId: HUB_ID, supplierInstitutionId: "yard-exchange", status: "offered",
  };
  state.logistics.shipments.enroute = {
    id: "enroute", status: "loaded", destinationInstitutionId: HUB_ID, destinationSiteId: "coldwater-depot",
  };
  assert.deepEqual(explainAggregationEligibility(state, HUB_ID), { eligible: true, blockers: [] });

  const operation = createDistantSimulationOperation({
    state,
    getFocusPoints: () => [{ x: 380, y: -180 }],
    now: () => FAR_ENOUGH_HISTORY_MS,
    policy: { aggregateAfterMs: 0 },
  });
  operation.observe();
  assert.equal(isHubAggregated(state, HUB_ID), true);
});

test("a hub's own internal work still keeps it detailed", () => {
  // Production the hub is running itself is work the FLOW also models. Letting
  // both run would count the same activity twice, so this still blocks until it
  // has a conserved checkpoint of its own.
  const state = createObservedWorld();
  state.population.productionOrders = {
    run: { id: "run", hubInstitutionId: HUB_ID, status: "producing" },
  };
  assert.deepEqual(explainAggregationEligibility(state, HUB_ID), {
    eligible: false, blockers: ["population-production:1"],
  });

  const operation = createDistantSimulationOperation({
    state,
    getFocusPoints: () => [{ x: 380, y: -180 }],
    now: () => FAR_ENOUGH_HISTORY_MS,
    policy: { aggregateAfterMs: 0 },
  });
  operation.observe();
  assert.equal(isHubAggregated(state, HUB_ID), false);
  assert.deepEqual(state.distantSimulation.hubs[HUB_ID].blockers, ["population-production:1"]);
});

test("a procedural hub uses the same aggregate and restoration boundary", () => {
  const state = createGameState();
  const seed = registerGeneratedSettlement(state, createProceduralSettlementSeed({
    id: "ember-rest", name: "Ember Rest", position: { x: 100_000, y: 100_000 },
    resourceId: "silicate", resourceFamily: "industrial", populationSize: 64,
  }), { now: 0 });
  const hubId = seed.institution.id;
  const actor = getHubActor(state, hubId, { at: 0 }).institution;
  const actorSample = (units) => ({ cash: actor.accounts.operating.balance, byFamily: { structural: units, industrial: units, volatile: units } });
  state.economyHistory = {
    samples: [
      { t: 0, actors: { [hubId]: actorSample(10) }, populations: {} },
      { t: FAR_ENOUGH_HISTORY_MS, actors: { [hubId]: actorSample(30) }, populations: {} },
    ],
    startedAt: 0, lastSampleAt: FAR_ENOUGH_HISTORY_MS, dropped: 0,
  };
  let focus = { x: 380, y: -180 };
  const operation = createDistantSimulationOperation({
    state, getFocusPoints: () => [focus], now: () => FAR_ENOUGH_HISTORY_MS,
    policy: { aggregateAfterMs: 0 },
  });
  operation.observe();
  assert.equal(isHubAggregated(state, hubId), true);
  focus = seed.geography.position;
  operation.observe();
  assert.equal(isHubAggregated(state, hubId), false);
  assert.equal(getHubActor(state, hubId, { at: FAR_ENOUGH_HISTORY_MS }).institution, actor);
});

test("an aggregate cannot consume stock its households could not afford", () => {
  const flow = {
    institutionId: "test", at: 0,
    stock: { structural: 10, industrial: 10, volatile: 10 },
    supply: { structural: 0, industrial: 0, volatile: 0 },
    demand: {
      consumption: { structural: 1, industrial: 1, volatile: 1 },
      householdIncomePerSecond: 0,
      householdSpendPerSecond: 30,
      productionBurnPerSecond: 0,
    },
    cash: 100,
    populations: { people: { cash: 0, totalIncome: 0, totalSpent: 0 } },
    burnedCumulative: 0, createdCumulative: 0, revenueCumulative: 0,
  };
  const next = advanceRegionFlow(flow, 5);
  assert.deepEqual(next.stock, flow.stock);
  assert.equal(next.cash, flow.cash);
  assert.equal(next.servedFraction, 0);
});
