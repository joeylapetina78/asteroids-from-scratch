// Hub-to-hub procurement: a hub buys what it may not mine, and a freight run
// exists only because a real purchase order caused it.

import assert from "node:assert/strict";
import test from "node:test";
import {
  PROCUREMENT_STATUS,
  createHubProcurementOperation,
  evaluateSupplierCandidates,
  getAskConcession,
  getCommittedSupply,
  getAwaitingPickup,
  getProcurementFreightOffers,
  getSaleReserve,
  listOrders,
} from "../src/systems/hubProcurement.js";
import { recordAcquisition } from "../src/systems/costBasis.js";
import { getInventoryPosition } from "../src/systems/hubInventory.js";
import { getPostedMiningOrders } from "../src/systems/miningOperation.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState, createLogisticsManager } from "../src/systems/logistics.js";

function createWorld({ cash = 20_000 } = {}) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  Object.values(state.logistics.institutions)
    .filter((institution) => institution.archetypeId === "settlement")
    .forEach((institution) => { institution.accounts.operating.balance = cash; });
  const procurement = createHubProcurementOperation({ state, now: () => 1_000 });
  return { state, procurement, hub: (id) => state.logistics.institutions[id] };
}

function isolateAcceptedOrder(state, hub, order) {
  Object.values(state.hubProcurement.orders).forEach((entry) => {
    if (entry.id === order.id || ![PROCUREMENT_STATUS.OFFERED, PROCUREMENT_STATUS.ACCEPTED].includes(entry.status)) return;
    const account = hub(entry.buyerInstitutionId)?.accounts?.operating;
    if (account) account.committed = Math.max(0, account.committed - (entry.committedPayment ?? 0));
    entry.status = PROCUREMENT_STATUS.DECLINED;
  });
  Object.values(state.logistics.institutions)
    .filter((institution) => institution.archetypeId === "settlement")
    .forEach((institution) => { institution.inventories = {}; institution.saleReserve = {}; institution.awaitingPickup = {}; });
}

function addAlternativeVolatileSupplier(state, { id = "north-well", distance = 500 } = {}) {
  state.hubProcurement.orders = {};
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (institution.accounts?.operating) institution.accounts.operating.committed = 0;
  });
  state.logistics.institutions[id] = {
    id, name: "North Well", siteId: id, archetypeId: "settlement",
    controllerInstitutionId: `person:${id}`,
    accounts: { operating: { balance: 20_000, committed: 0 } },
    inventories: { "water-ice": 12 }, renewableResources: ["water-ice"],
  };
  state.logistics.institutions[`person:${id}`] = {
    id: `person:${id}`, name: "North Well Factor", archetypeId: "person", controls: [id],
    traits: { caution: 0.5, growthBias: 0.45, urgencyBias: 0.5 },
  };
  state.worldRecords.authorityGrants[`authority:institution:${id}:mining:hub:${id}`] = {
    id: `authority:institution:${id}:mining:hub:${id}`,
    holderId: `institution:${id}`,
    status: "active",
    limits: { rightTypes: ["mining"], resourceFamilies: ["volatile"] },
  };
  return {
    definitions: [
      { id: "mine-north-water", buyerInstitutionId: id, resourceId: "water-ice" },
      { id: "mine-porch-water", buyerInstitutionId: "scrap-forge", resourceId: "water-ice" },
    ],
    connections: [
      { id: "lane-north-yard", fromId: id, toId: "yard-exchange", distance, bidirectional: true },
      { id: "lane-porch-yard", fromId: "scrap-porch", toId: "yard-exchange", distance: 1875, bidirectional: true },
    ],
  };
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

test("orders are directed at a legal producer rather than an authored supplier", () => {
  const { state } = createWorld();
  const volatileOrder = listOrders(state, { buyerInstitutionId: "yard-exchange" })
    .find((order) => order.family === "volatile");
  assert.ok(volatileOrder, "Yard Exchange needs volatile");
  assert.ok(["scrap-forge", "blue-lantern"].includes(volatileOrder.supplierInstitutionId),
    "either legal volatile producer may win");
  assert.equal(volatileOrder.supplierInstitutionId, "blue-lantern",
    "the nearer viable producer wins this opening comparison");
  const industrialOrder = listOrders(state, { buyerInstitutionId: "scrap-forge" })
    .find((order) => order.family === "industrial");
  assert.ok(["the-ledge", "kiln-crossing"].includes(industrialOrder?.supplierInstitutionId),
    "either legal industrial producer may win");
});

