// Step one of retiring the authored scaffolding: an order exists because a hub
// has a real gap, and a transfer pays the institution that supplied it.

import assert from "node:assert/strict";
import test from "node:test";
import {
  TRADED_FAMILIES,
  ANOMALY_SITE_SESSION_QUOTA,
  getFamilyConsumptionRates,
  getFamilyIncoming,
  getFamilyOnHand,
  getFamilyTargets,
  getImportFamilies,
  getInventoryPosition,
  getMinedFamilies,
  sellMaterialToHub,
} from "../src/systems/hubInventory.js";
import { STANDING_MINING_ORDERS, createMiningOperation, getPostedMiningOrders } from "../src/systems/miningOperation.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState, createLogisticsManager } from "../src/systems/logistics.js";
import { createHubProcurementOperation, getProcurementFreightOffers } from "../src/systems/hubProcurement.js";
import { getResourceFamily } from "../src/systems/resourceDefinitions.js";
import { DIAGNOSTIC_STATE, getDiagnostic } from "../src/systems/diagnostics.js";
import { compileOldUniverseHistory } from "../src/systems/worldHistoryCompiler.js";
import { createTransportationNetwork, findTransportationRoute } from "../src/systems/transportationPlanning.js";
import { getRuntimeWorldConnections, getRuntimeWorldSites } from "../src/systems/worldNetworkRegistry.js";

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

function createCarrierWorld({ compileHistory = false } = {}) {
  let clock = 1_000_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  if (compileHistory) compileOldUniverseHistory(state);
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
      const ship = { id: spec.id, name: spec.name, isAlive: true, dockedSiteId: spec.launchSiteId, canAcceptRoute: () => true, assignShipment() { return true; }, queueCargoTransfer() {}, clearShipment() {} };
      commissioned.push(ship);
      return ship;
    },
  });
  return { state, manager, ships, commissioned, advance: (seconds) => { clock += seconds * 1000; } };
}

