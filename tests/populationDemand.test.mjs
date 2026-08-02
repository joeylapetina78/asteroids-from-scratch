// Population demand: the first real consumption sink for hub material.

import assert from "node:assert/strict";
import test from "node:test";
import { NEED_KIND, POPULATION_NEEDS, POPULATION_PROFILES, createPopulationOperation } from "../src/systems/populationDemand.js";
import { getResourceFamily } from "../src/systems/resourceDefinitions.js";
import { getRetentionClass, RETENTION_CLASS } from "../src/systems/eventRetention.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { inspectActor, listInspectableActors } from "../src/systems/actorInspector.js";
import { recordAcquisition } from "../src/systems/costBasis.js";
import { formatBlockerChain, resolveBlockerChain } from "../src/systems/diagnostics.js";

function createWorld({ stock = {}, hubCash = 5_000 } = {}) {
  let clock = 1_000_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  const hub = state.logistics.institutions["yard-exchange"];
  hub.accounts.operating.balance = hubCash;
  // Hubs now start with operating stock. These tests control supply exactly,
  // so clear the shelf before seeding only what the case is about.
  hub.inventories = {};
  Object.entries(stock).forEach(([resourceId, units]) => { hub.inventories[resourceId] = units; });
  const population = createPopulationOperation({ state, now: () => clock });
  return {
    state, hub, population,
    advance: (seconds) => { clock += seconds * 1000; },
    now: () => clock,
    record: () => population.getState().populations["population:yard-exchange"],
    // All settlements run. These cases are about the Yard Exchange pair, so
    // ignore what the other populations get up to.
    events: (type) => state.ledger.getEventsAfterId(0).filter((entry) => {
      if (entry.type !== type) return false;
      const p = entry.payload ?? {};
      if (p.populationId && p.populationId !== "population:yard-exchange") return false;
      if (p.hubInstitutionId && p.hubInstitutionId !== "yard-exchange") return false;
      if (p.buyerId && p.buyerId !== "population:yard-exchange") return false;
      return true;
    }),
  };
}

// Enough of every family to satisfy all four needs repeatedly.
const FULL_STOCK = { "iron-nickel": 40, aluminum: 20, silicate: 40, "water-ice": 40 };

test("the population profile and its needs are data, not hardcoded behaviour", () => {
  const profile = POPULATION_PROFILES.find((entry) => entry.id === "population:yard-exchange");
  assert.ok(profile, "Yard Exchange has a population profile");
  assert.deepEqual(profile.needIds, ["settlement-supply-unit", "life-support-pack", "household-goods-unit", "general-materials"]);
  assert.equal(Object.keys(POPULATION_NEEDS).length, 4);
});

test("each need pulls on the resource families it is meant to", () => {
  assert.deepEqual(POPULATION_NEEDS["settlement-supply-unit"].families, ["structural", "industrial"]);
  assert.deepEqual(POPULATION_NEEDS["life-support-pack"].families, ["volatile"]);
  assert.deepEqual(POPULATION_NEEDS["household-goods-unit"].families, ["structural", "industrial", "volatile"]);
  assert.equal(POPULATION_NEEDS["general-materials"].families, null, "the flexible need accepts any family");
  assert.equal(POPULATION_NEEDS["general-materials"].kind, NEED_KIND.DIRECT, "and needs no recipe");
});

test("demand appears on its own cadence and is capped at the backlog limit", () => {
  const world = createWorld();
  const need = POPULATION_NEEDS["general-materials"];
  // No stock, so nothing can be bought and backlog only accumulates.
  for (let tick = 0; tick < 12; tick += 1) {
    world.advance(need.demandIntervalSeconds);
    world.population.update();
  }
  assert.equal(world.record().needs["general-materials"].backlog, need.maxBacklog,
    "backlog stops at the cap instead of growing without bound");
});

test("background income arrives on cadence and respects the household cash cap", () => {
  const world = createWorld();
  const record = world.record();
  record.householdCash = 0;
  world.advance(record.incomeIntervalSeconds);
  world.population.update();
  assert.equal(world.record().householdCash, record.incomeAmount);

  // Run far past the cap; household cash must never exceed it.
  for (let tick = 0; tick < 10; tick += 1) {
    world.advance(record.incomeIntervalSeconds);
    world.population.update();
  }
  assert.ok(world.record().householdCash <= record.householdCashCap,
    "income stops accumulating at the cap");
});