test("hub five creates a real structural choice for Scrap Porch", () => {
  const { state } = createWorld();
  // Compare the opening suppliers in isolation; the normal initial update may
  // already have sold part of one supplier's finite capacity to another hub.
  state.hubProcurement.orders = {};
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (institution.accounts?.operating) institution.accounts.operating.committed = 0;
  });
  const candidates = evaluateSupplierCandidates(state, {
    buyerInstitutionId: "scrap-forge", family: "structural", units: 6,
  });
  const eligible = candidates.filter((candidate) => candidate.eligible);
  assert.deepEqual(new Set(eligible.map((candidate) => candidate.institutionId)), new Set(["yard-exchange", "morrow-shoal"]));
  assert.equal(candidates[0].institutionId, "morrow-shoal", "its low ask overcomes the somewhat longer opening route");
  assert.ok(candidates.every((candidate) => candidate.reasons.length > 0));
});

test("hub six creates a real industrial choice whose winner changes with operating conditions", () => {
  const { state } = createWorld();
  state.hubProcurement.orders = {};
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (institution.accounts?.operating) institution.accounts.operating.committed = 0;
  });
  const opening = evaluateSupplierCandidates(state, {
    buyerInstitutionId: "yard-exchange", family: "industrial", units: 6,
  });
  assert.deepEqual(
    new Set(opening.filter((candidate) => candidate.eligible).map((candidate) => candidate.institutionId)),
    new Set(["the-ledge", "kiln-crossing"]),
  );
  assert.equal(opening[0].institutionId, "kiln-crossing", "stock on hand can overcome the longer route");

  state.hubProcurement.orders["kiln-at-capacity"] = {
    id: "kiln-at-capacity", buyerInstitutionId: "scrap-forge", supplierInstitutionId: "kiln-crossing",
    family: "industrial", resourceId: "silicate", units: 12, deliveredUnits: 0, status: PROCUREMENT_STATUS.ACCEPTED,
  };
  const overflow = evaluateSupplierCandidates(state, {
    buyerInstitutionId: "yard-exchange", family: "industrial", units: 6,
  });
  assert.equal(overflow[0].institutionId, "the-ledge", "the alternative wins when the opening supplier is committed");
  assert.match(overflow.find((candidate) => candidate.institutionId === "kiln-crossing").reasons.join(" "), /capacity/);
});

test("supplier discovery ranks every legal producer by delivered cost, independent of definition order", () => {
  const { state } = createWorld();
  const fixture = addAlternativeVolatileSupplier(state);
  const forward = evaluateSupplierCandidates(state, {
    buyerInstitutionId: "yard-exchange", family: "volatile", units: 6,
    definitions: fixture.definitions, connections: fixture.connections,
  });
  const reversed = evaluateSupplierCandidates(state, {
    buyerInstitutionId: "yard-exchange", family: "volatile", units: 6,
    definitions: [...fixture.definitions].reverse(), connections: fixture.connections,
  });
  assert.equal(forward.filter((entry) => entry.eligible).length, 2, "both suppliers are real candidates");
  assert.equal(forward[0].institutionId, "north-well", "the shorter delivered route wins");
  assert.equal(reversed[0].institutionId, forward[0].institutionId, "authored order cannot decide the winner");
  assert.ok(forward.every((entry) => entry.reasons.length > 0), "every candidate explains its evaluation");
});

test("a higher supplier cost can outweigh a shorter route", () => {
  const { state } = createWorld();
  const fixture = addAlternativeVolatileSupplier(state);
  recordAcquisition(state, { institutionId: "north-well", itemId: "water-ice", units: 12, totalCost: 12 * 900 });
  const candidates = evaluateSupplierCandidates(state, {
    buyerInstitutionId: "yard-exchange", family: "volatile", units: 6,
    definitions: fixture.definitions, connections: fixture.connections,
  });
  assert.equal(candidates[0].institutionId, "scrap-forge", "the buyer chooses the cheaper delivered supply");
});

