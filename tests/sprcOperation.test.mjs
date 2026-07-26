import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createSprcOperation, SPRC } from "../src/systems/sprcOperation.js";
import { createShipPaperworkInspectionReport } from "../src/systems/paperworkInspections.js";
import { createFarmOperation } from "../src/systems/farmOperation.js";
import { evaluateAffordability, generateCapabilityResponses } from "../src/systems/institutionDecision.js";
import { createContractManager } from "../src/systems/contractManager.js";
import { createInitialLogisticsState, createLogisticsManager, createStandingFreightJob, STANDING_FREIGHT_TEMPLATES } from "../src/systems/logistics.js";
import { createTransportationNetwork, evaluateTransportPlan, findTransportationRoute } from "../src/systems/transportationPlanning.js";
import { FIRST_REACH_CARRIER_POLICY, FIRST_REACH_REPAIR_OPTIONS, FIRST_REACH_TRANSPORT_CONNECTIONS } from "../src/content/transportation/firstReachNetwork.js";
import { createTowServiceManager } from "../src/systems/towService.js";
import { NpcShip } from "../src/entities/NpcShip.js";
import { MiningWorkerShip } from "../src/entities/MiningWorkerShip.js";
import { createMiningOperation, getStandingMiningJobsForSite, STANDING_MINING_ORDERS } from "../src/systems/miningOperation.js";

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
  harness.state.sprc.account.balance = 950;
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
  harness.state.sprc.account.balance = 950;
  harness.operation.update();
  const blocked = Object.values(harness.state.sprc.responses)[0];
  assert.equal(blocked.status, "blocked");
  harness.state.sprc.account.balance = 1800;
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
  operation.institution.accounts.operating.balance = 350;
  let result = operation.assess();
  const blocked = Object.values(result.institution.responses).find((entry) => entry.resourceId === "water");
  assert.equal(blocked.status, "blocked");
  operation.institution.accounts.operating.balance = 720;
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
  harness.state.sprc.operatingPlan.protectedCashReserve = 1600;
  harness.state.sprc.account.protectedReserve = 0;
  harness.operation.update();
  assert.equal(harness.state.sprc.account.protectedReserve, 1600);
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
  assert.equal(institutionalDelivery.acceptedUnits, 2, "supplier cannot exceed its allocation");
  assert.equal(supplierCredits, 68);
  assert.equal(order.deliveredEquivalentUnits, 2);
  assert.equal(contract.status, "offered");

  const playerBefore = harness.state.credits;
  assert.equal(harness.operation.acceptProcurement(order.contractId), true);
  const playerDelivery = harness.operation.deliverMaterial({ contractId: order.contractId, materialId: "iron-nickel", amount: 6 });
  assert.equal(playerDelivery.paid, 204);
  assert.equal(harness.state.credits - playerBefore, 204);
  assert.equal(order.paidAmount, order.maximumPayment);
  assert.equal(order.status, "paid");
});

test("every active hub exposes one evergreen local extraction order", () => {
  for (const siteId of ["yard-exchange", "scrap-porch", "the-ledge"]) {
    const jobs = getStandingMiningJobsForSite(siteId);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].repeatable, true);
    assert.equal(jobs[0].terms.destinationSiteId, siteId);
  }
  assert.equal(STANDING_MINING_ORDERS.length, 3);
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
  assert.equal(new Set(manager.workers.map((worker) => worker.assignment.contractId)).size, 3);
  assert.ok(manager.workers.every((worker) => worker.capabilities.tractorField.powerSource === "evergreen"));
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
});