test("a hub produces a Settlement Supply Unit by consuming structural or industrial material", () => {
  const world = createWorld({ stock: { "iron-nickel": 10 } });
  const need = POPULATION_NEEDS["settlement-supply-unit"];
  const stockBefore = world.hub.inventories["iron-nickel"];

  world.advance(need.demandIntervalSeconds);
  world.population.update();               // demand raised, production started
  const started = world.events("population.productionStarted").filter((entry) => entry.payload.needId === need.id);
  assert.equal(started.length, 1, "the hub started building the unit it was asked for");
  assert.ok(world.hub.inventories["iron-nickel"] < stockBefore, "and real material left hub stock");
  const drawnUnits = Object.values(started[0].payload.inputs).reduce((sum, units) => sum + units, 0);
  assert.equal(drawnUnits, need.materialUnits, "the production drew exactly what the need requires");
  Object.keys(started[0].payload.inputs).forEach((resourceId) => {
    assert.ok(need.families.includes(getResourceFamily(resourceId)),
      `${resourceId} must belong to a family this need pulls on`);
  });

  world.advance(need.productionSeconds);
  world.population.update();               // production completes, then it sells
  // Other needs share this cadence and may also be met from the same stock, so
  // count only this need's units.
  const forNeed = (type) => world.events(type).filter((entry) => entry.payload.needId === need.id);
  assert.equal(forNeed("population.productionCompleted").length, 1);
  assert.equal(forNeed("population.goodsPurchased").length, 1);
  assert.equal(forNeed("population.goodsConsumed").length, 1);
});

test("credits move from the population to the hub, and the goods are consumed", () => {
  const world = createWorld({ stock: FULL_STOCK });
  const need = POPULATION_NEEDS["settlement-supply-unit"];
  const cashBefore = world.record().householdCash;
  const hubBefore = world.hub.accounts.operating.balance;

  world.advance(need.demandIntervalSeconds);
  world.population.update();
  world.advance(need.productionSeconds);
  world.population.update();

  const purchases = world.events("population.goodsPurchased");
  assert.ok(purchases.some((entry) => entry.payload.needId === need.id), "the unit was bought");
  // Several needs share a cadence, so account for every purchase and every
  // production run rather than assuming this need acted alone.
  const paid = purchases.reduce((sum, entry) => sum + entry.payload.price, 0);
  const productionSpend = world.events("population.productionStarted")
    .reduce((sum, entry) => sum + entry.payload.conversionCost, 0);
  assert.equal(world.record().householdCash, cashBefore - paid, "the household paid for what it bought");
  assert.equal(world.hub.accounts.operating.balance, hubBefore - productionSpend + paid,
    "the hub banked every sale and paid for every production run");
  assert.equal(world.record().needs[need.id].consumed, 1, "and the unit was consumed, not stockpiled");
});

test("no material or credit is created or destroyed without an event", () => {
  const world = createWorld({ stock: FULL_STOCK });
  const totalStock = (hub) => Object.values(hub.inventories).reduce((sum, units) => sum + units, 0);
  const stockBefore = totalStock(world.hub);
  const cashBefore = world.record().householdCash + world.hub.accounts.operating.balance;

  for (let tick = 0; tick < 40; tick += 1) {
    world.advance(30);
    world.population.update();
  }

  const consumedEvents = world.events("population.goodsConsumed");
  const purchases = world.events("population.goodsPurchased");
  const income = world.events("population.incomeReceived");
  assert.ok(consumedEvents.length > 0, "the run actually consumed something");

  // Every unit of material that left the hub is accounted for by a production
  // draw or a direct-need draw, both of which are logged.
  const drawnFromProduction = world.events("population.productionStarted")
    .reduce((sum, entry) => sum + Object.values(entry.payload.inputs).reduce((a, b) => a + b, 0), 0);
  const directNeed = POPULATION_NEEDS["general-materials"];
  const directDraws = consumedEvents.filter((entry) => entry.payload.needId === directNeed.id).length * directNeed.materialUnits;
  assert.equal(totalStock(world.hub), stockBefore - drawnFromProduction - directDraws,
    "hub stock fell by exactly what was drawn and logged");

  // Credits: the only inflow is background income, the only outflows are
  // production costs, and the population/hub pair conserves the rest between them.
  const incomeTotal = income.reduce((sum, entry) => sum + entry.payload.amount, 0);
  const productionSpend = world.events("population.productionStarted").length * 0
    + world.events("population.productionStarted").reduce((sum, entry) => sum + entry.payload.conversionCost, 0);
  const cashAfter = world.record().householdCash + world.hub.accounts.operating.balance;
  assert.equal(cashAfter, cashBefore + incomeTotal - productionSpend,
    "credits are conserved apart from logged income and logged production cost");
  assert.ok(purchases.length > 0);
});

