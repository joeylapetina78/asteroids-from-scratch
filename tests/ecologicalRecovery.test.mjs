import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createEcologicalRecoveryOperation, isEcologicalRecoveryCandidate } from "../src/systems/ecologicalRecovery.js";

function pickup(type, x = 400, y = -180) {
  return { type, age: 100, sourceClaimId: null, position: { x, y }, velocity: { x: 0, y: 0 }, radius: 8, quantity: 1 };
}

function world() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1000);
  const added = [];
  const game = {
    pickups: Array.from({ length: 8 }, (unused, index) => pickup("iron-nickel", 500 + index * 5)),
    worldSites: [{ id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } }],
    addWorkerShip: (ship) => added.push(ship),
  };
  return { state, game, added };
}

test("ecological recovery only claims abandoned bulk material", () => {
  assert.ok(isEcologicalRecoveryCandidate(pickup("iron-nickel")));
  assert.equal(isEcologicalRecoveryCandidate(pickup("anomaly-shard")), false);
  assert.equal(isEcologicalRecoveryCandidate(pickup("rockmoss-crawler")), false);
  assert.equal(isEcologicalRecoveryCandidate({ ...pickup("water-ice"), age: 2 }), false);
});

test("a hub commissions an owned physical collector for a real abandoned field", () => {
  const { state, game, added } = world();
  const before = state.logistics.institutions["yard-exchange"].accounts.operating.balance;
  const recovery = createEcologicalRecoveryOperation({ state, game, now: () => 5000 });
  recovery.update();
  assert.equal(added.length, 1);
  assert.equal(added[0].assignment.recoveryOnly, true);
  assert.equal(added[0].assignment.resourceId, "iron-nickel");
  const record = Object.values(state.ecologicalRecovery.ships)[0];
  assert.equal(record.ownerInstitutionId, "yard-exchange");
  assert.equal(before - state.logistics.institutions["yard-exchange"].accounts.operating.balance, 6000);
  assert.equal(Object.values(state.ecologicalRecovery.commissions)[0].status, "active");
});

test("a hub reuses its permanent collector instead of buying another hull", () => {
  const { state, game, added } = world();
  const recovery = createEcologicalRecoveryOperation({ state, game, now: () => 5000 });
  recovery.update();
  const craft = added[0];
  craft.cargo["iron-nickel"] = 6;
  craft.deliver();

  recovery.update();

  assert.equal(added.length, 1, "the owned hull remains the hub's recovery capacity");
  assert.ok(craft.assignment, "the empty collector received the next field assignment");
  assert.equal(craft.assignment.resourceId, "iron-nickel");
});

test("a free collector with retained cargo returns it before the hub commissions again", () => {
  const { state, game, added } = world();
  const recovery = createEcologicalRecoveryOperation({ state, game, now: () => 5000 });
  recovery.update();
  const craft = added[0];
  craft.releaseAssignment("field-interrupted");
  craft.cargo["iron-nickel"] = 2;

  recovery.update();

  assert.equal(added.length, 1, "partial cargo does not make an owned ship disappear from capacity planning");
  assert.ok(craft.assignment, "the collector was ordered home to unload");
  assert.equal(craft.assignment.destinationSiteId, "yard-exchange");
  assert.equal(craft.assignment.quantity, 2);
});
