// Hub-to-hub procurement: a hub buys what it may not mine, and a freight run
// exists only because a real purchase order caused it.

import assert from "node:assert/strict";
import test from "node:test";
import {
  PROCUREMENT_STATUS,
  createHubProcurementOperation,
  getCommittedSupply,
  getProcurementFreightOffers,
  listOrders,
} from "../src/systems/hubProcurement.js";
import { getInventoryPosition } from "../src/systems/hubInventory.js";
import { getPostedMiningOrders } from "../src/systems/miningOperation.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState, createLogisticsManager } from "../src/systems/logistics.js";

function createWorld({ cash = 20_000 } = {}) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  ["yard-exchange", "scrap-forge", "the-ledge"].forEach((id) => {
    state.logistics.institutions[id].accounts.operating.balance = cash;
  });
  const procurement = createHubProcurementOperation({ state, now: () => 1_000 });
  return { state, procurement, hub: (id) => state.logistics.institutions[id] };
}

// ── A hub buys what it cannot dig up ───────────────────────────────────────

test("a hub posts a purchase order for a family it may not mine", () => {
  const { state } = createWorld();
  const orders = listOrders(state, { buyerInstitutionId: "yard-exchange" });
  assert.ok(orders.length > 0, "Yard Exchange has to buy something");
  const families = orders.map((order) => order.family).sort();
  assert.ok(families.every((family) => ["industrial", "volatile"].includes(family)),
    `Yard Exchange should only buy what it cannot mine, got ${families.join(", ")}`);
  assert.ok(orders.every((order) => order.supplierInstitutionId !== "yard-exchange"),
    "and never from itself");
});

test("the order is directed at the hub that may legally mine that family", () => {
  const { state } = createWorld();
  const volatileOrder = listOrders(state, { buyerInstitutionId: "yard-exchange" })
    .find((order) => order.family === "volatile");
  assert.ok(volatileOrder, "Yard Exchange needs volatile");
  assert.equal(volatileOrder.supplierInstitutionId, "scrap-forge", "Scrap Porch holds the volatile right");
  const industrialOrder = listOrders(state, { buyerInstitutionId: "scrap-forge" })
    .find((order) => order.family === "industrial");
  assert.equal(industrialOrder?.supplierInstitutionId, "the-ledge", "The Ledge holds the industrial right");
});

test("every hub ends up buying from both of the others", () => {
  const { state } = createWorld();
  const lanes = listOrders(state).map((order) => `${order.supplierInstitutionId}->${order.buyerInstitutionId}`);
  // The two lanes that never existed as authored routes are now real.
  assert.ok(lanes.includes("the-ledge->scrap-forge"), "The Ledge supplies Scrap Porch industrial");
  assert.ok(lanes.includes("scrap-forge->the-ledge"), "Scrap Porch supplies The Ledge volatile");
});

test("an order carries a price, a commitment, and its reasons", () => {
  const { state, hub } = createWorld();
  const order = listOrders(state)[0];
  assert.ok(order.pricePerUnit > 0 && order.units > 0);
  assert.equal(order.committedPayment, order.units * order.pricePerUnit);
  assert.ok(order.reasons.length > 0, "the price is explainable");
  assert.ok(hub(order.buyerInstitutionId).accounts.operating.committed >= order.committedPayment,
    "the buyer set the money aside rather than merely intending to");
});

test("a hub never has more on order than it is short", () => {
  const { state, procurement } = createWorld();
  for (let tick = 0; tick < 8; tick += 1) procurement.update();
  // Ordering the REMAINDER of a gap is fine; ordering the same gap repeatedly
  // is not. Open commitments must never exceed what the hub is actually short.
  ["yard-exchange", "scrap-forge", "the-ledge"].forEach((buyerInstitutionId) => {
    ["structural", "industrial", "volatile"].forEach((family) => {
      const open = listOrders(state, { buyerInstitutionId, status: ["offered", "accepted", "ready", "shipped"] })
        .filter((order) => order.family === family)
        .reduce((sum, order) => sum + order.units, 0);
      const position = getInventoryPosition(state, buyerInstitutionId, family);
      assert.ok(open <= position.target,
        `${buyerInstitutionId} has ${open} ${family} on order against a target of ${position.target}`);
    });
  });
});

