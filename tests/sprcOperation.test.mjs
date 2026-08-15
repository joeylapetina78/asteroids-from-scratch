import { getMiningOrderBook } from "../src/systems/miningOrderBook.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { applyCraftUse } from "../src/systems/componentCondition.js";
import { createSprcOperation, SPRC } from "../src/systems/sprcOperation.js";
import { createShipPaperworkInspectionReport } from "../src/systems/paperworkInspections.js";
import { createFarmOperation } from "../src/systems/farmOperation.js";
import { evaluateAffordability, generateCapabilityResponses } from "../src/systems/institutionDecision.js";
import { createContractManager, registerContractDefinition } from "../src/systems/contractManager.js";
import { createInitialLogisticsState, createLogisticsManager, createStandingFreightJob, STANDING_FREIGHT_TEMPLATES } from "../src/systems/logistics.js";
import { buildPhysicalTransportationRoute, createTransportationNetwork, evaluateTransportPlan, findTransportationRoute } from "../src/systems/transportationPlanning.js";
import { applyCorridorMaintenance, createTransportCorridors, getCorridorClearance } from "../src/systems/transportCorridors.js";
import { FIRST_REACH_CARRIER_POLICY, FIRST_REACH_REPAIR_OPTIONS, FIRST_REACH_TRANSPORT_CONNECTIONS } from "../src/content/transportation/firstReachNetwork.js";
import { createTowServiceManager } from "../src/systems/towService.js";
import { NpcShip } from "../src/entities/NpcShip.js";
import { MiningWorkerShip } from "../src/entities/MiningWorkerShip.js";
import { createMiningOperation, getPostedMiningOrders, getStandingMiningJobsForSite, miningRoyaltyPerUnit, STANDING_MINING_ORDERS } from "../src/systems/miningOperation.js";
import { getInstitutionalFeedstockTradeValue } from "../src/systems/resourceDefinitions.js";
import { createHubProcurementOperation, getProcurementFreightOffers } from "../src/systems/hubProcurement.js";
import { createAsteroidChunks } from "../src/systems/asteroidField.js";
import { createResourceField } from "../src/systems/resourceField.js";
import { Ship } from "../src/entities/Ship.js";
import { getDiagnostic } from "../src/systems/diagnostics.js";

function createHarness() {
  let clock = 1_000;
  const state = createGameState();
  const definitions = new Map();
  const operation = createSprcOperation({
    state,
    now: () => clock,
    registerContractDefinition: (definition) => definitions.set(definition.id, definition),
  });
  return { state, operation, definitions, advance: (milliseconds) => { clock += milliseconds; } };
}

function triggerFirstRepair(harness) {
  harness.state.ledger.recordEvent("logistics.maintenanceRequired", { npcId: SPRC.firstHaulerId, issueType: "hull-fatigue", wear: 1.5, issueCount: 1, causedByCarefulMode: false }, { visible: false });
  harness.operation.update();
}

test("Sal posts a funded reserve order before Mara needs repair", () => {
  const harness = createHarness();
  harness.operation.update();
  const order = Object.values(harness.state.sprc.procurementOrders)[0];
  assert.equal(Object.keys(harness.state.sprc.repairOrders).length, 0);
  assert.equal(order.objectiveType, "reserve-replenishment");
  assert.equal(order.requiredEquivalentUnits, 8);
  assert.equal(harness.state.sprc.account.committed, order.maximumPayment);
  assert.equal(harness.state.sprc.account.protectedReserve, 900);
  assert.equal(harness.state.sprc.operatingPlan.projected.structuralFeedstockEquivalents, 8);
  assert.equal(harness.state.sprc.projects["sprc-second-cradle"].status, "planned");
  assert.ok(harness.state.ledger.getRecentEvents(20).some((event) => event.type === "institution.action" && event.payload.actorName === "Sal" && event.payload.actionType === "procurement.created"));
});

test("SPRC diagnostics count current repairs separately from completed history", () => {
  const harness = createHarness();
  harness.state.sprc.repairOrders.HISTORY = { id: "HISTORY", status: "completed" };
  harness.state.sprc.repairQueue.push("HISTORY");
  harness.operation.update();

  const diagnostic = getDiagnostic(harness.state, harness.state.sprc.institution.id);
  assert.equal(diagnostic.detail.queuedRepairs, 0);
  assert.equal(diagnostic.detail.completedRepairs, 1);
  assert.equal(diagnostic.detail.repairCounts.completed, 1);
  assert.match(diagnostic.summary, /0 queued repair/);
});

test("Sal's unaccepted procurement offer is local, then becomes portable when accepted", () => {
  const harness = createHarness();
  harness.operation.update();
  const order = Object.values(harness.state.sprc.procurementOrders)[0];
  const contracts = createContractManager({ state: harness.state });
  assert.equal(harness.state.contracts.currentContractId, null);
  assert.deepEqual(contracts.getVisibleContractIds(null), []);
  assert.deepEqual(contracts.getVisibleContractIds("yard-exchange"), []);
  assert.deepEqual(contracts.getVisibleContractIds(SPRC.siteId), [order.contractId]);
  harness.operation.acceptProcurement(order.contractId);
  assert.deepEqual(contracts.getVisibleContractIds("yard-exchange"), [order.contractId]);
  assert.equal(harness.state.contracts.currentContractId, order.contractId);
});

test("Sal protects the cash reserve instead of posting an unfunded order", () => {
  const harness = createHarness();
  harness.state.sprc.account.balance = 2000;
  harness.operation.update();
  const need = Object.values(harness.state.sprc.needs)[0];
  const response = Object.values(harness.state.sprc.responses)[0];
  assert.equal(Object.keys(harness.state.sprc.procurementOrders).length, 0);
  assert.equal(response.status, "blocked");
  assert.equal(need.lastOutcome.type, "insufficient-spendable-cash");
  assert.equal(harness.state.sprc.account.committed, 0);
});

test("a blocked response is reconsidered when changed funds make it affordable", () => {
  const harness = createHarness();
  harness.state.sprc.account.balance = 2000;
  harness.operation.update();
  const blocked = Object.values(harness.state.sprc.responses)[0];
  assert.equal(blocked.status, "blocked");
  harness.state.sprc.account.balance = 5000;
  harness.operation.update();
  assert.equal(blocked.status, "superseded");
  assert.equal(Object.keys(harness.state.sprc.procurementOrders).length, 1);
});

test("a farm institution uses the shared evaluator for a different resource domain", () => {
  const operation = createFarmOperation(1_000);
  const result = operation.assess();
  const need = result.institution.needs["sunward-need-water"];
  const response = Object.values(result.institution.responses).find((entry) => entry.needIds.includes(need.id));
  assert.equal(need.shortage, 10);
  assert.equal(response.capabilityId, "procure-input");
  assert.equal(response.estimatedCost, 200);
  assert.equal(response.status, "active");
  assert.equal(result.institution.accounts.operating.committed, 200);
  assert.equal(Object.values(result.institution.procurementOrders)[0].responseId, response.id);
  assert.equal(result.controller.id, result.institution.controllerInstitutionId);
  assert.deepEqual(result.controller.controls, [result.institution.id]);
  assert.equal(result.institution.archetypeId, "farm");
  assert.ok(result.institution.history.some((entry) => entry.type === "need.identified"));
  assert.ok(result.institution.history.some((entry) => entry.type === "procurement.created"));
});

test("Tavi's farm decisions are published to the shared ledger", () => {
  const state = createGameState();
  const operation = createFarmOperation({ state, now: 1_000 });
  operation.assess();
  const actions = state.ledger.getRecentEvents(20).filter((event) => event.type === "institution.action" && event.payload.actorName === "Tavi");
  assert.ok(actions.some((event) => event.payload.actionType === "need.identified"));
  assert.ok(actions.some((event) => event.payload.actionType === "response.selected"));
  assert.ok(actions.some((event) => event.payload.actionType === "procurement.created"));
});

test("farm needs and commitments reconcile when circumstances change", () => {
  const operation = createFarmOperation(1_000);
  operation.assess();
  operation.institution.inventories.inputs.water = 12;
  const result = operation.assess();
  assert.equal(result.institution.needs["sunward-need-water"].status, "resolved");
  assert.equal(result.institution.needs["sunward-need-water"].shortage, 0);
  assert.equal(Object.values(result.institution.responses)[0].status, "canceled");
  assert.equal(Object.values(result.institution.procurementOrders)[0].status, "canceled");
  assert.equal(result.institution.accounts.operating.committed, 0);
});

test("farm blocked procurement is reconsidered through the shared affordability rule", () => {
  const operation = createFarmOperation(1_000);
  // The farm's own prices are unscaled — it is a separate, currently
  // dead-ended economy — but its protected float scaled with the others, so it
  // is short at 350 and comfortable at 7200.
  operation.institution.accounts.operating.balance = 350;
  let result = operation.assess();
  const blocked = Object.values(result.institution.responses).find((entry) => entry.resourceId === "water");
  assert.equal(blocked.status, "blocked");
  operation.institution.accounts.operating.balance = 7200;
  result = operation.assess();
  assert.equal(blocked.status, "superseded");
  assert.equal(Object.values(result.institution.procurementOrders).length, 1);
  assert.equal(result.institution.accounts.operating.committed, 200);
});

test("SPRC response selection carries a score from the shared capability engine", () => {
  const harness = createHarness();
  harness.operation.update();
  const response = Object.values(harness.state.sprc.responses)[0];
  assert.equal(response.capabilityId, "procure-input");
  assert.equal(response.action, "post-procurement-contract");
  assert.equal(response.priorityScore, 25);
});

test("SPRC protected cash policy is authoritative over its compatibility mirror", () => {
  const harness = createHarness();
  harness.state.sprc.operatingPlan.protectedCashReserve = 16000;
  harness.state.sprc.account.protectedReserve = 0;
  harness.operation.update();
  assert.equal(harness.state.sprc.account.protectedReserve, 16000);
  assert.equal(Object.values(harness.state.sprc.responses)[0].status, "blocked");
});

test("shared institution engine contains no authored domain nouns", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/systems/institutionDecision.js", import.meta.url), "utf8"));
  for (const noun of ["Sal", "SPRC", "Mara", "hull plate", "repair cradle", "farm", "crop"]) {
    const escaped = noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[-_\\s]*");
    assert.equal(new RegExp(`\\b${escaped}\\b`, "i").test(source), false, `shared engine contains ${noun}`);
  }
  assert.equal(typeof evaluateAffordability, "function");
  assert.equal(typeof generateCapabilityResponses, "function");
});

test("mixed acceptable materials fill one outcome-based reserve order", () => {
  const harness = createHarness();
  harness.operation.update();
  const order = Object.values(harness.state.sprc.procurementOrders)[0];
  harness.operation.acceptProcurement(order.contractId);
  harness.operation.deliverMaterial({ contractId: order.contractId, materialId: "iron-nickel", amount: 4 });
  const result = harness.operation.deliverMaterial({ contractId: order.contractId, materialId: "aluminum", amount: 2 });
  assert.equal(result.equivalentUnits, 4);
  assert.equal(order.deliveredEquivalentUnits, 8);
  assert.deepEqual(order.deliveredMaterials, { "iron-nickel": 4, aluminum: 2 });
  assert.equal(order.status, "paid");
});

