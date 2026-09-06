import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { inspectActor, listInspectableInfrastructure } from "../src/systems/actorInspector.js";
import { createInitialMiningState } from "../src/systems/miningOperation.js";

test("every drawn industrial and SPRC facility is an inspectable subject", () => {
  const state = createGameState();
  const facilities = listInspectableInfrastructure(state);

  assert.ok(facilities.some((facility) => facility.id === "facility:sprc-maw"));
  assert.ok(facilities.some((facility) => facility.id === "facility:sprc-berth-two"));
  assert.ok(facilities.some((facility) => facility.id === "yard-shipyard"));
  Object.keys(state.industrial.factories).forEach((id) => {
    assert.ok(facilities.some((facility) => facility.id === id), `${id} is inspectable`);
  });
});

test("a factory card reports durable totals and its recent real history", () => {
  const state = createGameState();
  const factory = state.industrial.factories["yard-plate-works"];
  factory.completedRuns = 7;
  factory.operatingHistory = { ordersAccepted: 3, contractedRevenue: 750, unitsProduced: 7, rawUnitsConsumed: 14 };
  state.ledger.recordEvent("industry.partsProduced", {
    factoryId: factory.id, institutionId: factory.institutionId, itemId: "hull-plate", units: 1,
  }, { message: "Yard Plate Works completed one hull plate." });

  const view = inspectActor(state, factory.id);
  assert.equal(view.kind, "parts factory");
  assert.equal(view.history.counts["Units produced"], 7);
  assert.equal(view.history.counts["Production runs"], 7);
  assert.equal(view.history.counts["Raw units consumed"], 14);
  assert.equal(view.history.counts["Open backlog units"], 0);
  assert.match(view.history.recent[0].message, /completed one hull plate/i);
});

test("ordinary actor cards also carry an event history", () => {
  const state = createGameState();
  state.ledger.recordEvent("delivery.completed", { actorInstitutionId: "yard-exchange" },
    { message: "Yard Exchange received a delivery." });
  const view = inspectActor(state, "yard-exchange");
  assert.equal(view.history.counts["Deliveries completed"], 1);
  assert.match(view.history.recent[0].message, /received a delivery/i);
});

test("the shipyard card reports durable operating totals rather than retained-event counts", () => {
  const state = createGameState();
  const yard = state.logistics.institutions["yard-shipyard"];
  yard.operatingHistory = { hullsCompleted: 12, hullsSold: 9, salesRevenue: 54_000 };
  yard.readyHulls = { "mining-craft": 1, "freight-craft": 2 };

  const view = inspectActor(state, yard.id);
  assert.equal(view.history.counts["Hulls completed"], 12);
  assert.equal(view.history.counts["Hulls sold"], 9);
  assert.equal(view.history.counts["Sales revenue"], 54_000);
  assert.equal(view.history.counts["Hulls ready"], 3);
});

test("a mining company card exposes durable throughput by resource", () => {
  const state = createGameState();
  state.miningOperations = { "cinder-contracting": createInitialMiningState(1_000) };
  const operation = state.miningOperations["cinder-contracting"];
  operation.throughput = {
    startedAt: 1_000, deliveries: 4, unitsDelivered: 21, revenue: 6_400,
    unitsByResource: { "iron-nickel": 12, silicate: 9 },
  };

  const view = inspectActor(state, operation.institution.id);
  assert.equal(view.history.counts["Mining runs completed"], 4);
  assert.equal(view.history.counts["Material delivered"], 21);
  assert.equal(view.history.counts["Delivered · iron nickel"], 12);
  assert.equal(view.history.counts["Delivered · silicate"], 9);
});