test("a hub that cannot fund a purchase posts nothing and keeps its money", () => {
  const { state } = createWorld({ cash: 50 });
  assert.equal(listOrders(state).length, 0, "no order it cannot pay for");
  const blocked = state.diagnostics?.actors?.["yard-exchange"];
  assert.ok(blocked?.blocker, "and it says why");
  assert.match(blocked.blocker.summary, /cannot fund/i);
});

// ── Accepting a sale is what makes a supplier mine ─────────────────────────

test("a supplier accepts an offer that clears what the material costs it", () => {
  const { state, procurement } = createWorld();
  procurement.update();
  const accepted = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED });
  assert.ok(accepted.length > 0, "somebody agreed to sell");
  assert.ok(accepted[0].supplierReasons.length > 0, "and can say on what terms");
});

test("an accepted sale raises the supplier's own stock target", () => {
  const { state, procurement } = createWorld();
  const before = getInventoryPosition(state, "scrap-forge", "volatile");
  procurement.update();
  const committed = getCommittedSupply(state, "scrap-forge", "volatile");
  assert.ok(committed > 0, "Scrap Porch owes volatile to somebody");
  const after = getInventoryPosition(state, "scrap-forge", "volatile");
  assert.equal(after.target, after.ownTarget + committed, "the target carries the commitment");
  assert.ok(after.target > before.ownTarget, "so it now wants more than its own population needs");
});

test("the raised target is what makes the supplier commission more mining", () => {
  const { state, procurement } = createWorld();
  const before = getPostedMiningOrders(state)["mine-porch-water"];
  procurement.update();
  const after = getPostedMiningOrders(state)["mine-porch-water"];
  assert.ok(after, "Scrap Porch is still mining volatile");
  assert.ok(after.inventory.gap > before.inventory.gap,
    `owing a sale widens the gap it mines against (${before.inventory.gap} -> ${after.inventory.gap})`);
});

test("a supplier refuses a sale below what the goods cost it", () => {
  const { state, procurement } = createWorld();
  const order = listOrders(state, { status: PROCUREMENT_STATUS.OFFERED })[0]
    ?? listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })[0];
  order.status = PROCUREMENT_STATUS.OFFERED;
  order.pricePerUnit = 1;
  order.committedPayment = order.units;
  procurement.update();
  assert.equal(order.status, PROCUREMENT_STATUS.DECLINED);
  assert.equal(order.declinedReason, "below-supplier-cost");
});

// ── Freight exists only because supply and a buyer both exist ──────────────

test("no freight is offered while the supplier has nothing to give", () => {
  const { state, procurement, hub } = createWorld();
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (institution.inventories) Object.keys(institution.inventories).forEach((itemId) => { institution.inventories[itemId] = 0; });
  });
  procurement.update();
  assert.equal(getProcurementFreightOffers(state).length, 0, "nothing to haul yet");
  const owed = state.diagnostics?.actors?.["scrap-forge"];
  assert.ok(owed?.blocker, "the supplier says what it owes and cannot yet supply");
  assert.ok(hub("scrap-forge"));
});

test("freight is offered once the goods actually exist", () => {
  const { state, procurement, hub } = createWorld();
  procurement.update();
  const order = listOrders(state, { status: [PROCUREMENT_STATUS.ACCEPTED, PROCUREMENT_STATUS.READY] })[0];
  hub(order.supplierInstitutionId).inventories[order.resourceId] = order.units + 20;
  procurement.update();

  assert.equal(state.hubProcurement.orders[order.id].status, PROCUREMENT_STATUS.READY);
  const offers = getProcurementFreightOffers(state);
  const offer = offers.find((entry) => entry.procurementOrderId === order.id);
  assert.ok(offer, "the run is on the board");
  assert.equal(offer.sourceInstitutionId, order.supplierInstitutionId);
  assert.equal(offer.destinationInstitutionId, order.buyerInstitutionId);
  assert.equal(offer.amount, order.units);
  assert.ok(offer.payment > 0, "and the carrier is paid separately from the goods");
});

// ── The full chain, end to end ─────────────────────────────────────────────

function createFullWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  ["yard-exchange", "scrap-forge", "the-ledge"].forEach((id) => {
    state.logistics.institutions[id].accounts.operating.balance = 20_000;
  });
  const procurement = createHubProcurementOperation({ state, now: () => 1_000 });
  const ships = Object.keys(state.logistics.haulers).map((id) => ({
    id, dockedSiteId: state.logistics.haulers[id].currentSiteId, wear: 0,
    operationalStatus: "seeking-work", activeShipmentId: null, assignment: null, transfers: [],
    canAcceptRoute: (route) => Array.isArray(route) && route.length >= 2,
    assignShipment(assignment) { this.assignment = assignment; return true; },
    queueCargoTransfer(transfer) { this.transfers.push(transfer); },
    clearShipment() { this.assignment = null; },
  }));
  const manager = createLogisticsManager({
    state, ships, now: () => 1_000,
    onProcurementShipped: (orderId, shipmentId) => procurement.markShipped(orderId, shipmentId),
    onProcurementDelivered: (orderId, settlement) => procurement.completeOrder(orderId, settlement),
  });
  return { state, procurement, manager, ships, hub: (id) => state.logistics.institutions[id] };
}


// Make all owed material available, run the carriers, and return the
// procurement run one of them actually took.
function shipOneProcurementRun({ state, procurement, manager, hub }) {
  procurement.update();
  listOrders(state, { status: [PROCUREMENT_STATUS.ACCEPTED, PROCUREMENT_STATUS.READY] }).forEach((order) => {
    hub(order.supplierInstitutionId).inventories[order.resourceId] = order.units + 30;
  });
  procurement.update();
  manager.update();
  const shipment = Object.values(state.logistics.shipments).find((entry) => entry.procurementOrderId);
  return { shipment, order: shipment ? state.hubProcurement.orders[shipment.procurementOrderId] : null };
}

test("delivering a procurement run pays the supplier, pays the carrier, and closes the need", () => {
  const world = createFullWorld();
  const { state, hub, manager } = world;
  const sellerCash = {};
  const buyerStock = {};
  Object.keys(state.logistics.institutions).forEach((id) => {
    sellerCash[id] = state.logistics.institutions[id].accounts?.operating?.balance ?? 0;
  });
  const { shipment, order } = shipOneProcurementRun(world);
  assert.ok(shipment, "a carrier took a procurement run");
  assert.equal(order.status, PROCUREMENT_STATUS.SHIPPED);
  const sellerBefore = sellerCash[order.supplierInstitutionId];
  buyerStock[order.resourceId] = (hub(order.buyerInstitutionId).inventories[order.resourceId] ?? 0);
  const buyerStockBefore = buyerStock[order.resourceId];

  // Complete the run.
  state.ledger.recordEvent("npc.routeCompleted", { npcId: shipment.assigneeId, shipmentId: shipment.id, siteId: shipment.destinationSiteId }, { visible: false });
  manager.update();

  const closed = state.hubProcurement.orders[order.id];
  assert.equal(closed.status, PROCUREMENT_STATUS.DELIVERED, "the order is closed, not merely restocked");
  assert.equal(closed.deliveredUnits, order.units);
  const sale = hub(order.supplierInstitutionId).accounts.operating.transactions
    .find((entry) => entry.type === "goods-sale" && entry.referenceId === shipment.templateId);
  assert.ok(sale, "the supplier booked the sale");
  assert.equal(sale.amount, shipment.goodsPayment, "and was paid the agreed price");
  assert.ok(sellerBefore !== undefined);
  assert.equal((hub(order.buyerInstitutionId).inventories[order.resourceId] ?? 0) - buyerStockBefore, order.units,
    "and the material reached the buyer");
  const carrier = state.logistics.institutions[state.logistics.haulers[shipment.assigneeId].carrierInstitutionId];
  assert.ok(carrier.accounts.operating.transactions.some((entry) => entry.type === "freight-income"),
    "the carrier was paid separately");
});

test("a delivered order releases the buyer's committed money", () => {
  const world = createFullWorld();
  const { state, manager, hub } = world;
  const { shipment, order } = shipOneProcurementRun(world);
  assert.ok(shipment);
  const committedBefore = hub(order.buyerInstitutionId).accounts.operating.committed;
  state.ledger.recordEvent("npc.routeCompleted", { npcId: shipment.assigneeId, shipmentId: shipment.id, siteId: shipment.destinationSiteId }, { visible: false });
  manager.update();
  assert.ok(hub(order.buyerInstitutionId).accounts.operating.committed < committedBefore,
    "money set aside for the order is released when it closes");
});

