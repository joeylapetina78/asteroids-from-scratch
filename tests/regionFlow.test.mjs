// A place simulated as rates rather than transactions. Step 4, Phase B.
//
// The model is only worth having if it is close to the thing it replaces, so
// most of what follows is about honesty rather than features: demand must be
// the SAME numbers the detailed path reads and not a second estimate of them,
// supply must be measured rather than assumed, and an unknown must be refused
// rather than treated as a zero.

import assert from "node:assert/strict";
import test from "node:test";
import {
  FLOW_MODEL_VERSION,
  advanceRegionFlow,
  compareRegionFlow,
  createRegionFlow,
  deriveDemandRates,
  minimumObservationSeconds,
  observeSupplyRates,
} from "../src/systems/regionFlow.js";
import { TRADED_FAMILIES, getFamilyConsumptionRates } from "../src/systems/hubInventory.js";
import { POPULATION_NEEDS, POPULATION_PROFILES, createPopulationOperation } from "../src/systems/populationDemand.js";
import { readEconomySnapshot, recordEconomySample, getEconomySamples, createInitialEconomyHistory } from "../src/systems/economySampler.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createHubProcurementOperation } from "../src/systems/hubProcurement.js";

const HUB = "yard-exchange";

function createWorld({ stock = 400, cash = 60_000 } = {}) {
  let clock = 1_000_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  Object.values(state.logistics.institutions)
    .filter((institution) => institution.archetypeId === "settlement")
    .forEach((institution) => {
      institution.accounts.operating.balance = cash;
      ["iron-nickel", "silicate", "water-ice"].forEach((resourceId) => { institution.inventories[resourceId] = stock; });
    });
  const population = createPopulationOperation({ state, now: () => clock });
  return {
    state, population,
    now: () => clock,
    advance: (seconds) => { clock += seconds * 1000; },
    sample: () => recordEconomySample(state, { now: clock, force: true }),
  };
}

// ── Demand is the authored number, not a second opinion ─────────────────────

test("consumption is exactly what the detailed path reads, not a re-derivation", () => {
  const rates = deriveDemandRates(HUB);
  assert.deepEqual(rates.consumption, getFamilyConsumptionRates(HUB),
    "if these two ever disagree, one of them has a bug — they are not two estimates");
});

test("income, spending and burn come straight off the authored records", () => {
  const rates = deriveDemandRates(HUB);
  const profiles = POPULATION_PROFILES.filter((profile) => profile.hubInstitutionId === HUB);
  assert.ok(profiles.length > 0, "the fixture hub has a population");

  const expectedIncome = profiles.reduce((sum, profile) =>
    sum + profile.incomeAmount / profile.incomeIntervalSeconds, 0);
  assert.equal(rates.householdIncomePerSecond, expectedIncome);

  const expectedSpend = profiles.reduce((sum, profile) => sum + profile.needIds.reduce((inner, needId) => {
    const need = POPULATION_NEEDS[needId];
    return inner + need.price / need.demandIntervalSeconds;
  }, 0), 0);
  assert.ok(Math.abs(rates.householdSpendPerSecond - expectedSpend) < 1e-9);

  // Only manufactured needs burn credits; a direct need is met from the shelf.
  const manufactured = profiles.flatMap((profile) => profile.needIds.map((id) => POPULATION_NEEDS[id]))
    .filter((need) => need.kind === "manufactured");
  const expectedBurn = manufactured.reduce((sum, need) => sum + need.productionCost / need.demandIntervalSeconds, 0);
  assert.ok(Math.abs(rates.productionBurnPerSecond - expectedBurn) < 1e-9);
  assert.ok(rates.productionBurnPerSecond > 0, "a hub that manufactures does destroy credits doing it");
});

test("a place with no population demands nothing rather than throwing", () => {
  const rates = deriveDemandRates("carrier:yard-hauler");
  assert.equal(rates.householdIncomePerSecond, 0);
  assert.equal(rates.householdSpendPerSecond, 0);
  TRADED_FAMILIES.forEach((family) => assert.equal(rates.consumption[family], 0));
});

// ── Supply is measured, and unknown is refused ──────────────────────────────

test("an unwatched region has an unknown supply rate, not a zero one", () => {
  assert.equal(observeSupplyRates([], HUB), null);
  assert.equal(observeSupplyRates([{ t: 0, actors: {} }], HUB), null, "one sighting is not a rate");
});

// Found on a freshly booted world: fifteen seconds of history reported every
// hub as supplied at exactly zero, and "zero" would have had the model drain
// them all to empty. A glance is not an observation.
test("a glance shorter than the settlement's own demand cycle is not a rate", () => {
  const minimum = minimumObservationSeconds(HUB);
  assert.ok(minimum > 0, "a settlement with needs has a cycle to watch");

  const glance = (seconds) => ([
    { t: 0, actors: { [HUB]: { byFamily: { structural: 10, industrial: 10, volatile: 10 } } } },
    { t: seconds * 1000, actors: { [HUB]: { byFamily: { structural: 10, industrial: 10, volatile: 10 } } } },
  ]);

  assert.equal(observeSupplyRates(glance(minimum / 2), HUB), null,
    "half a cycle in, no purchase was even due — this is not evidence of famine");
  assert.ok(observeSupplyRates(glance(minimum + 1), HUB), "a full cycle is enough to have an opinion");
});