function addReadyFreight(state, { id = "TEST-READY", buyerInstitutionId = "scrap-forge" } = {}) {
  // Fleet growth is demand-led: seed one real, prepaid, loadable purchase
  // rather than treating occupied ships alone as a reason to buy another.
  state.hubProcurement.orders[id] = {
    id, status: "ready", buyerInstitutionId,
    supplierInstitutionId: "yard-exchange", resourceId: "iron-nickel",
    family: "structural", units: 2, deliveredUnits: 0, freightBudget: 500,
  };
  state.logistics.institutions["yard-exchange"].awaitingPickup ??= {};
  state.logistics.institutions["yard-exchange"].awaitingPickup[id] = {
    units: 2, resourceId: "iron-nickel", ownerInstitutionId: buyerInstitutionId,
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

test("anomaly shards become bounded research samples instead of industrial wealth", () => {
  const { state, hub } = createWorld();
  const yard = hub("yard-exchange");
  const before = yard.accounts.operating.balance;
  const sale = sellMaterialToHub(state, { siteId: "yard-exchange", resourceId: "anomaly-shard", units: 100, unitPrice: 999 });
  assert.equal(sale.acceptedUnits, ANOMALY_SITE_SESSION_QUOTA);
  assert.equal(sale.convertedUnits, 5);
  assert.equal(yard.inventories["anomaly-shard"] ?? 0, 0);
  assert.equal(yard.inventories["stabilized-anomaly-sample"], 5);
  assert.equal(before - yard.accounts.operating.balance, 500, "the desk pays for samples, not every shard");
  assert.equal(sellMaterialToHub(state, { siteId: "yard-exchange", resourceId: "anomaly-shard", units: 10 }).reason,
    "research-quota-filled");
});

test("ordinary hubs refuse anomaly shards without a specialist desk", () => {
  const { state } = createWorld();
  const sale = sellMaterialToHub(state, { siteId: "scrap-porch", resourceId: "anomaly-shard", units: 10 });
  assert.equal(sale.acceptedUnits, 0);
  assert.equal(sale.reason, "specialist-buyer-required");
});

test("factory-stopping feedstock outbids ordinary replenishment without outranking life support", () => {
  const { state, hub } = createWorld();
  hub("yard-exchange").inventories = { "iron-nickel": 0 };
  const ordinary = getPostedMiningOrders(state)["mine-yard-iron"];

  state.hubProcurement.orders.PARTS = {
    id: "PARTS", orderKind: "industrial-part", factoryId: "yard-plate-works",
    supplierInstitutionId: "yard-exchange", buyerInstitutionId: "scrap-forge",
    resourceId: "hull-plate", family: "repair-parts", units: 5, deliveredUnits: 0,
    status: "accepted",
  };
  const factory = getPostedMiningOrders(state)["mine-yard-iron"];
  assert.equal(factory.demandClass, "factory-stoppage");
  assert.ok(factory.paymentPerUnit > factory.valuation.recommendedPrice,
    "a stopped plant pays a visible market premium instead of relying on hidden priority");

  hub("scrap-forge").inventories = { "water-ice": 0 };
  const lifeSupport = getPostedMiningOrders(state)["mine-porch-water"];
  assert.equal(lifeSupport.demandClass, "life-support");
  assert.ok(lifeSupport.demandPremium > factory.demandPremium, "life support remains the stronger emergency class");
  assert.equal(ordinary.demandClass, "ordinary");
});

test("an accepted parts order raises the factory hub's raw-feedstock target", () => {
  const state = createGameState();
  const baseline = getInventoryPosition(state, "yard-exchange", "structural");
  state.hubProcurement.orders.PARTS = {
    id: "PARTS", orderKind: "industrial-part", factoryId: "yard-plate-works",
    supplierInstitutionId: "yard-exchange", buyerInstitutionId: "scrap-forge",
    resourceId: "hull-plate", family: "repair-parts", units: 5, deliveredUnits: 0,
    status: "accepted",
  };

  const committed = getInventoryPosition(state, "yard-exchange", "structural");
  assert.equal(committed.industrialInputs, 10, "five plate require five two-unit iron-nickel runs");
  assert.equal(committed.target, baseline.target + 10, "factory feedstock becomes real hub demand visible to mining");

  state.industrial.factories["yard-plate-works"].activeRun = { output: "hull-plate", amount: 1 };
  const underway = getInventoryPosition(state, "yard-exchange", "structural");
  assert.equal(underway.industrialInputs, 8, "feedstock already consumed by the active run is not ordered twice");
});
const idle = (state) => Object.values(state.logistics.haulers).forEach((hauler) => {
  (hauler.activeShipmentIds ?? []).forEach((shipmentId) => {
    if (shipmentId.startsWith("SHIP-BUSY-")) delete state.logistics.shipments[shipmentId];
  });
  hauler.activeShipmentIds = [];
  hauler.activeShipmentId = null;
  hauler.activeMovementId = null;
});

test("an idle regional hauler claims a prepaid ready purchase order", () => {
  const world = createCarrierWorld();
  addReadyFreight(world.state);
  idle(world.state);

  world.manager.update();

  const claimed = Object.values(world.state.logistics.shipments)
    .find((shipment) => shipment.procurementOrderId === "TEST-READY");
  assert.ok(claimed, "the ready order became a real shipment");
  assert.equal(claimed.assigneeType, "npc");
  assert.ok(claimed.assigneeId, "an idle hauler owns the run");
});

test("a sponsored carrier beside its hub's prepaid cargo gets first consideration before roaming", () => {
  const world = createCarrierWorld();
  addReadyFreight(world.state);
  idle(world.state);
  const [sponsoredShipId, sponsoredHauler] = Object.entries(world.state.logistics.haulers)[0];
  const sponsoredCarrier = world.state.logistics.institutions[sponsoredHauler.carrierInstitutionId];
  sponsoredCarrier.sponsoredByInstitutionId = "scrap-forge";
  sponsoredCarrier.homeSiteId = "scrap-porch";
  sponsoredCarrier.serviceCharter = { sponsorInstitutionId: "scrap-forge", homeSiteId: "scrap-porch" };
  sponsoredHauler.currentSiteId = "yard-exchange";
  world.ships.find((ship) => ship.id === sponsoredShipId).dockedSiteId = "yard-exchange";

  world.manager.update();

  const claimed = Object.values(world.state.logistics.shipments)
    .find((shipment) => shipment.procurementOrderId === "TEST-READY");
  assert.equal(claimed?.assigneeId, sponsoredShipId,
    "the present chartered carrier considers its sponsor's load before an absent auction winner or market circuit");
  assert.equal(sponsoredHauler.activeMovementId, null, "it did not leave the cargo behind on a market circuit");
});

test("a local sponsored carrier may displace an empty pickup reservation without retargeting the traveler", () => {
  const world = createCarrierWorld();
  addReadyFreight(world.state);
  idle(world.state);
  const entries = Object.entries(world.state.logistics.haulers);
  const [localShipId, local] = entries[0];
  const [travelerShipId, traveler] = entries[1];
  const localCarrier = world.state.logistics.institutions[local.carrierInstitutionId];
  localCarrier.sponsoredByInstitutionId = "scrap-forge";
  localCarrier.homeSiteId = "scrap-porch";
  localCarrier.serviceCharter = { sponsorInstitutionId: "scrap-forge", homeSiteId: "scrap-porch" };
  local.currentSiteId = "yard-exchange";
  world.ships.find((ship) => ship.id === localShipId).dockedSiteId = "yard-exchange";

  const movementId = "MOVE-REMOTE-TEST";
  traveler.reservedTemplateId = "procurement-TEST-READY";
  traveler.activeMovementId = movementId;
  traveler.status = "repositioning-freight";
  world.state.logistics.movements[movementId] = {
    id: movementId, type: "freight-pickup", shipId: travelerShipId,
    destinationSiteId: "yard-exchange", observedOfferId: "procurement-TEST-READY", status: "active",
  };

  world.manager.update();

  const claimed = Object.values(world.state.logistics.shipments)
    .find((shipment) => shipment.procurementOrderId === "TEST-READY");
  assert.equal(claimed?.assigneeId, localShipId, "physical sponsor service beats an empty approach reservation");
  assert.equal(traveler.reservedTemplateId, null, "the distant carrier no longer hides the cargo");
  assert.equal(world.state.logistics.movements[movementId].type, "market-reposition");
  assert.equal(world.state.logistics.movements[movementId].destinationSiteId, "yard-exchange",
    "the traveler finishes its existing flight rather than being retargeted in space");
  const winningBid = world.state.logistics.carrierBidDiagnostics["procurement-TEST-READY"];
  assert.equal(winningBid?.winnerShipId, localShipId);
  assert.equal(local.activeMovementId, null,
    "a current dockside winner does not recompute the award away and depart on a market circuit");
});

test("a carrier services early when present wear blocks every real freight run", () => {
  const world = createCarrierWorld();
  addReadyFreight(world.state);
  idle(world.state);
  const [shipId, hauler] = Object.entries(world.state.logistics.haulers)[0];
  const carrier = world.state.logistics.institutions[hauler.carrierInstitutionId];
  const shipInstitution = world.state.logistics.institutions[hauler.shipInstitutionId];
  const ship = world.ships.find((entry) => entry.id === shipId);

  // Make this the only available carrier and give it a run which a fresh hull
  // could serve, but this worn hull cannot. Raise this operator's ordinary
  // advisory slightly so the hull remains below it and this specifically exercises
  // work-limiting wear rather than scheduled maintenance.
  Object.entries(world.state.logistics.haulers).forEach(([otherId, other]) => {
    if (otherId === shipId) return;
    const busyId = `SHIP-BUSY-${otherId}`;
    world.state.logistics.shipments[busyId] = { id: busyId, status: "assigned", assigneeType: "npc", assigneeId: otherId };
    other.activeShipmentIds = [busyId];
    other.activeShipmentId = busyId;
  });
  carrier.policies.transportation.maintenanceAdvisoryWear = 5;
  shipInstitution.wear = 4.9;
  ship.wear = 4.9;
  assert.ok(shipInstitution.wear < carrier.policies.transportation.maintenanceAdvisoryWear);

  world.manager.update();

  const movement = world.state.logistics.movements[hauler.activeMovementId];
  assert.equal(movement?.type, "service-return", "the carrier heads for service instead of another market circuit");
  assert.equal(movement?.issueType, "preventive-service");
  assert.equal(Object.values(world.state.logistics.shipments).some((entry) => entry.procurementOrderId === "TEST-READY"), false,
    "the unsafe run remains unclaimed until service makes it legal");
});

test("freight diagnostics retain carriers excluded before the pricing auction", () => {
  const world = createCarrierWorld();
  addReadyFreight(world.state);
  idle(world.state);
  world.ships.forEach((ship) => { ship.dockedSiteId = null; });

  world.manager.update();

  const market = world.state.logistics.carrierBidDiagnostics["procurement-TEST-READY"];
  assert.ok(market, "the ready offer gets a diagnostic even with no bids");
  assert.equal(market.winnerShipId, null);
  assert.equal(market.bids.length, Object.keys(world.state.logistics.haulers).length,
    "every carrier appears in the discovery matrix");
  assert.ok(market.bids.every((bid) => bid.stage === "discovery" && bid.rejectionReason === "not-physically-docked"));
});

test("a carrier puts another ship into service when its own are all committed", () => {
  const world = createCarrierWorld();
  addReadyFreight(world.state);
  assert.equal(getProcurementFreightOffers(world.state).length, 1, "the unmet transport need is physically ready");
  Object.values(world.state.logistics.institutions).forEach((institution) => {
    if (institution.archetypeId === "settlement" && institution.accounts?.operating) institution.accounts.operating.balance = 100_000;
  });
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

test("a fleet count alone does not create ships, while sustained unserved freight creates one reasoned commission", () => {
  const startup = createCarrierWorld();
  const startingFleet = Object.keys(startup.state.logistics.haulers).length;
  startup.manager.update();
  assert.equal(Object.keys(startup.state.logistics.haulers).length, startingFleet,
    "tick one does not fill an authored regional fleet target");
  assert.equal(startup.commissioned.length, 0);

  const world = createCarrierWorld({ compileHistory: true });
  const chronicle = world.state.worldHistory.chronicles["chronicle:ashfall-founding"];
  const homeSiteId = chronicle.siteIds[0];
  addReadyFreight(world.state, { buyerInstitutionId: homeSiteId });
  Object.values(world.state.logistics.institutions).forEach((institution) => {
    if (institution.archetypeId === "settlement" && institution.accounts?.operating) {
      institution.accounts.operating.balance = institution.siteId === homeSiteId ? 100_000 : 0;
    }
  });
  busy(world.state);
  world.manager.update();
  world.advance(61);
  busy(world.state);
  world.manager.update();
  const sponsored = Object.values(world.state.logistics.institutions)
    .filter((institution) => institution.archetypeId === "hauling-business" && institution.sponsoredByInstitutionId);
  assert.equal(sponsored.length, 1, "one observed shortage produces one response, not a startup fleet burst");
  assert.equal(Object.keys(world.state.logistics.haulers).length, startingFleet + 1);
  sponsored.forEach((carrier) => {
    assert.ok(carrier.accounts.operating.balance >= 5_000, "the carrier is economically alive at launch");
    assert.ok(carrier.maintenanceEscrow >= 3_000, "one repair cycle is explicitly reserved");
    assert.ok(carrier.accounts.operating.balance - carrier.policies.transportation.minimumOperatingCash >= 3_000,
      "the reserve does not make repair money unspendable");
    const operator = world.state.logistics.institutions[carrier.controllerInstitutionId];
    assert.ok(operator?.name && !operator.name.startsWith("Hub Dispatcher"), "the operator has a personal identity");
    assert.ok(operator?.motivation, "the operator has an economic motivation");
    assert.equal(operator?.homeInstitutionId, carrier.sponsoredByInstitutionId, "the operator comes from the sponsoring hub's population");
    assert.equal(operator?.charter?.kind, "municipal-freight-charter", "the operator receives authority through an explicit charter");
    assert.equal(carrier.serviceCharter?.duty, "home-service-concession", "public capital buys enforceable home service");
    assert.equal(carrier.serviceCharter?.lienStatus, "hub-capital-outstanding", "the hub retains a financial interest in the commissioned hull");
    assert.equal(carrier.capitalLien?.status, "outstanding", "the lien is an account balance rather than descriptive text");
    assert.equal(carrier.capitalLien?.sponsorInstitutionId, carrier.sponsoredByInstitutionId);
    assert.ok(carrier.capitalLien?.principal > 5_000, "the lien includes the operating grant and the real hull purchase");
    assert.ok(world.state.population.laborAssignments[operator.assignmentId], "the job consumes finite population labor");
  });
  assert.equal(new Set(sponsored.map((carrier) => world.state.logistics.institutions[carrier.controllerInstitutionId].name)).size,
    sponsored.length, "sponsored firms do not share a cloned proprietor");
  const startingWear = sponsored.map((carrier) => Object.values(world.state.logistics.institutions)
    .find((institution) => institution.controllerInstitutionId === carrier.id && institution.archetypeId === "cargo-ship")?.wear);
  assert.ok(startingWear.every((wear) => wear > 0 && wear < 2), "generated craft are used but serviceable");
});

test("a hub assumes an idle sponsored concession before commissioning its replacement", () => {
  const world = createCarrierWorld({ compileHistory: true });
  const chronicle = world.state.worldHistory.chronicles["chronicle:ashfall-founding"];
  const homeSiteId = chronicle.siteIds[0];
  addReadyFreight(world.state, { buyerInstitutionId: homeSiteId });
  Object.values(world.state.logistics.institutions).forEach((institution) => {
    if (institution.archetypeId === "settlement" && institution.accounts?.operating) {
      institution.accounts.operating.balance = institution.siteId === homeSiteId ? 100_000 : 0;
    }
  });
  busy(world.state);
  world.manager.update();
  world.advance(61);
  busy(world.state);
  world.manager.update();
  delete world.state.hubProcurement.orders["TEST-READY"];
  delete world.state.logistics.institutions["yard-exchange"].awaitingPickup?.["TEST-READY"];
  Object.values(world.state.logistics.shipments)
    .filter((shipment) => shipment.procurementOrderId === "TEST-READY")
    .forEach((shipment) => { delete world.state.logistics.shipments[shipment.id]; });
  const sponsoredEntry = Object.entries(world.state.logistics.haulers)
    .find(([, hauler]) => world.state.logistics.institutions[hauler.carrierInstitutionId]?.sponsoredByInstitutionId === homeSiteId);
  assert.ok(sponsoredEntry, "the frontier hub first created a real sponsored concession");
  const [sponsoredShipId, sponsoredHauler] = sponsoredEntry;
  sponsoredHauler.currentSiteId = homeSiteId;
  sponsoredHauler.activeShipmentId = null;
  sponsoredHauler.activeShipmentIds = [];
  sponsoredHauler.activeMovementId = null;
  sponsoredHauler.homeDuty = { lastHomeDockedAt: 1_000_000, marketStopsAway: 0, completedJobsAway: 0, required: false };
  const sponsoredShip = world.commissioned.find((ship) => ship.id === sponsoredShipId);
  sponsoredShip.dockedSiteId = homeSiteId;
  sponsoredShip.operationalStatus = "seeking-work";
  const leaveOnlySponsorIdle = () => {
    busy(world.state);
    delete world.state.logistics.shipments[`SHIP-BUSY-${sponsoredShipId}`];
    sponsoredHauler.activeShipmentId = null;
    sponsoredHauler.activeShipmentIds = [];
    sponsoredHauler.activeMovementId = null;
  };
  leaveOnlySponsorIdle();
  world.manager.update();
  world.advance(121);
  leaveOnlySponsorIdle();
  world.manager.update();
  assert.ok(Object.keys(world.state.logistics.withdrawalOffers ?? {}).length > 0, "a sponsored concession reached the withdrawal market");

  world.state.logistics.institutions["yard-exchange"].accounts.operating.balance = 100_000;
  addReadyFreight(world.state);
  Object.values(world.state.logistics.haulers).forEach((hauler) => {
    hauler.status = "maintenance-required";
    hauler.maintenanceRequested = true;
  });
  world.state.logistics.hubCapacityPolicy["yard-exchange"] ??= { sponsored: 0, lastSponsoredAt: null };
  world.state.logistics.hubCapacityPolicy["yard-exchange"].unservedSince = 1;
  world.manager.update();

  const transfers = world.state.ledger.getEventsAfterId(0)
    .filter((event) => event.type === "carrier.concessionTransferred");
  assert.ok(transfers.length > 0, "an existing hull and job changed hands");
  const transfer = transfers[0].payload;
  assert.ok(transfer.price < transfer.replacementCost, "the assuming hub paid less than a new hull");
  const carrier = world.state.logistics.institutions[transfer.carrierInstitutionId];
  const hauler = world.state.logistics.haulers[transfer.haulerId];
  assert.equal(carrier.sponsoredByInstitutionId, transfer.toInstitutionId);
  assert.equal(hauler.homeDuty.required, true, "the acquired carrier owes a first call to its new home");
  assert.ok(world.state.logistics.institutions[transfer.operatorId], "the original worker and identity survived the transfer");
});

test("a generated hub briefs its commissioned carrier on its home community and delivery road", () => {
  const world = createCarrierWorld({ compileHistory: true });
  const chronicle = world.state.worldHistory.chronicles["chronicle:ashfall-founding"];
  const homeSiteId = chronicle.siteIds[0];
  Object.values(world.state.logistics.institutions).forEach((institution) => {
    if (institution.archetypeId === "settlement" && institution.accounts?.operating) {
      institution.accounts.operating.balance = institution.siteId === homeSiteId ? 100_000 : 0;
    }
  });
  world.state.hubProcurement.orders["TEST-FRONTIER-READY"] = {
    id: "TEST-FRONTIER-READY", status: "ready", buyerInstitutionId: homeSiteId,
    supplierInstitutionId: "yard-exchange", resourceId: "iron-nickel",
    family: "structural", units: 2, deliveredUnits: 0, freightBudget: 500,
  };
  world.state.logistics.institutions["yard-exchange"].awaitingPickup = {
    "TEST-FRONTIER-READY": { units: 2, resourceId: "iron-nickel", ownerInstitutionId: homeSiteId },
  };
  busy(world.state);
  world.manager.update();
  world.advance(61);
  busy(world.state);
  world.manager.update();

  const carrier = Object.values(world.state.logistics.institutions)
    .find((institution) => institution.sponsoredByInstitutionId === homeSiteId);
  assert.ok(carrier, "the hub responded to its own sustained unserved cargo");
  const knowledge = carrier.policies.transportation.knownDestinationIds;
  const community = world.state.worldNetwork.communities[chronicle.communityId];
  assert.ok(community.siteIds.every((siteId) => knowledge.includes(siteId)),
    "the charter briefs the crew on every settlement in its home compact");
  const network = createTransportationNetwork({
    destinations: getRuntimeWorldSites(world.state),
    connections: getRuntimeWorldConnections(world.state),
  });
  const route = findTransportationRoute(network, "yard-exchange", homeSiteId, knowledge);
  assert.ok(route, "the delivery crew knows an actual connected road from the building yard to home");
  assert.equal(route.path.at(-1), homeSiteId);
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
