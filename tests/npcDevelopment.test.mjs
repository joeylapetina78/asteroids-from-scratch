import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { listAssets } from "../src/systems/assetCapabilities.js";
import { getHubActor } from "../src/systems/hubActors.js";
import { createIndustrialProductionOperation } from "../src/systems/industrialProduction.js";
import {
  FACTORY_SPINOUT_CAPITAL,
  createNpcDevelopmentOperation,
  evaluateOperatorPromotion,
  trySpinOutFactory,
} from "../src/systems/npcDevelopment.js";
import { recruitPopulationLabor } from "../src/systems/populationLabor.js";
import { loadSavedProfile, saveProfile } from "../src/systems/saveManager.js";

function recruit(state, { hubId = "yard-exchange", assignmentId = "employment:test", role = "freight-operator",
  employerInstitutionId = "carrier:test", assetId = "asset:test" } = {}) {
  const result = recruitPopulationLabor(state, {
    hubInstitutionId: hubId, assignmentId, role, workers: role === "factory-supervisor" ? 4 : 1,
    employerInstitutionId, assetId, at: 0,
  });
  assert.equal(result.ok, true);
  return result;
}

test("an operational freight person becomes bespoke only through recorded success", () => {
  const state = createGameState();
  const recruited = recruit(state);
  const operator = recruited.operator;
  state.logistics.institutions[operator.id] = structuredClone(operator);
  state.logistics.institutions["carrier:test"] = {
    id: "carrier:test", archetypeId: "hauling-business", controllerInstitutionId: operator.id,
    accounts: { operating: { balance: 4_000, committed: 0, transactions: [] } },
    operatingHistory: { completedFreight: 4, lifetimeFreightRevenue: 2_000,
      servedSiteIds: ["yard-exchange", "scrap-porch"], firstDeliveryAt: 10_000, lastDeliveryAt: 150_000 },
  };

  const record = evaluateOperatorPromotion(state, operator.id, 200_000);
  assert.equal(record.stage, "bespoke");
  assert.equal(operator.actorKind, "bespoke-npc");
  assert.equal(operator.charter.assetId, "asset:test", "promotion preserves the authority that made the career possible");
  assert.equal(state.logistics.institutions[operator.id].actorKind, "bespoke-npc", "a restored mirror cannot retain the old tier");
  assert.match(operator.bespoke.biography, /freight proprietor/);
  assert.ok(getHubActor(state, "yard-exchange").development.operators.some((entry) => entry.operatorId === operator.id));
});

test("time alone does not promote an operator without achievements", () => {
  const state = createGameState();
  const { operator } = recruit(state);
  state.logistics.institutions["carrier:test"] = {
    id: "carrier:test", archetypeId: "hauling-business", controllerInstitutionId: operator.id,
    accounts: { operating: { balance: 4_000, committed: 0 } }, operatingHistory: {},
  };
  assert.equal(evaluateOperatorPromotion(state, operator.id, 2_000_000).stage, "operational");
  assert.equal(operator.actorKind, "operational-npc");
});

test("a proven municipal factory can spin out without creating money, material, labor or identity", () => {
  const state = createGameState();
  const parent = state.logistics.institutions["yard-exchange"];
  parent.inventories["iron-nickel"] = 20;
  parent.inventories["hull-plate"] = 5;
  const recruited = recruit(state, {
    assignmentId: "employment:yard-test-works", role: "factory-supervisor",
    employerInstitutionId: parent.id, assetId: "yard-test-works",
  });
  state.industrial.factories["yard-test-works"] = {
    id: "yard-test-works", name: "Yard Test Works", institutionId: parent.id,
    operatorId: recruited.operator.id, laborAssignmentId: recruited.assignment.id,
    emergedFromPressure: true, status: "available", activeRun: null, completedRuns: 8,
    operatingHistory: { ordersAccepted: 2, contractedRevenue: 1_000 },
    recipes: [{ output: "hull-plate", amount: 1, inputs: { "iron-nickel": 2 }, credits: 28, seconds: 24 }],
  };
  const cashBefore = parent.accounts.operating.balance;
  const ironBefore = parent.inventories["iron-nickel"];
  const platesBefore = parent.inventories["hull-plate"];

  createNpcDevelopmentOperation({ state, now: () => 200_000 }).observe();

  const business = state.logistics.institutions["business:yard-test-works"];
  assert.ok(business);
  assert.equal(business.archetypeId, "parts-business");
  assert.equal(business.controllerInstitutionId, recruited.operator.id, "the proven person remains the same controller");
  assert.equal(state.industrial.factories["yard-test-works"].institutionId, business.id, "the physical asset changes owner");
  assert.equal(parent.accounts.operating.balance + business.accounts.operating.balance, cashBefore);
  assert.equal(business.accounts.operating.balance, FACTORY_SPINOUT_CAPITAL);
  assert.equal(parent.inventories["iron-nickel"] + business.inventories["iron-nickel"], ironBefore);
  assert.equal(parent.inventories["hull-plate"] + business.inventories["hull-plate"], platesBefore);
  assert.equal(state.population.laborAssignments[recruited.assignment.id].employerInstitutionId, business.id);
  assert.ok(listAssets(state, { ownerActorId: business.id }).some((asset) => asset.id === "yard-test-works"));
  assert.ok(getHubActor(state, parent.id).development.spinouts.some((entry) => entry.id === business.id));
});