test("a full supplier loses to an available alternative", () => {
  const { state } = createWorld();
  const fixture = addAlternativeVolatileSupplier(state);
  state.hubProcurement.orders.busy = {
    id: "busy", buyerInstitutionId: "the-ledge", supplierInstitutionId: "north-well",
    family: "volatile", resourceId: "water-ice", units: 12, deliveredUnits: 0, status: PROCUREMENT_STATUS.ACCEPTED,
  };
  const candidates = evaluateSupplierCandidates(state, {
    buyerInstitutionId: "yard-exchange", family: "volatile", units: 6,
    definitions: fixture.definitions, connections: fixture.connections,
  });
  assert.equal(candidates[0].institutionId, "scrap-forge");
  const busy = candidates.find((entry) => entry.institutionId === "north-well");
  assert.equal(busy.eligible, false);
  assert.match(busy.reasons.join(" "), /capacity/);
});

test("a trusted supplier can win an otherwise equal delivered offer", () => {
  const { state } = createWorld();
  const fixture = addAlternativeVolatileSupplier(state, { distance: 1875 });
  state.relationships ??= { projections: {} };
  state.relationships.projections ??= {};
  state.relationships.projections["yard-exchange=>north-well"] = {
    fromId: "yard-exchange", toId: "north-well", trust: 1, reliability: 1,
    gratitude: 1, resentment: 0, familiarity: 1,
  };
  const candidates = evaluateSupplierCandidates(state, {
    buyerInstitutionId: "yard-exchange", family: "volatile", units: 6,
    definitions: fixture.definitions, connections: fixture.connections,
  });
  assert.equal(candidates[0].institutionId, "north-well", "goodwill shades the supplier ask enough to win");
});

test("trade lanes emerge between hubs without an authored route table", () => {
  const { state } = createWorld();
  const lanes = listOrders(state).map((order) => `${order.supplierInstitutionId}->${order.buyerInstitutionId}`);
  // The two lanes that never existed as authored routes are now real.
  assert.ok(lanes.some((lane) => ["the-ledge->scrap-forge", "kiln-crossing->scrap-forge"].includes(lane)),
    "a discovered industrial producer supplies Scrap Porch");
  assert.ok(lanes.some((lane) => lane.endsWith("->the-ledge")), "The Ledge discovers a volatile supplier");
  assert.ok(lanes.some((lane) => lane.startsWith("blue-lantern->")), "the fourth hub wins real business");
});

test("an order carries a price, a commitment, and its reasons", () => {
  const { state, hub } = createWorld();
  const order = listOrders(state, { status: [PROCUREMENT_STATUS.OFFERED, PROCUREMENT_STATUS.ACCEPTED] })[0];
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
  Object.values(state.logistics.institutions)
    .filter((institution) => institution.archetypeId === "settlement")
    .forEach(({ id: buyerInstitutionId }) => {
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
  procurement.update();
  // A sale widens the gap the supplier mines against — but only up to what it
  // has agreed to, since it now refuses to owe more than it can dig.
  const order = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })
    .find((entry) => entry.family === "volatile");
  assert.ok(order, "a volatile producer accepted business");
  const position = getInventoryPosition(state, order.supplierInstitutionId, "volatile");
  assert.ok(position.committedSales > 0, "the selected supplier owes volatile to somebody");
  assert.equal(position.target, position.ownTarget + position.committedSales,
    "and mines against its own need plus what it sold");
  assert.ok(position.target > position.ownTarget);
});

test("a supplier refuses to owe more than it can realistically dig", () => {
  const { state, procurement } = createWorld();
  for (let tick = 0; tick < 40; tick += 1) procurement.update();
  // Nothing is ever delivered here, so without a capacity limit the commitment
  // would grow without bound and the target with it.
  ["structural", "industrial", "volatile"].forEach((family) => {
    ["yard-exchange", "scrap-forge", "the-ledge"].forEach((hubId) => {
      const position = getInventoryPosition(state, hubId, family);
      assert.ok(position.committedSales <= 12,
        `${hubId} owes ${position.committedSales} ${family}, past what it can supply`);
    });
  });
  const refusals = state.ledger.getEventsAfterId(0).filter((entry) => entry.payload?.reason === "supplier-at-capacity");
  assert.ok(refusals.length > 0, "and it says every known supplier is committed");
});

