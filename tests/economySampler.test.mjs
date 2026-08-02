// The economy sampler is the only thing here that remembers a number over
// time, so the cases that matter are about honesty: a gap must not read as a
// zero, a rate must be a real difference between two samples, and the money
// reconciliation must report a leak rather than absorb it.

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SAMPLES,
  SAMPLE_INTERVAL_MS,
  collectSeriesKeys,
  getEconomySamples,
  latestValue,
  listAccountHolders,
  readEconomySnapshot,
  reconcileMoney,
  recordEconomySample,
  seriesChange,
  toRateSeries,
  toSeries,
} from "../src/systems/economySampler.js";
import { getSupplierAskPrice } from "../src/systems/hubProcurement.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createPopulationOperation } from "../src/systems/populationDemand.js";
import { recordAcquisition } from "../src/systems/costBasis.js";
import { getResourceTradeValue } from "../src/systems/resourceDefinitions.js";

function createWorld({ stock = {}, hubCash = 50_000 } = {}) {
  let clock = 1_000_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  const hub = state.logistics.institutions["yard-exchange"];
  hub.accounts.operating.balance = hubCash;
  hub.inventories = { ...stock };
  const population = createPopulationOperation({ state, now: () => clock });
  return {
    state, hub, population,
    advance: (seconds) => { clock += seconds * 1000; },
    now: () => clock,
    sample: (options = {}) => recordEconomySample(state, { now: clock, force: true, ...options }),
  };
}

// ── Snapshot: reads what is there, invents nothing ──────────────────────────

test("a snapshot totals money by holder and never double-counts", () => {
  const world = createWorld({ stock: { "iron-nickel": 12 } });
  const snapshot = readEconomySnapshot(world.state, { now: world.now() });

  const holderSum = snapshot.money.populations + snapshot.money.institutions + snapshot.money.player;
  assert.equal(snapshot.money.total, holderSum, "the total is exactly the three bands");
  assert.ok(snapshot.money.institutions > 0, "seeded institutions hold cash");
  assert.ok(snapshot.money.populations > 0, "seeded populations hold household cash");

  // Every actor in the roster carries an operating account; a ship or a person
  // record must not appear, or its controller's money is counted twice.
  Object.values(snapshot.actors).forEach((actor) => {
    assert.equal(typeof actor.cash, "number", `${actor.id} has a balance`);
    assert.ok(actor.name, `${actor.id} is named`);
  });
  const accountedFor = Object.values(snapshot.actors).reduce((sum, actor) => sum + actor.cash, 0);
  assert.equal(snapshot.money.institutions, accountedFor, "institution cash is the sum of the actors listed");
});

// This is the case that matters most, and the one the first version got wrong.
// Treasuries live under whichever state key their operation happens to use, and
// counting only `logistics.institutions` made every payment into a mining
// contractor, the insurer, the tow service or the farm look like credits
// leaving the world.
test("every treasury is counted, wherever its operation keeps it", () => {
  const world = createWorld();
  world.state.miningOperations = {
    cinder: { institution: { id: "miner:cinder", name: "Cinder Contracting", archetypeId: "mining-contractor", accounts: { operating: { balance: 9_000, committed: 0 } }, inventories: { silicate: 3 } } },
  };
  world.state.sprc = { institution: { id: "sprc", name: "Scrap Porch Recovery" }, account: { balance: 4_000, committed: 0 }, inventories: { "iron-nickel": 5 } };
  world.state.towing = { institution: { id: "first-reach-recovery", name: "First Reach Recovery", accounts: { operating: { balance: 1_500, committed: 0 } } } };
  world.state.fleetInsurance = { institution: { id: "first-reach-mutual", name: "First Reach Mutual", accounts: { operating: { balance: 2_500, committed: 0 } } } };
  world.state.farm = { institution: { id: "sunward-acre", name: "Sunward Acre", accounts: { operating: { balance: 700, committed: 0 } } } };

  const holders = listAccountHolders(world.state).map((holder) => holder.record.id);
  ["miner:cinder", "sprc", "first-reach-recovery", "first-reach-mutual", "sunward-acre"].forEach((id) => {
    assert.ok(holders.includes(id), `${id} keeps a treasury and must be counted`);
  });

  const snapshot = readEconomySnapshot(world.state, { now: world.now() });
  const listed = Object.values(snapshot.actors).reduce((sum, actor) => sum + actor.cash, 0);
  assert.equal(snapshot.money.institutions, listed, "world cash is the sum of every treasury listed");
  ["miner:cinder", "sprc", "first-reach-recovery", "first-reach-mutual", "sunward-acre"].forEach((id) => {
    assert.ok(snapshot.actors[id], `${id} appears in the actor roster`);
  });
  assert.equal(snapshot.actors["sprc"].inventoryUnits, 5, "SPRC's shelf sits beside its institution and is still read");
  assert.equal(snapshot.actors["miner:cinder"].inventoryUnits, 3);
});