// A population that bought everything it wanted over the span. Consumption is
// EVIDENCED here rather than assumed, so a fixture has to say what was actually
// bought before the model will credit the hub with having served anyone.
function populationsFed(seconds, { fed = true } = {}) {
  const profiles = POPULATION_PROFILES.filter((profile) => profile.hubInstitutionId === HUB);
  return Object.fromEntries(profiles.map((profile) => [profile.id, {
    id: profile.id,
    hubInstitutionId: HUB,
    byNeed: Object.fromEntries(profile.needIds.map((needId) => [needId, {
      purchased: fed ? seconds / POPULATION_NEEDS[needId].demandIntervalSeconds : 0,
    }])),
  }]));
}

// Reading the stock delta alone would report a hub that is exactly keeping up
// as producing nothing, and then the model would starve it.
test("supply is what arrived, which is the stock change plus what was eaten", () => {
  const consumption = getFamilyConsumptionRates(HUB);
  // Longer than the settlement's slowest demand cycle, or this is a glance.
  const seconds = 300;

  // A hub holding perfectly level, having served every need asked of it.
  const samples = [
    { t: 0, actors: { [HUB]: { byFamily: { structural: 50, industrial: 0, volatile: 0 }, cash: 0 } }, populations: populationsFed(0) },
    { t: seconds * 1000, actors: { [HUB]: { byFamily: { structural: 50, industrial: 0, volatile: 0 }, cash: 0 } }, populations: populationsFed(seconds) },
  ];
  const observed = observeSupplyRates(samples, HUB);
  assert.ok(Math.abs(observed.supply.structural - consumption.structural) < 1e-9,
    "a hub keeping pace is supplying exactly what it consumes, not nothing");
  assert.equal(observed.observedSeconds, seconds);
});

// The bug this replaced, found by running the model against the live world: six
// hubs sat with completely empty shelves and every one of them was reported as
// supplied at exactly its full consumption rate, because the measurement added
// back consumption the authored rate SAID should have happened. An empty hub
// consumes nothing. Wanting is not eating.
test("an empty shelf nobody could buy from reports no supply, not full supply", () => {
  const seconds = 300;
  const empty = { byFamily: { structural: 0, industrial: 0, volatile: 0 }, cash: 0 };
  const samples = [
    { t: 0, actors: { [HUB]: empty }, populations: populationsFed(0, { fed: false }) },
    { t: seconds * 1000, actors: { [HUB]: empty }, populations: populationsFed(seconds, { fed: false }) },
  ];

  const observed = observeSupplyRates(samples, HUB);
  TRADED_FAMILIES.forEach((family) => {
    assert.equal(observed.supply[family], 0,
      `${family}: a starving hub is starving, however much its people wanted`);
  });
});

// Starvation is the common case in this world, not an edge case, so the model
// has to bill for it correctly: an empty hub earns nothing and burns nothing.
test("a hub with nothing to sell books no revenue and burns no credits", () => {
  const flow = {
    version: FLOW_MODEL_VERSION,
    institutionId: HUB,
    at: 0,
    stock: { structural: 0, industrial: 0, volatile: 0 },
    cash: 10_000,
    demand: deriveDemandRates(HUB),
    supply: { structural: 0, industrial: 0, volatile: 0 },
    observedSeconds: 100,
    burnedCumulative: 0,
    createdCumulative: 0,
  };

  const advanced = advanceRegionFlow(flow, 300);
  assert.equal(advanced.servedFraction, 0, "nothing on the shelf, nobody served");
  assert.equal(advanced.cash, 10_000, "an empty hub neither earns nor spends");
  assert.equal(advanced.burnedCumulative, 0, "no goods finished, no credits destroyed");
  assert.ok(advanced.createdCumulative > 0,
    "households are still paid — their cash piles up precisely because there is nothing to buy");
  TRADED_FAMILIES.forEach((family) => {
    assert.ok(advanced.shortfall[family] > 0, `${family} demand went unmet and is reported as such`);
  });
});

test("a shrinking shelf reports less supply than consumption, never negative", () => {
  const samples = [
    { t: 0, actors: { [HUB]: { byFamily: { structural: 100, industrial: 0, volatile: 0 } } } },
    { t: 300_000, actors: { [HUB]: { byFamily: { structural: 0, industrial: 0, volatile: 0 } } } },
  ];
  const observed = observeSupplyRates(samples, HUB);
  TRADED_FAMILIES.forEach((family) => {
    assert.ok(observed.supply[family] >= 0, `${family} supply is never negative`);
  });
  assert.ok(observed.supply.structural < getFamilyConsumptionRates(HUB).structural,
    "a hub running its shelf down is not keeping up");
});

// ── Advancing ───────────────────────────────────────────────────────────────