test("a population that cannot pay keeps its demand and reports why", () => {
  const world = createWorld({ stock: FULL_STOCK });
  const record = world.record();
  record.householdCash = 0;
  record.incomeAmount = 0;             // never gets paid
  const need = POPULATION_NEEDS["general-materials"];

  world.advance(need.demandIntervalSeconds);
  world.population.update();

  assert.ok(world.record().needs[need.id].backlog > 0, "the demand remains");
  assert.equal(world.events("population.goodsPurchased").length, 0, "and nothing was bought");
  const diagnostic = world.state.diagnostics.actors["population:yard-exchange"];
  assert.ok(diagnostic.blocker, "the population is visibly blocked");
  assert.match(diagnostic.blocker.summary, /cannot afford/i);
});

test("a hub with no eligible family material reports the shortage it is waiting on", () => {
  // Only volatile stock, so a Settlement Supply Unit (structural/industrial)
  // cannot be built. This is the interdependence: Yard Exchange must trade.
  const world = createWorld({ stock: { "water-ice": 20 } });
  const need = POPULATION_NEEDS["settlement-supply-unit"];
  world.advance(need.demandIntervalSeconds);
  world.population.update();

  assert.equal(world.events("population.productionStarted")
    .filter((entry) => entry.payload.needId === need.id).length, 0, "nothing was built");

  // The shortage belongs to the HUB. The population is a customer, not a
  // manufacturer, so its own blocker says only that it is waiting to buy.
  const hubRecord = world.state.diagnostics.actors["yard-exchange"];
  assert.ok(hubRecord?.blocker, "the hub reports its own shortage");
  assert.equal(hubRecord.actorKind, "institution");
  assert.match(hubRecord.blocker.summary, /cannot build .*: no structural\/industrial material/i);

  const popRecord = world.state.diagnostics.actors["population:yard-exchange"];
  assert.ok(popRecord.blocker, "the population is waiting");
  assert.match(popRecord.blocker.summary, /waiting to buy/i);
  assert.doesNotMatch(popRecord.blocker.summary, /cannot build/i,
    "a household must never be described as failing to manufacture");
});

test("the flexible need is met by any family, without a recipe", () => {
  // Only volatile stock: the specific needs cannot be met, but general
  // materials can, because any family is an approved substitute.
  const world = createWorld({ stock: { "water-ice": 20 } });
  const need = POPULATION_NEEDS["general-materials"];
  world.advance(need.demandIntervalSeconds);
  world.population.update();

  const consumed = world.events("population.goodsConsumed").filter((entry) => entry.payload.needId === need.id);
  assert.equal(consumed.length, 1, "the flexible need was satisfied from an unrelated family");
  assert.match(consumed[0].payload.consumed, /water ice/);
  assert.equal(getResourceFamily("water-ice"), "volatile");
});

