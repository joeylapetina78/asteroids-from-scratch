// Step one of retiring the authored scaffolding: an order exists because a hub
// has a real gap, and a transfer pays the institution that supplied it.

import assert from "node:assert/strict";
import test from "node:test";
import {
  TRADED_FAMILIES,
  getFamilyConsumptionRates,
  getFamilyIncoming,
  getFamilyOnHand,
  getFamilyTargets,
  getImportFamilies,
  getInventoryPosition,
  getMinedFamilies,
} from "../src/systems/hubInventory.js";
import { STANDING_MINING_ORDERS, createMiningOperation, getPostedMiningOrders } from "../src/systems/miningOperation.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState, createLogisticsManager } from "../src/systems/logistics.js";
import { createHubProcurementOperation } from "../src/systems/hubProcurement.js";
import { getResourceFamily } from "../src/systems/resourceDefinitions.js";
import { DIAGNOSTIC_STATE, getDiagnostic } from "../src/systems/diagnostics.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const game = {
    worldSites: [
      { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
    ],
    addWorkerShip: () => {},
  };
  return { state, game, hub: (id) => state.logistics.institutions[id] };
}

// ── Targets come from consumption, not from an author ──────────────────────

test("a hub's target for a family is derived from what its population consumes", () => {
  const rates = getFamilyConsumptionRates("yard-exchange");
  TRADED_FAMILIES.forEach((family) => assert.ok(rates[family] > 0, `${family} is consumed`));
  // Life-Support Packs are volatile-only, so volatile carries a whole need's
  // rate while structural and industrial split theirs.
  assert.ok(rates.volatile > rates.structural, "volatile demand is the heaviest");
  const targets = getFamilyTargets("yard-exchange");
  assert.ok(targets.volatile > targets.structural);
  assert.ok(Object.values(targets).every((value) => Number.isInteger(value) && value > 0));
});

test("a hub with no population has nothing to stock for", () => {
  const rates = getFamilyConsumptionRates("carrier:yard-hauler");
  assert.ok(Object.values(rates).every((rate) => rate === 0));
});

test("on-hand counts the effective yield of every material in the family", () => {
  const { hub } = createWorld();
  const yard = hub("yard-exchange");
  yard.inventories = { "iron-nickel": 2, aluminum: 3, titanium: 1, "water-ice": 9 };
  assert.equal(getResourceFamily("aluminum"), "structural");
  assert.equal(getFamilyOnHand(yard, "structural"), 7.5,
    "two baseline iron + three higher-yield aluminum + one default titanium");
  assert.equal(getFamilyOnHand(yard, "volatile"), 9);
});

test("material already promised counts as incoming, so a gap is not ordered twice", () => {
  const { state } = createWorld();
  state.logistics.shipments = {
    "SHIP-1": { status: "loaded", destinationInstitutionId: "yard-exchange", commodity: "water-ice", quantity: 4 },
    "SHIP-2": { status: "delivered", destinationInstitutionId: "yard-exchange", commodity: "water-ice", quantity: 9 },
    "SHIP-3": { status: "loaded", destinationInstitutionId: "the-ledge", commodity: "water-ice", quantity: 5 },
  };
  assert.equal(getFamilyIncoming(state, "yard-exchange", "volatile"), 4,
    "only shipments still in flight to this hub count");
});

test("the gap is what is missing after stock and inbound are counted", () => {
  const { state, hub } = createWorld();
  hub("yard-exchange").inventories = { "iron-nickel": 2 };
  const position = getInventoryPosition(state, "yard-exchange", "structural");
  assert.equal(position.onHand, 2);
  assert.equal(position.gap, position.target - position.onHand - position.incoming);
  assert.ok(position.gap > 0);

  hub("yard-exchange").inventories = { "iron-nickel": 500 };
  assert.equal(getInventoryPosition(state, "yard-exchange", "structural").gap, 0, "a full shelf wants nothing");
});

