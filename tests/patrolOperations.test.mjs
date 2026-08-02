import assert from "node:assert/strict";
import test from "node:test";

import { FIRST_REACH_SETTLEMENTS } from "../src/content/economy/firstReachSettlements.js";
import { createInitialPatrolOperations, ensurePatrolOperations, getAvailablePatrolCraft, markPatrolCraftStatus } from "../src/systems/patrolOperations.js";

test("every settlement owns one funded, titled patrol craft", () => {
  const operations = createInitialPatrolOperations(100);
  assert.equal(Object.keys(operations).length, FIRST_REACH_SETTLEMENTS.length);
  FIRST_REACH_SETTLEMENTS.forEach((seed) => {
    const operation = operations[seed.institution.siteId];
    assert.equal(operation.institution.siteId, seed.institution.siteId);
    assert.ok(operation.institution.accounts.operating.balance > operation.institution.policies.protectedCash);
    assert.equal(operation.craft.ownerInstitutionId, operation.institution.id);
    assert.equal(operation.craft.publicIdentity.titleStatus, "active");
    assert.equal(operation.craft.publicIdentity.registrationStatus, "active");
    assert.ok(operation.craft.publicIdentity.authorizedActivities.includes("defend-jurisdiction"));
  });
});

test("a deployed or destroyed patrol craft cannot be conjured again", () => {
  const state = { logistics: { institutions: {} } };
  ensurePatrolOperations(state, 100);
  assert.ok(getAvailablePatrolCraft(state, "yard-exchange"));
  markPatrolCraftStatus(state, "yard-exchange", "deployed");
  assert.equal(getAvailablePatrolCraft(state, "yard-exchange"), null);
  markPatrolCraftStatus(state, "yard-exchange", "destroyed");
  assert.equal(getAvailablePatrolCraft(state, "yard-exchange"), null);
});

test("patrol institutions and chiefs join the common actor registry", () => {
  const state = { logistics: { institutions: {} } };
  const operations = ensurePatrolOperations(state, 100);
  const yard = operations["yard-exchange"];
  assert.equal(state.logistics.institutions[yard.institution.id], yard.institution);
  assert.equal(state.logistics.institutions[yard.controller.id], yard.controller);
});