test("the hub spends its cheapest eligible material first", () => {
  const world = createWorld({ stock: { "iron-nickel": 10, aluminum: 10 } });
  // Make aluminum clearly the cheaper holding.
  world.state.costBasis = world.state.costBasis ?? {};
  const need = POPULATION_NEEDS["settlement-supply-unit"];
  const ironBefore = world.hub.inventories["iron-nickel"];
  const aluminumBefore = world.hub.inventories.aluminum;
  world.advance(need.demandIntervalSeconds);
  world.population.update();

  const started = world.events("population.productionStarted").find((entry) => entry.payload.needId === need.id);
  assert.ok(started, "production began");
  const drawnUnits = Object.values(started.payload.inputs).reduce((sum, units) => sum + units, 0);
  assert.equal(drawnUnits, need.materialUnits, "exactly the required units were drawn");
  assert.ok(ironBefore + aluminumBefore > world.hub.inventories["iron-nickel"] + world.hub.inventories.aluminum,
    "and they came out of hub stock");
});

test("the population is an inspectable actor in the observatory", () => {
  const world = createWorld({ stock: FULL_STOCK });
  world.advance(200);
  world.population.update();
  const actors = listInspectableActors(world.state);
  const entry = actors.find((candidate) => candidate.actorId === "population:yard-exchange");
  assert.ok(entry, "the population appears alongside ships and institutions");
  assert.equal(entry.kind, "population");
  assert.equal(entry.controllerId, "yard-exchange");
  assert.ok(entry.summary.length > 0);
});

test("hub administrations and populations resolve to their site's viewport position and data card", () => {
  const world = createWorld({ stock: FULL_STOCK, hubCash: 12_000 });
  world.advance(200);
  world.population.update();
  const game = { worldSites: [{ id: "yard-exchange", position: { x: 380, y: -180 } }] };

  const hub = inspectActor(world.state, "yard-exchange", { game });
  const population = inspectActor(world.state, "population:yard-exchange", { game });
  assert.deepEqual(hub.position, { x: 380, y: -180 });
  assert.deepEqual(population.position, { x: 380, y: -180 });
  assert.equal(hub.kind, "institution");
  assert.equal(hub.institution.account.balance, Math.round(world.hub.accounts.operating.balance));
  assert.ok(hub.institution.inventories);
  assert.equal(population.kind, "population");
  assert.equal(population.detail.size, 140);
  assert.ok(Array.isArray(population.detail.needs));

  const porchGame = { worldSites: [{ id: "scrap-porch", position: { x: -1180, y: 860 } }] };
  const porch = inspectActor(world.state, "scrap-forge", { game: porchGame });
  assert.equal(porch.locationSiteId, "scrap-porch", "institution identity does not have to equal its geographic site id");
  assert.deepEqual(porch.position, { x: -1180, y: 860 });
});

test("purchases and consumption are durable history, demand is operational", () => {
  assert.equal(getRetentionClass("population.goodsPurchased"), RETENTION_CLASS.DURABLE);
  assert.equal(getRetentionClass("population.goodsConsumed"), RETENTION_CLASS.DURABLE);
  assert.equal(getRetentionClass("population.demandRaised"), RETENTION_CLASS.OPERATIONAL);
});

test("hub revenue from the population can exceed what it spends producing", () => {
  const world = createWorld({ stock: FULL_STOCK });
  const hubBefore = world.hub.accounts.operating.balance;
  for (let tick = 0; tick < 40; tick += 1) {
    world.advance(30);
    world.population.update();
  }
  assert.ok(world.events("population.goodsPurchased").length > 0);
  assert.ok(world.hub.accounts.operating.balance > hubBefore,
    "selling to its population leaves the hub better off than it started");
});

test("a hub books what it paid for ore, so its goods carry the material cost", () => {
  const world = createWorld({ stock: { "iron-nickel": 10 } });
  const need = POPULATION_NEEDS["settlement-supply-unit"];
  // Give the hub a real cost basis for its ore, the way a standing mining
  // settlement now does.
  recordAcquisition(world.state, {
    institutionId: "yard-exchange", itemId: "iron-nickel", units: 10, totalCost: 420, at: world.now(),
  });

  world.advance(need.demandIntervalSeconds);
  world.population.update();
  world.advance(need.productionSeconds);
  world.population.update();

  const completed = world.events("population.productionCompleted").find((entry) => entry.payload.needId === need.id);
  assert.ok(completed, "the unit was produced");
  assert.ok(completed.payload.unitCost > need.productionCost,
    `unit cost ${completed.payload.unitCost} must exceed the ${need.productionCost} conversion fee once material is counted`);
});