test("a capacity refusal reopens when the supplier clears its book", () => {
  const world = advanceWorld();
  const order = listOrders(world.state)[0];
  const buyer = world.state.logistics.institutions[order.buyerInstitutionId];
  order.status = PROCUREMENT_STATUS.DECLINED;
  order.declinedReason = "supplier-at-capacity";
  order.declinedAt = world.now();
  order.pricePerUnit = 1_000;
  order.committedPayment = order.units * order.pricePerUnit;
  buyer.accounts.operating.committed = 0;

  const blockerId = "capacity-blocker";
  world.state.hubProcurement.orders[blockerId] = {
    id: blockerId, buyerInstitutionId: "someone-else",
    supplierInstitutionId: order.supplierInstitutionId,
    family: order.family, resourceId: order.resourceId,
    units: 12, deliveredUnits: 0, status: PROCUREMENT_STATUS.ACCEPTED,
  };
  world.tick(1);
  assert.equal(order.declinedReason, "supplier-at-capacity", "the refusal remains while the book is full");

  world.state.hubProcurement.orders[blockerId].status = PROCUREMENT_STATUS.DELIVERED;
  world.tick(1);
  assert.notEqual(order.declinedReason, "supplier-at-capacity", "capacity recovery is a real transition");
  assert.ok(world.state.ledger.getEventsAfterId(0).some((event) =>
    event.type === "procurement.capacityReopened" && event.payload.procurementOrderId === order.id));
});

test("a refused buyer waits before asking again instead of re-posting every tick", () => {
  const { state, procurement } = createWorld();
  for (let tick = 0; tick < 300; tick += 1) procurement.update();
  assert.ok(listOrders(state).length < 40,
    `the board stays legible, got ${listOrders(state).length} orders`);
});

