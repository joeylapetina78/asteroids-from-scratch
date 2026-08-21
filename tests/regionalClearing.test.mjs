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

  // Consumption is what makes a region WANT a shelf. Trade sizes itself from the
  // cover a region is missing, not from one tick's unmet demand, so a fixture
  // with no appetite correctly trades nothing.
  const flow = (stock, consumption) => ({
    supply: { structural: 1, industrial: 1, volatile: 1 },
    stock: { structural: 0, industrial: 0, volatile: 0, ...stock },
    shortfall: { structural: 0, industrial: 0, volatile: 0 },
    demand: { consumption: { structural: 0, industrial: 0, volatile: 0, ...consumption } },
  });

  const records = {
    // Well stocked and eating slowly: plenty to spare.
    "yard-exchange": {
      institutionId: "yard-exchange", siteId: "yard-exchange", mode: "aggregate",
      flow: flow({ volatile: 400 }, { volatile: 0.05 }),
    },
    // Empty shelf and hungry people.
    "scrap-forge": {
      institutionId: "scrap-forge", siteId: "scrap-porch", mode: "aggregate",
      flow: flow({}, { volatile: 0.2 }),
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
  assert.ok(records["scrap-forge"].flow.stock.volatile > 0, "the empty shelf was restocked");
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
  // Give the seller a big appetite, so most of its shelf is spoken for.
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

test("a trade is a shipment, not a rounding error", () => {
  // The first live run cleared 0.01 units for two credits, twenty-five times,
  // while the buyer sat at 37% served and never improved. That is what comes of
  // sizing trade from one tick's unmet demand instead of the cover a region is
  // actually missing.
  const { state, records } = aggregatedWorld();
  const result = clearRegionalTrade(state, records, { at: 2_000 });

  assert.ok(result.trades.length > 0);
  const [trade] = result.trades;
  assert.ok(trade.units >= 1, `a trade moves a real quantity, not ${trade.units}`);
  assert.ok(trade.goods >= 100, `and is worth paying a carrier for, not ${trade.goods} credits`);
});

test("a restocked region stops asking", () => {
  // Trade must converge. A buyer topped up to its target should not keep buying
  // on the next round, or the lane becomes a perpetual motion machine.
  const { state, records } = aggregatedWorld();
  clearRegionalTrade(state, records, { at: 2_000 });
  const afterFirst = records["scrap-forge"].flow.stock.volatile;
  const second = clearRegionalTrade(state, records, { at: 3_000 });

  assert.ok(afterFirst > 0);
  assert.equal(second.trades.length, 0, "a full shelf places no order");
});

test("two regions do not ship the same goods back and forth", () => {
  // A live run had ore-station-one and coldwater-depot trading structural to
  // each other in alternating rounds — 1.74 out, 1.87 back, 1.67 out — because a
  // region holding between the sell floor and the buy target counted as both a
  // buyer and a seller. Both hubs drained; only the carrier gained.
  const { state, records } = aggregatedWorld();
  // Both sit mid-range: comfortable, neither desperate nor overflowing.
  records["yard-exchange"].flow.demand.consumption.volatile = 0.2;
  records["yard-exchange"].flow.stock.volatile = 0.2 * 450;
  records["scrap-forge"].flow.demand.consumption.volatile = 0.2;
  records["scrap-forge"].flow.stock.volatile = 0.2 * 450;

  const result = clearRegionalTrade(state, records, { at: 2_000 });
  assert.deepEqual(result.trades, [],
    "inside the dead band nobody is both a buyer and a seller");
});

test("a genuine surplus still moves to a genuine shortage", () => {
  // The dead band must not freeze real trade: one region overflowing, one empty.
  const { state, records } = aggregatedWorld();
  const result = clearRegionalTrade(state, records, { at: 2_000 });
  assert.ok(result.trades.length > 0, "plenty still flows to nothing");
  assert.equal(result.trades[0].to, "scrap-forge");
});