test("the families a hub must import are the ones it may not mine", () => {
  const { state } = createWorld();
  assert.deepEqual(getMinedFamilies("yard-exchange"), ["structural"]);
  const imports = getImportFamilies(state, "yard-exchange").map((entry) => entry.family).sort();
  assert.deepEqual(imports, ["industrial", "volatile"], "Yard Exchange has to buy both of these");
});

// ── Orders exist only because of a gap ─────────────────────────────────────

test("a hub posts no mining order when it has everything it needs", () => {
  const { state, hub } = createWorld();
  STANDING_MINING_ORDERS.forEach((definition) => {
    hub(definition.buyerInstitutionId).inventories[definition.resourceId] = 500;
  });
  assert.deepEqual(getPostedMiningOrders(state), {}, "no need, no order");
});

test("a hub short of material posts an order sized to the gap", () => {
  const { state, hub } = createWorld();
  hub("yard-exchange").inventories = { "iron-nickel": 0 };
  const posted = getPostedMiningOrders(state)["mine-yard-iron"];
  assert.ok(posted, "the order exists because the shelf is empty");
  assert.ok(posted.amount > 0 && posted.amount <= posted.inventory.gap);
  assert.ok(posted.valuation.reasons.length > 0, "and it can say why it is priced that way");
});

test("scarcity raises the price a hub is willing to pay", () => {
  const { state, hub } = createWorld();
  hub("yard-exchange").inventories = { "iron-nickel": 0 };
  const desperate = getPostedMiningOrders(state)["mine-yard-iron"];
  hub("yard-exchange").inventories = { "iron-nickel": 5 };
  const comfortable = getPostedMiningOrders(state)["mine-yard-iron"];
  assert.ok(comfortable, "a smaller gap is still an order");
  assert.ok(desperate.paymentPerUnit > comfortable.paymentPerUnit,
    `empty shelf ${desperate.paymentPerUnit} should beat partly stocked ${comfortable.paymentPerUnit}`);
});

test("a hub that cannot fund an order withholds it instead of draining its treasury", () => {
  const { state, hub } = createWorld();
  hub("yard-exchange").inventories = { "iron-nickel": 0 };
  hub("yard-exchange").accounts.operating.balance = 10;
  const posted = getPostedMiningOrders(state)["mine-yard-iron"];
  assert.equal(posted.withheld, "buyer-cannot-fund");
  assert.equal(posted.amount, 0, "and no supplier can take it");
  assert.equal(hub("yard-exchange").accounts.operating.balance, 10, "the treasury is untouched");
});

test("workers are only offered orders a hub is actually asking for", () => {
  const { state, game, hub } = createWorld();
  STANDING_MINING_ORDERS.forEach((definition) => {
    hub(definition.buyerInstitutionId).inventories[definition.resourceId] = 500;
  });
  const mining = createMiningOperation({ state, game, now: () => 1_000 });
  const onStandingOrders = mining.workers.filter((worker) => worker.assignment
    && STANDING_MINING_ORDERS.some((definition) => definition.id === worker.assignment.contractId));
  assert.equal(onStandingOrders.length, 0, "a fully stocked economy generates no mining work");
});

// ── A transfer pays the institution that supplied it ───────────────────────

function createFreightWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  // Freight is no longer authored: it exists because a hub bought something.
  ["yard-exchange", "scrap-forge", "the-ledge"].forEach((id) => {
    state.logistics.institutions[id].accounts.operating.balance = 20_000;
  });
  state.logistics.institutions["yard-exchange"].inventories["iron-nickel"] = 40;
  state.logistics.institutions["scrap-forge"].inventories["water-ice"] = 40;
  state.logistics.institutions["the-ledge"].inventories.silicate = 40;
  const procurement = createHubProcurementOperation({ state, now: () => 1_000 });
  procurement.update();
  const ships = Object.keys(state.logistics.haulers).map((id) => ({
    id, dockedSiteId: state.logistics.haulers[id].currentSiteId, wear: 0,
    operationalStatus: "seeking-work", activeShipmentId: null, assignment: null,
    transfers: [],
    canAcceptRoute: () => true,
    assignShipment(assignment) { this.assignment = assignment; return true; },
    queueCargoTransfer(transfer) { this.transfers.push(transfer); },
    clearShipment() { this.assignment = null; },
  }));
  const manager = createLogisticsManager({
    state, ships, now: () => 1_000,
    onProcurementShipped: (orderId, shipmentId) => procurement.markShipped(orderId, shipmentId),
    onProcurementDelivered: (orderId, settlement) => procurement.completeOrder(orderId, settlement),
  });
  return { state, manager, ships, procurement };
}

test("a buyer that cannot cover goods plus freight makes no shipment at all", () => {
  const { state, manager } = createFreightWorld();
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (institution.accounts?.operating) institution.accounts.operating.balance = 5;
  });
  const stockBefore = Object.fromEntries(Object.entries(state.logistics.institutions)
    .map(([id, institution]) => [id, { ...(institution.inventories ?? {}) }]));
  manager.update();
  assert.equal(Object.keys(state.logistics.shipments).length, 0, "nothing was shipped");
  Object.entries(stockBefore).forEach(([id, inventories]) => {
    assert.deepEqual(state.logistics.institutions[id].inventories ?? {}, inventories,
      `${id} kept its material rather than giving it away unpaid`);
  });
});

// Payment for goods now happens when title transfers, before a carrier is
// involved at all — see hubProcurement.test.mjs. What freight must still do is
// move property without buying it again.
test("a carrier moving prepaid cargo does not buy it a second time", () => {
  const { state, manager } = createFreightWorld();
  manager.update();
  Object.values(state.logistics.shipments).forEach((shipment) => {
    if (!shipment.prepaid) return;
    assert.equal(shipment.goodsPayment, 0, "prepaid cargo is not re-purchased");
    assert.ok(shipment.payment > 0, "but the carrier is still paid to haul it");
    assert.ok(shipment.manifestId, "and it moves under a manifest");
  });
});

// ── Carriers spin up and down with the work ────────────────────────────────

function createCarrierWorld({ regionalHaulerFloor = 0 } = {}) {
  let clock = 1_000_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (institution.accounts?.operating) institution.accounts.operating.balance = 20_000;
  });
  state.hubProcurement = { counter: 1, asks: {}, unavailable: {}, orders: {} };
  const ships = Object.keys(state.logistics.haulers).map((id) => ({
    id, dockedSiteId: state.logistics.haulers[id].currentSiteId, wear: 0,
    operationalStatus: "seeking-work", activeShipmentId: null, assignment: null, transfers: [],
    canAcceptRoute: () => true, assignShipment() { return true; },
    queueCargoTransfer() {}, clearShipment() {},
  }));
  const commissioned = [];
  const manager = createLogisticsManager({
    state, ships, now: () => clock,
    commissionHauler: (spec) => {
      const ship = { id: spec.id, name: spec.name, isAlive: true, dockedSiteId: spec.homeSiteId, canAcceptRoute: () => true, assignShipment() { return true; }, queueCargoTransfer() {}, clearShipment() {} };
      commissioned.push(ship);
      return ship;
    },
    regionalHaulerFloor,
  });
  return { state, manager, ships, commissioned, advance: (seconds) => { clock += seconds * 1000; } };
}

function addReadyFreight(state) {
  // Fleet growth is demand-led: seed one real, prepaid, loadable purchase
  // rather than treating occupied ships alone as a reason to buy another.
  state.hubProcurement.orders["TEST-READY"] = {
    id: "TEST-READY", status: "ready", buyerInstitutionId: "scrap-forge",
    supplierInstitutionId: "yard-exchange", resourceId: "iron-nickel",
    family: "structural", units: 2, deliveredUnits: 0, freightBudget: 500,
  };
  state.logistics.institutions["yard-exchange"].awaitingPickup = {
    "TEST-READY": { units: 2, resourceId: "iron-nickel", ownerInstitutionId: "scrap-forge" },
  };
}