test("a supplier refuses a sale below what the goods cost it", () => {
  const { state, procurement } = createWorld();
  const order = listOrders(state, { status: PROCUREMENT_STATUS.OFFERED })[0]
    ?? listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })[0];
  order.status = PROCUREMENT_STATUS.OFFERED;
  order.pricePerUnit = 10;
  order.committedPayment = order.units * 10;
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
  // Clear anything already sold and titled, too: an order that has completed
  // is legitimately still haulable.
  Object.values(state.logistics.institutions).forEach((institution) => { institution.awaitingPickup = {}; institution.saleReserve = {}; });
  Object.values(state.hubProcurement.orders).forEach((order) => {
    if (order.status === PROCUREMENT_STATUS.READY) order.status = PROCUREMENT_STATUS.ACCEPTED;
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
  // The supplier was paid when title passed, before any carrier was involved.
  const titled = state.ledger.getEventsAfterId(0)
    .find((entry) => entry.type === "procurement.titleTransferred" && entry.payload.procurementOrderId === order.id);
  assert.ok(titled, "title transferred and the supplier was paid for the goods");
  assert.equal(titled.payload.sellerId, order.supplierInstitutionId);
  assert.equal(titled.payload.ownedBy, order.buyerInstitutionId);
  assert.equal(shipment.goodsPayment, 0, "the carrier run does not buy the goods again");
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
  assert.ok(types.includes("procurement.titleTransferred"), "ownership changed hands before freight");
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
  Object.values(state.logistics.institutions)
    .filter((institution) => institution.archetypeId === "settlement")
    .forEach((institution) => { institution.accounts.operating.balance = 60_000; });
  const procurement = createHubProcurementOperation({ state, now: () => clock });
  return { state, procurement, tick: (seconds) => { clock += seconds * 1000; procurement.update(); }, now: () => clock };
}

test("a refused purchase is raised toward what the seller said it needs", () => {
  const world = advanceWorld();
  const order = listOrders(world.state)[0];
  // Lowball it and let the supplier refuse.
  order.status = PROCUREMENT_STATUS.OFFERED;
  order.pricePerUnit = 10;
  order.committedPayment = order.units * 10;
  world.tick(1);
  assert.equal(order.status, PROCUREMENT_STATUS.DECLINED, "the supplier refused");
  assert.ok(order.supplierFloor > 10, "and said what it would take");

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
  order.originalPricePerUnit = 300;
  order.pricePerUnit = 50;
  order.committedPayment = order.units * 50;
  world.tick(1);
  assert.equal(order.status, PROCUREMENT_STATUS.DECLINED, "refused at the low price");

  world.tick(90);
  assert.ok(order.pricePerUnit > 50, "the buyer moved");
  assert.notEqual(order.status, PROCUREMENT_STATUS.DECLINED,
    `and the order is live again rather than left dead at the old price (${order.declinedReason})`);
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
  order.originalPricePerUnit = 100;
  order.pricePerUnit = 100;
  order.supplierFloor = 100_000;     // a seller demanding the moon
  order.supplierAsk = 100_000;
  for (let tick = 0; tick < 6; tick += 1) world.tick(90);
  assert.ok(order.pricePerUnit <= 200, `capped at twice the opening price, got ${order.pricePerUnit}`);
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
  order.pricePerUnit = 10;
  order.committedPayment = order.units * 10;
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
  order.originalPricePerUnit = 100;
  order.pricePerUnit = 200;         // already at twice the opening price
  order.supplierFloor = 100_000;
  for (let tick = 0; tick < 5; tick += 1) world.tick(90);
  const exhausted = world.state.ledger.getEventsAfterId(0)
    .filter((entry) => entry.type === "procurement.repriceExhausted" && entry.payload.procurementOrderId === order.id);
  assert.equal(exhausted.length, 1, "reported once, not once per attempt");
});

// ── Conceding: the seller's half of the negotiation ────────────────────────
//
// Every repricing test above is a BUYER bidding up. These are the ones that
// push the other way, which is the only thing keeping prices from ratcheting.

// A hub that has overpaid for water ice in the past holds out to recover it,
// which is what makes the volatile lane jam at all.
//
// Pitched above the PRICE CEILING rather than above any observed bid: no
// procurement valuation may exceed 2.5x the base worth, so 900 against a
// 300 cr trade value is unreachable by construction. Tuning this to what a
// particular hub happened to bid broke the fixture twice — once when the hubs
// stopped sharing a temperament, once when empty-shelf urgency started working.
function overpayForWaterIce(state, unitCost = 900) {
  recordAcquisition(state, {
    institutionId: "scrap-forge", itemId: "water-ice", units: 200, totalCost: 200 * unitCost,
  });
}

function clearTheBoard(state) {
  Object.keys(state.hubProcurement.orders).forEach((id) => { delete state.hubProcurement.orders[id]; });
  Object.values(state.logistics.institutions)
    .filter((institution) => institution.archetypeId === "settlement")
    .forEach((hub) => {
    hub.saleReserve = {};
    hub.awaitingPickup = {};
    hub.accounts.operating.committed = 0;
  });
}

// Nobody needs anything: every shelf is full, so no hub posts an order and no
// hub owes one. Ore and no customers, which is what makes a seller come down.
function idleWorld() {
  const world = advanceWorld();
  overpayForWaterIce(world.state);
  clearTheBoard(world.state);
  Object.values(world.state.logistics.institutions)
    .filter((institution) => institution.archetypeId === "settlement")
    .forEach((institution) => {
      institution.inventories = { "iron-nickel": 5_000, "water-ice": 5_000, silicate: 5_000 };
    });
  return world;
}

// Scrap Porch alone is stuck: it holds more water ice than its own people will
// ever need, and wants more for it than the other hubs will pay.
function jammedVolatileWorld() {
  const world = advanceWorld();
  // This fixture intentionally tests bilateral concession behavior, so remove
  // the competing volatile supplier that the broader economy now discovers.
  delete world.state.logistics.institutions["blue-lantern"];
  delete world.state.logistics.institutions["person:blue-lantern-factor"];
  overpayForWaterIce(world.state);
  clearTheBoard(world.state);
  world.state.logistics.institutions["scrap-forge"].inventories = { "water-ice": 5_000 };
  return world;
}

test("a seller nobody is buying from comes down off its price", () => {
  const world = idleWorld();
  world.tick(1);
  assert.equal(getAskConcession(world.state, "scrap-forge", "water-ice"), 0, "it opens at its list price");

  for (let step = 0; step < 3; step += 1) world.tick(60);
  assert.ok(getAskConcession(world.state, "scrap-forge", "water-ice") > 0,
    `an idle seller should shade its ask, got ${getAskConcession(world.state, "scrap-forge", "water-ice")}`);

  const shaded = world.state.ledger.getEventsAfterId(0)
    .filter((entry) => entry.type === "institution.askShaded" && entry.payload.itemId === "water-ice");
  assert.ok(shaded.length > 0, "and says so on the record");
  assert.ok(shaded[0].payload.reasons.length >= 2, "with reasons, not just a number");
  assert.ok(shaded[0].payload.unitCost < shaded[0].payload.firmCost, "the price it holds out for has moved down");
});

test("a seller never comes down below what the next unit would cost it", () => {
  const world = idleWorld();
  for (let step = 0; step < 10; step += 1) world.tick(60);
  assert.equal(getAskConcession(world.state, "scrap-forge", "water-ice"), 1, "it gave away the whole margin");

  const shaded = world.state.ledger.getEventsAfterId(0)
    .filter((entry) => entry.type === "institution.askShaded" && entry.payload.itemId === "water-ice");
  const last = shaded[shaded.length - 1].payload;
  assert.equal(last.unitCost, last.marginalCost, "down to what digging one more would cost");
  assert.ok(last.marginalCost > 0, "and no further — nobody digs at a loss to make a sale");
});

test("a seller with business again firms its price back up", () => {
  const world = idleWorld();
  for (let step = 0; step < 10; step += 1) world.tick(60);
  assert.equal(getAskConcession(world.state, "scrap-forge", "water-ice"), 1, "fully conceded while idle");

  // Yard Exchange runs dry and starts buying volatile again.
  // Isolate Scrap Porch so this test measures its response rather than the
  // normal competitive choice of Blue Lantern.
  delete world.state.logistics.institutions["blue-lantern"];
  delete world.state.logistics.institutions["person:blue-lantern-factor"];
  world.state.logistics.institutions["yard-exchange"].inventories = {};
  world.tick(1);
  // Enough business that its book is no longer slack, which is what ends the
  // discount — a trickle would not, and should not.
  assert.ok(getCommittedSupply(world.state, "scrap-forge", "volatile") >= 6,
    `Scrap Porch has a full book, got ${getCommittedSupply(world.state, "scrap-forge", "volatile")}`);
  world.tick(60);
  assert.equal(getAskConcession(world.state, "scrap-forge", "water-ice"), 0.5,
    "and takes the discount back faster than it gave it away");
});

test("a seller that has come down takes an offer it already refused, without the buyer moving", () => {
  const world = jammedVolatileWorld();
  const { state } = world;
  // Pin EVERY buyer on this lane at its ceiling: each is already offering twice
  // what it first judged the ore to be worth, so none has anything left to
  // give. Pinning only one is not enough — its unpinned neighbour simply bids
  // up, wins the ore, and fills the seller's book, which correctly ends the
  // discount and proves nothing about who moved.
  const pinEveryBuyer = () => listOrders(state, { supplierInstitutionId: "scrap-forge", status: PROCUREMENT_STATUS.DECLINED })
    .forEach((entry) => { entry.originalPricePerUnit = Math.floor(entry.pricePerUnit / 2); });

  world.tick(1);
  pinEveryBuyer();
  // The best offer standing, so the test does not depend on which hub happens
  // to be first in the list — they no longer bid alike.
  const order = listOrders(state, { supplierInstitutionId: "scrap-forge", status: PROCUREMENT_STATUS.DECLINED })
    .sort((first, second) => second.pricePerUnit - first.pricePerUnit)[0];
  assert.ok(order, "the lane is jammed: Scrap Porch wants more than anyone will pay");
  const pinned = order.pricePerUnit;

  for (let step = 0; step < 6; step += 1) {
    world.tick(60);
    pinEveryBuyer();
    if (state.hubProcurement.orders[order.id]?.status !== PROCUREMENT_STATUS.DECLINED) break;
  }

  const settled = state.hubProcurement.orders[order.id];
  assert.ok(settled, "the order was still on the board");
  assert.notEqual(settled.status, PROCUREMENT_STATUS.DECLINED, "the deal closed");
  assert.equal(settled.pricePerUnit, pinned, "and the buyer never moved — the seller came to it");

  const counter = state.ledger.getEventsAfterId(0)
    .find((entry) => entry.type === "procurement.counterOffered" && entry.payload.procurementOrderId === order.id);
  assert.ok(counter, "the seller came back rather than waiting to be asked again");
  assert.ok(counter.payload.floor < counter.payload.previousFloor,
    `on better terms than it first demanded (${counter.payload.floor} vs ${counter.payload.previousFloor})`);
  assert.ok(counter.payload.reasons.length >= 2, "and explains the change of mind");
});

// ── Contract-reserved supply: the four buckets stay separate ───────────────

test("ore mined against a sale leaves the seller's own stock", () => {
  const { state, procurement, hub } = createWorld();
  const order = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })[0];
  isolateAcceptedOrder(state, hub, order);
  const supplier = hub(order.supplierInstitutionId);
  supplier.inventories[order.resourceId] = order.units;
  procurement.update();
  assert.equal(supplier.inventories[order.resourceId] ?? 0, 0,
    "the ore is no longer the seller's to spend");
});

