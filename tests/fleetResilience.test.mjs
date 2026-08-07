import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { buildFreightItinerary, createInitialLogisticsState, getNextFreightLeg } from "../src/systems/logistics.js";
import { createTransportationNetwork } from "../src/systems/transportationPlanning.js";
import { createFleetInsuranceManager } from "../src/systems/fleetInsurance.js";
import { createInitialTowServiceState, createTowServiceManager } from "../src/systems/towService.js";
import { acquireWreckForSprc, createWreckSalvageContract, registerOwnedWreck } from "../src/systems/wreckRegistry.js";
import { NpcShip } from "../src/entities/NpcShip.js";
import { inspectActor } from "../src/systems/actorInspector.js";

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

test("Nell claims an SPRC recovery job, delivers its titled wreck, and is paid by SPRC", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  state.towing = createInitialTowServiceState(1_000);
  state.sprc.account.balance = 20_000;
  state.sprc.operatingPlan.protectedCashReserve = 1_000;
  const wreck = registerOwnedWreck(state, { shipId: "lost-one", shipName: "Lost One", position: { x: 10, y: 10 }, cause: "incursion", identity: { ownerInstitutionId: "carrier:yard-hauler", titleStatus: "active" } });
  const acquired = acquireWreckForSprc(state, { wreckId: wreck.id, at: 1_000, recoveryFee: 480 });
  assert.ok(acquired);
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
  assert.equal(recovered.status, "delivered-for-dismantling");
  assert.equal(state.towing.institution.accounts.operating.balance, providerBefore + 480);
});

test("an installed fleet shield spends finite charge before hull and can recharge at a stop", () => {
  const route = [{ id: "a", position: { x: 0, y: 0 } }, { id: "b", position: { x: 100, y: 0 } }];
  const ship = new NpcShip({ id: "shield-test", name: "Shield Test", route, x: 0, y: 0 });
  ship.installShield({ maxCharge: 30 });
  ship.damage(20);
  assert.equal(ship.hull, 680);
  assert.equal(ship.shield.charge, 10);
  ship.damage(15);
  assert.equal(ship.hull, 675);
  assert.equal(ship.shield.charge, 0);
  assert.equal(ship.rechargeShield(12), 12);
  assert.equal(ship.shield.charge, 12);
});

test("a heavy hauler survives nineteen direct player weapon hits", () => {
  const route = [{ id: "a", position: { x: 0, y: 0 } }, { id: "b", position: { x: 100, y: 0 } }];
  const ship = new NpcShip({ id: "hull-test", name: "Hull Test", route, x: 0, y: 0 });
  for (let hit = 0; hit < 19; hit += 1) ship.damage(34);
  assert.equal(ship.hull, 34);
  assert.equal(ship.isAlive, true);
  ship.damage(34);
  assert.equal(ship.hull, 0);
  assert.equal(ship.isAlive, false);
});

test("a hauler uses the shared capacity portfolio for compatible freight manifests", () => {
  const route = [{ id: "yard-exchange", position: { x: 0, y: 0 } }, { id: "scrap-porch", position: { x: 100, y: 0 } }];
  const ship = new NpcShip({ id: "portfolio-hauler", name: "Portfolio Hauler", route, x: 0, y: 0 });

  assert.equal(ship.assignShipment({ shipmentId: "ship-iron", originSiteId: "yard-exchange", destinationSiteId: "scrap-porch", quantity: 7, route }), true);
  assert.equal(ship.assignShipment({ shipmentId: "ship-copper", originSiteId: "yard-exchange", destinationSiteId: "scrap-porch", quantity: 5, route }), true);
  assert.equal(ship.shipmentCommitments.length, 2);
  assert.equal(ship.activeShipmentId, "ship-iron", "the old singular field remains the active compatibility projection");
  assert.equal(ship.remainingCargoCapacity, 0);
  assert.equal(ship.assignShipment({ shipmentId: "overbooked", originSiteId: "yard-exchange", destinationSiteId: "scrap-porch", quantity: 1, route }), false);

  ship.clearShipment("ship-iron");
  assert.equal(ship.activeShipmentId, "ship-copper");
  assert.equal(ship.remainingCargoCapacity, 7);
  assert.equal(ship.assignShipment({ shipmentId: "wrong-lane", originSiteId: "yard-exchange", destinationSiteId: "the-ledge", quantity: 1, route }), false, "the proposed route must still contain its destination");
});

