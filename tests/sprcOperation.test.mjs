import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createSprcOperation, SPRC } from "../src/systems/sprcOperation.js";
import { createShipPaperworkInspectionReport } from "../src/systems/paperworkInspections.js";
import { createFarmOperation } from "../src/systems/farmOperation.js";
import { evaluateAffordability, generateCapabilityResponses } from "../src/systems/institutionDecision.js";

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
  for (const siteId of ["yard-exchange", "scrap-porch"]) {
    harness.state.ledger.recordEvent("npc.routeCompleted", { npcId: SPRC.firstHaulerId, siteId }, { visible: false });
    harness.operation.update();
  }
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

test("the provisional route trigger creates a causal repair, need, response, and procurement order", () => {
  const harness = createHarness();
  triggerFirstRepair(harness);
  const repair = Object.values(harness.state.sprc.repairOrders)[0];
  const need = Object.values(harness.state.sprc.needs).find((entry) => entry.objectiveType === "emergency-repair");
  const response = Object.values(harness.state.sprc.responses).find((entry) => entry.needId === need.id);
  const order = Object.values(harness.state.sprc.procurementOrders)[0];

  assert.equal(repair.origin.type, "provisional-route-count");
  assert.equal(repair.origin.replaceWith, "unified-wear-assessment");
  assert.equal(need.sourceRepairOrderId, repair.id);
  assert.equal(response.needId, need.id);
  assert.equal(response.procurementOrderId, order.id);
  assert.equal(order.sourceRepairOrderId, repair.id);
  assert.equal(harness.state.sprc.inventories.reserved.produced["hull-plate"], 1);
  assert.equal(harness.state.sprc.inventories.reserved.produced["machine-part"], 1);
});

test("aluminum and iron-nickel satisfy the same outcome-based procurement order", () => {
  for (const [materialId, deliveredUnits] of [["iron-nickel", 8], ["aluminum", 4]]) {
    const harness = createHarness();
    triggerFirstRepair(harness);
    const order = Object.values(harness.state.sprc.procurementOrders)[0];
    harness.operation.acceptProcurement(order.contractId);
    const result = harness.operation.deliverMaterial({ contractId: order.contractId, materialId, amount: deliveredUnits });
    assert.equal(result.equivalentUnits, 8);
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