const busy = (state) => Object.entries(state.logistics.haulers).forEach(([shipId, hauler]) => {
  const shipmentId = `SHIP-BUSY-${shipId}`;
  state.logistics.shipments[shipmentId] = {
    id: shipmentId, status: "assigned", assigneeType: "npc", assigneeId: shipId,
  };
  hauler.activeShipmentIds = [shipmentId];
  hauler.activeShipmentId = shipmentId;
});
const idle = (state) => Object.values(state.logistics.haulers).forEach((hauler) => {
  (hauler.activeShipmentIds ?? []).forEach((shipmentId) => {
    if (shipmentId.startsWith("SHIP-BUSY-")) delete state.logistics.shipments[shipmentId];
  });
  hauler.activeShipmentIds = [];
  hauler.activeShipmentId = null;
  hauler.activeMovementId = null;
});

test("a carrier puts another ship into service when its own are all committed", () => {
  const world = createCarrierWorld();
  addReadyFreight(world.state);
  const before = Object.keys(world.state.logistics.haulers).length;
  busy(world.state);
  world.manager.update();
  world.advance(61);
  busy(world.state);
  world.manager.update();
  assert.ok(Object.keys(world.state.logistics.haulers).length > before, "the fleet grew");
  assert.ok(world.commissioned.length > 0, "and the world was asked to build a hull");
  const hired = world.state.ledger.getEventsAfterId(0).filter((entry) => entry.type === "carrier.haulerHired");
  assert.ok(hired.length > 0);
  assert.ok(hired[0].payload.cost > 0, "with what it cost");
  assert.equal(hired[0].payload.maintenanceReserve, 3_000, "with its first repair funded");
  assert.ok(hired[0].payload.initialWear > 0, "and a believable used-craft condition");
  const hiredCarrier = world.state.logistics.institutions[hired[0].payload.carrierInstitutionId];
  assert.ok(hiredCarrier.maintenanceEscrow >= 3_000);
});

test("a moment of everyone being busy does not buy a ship", () => {
  const world = createCarrierWorld();
  addReadyFreight(world.state);
  const before = Object.keys(world.state.logistics.haulers).length;
  busy(world.state);
  world.manager.update();
  world.advance(40);
  idle(world.state);            // the run is broken
  world.manager.update();
  world.advance(40);
  busy(world.state);
  world.manager.update();
  assert.equal(Object.keys(world.state.logistics.haulers).length, before, "the clock restarted");
});

test("a carrier that cannot pay does not commission a ship", () => {
  const world = createCarrierWorld();
  addReadyFreight(world.state);
  const before = Object.keys(world.state.logistics.haulers).length;
  Object.values(world.state.logistics.institutions).forEach((institution) => {
    if (institution.accounts?.operating) institution.accounts.operating.balance = 5;
  });
  busy(world.state);
  world.manager.update();
  world.advance(61);
  busy(world.state);
  world.manager.update();
  assert.equal(Object.keys(world.state.logistics.haulers).length, before, "no hull appeared");
});

test("a carrier lays up a ship with nothing to carry", () => {
  const world = createCarrierWorld();
  const before = Object.keys(world.state.logistics.haulers).length;
  idle(world.state);
  world.manager.update();
  world.advance(121);
  idle(world.state);
  world.manager.update();
  assert.ok(Object.keys(world.state.logistics.haulers).length < before, "the fleet shrank");
  const laidUp = world.state.ledger.getEventsAfterId(0).filter((entry) => entry.type === "carrier.haulerLaidUp");
  assert.ok(laidUp.length > 0);
  assert.ok(laidUp[0].payload.idleSeconds >= 120, "and says how long it sat");
  assert.equal(getDiagnostic(world.state, laidUp[0].payload.haulerId)?.state, DIAGNOSTIC_STATE.RETIRED, "its current diagnostic is retired");
});