test("a hauler portfolio may hold independently owned cargo for different destinations", () => {
  const yard = { id: "yard-exchange", position: { x: 0, y: 0 } };
  const porch = { id: "scrap-porch", position: { x: 100, y: 0 } };
  const ledge = { id: "the-ledge", position: { x: 200, y: 0 } };
  const ship = new NpcShip({ id: "milk-run", name: "Milk Run", route: [yard, porch, ledge], x: 0, y: 0 });

  assert.equal(ship.assignShipment({ shipmentId: "to-porch", originSiteId: yard.id, destinationSiteId: porch.id, quantity: 5, route: [yard, porch, ledge] }), true);
  assert.equal(ship.assignShipment({ shipmentId: "to-ledge", originSiteId: yard.id, destinationSiteId: ledge.id, quantity: 4, route: [yard, porch, ledge] }), true);
  assert.equal(ship.shipmentCommitments.length, 2);
  assert.equal(ship.remainingCargoCapacity, 3);

  ship.clearShipment("to-porch");
  assert.equal(ship.remainingCargoCapacity, 8, "a delivery frees capacity for a pickup at that stop");
  assert.equal(ship.assignShipment({ shipmentId: "porch-pickup", originSiteId: porch.id, destinationSiteId: ledge.id, quantity: 6, route: [porch, ledge] }), true);
});

test("a freight itinerary visits the nearest delivery first and preserves every stop", () => {
  const destinations = [
    { id: "yard", position: { x: 0, y: 0 } },
    { id: "porch", position: { x: 100, y: 0 } },
    { id: "ledge", position: { x: 300, y: 0 } },
  ];
  const network = createTransportationNetwork({ destinations, connections: [
    { id: "yard-porch", fromId: "yard", toId: "porch", distance: 100, bidirectional: true },
    { id: "porch-ledge", fromId: "porch", toId: "ledge", distance: 200, bidirectional: true },
    { id: "yard-ledge", fromId: "yard", toId: "ledge", distance: 300, bidirectional: true },
  ] });

  const route = buildFreightItinerary({ network, startId: "yard", destinationIds: ["ledge", "porch"] });
  const stops = route.filter((site) => site.type !== "corridor-waypoint").map((site) => site.id);
  assert.deepEqual(stops, ["yard", "porch", "ledge"]);
  assert.deepEqual(getNextFreightLeg(route, ["porch", "ledge"]).map((site) => site.id), ["yard", "porch"],
    "physical dispatch ends at the first delivery so it becomes a real docked stop");
});

test("hauler inspection exposes manifests, capacity, and its next physical stop", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const actorId = "hauler-yard-scrap";
  const hauler = state.logistics.haulers[actorId];
  const yard = { id: "yard-exchange", position: { x: 0, y: 0 } };
  const porch = { id: "scrap-porch", position: { x: 100, y: 0 } };
  const ship = new NpcShip({ id: actorId, name: "Yard Hauler", route: [yard, porch], x: 0, y: 0 });
  ship.assignShipment({ shipmentId: "SHIP-A", originSiteId: yard.id, destinationSiteId: porch.id, quantity: 5, route: [yard, porch] });
  hauler.activeShipmentId = "SHIP-A";
  hauler.activeShipmentIds = ["SHIP-A"];
  state.logistics.shipments["SHIP-A"] = { id: "SHIP-A", containerId: "CONT-A", commodity: "iron-nickel", quantity: 5, destinationSiteId: porch.id, status: "loaded" };
  state.logistics.containers["CONT-A"] = { id: "CONT-A", ownerInstitutionId: "scrap-porch" };

  const view = inspectActor(state, actorId, { game: { npcShips: [ship], worldSites: [yard, porch] } });
  assert.equal(view.freightPortfolio.remainingCapacity, 7);
  assert.equal(view.freightPortfolio.nextStopId, porch.id);
  assert.deepEqual(view.freightPortfolio.plannedStops, [porch.id]);
  assert.equal(view.freightPortfolio.shipments[0].ownerInstitutionId, "scrap-porch");
});
