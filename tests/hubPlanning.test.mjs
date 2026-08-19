import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { getHubActor, recordHubNeed } from "../src/systems/hubActors.js";
import { HUB_RESPONSE_KIND, createHubPlanningOperation, planHubNeed } from "../src/systems/hubPlanning.js";

function option(kind, extra = {}) {
  return { id: `option:${kind}`, kind, ...extra };
}

test("the planner records every considered response and selects the highest feasible one", () => {
  const state = createGameState();
  const hub = state.logistics.institutions["ore-station-one"];
  hub.inventories.aluminum = 8;
  const need = recordHubNeed(state, hub.id, {
    id: "need:test-factory", kind: "industrial-capacity", urgency: "urgent", purpose: "growth",
    responseOptions: [
      option(HUB_RESPONSE_KIND.BUILD, { capabilityId: "commission-parts-factory", priority: 100,
        requirements: { credits: 900, labor: 4, materials: { aluminum: 3 }, durationSeconds: 60 } }),
      option(HUB_RESPONSE_KIND.IMPORT, { capabilityId: "procure-input", priority: 50 }),
      option(HUB_RESPONSE_KIND.DELAY, { priority: 10 }),
    ],
  }, 1_000);
  const project = planHubNeed(state, hub.id, need.id, 1_100);
  assert.equal(project.responseKind, HUB_RESPONSE_KIND.BUILD);
  assert.equal(project.status, "planned");
  assert.equal(project.decision.candidates.length, 3);
  assert.equal(project.decision.candidates.find((candidate) => candidate.kind === HUB_RESPONSE_KIND.BUILD).feasible, true);
  assert.equal(getHubActor(state, hub.id).planning.decisions[0], project.decision);
});

test("an attractive response remains visible when money, material or labor blocks it", () => {
  const state = createGameState();
  const hub = state.logistics.institutions["the-ledge"];
  hub.accounts.operating.balance = 100;
  hub.inventories.silicate = 0;
  recordHubNeed(state, hub.id, {
    id: "need:blocked-build", kind: "industrial-capacity", urgency: "urgent",
    responseOptions: [
      option(HUB_RESPONSE_KIND.BUILD, { capabilityId: "commission-parts-factory", priority: 100,
        requirements: { credits: 900, labor: 99, materials: { silicate: 3 } } }),
      option(HUB_RESPONSE_KIND.IMPORT, { capabilityId: "procure-input", priority: 50 }),
    ],
  }, 2_000);
  const project = planHubNeed(state, hub.id, "need:blocked-build", 2_100);
  assert.equal(project.responseKind, HUB_RESPONSE_KIND.IMPORT);
  const build = project.decision.candidates.find((candidate) => candidate.kind === HUB_RESPONSE_KIND.BUILD);
  assert.deepEqual(new Set(build.blockers.map((blocker) => blocker.kind)),
    new Set(["insufficient-cash", "insufficient-labor", "insufficient-material"]));
});

test("institutional temperament can make equally feasible hubs choose differently", () => {
  const state = createGameState();
  ["ore-station-one", "morrow-shoal"].forEach((hubId) => recordHubNeed(state, hubId, {
    id: `need:${hubId}:choice`, kind: "capacity", urgency: "routine", purpose: "growth",
    responseOptions: [
      option(HUB_RESPONSE_KIND.BUILD, { id: `${hubId}:build`, capabilityId: "commission-parts-factory" }),
      option(HUB_RESPONSE_KIND.IMPORT, { id: `${hubId}:import`, capabilityId: "procure-input" }),
    ],
  }, 3_000));
  assert.equal(planHubNeed(state, "ore-station-one", "need:ore-station-one:choice", 3_100).responseKind, HUB_RESPONSE_KIND.BUILD);
  assert.equal(planHubNeed(state, "morrow-shoal", "need:morrow-shoal:choice", 3_100).responseKind, HUB_RESPONSE_KIND.IMPORT);
});

test("all seven institutional response kinds are valid planner outcomes", () => {
  Object.values(HUB_RESPONSE_KIND).forEach((kind, index) => {
    const state = createGameState();
    const hubId = "yard-exchange";
    const needId = `need:response:${kind}`;
    recordHubNeed(state, hubId, {
      id: needId, kind: "test", responseOptions: [option(kind, {
        id: `${needId}:only`, allowDebt: kind === HUB_RESPONSE_KIND.BORROW,
      })],
    }, 4_000 + index);
    assert.equal(planHubNeed(state, hubId, needId, 5_000 + index).responseKind, kind);
  });
});

test("the operation plans durable open needs without domain-specific code", () => {
  const state = createGameState();
  recordHubNeed(state, "blue-lantern", {
    id: "need:generic", kind: "unknown-future-domain", urgency: "routine",
    responseOptions: [option(HUB_RESPONSE_KIND.DELAY)],
  }, 6_000);
  createHubPlanningOperation({ state, now: () => 6_100 }).decide();
  assert.equal(state.logistics.institutions["blue-lantern"].hubState.needs["need:generic"].selectedResponseKind,
    HUB_RESPONSE_KIND.DELAY);
});