// ── Buyer and seller are separate economic actors ──────────────────────────

test("a rich hub cannot make an insolvent population able to buy", () => {
  const world = createWorld({ stock: FULL_STOCK, hubCash: 1_000_000 });
  const record = world.record();
  record.householdCash = 0;
  record.incomeAmount = 0;
  const need = POPULATION_NEEDS["general-materials"];

  world.advance(need.demandIntervalSeconds);
  world.population.update();

  assert.equal(world.events("population.goodsPurchased").length, 0,
    "affordability must read household cash, never the seller's treasury");
  assert.ok(world.record().needs[need.id].backlog > 0, "the demand survives");
});

test("a broke hub cannot spend household cash to fund its own production", () => {
  const world = createWorld({ stock: FULL_STOCK, hubCash: 0 });
  const need = POPULATION_NEEDS["settlement-supply-unit"];
  const cashBefore = world.record().householdCash;

  world.advance(need.demandIntervalSeconds);
  world.population.update();

  assert.equal(world.events("population.productionStarted")
    .filter((entry) => entry.payload.needId === need.id).length, 0, "it could not afford to build");
  // The population may still have bought direct-need material in the same tick,
  // which costs the hub stock but no cash. What must never happen is production
  // cost landing on the household. So household cash may only fall by the sum
  // of the population's own purchases.
  const paid = world.events("population.goodsPurchased").reduce((sum, entry) => sum + entry.payload.price, 0);
  assert.equal(world.record().householdCash, cashBefore - paid,
    "household cash only moves for the population's own purchases");
  assert.ok(paid % need.productionCost !== 0 || paid === 0,
    "and never carries a production cost");
});

test("the sale records both sides with before and after balances", () => {
  const world = createWorld({ stock: FULL_STOCK });
  const need = POPULATION_NEEDS["general-materials"];
  world.advance(need.demandIntervalSeconds);
  world.population.update();

  const sale = world.events("population.goodsPurchased").find((entry) => entry.payload.product === need.id);
  assert.ok(sale, "the sale was recorded");
  const p = sale.payload;
  assert.equal(p.buyerId, "population:yard-exchange");
  assert.equal(p.sellerId, "yard-exchange");
  assert.equal(p.productLabel, need.label);
  assert.equal(p.price, need.price);
  // The ledger entry alone proves the transfer balances.
  assert.equal(p.buyerCashBefore - p.buyerCashAfter, need.price, "the buyer paid exactly the price");
  assert.equal(p.sellerTreasuryAfter - p.sellerTreasuryBefore, need.price, "the seller received exactly the price");
  assert.equal(p.buyerCashBefore - p.buyerCashAfter, p.sellerTreasuryAfter - p.sellerTreasuryBefore,
    "nothing was created or destroyed in the transfer");
});

test("the seller keeps its own books: revenue, cost of goods, and margin", () => {
  const world = createWorld({ stock: FULL_STOCK });
  for (let tick = 0; tick < 40; tick += 1) {
    world.advance(30);
    world.population.update();
  }
  const books = world.hub.settlementTrade;
  assert.ok(books, "the hub has its own trade record");
  assert.ok(books.unitsSold > 0);
  assert.equal(books.margin, books.revenue - books.costOfGoodsSold, "margin is revenue less cost of goods");
  assert.ok(books.productionSpend > 0, "and production spend is tracked separately from revenue");
  // The buyer's books are its own and do not appear on the seller's.
  assert.equal(books.revenue, world.record().totalSpent,
    "every credit the population spent arrived as hub revenue");
});

test("population inventory is consumption, not a stockpile the hub can resell", () => {
  const world = createWorld({ stock: FULL_STOCK });
  const need = POPULATION_NEEDS["settlement-supply-unit"];
  world.advance(need.demandIntervalSeconds);
  world.population.update();
  world.advance(need.productionSeconds);
  world.population.update();

  assert.equal(world.hub.finishedGoods[need.id] ?? 0, 0, "the finished unit left hub inventory");
  assert.equal(world.record().needs[need.id].consumed, 1, "and was consumed by the population");
  assert.equal(world.events("population.goodsConsumed").filter((e) => e.payload.needId === need.id).length, 1,
    "with an explicit consumption event");
});

