import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { terminateDestroyedActor } from "../src/systems/actorLifecycle.js";

test("destroying an actor closes mining, movement, tow, commitment, and diagnostic state", () => {
  const state = createGameState();
  state.diagnostics = { actors: {} };
  state.miningOperations = { mine: { ships: { craft: { id: "craft", status: "returning-service" } }, allocations: { a: { workerShipId: "craft", status: "active" } } } };
  state.logistics = {
    haulers: { craft: { shipInstitutionId: "ship:craft", carrierInstitutionId: "carrier", activeShipmentId: "shipment", activeMovementId: "move", status: "returning-maintenance" } },
    movements: { move: { id: "move", status: "active" } },
    institutions: { carrier: { id: "carrier", accounts: { operating: { balance: 1000, committed: 300 } } }, "ship:craft": { id: "ship:craft", operationalStatus: "returning" } },
  };
  state.towing = { vehicle: { status: "dispatched" }, requests: { tow: { id: "tow", haulerId: "craft", carrierInstitutionId: "carrier", committedPayment: 300, status: "dispatched" } } };
  state.diagnostics.actors.craft = { actorId: "craft", state: "blocked", blocker: { kind: "service" } };
  const ship = { id: "craft", name: "Craft", assignment: {}, serviceReturn: {}, deliveryBlock: {}, targetAsteroid: {}, miningDisabled: false, state: "returning-service", activeShipmentId: "shipment", activeTowRequestId: "tow", operationalStatus: "being-towed" };

  const result = terminateDestroyedActor(state, ship, { at: 500 });
  assert.deepEqual(result, { allocations: 1, movements: 1, towRequests: 1 });
  assert.equal(state.miningOperations.mine.allocations.a.status, "released");
  assert.equal(state.logistics.movements.move.status, "interrupted");
  assert.equal(state.towing.requests.tow.status, "canceled");
  assert.equal(state.logistics.institutions.carrier.accounts.operating.committed, 0);
  assert.equal(state.towing.vehicle.status, "available");
  assert.equal(ship.state, "destroyed");
  assert.equal(ship.assignment, null);
  assert.equal(state.diagnostics.actors.craft.state, "retired");
});