test("the whole chain is on the ledger, in order", () => {
  const world = createFullWorld();
  const { state, manager } = world;
  const { shipment, order } = shipOneProcurementRun(world);
  assert.ok(shipment);
  state.ledger.recordEvent("npc.routeCompleted", { npcId: shipment.assigneeId, shipmentId: shipment.id, siteId: shipment.destinationSiteId }, { visible: false });
  manager.update();

  const types = state.ledger.getEventsAfterId(0)
    .filter((entry) => entry.payload?.procurementOrderId === order.id)
    .map((entry) => entry.type);
  assert.ok(types.includes("procurement.orderPosted"));
  assert.ok(types.includes("procurement.orderAccepted"));
  assert.ok(types.includes("procurement.readyForFreight"));
  assert.ok(types.includes("procurement.orderDelivered"));
  assert.ok(types.indexOf("procurement.orderPosted") < types.indexOf("procurement.orderDelivered"),
    "posted before delivered");
});

test("a hauler can take a run from the far end when it has nothing local", () => {
  const { state, procurement, manager, ships, hub } = createFullWorld();
  procurement.update();
  const order = listOrders(state, { status: [PROCUREMENT_STATUS.ACCEPTED, PROCUREMENT_STATUS.READY] })
    .find((entry) => entry.supplierInstitutionId === "the-ledge") ?? listOrders(state)[0];
  hub(order.supplierInstitutionId).inventories[order.resourceId] = order.units + 30;
  // Strip every other source so the only loadable work is somewhere else.
  Object.entries(state.logistics.institutions).forEach(([id, institution]) => {
    if (id !== order.supplierInstitutionId && institution.inventories) {
      Object.keys(institution.inventories).forEach((itemId) => { institution.inventories[itemId] = 0; });
    }
  });
  procurement.update();
  // A long lane opens under-priced and relies on the buyer's repricing loop to
  // raise it. Post a rate that clears the deadhead so this stays a test of
  // whether a hauler CAN work the far end, not of the opening rate.
  state.logistics.postedFreightRates = { [`procurement-${order.id}`]: 900 };
  manager.update();

  const shipment = Object.values(state.logistics.shipments)[0];
  assert.ok(shipment, "a hauler took work that was not on its doorstep");
  if (shipment.repositionedFrom) {
    assert.notEqual(shipment.repositionedFrom, shipment.originSiteId);
    const ship = ships.find((entry) => entry.id === shipment.assigneeId);
    assert.ok(ship.assignment.route.length >= 2, "and was routed via the pickup");
  }
});

// ── Repricing: the two sides converge instead of restating offers ──────────

function advanceWorld(minutes = 2) {
  let clock = 1_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  ["yard-exchange", "scrap-forge", "the-ledge"].forEach((id) => {
    state.logistics.institutions[id].accounts.operating.balance = 60_000;
  });
  const procurement = createHubProcurementOperation({ state, now: () => clock });
  return { state, procurement, tick: (seconds) => { clock += seconds * 1000; procurement.update(); }, now: () => clock };
}

test("a refused purchase is raised toward what the seller said it needs", () => {
  const world = advanceWorld();
  const order = listOrders(world.state)[0];
  // Lowball it and let the supplier refuse.
  order.status = PROCUREMENT_STATUS.OFFERED;
  order.pricePerUnit = 1;
  order.committedPayment = order.units;
  world.tick(1);
  assert.equal(order.status, PROCUREMENT_STATUS.DECLINED, "the supplier refused");
  assert.ok(order.supplierFloor > 1, "and said what it would take");

  const before = order.pricePerUnit;
  world.tick(90);   // past the throttle
  assert.ok(order.pricePerUnit > before, `price should rise from ${before}, got ${order.pricePerUnit}`);
  assert.equal(order.repriceCount, 1);
});

