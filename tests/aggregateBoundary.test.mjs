import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { createDistantSimulationOperation, isHubAggregated } from "../src/systems/distantSimulation.js";
import { getResourceEffectiveYield } from "../src/systems/resourceDefinitions.js";
import { advanceRegionFlow } from "../src/systems/regionFlow.js";

// What crosses the boundary of an aggregated region.
//
// A hub stops DECIDING when it aggregates — every planner checks
// `isHubAggregated`. It does not stop being acted upon: a hauler already
// carrying its cargo still arrives, a buyer still pays it, a supplier still
// ships from its warehouse. Those counterparties may be standing next to the
// player, in full detail, and they are not going to wait.
//
// So the aggregate must ACCOUNT for what happens to it, not overwrite it.

const HUB_ID = "coldwater-depot";
const NEAR_FOCUS = { x: 380, y: -180 };
const FAR_ENOUGH_HISTORY_MS = 2_000_000;

function createAggregatedWorld({ observedEnd = 30 } = {}) {
  const state = createGameState();
  const first = { t: 0, actors: {}, populations: {} };
  const last = { t: FAR_ENOUGH_HISTORY_MS, actors: {}, populations: {} };
  first.actors[HUB_ID] = { cash: 30_000, byFamily: { structural: 10, industrial: 10, volatile: 10 } };
  last.actors[HUB_ID] = { cash: 30_000, byFamily: { structural: observedEnd, industrial: observedEnd, volatile: observedEnd } };
  state.economyHistory = { samples: [first, last], startedAt: 0, lastSampleAt: FAR_ENOUGH_HISTORY_MS, dropped: 0 };

  let clock = FAR_ENOUGH_HISTORY_MS;
  const operation = createDistantSimulationOperation({
    state,
    getFocusPoints: () => [NEAR_FOCUS],
    now: () => clock,
    policy: { aggregateAfterMs: 0 },
  });
  operation.observe();
  assert.equal(isHubAggregated(state, HUB_ID), true);
  return {
    state, operation,
    advance: (ms) => { clock += ms; operation.observe(); },
    flowStock: (family) => state.distantSimulation.hubs[HUB_ID].flow.stock[family] ?? 0,
  };
}

test("a delivery into an aggregated hub is not erased by the flow", () => {
  const { state, advance } = createAggregatedWorld();
  const institution = state.logistics.institutions[HUB_ID];

  const resourceId = "water-ice";
  const before = institution.inventories[resourceId] ?? 0;
  // A hauler that was already carrying this cargo arrives and unloads. This is
  // exactly what `completeShipment` does to the warehouse.
  const deliveredUnits = 6;
  institution.inventories[resourceId] = before + deliveredUnits;

  advance(10_000);

  const after = institution.inventories[resourceId] ?? 0;
  assert.ok(after >= before + deliveredUnits - 5,
    `delivered material must survive an aggregate advance (had ${before}, delivered ${deliveredUnits}, now ${after})`);
});

test("a payment to an aggregated hub is not erased by the flow", () => {
  const { state, advance } = createAggregatedWorld();
  const account = state.logistics.institutions[HUB_ID].accounts.operating;

  const before = account.balance;
  // A buyer settles an invoice this hub issued before it went quiet.
  const payment = 4_000;
  account.balance = before + payment;

  advance(10_000);

  assert.ok(account.balance >= before + payment - 500,
    `an external payment must survive an aggregate advance (had ${before}, paid ${payment}, now ${account.balance})`);
});

test("real deliveries are netted against modelled supply, not added to it", () => {
  // The double-count that would otherwise appear the moment a hub with live
  // freight is allowed to aggregate. The observed supply rate is a DESCRIPTION
  // of that freight; if the freight also physically lands, crediting both
  // invents material out of nothing.
  //
  // Observed here at ~0.4 effective units/second so that the modelled supply
  // over the span is the same order as the deliveries — at the default rate the
  // model contributes so little that a double count would hide in the noise.
  const observedEnd = 810; // 800 units over the 2000s window
  const quiet = createAggregatedWorld({ observedEnd });
  const busy = createAggregatedWorld({ observedEnd });

  const resourceId = "water-ice";
  const yieldRate = getResourceEffectiveYield(resourceId);
  const busyInstitution = busy.state.logistics.institutions[HUB_ID];

  const steps = 6;
  const physicalPerStep = 4;
  for (let step = 0; step < steps; step += 1) {
    busyInstitution.inventories[resourceId] = (busyInstitution.inventories[resourceId] ?? 0) + physicalPerStep;
    quiet.advance(10_000);
    busy.advance(10_000);
  }

  const reallyDelivered = steps * physicalPerStep * yieldRate;
  const quietStock = quiet.flowStock("volatile");
  const busyStock = busy.flowStock("volatile");

  // The sharp property: a region supplied for real at the rate the model
  // observed ends up where the model would have put it anyway. The delivery
  // SUBSTITUTES for modelled supply; it does not stack on top of it. Double
  // counting shows here immediately as the busy region running away from the
  // quiet one by the whole delivered amount.
  assert.ok(Math.abs(busyStock - quietStock) <= 2,
    `real supply must substitute for modelled supply, not add to it `
    + `(quiet ${quietStock.toFixed(1)}, busy ${busyStock.toFixed(1)}, delivered ${reallyDelivered.toFixed(1)})`);
});