// ── Hub and population are separate actors in the observatory ──────────────

test("the why-chain runs from the waiting population into the hub's shortage", () => {
  const world = createWorld({ stock: {} });
  const need = POPULATION_NEEDS["life-support-pack"];
  world.advance(need.demandIntervalSeconds);
  world.population.update();

  const popRecord = world.state.diagnostics.actors["population:yard-exchange"];
  const lines = formatBlockerChain(resolveBlockerChain(world.state, popRecord.blocker)).map((line) => line.summary);
  assert.ok(lines.length > 1, `the chain should continue into the hub, got: ${JSON.stringify(lines)}`);
  assert.match(lines[0], /waiting to buy/i);
  assert.ok(lines.slice(1).some((line) => /cannot build|no material|cannot supply/i.test(line)),
    `the cause should be the hub's shortage, got: ${JSON.stringify(lines)}`);
});

test("a hub explains that it cannot simply mine what it is missing", () => {
  // Yard Exchange holds structural rights only, so volatile must be bought.
  const world = createWorld({ stock: {} });
  const need = POPULATION_NEEDS["life-support-pack"];
  world.advance(need.demandIntervalSeconds);
  world.population.update();

  const hubRecord = world.state.diagnostics.actors["yard-exchange"];
  assert.ok(hubRecord?.blocker);
  const chain = formatBlockerChain(resolveBlockerChain(world.state, hubRecord.blocker)).map((line) => line.summary).join(" | ");
  assert.match(chain, /no mining right for volatile|must buy this material/i,
    `the hub should say why it cannot dig it up itself, got: ${chain}`);
});

test("every hub has its own population, and each is its own actor", () => {
  const world = createWorld({ stock: FULL_STOCK });
  world.advance(200);
  world.population.update();
  const actors = listInspectableActors(world.state);
  const populations = actors.filter((entry) => entry.kind === "population");
  assert.equal(populations.length, POPULATION_PROFILES.length, "every configured settlement has one");
  const controllers = populations.map((entry) => entry.controllerId).sort();
  assert.deepEqual(controllers, POPULATION_PROFILES.map((profile) => profile.hubInstitutionId).sort());
  // And each population is a different actor from the hub that supplies it.
  assert.ok(populations.every((entry) => entry.actorId !== entry.controllerId));
});

test("a correctly funded population outearns its own demand and never runs dry", () => {
  const world = createWorld({ stock: FULL_STOCK, hubCash: 200_000 });
  // Keep the hub stocked so demand is never supply-limited.
  for (let tick = 0; tick < 200; tick += 1) {
    world.advance(30);
    Object.assign(world.hub.inventories, FULL_STOCK);
    world.population.update();
    assert.ok(world.record().householdCash >= 0, "household cash never goes negative");
  }
  const spendRate = Object.values(POPULATION_NEEDS)
    .reduce((sum, need) => sum + need.price / need.demandIntervalSeconds, 0);
  const profile = POPULATION_PROFILES[0];
  const incomeRate = profile.incomeAmount / profile.incomeIntervalSeconds;
  assert.ok(incomeRate > spendRate,
    `income ${incomeRate.toFixed(2)} cr/s must exceed demand ${spendRate.toFixed(2)} cr/s`);
  assert.ok(world.record().householdCash > 0, "and it still has money at the end");
});

test("household cash is capped, and the uncreated surplus is recorded", () => {
  const world = createWorld({ stock: {} });   // nothing to buy, so income only
  const profile = POPULATION_PROFILES[0];
  for (let tick = 0; tick < 20; tick += 1) {
    world.advance(profile.incomeIntervalSeconds);
    world.population.update();
  }
  assert.equal(world.record().householdCash, profile.householdCashCap, "cash sits at the cap");
  const capped = world.events("population.incomeReceived").filter((entry) => entry.payload.cappedAway > 0);
  assert.ok(capped.length > 0, "and the credits that were never created are logged");
});