test("operational wear creates a causal repair, need, response, and procurement order", () => {
  const harness = createHarness();
  triggerFirstRepair(harness);
  const repair = Object.values(harness.state.sprc.repairOrders)[0];
  const need = Object.values(harness.state.sprc.needs).find((entry) => entry.objectiveType === "emergency-repair");
  const response = Object.values(harness.state.sprc.responses).find((entry) => entry.needId === need.id);
  const order = Object.values(harness.state.sprc.procurementOrders)[0];

  assert.equal(repair.origin.type, "operational-wear");
  assert.equal(repair.condition, "hull-fatigue");
  assert.equal(need.sourceRepairOrderId, repair.id);
  assert.equal(response.needId, need.id);
  assert.equal(response.procurementOrderId, order.id);
  assert.equal(order.sourceRepairOrderId, repair.id);
  assert.equal(harness.state.sprc.inventories.reserved.produced["hull-plate"], 1);
  assert.equal(harness.state.sprc.inventories.reserved.produced["machine-part"] ?? 0, 0);
});

test("aluminum and iron-nickel satisfy the same outcome-based procurement order", () => {
  for (const [materialId, equivalentsPerUnit] of [["iron-nickel", 1], ["aluminum", 2]]) {
    const harness = createHarness();
    triggerFirstRepair(harness);
    const order = Object.values(harness.state.sprc.procurementOrders)[0];
    harness.operation.acceptProcurement(order.contractId);
    const deliveredUnits = order.requiredEquivalentUnits / equivalentsPerUnit;
    const result = harness.operation.deliverMaterial({ contractId: order.contractId, materialId, amount: deliveredUnits });
    assert.equal(result.equivalentUnits, order.requiredEquivalentUnits);
    assert.equal(order.status, "paid");
  }
});

test("a partial feedstock deposit advances visible contract progress without consuming extra cargo", () => {
  const harness = createHarness();
  triggerFirstRepair(harness);
  const order = Object.values(harness.state.sprc.procurementOrders)[0];
  harness.operation.acceptProcurement(order.contractId);
  const contract = harness.state.contracts.records[order.contractId];
  const result = harness.operation.deliverMaterial({ contractId: order.contractId, materialId: "iron-nickel", amount: 1 });
  assert.equal(result.acceptedUnits, 1);
  assert.equal(result.equivalentUnits, 1);
  assert.equal(contract.deliveredAmount, 1);
  assert.equal(order.deliveredEquivalentUnits, 1);
  assert.equal(order.deliveredMaterials["iron-nickel"], 1);
  assert.equal(contract.status, "active");
});

test("institutional suppliers can fill a bounded allocation without accepting or closing the player's offer", () => {
  const harness = createHarness();
  harness.operation.update();
  const order = Object.values(harness.state.sprc.procurementOrders)[0];
  const contract = harness.state.contracts.records[order.contractId];
  let supplierCredits = 0;

  const allocation = harness.operation.reserveProcurementAllocation({
    contractId: order.contractId,
    supplierInstitutionId: "institution:test-miner",
    equivalentUnits: 2,
  });
  assert.equal(allocation.reservedEquivalentUnits, 2);
  assert.equal(contract.status, "offered");

  const institutionalDelivery = harness.operation.deliverMaterial({
    contractId: order.contractId,
    materialId: "iron-nickel",
    amount: 3,
    supplierInstitutionId: "institution:test-miner",
    creditSupplier: (credits) => { supplierCredits += credits; },
  });
  // Sal's unit price now comes from his valuation, so payments are asserted
  // against the order's live price rather than a hard-coded constant.
  const unitPrice = order.pricePerEquivalent;
  assert.ok(unitPrice > 0, "the order carries a valued unit price");
  assert.equal(institutionalDelivery.acceptedUnits, 2, "supplier cannot exceed its allocation");
  assert.equal(supplierCredits, 2 * unitPrice);
  assert.equal(order.deliveredEquivalentUnits, 2);
  assert.equal(contract.status, "offered");

  const playerBefore = harness.state.credits;
  assert.equal(harness.operation.acceptProcurement(order.contractId), true);
  const remainingEquivalents = order.requiredEquivalentUnits - order.deliveredEquivalentUnits;
  const playerDelivery = harness.operation.deliverMaterial({ contractId: order.contractId, materialId: "iron-nickel", amount: 6 });
  assert.equal(playerDelivery.paid, remainingEquivalents * unitPrice);
  assert.equal(harness.state.credits - playerBefore, remainingEquivalents * unitPrice);
  assert.equal(order.paidAmount, order.maximumPayment);
  assert.equal(order.status, "paid");
});

test("a hub exposes an extraction order only while it is short", () => {
  // These are no longer evergreen. An order is on the board because the hub has
  // a gap, and it comes off the board when the hub is stocked.
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  for (const definition of STANDING_MINING_ORDERS) {
    state.logistics.institutions[definition.buyerInstitutionId].inventories[definition.resourceId] = 0;
  }
  for (const { siteId } of STANDING_MINING_ORDERS) {
    const jobs = getStandingMiningJobsForSite(siteId, null, state);
    assert.equal(jobs.length, 1, `${siteId} is short and should be asking`);
    assert.equal(jobs[0].repeatable, true);
    assert.equal(jobs[0].terms.destinationSiteId, siteId);
    assert.ok(jobs[0].terms.amount > 0 && jobs[0].reward.credits > 0, "with a real quantity and price");
  }

  for (const definition of STANDING_MINING_ORDERS) {
    state.logistics.institutions[definition.buyerInstitutionId].inventories[definition.resourceId] = 500;
  }
  for (const { siteId } of STANDING_MINING_ORDERS) {
    assert.deepEqual(getStandingMiningJobsForSite(siteId, null, state), [],
      `${siteId} wants nothing, so it advertises nothing`);
  }
  assert.equal(new Set(STANDING_MINING_ORDERS.map((definition) => definition.siteId)).size,
    STANDING_MINING_ORDERS.length, "each configured hub extracts one material");
});

test("Cinder Contracting dispatches three independent workers to distinct open orders", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const added = [];
  const game = { worldSites: [
    { id: "yard-exchange", position: { x: 380, y: -180 } },
    { id: "scrap-porch", position: { x: -1180, y: 860 } },
    { id: "the-ledge", position: { x: 7000, y: -4500 } },
  ], addWorkerShip: (worker) => added.push(worker) };
  const manager = createMiningOperation({ state, game, now: () => 1_000 });
  assert.equal(added.length, 3);
  assert.equal(manager.workers.length, 3);
  // The invariant is INDEPENDENCE, not a headcount: no two workers may be sent
  // to the same order. How many are dispatched depends on how much work exists,
  // and open work is now bounded by real hub shortfalls, which scale with each
  // settlement's population. A fleet larger than the available work leaves a
  // ship idle — that is a fact about the economy, and `fleetCapacity` is what
  // decides whether to keep paying for it.
  const dispatched = manager.workers.filter((worker) => worker.assignment);
  assert.ok(dispatched.length > 0, "there is real work at world start");
  assert.equal(new Set(dispatched.map((worker) => worker.assignment.contractId)).size, dispatched.length,
    "no two workers were sent to the same order");
  assert.ok(manager.workers.every((worker) => worker.capabilities.tractorField.powerSource === "evergreen"));
  assert.deepEqual(manager.workers.map((worker) => manager.getState().ships[worker.id].wear), [0.65, 0.25, 0.1]);
});