test("paying an actor outside logistics is a transfer, not a leak", () => {
  const world = createWorld();
  world.state.miningOperations = {
    cinder: { institution: { id: "miner:cinder", name: "Cinder Contracting", accounts: { operating: { balance: 0, committed: 0 } } } },
  };
  world.sample();

  // The hub pays the contractor for a delivery. Nothing was created or burned.
  world.hub.accounts.operating.balance -= 2_400;
  world.state.miningOperations.cinder.institution.accounts.operating.balance += 2_400;
  world.advance(5);
  world.sample();

  const reconciliation = reconcileMoney(getEconomySamples(world.state, { now: world.now() }));
  assert.equal(reconciliation.observed, 0, "the world total did not move");
  assert.equal(reconciliation.residual, 0, "and nothing is unexplained");
});

test("a snapshot separates material by where it is", () => {
  const world = createWorld({ stock: { "iron-nickel": 10, "water-ice": 4 } });
  const snapshot = readEconomySnapshot(world.state, { now: world.now() });
  const hub = snapshot.actors["yard-exchange"];

  assert.equal(hub.inventoryUnits, 14);
  assert.equal(hub.byFamily.structural, 10, "iron-nickel is structural");
  assert.equal(hub.byFamily.volatile, 4, "water ice is volatile");
  assert.ok(snapshot.material.onShelf >= 14, "shelf stock rolls up into the world total");
  assert.equal(snapshot.material.total, snapshot.material.onShelf + snapshot.material.finishedGoods + snapshot.material.inFlight);
});

test("settlements report coverage against the target their population implies", () => {
  const world = createWorld({ stock: { "iron-nickel": 10 } });
  const snapshot = readEconomySnapshot(world.state, { now: world.now() });
  const hub = snapshot.actors["yard-exchange"];
  assert.ok(hub.isSettlement, "the Yard Exchange buys and sells material");
  assert.ok(hub.coverage.structural > 0, "holding stock against a real target reads above zero");
  assert.equal(snapshot.actors["cinder-haulage"]?.coverage ?? null, null, "a carrier stocks nothing, so it has no coverage");
});

// ── Prices: the sampler reads the same rule the market prices with ──────────

test("the sampled ask price is the procurement rule, not a second copy of it", () => {
  const world = createWorld();
  // A hub that paid over the odds carries that in its book cost, which is what
  // it holds out for until it starts conceding.
  recordAcquisition(world.state, {
    institutionId: "the-ledge", itemId: "silicate", units: 4,
    totalCost: getResourceTradeValue("silicate") * 4 * 2, at: world.now(),
  });

  const direct = getSupplierAskPrice(world.state, "the-ledge", "silicate");
  const snapshot = readEconomySnapshot(world.state, { now: world.now() });
  const sampled = snapshot.prices.ask["the-ledge|silicate"];

  assert.ok(sampled, "the ask appears in the price map");
  assert.equal(sampled.value, Math.round(direct.ask));
  assert.equal(sampled.floor, Math.round(getResourceTradeValue("silicate")), "the floor is what the next unit costs to dig");
  assert.ok(sampled.ceiling > sampled.floor, "having overpaid, this seller has room to come down");
});

test("a supplier that has conceded fully asks its marginal cost", () => {
  const world = createWorld();
  recordAcquisition(world.state, {
    institutionId: "the-ledge", itemId: "silicate", units: 4,
    totalCost: getResourceTradeValue("silicate") * 4 * 3, at: world.now(),
  });
  world.state.hubProcurement = { orders: {}, counter: 0, asks: {}, unavailable: {} };
  world.state.hubProcurement.asks["the-ledge|silicate"] = { concession: 1, lastMovedAt: 0 };

  const snapshot = readEconomySnapshot(world.state, { now: world.now() });
  const sampled = snapshot.prices.ask["the-ledge|silicate"];
  assert.equal(sampled.value, sampled.floor, "fully conceded means working at the cost of the next unit");
  assert.equal(sampled.concession, 1);
});