test("a seller cannot consume what it has reserved for a sale", () => {
  const { state, procurement, hub } = createWorld();
  const order = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })[0];
  isolateAcceptedOrder(state, hub, order);
  const supplier = hub(order.supplierInstitutionId);
  // Give it exactly what it owes and nothing spare.
  supplier.inventories = { [order.resourceId]: order.units };
  procurement.update();
  const free = supplier.inventories[order.resourceId] ?? 0;
  assert.equal(free, 0, "nothing is left on the shelf for its own production");
});

test("the sale completes when the reserve is whole, and title passes", () => {
  const { state, procurement, hub } = createWorld();
  const order = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })[0];
  const supplier = hub(order.supplierInstitutionId);
  const buyer = hub(order.buyerInstitutionId);
  isolateAcceptedOrder(state, hub, order);
  const sellerBefore = supplier.accounts.operating.balance;
  const buyerBefore = buyer.accounts.operating.balance;

  supplier.inventories[order.resourceId] = order.units;
  procurement.update();

  assert.equal(state.hubProcurement.orders[order.id].status, PROCUREMENT_STATUS.READY);
  const price = order.committedPayment;
  assert.equal(supplier.accounts.operating.balance - sellerBefore, price, "the seller was paid");
  assert.equal(buyerBefore - buyer.accounts.operating.balance, price, "the buyer paid, once");

  const held = supplier.awaitingPickup[order.id];
  assert.ok(held, "the goods are on a manifest");
  assert.equal(held.ownerInstitutionId, order.buyerInstitutionId, "owned by the buyer");
  assert.equal(held.heldAtInstitutionId, order.supplierInstitutionId, "still sitting at the seller");
  assert.equal(held.units, order.units);
  assert.match(held.manifestId, /^MANIFEST-/);
});