test("Cinder prioritizes and fulfills SPRC procurement through the public contract lifecycle", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const game = { worldSites: [
    { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
    { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
    { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
  ], addWorkerShip: () => {} };
  const sprc = createSprcOperation({ state, now: () => 1_000 });
  sprc.update();
  const order = Object.values(state.sprc.procurementOrders).find((entry) => entry.procurementItemId === "structural-feedstock");
  const mining = createMiningOperation({ state, game, sprcOperation: sprc, now: () => 1_000 });
  mining.workers.filter((worker) => worker.marketVisit).forEach((worker) => {
    worker.position = { ...worker.marketVisit.destination };
    worker.update(0, {});
  });
  mining.update();
  mining.workers.filter((worker) => worker.marketVisit).forEach((worker) => {
    worker.position = { ...worker.marketVisit.destination };
    worker.update(0, {});
  });
  mining.update();
  assert.ok(mining.workers.some((entry) => entry.assignment?.contractId === order.contractId),
    "at least one Cinder ship took Sal's order on net value");
  const minerCashBefore = mining.getState().institution.accounts.operating.balance;
  const supplyStockBefore = state.logistics.institutions["scrap-forge"].inventories["iron-nickel"] ?? 0;
  // Hub orders now compete for the same ships on price, so Sal's order is
  // filled over however many runs it takes rather than split in a single pass.
  let guard = 0;
  while (order.status !== "paid" && guard < 12) {
    guard += 1;
    // Run the whole fleet, not just Sal's suppliers: ships on hub orders have
    // to complete their runs and free up, exactly as they would in a live world.
    mining.workers
      .filter((entry) => entry.assignment)
      .forEach((worker) => {
        worker.cargo[worker.assignment.resourceId] = worker.assignment.harvestTargetQuantity;
        worker.deliver();
      });
    mining.update();
  }
  assert.equal(order.status, "paid");
  assert.ok(mining.getState().institution.accounts.operating.balance - minerCashBefore >= order.maximumPayment,
    "Cinder was paid at least the order value");
  assert.equal(state.sprc.inventories.raw["iron-nickel"], order.requiredEquivalentUnits);
  assert.equal(state.logistics.institutions["scrap-forge"].inventories["iron-nickel"] - supplyStockBefore, 4);
});

test("sustained critical demand lets Cinder fund and commission a fourth worker", () => {
  let clock = 1_000;
  const state = createGameState();
  state._devStartId = "capacity-test";
  state.logistics = createInitialLogisticsState(clock);
  const game = { worldSites: [
    { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
    { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
    { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
  ], addWorkerShip: () => {} };
  const sprc = createSprcOperation({ state, now: () => clock });
  sprc.update();
  // This case is about pressure from REPAIR supply specifically, so the fleet
  // has to be occupied by Sal's work alone. Stock each hub past its target in
  // the family it MINES, which withdraws the competing hub orders — but leave
  // Scrap Porch without iron-nickel or silicate, because Sal buys those from
  // its shelf and would never post a procurement order if they were there.
  // Yard Exchange keeps a gap worth working so the third ship has somewhere to
  // be: the pressure test needs the WHOLE fleet occupied, not just Sal's two.
  state.logistics.institutions["yard-exchange"].inventories["iron-nickel"] = 1;
  state.logistics.institutions["the-ledge"].inventories.silicate = 50;
  state.logistics.institutions["scrap-forge"].inventories["water-ice"] = 50;
  state.logistics.institutions["scrap-forge"].inventories["iron-nickel"] = 0;
  state.logistics.institutions["scrap-forge"].inventories.silicate = 0;
  const mining = createMiningOperation({ state, game, sprcOperation: sprc, now: () => clock });
  mining.workers.filter((worker) => worker.marketVisit).forEach((worker) => {
    worker.position = { ...worker.marketVisit.destination };
    worker.update(0, {});
  });
  mining.update();
  mining.workers.filter((worker) => worker.marketVisit).forEach((worker) => {
    worker.position = { ...worker.marketVisit.destination };
    worker.update(0, {});
  });
  mining.update();
  clock += 6_000;
  mining.getState().institution.accounts.operating.balance = 6000;
  mining.update();
  assert.equal(mining.getState().projects["cinder-four"].status, "completed");
  assert.ok(mining.getState().ships["worker:cinder-four"]);
  assert.equal(mining.workers.length, 4);
  assert.equal(mining.getState().institution.accounts.operating.balance, 2500);
});

test("a worn Cinder craft is sent to service when a delivery crosses the wear threshold", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const game = { worldSites: [
    { id: "yard-exchange", position: { x: 380, y: -180 } },
    { id: "scrap-porch", position: { x: -1180, y: 860 } },
    { id: "the-ledge", position: { x: 7000, y: -4500 } },
  ], addWorkerShip: () => {} };
  const manager = createMiningOperation({ state, game, now: () => 1_000 });
  const worker = manager.worker;
  // One routine delivery away from a mining-laser calibration failure.
  applyCraftUse(manager.getState().ships[worker.id], { "mining-laser": 0.98 });
  worker.cargo[worker.assignment.resourceId] = worker.assignment.quantity;
  worker.deliver();
  assert.equal(manager.getState().ships[worker.id].maintenanceStatus, "returning-for-service");
  assert.equal(manager.getState().ships[worker.id].pendingIssue, "preventive-calibration");
  assert.equal(manager.getState().ships[worker.id].pendingComponentId, "mining-laser");
});

test("idle Cinder craft report unfunded work once instead of failing silently", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  for (const siteId of ["yard-exchange", "scrap-forge", "the-ledge"]) state.logistics.institutions[siteId].accounts.operating.balance = 0;
  const game = { worldSites: [
    { id: "yard-exchange", position: { x: 380, y: -180 } },
    { id: "scrap-porch", position: { x: -1180, y: 860 } },
    { id: "the-ledge", position: { x: 7000, y: -4500 } },
  ], addWorkerShip: () => {} };
  const manager = createMiningOperation({ state, game, now: () => 1_000 });
  const initialEvents = state.ledger.getRecentEvents(20).filter((event) => event.type === "mining.waitingForFundedWork");
  assert.equal(initialEvents.length, 3);
  manager.update();
  assert.equal(state.ledger.getRecentEvents(20).filter((event) => event.type === "mining.waitingForFundedWork").length, 3);
});

test("a mining worker tractors eligible loose resources toward its collector", () => {
  const worker = new MiningWorkerShip({ id: "worker:test", name: "Test Worker", institutionId: "miner:test", controllerInstitutionId: "person:test", x: 0, y: 0 });
  worker.assign({ allocationId: "allocation:test", contractId: "mine:test", resourceId: "iron-nickel", quantity: 1, destination: { x: 0, y: 0 } });
  const pickup = { type: "iron-nickel", position: { x: 120, y: 0 }, velocity: { x: 0, y: 0 }, radius: 10, sourceClaimId: null };
  worker.update(0.1, {
    asteroids: [], pickups: [pickup], collectPickup: () => null,
    pullPickup: (item, ship, step, force) => { item.velocity.x += Math.sign(ship.position.x - item.position.x) * force * step; },
  });
  assert.equal(worker.tractorActive, true);
  assert.ok(pickup.velocity.x < 0);
  assert.equal(worker.canRecoverPickup({ type: "rockmoss-crawler", sourceClaimId: null }), false);
  assert.equal(worker.canRecoverPickup({ type: "iron-nickel", sourceClaimId: "claim:someone-else" }), false);
  worker.returnForService({ destination: { x: 1000, y: 1000 }, destinationSiteId: "scrap-porch", issueType: "tractor-field-instability" });
  assert.equal(worker.tractorActive, false);
  assert.deepEqual(worker.tractorTargets, []);
});

test("a rejected mining delivery preserves both cargo and assignment", () => {
  const worker = new MiningWorkerShip({
    id: "worker:test", name: "Test Miner", institutionId: "test-mining", controllerInstitutionId: "test-controller",
    x: 0, y: 0, onDelivery: () => ({ acceptedUnits: 0, paid: 0 }),
  });
  worker.assign({ allocationId: "allocation:test", contractId: "contract:expired", resourceId: "iron-nickel", quantity: 2, destination: { x: 0, y: 0 } });
  worker.cargo["iron-nickel"] = 2;
  worker.deliver();
  assert.equal(worker.cargo["iron-nickel"], 2);
  assert.equal(worker.assignment.contractId, "contract:expired");
  assert.equal(worker.state, "delivery-blocked");
});

test("a mining worker recognizes a useful secondary mineral instead of requiring dominance", () => {
  const worker = new MiningWorkerShip({ id: "worker:secondary", name: "Secondary", institutionId: "miner:test", controllerInstitutionId: "person:test", x: 0, y: 0 });
  worker.assign({ allocationId: "allocation:secondary", contractId: "mine:secondary", resourceId: "copper", quantity: 1, destination: { x: 0, y: 0 } });
  const asteroid = { position: { x: 300, y: 0 }, resources: { stone: 0.3, "iron-nickel": 0.5, copper: 0.2 }, tier: 2 };
  worker.update(0.1, { asteroids: [asteroid], pickups: [], collectPickup: () => null, pullPickup: () => {} });
  assert.equal(worker.targetAsteroid, asteroid);
  assert.equal(worker.state, "outbound");
});

test("a mining institution delivery conserves material and payment into freight inventory", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const game = {
    worldSites: [
      { id: "yard-exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", position: { x: 7000, y: -4500 } },
      { id: "blue-lantern", position: { x: 2950, y: 2180 } },
    ],
    addWorkerShip: () => {},
  };
  const manager = createMiningOperation({ state, game, now: () => 1_000 });
  const worker = manager.worker;
  const buyer = state.logistics.institutions["scrap-forge"];
  const population = Object.values(state.population.populations).find((record) => record.hubInstitutionId === "scrap-forge");
  const buyerCashBefore = buyer.accounts.operating.balance;
  const minerCashBefore = manager.getState().institution.accounts.operating.balance;
  const populationCashBefore = population.householdCash;
  const stockBefore = buyer.inventories["water-ice"] ?? 0;
  worker.cargo["water-ice"] = 3;
  // A hub accepts only what it is actually short of, and that shortfall now
  // scales with the settlement's population — so how much of the load is taken
  // against the order (versus sold on as surplus) is a property of the world,
  // not a constant. Assert against what was delivered rather than what was
  // carried, or this measures the authored order size instead of conservation.
  worker.deliver();
  // How much the hub actually took against its order, read off the allocation
  // the operation books — the worker's own call does not report it back here.
  const deliveredUnits = Object.values(manager.getState().allocations)
    .filter((allocation) => allocation.status === "completed")
    .reduce((total, allocation) => total + (allocation.delivered ?? 0), 0);

  // Hubs open with stock and the price is derived from the gap, so assert the
  // movement rather than absolute levels: the buyer's payment reaches the miner,
  // then the miner pays its recurring crew and consumables AND the mining-rights
  // royalty owed to the territory's population.
  assert.equal(buyer.inventories["water-ice"] - stockBefore, 3);
  const buyerPaid = buyerCashBefore - buyer.accounts.operating.balance;
  assert.ok(buyerPaid > 0, "the buyer paid for the material");
  const operatingExpense = manager.getState().institution.accounts.operating.transactions
    .find((transaction) => transaction.type === "operating-expense")?.amount ?? 0;
  // The royalty is a real transfer to the population, not a cost that vanishes:
  // it leaves the miner and arrives, to the credit, in household cash.
  const royalty = deliveredUnits * miningRoyaltyPerUnit("water-ice");
  assert.ok(deliveredUnits > 0, "the hub took some of the load against its order");
  assert.equal(population.householdCash - populationCashBefore, royalty,
    "the territory's population received the mining royalty");
  assert.equal(manager.getState().institution.accounts.operating.balance - minerCashBefore, buyerPaid + operatingExpense - royalty,
    "the miner kept its sale minus its operating expense and the royalty it paid out");
  assert.equal(operatingExpense, -90);
  assert.equal(manager.getState().completedContracts, 1);
});

test("a hub raises a mining order that no idle miner will extract at the posted price", () => {
  const clock = 5_000_000; // a realistic clock so the reprice throttle behaves
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  // Fund every hub so affordability is never the thing blocking a raise here.
  ["yard-exchange", "scrap-forge", "the-ledge", "blue-lantern"].forEach((id) => {
    if (state.logistics.institutions[id]) state.logistics.institutions[id].accounts.operating.balance = 50_000;
  });
  const game = {
    worldSites: [
      { id: "yard-exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", position: { x: 7000, y: -4500 } },
      { id: "blue-lantern", position: { x: 2950, y: 2180 } },
    ],
    addWorkerShip: () => {},
  };
  const manager = createMiningOperation({ state, game, now: () => clock });
  // Strand the sole miner far from every deposit so serving ANY order costs far
  // more than it pays. A unanimous refusal by idle capacity is the reprice
  // trigger — the mining-side mirror of "no carrier will run this freight".
  const worker = manager.worker;
  worker.assignment = null;
  worker.marketVisit = null;
  worker.position = { x: 500_000, y: 500_000 };
  manager.getState().allocations = {};
  Object.values(manager.getState().ships).forEach((record) => { record.maintenanceStatus = "available"; });

  const before = getPostedMiningOrders(state, clock);
  const target = Object.values(before).find((order) => !order.withheld && order.amount > 0);
  assert.ok(target, "at least one hub is posting a buy order to reprice");
  const priceBefore = target.paymentPerUnit;

  manager.update();

  const raised = state.miningOrderRates?.[target.id];
  assert.ok(raised && raised.rate > priceBefore, "the hub raised what it pays toward the cost of extraction");
  const ceiling = Math.round(getInstitutionalFeedstockTradeValue(target.resourceId) * 2.5);
  assert.ok(raised.rate <= ceiling, "the raise is bounded to a multiple of the ore's base value");
  const events = state.ledger.getEventsAfterId(0).filter((entry) => entry.type === "institution.miningOrderRepriced");
  assert.ok(events.some((entry) => entry.payload.orderId === target.id), "the raise is a visible, reasoned event");
  // The next posting carries the raised rate.
  assert.equal(getPostedMiningOrders(state, clock)[target.id].paymentPerUnit, raised.rate);
});

test("an unregistered Cinder craft receives paid technology service through SPRC's public capability", () => {
  let clock = 1_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  const game = {
    worldSites: [
      { id: "yard-exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", position: { x: 7000, y: -4500 } },
      { id: "blue-lantern", position: { x: 2950, y: 2180 } },
    ],
    addWorkerShip: () => {},
  };
  const mining = createMiningOperation({ state, game, now: () => clock });
  const sprc = createSprcOperation({ state, now: () => clock });
  const worker = mining.worker;
  const workerRecord = mining.getState().ships[worker.id];
  Object.values(mining.getState().ships).forEach((record) => {
    if (record.id !== worker.id) record.maintenanceStatus = "servicing";
  });
  // Just under the threshold so tractor use carries the real component into service.
  applyCraftUse(workerRecord, { "tractor-field": 0.98 });
  const minerCashBefore = mining.getState().institution.accounts.operating.balance;
  const sprcCashBefore = state.sprc.account.balance;

  // Run until the craft actually wears out rather than for a fixed six loads.
  // A load is only as big as the hub's real shortfall, and that shortfall now
  // scales with the settlement's population — so "six deliveries" is no longer a
  // fixed amount of work, and pinning the loop to it made this a test about
  // order size rather than about wear.
  for (let completed = 0; completed < 40 && !workerRecord.pendingIssue; completed += 1) {
    // Orders now exist only while a hub has a real gap. Draining the shelves
    // keeps one open, so this stays a test about wear rather than about supply.
    Object.values(state.logistics.institutions).forEach((institution) => {
      if (institution.inventories) Object.keys(institution.inventories).forEach((itemId) => { institution.inventories[itemId] = 0; });
    });
    mining.update();
    if (!worker.assignment) continue;
    worker.cargo[worker.assignment.resourceId] = worker.assignment.quantity;
    worker.deliver();
    mining.update();
  }
  assert.equal(workerRecord.pendingIssue, "tractor-field-instability");
  assert.equal(worker.miningDisabled, true);
  assert.equal(state.sprc.serviceSubjects[worker.id], undefined, "the worker was not pre-authored into SPRC");

  // This test is about the SERVICE PATH — an unregistered craft reaching Sal
  // through a public capability — not about whether a miner can afford upkeep.
  // Since hub orders now scale with settlement population, a miner earns less
  // per run and Cinder finishes this wear loop unable to fund the repair, which
  // parks the request as `payer-cannot-afford` and tests something else entirely.
  // Fund it explicitly so the subject under test is the capability.
  mining.getState().institution.accounts.operating.balance += 5_000;
  worker.onEvent("service.arrived", { issueType: workerRecord.pendingIssue, destinationSiteId: "scrap-porch" });
  sprc.update();
  const repair = Object.values(state.sprc.repairOrders).find((candidate) => candidate.subjectId === worker.id);
  assert.equal(repair.craftClass, "mining-craft");
  assert.equal(repair.serviceCapabilityId, "mining-craft-maintenance");
  assert.deepEqual(repair.requirements.raw, { copper: 1 });
  assert.ok(Object.values(state.sprc.procurementOrders).some((order) => order.procurementItemId === "copper"), "Sal replenishes the protected Scannergy-conductor stock after allocating it");

  sprc.update();
  assert.equal(repair.status, "repairing");
  assert.equal(state.sprc.inventories.raw.copper, 0);
  clock += 31_000;
  sprc.update();
  mining.update();

  assert.equal(workerRecord.maintenanceStatus, "available");
  assert.equal(workerRecord.components["tractor-field"].condition.wear, 0,
    "the failed tractor field was serviced");
  assert.ok(workerRecord.wear > 0, "service did not magically reset unrelated component history");
  assert.equal(workerRecord.wear, workerRecord.aggregateWear);
  assert.equal(worker.miningDisabled, false);
  // Service is priced from Sal's live cost basis plus margin, so assert the
  // money moved matches the quoted price rather than a hard-coded constant.
  const servicePrice = repair.servicePrice;
  assert.ok(servicePrice > 0, "the repair carries a quoted service price");
  assert.ok(mining.getState().institution.accounts.operating.transactions.some((transaction) => transaction.type === "maintenance-expense" && transaction.amount === -servicePrice));
  assert.ok(mining.getState().institution.accounts.operating.balance > minerCashBefore - servicePrice, "completed work funded service before its expense");
  assert.equal(state.sprc.account.balance - sprcCashBefore, servicePrice);
  assert.ok(state.ledger.getRecentEvents(50).some((event) => event.type === "mining.maintenanceCompleted" && event.payload.shipInstitutionId === worker.id));
});

test("material, money, production, repair, and hauler availability remain conserved", () => {
  const harness = createHarness();
  triggerFirstRepair(harness);
  const order = Object.values(harness.state.sprc.procurementOrders)[0];
  const playerBefore = harness.state.credits;
  const sprcBefore = harness.state.sprc.account.balance;

  harness.operation.acceptProcurement(order.contractId);
  const delivery = harness.operation.deliverMaterial({ contractId: order.contractId, materialId: "iron-nickel", amount: 4 });
  harness.operation.update();
  assert.equal(harness.state.sprc.inventories.raw["iron-nickel"], 0, "running production consumed its reserved input");
  assert.equal(harness.state.credits - playerBefore, delivery.paid);
  assert.equal(sprcBefore - harness.state.sprc.account.balance, delivery.paid);

  harness.advance(31_000);
  harness.operation.update();
  harness.operation.update();
  harness.advance(31_000);
  harness.operation.update();

  const repair = Object.values(harness.state.sprc.repairOrders)[0];
  const hauler = harness.state.sprc.haulers[SPRC.firstHaulerId];
  assert.equal(repair.status, "completed");
  assert.equal(hauler.maintenanceStatus, "available");
  assert.equal(hauler.availableForWork, true);
  assert.deepEqual(hauler.repairHistory, [repair.id]);
  assert.equal(harness.state.sprc.account.balance, sprcBefore - delivery.paid, "repair completion records an invoice but does not mint payment without a carrier account transfer");
});

test("restoring an operation does not duplicate contracts, stock, or payment", () => {
  const harness = createHarness();
  triggerFirstRepair(harness);
  const order = Object.values(harness.state.sprc.procurementOrders)[0];
  harness.operation.acceptProcurement(order.contractId);
  harness.operation.deliverMaterial({ contractId: order.contractId, materialId: "iron-nickel", amount: 4 });
  const saved = JSON.parse(JSON.stringify({ sprc: harness.state.sprc, contracts: harness.state.contracts, credits: harness.state.credits, accounts: harness.state.accounts, worldRecords: harness.state.worldRecords }));
  const snapshot = createGameState();
  Object.assign(snapshot, saved);
  const credits = snapshot.credits;
  const balance = snapshot.sprc.account.balance;
  const orderCount = Object.keys(snapshot.sprc.procurementOrders).length;

  const restored = createSprcOperation({ state: snapshot });
  restored.update();
  restored.update();
  assert.equal(snapshot.credits, credits);
  assert.equal(snapshot.sprc.account.balance, balance);
  assert.equal(Object.keys(snapshot.sprc.procurementOrders).length, orderCount);
});

test("an ignored procurement order expires while the repair remains blocked", () => {
  const harness = createHarness();
  triggerFirstRepair(harness);
  const order = Object.values(harness.state.sprc.procurementOrders)[0];
  harness.advance(46 * 60 * 1000);
  harness.operation.update();
  const repair = Object.values(harness.state.sprc.repairOrders)[0];
  assert.equal(order.status, "expired");
  assert.equal(harness.state.sprc.account.committed, 0);
  assert.equal(repair.status, "waiting-production");
  assert.equal(harness.state.sprc.needs[order.needId].lastOutcome.type, "procurement-expired");
  assert.equal(harness.state.sprc.haulers[SPRC.firstHaulerId].availableForWork, false);
});

test("the cargo manifest documents custody but does not fabricate source authority", () => {
  const harness = createHarness();
  harness.state.character.controlledPersonEntityId = "person:test-pilot";
  triggerFirstRepair(harness);
  const order = Object.values(harness.state.sprc.procurementOrders)[0];
  harness.operation.acceptProcurement(order.contractId);
  harness.state.cargoCustody = {
    holderEntityId: "person:test-pilot",
    shipVin: harness.state.character.activeHullVin,
    units: [{ type: "iron-nickel", quantity: 4, sourceClaimId: null }],
  };
  const report = createShipPaperworkInspectionReport(harness.state);
  const finding = report.cargoInspection.findings[0];
  assert.equal(finding.declaredForProcurement, true);
  assert.equal(finding.sourceAuthorityStatus, "not-established");
  assert.match(finding.scopeNote, /does not grant extraction or salvage authority/);
});

function createLogisticsHarness({ now = () => 1_000, commissionHauler = null } = {}) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(now());
  // This harness exercises the original bilateral freight lifecycle with two
  // physical test ships, and follows one specific lane — Yard Exchange to
  // Scrap Porch — all the way through. Settlements beyond the three it funds
  // are omitted so they cannot legitimately win that cargo.
  //
  // This used to drop Morrow Shoal alone. Once a seller facing more demand than
  // capacity started choosing between buyers on what they pay rather than on
  // which order was written first, the other two unfunded settlements began
  // outbidding Scrap Forge for Yard Exchange's structural capacity and the lane
  // under test stopped existing. That is the market working; the fixture simply
  // has to name every rival it means to exclude.
  ["morrow-shoal", "blue-lantern", "kiln-crossing"].forEach((id) => {
    delete state.logistics.institutions[id];
  });
  ["person:morrow-shoal-factor", "person:blue-lantern-factor", "person:kiln-crossing-factor"].forEach((id) => {
    delete state.logistics.institutions[id];
  });
  // The authored freight routes are gone: every run now comes from a purchase
  // order. Give the hubs money and stock so procurement produces real work for
  // these carriers to find.
  ["yard-exchange", "scrap-forge", "the-ledge"].forEach((id) => {
    state.logistics.institutions[id].accounts.operating.balance = 20_000;
  });
  state.logistics.institutions["yard-exchange"].inventories["iron-nickel"] = 40;
  state.logistics.institutions["scrap-forge"].inventories["water-ice"] = 40;
  state.logistics.institutions["the-ledge"].inventories.silicate = 40;
  const procurement = createHubProcurementOperation({ state, now });
  procurement.update();
  const ships = ["hauler-yard-scrap", "hauler-scrap-yard"].map((id) => ({ id, name: id === "hauler-yard-scrap" ? "Yard Hauler" : "Porch Runner Two", wear: 0, operationalStatus: "seeking-work", dockedSiteId: id === "hauler-yard-scrap" ? "yard-exchange" : "scrap-porch", transfers: [], pendingWearIssue: null, queueCargoTransfer(transfer) { this.transfers.push(transfer); }, assignShipment(assignment) { this.assignment = assignment; this.dockedSiteId = null; this.operationalStatus = "available"; }, clearShipment() { this.assignment = null; this.operationalStatus = "seeking-work"; }, assignTow(assignment) { this.towAssignment = assignment; this.activeTowRequestId = assignment.requestId; this.operationalStatus = "being-towed"; return true; }, clearTow() { this.activeTowRequestId = null; this.towAssignment = null; } }));
  const manager = createLogisticsManager({
    state, ships, now, commissionHauler,
    onProcurementShipped: (orderId, shipmentId) => procurement.markShipped(orderId, shipmentId),
    onProcurementDelivered: (orderId, settlement) => procurement.completeOrder(orderId, settlement),
  });
  return { state, ships, manager, procurement };
}

test("freight wear belongs to persistent working components and service repairs only the named system", () => {
  const harness = createLogisticsHarness();
  const ship = harness.ships[0];
  const hauler = harness.state.logistics.haulers[ship.id];
  const shipInstitution = harness.state.logistics.institutions[hauler.shipInstitutionId];

  assert.deepEqual(Object.keys(shipInstitution.components), ["propulsion", "steering", "docking-gear", "hull", "cargo-handling"]);
  ship.wear = 6;
  harness.state.ledger.recordEvent("npc.wearIssue", {
    npcId: ship.id, issueType: "hull-fatigue", wear: 6, issueCount: 1,
  }, { visible: false });
  harness.manager.update();

  const request = harness.state.ledger.getEventsAfterId(0, { includeHidden: true }).find((event) =>
    event.type === "maintenance.requested" && event.payload.subjectId === ship.id);
  assert.equal(request.payload.componentId, "propulsion", "the real worst component overrides the old alternating scalar issue");
  const steeringWear = shipInstitution.components.steering.condition.wear;
  assert.ok(steeringWear > 0, "travel also leaves history on neighboring systems");

  harness.state.sprc = { account: { balance: 0 } };
  harness.state.ledger.recordEvent("sprc.repairCompleted", {
    haulerId: ship.id, componentId: "propulsion", repairOrderId: "SPRC-RPR-TEST", serviceRevenue: 180,
  }, { visible: false });
  harness.manager.update();

  assert.equal(shipInstitution.components.propulsion.condition.wear, 0);
  assert.equal(shipInstitution.components.propulsion.condition.serviceCount, 1);
  assert.equal(shipInstitution.components.steering.condition.wear, steeringWear,
    "repairing propulsion does not rejuvenate steering");
  assert.ok(shipInstitution.wear > 0, "legacy scalar wear remains a projection of the unrepaired systems");
});

test("a carrier with no surviving craft finances and commissions an emergency replacement", () => {
  let clock = 1_000;
  const commissioned = [];
  const harness = createLogisticsHarness({
    now: () => clock,
    commissionHauler: (spec) => {
      const ship = { ...spec, isAlive: true, wear: 0, operationalStatus: "seeking-work", dockedSiteId: spec.homeSiteId, queueCargoTransfer() {}, assignShipment() { return true; }, clearShipment() {} };
      commissioned.push(ship);
      return ship;
    },
  });
  harness.ships.forEach((ship) => { ship.isAlive = false; });
  Object.values(harness.state.logistics.haulers).forEach((hauler) => { hauler.status = "destroyed"; hauler.activeShipmentId = null; hauler.activeMovementId = null; });
  const carrier = harness.state.logistics.institutions["carrier:yard-hauler"];
  carrier.accounts.operating.balance = 1_000;
  const lender = harness.state.logistics.institutions["yard-exchange"];
  const conservedBefore = carrier.accounts.operating.balance + lender.accounts.operating.balance;

  harness.manager.update();
  clock += 21_000;
  harness.manager.update();

  assert.ok(commissioned.some((ship) => ship.carrierInstitutionId === carrier.id));
  assert.equal(carrier.capitalLoans[0].status, "active");
  assert.equal(carrier.capitalLoans[0].lenderInstitutionId, lender.id);
  assert.equal(carrier.accounts.operating.balance + lender.accounts.operating.balance, conservedBefore - 6_000,
    "the loan conserves cash and the commissioned hull consumes its real capital cost");
  assert.ok(harness.state.ledger.getRecentEvents(30).some((event) => event.type === "carrier.emergencyFleetFinanced"));
});

test("later freight income repays a share of emergency fleet finance", () => {
  const harness = createLogisticsHarness();
  harness.manager.update();
  const [shipId, hauler] = Object.entries(harness.state.logistics.haulers).find(([, candidate]) => candidate.activeShipmentId);
  const shipment = harness.state.logistics.shipments[hauler.activeShipmentId];
  const carrier = harness.state.logistics.institutions[hauler.carrierInstitutionId];
  const lender = harness.state.logistics.institutions["yard-exchange"];
  carrier.capitalLoans = [{ id: "TEST-FLEET-LOAN", lenderInstitutionId: lender.id, principal: 1000, outstanding: 1000, repaymentShare: 0.25, status: "active" }];
  const lenderBefore = lender.accounts.operating.balance;

  harness.state.ledger.recordEvent("npc.routeCompleted", { npcId: shipId, shipmentId: shipment.id, siteId: shipment.destinationSiteId }, { visible: false });
  harness.manager.update();

  const expected = Math.floor(shipment.payment * 0.25);
  assert.equal(carrier.capitalLoans[0].outstanding, 1000 - expected);
  assert.equal(lender.accounts.operating.balance, lenderBefore + expected);
  assert.ok(harness.state.ledger.getRecentEvents(30).some((event) => event.type === "carrier.fleetLoanRepaid"));
});

test("a combat-damaged hauler preserves loaded freight, then withdraws before taking more", () => {
  const harness = createLogisticsHarness();
  harness.manager.update();
  const [shipId, hauler] = Object.entries(harness.state.logistics.haulers)
    .find(([, candidate]) => candidate.activeShipmentId);
  const shipmentId = hauler.activeShipmentId;
  const shipment = harness.state.logistics.shipments[shipmentId];

  harness.state.ledger.recordEvent("incursion.npcHit", {
    npcId: shipId, npcName: harness.ships.find((ship) => ship.id === shipId).name,
    npcType: "route-hauler", damage: 100, hullAfter: 80,
  }, { visible: false });
  harness.manager.update();

  assert.equal(hauler.combatMaintenanceIssue, "hull-fatigue");
  assert.equal(hauler.activeShipmentId, shipmentId, "accepted cargo remains in custody");

  harness.state.ledger.recordEvent("npc.routeCompleted", {
    npcId: shipId, shipmentId, siteId: shipment.destinationSiteId,
  }, { visible: false });
  harness.manager.update();

  assert.equal(harness.state.logistics.shipments[shipmentId].status, "delivered");
  assert.ok(["returning-maintenance", "maintenance-required"].includes(hauler.status),
    `maintenance wins over another freight offer after unloading (${hauler.status})`);
  if (hauler.currentSiteId === "scrap-porch") assert.equal(hauler.maintenanceRequested, true, "a ship already at SPRC joins the queue directly");
  else assert.ok(hauler.activeMovementId, "a remote ship starts its maintenance return");
});

test("player standing mining delivery enters the same freight inventory used by haulers", () => {
  const harness = createLogisticsHarness();
  // An order exists only where a hub is short, so open a gap to have one.
  harness.state.logistics.institutions["yard-exchange"].inventories["iron-nickel"] = 0;
  const definition = getStandingMiningJobsForSite("yard-exchange", "Yard Exchange", harness.state)[0];
  registerContractDefinition(definition);
  const contracts = createContractManager({ state: harness.state });
  contracts.offerContract(definition.id, { siteId: "yard-exchange" });
  contracts.acceptContract(definition.id);
  const buyer = harness.state.logistics.institutions["yard-exchange"];
  buyer.inventories["iron-nickel"] = 0;
  harness.state.logistics.haulers["hauler-scrap-yard"].currentSiteId = "yard-exchange";
  harness.ships[1].dockedSiteId = "yard-exchange";
  const balanceBefore = buyer.accounts.operating.balance;
  const postedRate = getMiningOrderBook(harness.state)["mine-yard-iron"]?.paymentPerUnit
    ?? definition.reward.credits / definition.terms.amount;
  // The contract is for whatever the hub is currently asking, not a fixed 3.
  const wanted = definition.terms.amount;
  assert.equal(contracts.depositResourceUnit({ contractId: definition.id, resourceType: "iron-nickel", siteId: "yard-exchange", amount: wanted }), wanted);
  assert.equal(buyer.inventories["iron-nickel"], wanted);
  assert.equal(buyer.accounts.operating.balance, balanceBefore - wanted * postedRate,
    "the hub paid its own posted rate");
  harness.manager.update();
  // How many iron-nickel runs exist now depends on what the hubs happen to be
  // short of. What matters is that the player's delivery landed in the same
  // inventory the carriers draw from.
  assert.ok(Object.values(harness.state.logistics.shipments).some((shipment) => shipment.commodity === "iron-nickel"),
    "the material the player delivered is being hauled by the same market");
  // The player's delivery entered the hub's books, not a separate player-only
  // pool. It may now be on the shelf, set aside against a sale, or already
  // sold and awaiting pickup — all three are the same accounting.
  const reserved = Object.values(buyer.saleReserve ?? {}).reduce((sum, units) => sum + units, 0);
  const sold = Object.values(buyer.awaitingPickup ?? {}).reduce((sum, held) => sum + (held.units ?? 0), 0);
  assert.ok((buyer.inventories["iron-nickel"] ?? 0) + reserved + sold >= wanted,
    "the delivered material is accounted for somewhere in the hub's books");
});

test("an unfunded standing mining order rejects delivery without consuming material", () => {
  const harness = createLogisticsHarness();
  harness.state.logistics.institutions["yard-exchange"].inventories["iron-nickel"] = 0;
  const definition = getStandingMiningJobsForSite("yard-exchange", "Yard Exchange", harness.state)[0];
  registerContractDefinition(definition);
  const contracts = createContractManager({ state: harness.state });
  contracts.offerContract(definition.id, { siteId: "yard-exchange" });
  contracts.acceptContract(definition.id);
  const buyer = harness.state.logistics.institutions["yard-exchange"];
  buyer.accounts.operating.balance = 0;
  buyer.inventories["iron-nickel"] = 0;
  assert.equal(contracts.depositResourceUnit({ contractId: definition.id, resourceType: "iron-nickel", siteId: "yard-exchange", amount: 3 }), false);
  assert.equal(buyer.inventories["iron-nickel"], 0);
  assert.equal(harness.state.contracts.records[definition.id].deliveredAmount ?? 0, 0);
  assert.ok(harness.state.ledger.getRecentEvents(10).some((event) => event.type === "contract.resourceRejected" && event.payload.reason === "buyer-cannot-fund"));
});

test("a standing mining order the hub is fully stocked on stops accepting delivery, cargo conserved", () => {
  const harness = createLogisticsHarness();
  // Open a gap so the order exists to be accepted.
  harness.state.logistics.institutions["yard-exchange"].inventories["iron-nickel"] = 0;
  const definition = getStandingMiningJobsForSite("yard-exchange", "Yard Exchange", harness.state)[0];
  registerContractDefinition(definition);
  const contracts = createContractManager({ state: harness.state });
  contracts.offerContract(definition.id, { siteId: "yard-exchange" });
  contracts.acceptContract(definition.id);
  const buyer = harness.state.logistics.institutions["yard-exchange"];
  // The hub is now amply stocked → its buy order closes (no gap, not a cash issue).
  buyer.inventories["iron-nickel"] = 999;
  buyer.accounts.operating.balance = 50000;
  delete getMiningOrderBook(harness.state)[definition.terms.standingMiningOrderId];
  const before = buyer.inventories["iron-nickel"];
  assert.equal(contracts.depositResourceUnit({ contractId: definition.id, resourceType: "iron-nickel", siteId: "yard-exchange", amount: 3 }), false);
  assert.equal(buyer.inventories["iron-nickel"], before, "no material was consumed");
  assert.equal(harness.state.contracts.records[definition.id].deliveredAmount ?? 0, 0);
  // The refusal names the real cause — stocked, not broke.
  assert.ok(harness.state.ledger.getRecentEvents(10).some((event) => event.type === "contract.resourceRejected" && event.payload.reason === "buyer-not-buying"));
});

test("an unfunded short haul cannot mask a worn carrier's return to maintenance", () => {
  const harness = createLogisticsHarness();
  const shipId = "hauler-yard-scrap";
  harness.state.logistics.institutions["scrap-forge"].accounts.operating.balance = 0;
  harness.state.logistics.institutions["ship:hauler-yard-scrap"].wear = 4.2;
  harness.ships[0].wear = 4.2;
  harness.manager.update();
  const hauler = harness.state.logistics.haulers[shipId];
  assert.equal(hauler.status, "returning-maintenance");
  assert.ok(hauler.activeMovementId);
  assert.equal(Object.values(harness.state.logistics.responses).some((response) => response.status === "blocked" && response.lastOutcome?.type === "execution-route-rejected"), false);
});

test("the known transportation network finds a multi-destination path without authored route logic", () => {
  const network = createTransportationNetwork({ destinations: ["yard-exchange", "scrap-porch", "the-ledge"].map((id) => ({ id })), connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
  const route = findTransportationRoute(network, "scrap-porch", "the-ledge", FIRST_REACH_CARRIER_POLICY.knownDestinationIds);
  assert.deepEqual(route.path, ["scrap-porch", "yard-exchange", "the-ledge"]);
});

test("a configured transport connection creates a curved, cleared physical corridor", () => {
  const destinations = [
    { id: "yard-exchange", name: "Yard Exchange", position: { x: 0, y: 0 } },
    { id: "the-ledge", name: "The Ledge", position: { x: 8400, y: 0 } },
  ];
  const corridors = createTransportCorridors({ destinations, connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
  assert.equal(corridors.length, 1);
  assert.equal(corridors[0].width, 270);
  assert.ok(corridors[0].waypoints.length > 30);
  assert.ok(corridors[0].length > corridors[0].directLength * 1.25);
  assert.ok(corridors[0].length < corridors[0].directLength * 1.5);
  assert.notEqual(corridors[0].samples[Math.floor(corridors[0].samples.length / 2)].y, 0);
  const lateralSigns = corridors[0].samples.map((point) => Math.sign(point.y)).filter(Boolean);
  const directionChanges = lateralSigns.slice(1).filter((sign, index) => sign !== lateralSigns[index]).length;
  assert.ok(directionChanges >= 4);
  assert.equal(corridors[0].boostPatches.length, 4);
  assert.equal(corridors[0].archetypeId, "frontier-freight-road");
  assert.equal(corridors[0].generation.procedural, true);
  const boostProgress = corridors[0].boostPatches.map((patch) => patch.progress);
  assert.ok(boostProgress.every((progress, index) => index === 0 || progress > boostProgress[index - 1]));
  assert.ok(boostProgress[1] - boostProgress[0] < 0.13);
  assert.ok(boostProgress[3] - boostProgress[2] < 0.13);
  assert.equal(getCorridorClearance(corridors[0].samples[12], 40, corridors)?.corridor.id, "corridor-yard-ledge");
  assert.equal(getCorridorClearance({ x: 4200, y: 3000 }, 40, corridors), null);
});

test("corridor infrastructure provides slipstream tuning and pushes debris off the centerline", () => {
  const destinations = [
    { id: "yard-exchange", name: "Yard Exchange", position: { x: 0, y: 0 } },
    { id: "the-ledge", name: "The Ledge", position: { x: 8400, y: 0 } },
  ];
  const corridors = createTransportCorridors({ destinations, connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
  const center = corridors[0].samples[Math.floor(corridors[0].samples.length / 2)];
  const asteroid = { position: { ...center }, origin: { ...center }, velocity: { x: 0, y: 0 }, radius: 34 };
  assert.equal(applyCorridorMaintenance(asteroid, corridors, 1), true);
  assert.ok(Math.hypot(asteroid.velocity.x, asteroid.velocity.y) >= 12);
  assert.ok(Math.hypot(asteroid.origin.x - center.x, asteroid.origin.y - center.y) >= 10);

  const ship = new Ship(0, 0, { powered: true, fuel: 100 });
  ship.environmentMaxSpeedMultiplier = corridors[0].slipstreamSpeedMultiplier;
  ship.environmentThrustMultiplier = corridors[0].slipstreamThrustMultiplier;
  assert.equal(ship.getMaxSpeed(), 126);
  ship.velocity = { x: 100, y: 0 };
  ship.applyKineticVelocityMultiplier(2);
  assert.equal(Math.hypot(ship.velocity.x, ship.velocity.y), 200);
  assert.equal(ship.getMaxSpeed(), 126);
  assert.equal(ship.getFlightVelocityLimit(), 200);
  ship.update(1 / 60, { isDown: () => false });
  assert.ok(Math.hypot(ship.velocity.x, ship.velocity.y) < 200);
  assert.ok(Math.hypot(ship.velocity.x, ship.velocity.y) > 126);
});

test("the reversing engine model lets S brake through zero and back up", () => {
  const input = { isDown: (key) => key === "KeyS" };
  const standardEngine = {
    powered: true, fuel: 100, engineModelId: "rook-standard-drive", thrustMode: "forward",
  };
  const standard = new Ship(0, 0, standardEngine);
  standard.angle = 0;
  standard.velocity = { x: 20, y: 0 };
  standard.update(1, input);
  assert.ok(standard.velocity.x > 0, "the existing standard drive still uses S as a drag brake");
  assert.equal(standardEngine.fuel, 100, "the legacy drag brake does not burn thrust fuel");

  const reversingEngine = {
    powered: true, fuel: 100, fuelBurnRate: 10,
    engineModelId: "vektor-reversing-drive", thrustMode: "forward", thrustPower: 95,
  };
  const reversing = new Ship(0, 0, reversingEngine);
  reversing.angle = 0;
  reversing.velocity = { x: 20, y: 0 };
  reversing.update(1, input);
  assert.ok(reversing.velocity.x < 0, "reverse thrust carries momentum through zero into backward travel");
  assert.equal(reversingEngine.fuel, 90, "powered reverse thrust burns fuel");
  assert.equal(reversing.thrustVisualDirection, "reverse");
});

test("the same corridor archetype generates a deterministic outer freight road", () => {
  const destinations = [
    { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
    { id: "ore-station-one", name: "Ore Station One", position: { x: 40000, y: -24000 } },
  ];
  const first = createTransportCorridors({ destinations, connections: FIRST_REACH_TRANSPORT_CONNECTIONS })[0];
  const second = createTransportCorridors({ destinations, connections: FIRST_REACH_TRANSPORT_CONNECTIONS })[0];
  assert.equal(first.id, "corridor-ledge-ore-station");
  assert.equal(first.archetypeId, "frontier-freight-road");
  assert.equal(first.generation.procedural, true);
  assert.deepEqual(first.samples, second.samples);
  assert.deepEqual(first.boostPatches, second.boostPatches);
  assert.ok(first.length > first.directLength * 1.12);
  assert.ok(first.length < first.directLength * 1.43);
  assert.equal(first.boostPatches.length, 4);
  assert.ok(first.waypoints.length > 100);
});

test("generated corridor shoulder rocks are anchored where they spawn", () => {
  const destinations = [
    { id: "yard-exchange", name: "Yard Exchange", position: { x: 0, y: 0 } },
    { id: "the-ledge", name: "The Ledge", position: { x: 8400, y: 0 } },
  ];
  const corridors = createTransportCorridors({ destinations, connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
  const chunks = createAsteroidChunks({ width: 1000 }, createResourceField(), corridors);
  const shoulderRocks = chunks.update(4200, 0).added.filter((asteroid) => asteroid.corridorShoulderId);
  assert.ok(shoulderRocks.length > 20);
  assert.ok(shoulderRocks.every((asteroid) => asteroid.origin.x === asteroid.position.x && asteroid.origin.y === asteroid.position.y));
});

test("asteroid streaming keeps a physical resource neighborhood around remote mining workers", () => {
  const chunks = createAsteroidChunks({ width: 1000 }, createResourceField(), []);
  chunks.update(0, 0);
  const remote = chunks.update(0, 0, [{ x: 12000, y: -8000 }]);
  assert.ok(remote.added.some((asteroid) => Math.hypot(asteroid.position.x - 12000, asteroid.position.y + 8000) < 2600));
  const returned = chunks.update(0, 0, []);
  assert.ok(returned.removedSet.size > 0);
});

test("the abstract Yard-Ledge trip expands into waypoints that an NPC follows", () => {
  const destinations = [
    { id: "yard-exchange", name: "Yard Exchange", position: { x: 0, y: 0 } },
    { id: "the-ledge", name: "The Ledge", position: { x: 8400, y: 0 } },
  ];
  const network = createTransportationNetwork({ destinations, connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
  const plan = findTransportationRoute(network, "yard-exchange", "the-ledge");
  const physicalRoute = buildPhysicalTransportationRoute(network, plan);
  const ship = new NpcShip({ id: "corridor-test", name: "Corridor Test", route: destinations, x: 0, y: 0 });
  assert.equal(ship.assignShipment({ shipmentId: "shipment:test", destinationSiteId: "the-ledge", route: physicalRoute }), true);
  assert.ok(physicalRoute.length > 10);
  assert.equal(ship.route[ship.routeIndex].type, "corridor-waypoint");
  assert.equal(ship.route.at(-1).id, "the-ledge");
});

test("a normal hauler can negotiate the complete natural corridor without wearing out", () => {
  const destinations = [
    { id: "yard-exchange", name: "Yard Exchange", type: "hub", position: { x: 0, y: 0 } },
    { id: "the-ledge", name: "The Ledge", type: "hub", position: { x: 8400, y: 0 } },
  ];
  const network = createTransportationNetwork({ destinations, connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
  const physicalRoute = buildPhysicalTransportationRoute(network, findTransportationRoute(network, "yard-exchange", "the-ledge"));
  const ship = new NpcShip({ id: "switchback-test", name: "Switchback Test", route: destinations, x: 0, y: 0 });
  ship.assignShipment({ shipmentId: "shipment:switchback", destinationSiteId: "the-ledge", route: physicalRoute });
  const events = [];
  for (let tick = 0; tick < 9_000 && !events.some((event) => event.type === "npc.routeCompleted"); tick += 1) {
    ship.update(0.1, { asteroids: [], npcShips: [ship], sites: destinations });
    events.push(...ship.consumeEvents());
  }
  assert.ok(events.some((event) => event.type === "npc.routeCompleted"));
  assert.equal(events.filter((event) => event.type === "npc.corridorEntered").length, 1);
  assert.ok(ship.wear < 6);
});

test("a hauler trusts a maintained corridor instead of entering careful mode for shoulder rocks", () => {
  const route = [
    { id: "start", type: "hub", position: { x: 0, y: 0 } },
    { id: "lane:1", type: "corridor-waypoint", corridorId: "test-road", position: { x: 500, y: 0 } },
    { id: "lane:2", type: "corridor-waypoint", corridorId: "test-road", position: { x: 1000, y: 0 } },
    { id: "finish", type: "hub", position: { x: 1500, y: 0 } },
  ];
  const ship = new NpcShip({ id: "corridor-cruise", name: "Corridor Cruise", route, x: 500, y: 0 });
  ship.routeIndex = 2;
  ship.activeCorridorId = "test-road";
  ship.velocity = { x: 8, y: 0 };
  ship.lastWaypointDistance = 500;
  const shoulderRock = { position: { x: 500, y: 150 }, radius: 35 };
  for (let tick = 0; tick < 20; tick += 1) ship.updateCarefulMode(0.1, [shoulderRock], 500);
  assert.equal(ship.isCarefulMode, false);
  assert.equal(ship.getMaxSpeed(), 96 * 1.65);
});

test("a genuine corridor intrusion can still trigger careful mode", () => {
  const route = [
    { id: "start", type: "hub", position: { x: 0, y: 0 } },
    { id: "lane:1", type: "corridor-waypoint", corridorId: "test-road", position: { x: 500, y: 0 } },
    { id: "finish", type: "hub", position: { x: 1000, y: 0 } },
  ];
  const ship = new NpcShip({ id: "corridor-obstruction", name: "Corridor Obstruction", route, x: 500, y: 0 });
  ship.activeCorridorId = "test-road";
  ship.velocity = { x: 8, y: 0 };
  ship.lastWaypointDistance = 500;
  const intrudingRock = { position: { x: 535, y: 0 }, radius: 25 };
  for (let tick = 0; tick < 12; tick += 1) ship.updateCarefulMode(0.1, [intrudingRock], 500);
  assert.equal(ship.isCarefulMode, true);
});

test("transport work becomes ineligible when it violates the carrier maintenance policy", () => {
  const network = createTransportationNetwork({ destinations: ["yard-exchange", "scrap-porch", "the-ledge"].map((id) => ({ id })), connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
  const plan = evaluateTransportPlan({ network, originId: "yard-exchange", destinationId: "the-ledge", payment: 500, currentWear: 4, policy: FIRST_REACH_CARRIER_POLICY, repairOptions: FIRST_REACH_REPAIR_OPTIONS });
  assert.equal(plan.eligible, false);
  assert.equal(plan.reason, "maintenance-policy");
});

test("failed route execution cannot commit inventory, custody, or payment", () => {
  const harness = createLogisticsHarness();
  harness.ships[0].canAcceptRoute = () => false;
  const sourceBefore = harness.state.logistics.institutions["yard-exchange"].inventories["iron-nickel"];
  const committedBefore = harness.state.logistics.institutions["scrap-forge"].accounts.operating.committed;
  harness.manager.update();
  assert.equal(Object.values(harness.state.logistics.shipments).some((shipment) => shipment.assigneeId === harness.ships[0].id), false);
  assert.equal(harness.state.logistics.institutions["yard-exchange"].inventories["iron-nickel"], sourceBefore);
  assert.equal(harness.state.logistics.institutions["scrap-forge"].accounts.operating.committed, committedBefore);
});

test("haulers wait instead of fabricating freight when no source has stock", () => {
  const harness = createLogisticsHarness();
  // Haulers may now take work from either end of a relationship, so emptying
  // one shelf only sends them elsewhere. The invariant under test is that
  // freight is never conjured from stock that does not exist.
  Object.values(harness.state.logistics.institutions).forEach((institution) => {
    if (institution.inventories) Object.keys(institution.inventories).forEach((itemId) => { institution.inventories[itemId] = 0; });
  });
  // Sold goods live in awaitingPickup now, which is not the seller's stock.
  Object.values(harness.state.logistics.institutions).forEach((institution) => { institution.awaitingPickup = {}; institution.saleReserve = {}; });
  harness.manager.update();
  assert.equal(Object.keys(harness.state.logistics.shipments).length, 0, "nothing was shipped");
  Object.values(harness.state.logistics.institutions).forEach((institution) => {
    Object.values(institution.inventories ?? {}).forEach((units) => assert.equal(units, 0, "and no stock appeared"));
  });
});

test("NPC haulers move only with real conserved standing shipments", () => {
  const harness = createLogisticsHarness();
  harness.manager.update();
  const shipments = Object.values(harness.state.logistics.shipments);
  assert.ok(shipments.length > 0, "carriers found procurement-backed work");
  assert.ok(harness.ships.every((ship) => ship.assignment?.shipmentId));
  const yardShipment = shipments.find((entry) => entry.assigneeId === "hauler-yard-scrap");
  assert.ok(yardShipment.procurementOrderId, "every run is backed by a purchase order now");
  const container = harness.state.logistics.containers[yardShipment.containerId];
  assert.equal(yardShipment.status, "loaded");
  assert.equal(container.commodity, "iron-nickel");
  assert.equal(container.custody.length, 2);
  assert.deepEqual(harness.ships[0].transfers[0], { commodity: "iron-nickel", direction: "from-hub" });
  const issuerBefore = harness.state.logistics.institutions[yardShipment.issuerInstitutionId].accounts.operating.balance;
  const carrierBefore = harness.state.logistics.institutions["carrier:yard-hauler"].accounts.operating.balance;
  harness.state.ledger.recordEvent("npc.routeCompleted", { npcId: "hauler-yard-scrap", shipmentId: yardShipment.id, siteId: yardShipment.destinationSiteId }, { visible: false });
  harness.manager.update();
  assert.equal(yardShipment.status, "delivered");
  assert.equal(container.ownerInstitutionId, yardShipment.destinationInstitutionId);
  assert.ok((harness.state.logistics.institutions[yardShipment.destinationInstitutionId].inventories[yardShipment.commodity] ?? 0) >= yardShipment.quantity);
  assert.equal(harness.state.logistics.institutions[yardShipment.issuerInstitutionId].accounts.operating.balance, issuerBefore - yardShipment.payment);
  assert.equal(harness.state.logistics.institutions["carrier:yard-hauler"].accounts.operating.balance, carrierBefore + yardShipment.payment);
  const carrierTransactions = harness.state.logistics.institutions["carrier:yard-hauler"].accounts.operating.transactions;
  assert.equal(carrierTransactions.at(-1).type, "freight-income");
  // Freight rates are derived from the purchase order now, not authored.
  assert.equal(carrierTransactions.at(-1).amount, yardShipment.payment);
  assert.ok(harness.state.ledger.getRecentEvents(20).some((event) => event.type === "carrier.contractFulfilled" && event.payload.licenseId === "HLC-001-HAULER-YARD-SCRAP"));
  assert.deepEqual(harness.ships[0].transfers[1], { commodity: yardShipment.commodity, direction: "to-hub" });
  assert.notEqual(harness.state.logistics.haulers["hauler-yard-scrap"].activeShipmentId, yardShipment.id, "carrier selected reciprocal work after delivery");
});

test("SPRC repair revenue is conserved as a carrier account expense", () => {
  const harness = createLogisticsHarness();
  harness.state.sprc = { account: { balance: 1_200 } };
  const carrier = harness.state.logistics.institutions["carrier:porch-runner"];
  const beforeCarrier = carrier.accounts.operating.balance;
  const beforeSprc = harness.state.sprc.account.balance;
  harness.state.ledger.recordEvent("sprc.repairCompleted", { repairOrderId: "TEST-REPAIR-1", haulerId: "hauler-scrap-yard", serviceRevenue: 180 }, { visible: true });
  harness.manager.update();
  assert.equal(carrier.accounts.operating.balance, beforeCarrier - 180);
  assert.equal(harness.state.sprc.account.balance, beforeSprc + 180);
  assert.equal(carrier.accounts.operating.transactions.at(-1).type, "repair-expense");
  assert.equal(carrier.accounts.operating.transactions.at(-1).referenceId, "TEST-REPAIR-1");
  assert.ok(harness.state.ledger.getRecentEvents(20).some((event) => event.type === "carrier.repairPaid" && event.payload.accountId === "FR-ACCT-022"));
});

// RESTORED. The chain never broke. Once the authored freight routes were retired,
// the purchase-order run this harness happens to pick terminates at the repair
// site (Scrap Porch), which correctly collapses recovery to a SINGLE tow — so the
// two-leg case simply stopped being set up. The follow-on service tow still fires
// when the loaded cargo is bound elsewhere; it is also, legitimately, gated on the
// carrier being able to fund both legs across the map. This test now pins the
// loaded cargo to a non-repair-site destination and funds the carrier so the
// happy-path two-leg lifecycle is exercised deterministically. Affordability
// refusal is a separate concern with its own coverage.
test("institutional recovery preserves loaded freight before towing a disabled hauler to SPRC", () => {
  const harness = createLogisticsHarness();
  const towing = createTowServiceManager({ state: harness.state, ships: harness.ships, destinations: [
    { id: "yard-exchange", name: "Yard Exchange", position: { x: 0, y: 0 } },
    { id: "scrap-porch", name: "Scrap Porch", position: { x: 1_000, y: 0 } },
    { id: "the-ledge", name: "The Ledge", position: { x: -8_000, y: 0 } },
  ], now: () => 1_000 });
  harness.manager.update();
  const shipment = Object.values(harness.state.logistics.shipments)
    .find((entry) => entry.assigneeId && entry.destinationSiteId === "scrap-porch")
    ?? Object.values(harness.state.logistics.shipments).find((entry) => entry.assigneeId);
  assert.ok(shipment, "a carrier is carrying something to preserve");
  const ship = harness.ships.find((entry) => entry.id === shipment.assigneeId);
  // Which carrier is loaded depends on which lane had work, so read it off the
  // hauler rather than assuming the Yard ship took it.
  const carrier = harness.state.logistics.institutions[harness.state.logistics.haulers[ship.id].carrierInstitutionId];
  // Point the loaded cargo away from the repair site so the disabled ship must be
  // delivered to its destination FIRST, then towed to Scrap Porch for service —
  // the two-leg lifecycle this test proves. (A cargo bound for Scrap Porch is
  // correctly recovered in one tow and needs no follow-on.)
  shipment.destinationSiteId = "the-ledge";
  // Recovery across the map is genuinely expensive; fund the carrier so both legs
  // clear its protected operating reserve.
  carrier.accounts.operating.balance = 20_000;
  const providerBefore = harness.state.towing.institution.accounts.operating.balance;
  const carrierBefore = carrier.accounts.operating.balance;
  ship.pendingWearIssue = { npcId: ship.id, npcName: ship.name, issueType: "control-fault", wear: 6, issueCount: 1 };
  harness.state.ledger.recordEvent("npc.assistanceRequired", { ...ship.pendingWearIssue, shipmentId: shipment.id }, { visible: true });
  towing.update();
  const cargoTow = Object.values(harness.state.towing.requests).find((entry) => entry.status === "dispatched");
  assert.equal(cargoTow.purpose, "preserve-loaded-delivery");
  assert.equal(cargoTow.destinationSiteId, shipment.destinationSiteId);
  harness.state.ledger.recordEvent("npc.routeCompleted", { npcId: ship.id, shipmentId: shipment.id, towRequestId: cargoTow.id, siteId: shipment.destinationSiteId }, { visible: false });
  towing.update();
  harness.manager.update();
  towing.update();
  const serviceTow = Object.values(harness.state.towing.requests).find((entry) => entry.parentRequestId === cargoTow.id);
  assert.equal(shipment.status, "delivered", "the cargo was preserved and delivered before the ship was recovered");
  assert.ok(serviceTow, "a follow-on service tow was raised");
  assert.equal(serviceTow.destinationSiteId, "scrap-porch");
  harness.state.ledger.recordEvent("npc.routeCompleted", { npcId: ship.id, shipmentId: null, towRequestId: serviceTow.id, siteId: "scrap-porch" }, { visible: false });
  towing.update();
  harness.manager.update();
  assert.equal(harness.state.logistics.haulers[ship.id].status, "maintenance-required");
  assert.equal(carrier.accounts.operating.balance, carrierBefore + shipment.payment - cargoTow.fee - serviceTow.fee);
  assert.equal(harness.state.towing.institution.accounts.operating.balance, providerBefore + cargoTow.fee + serviceTow.fee);
  assert.ok(harness.state.ledger.getRecentEvents(40).some((event) => event.type === "towService.completed" && event.payload.actorName === "Nell Winch"));
});

test("a route hauler crossing its wear limit stops and requests institutional assistance", () => {
  const route = [
    { id: "yard-exchange", name: "Yard Exchange", type: "hub", interactionRadius: 100, position: { x: 0, y: 0 } },
    { id: "the-ledge", name: "The Ledge", type: "hub", interactionRadius: 100, position: { x: 10_000, y: 0 } },
  ];
  const ship = new NpcShip({ id: "test-hauler", name: "Test Hauler", route, x: 0, y: 0, maintenanceSiteId: "scrap-porch" });
  assert.equal(ship.maxHull, 680);
  assert.equal(ship.hull, ship.maxHull);
  ship.assignShipment({ shipmentId: "SHIP-TEST", destinationSiteId: "the-ledge", route });
  ship.departureTimer = 0;
  ship.operationalStatus = "available";
  ship.wear = 5.999;
  ship.update(1, { sites: route, asteroids: [], npcShips: [ship] });
  const assistance = ship.consumeEvents().find((event) => event.type === "npc.assistanceRequired");
  assert.ok(assistance);
  assert.equal(assistance.payload.shipmentId, "SHIP-TEST");
  assert.equal(ship.operationalStatus, "disabled");
});

test("a remote carrier with no policy-eligible freight generates a return-to-maintenance movement", () => {
  const harness = createLogisticsHarness();
  const ship = harness.ships[0];
  const hauler = harness.state.logistics.haulers[ship.id];
  const shipInstitution = harness.state.logistics.institutions[hauler.shipInstitutionId];
  hauler.currentSiteId = "the-ledge";
  ship.dockedSiteId = "the-ledge";
  ship.wear = 5.2;
  shipInstitution.wear = 5.2;
  harness.manager.update();
  const movement = Object.values(harness.state.logistics.movements)[0];
  assert.equal(movement.type, "service-return");
  assert.equal(movement.destinationSiteId, "scrap-porch");
  assert.equal(Object.values(harness.state.logistics.shipments).some((entry) => entry.assigneeId === ship.id), false);
  assert.deepEqual(ship.assignment.route.map((site) => site.id), ["the-ledge", "yard-exchange", "scrap-porch"]);
});

test("a carrier rejected by maintenance policy cannot remain parked below a separate service threshold", () => {
  const harness = createLogisticsHarness();
  const ship = harness.ships[1];
  const hauler = harness.state.logistics.haulers[ship.id];
  const shipInstitution = harness.state.logistics.institutions[hauler.shipInstitutionId];
  ship.wear = 5;
  shipInstitution.wear = 5;
  harness.manager.update();
  assert.equal(Object.values(harness.state.logistics.shipments).some((entry) => entry.assigneeId === ship.id), false);
  assert.equal(hauler.status, "maintenance-required");
  assert.equal(hauler.maintenanceRequested, true);
  assert.equal(ship.operationalStatus, "maintenance");
  assert.ok(harness.state.ledger.getRecentEvents(20).some((event) => event.type === "carrier.maintenanceRequested" && event.payload.pilotName === "Mara Venn"));
});

test("older logistics state receives policy and destination data without duplicating carriers", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const carrierCount = Object.keys(state.logistics.haulers).length;
  delete state.logistics.institutions["the-ledge"];
  delete state.logistics.institutions["carrier:yard-hauler"].policies;
  delete state.logistics.institutions["carrier:yard-hauler"].repairOptions;
  delete state.logistics.movements;
  delete state.logistics.counters.movement;
  createLogisticsManager({ state, ships: [], now: () => 1_000 });
  assert.equal(Object.keys(state.logistics.haulers).length, carrierCount);
  assert.ok(state.logistics.institutions["the-ledge"]);
  assert.ok(state.logistics.institutions["carrier:yard-hauler"].policies.transportation);
  assert.ok(state.logistics.institutions["carrier:yard-hauler"].repairOptions.length > 0);
  assert.deepEqual(state.logistics.movements, {});
});

test("an NPC carrier cannot accept standing freight until docked at its recorded site", () => {
  const harness = createLogisticsHarness();
  harness.ships[0].dockedSiteId = null;
  harness.manager.update();
  assert.equal(Object.values(harness.state.logistics.shipments).some((shipment) => shipment.assigneeId === harness.ships[0].id), false);
  harness.ships[0].dockedSiteId = "yard-exchange";
  harness.manager.update();
  assert.equal(Object.values(harness.state.logistics.shipments).some((shipment) => shipment.assigneeId === harness.ships[0].id), true);
});

test("a carrier finishes its shipment at the maintenance hub before downtime blocks reassignment", () => {
  const harness = createLogisticsHarness();
  harness.manager.update();
  const shipment = Object.values(harness.state.logistics.shipments).find((entry) => entry.assigneeId === "hauler-yard-scrap");
  const ship = harness.ships.find((entry) => entry.id === "hauler-yard-scrap");
  ship.dockedSiteId = shipment.destinationSiteId;
  harness.state.ledger.recordEvent("npc.routeCompleted", { npcId: ship.id, shipmentId: shipment.id, siteId: shipment.destinationSiteId }, { visible: false });
  harness.state.ledger.recordEvent("npc.wearIssue", { npcId: ship.id, issueType: "hull-fatigue", wear: 6, issueCount: 1 }, { visible: false });
  harness.manager.update();
  assert.equal(shipment.status, "delivered");
  assert.equal(harness.state.logistics.haulers[ship.id].activeShipmentId, null);
  assert.equal(harness.state.logistics.haulers[ship.id].status, "maintenance-required");
  assert.equal(ship.operationalStatus, "maintenance");
});

test("player standing freight uses the same container, custody, inventory, and payment lifecycle", () => {
  const harness = createLogisticsHarness();
  const template = getProcurementFreightOffers(harness.state)[0];
  assert.ok(template, "procurement produced a run the player can take");
  const contract = createStandingFreightJob(template, "Yard Exchange Freight Desk");
  assert.equal(harness.manager.acceptPlayerContract(contract, "person:test-pilot", "somewhere-else"), null,
    "the player cannot accept a remotely observed freight posting");
  const shipment = harness.manager.acceptPlayerContract(contract, "person:test-pilot", template.originSiteId);
  assert.equal(shipment.status, "assigned");
  assert.equal(harness.manager.loadPlayerContract(contract.id), true);
  assert.equal(shipment.status, "loaded");
  assert.equal(harness.manager.deliverPlayerContract(contract.id), true);
  assert.equal(shipment.status, "delivered");
  assert.equal(harness.state.logistics.containers[shipment.containerId].custodianInstitutionId, shipment.destinationInstitutionId);
});

test("different wear issues create different SPRC repair recipes", () => {
  for (const [issueType, expected] of [["drive-fatigue", { "hull-plate": 0, "machine-part": 1 }], ["maneuvering-strain", { "hull-plate": 1, "machine-part": 1 }], ["hull-fatigue", { "hull-plate": 2, "machine-part": 0 }], ["control-fault", { "hull-plate": 0, "machine-part": 2 }]]) {
    const harness = createHarness();
    harness.state.ledger.recordEvent("logistics.maintenanceRequired", { npcId: SPRC.firstHaulerId, issueType, wear: 1.5, issueCount: 1, causedByCarefulMode: issueType === "maneuvering-strain" }, { visible: false });
    harness.operation.update();
    const repair = Object.values(harness.state.sprc.repairOrders)[0];
    assert.deepEqual(repair.requirements.produced, expected);
    assert.equal(repair.origin.type, "operational-wear");
  }
});

test("a ready hauler repair bypasses an earlier miner repair blocked on materials", () => {
  const harness = createHarness();
  harness.state.sprc.inventories.raw.copper = 0;
  harness.state.ledger.recordEvent("maintenance.requested", {
    subjectId: "worker:test-miner", subjectName: "Test Miner", referenceId: "MW-TEST", craftClass: "mining-craft",
    issueType: "field-control-failure", requiredCapabilities: ["field-control"], locationSiteId: "scrap-porch", mobility: "self-return",
    payerInstitutionId: "miner:test", payer: { balance: 100000, committed: 0, protectedCash: 10000 }, servicePrice: 2200,
  }, { visible: false });
  harness.state.ledger.recordEvent("logistics.maintenanceRequired", { npcId: SPRC.firstHaulerId, issueType: "preventive-service", wear: 4, issueCount: 1 }, { visible: false });
  harness.operation.update();
  harness.operation.update();
  const active = harness.state.sprc.repairOrders[harness.state.sprc.facilities.berthTwo.activeRepairOrderId];
  assert.equal(active.subjectId, SPRC.firstHaulerId);
  assert.equal(harness.state.sprc.repairOrders["SPRC-RPR-0001"].status, "waiting-production");
});

test("a repeated service request reuses the live repair and clears stale deferral state", () => {
  const harness = createHarness();
  harness.state.ledger.recordEvent("maintenance.requested", {
    subjectId: "worker:test-miner", subjectName: "Test Miner", referenceId: "MW-TEST", craftClass: "mining-craft",
    issueType: "preventive-calibration", requiredCapabilities: ["field-control"], locationSiteId: "scrap-porch", mobility: "self-return",
    payerInstitutionId: "miner:test", payer: { balance: 100000, committed: 0, protectedCash: 10000 }, servicePrice: 2200,
  }, { visible: false });
  harness.operation.update();
  const original = Object.values(harness.state.sprc.repairOrders).find((repair) => repair.subjectId === "worker:test-miner");
  assert.ok(original);

  harness.state.sprc.deferredServiceRequests["worker:test-miner"] = { reason: "payer-cannot-afford" };
  harness.state.ledger.recordEvent("maintenance.requested", {
    subjectId: "worker:test-miner", subjectName: "Test Miner", referenceId: "MW-TEST", craftClass: "mining-craft",
    issueType: "preventive-calibration", requiredCapabilities: ["field-control"], locationSiteId: "scrap-porch", mobility: "self-return",
    payerInstitutionId: "miner:test", payer: { balance: 100000, committed: 0, protectedCash: 10000 }, servicePrice: 2200,
  }, { visible: false });
  harness.operation.update();

  assert.equal(Object.values(harness.state.sprc.repairOrders).filter((repair) => repair.subjectId === "worker:test-miner").length, 1);
  assert.equal(harness.state.sprc.repairOrders[original.id], original);
  assert.equal(harness.state.sprc.deferredServiceRequests["worker:test-miner"], undefined);
});

test("Sal procures ordinary silicate and copper when machine-part production is blocked", () => {
  const harness = createHarness();
  harness.state.sprc.inventories.produced["machine-part"] = 0;
  harness.state.sprc.inventories.raw.silicate = 0;
  harness.state.sprc.inventories.raw.copper = 0;
  harness.state.ledger.recordEvent("logistics.maintenanceRequired", { npcId: SPRC.firstHaulerId, issueType: "preventive-service", wear: 4, issueCount: 1 }, { visible: false });
  harness.operation.update();
  const items = Object.values(harness.state.sprc.procurementOrders).map((order) => order.procurementItemId);
  assert.ok(items.includes("silicate"));
  assert.ok(items.includes("copper"));
  assert.equal(Object.values(harness.state.sprc.procurementOrders).find((order) => order.procurementItemId === "silicate").requiredEquivalentUnits, 6);
  assert.equal(Object.values(harness.state.sprc.procurementOrders).find((order) => order.procurementItemId === "copper").requiredEquivalentUnits, 3);
});

test("concurrent repairs share Sal's material orders instead of publishing tiny duplicates", () => {
  const harness = createHarness();
  harness.state.sprc.inventories.produced["machine-part"] = 0;
  harness.state.sprc.inventories.raw.silicate = 0;
  harness.state.sprc.inventories.raw.copper = 0;
  for (let index = 1; index <= 3; index += 1) {
    harness.state.ledger.recordEvent("maintenance.requested", {
      subjectId: `worker:test-miner-${index}`, subjectName: `Test Miner ${index}`, referenceId: `MW-TEST-${index}`, craftClass: "mining-craft",
      issueType: "preventive-calibration", requiredCapabilities: ["field-control"], locationSiteId: "scrap-porch", mobility: "self-return",
      payerInstitutionId: `miner:test-${index}`, payer: { balance: 100000, committed: 0, protectedCash: 10000 }, servicePrice: 2200,
    }, { visible: false });
  }
  harness.operation.update();
  const silicateOrders = Object.values(harness.state.sprc.procurementOrders).filter((order) => order.procurementItemId === "silicate");
  assert.equal(silicateOrders.length, 1);
  assert.equal(silicateOrders[0].requiredEquivalentUnits, 6);
  assert.equal(silicateOrders[0].needIds.length, 3);
});

test("a ready repair whose reservation outruns real stock is reconciled, not crashed", () => {
  const harness = createHarness();
  harness.operation.update();
  const sprc = harness.state.sprc;

  // The drift seen live at boot: a ready order still claims a machine-part it
  // once reserved, but only part of the stock came back and the global reserved
  // ledger restored empty. Consuming the stale claim used to underflow the
  // inventory and throw in the middle of the tick.
  sprc.inventories.produced["machine-part"] = 1;
  sprc.inventories.reserved.produced = {};
  sprc.inventories.reserved.raw = {};
  sprc.facilities.berthTwo.status = "available";
  sprc.facilities.berthTwo.activeRepairOrderId = null;
  const drifted = {
    id: "SPRC-RPR-DRIFT", status: "ready", priority: 100, createdAt: 1_000, subjectId: "worker:drift",
    requirements: { produced: { "machine-part": 2 }, raw: {} },
    reserved: { produced: { "machine-part": 2 }, raw: {} },
  };
  sprc.repairOrders[drifted.id] = drifted;
  sprc.repairQueue.push(drifted.id);

  assert.doesNotThrow(() => harness.operation.update());
  assert.notEqual(drifted.status, "repairing", "the drifted order does not seize the berth on short stock");
  assert.ok((sprc.inventories.produced["machine-part"] ?? 0) >= 0, "physical stock never went negative");
  assert.ok(harness.state.ledger.getRecentEvents(80, { includeHidden: true }).some((event) => event.type === "sprc.repairReservationReconciled"),
    "the drift is reconciled and recorded, not swallowed");
});