test("a repriced order goes back on the table and closes once it clears the floor", () => {
  const world = advanceWorld();
  const order = listOrders(world.state)[0];
  // Under-price it, but not so far that the buyer's own ceiling (twice its
  // opening judgement) puts the seller's floor out of reach.
  order.status = PROCUREMENT_STATUS.OFFERED;
  order.originalPricePerUnit = 30;
  order.pricePerUnit = 5;
  order.committedPayment = order.units * 5;
  world.tick(1);
  assert.equal(order.status, PROCUREMENT_STATUS.DECLINED, "refused at the low price");

  world.tick(90);
  assert.ok(order.pricePerUnit > 5, "the buyer moved");
  assert.notEqual(order.status, PROCUREMENT_STATUS.DECLINED,
    "and the order is live again rather than left dead at the old price");
});

test("repricing is throttled, not run every tick", () => {
  const world = advanceWorld();
  const order = listOrders(world.state)[0];
  order.status = PROCUREMENT_STATUS.OFFERED;
  order.pricePerUnit = 1;
  world.tick(1);
  world.tick(90);
  const afterFirst = order.repriceCount ?? 0;
  for (let tick = 0; tick < 10; tick += 1) world.tick(1);
  assert.equal(order.repriceCount ?? 0, afterFirst, "ten more seconds buys no further raises");
});

test("a buyer will not bid past twice its opening price", () => {
  const world = advanceWorld();
  const order = listOrders(world.state)[0];
  order.status = PROCUREMENT_STATUS.OFFERED;
  order.originalPricePerUnit = 10;
  order.pricePerUnit = 10;
  order.supplierFloor = 10_000;      // a seller demanding the moon
  order.supplierAsk = 10_000;
  for (let tick = 0; tick < 6; tick += 1) world.tick(90);
  assert.ok(order.pricePerUnit <= 20, `capped at twice the opening price, got ${order.pricePerUnit}`);
});

test("a buyer that cannot fund the raise defers it and keeps its money", () => {
  const world = advanceWorld();
  const order = listOrders(world.state)[0];
  order.status = PROCUREMENT_STATUS.OFFERED;
  order.originalPricePerUnit = order.pricePerUnit;
  order.supplierFloor = order.pricePerUnit * 2;
  order.supplierAsk = order.pricePerUnit * 2;
  const buyer = world.state.logistics.institutions[order.buyerInstitutionId];
  buyer.accounts.operating.balance = 10;
  const priceBefore = order.pricePerUnit;
  const balanceBefore = buyer.accounts.operating.balance;
  world.tick(90);
  assert.equal(order.pricePerUnit, priceBefore, "the price did not move");
  assert.equal(buyer.accounts.operating.balance, balanceBefore, "and nothing left the treasury");
  const deferred = world.state.ledger.getEventsAfterId(0).filter((entry) => entry.type === "procurement.repriceDeferred");
  assert.ok(deferred.length > 0, "the shortfall is on the record");
});

test("every raise records why it moved", () => {
  const world = advanceWorld();
  const order = listOrders(world.state)[0];
  order.status = PROCUREMENT_STATUS.OFFERED;
  order.pricePerUnit = 1;
  order.committedPayment = order.units;
  world.tick(1);
  world.tick(90);
  const repriced = world.state.ledger.getEventsAfterId(0)
    .filter((entry) => entry.type === "institution.offerRepriced" && entry.payload.procurementOrderId === order.id);
  assert.equal(repriced.length, 1);
  const payload = repriced[0].payload;
  assert.ok(payload.previousPrice < payload.unitPrice, "the move is recorded in both directions");
  assert.ok(payload.reasons.length >= 2, "with reasons, not just numbers");
  assert.ok(payload.reasons.some((reason) => /would not sell/i.test(reason)));
  assert.ok(payload.ceiling, "and the limit it will not pass");
});

test("a buyer stuck at its ceiling says so once instead of retrying silently", () => {
  const world = advanceWorld();
  const order = listOrders(world.state)[0];
  order.status = PROCUREMENT_STATUS.OFFERED;
  order.originalPricePerUnit = 10;
  order.pricePerUnit = 20;          // already at twice the opening price
  order.supplierFloor = 10_000;
  for (let tick = 0; tick < 5; tick += 1) world.tick(90);
  const exhausted = world.state.ledger.getEventsAfterId(0)
    .filter((entry) => entry.type === "procurement.repriceExhausted" && entry.payload.procurementOrderId === order.id);
  assert.equal(exhausted.length, 1, "reported once, not once per attempt");
});
