// Intentions: one question — "what is this actor committed to?" — answerable of
// every actor that can commit to anything.
//
// The coverage assertions matter as much as the shape ones. Hubs and carriers
// were absent from this layer while the entire hub economy was built on them,
// so a test that simply walks every committing system is the thing that stops
// it drifting again.

import assert from "node:assert/strict";
import test from "node:test";
import {
  INTENTION_KIND,
  INTENTION_STATUS,
  adaptHubPurchase,
  adaptHubSale,
  adaptShipment,
  collectIntentions,
  getActiveActorIntentions,
  getReservedResources,
  isActorCommitted,
  mayReconsider,
} from "../src/systems/intentions.js";
import { PROCUREMENT_STATUS, createHubProcurementOperation, listOrders } from "../src/systems/hubProcurement.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  ["yard-exchange", "scrap-forge", "the-ledge"].forEach((id) => {
    state.logistics.institutions[id].accounts.operating.balance = 60_000;
  });
  const procurement = createHubProcurementOperation({ state, now: () => 1_000 });
  return { state, procurement };
}

// ── Both halves of a trade ─────────────────────────────────────────────────

test("a purchase order commits the buyer and the seller separately", () => {
  const { state } = createWorld();
  const order = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })[0];
  assert.ok(order, "somebody agreed to sell");

  const buyer = adaptHubPurchase(order);
  const seller = adaptHubSale(order);
  assert.equal(buyer.actorId, order.buyerInstitutionId);
  assert.equal(seller.actorId, order.supplierInstitutionId);
  assert.notEqual(buyer.id, seller.id, "two commitments, not one shared record");
  assert.equal(buyer.kind, INTENTION_KIND.PROCUREMENT);
  assert.equal(seller.kind, INTENTION_KIND.SUPPLY);
});

test("the two sides tie up different things", () => {
  const { state } = createWorld();
  const order = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })[0];
  assert.equal(getReservedResources(adaptHubPurchase(order)).committedPayment, order.committedPayment,
    "the buyer has money set aside");
  assert.equal(getReservedResources(adaptHubSale(order)).units, order.units,
    "the seller owes ore");
});

test("an offer nobody has answered binds only the buyer", () => {
  const { state } = createWorld();
  const order = listOrders(state)[0];
  order.status = PROCUREMENT_STATUS.OFFERED;
  assert.ok(adaptHubPurchase(order), "the buyer has already committed its money");
  assert.equal(adaptHubSale(order), null, "the supplier has agreed to nothing");
});

test("a buyer still negotiating may change its mind; one that has agreed may not", () => {
  const { state } = createWorld();
  const order = listOrders(state)[0];

  order.status = PROCUREMENT_STATUS.OFFERED;
  assert.equal(mayReconsider(adaptHubPurchase(order)), true, "an unanswered offer is revisitable");

  order.status = PROCUREMENT_STATUS.ACCEPTED;
  assert.equal(mayReconsider(adaptHubPurchase(order)), false, "an agreed price is not");
  assert.equal(mayReconsider(adaptHubSale(order)), false, "and neither side walks away from it");
});

test("a refused order is a failed commitment that says why", () => {
  const { state } = createWorld();
  const order = listOrders(state)[0];
  order.status = PROCUREMENT_STATUS.DECLINED;
  order.declinedReason = "supplier-at-capacity";

  const buyer = adaptHubPurchase(order);
  assert.equal(buyer.status, INTENTION_STATUS.FAILED);
  assert.equal(buyer.outcomeReason, "supplier-at-capacity");
});

test("a delivered order releases what both sides had tied up", () => {
  const { state } = createWorld();
  const order = listOrders(state)[0];
  order.status = PROCUREMENT_STATUS.DELIVERED;
  order.deliveredUnits = order.units;

  const buyer = adaptHubPurchase(order);
  const seller = adaptHubSale(order);
  assert.equal(buyer.status, INTENTION_STATUS.COMPLETED);
  assert.equal(seller.status, INTENTION_STATUS.COMPLETED);
  assert.equal(getReservedResources(buyer).committedPayment, 0, "the money is no longer held");
  assert.equal(getReservedResources(seller).units, 0, "and neither is the ore");
});

// ── Carriers ───────────────────────────────────────────────────────────────

test("a shipment is the ship's commitment, not the carrier's", () => {
  const shipment = {
    id: "SHIP-0001", assigneeId: "hauler-yard-scrap", containerId: "CONT-0001",
    commodity: "water-ice", quantity: 6, payment: 400, destinationSiteId: "yard-exchange",
    status: "loaded", createdAt: 1_000, manifestId: "MANIFEST-HPO-0001",
  };
  const intention = adaptShipment(shipment);
  assert.equal(intention.actorId, "hauler-yard-scrap", "the ship is what cannot be redirected");
  assert.equal(intention.kind, INTENTION_KIND.TRANSPORT);
  assert.equal(intention.status, INTENTION_STATUS.ACTIVE);
  assert.equal(getReservedResources(intention).containerId, "CONT-0001");
  assert.equal(getReservedResources(intention).manifestId, "MANIFEST-HPO-0001",
    "prepaid freight carries somebody else's property, and says whose");
  assert.equal(mayReconsider(intention), false, "a loaded hauler is never released mid-run");
});

// ── Coverage: the thing that drifted before ────────────────────────────────

test("every system that commits an actor is represented", () => {
  const { state } = createWorld();
  state.logistics.shipments["SHIP-0001"] = {
    id: "SHIP-0001", assigneeId: "hauler-yard-scrap", containerId: "CONT-0001",
    commodity: "water-ice", quantity: 6, payment: 400, destinationSiteId: "yard-exchange",
    status: "assigned", createdAt: 1_000,
  };

  const intentions = collectIntentions(state);
  const kinds = new Set(intentions.map((entry) => entry.kind));
  assert.ok(kinds.has(INTENTION_KIND.PROCUREMENT), "hubs buying");
  assert.ok(kinds.has(INTENTION_KIND.SUPPLY), "hubs selling");
  assert.ok(kinds.has(INTENTION_KIND.TRANSPORT), "carriers hauling");

  intentions.forEach((entry) => {
    assert.ok(entry.actorId, `every intention names who holds it (${entry.id})`);
    assert.ok(entry.source?.system, `and which system is authoritative for it (${entry.id})`);
  });
});

test("a hub can be asked what it is committed to, the same way a ship can", () => {
  const { state } = createWorld();
  const order = listOrders(state, { status: PROCUREMENT_STATUS.ACCEPTED })[0];
  assert.ok(order);

  assert.equal(isActorCommitted(state, order.supplierInstitutionId), true,
    "a settlement that has agreed to sell is busy");
  const active = getActiveActorIntentions(state, order.supplierInstitutionId);
  assert.ok(active.length > 0);
  assert.ok(active.every((entry) => entry.status === INTENTION_STATUS.ACTIVE));
});

test("intention ids are stable and unique across both sides of every order", () => {
  const { state } = createWorld();
  const ids = collectIntentions(state).map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, `no duplicate intention ids, got ${ids.length}`);
});
