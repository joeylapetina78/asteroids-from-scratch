import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { ACTOR_ROLE, getActorRecord, listActors } from "../src/systems/actorRegistry.js";
import { getHubActor } from "../src/systems/hubActors.js";
import { getPopulationLaborSummary, recruitPopulationLabor, releasePopulationLabor } from "../src/systems/populationLabor.js";

test("population labor is finite, assigned without erasing residents, and released explicitly", () => {
  const state = createGameState();
  const population = state.population.populations["population:the-ledge"];
  const before = getPopulationLaborSummary(state, population);
  const recruited = recruitPopulationLabor(state, {
    hubInstitutionId: "the-ledge", assignmentId: "employment:test-works", role: "factory-supervisor",
    workers: 4, employerInstitutionId: "the-ledge", assetId: "test-works", at: 1_000,
  });
  assert.equal(recruited.ok, true);
  assert.equal(population.size, 60, "employment does not remove residents from their community");
  assert.equal(getPopulationLaborSummary(state, population).available, before.available - 4);
  assert.equal(releasePopulationLabor(state, "employment:test-works", { at: 2_000 }), true);
  assert.equal(getPopulationLaborSummary(state, population).available, before.available);
});

test("recruited operators have identity, motivation, home and an asset charter", () => {
  const state = createGameState();
  const recruited = recruitPopulationLabor(state, {
    hubInstitutionId: "blue-lantern", assignmentId: "employment:lantern-cartage", role: "freight-operator",
    workers: 1, employerInstitutionId: "carrier:lantern-cartage", assetId: "hauler:lantern-one", at: 3_000,
    charter: { kind: "municipal-freight-charter" },
  });
  const operator = recruited.operator;
  assert.ok(operator.name.includes(" "));
  assert.ok(operator.motivation);
  assert.equal(operator.homeInstitutionId, "blue-lantern");
  assert.equal(operator.charter.assetId, "hauler:lantern-one");
  assert.equal(operator.charter.kind, "municipal-freight-charter");
  assert.equal(getActorRecord(state, operator.id), operator, "the operational person is a first-class indexed actor");
  assert.ok(listActors(state, { role: ACTOR_ROLE.CONTROLLER, domain: "population-labor" }).some((entry) => entry.id === operator.id));
  assert.equal(getHubActor(state, "blue-lantern").labor.assigned, 1, "the hub view exposes the live workforce commitment");
});

test("a population protects its community reserve from over-recruitment", () => {
  const state = createGameState();
  const summary = getPopulationLaborSummary(state, "population:deep-research");
  const first = recruitPopulationLabor(state, {
    hubInstitutionId: "deep-research", assignmentId: "employment:all-available", role: "factory-supervisor",
    workers: summary.available, createOperator: false,
  });
  const denied = recruitPopulationLabor(state, {
    hubInstitutionId: "deep-research", assignmentId: "employment:one-too-many", role: "freight-operator", workers: 1,
  });
  assert.equal(first.ok, true);
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "insufficient-labor");
  assert.ok(summary.communityReserve > 0);
});