test("goods awaiting pickup belong to the buyer, not the hub holding them", () => {
  const { state, procurement, hub } = createWorld();
  const order = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })[0];
  isolateAcceptedOrder(state, hub, order);
  const supplier = hub(order.supplierInstitutionId);
  supplier.inventories[order.resourceId] = order.units;
  procurement.update();
  assert.equal(getAwaitingPickup(state, order.supplierInstitutionId, order.resourceId), order.units,
    "held at the seller");
  assert.equal(supplier.inventories[order.resourceId] ?? 0, 0,
    "and not counted as the seller's own stock");
});

test("a partly filled reserve does not complete the sale", () => {
  const { state, procurement, hub } = createWorld();
  const order = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })[0];
  const supplier = hub(order.supplierInstitutionId);
  const sellerBefore = supplier.accounts.operating.balance;
  // Clear opening stock AND anything already set aside, so the reserve holds
  // strictly less than is owed.
  supplier.inventories = { [order.resourceId]: Math.max(1, order.units - 1) };
  supplier.saleReserve = {};
  procurement.update();
  assert.equal(state.hubProcurement.orders[order.id].status, PROCUREMENT_STATUS.ACCEPTED, "still owed");
  assert.equal(supplier.accounts.operating.balance, sellerBefore, "and nobody has been paid");
  assert.ok(getSaleReserve(state, order.supplierInstitutionId, order.resourceId) > 0, "but what arrived is set aside");
});

test("an earlier contract is filled before a later one", () => {
  const { state, procurement, hub } = createWorld();
  const accepted = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED });
  const pair = accepted.filter((entry) => entry.supplierInstitutionId === accepted[0].supplierInstitutionId
    && entry.resourceId === accepted[0].resourceId);
  if (pair.length < 2) return;   // only one contract on this material this run
  const [first, second] = pair.sort((a, b) => (a.acceptedAt ?? 0) - (b.acceptedAt ?? 0));
  const supplier = hub(first.supplierInstitutionId);
  supplier.inventories[first.resourceId] = first.units;
  procurement.update();
  assert.equal(state.hubProcurement.orders[first.id].status, PROCUREMENT_STATUS.READY, "the earlier one filled");
  assert.equal(state.hubProcurement.orders[second.id].status, PROCUREMENT_STATUS.ACCEPTED, "the later one waits");
});
