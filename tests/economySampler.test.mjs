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
import { ACTOR_ROLE, listActors, registerActorSource, unregisterActorSource } from "../src/systems/actorRegistry.js";

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

// THE BOUNDARY INSURANCE, and the reason this stopped being a hand-written
// list. A kind of actor nobody thought to write down here is money the
// reconciliation reports as vanishing — that is exactly how five treasuries
// went missing the first time. Step 4 will introduce actor kinds that do not
// exist yet: a procedurally generated company, and a far region aggregated into
// a single balance sheet. Both arrive through `registerActorSource`, and both
// have to be counted without this file being touched.
test("a kind of actor that did not exist yet is still counted", () => {
  const world = createWorld();
  const before = readEconomySnapshot(world.state, { now: world.now() }).money.institutions;

  // Something no state shape in this codebase currently knows about.
  world.state.__farRegions = {
    "region:outer-drift": {
      id: "region:outer-drift",
      name: "Outer Drift",
      accounts: { operating: { balance: 12_345, committed: 0 } },
      inventories: { silicate: 7 },
    },
  };
  registerActorSource(world.state, "far-regions", (state) =>
    Object.values(state.__farRegions ?? {}).map((record) => ({
      id: record.id, record, role: ACTOR_ROLE.INSTITUTION, domain: "far-regions",
    })));

  const holders = listAccountHolders(world.state).map((holder) => holder.record.id);
  assert.ok(holders.includes("region:outer-drift"),
    "a treasury introduced through the registry is found without this file naming it");

  const snapshot = readEconomySnapshot(world.state, { now: world.now() });
  assert.equal(snapshot.money.institutions, before + 12_345, "and its money is in the world total");
  assert.equal(snapshot.actors["region:outer-drift"].inventoryUnits, 7, "along with what it holds");

  const listed = Object.values(snapshot.actors).reduce((sum, actor) => sum + actor.cash, 0);
  assert.equal(snapshot.money.institutions, listed, "the total is still the sum of what is listed");

  unregisterActorSource(world.state, "far-regions");
  assert.ok(!listAccountHolders(world.state).map((holder) => holder.record.id).includes("region:outer-drift"),
    "and it leaves again when its source does");
});

