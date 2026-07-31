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
import { getResourceFamily } from "../src/systems/resourceDefinitions.js";

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

test("on-hand counts every material in the family, not one named ore", () => {
  const { hub } = createWorld();
  const yard = hub("yard-exchange");
  yard.inventories = { "iron-nickel": 2, aluminum: 3, titanium: 1, "water-ice": 9 };
  assert.equal(getResourceFamily("aluminum"), "structural");
  assert.equal(getFamilyOnHand(yard, "structural"), 6, "iron-nickel + aluminum + titanium");
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
  const ships = Object.keys(state.logistics.haulers).map((id) => ({
    id, dockedSiteId: state.logistics.haulers[id].currentSiteId, wear: 0,
    operationalStatus: "seeking-work", activeShipmentId: null, assignment: null,
    transfers: [],
    canAcceptRoute: () => true,
    assignShipment(assignment) { this.assignment = assignment; return true; },
    queueCargoTransfer(transfer) { this.transfers.push(transfer); },
    clearShipment() { this.assignment = null; },
  }));
  const manager = createLogisticsManager({ state, ships, now: () => 1_000 });
  return { state, manager, ships };
}

test("a hub that gives up material is paid for it", () => {
  const { state, manager } = createFreightWorld();
  const before = Object.fromEntries(["yard-exchange", "scrap-forge", "the-ledge"]
    .map((id) => [id, state.logistics.institutions[id].accounts.operating.balance]));
  manager.update();

  const shipment = Object.values(state.logistics.shipments)[0];
  assert.ok(shipment, "a shipment was created");
  assert.ok(shipment.goodsPayment > 0, "the goods themselves carry a price");
  const seller = state.logistics.institutions[shipment.sourceInstitutionId];
  // A hub can sell into one lane and buy on another in the same tick, so read
  // the sale off its books rather than netting its balance.
  const sale = seller.accounts.operating.transactions.find((entry) => entry.type === "goods-sale" && entry.referenceId === shipment.templateId);
  assert.ok(sale, "the sale is on the supplying institution's books");
  assert.equal(sale.amount, shipment.goodsPayment, "paid exactly the sale price");
  assert.ok(shipment.goodsPayment >= shipment.quantity, "and material is never given away for pennies");
  assert.ok(before[shipment.sourceInstitutionId] !== undefined);
});

test("the buyer pays for the goods and the freight separately", () => {
  const { state, manager } = createFreightWorld();
  manager.update();
  const shipment = Object.values(state.logistics.shipments)[0];
  const buyer = state.logistics.institutions[shipment.destinationInstitutionId];
  const purchase = buyer.accounts.operating.transactions.find((entry) => entry.type === "goods-purchase");
  assert.ok(purchase, "the buyer booked a goods purchase");
  assert.equal(Math.abs(purchase.amount), shipment.goodsPayment);
  assert.notEqual(shipment.goodsPayment, shipment.payment,
    "the sale and the haulage are separate amounts");
});

test("a sale is recorded with both sides and moves no value out of the world", () => {
  const { state, manager } = createFreightWorld();
  const totalCash = () => Object.values(state.logistics.institutions)
    .reduce((sum, institution) => sum + (institution.accounts?.operating?.balance ?? 0), 0);
  const before = totalCash();
  manager.update();
  const sales = state.ledger.getEventsAfterId(0).filter((entry) => entry.type === "logistics.goodsSold");
  assert.ok(sales.length > 0);
  assert.ok(sales[0].payload.sellerId && sales[0].payload.buyerId);
  assert.ok(sales[0].payload.price > 0);
  // Buying goods only moves credits between institutions.
  assert.equal(totalCash(), before, "a sale between institutions is a transfer, not a leak");
});

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
