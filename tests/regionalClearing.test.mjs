import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { CLEARING_DEFAULTS, clearRegionalTrade, findRegionalCarrier } from "../src/systems/regionalClearing.js";

// A cheap simulation of trade is still trade.
//
// Re-observation stopped an aggregate inventing supply nobody sent. It left the
// other half missing: once every hub aggregated, procurement stopped running for
// BOTH sides of every order, so inter-hub commerce did not become cheap — it
// stopped. An eight-hour run ended with Yard Exchange holding hundreds of units
// while Deep Research starved at zero served, unable to reach each other.
//
// What must survive the cheapening is the accounting, not the haggling: every
// unit that arrives left somewhere, every credit paid was received, and the
// carrier could actually have made the trip.

function aggregatedWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const cash = (id, balance) => { state.logistics.institutions[id].accounts.operating.balance = balance; };
  cash("yard-exchange", 50_000);
  cash("scrap-forge", 50_000);

  const flow = (stock, shortfall) => ({
    supply: { structural: 1, industrial: 1, volatile: 1 },
    stock: { structural: 0, industrial: 0, volatile: 0, ...stock },
    shortfall: { structural: 0, industrial: 0, volatile: 0, ...shortfall },
    demand: { consumption: { structural: 0, industrial: 0, volatile: 0 } },
  });

  const records = {
    "yard-exchange": {
      institutionId: "yard-exchange", siteId: "yard-exchange", mode: "aggregate",
      flow: flow({ volatile: 400 }, {}),
    },
    "scrap-forge": {
      institutionId: "scrap-forge", siteId: "scrap-porch", mode: "aggregate",
      flow: flow({}, { volatile: 60 }),
    },
  };
  return { state, records };
}

const totalCash = (state) => Object.values(state.logistics.institutions)
  .reduce((sum, institution) => sum + (institution.accounts?.operating?.balance ?? 0), 0);

const totalStock = (records, family) => Object.values(records)
  .reduce((sum, record) => sum + (record.flow.stock[family] ?? 0), 0);

test("a region with a surplus supplies a region with a shortfall", () => {
  const { state, records } = aggregatedWorld();
  const before = totalStock(records, "volatile");
  const result = clearRegionalTrade(state, records, { at: 2_000 });

  assert.ok(result.trades.length > 0, "the trade happened");
  assert.equal(records["scrap-forge"].flow.shortfall.volatile, 0, "the shortfall was met");
  assert.ok(records["yard-exchange"].flow.stock.volatile < 400, "it came out of somebody's shelf");
  assert.equal(totalStock(records, "volatile"), before,
    "material is conserved: every unit that arrived left somewhere else");
});

test("every credit paid is received by somebody who exists", () => {
  const { state, records } = aggregatedWorld();
  const before = totalCash(state);
  const result = clearRegionalTrade(state, records, { at: 2_000 });

  assert.ok(result.paid > 0);
  assert.ok(Math.abs(totalCash(state) - before) < 0.01,
    `credits are conserved across the trade (moved ${result.paid}, world changed by ${totalCash(state) - before})`);
});

test("the carrier that moved it is paid, and is a real firm", () => {
  const { state, records } = aggregatedWorld();
  const carriers = Object.values(state.logistics.institutions).filter((i) => i.archetypeId === "hauling-business");
  const before = carriers.reduce((sum, c) => sum + c.accounts.operating.balance, 0);

  const result = clearRegionalTrade(state, records, { at: 2_000 });
  const after = carriers.reduce((sum, c) => sum + c.accounts.operating.balance, 0);

  assert.ok(result.trades[0].carrierInstitutionId, "a named carrier hauled it");
  assert.ok(after > before, "freight is income to that carrier, not a hole in the books");
  assert.ok(result.trades[0].freight > 0);
});

test("a region will not sell itself empty to fix somebody else", () => {
  const { state, records } = aggregatedWorld();
  // Give the seller real consumption, so most of its shelf is spoken for.
  records["yard-exchange"].flow.demand.consumption.volatile = 1.5;
  const reserve = 1.5 * CLEARING_DEFAULTS.reserveSeconds;

  clearRegionalTrade(state, records, { at: 2_000 });
  assert.ok(records["yard-exchange"].flow.stock.volatile >= reserve - 0.01,
    `the seller kept its buffer (${records["yard-exchange"].flow.stock.volatile} vs reserve ${reserve})`);
});

test("a region cannot buy what it cannot pay for", () => {
  const { state, records } = aggregatedWorld();
  state.logistics.institutions["scrap-forge"].accounts.operating.balance = 5;
  const before = totalCash(state);

  const result = clearRegionalTrade(state, records, { at: 2_000 });
  assert.equal(result.trades.length, 0, "no credit, no trade");
  assert.equal(totalCash(state), before);
  assert.ok(state.logistics.institutions["scrap-forge"].accounts.operating.balance >= 0,
    "and it certainly does not go negative to buy");
});

test("one aggregated region alone has nobody to trade with", () => {
  const { state, records } = aggregatedWorld();
  delete records["yard-exchange"];
  assert.deepEqual(clearRegionalTrade(state, records, { at: 2_000 }).trades, []);
});

test("a lane no hull could survive is not traded, however badly it is wanted", () => {
  // The frontier is unreachable to a standard hull. Aggregation must not quietly
  // repeal that: if distance stops mattering the moment nobody is watching, it
  // did not mean anything in the first place.
  const { state } = aggregatedWorld();
  const standardOnly = findRegionalCarrier(state, "yard-exchange", "deep-research");
  assert.equal(standardOnly, null, "no standard hull can reach Deep Research");

  // Give one carrier a subspace hull and the same lane becomes servable.
  const hauler = Object.values(state.logistics.haulers)[0];
  state.logistics.institutions[hauler.shipInstitutionId].driveId = "subspace";
  const withSubspace = findRegionalCarrier(state, "yard-exchange", "deep-research");
  assert.ok(withSubspace, "a subspace hull can");
  assert.equal(withSubspace.hull.driveId, "subspace");
});