test("open purchase orders are priced unit-weighted, and closed ones are only counted", () => {
  const world = createWorld();
  world.state.hubProcurement = {
    counter: 2, asks: {}, unavailable: {},
    orders: {
      "HPO-0001": { id: "HPO-0001", resourceId: "silicate", units: 6, pricePerUnit: 100, status: "offered" },
      "HPO-0002": { id: "HPO-0002", resourceId: "silicate", units: 2, pricePerUnit: 200, status: "accepted" },
      "HPO-0003": { id: "HPO-0003", resourceId: "silicate", units: 99, pricePerUnit: 9_999, status: "declined" },
    },
  };

  const snapshot = readEconomySnapshot(world.state, { now: world.now() });
  assert.equal(snapshot.prices.order.silicate.value, 125, "(6×100 + 2×200) / 8");
  assert.equal(snapshot.prices.order.silicate.units, 8, "a refused order is not an open commitment");
  assert.equal(snapshot.orders.declined, 1, "but it is still counted as friction");
  assert.equal(snapshot.orders.offered, 1);
});

// ── Recording: bounded, throttled, and never persisted ──────────────────────

test("samples are throttled to the interval unless forced", () => {
  const world = createWorld();
  assert.ok(recordEconomySample(world.state, { now: world.now() }), "the first sample always lands");
  assert.equal(recordEconomySample(world.state, { now: world.now() + 100 }), null, "too soon");
  assert.ok(recordEconomySample(world.state, { now: world.now() + SAMPLE_INTERVAL_MS }), "due again");
});

test("the ring is bounded, dropping the oldest samples", () => {
  const world = createWorld();
  for (let index = 0; index < MAX_SAMPLES + 25; index += 1) {
    world.advance(SAMPLE_INTERVAL_MS / 1000);
    world.sample();
  }
  const history = world.state.economyHistory;
  assert.equal(history.samples.length, MAX_SAMPLES);
  assert.equal(history.dropped, 25);
  assert.ok(history.samples[0].t < history.samples[history.samples.length - 1].t, "the window still moves forward");
});

test("a window returns only the samples inside it", () => {
  const world = createWorld();
  for (let index = 0; index < 10; index += 1) {
    world.advance(60);
    world.sample();
  }
  const recent = getEconomySamples(world.state, { windowMs: 5 * 60 * 1000, now: world.now() });
  // The cutoff is inclusive, so the sample sitting exactly on the boundary is
  // kept — a five-minute window over one-minute samples holds six readings and
  // therefore five intervals, which is what a rate series needs.
  assert.equal(recent.length, 6, "the sample on the boundary is inside the window");
  assert.ok(recent[0].t >= world.now() - 5 * 60 * 1000);
  assert.equal(getEconomySamples(world.state, { now: world.now() }).length, 10, "no window means everything");
});

// ── Series: a gap is a gap ─────────────────────────────────────────────────

test("a missing reading becomes a gap, not a zero", () => {
  const samples = [
    { t: 0, actors: { hub: { cash: 100 } } },
    { t: 1000, actors: {} },
    { t: 2000, actors: { hub: { cash: 140 } } },
  ];
  const points = toSeries(samples, (sample) => sample.actors.hub?.cash ?? null);
  assert.deepEqual(points.map((point) => point.v), [100, null, 140],
    "an actor with no reading must not draw a line to the floor");
  assert.equal(latestValue(points), 140);
  assert.deepEqual(seriesChange(points), { first: 100, last: 140, delta: 40, ratio: 1.4 });
});

test("a rate is a real difference, and the first sample has none", () => {
  const samples = [
    { t: 0, money: { spentCumulative: 0 } },
    { t: 60_000, money: { spentCumulative: 600 } },
    { t: 90_000, money: { spentCumulative: 900 } },
  ];
  const rate = toRateSeries(samples, (sample) => sample.money.spentCumulative);
  assert.equal(rate[0].v, null, "there is nothing to difference against yet");
  assert.equal(rate[1].v, 600, "600 credits over a minute");
  assert.equal(rate[2].v, 600, "300 credits over 30s is the same rate");
});