// A person or a ship has no balance sheet of its own — a controller's money is
// their institution's, and a population's cash is counted separately as
// household cash. Enumerating every actor rather than every institution makes
// double-counting the live risk, so it is worth stating.
test("only balance sheets are counted, not everyone the registry knows", () => {
  const world = createWorld();
  createPopulationOperation({ state: world.state, now: world.now });

  const holders = listAccountHolders(world.state).map((holder) => holder.record.id);
  const registryIds = listActors(world.state).map((actor) => actor.id);

  assert.ok(registryIds.length > holders.length, "the registry knows more actors than there are treasuries");
  holders.forEach((id) => {
    assert.ok(!id.startsWith("person:"), `${id} is a person and holds no treasury of its own`);
    assert.ok(!id.startsWith("population:"), `${id} is a population, counted as household cash instead`);
  });

  const snapshot = readEconomySnapshot(world.state, { now: world.now() });
  assert.equal(
    snapshot.money.total,
    snapshot.money.populations + snapshot.money.institutions + snapshot.money.player,
    "household, institution and player cash stay three separate pots",
  );
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

// ── Arriving and leaving is not creating and destroying ─────────────────────
//
// The case that sent me looking. Sable Meridian Security is seeded holding
// 3,200 credits and only registered the first time protection is needed, so the
// world's total rose by 3,200 with nothing creating it and the reconciliation
// reported a 3,200 leak. Nothing leaked — an actor walked in with money already
// in its pocket.
//
// This stops being a curiosity at step 4: aggregating a far region into one
// balance sheet and expanding it again adds and removes actors constantly.

const bands = (total, extra = {}) => ({
  total, populations: 0, player: 0, institutions: total,
  incomeCumulative: 0, productionSpendCumulative: 0, capitalSpendCumulative: 0,
  discardedCumulative: 0, spentCumulative: 0, ...extra,
});

test("an actor arriving with a balance is reported as arrival, not as a leak", () => {
  const samples = [
    { t: 0, money: bands(1_000), actors: { "yard-exchange": { id: "yard-exchange", name: "Yard Exchange", cash: 1_000 } } },
    {
      t: 60_000,
      money: bands(4_200),
      actors: {
        "yard-exchange": { id: "yard-exchange", name: "Yard Exchange", cash: 1_000 },
        "sable-meridian-security": { id: "sable-meridian-security", name: "Sable Meridian Security", cash: 3_200 },
      },
    },
  ];

  const reconciliation = reconcileMoney(samples);
  assert.equal(reconciliation.observed, 3_200, "the world does hold 3,200 more than it did");
  assert.equal(reconciliation.endowed, 3_200, "and all of it walked in with an actor");
  assert.equal(reconciliation.flow, 0, "nothing actually moved between parties");
  assert.equal(reconciliation.residual, 0, "so there is nothing unexplained");
  assert.deepEqual(reconciliation.arrivals.map((entry) => entry.id), ["sable-meridian-security"],
    "and the newcomer is named, so the claim can be checked");
});

test("an actor leaving takes its balance out of the world, also not a leak", () => {
  const samples = [
    {
      t: 0,
      money: bands(4_200),
      actors: {
        "yard-exchange": { id: "yard-exchange", name: "Yard Exchange", cash: 1_000 },
        "gone-concern": { id: "gone-concern", name: "Gone Concern", cash: 3_200 },
      },
    },
    { t: 60_000, money: bands(1_000), actors: { "yard-exchange": { id: "yard-exchange", name: "Yard Exchange", cash: 1_000 } } },
  ];

  const reconciliation = reconcileMoney(samples);
  assert.equal(reconciliation.observed, -3_200);
  assert.equal(reconciliation.withdrawn, 3_200);
  assert.equal(reconciliation.flow, 0);
  assert.equal(reconciliation.residual, 0);
  assert.deepEqual(reconciliation.departures.map((entry) => entry.id), ["gone-concern"]);
});

// The distinction has to CUT BOTH WAYS, or it becomes a way to hide leaks:
// an actor arriving must not launder a real one happening beside it.
test("an arrival does not hide a leak happening alongside it", () => {
  const samples = [
    { t: 0, money: bands(1_000), actors: { "yard-exchange": { id: "yard-exchange", name: "Yard Exchange", cash: 1_000 } } },
    {
      t: 60_000,
      money: bands(4_700),
      actors: {
        // The incumbent gained 500 with nothing creating it — a genuine leak.
        "yard-exchange": { id: "yard-exchange", name: "Yard Exchange", cash: 1_500 },
        "sable-meridian-security": { id: "sable-meridian-security", name: "Sable Meridian Security", cash: 3_200 },
      },
    },
  ];

  const reconciliation = reconcileMoney(samples);
  assert.equal(reconciliation.endowed, 3_200, "the arrival is still accounted for separately");
  assert.equal(reconciliation.flow, 500, "and the other 500 is real movement");
  assert.equal(reconciliation.residual, 500, "which nothing created, so it is still reported");
});

test("a world where nobody comes or goes reconciles exactly as it always did", () => {
  const samples = [
    { t: 0, money: bands(1_000), actors: { a: { id: "a", name: "A", cash: 1_000 } } },
    { t: 60_000, money: bands(1_750, { incomeCumulative: 500, productionSpendCumulative: 100 }), actors: { a: { id: "a", name: "A", cash: 1_750 } } },
  ];
  const reconciliation = reconcileMoney(samples);
  assert.equal(reconciliation.endowed, 0);
  assert.equal(reconciliation.withdrawn, 0);
  assert.equal(reconciliation.flow, reconciliation.observed, "with a stable roster, flow IS the observed change");
  assert.equal(reconciliation.residual, 350, "and the old answer is unchanged");
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