test("busy ships without a waiting freight backlog do not create speculative capacity", () => {
  const world = createCarrierWorld();
  const before = Object.keys(world.state.logistics.haulers).length;
  busy(world.state);
  world.manager.update();
  world.advance(121);
  busy(world.state);
  world.manager.update();
  assert.equal(Object.keys(world.state.logistics.haulers).length, before);
  assert.equal(world.commissioned.length, 0);
});

test("the region never runs out of haulers", () => {
  const world = createCarrierWorld();
  for (let round = 0; round < 10; round += 1) {
    idle(world.state);
    world.manager.update();
    world.advance(121);
    world.manager.update();
  }
  assert.ok(Object.keys(world.state.logistics.haulers).length >= 1, "somebody is always left to haul");
});

test("hub-sponsored haulers launch with varied condition and a funded repair cycle", () => {
  const world = createCarrierWorld({ regionalHaulerFloor: 8 });
  world.manager.update();
  const sponsored = Object.values(world.state.logistics.institutions)
    .filter((institution) => institution.sponsoredByInstitutionId);
  assert.ok(sponsored.length >= 1);
  assert.equal(Object.keys(world.state.logistics.haulers).length, 8,
    "the regional floor is filled exactly instead of triggering speculative births");
  const sponsorsByHub = new Map();
  sponsored.forEach((carrier) => {
    sponsorsByHub.set(carrier.sponsoredByInstitutionId, (sponsorsByHub.get(carrier.sponsoredByInstitutionId) ?? 0) + 1);
    assert.ok(carrier.accounts.operating.balance >= 5_000, "the carrier is economically alive at launch");
    assert.ok(carrier.maintenanceEscrow >= 3_000, "one repair cycle is explicitly reserved");
    assert.ok(carrier.accounts.operating.balance - carrier.policies.transportation.minimumOperatingCash >= 3_000,
      "the reserve does not make repair money unspendable");
    const operator = world.state.logistics.institutions[carrier.controllerInstitutionId];
    assert.ok(operator?.name && !operator.name.startsWith("Hub Dispatcher"), "the operator has a personal identity");
    assert.ok(operator?.motivation, "the operator has an economic motivation");
  });
  assert.ok([...sponsorsByHub.values()].every((count) => count <= 1), "no hub creates a local swarm");
  assert.equal(new Set(sponsored.map((carrier) => world.state.logistics.institutions[carrier.controllerInstitutionId].name)).size,
    sponsored.length, "sponsored firms do not share a cloned proprietor");
  const startingWear = sponsored.map((carrier) => Object.values(world.state.logistics.institutions)
    .find((institution) => institution.controllerInstitutionId === carrier.id && institution.archetypeId === "cargo-ship")?.wear);
  assert.ok(startingWear.every((wear) => wear > 0 && wear < 2), "generated craft are used but serviceable");
  assert.ok(new Set(startingWear).size > 1, "the generated fleet does not share one artificial condition");
});

test("the frontier publishes a second maintenance destination", () => {
  const state = createInitialLogisticsState(1_000);
  assert.equal(state.institutions["ore-station-service"].siteId, "ore-station-one");
  assert.ok(state.institutions["ore-station-service"].accounts.operating.balance > 0);
});

test("regional freight waiting prevents idle haulers from being laid up", () => {
  const world = createCarrierWorld();
  addReadyFreight(world.state);
  idle(world.state);
  const before = Object.keys(world.state.logistics.haulers).length;
  world.manager.update();
  world.advance(121);
  idle(world.state);
  world.manager.update();
  assert.equal(Object.keys(world.state.logistics.haulers).length, before);
  assert.equal(world.state.ledger.getEventsAfterId(0).filter((event) => event.type === "carrier.haulerLaidUp").length, 0);
});
