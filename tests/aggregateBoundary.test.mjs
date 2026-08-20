import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { createDistantSimulationOperation, isHubAggregated } from "../src/systems/distantSimulation.js";
import { getResourceEffectiveYield } from "../src/systems/resourceDefinitions.js";
import { DRIFT_BAND, advanceRegionFlow, estimateFlowDrift } from "../src/systems/regionFlow.js";

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

// ── Re-observation ─────────────────────────────────────────────────────────
// An eight-hour unattended run ended with every hub aggregated, inter-hub trade
// stopped dead (32 shipments delivered, none in flight, twelve orders sitting
// `ready`) — and every flow still crediting itself supply at a rate measured
// from that trade back when it was running. One settlement sat on 700 units of
// water ice it was never sent; another was empty with `served: 0`.

function flowWithSupply(rate, observedSeconds = 400) {
  return {
    institutionId: "test", at: 0, observedSeconds,
    stock: { structural: 50, industrial: 50, volatile: 50 },
    supply: { structural: rate, industrial: rate, volatile: rate },
    demand: {
      consumption: { structural: 0, industrial: 0, volatile: 0 },
      householdIncomePerSecond: 0, householdSpendPerSecond: 0, productionBurnPerSecond: 0,
    },
    cash: 1_000,
    populations: { people: { cash: 1_000, cashCap: 1_000_000, totalIncome: 0, totalSpent: 0, totalDiscarded: 0 } },
    burnedCumulative: 0, createdCumulative: 0, discardedCumulative: 0, revenueCumulative: 0,
  };
}

const ZERO_INFLOW = { structural: 0, industrial: 0, volatile: 0 };

test("a supplier that has stopped is noticed within a window or two", () => {
  let flow = flowWithSupply(1);
  const window = flow.observedSeconds;

  // One full observation window of genuinely nothing arriving.
  for (let elapsed = 0; elapsed < window; elapsed += 10) {
    flow = advanceRegionFlow(flow, 10, { externalInflow: ZERO_INFLOW });
  }
  assert.ok(flow.supply.volatile < 0.5,
    `after one window of no arrivals the rate is well down (${flow.supply.volatile.toFixed(3)})`);

  for (let elapsed = 0; elapsed < window * 2; elapsed += 10) {
    flow = advanceRegionFlow(flow, 10, { externalInflow: ZERO_INFLOW });
  }
  assert.ok(flow.supply.volatile < 0.06,
    `after three windows it has all but stopped (${flow.supply.volatile.toFixed(4)})`);
});

test("a region that is genuinely still supplied keeps its rate", () => {
  let flow = flowWithSupply(1);
  const window = flow.observedSeconds;
  // Deliveries keep landing at exactly the observed rate.
  for (let elapsed = 0; elapsed < window * 3; elapsed += 10) {
    flow = advanceRegionFlow(flow, 10, { externalInflow: { structural: 10, industrial: 10, volatile: 10 } });
  }
  assert.ok(Math.abs(flow.supply.volatile - 1) < 0.05,
    `a supplied region holds its rate (${flow.supply.volatile.toFixed(3)})`);
});

test("a lumpy delivery pattern is not mistaken for a famine", () => {
  // Supply really does arrive in lots at irregular intervals. A gap between
  // them must not crash the rate — that is the whole reason the blend runs on
  // the observation window rather than the step.
  let flow = flowWithSupply(1);
  for (let step = 0; step < 40; step += 1) {
    // 60 units every tenth step of 10s == 1 unit/second on average.
    const lot = step % 10 === 0 ? 100 : 0;
    flow = advanceRegionFlow(flow, 10, { externalInflow: { structural: lot, industrial: lot, volatile: lot } });
  }
  assert.ok(flow.supply.volatile > 0.6,
    `a lumpy but real supplier keeps most of its rate (${flow.supply.volatile.toFixed(3)})`);
});

test("no inflow measurement at all leaves the rate alone", () => {
  // Absence of evidence is not evidence of zero. A caller that cannot say what
  // arrived must not silently starve the region.
  const flow = flowWithSupply(1);
  const next = advanceRegionFlow(flow, 10);
  assert.deepEqual(next.supply, flow.supply);
});

test("eight hours alone does not fill a warehouse nobody delivered to", () => {
  // The overnight pathology, stated directly. Every hub aggregated, so inter-hub
  // freight stopped entirely — and each flow kept crediting itself supply at a
  // rate measured back when that freight was running. Yard Exchange finished the
  // night holding 315 units of water ice and 207 of iron-nickel with
  // `served: 1`, none of which any carrier ever moved.
  const held = flowWithSupply(1);          // 1 effective unit/second, nobody consuming
  const reobserving = flowWithSupply(1);

  const EIGHT_HOURS = 8 * 60 * 60;
  let phantom = held;
  let real = reobserving;
  for (let elapsed = 0; elapsed < EIGHT_HOURS; elapsed += 30) {
    // No inflow measurement -> the rate is held, the old behaviour.
    phantom = advanceRegionFlow(phantom, 30);
    // Measured, and nothing is arriving, because every supplier is aggregated.
    real = advanceRegionFlow(real, 30, { externalInflow: ZERO_INFLOW });
  }

  assert.ok(phantom.stock.volatile > 20_000,
    `a held rate invents a warehouse (${Math.round(phantom.stock.volatile)} units)`);
  assert.ok(real.stock.volatile < held.stock.volatile + 500,
    `a re-observed rate does not (${Math.round(real.stock.volatile)} units, started ${held.stock.volatile})`);
});

test("a held rate still reports growing staleness; a re-observed one does not", () => {
  // The distinction the Observatory has to show, because the two modes fail
  // differently and only one of them is bounded.
  const window = 400;
  const held = { observedSeconds: window };
  const resynced = { observedSeconds: window, resyncedAt: 1 };

  const heldDrift = estimateFlowDrift(held, window * 5);
  const resyncedDrift = estimateFlowDrift(resynced, window * 5);

  assert.equal(heldDrift.resynced, false);
  assert.equal(heldDrift.staleness, 5, "a held rate is five windows past its evidence");
  assert.equal(heldDrift.band, DRIFT_BAND.BEYOND_WINDOW);

  assert.equal(resyncedDrift.resynced, true);
  assert.equal(resyncedDrift.staleness, 1, "a re-observed rate is never more than a window behind");
  assert.equal(resyncedDrift.band, DRIFT_BAND.WITHIN_WINDOW);
});