test("a mining institution delivery conserves material and payment into freight inventory", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const game = {
    worldSites: [
      { id: "yard-exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", position: { x: 7000, y: -4500 } },
    ],
    addWorkerShip: () => {},
  };
  const manager = createMiningOperation({ state, game, now: () => 1_000 });
  const worker = manager.worker;
  const buyer = state.logistics.institutions["scrap-forge"];
  const buyerCashBefore = buyer.accounts.operating.balance;
  const minerCashBefore = manager.getState().institution.accounts.operating.balance;
  worker.cargo["water-ice"] = 3;
  worker.deliver();

  assert.equal(buyer.inventories["water-ice"], 3);
  assert.equal(buyerCashBefore - buyer.accounts.operating.balance, 138);
  assert.equal(manager.getState().institution.accounts.operating.balance - minerCashBefore, 138);
  assert.equal(manager.getState().completedContracts, 1);
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
  harness.advance(21 * 60 * 1000);
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

function createLogisticsHarness() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  state.logistics.institutions["yard-exchange"].inventories["iron-nickel"] = 2;
  state.logistics.institutions["scrap-forge"].inventories["water-ice"] = 2;
  const ships = ["hauler-yard-scrap", "hauler-scrap-yard"].map((id) => ({ id, name: id === "hauler-yard-scrap" ? "Yard Hauler" : "Porch Runner Two", wear: 0, operationalStatus: "seeking-work", dockedSiteId: id === "hauler-yard-scrap" ? "yard-exchange" : "scrap-porch", transfers: [], pendingWearIssue: null, queueCargoTransfer(transfer) { this.transfers.push(transfer); }, assignShipment(assignment) { this.assignment = assignment; this.dockedSiteId = null; this.operationalStatus = "available"; }, clearShipment() { this.assignment = null; this.operationalStatus = "seeking-work"; }, assignTow(assignment) { this.towAssignment = assignment; this.activeTowRequestId = assignment.requestId; this.operationalStatus = "being-towed"; return true; }, clearTow() { this.activeTowRequestId = null; this.towAssignment = null; } }));
  const manager = createLogisticsManager({ state, ships, now: () => 1_000 });
  return { state, ships, manager };
}

