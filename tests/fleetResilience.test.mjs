import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createFleetInsuranceManager } from "../src/systems/fleetInsurance.js";
import { createInitialTowServiceState, createTowServiceManager } from "../src/systems/towService.js";
import { createWreckSalvageContract, registerOwnedWreck } from "../src/systems/wreckRegistry.js";
import { NpcShip } from "../src/entities/NpcShip.js";

test("fleet insurance transfers a bounded partial hull claim instead of granting a free replacement", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  let at = 1_000;
  const manager = createFleetInsuranceManager({ state, now: () => at });
  manager.update();
  const hauler = state.logistics.haulers["hauler-yard-scrap"];
  const carrier = state.logistics.institutions[hauler.carrierInstitutionId];
  const shipInstitution = state.logistics.institutions[hauler.shipInstitutionId];
  const before = carrier.accounts.operating.balance;
  const wreck = registerOwnedWreck(state, { shipId: "hauler-yard-scrap", shipName: "Yard Hauler", position: { x: 4, y: 5 }, cause: "incursion", identity: { ownerInstitutionId: shipInstitution.id, titleStatus: "active" } });
  state.ledger.recordEvent("wreck.created", { wreckId: wreck.id, ownerInstitutionId: shipInstitution.id }, { visible: false });
  at += 1;
  manager.update();
  const claim = Object.values(state.fleetInsurance.claims)[0];
  assert.ok(claim.paid > 0 && claim.paid < 6000);
  assert.equal(carrier.accounts.operating.balance, before + claim.paid);
  assert.ok(state.fleetInsurance.policies[carrier.id].premiumRate > 0.06);
});

test("Nell claims an open salvage job, delivers its titled wreck, and is paid by SPRC", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  state.towing = createInitialTowServiceState(1_000);
  state.sprc.account.balance = 20_000;
  state.sprc.operatingPlan.protectedCashReserve = 1_000;
  const wreck = registerOwnedWreck(state, { shipId: "lost-one", shipName: "Lost One", position: { x: 10, y: 10 }, cause: "incursion", identity: { ownerInstitutionId: "carrier:yard-hauler", titleStatus: "active" } });
  const definition = createWreckSalvageContract(state, { wreckId: wreck.id, rewardCredits: 480 });
  state.contracts.records[definition.id] = { ...definition, status: "offered" };
  let at = 1_000;
  let recovered = null;
  const manager = createTowServiceManager({ state, ships: [], destinations: [{ id: "scrap-porch", name: "Scrap Porch", position: { x: 0, y: 0 } }], now: () => at, onWreckRecovered: (record) => { recovered = record; } });
  const providerBefore = state.towing.institution.accounts.operating.balance;
  manager.update();
  assert.equal(state.contracts.records[definition.id].status, "active");
  const request = Object.values(state.towing.requests)[0];
  at = request.completesAt;
  manager.update();
  assert.equal(state.contracts.records[definition.id].status, "fulfilled");
  assert.equal(recovered.status, "salvaged");
  assert.equal(state.towing.institution.accounts.operating.balance, providerBefore + 480);
});

test("an installed fleet shield spends finite charge before hull and can recharge at a stop", () => {
  const route = [{ id: "a", position: { x: 0, y: 0 } }, { id: "b", position: { x: 100, y: 0 } }];
  const ship = new NpcShip({ id: "shield-test", name: "Shield Test", route, x: 0, y: 0 });
  ship.installShield({ maxCharge: 30 });
  ship.damage(20);
  assert.equal(ship.hull, 180);
  assert.equal(ship.shield.charge, 10);
  ship.damage(15);
  assert.equal(ship.hull, 175);
  assert.equal(ship.shield.charge, 0);
  assert.equal(ship.rechargeShield(12), 12);
  assert.equal(ship.shield.charge, 12);
});