test("a factory with unfinished obligations does not spin out from under its customer", () => {
  const state = createGameState();
  const parent = state.logistics.institutions["yard-exchange"];
  parent.inventories["iron-nickel"] = 20;
  const recruited = recruit(state, { assignmentId: "employment:busy-works", role: "factory-supervisor",
    employerInstitutionId: parent.id, assetId: "busy-works" });
  recruited.operator.actorKind = "bespoke-npc";
  state.industrial.factories["busy-works"] = {
    id: "busy-works", name: "Busy Works", institutionId: parent.id, operatorId: recruited.operator.id,
    laborAssignmentId: recruited.assignment.id, emergedFromPressure: true, activeRun: null, completedRuns: 20,
    operatingHistory: { ordersAccepted: 5, contractedRevenue: 2_000 },
    recipes: [{ output: "hull-plate", inputs: { "iron-nickel": 2 } }],
  };
  state.hubProcurement.orders.OPEN = { id: "OPEN", factoryId: "busy-works", status: "accepted" };
  assert.equal(trySpinOutFactory(state, "busy-works", 300_000), null);
  assert.equal(state.industrial.factories["busy-works"].institutionId, parent.id);
});

test("an independent works replenishes inputs through a conserving paid local supply agreement", () => {
  const state = createGameState();
  const parent = state.logistics.institutions["yard-exchange"];
  parent.inventories["iron-nickel"] = 20;
  const business = state.logistics.institutions["business:test-works"] = {
    id: "business:test-works", archetypeId: "parts-business", actorKind: "independent-business",
    parentInstitutionId: parent.id, siteId: parent.siteId, inventories: { "iron-nickel": 0, "hull-plate": 3 },
    accounts: { operating: { balance: 3_000, committed: 0, transactions: [] } }, policies: { protectedCash: 600 },
  };
  state.sprc.inventories.produced["hull-plate"] = 100;
  state.sprc.inventories.produced["machine-part"] = 100;
  state.industrial.factories = {};
  state.industrial.factories["test-works"] = {
    id: "test-works", name: "Test Works", institutionId: business.id, formerInstitutionId: parent.id,
    spinoutInstitutionId: business.id, completedRuns: 8, status: "available", activeRun: null,
    recipes: [{ output: "hull-plate", amount: 1, inputs: { "iron-nickel": 2 }, credits: 28, seconds: 24 }],
  };
  const cashBefore = parent.accounts.operating.balance + business.accounts.operating.balance;
  const ironBefore = parent.inventories["iron-nickel"] + business.inventories["iron-nickel"];
  createIndustrialProductionOperation({ state, now: () => 400_000 }).decide();
  assert.equal(business.inventories["iron-nickel"], 8);
  assert.equal(parent.inventories["iron-nickel"] + business.inventories["iron-nickel"], ironBefore);
  assert.equal(parent.accounts.operating.balance + business.accounts.operating.balance, cashBefore);
  assert.ok(business.accounts.operating.transactions.some((entry) => entry.type === "production-input-purchase"));
});

test("career and spinout records survive save and restore", () => {
  const previousStorage = globalThis.localStorage;
  const records = new Map();
  globalThis.localStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  };
  try {
    const state = createGameState();
    state.npcDevelopment.records.PERSON = { operatorId: "PERSON", stage: "bespoke", promotedAt: 12_000 };
    state.npcDevelopment.institutions.BUSINESS = { id: "BUSINESS", founderOperatorId: "PERSON", status: "independent" };
    saveProfile({ state, game: null, cargoHold: null });
    const restored = createGameState();
    loadSavedProfile(restored);
    assert.equal(restored.npcDevelopment.records.PERSON.stage, "bespoke");
    assert.equal(restored.npcDevelopment.institutions.BUSINESS.founderOperatorId, "PERSON");
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
