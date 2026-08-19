import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { loadSavedProfile, saveProfile } from "../src/systems/saveManager.js";
import {
  appendHubHistory,
  getHubActor,
  listHubActors,
  recordHubNeed,
  resolveHubNeed,
  transitionHubProject,
  upsertHubProject,
} from "../src/systems/hubActors.js";

test("all nine settlements expose one complete hub-actor surface", () => {
  const state = createGameState();
  const hubs = listHubActors(state, { at: 1_000 });
  assert.equal(hubs.length, 9);
  hubs.forEach((hub) => {
    assert.ok(hub.treasury, `${hub.name} exposes its treasury`);
    assert.ok(hub.inventory, `${hub.name} exposes its warehouse`);
    assert.ok(hub.population, `${hub.name} exposes its population relationship`);
    assert.ok(hub.assets.length >= 3, `${hub.name} exposes assets`);
    assert.ok(hub.capabilities.length > 0, `${hub.name} exposes capabilities`);
    assert.ok(hub.policies.institutional, `${hub.name} exposes policy`);
    assert.ok(Array.isArray(hub.projects));
    assert.ok(Array.isArray(hub.history));
  });
});

test("the unified view returns live authoritative records, not copied money or population", () => {
  const state = createGameState();
  const hub = getHubActor(state, "yard-exchange", { at: 1_000 });
  assert.equal(hub.treasury, state.logistics.institutions["yard-exchange"].accounts.operating);
  assert.equal(hub.inventory, state.logistics.institutions["yard-exchange"].inventories);
  assert.equal(hub.population, state.population.populations["population:yard-exchange"]);

  hub.treasury.balance -= 50;
  hub.inventory["iron-nickel"] += 2;
  hub.population.householdCash -= 25;
  assert.equal(state.logistics.institutions["yard-exchange"].accounts.operating.balance, 49_950);
  assert.equal(state.logistics.institutions["yard-exchange"].inventories["iron-nickel"], 6);
  assert.equal(state.population.populations["population:yard-exchange"].householdCash, 39_975);
});

test("facilities and operational needs appear and disappear with their domain records", () => {
  const state = createGameState();
  const populationNeed = state.population.populations["population:yard-exchange"].needs["life-support-pack"];
  populationNeed.backlog = 2;
  populationNeed.unmetSince = 900;
  state.hubProcurement.orders["PO-TEST"] = {
    id: "PO-TEST", buyerInstitutionId: "yard-exchange", resourceId: "water-ice",
    units: 6, deliveredUnits: 1, status: "offered", createdAt: 950,
  };

  let hub = getHubActor(state, "yard-exchange", { at: 1_000 });
  assert.ok(hub.facilities.some((facility) => facility.id === "yard-plate-works"));
  assert.ok(hub.needs.some((need) => need.id.includes("life-support-pack") && need.shortage === 2));
  assert.ok(hub.needs.some((need) => need.id === "procurement-need:PO-TEST" && need.shortage === 5));

  delete state.industrial.factories["yard-plate-works"];
  state.hubProcurement.orders["PO-TEST"].status = "delivered";
  populationNeed.backlog = 0;
  hub = getHubActor(state, "yard-exchange", { at: 1_100 });
  assert.equal(hub.facilities.some((facility) => facility.id === "yard-plate-works"), false);
  assert.equal(hub.needs.some((need) => need.id === "procurement-need:PO-TEST"), false);
  assert.equal(hub.needs.some((need) => need.id.includes("life-support-pack")), false);
});

test("generic needs, projects and history belong to the durable institution", () => {
  const state = createGameState();
  const need = recordHubNeed(state, "blue-lantern", {
    kind: "freight-capacity", urgency: "urgent", shortage: 1,
  }, 2_000);
  const project = upsertHubProject(state, "blue-lantern", {
    kind: "commission-hauler", name: "Lantern Municipal Freight I", needId: need.id,
  }, 2_100);
  transitionHubProject(state, "blue-lantern", project.id, "funded", { committedCredits: 3_500 }, 2_200);
  resolveHubNeed(state, "blue-lantern", need.id, { projectId: project.id }, 2_300);
  appendHubHistory(state, "blue-lantern", { type: "test.observed", detail: { note: "still the same institution" } }, 2_400);

  const hub = getHubActor(state, "blue-lantern", { at: 2_500 });
  assert.equal(hub.projects[0].status, "funded");
  assert.equal(hub.projects[0].committedCredits, 3_500);
  assert.equal(hub.durable.needs[need.id].status, "resolved");
  assert.ok(hub.history.some((entry) => entry.type === "hub.projectTransitioned"));
  assert.ok(hub.history.some((entry) => entry.type === "test.observed"));
});

test("the economic slices behind a hub survive save and restore together", () => {
  const previousStorage = globalThis.localStorage;
  const records = new Map();
  globalThis.localStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  };
  try {
    const state = createGameState();
    state.population.populations["population:yard-exchange"].householdCash = 12_345;
    state.hubProcurement.orders["PO-SAVED"] = { id: "PO-SAVED", buyerInstitutionId: "yard-exchange", status: "offered", units: 2 };
    state.industrial.factories["yard-plate-works"].completedRuns = 7;
    state.relationships = { projections: { "yard-exchange=>the-ledge": { id: "yard-exchange=>the-ledge", fromId: "yard-exchange", toId: "the-ledge", trust: 0.4 } } };
    upsertHubProject(state, "yard-exchange", { id: "project:saved", kind: "test", status: "funded" }, 3_000);
    saveProfile({ state, game: null, cargoHold: null });

    const restored = createGameState();
    loadSavedProfile(restored);
    const hub = getHubActor(restored, "yard-exchange", { at: 4_000 });
    assert.equal(hub.population.householdCash, 12_345);
    assert.equal(hub.domain.purchaseOrders.some((order) => order.id === "PO-SAVED"), true);
    assert.equal(restored.industrial.factories["yard-plate-works"].completedRuns, 7);
    assert.equal(hub.relationships[0].trust, 0.4);
    assert.equal(hub.projects.some((project) => project.id === "project:saved"), true);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