test("series keys survive a gap in the middle of the window", () => {
  const samples = [
    { t: 0, actors: { hub: { name: "Yard Exchange" } } },
    { t: 1000, actors: {} },
    { t: 2000, actors: { ledge: { name: "The Ledge" } } },
  ];
  const keys = collectSeriesKeys(samples, (sample) => sample.actors);
  assert.deepEqual([...keys.keys()], ["hub", "ledge"], "both get a line even though neither spans the window");
});

// ── Reconciliation: a leak is reported, not smoothed ───────────────────────

test("money balances when creation and burn explain the change", () => {
  const samples = [
    { t: 0, money: { total: 1000, incomeCumulative: 0, productionSpendCumulative: 0, discardedCumulative: 0, spentCumulative: 0 } },
    { t: 60_000, money: { total: 1400, incomeCumulative: 500, productionSpendCumulative: 100, discardedCumulative: 20, spentCumulative: 300 } },
  ];
  const reconciliation = reconcileMoney(samples);
  assert.equal(reconciliation.created, 500);
  assert.equal(reconciliation.burned, 100);
  assert.equal(reconciliation.expected, 400);
  assert.equal(reconciliation.observed, 400);
  assert.equal(reconciliation.residual, 0, "every credit is accounted for");
  assert.equal(reconciliation.notCreatedAtCap, 20, "income a household could not hold was never created");
  assert.equal(reconciliation.finalConsumption, 300);
});

test("money that appears from nowhere shows up as a residual", () => {
  const samples = [
    { t: 0, money: { total: 1000, incomeCumulative: 0, productionSpendCumulative: 0, discardedCumulative: 0, spentCumulative: 0 } },
    { t: 60_000, money: { total: 1750, incomeCumulative: 500, productionSpendCumulative: 100, discardedCumulative: 0, spentCumulative: 0 } },
  ];
  const reconciliation = reconcileMoney(samples);
  assert.equal(reconciliation.residual, 350, "350 credits came from a path this layer does not know about");
});

test("commissioned craft are a visible capital burn rather than an unexplained leak", () => {
  const samples = [
    { t: 0, money: { total: 10_000, incomeCumulative: 0, productionSpendCumulative: 0, capitalSpendCumulative: 0, discardedCumulative: 0, spentCumulative: 0 } },
    { t: 60_000, money: { total: 4_000, incomeCumulative: 0, productionSpendCumulative: 0, capitalSpendCumulative: 6_000, discardedCumulative: 0, spentCumulative: 0 } },
  ];
  const reconciliation = reconcileMoney(samples);
  assert.equal(reconciliation.capitalBurned, 6_000);
  assert.equal(reconciliation.burned, 6_000);
  assert.equal(reconciliation.residual, 0);
});

test("reconciling needs two samples", () => {
  assert.equal(reconcileMoney([]), null);
  assert.equal(reconcileMoney([{ t: 0, money: {} }]), null);
});

// ── The whole loop, against a live population ──────────────────────────────

test("a running population moves the sampled series the way the ledger says it did", () => {
  const world = createWorld({ stock: { "iron-nickel": 60, silicate: 60, "water-ice": 60 } });
  world.sample();

  for (let tick = 0; tick < 40; tick += 1) {
    world.advance(30);
    world.population.update();
    world.sample();
  }

  const samples = getEconomySamples(world.state, { now: world.now() });
  const first = samples[0];
  const last = samples[samples.length - 1];

  assert.ok(last.money.spentCumulative > 0, "households bought something");
  assert.ok(last.material.onShelf < first.material.onShelf, "and the shelf came down to pay for it");

  // The hub's own books have to agree with the world total it contributes to.
  const hub = last.actors["yard-exchange"];
  assert.equal(hub.margin, hub.revenue - hub.costOfGoodsSold);
  assert.ok(hub.revenue > 0, "the hub took money for goods");

  // Credit creation is a population's income and nothing else, so the world
  // total can only have moved by income less what hubs burned in production.
  const reconciliation = reconcileMoney(samples);
  assert.equal(reconciliation.residual, 0,
    `money leaked: created ${reconciliation.created}, burned ${reconciliation.burned}, observed ${reconciliation.observed}`);
  assert.ok(reconciliation.finalConsumption > 0, "final consumption is a real flow, not a level");
});