test("a flow with no observed supply refuses to advance rather than guessing", () => {
  const world = createWorld();
  const flow = createRegionFlow(world.state, HUB, { samples: [], at: world.now() });
  assert.equal(flow.supply, null, "never watched, so the rate is unknown");

  const advanced = advanceRegionFlow(flow, 60);
  assert.equal(advanced.blocked, "supply-rate-unknown");
  assert.deepEqual(advanced.stock, flow.stock, "and nothing was drained on a guess");
  assert.equal(advanced.cash, flow.cash);
});

test("advancing moves stock by supply against consumption", () => {
  const world = createWorld();
  const flow = {
    ...createRegionFlow(world.state, HUB, { at: 0 }),
    stock: { structural: 100, industrial: 100, volatile: 100 },
    supply: { structural: 1, industrial: 0, volatile: 0 },
  };
  const consumption = getFamilyConsumptionRates(HUB);
  const advanced = advanceRegionFlow(flow, 10);

  assert.ok(Math.abs(advanced.stock.structural - (100 + 10 - consumption.structural * 10)) < 1e-9);
  assert.ok(Math.abs(advanced.stock.industrial - (100 - consumption.industrial * 10)) < 1e-9);
  assert.equal(advanced.blocked, null);
});

test("a shelf empties rather than going negative", () => {
  const world = createWorld();
  const flow = {
    ...createRegionFlow(world.state, HUB, { at: 0 }),
    stock: { structural: 1, industrial: 1, volatile: 1 },
    supply: { structural: 0, industrial: 0, volatile: 0 },
  };
  const advanced = advanceRegionFlow(flow, 100_000);
  TRADED_FAMILIES.forEach((family) => assert.equal(advanced.stock[family], 0, `${family} bottoms out at empty`));
});

// The reason the burn matters: `reconcileMoney` needs `burned` to keep accruing
// while a region is aggregated, or the books stop balancing the moment a place
// stops being simulated in detail.
test("an aggregated region still accrues the credit burn the books need", () => {
  const world = createWorld();
  const flow = { ...createRegionFlow(world.state, HUB, { at: 0 }), supply: { structural: 0, industrial: 0, volatile: 0 } };
  const seconds = 600;
  const advanced = advanceRegionFlow(flow, seconds);

  const rates = deriveDemandRates(HUB);
  assert.ok(Math.abs(advanced.burnedCumulative - rates.productionBurnPerSecond * seconds) < 1e-6,
    "credits destroyed by production keep accruing while nobody watches");
  assert.ok(Math.abs(advanced.createdCumulative - rates.householdIncomePerSecond * seconds) < 1e-6,
    "and so does the income that creates them");
  assert.ok(advanced.burnedCumulative > 0);
});

test("a flow carries its model version, so a stale one can be spotted", () => {
  const world = createWorld();
  assert.equal(createRegionFlow(world.state, HUB, { at: 0 }).version, FLOW_MODEL_VERSION);
});

// ── The measurement Phase C has to justify itself against ───────────────────

// The whole point. An aggregate nobody has measured is a guess with extra
// steps, so this runs the real detailed simulation, models the same span with
// rates, and reports how far apart they end up.
test("the model is measured against a real detailed run, not asserted to be right", () => {
  const world = createWorld();
  const procurement = createHubProcurementOperation({ state: world.state, now: world.now });

  // Watch the hub for a while so there is a supply rate to observe.
  world.state.economyHistory = createInitialEconomyHistory();
  world.sample();
  for (let step = 0; step < 60; step += 1) {
    world.advance(5);
    procurement.update();
    world.population.update();
    world.sample();
  }

  const observedSamples = getEconomySamples(world.state, { windowMs: Infinity, now: world.now() });
  const flow = createRegionFlow(world.state, HUB, { samples: observedSamples, at: world.now() });
  assert.ok(flow.supply, "the hub was watched long enough to know how fast it restocks");

  // Now run BOTH forward over the same span and see where they disagree.
  const span = 60;
  const modelled = advanceRegionFlow(flow, span);
  for (let step = 0; step < span / 5; step += 1) {
    world.advance(5);
    procurement.update();
    world.population.update();
  }
  const truth = readEconomySnapshot(world.state, { now: world.now() });
  const drift = compareRegionFlow(modelled, truth);

  assert.ok(drift, "the hub is in the snapshot to compare against");
  assert.equal(drift.institutionId, HUB);
  TRADED_FAMILIES.forEach((family) => {
    assert.equal(typeof drift.stockDrift[family], "number", `${family} drift is reported`);
  });
  assert.equal(typeof drift.cashDrift, "number");

  // Deliberately NOT asserting a tight bound. This test exists to MEASURE and
  // to keep measuring; picking a threshold now would be inventing the answer
  // before Phase C has to live with it. What it does assert is that the model
  // stays in the same world as the truth rather than diverging without limit.
  assert.ok(Number.isFinite(drift.worstStockDriftFraction));
  assert.ok(Math.abs(drift.cashDrift) < 1_000_000, `cash drift stayed bounded, got ${drift.cashDrift}`);
});

test("comparing against a place that is not in the snapshot says so", () => {
  const world = createWorld();
  const flow = createRegionFlow(world.state, "nowhere-at-all", { at: 0 });
  assert.equal(compareRegionFlow(flow, { actors: {} }), null);
});
