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
  assert.equal(harness.state.sprc.account.balance, sprcBefore - delivery.paid + 180, "repair revenue is a separate conserved transfer");
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
  const ships = ["hauler-yard-scrap", "hauler-scrap-yard"].map((id) => ({ id, wear: 0, operationalStatus: "seeking-work", dockedSiteId: id === "hauler-yard-scrap" ? "yard-exchange" : "scrap-porch", transfers: [], queueCargoTransfer(transfer) { this.transfers.push(transfer); }, assignShipment(assignment) { this.assignment = assignment; this.dockedSiteId = null; this.operationalStatus = "available"; }, clearShipment() { this.assignment = null; this.operationalStatus = "seeking-work"; } }));
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

test("NPC haulers move only with real conserved standing shipments", () => {
  const harness = createLogisticsHarness();
  harness.manager.update();
  const shipments = Object.values(harness.state.logistics.shipments);
  assert.equal(shipments.length, 2);
  assert.ok(harness.ships.every((ship) => ship.assignment?.shipmentId));
  const yardShipment = shipments.find((entry) => entry.assigneeId === "hauler-yard-scrap");
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
  assert.deepEqual(harness.ships[0].transfers[1], { commodity: "iron-nickel", direction: "to-hub" });
  assert.notEqual(harness.state.logistics.haulers["hauler-yard-scrap"].activeShipmentId, yardShipment.id, "carrier selected reciprocal work after delivery");
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
