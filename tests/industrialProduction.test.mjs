import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createIndustrialProductionOperation } from "../src/systems/industrialProduction.js";
import { createHubProcurementOperation, PROCUREMENT_STATUS } from "../src/systems/hubProcurement.js";
import { createSprcOperation } from "../src/systems/sprcOperation.js";

test("regional factories turn their advantaged local feedstock into freightable repair parts", () => {
  const state = createGameState();
  let clock = 1_000;
  const industry = createIndustrialProductionOperation({ state, now: () => clock });
  const procurement = createHubProcurementOperation({ state, now: () => clock });

  state.logistics.institutions["yard-exchange"].inventories["iron-nickel"] = 20;
  state.sprc.repairOrders.TEST = {
    id: "TEST", status: "waiting-stock",
    requirements: { produced: { "hull-plate": 2 }, raw: {} },
    reserved: { produced: {}, raw: {} },
  };

  industry.decide();
  const order = Object.values(state.hubProcurement.orders)
    .find((candidate) => candidate.orderKind === "industrial-part" && candidate.resourceId === "hull-plate");
  assert.ok(order, "repair pressure becomes a regional parts order");
  assert.equal(order.supplierInstitutionId, "yard-exchange", "the nearby structural specialist wins");
  assert.equal(order.status, PROCUREMENT_STATUS.ACCEPTED);

  for (let run = 0; run < order.units; run += 1) {
    clock += 25_000;
    industry.observe();
    industry.decide();
  }
  procurement.decide();
  assert.equal(order.status, PROCUREMENT_STATUS.READY, "produced parts are titled and offered to freight");
});

test("Sal builds an opening buffer through larger orders spread across independent factories", () => {
  const state = createGameState();
  const industry = createIndustrialProductionOperation({ state, now: () => 2_000 });
  state.sprc.repairOrders.SURGE = {
    id: "SURGE", status: "waiting-stock",
    requirements: { produced: { "hull-plate": 20 }, raw: {} },
    reserved: { produced: {}, raw: {} },
  };

  industry.decide();
  industry.decide();

  const orders = Object.values(state.hubProcurement.orders)
    .filter((order) => order.orderKind === "industrial-part" && order.resourceId === "hull-plate");
  assert.equal(orders.length, 2);
  assert.deepEqual(new Set(orders.map((order) => order.supplierInstitutionId)), new Set(["yard-exchange", "ore-station-one"]));
  assert.ok(orders.every((order) => order.units > 4), "opening orders are large enough to cover freight lead time");
});

test("parts delivered to Scrap Porch cross a paid local counter into Sal's stock", () => {
  const state = createGameState();
  const industry = createIndustrialProductionOperation({ state, now: () => 10_000 });
  const porch = state.logistics.institutions["scrap-forge"];
  porch.inventories["machine-part"] = 2;
  const porchCash = porch.accounts.operating.balance;
  const salCash = state.sprc.account.balance;

  industry.observe();

  assert.equal(porch.inventories["machine-part"], 0);
  assert.equal(state.sprc.inventories.produced["machine-part"], 3);
  assert.equal(porch.accounts.operating.balance, porchCash + 230);
  assert.equal(state.sprc.account.balance, salCash - 230);
});

test("a sustained repair queue turns Sal's planned cradle into real parallel capacity", () => {
  const state = createGameState();
  let clock = 5_000;
  const sprc = createSprcOperation({ state, now: () => clock });
  for (let index = 0; index < 4; index += 1) {
    state.sprc.repairOrders[`QUEUE-${index}`] = { id: `QUEUE-${index}`, status: "waiting-stock" };
  }
  state.sprc.inventories.produced["hull-plate"] = 8;
  state.sprc.inventories.produced["machine-part"] = 6;

  sprc.observe();
  assert.equal(state.sprc.projects["sprc-second-cradle"].status, "building");

  clock += 61_000;
  sprc.observe();
  assert.equal(state.sprc.projects["sprc-second-cradle"].status, "completed");
  assert.equal(state.sprc.facilities.berthThree.status, "available");
});

test("sustained regional shortages cause a solvent hub to commission new fabrication capacity", () => {
  const state = createGameState();
  let clock = 20_000;
  const industry = createIndustrialProductionOperation({ state, now: () => clock });
  const initialFactoryCount = Object.keys(state.industrial.factories).length;
  state.sprc.repairOrders.PRESSURE = {
    id: "PRESSURE", status: "waiting-stock",
    requirements: { produced: { "machine-part": 18 }, raw: {} },
    reserved: { produced: {}, raw: {} },
  };

  industry.decide();
  clock += 181_000;
  industry.decide();

  const commissioned = Object.values(state.industrial.factories)
    .find((factory) => factory.emergedFromPressure && factory.recipes.some((recipe) => recipe.output === "machine-part"));
  assert.equal(Object.keys(state.industrial.factories).length, initialFactoryCount + 1);
  assert.ok(commissioned, "a new regional machine-parts fabricator was commissioned");
  assert.notEqual(commissioned.institutionId, "the-ledge", "new capacity is geographically distributed");
});

test("sustained profitable repair demand makes Sal build another real berth", () => {
  const state = createGameState();
  let clock = 30_000;
  const sprc = createSprcOperation({ state, now: () => clock });
  state.sprc.projects["sprc-second-cradle"].status = "completed";
  state.sprc.facilities.berthThree = {
    id: "facility:sprc-berth-three", name: "Second Repair Cradle",
    facilityType: "repair-berth", status: "available", capacity: 1, activeRepairOrderId: null,
  };
  for (let index = 0; index < 6; index += 1) {
    state.sprc.repairOrders[`DONE-${index}`] = { id: `DONE-${index}`, status: "completed" };
    state.sprc.repairOrders[`OPEN-${index}`] = { id: `OPEN-${index}`, status: "waiting-stock" };
  }

  sprc.observe();
  clock += 181_000;
  sprc.observe();
  const project = Object.values(state.sprc.projects).find((candidate) => candidate.kind === "business-expansion");
  assert.equal(project?.expansionType, "repair-berth");
  assert.equal(project?.status, "funding", "expansion first creates physical parts demand");

  state.sprc.inventories.produced["hull-plate"] = 20;
  state.sprc.inventories.produced["machine-part"] = 20;
  sprc.observe();
  assert.equal(project.status, "building");
  clock += 91_000;
  sprc.observe();
  assert.equal(project.status, "completed");
  assert.equal(Object.values(state.sprc.facilities).filter((facility) => facility.facilityType === "repair-berth").length, 3);
});

test("later business expansion waits until Sal's foundational second cradle is open", () => {
  const state = createGameState();
  const sprc = createSprcOperation({ state, now: () => 40_000 });
  state.sprc.projects.LATER = {
    id: "LATER", kind: "business-expansion", expansionType: "repair-berth",
    name: "Repair Cradle 3", status: "funding",
    requirements: { "hull-plate": 6, "machine-part": 4, credits: 900 },
    reserved: { "hull-plate": 0, "machine-part": 0, credits: 0 },
  };

  sprc.observe();
  assert.equal(state.sprc.projects.LATER.status, "waiting-foundation");
  state.sprc.projects["sprc-second-cradle"].status = "completed";
  sprc.observe();
  assert.equal(state.sprc.projects.LATER.status, "funding");
});