test("an aggregated hub's households obey the same income cap as a detailed one", () => {
  // The detailed path credits income only up to `householdCashCap` and discards
  // the rest, logging it. The flow used to credit income unconditionally, so an
  // aggregated settlement whose households were already at the cap quietly made
  // money the rest of the world could not. `notCreatedAtCap` runs into the
  // hundreds of thousands in a live session, so this was not a corner case.
  const { state, advance } = createAggregatedWorld();
  const populations = Object.values(state.population.populations)
    .filter((population) => population.hubInstitutionId === HUB_ID);
  assert.ok(populations.length > 0);

  // Park every household exactly at its cap.
  populations.forEach((population) => {
    population.householdCash = population.householdCashCap;
    population.totalDiscarded = 0;
  });
  const cashBefore = populations.reduce((sum, population) => sum + population.householdCash, 0);
  const incomeBefore = populations.reduce((sum, population) => sum + (population.totalIncome ?? 0), 0);

  advance(60_000);

  const cashAfter = populations.reduce((sum, population) => sum + population.householdCash, 0);
  const incomeAfter = populations.reduce((sum, population) => sum + (population.totalIncome ?? 0), 0);
  const discarded = populations.reduce((sum, population) => sum + (population.totalDiscarded ?? 0), 0);

  // Households at the cap may only lose cash to spending, never gain it.
  assert.ok(cashAfter <= cashBefore + 1e-6,
    `a capped household must not grow (${cashBefore} → ${cashAfter})`);
  // And the income that was refused must be recorded, not silently dropped.
  assert.ok(discarded > 0, "income refused by the cap is reported as discarded");
  assert.ok(incomeAfter - incomeBefore < discarded,
    "far less was created than the faucet would have made unchecked");
});

test("a hub cannot be paid revenue its households never received", () => {
  // Found by leaving a world running for eight hours. Every household ends up
  // pinned at its cash cap, and there the affordability test and the income
  // credit disagreed: the hub was paid out of `populationCash + created` using
  // the UNCAPPED income rate, while the household only actually received what
  // the cap let through. The difference was minted.
  //
  // The invariant is the same one used to clear the delta writer:
  //   (hub cash Δ + household cash Δ) == (income actually created − burn)
  const flow = {
    institutionId: "test", at: 0,
    stock: { structural: 100, industrial: 100, volatile: 100 },
    supply: { structural: 10, industrial: 10, volatile: 10 },
    demand: {
      consumption: { structural: 1, industrial: 1, volatile: 1 },
      householdIncomePerSecond: 100,
      householdSpendPerSecond: 90,
      productionBurnPerSecond: 10,
    },
    cash: 1_000,
    // Parked exactly at the cap AND poorer than the bill: no income can be
    // received, so the only money that can change hands is what is already held.
    populations: { people: { cash: 50, cashCap: 50, totalIncome: 0, totalSpent: 0, totalDiscarded: 0 } },
    burnedCumulative: 0, createdCumulative: 0, discardedCumulative: 0, revenueCumulative: 0,
  };

  const seconds = 10;
  const next = advanceRegionFlow(flow, seconds);

  const hubDelta = next.cash - flow.cash;
  const householdDelta = next.populations.people.cash - flow.populations.people.cash;
  const created = next.createdCumulative - flow.createdCumulative;
  const burned = next.burnedCumulative - flow.burnedCumulative;

  assert.ok(Math.abs((hubDelta + householdDelta) - (created - burned)) < 1e-6,
    `money must be conserved at the cap (hub ${hubDelta.toFixed(2)}, households ${householdDelta.toFixed(2)}, `
    + `created ${created.toFixed(2)}, burned ${burned.toFixed(2)})`);
  assert.equal(created, 0, "a household at its cap receives no income at all");
});