test("the known transportation network finds a multi-destination path without authored route logic", () => {
  const network = createTransportationNetwork({ destinations: ["yard-exchange", "scrap-porch", "the-ledge"].map((id) => ({ id })), connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
  const route = findTransportationRoute(network, "scrap-porch", "the-ledge", FIRST_REACH_CARRIER_POLICY.knownDestinationIds);
  assert.deepEqual(route.path, ["scrap-porch", "yard-exchange", "the-ledge"]);
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

test("haulers wait instead of fabricating freight when a source inventory is empty", () => {
  const harness = createLogisticsHarness();
  harness.state.logistics.institutions["yard-exchange"].inventories["iron-nickel"] = 0;
  harness.manager.update();
  assert.equal(Object.values(harness.state.logistics.shipments).some((shipment) => shipment.assigneeId === "hauler-yard-scrap"), false);
  assert.equal(harness.state.logistics.institutions["yard-exchange"].inventories["iron-nickel"], 0);
});

test("NPC haulers move only with real conserved standing shipments", () => {
  const harness = createLogisticsHarness();
  harness.manager.update();
  const shipments = Object.values(harness.state.logistics.shipments);
  assert.equal(shipments.length, 2);
  assert.ok(harness.ships.every((ship) => ship.assignment?.shipmentId));
  const yardShipment = shipments.find((entry) => entry.assigneeId === "hauler-yard-scrap");
  assert.equal(yardShipment.templateId, "standing-iron-yard-ledge", "healthy carrier selects the higher-scoring Ledge work");
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
  assert.equal(harness.state.logistics.institutions[yardShipment.destinationInstitutionId].inventories[yardShipment.commodity], 1);
  assert.equal(harness.state.logistics.institutions[yardShipment.issuerInstitutionId].accounts.operating.balance, issuerBefore - yardShipment.payment);
  assert.equal(harness.state.logistics.institutions["carrier:yard-hauler"].accounts.operating.balance, carrierBefore + yardShipment.payment);
  const carrierTransactions = harness.state.logistics.institutions["carrier:yard-hauler"].accounts.operating.transactions;
  assert.equal(carrierTransactions.at(-1).type, "freight-income");
  assert.equal(carrierTransactions.at(-1).amount, 500);
  assert.ok(harness.state.ledger.getRecentEvents(20).some((event) => event.type === "carrier.contractFulfilled" && event.payload.licenseId === "HLC-001-HAULER-YARD-SCRAP"));
  assert.deepEqual(harness.ships[0].transfers[1], { commodity: "iron-nickel", direction: "to-hub" });
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

test("institutional recovery preserves loaded freight before towing a disabled hauler to SPRC", () => {
  const harness = createLogisticsHarness();
  const towing = createTowServiceManager({ state: harness.state, ships: harness.ships, destinations: [
    { id: "yard-exchange", name: "Yard Exchange", position: { x: 0, y: 0 } },
    { id: "scrap-porch", name: "Scrap Porch", position: { x: 1_000, y: 0 } },
    { id: "the-ledge", name: "The Ledge", position: { x: -8_000, y: 0 } },
  ], now: () => 1_000 });
  harness.manager.update();
  const ship = harness.ships[0];
  const shipment = Object.values(harness.state.logistics.shipments).find((entry) => entry.assigneeId === ship.id);
  const carrier = harness.state.logistics.institutions["carrier:yard-hauler"];
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
  assert.equal(shipment.status, "delivered");
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

test("Ledge standing freight pays a frontier premium", () => {
  assert.equal(STANDING_FREIGHT_TEMPLATES.find((entry) => entry.id === "standing-iron-yard-ledge").payment, 500);
  assert.equal(STANDING_FREIGHT_TEMPLATES.find((entry) => entry.id === "standing-silicate-ledge-yard").payment, 400);
});

test("a worn carrier declines Ledge freight and selects work compatible with its return margin", () => {
  const harness = createLogisticsHarness();
  harness.state.logistics.institutions["ship:hauler-yard-scrap"].wear = 3;
  harness.ships[0].wear = 3;
  harness.manager.update();
  const shipment = Object.values(harness.state.logistics.shipments).find((entry) => entry.assigneeId === harness.ships[0].id);
  assert.equal(shipment.templateId, "standing-iron-yard-scrap");
  assert.ok(harness.state.logistics.history.some((entry) => entry.type === "freight.declined" && entry.templateId === "standing-iron-yard-ledge" && entry.reason === "maintenance-policy"));
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
  const template = STANDING_FREIGHT_TEMPLATES[0];
  const contract = createStandingFreightJob(template, "Yard Exchange Freight Desk");
  const shipment = harness.manager.acceptPlayerContract(contract, "person:test-pilot");
  assert.equal(shipment.status, "assigned");
  assert.equal(harness.manager.loadPlayerContract(contract.id), true);
  assert.equal(shipment.status, "loaded");
  assert.equal(harness.manager.deliverPlayerContract(contract.id), true);
  assert.equal(shipment.status, "delivered");
  assert.equal(harness.state.logistics.containers[shipment.containerId].custodianInstitutionId, shipment.destinationInstitutionId);
});

test("different wear issues create different SPRC repair recipes", () => {
  for (const [issueType, expected] of [["maneuvering-strain", { "hull-plate": 1, "machine-part": 1 }], ["hull-fatigue", { "hull-plate": 2, "machine-part": 0 }], ["control-fault", { "hull-plate": 0, "machine-part": 2 }]]) {
    const harness = createHarness();
    harness.state.ledger.recordEvent("logistics.maintenanceRequired", { npcId: SPRC.firstHaulerId, issueType, wear: 1.5, issueCount: 1, causedByCarefulMode: issueType === "maneuvering-strain" }, { visible: false });
    harness.operation.update();
    const repair = Object.values(harness.state.sprc.repairOrders)[0];
    assert.deepEqual(repair.requirements.produced, expected);
    assert.equal(repair.origin.type, "operational-wear");
  }
});
