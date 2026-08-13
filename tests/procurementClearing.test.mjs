// A seller answering everyone who asked, in one clearing.
//
// `considerOffers` used to walk the offered orders in creation order and accept
// greedily against live capacity, so the FIRST offer written to a supplier took
// the room. Creation order comes from `postNeeds`, which iterates
// `listSettlementIds` — `Object.values(logistics.institutions)`, i.e. SEED
// INSERTION ORDER. Whichever settlement happened to be defined first in the
// content files got served first whenever a supplier was oversubscribed, and it
// read as commercial advantage when it was really array order.
//
// Same bug `extractionMarket` was built to remove on the buying side.

import assert from "node:assert/strict";
import test from "node:test";
import {
  PROCUREMENT_STATUS,
  createHubProcurementOperation,
  getCommittedSupply,
  listOrders,
} from "../src/systems/hubProcurement.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

const MAX_OUTSTANDING_SALE_UNITS = 12;

// The Ledge sells `silicate` into the industrial family, and asks 1,800 for a
// six-unit lot. Every bid below is written well clear of that floor, so what is
// being measured is the seller CHOOSING between offers it would all accept —
// not refusing the cheap ones on price and coincidentally landing on the right
// answer.
const SUPPLIER = "the-ledge";
const FAMILY = "industrial";
const RESOURCE = "silicate";

function createWorld(now = () => 1_000) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  Object.values(state.logistics.institutions)
    .filter((institution) => institution.archetypeId === "settlement")
    .forEach((institution) => {
      institution.accounts.operating.balance = 60_000;
      // Stock every shelf, so no settlement has a real gap and `postNeeds`
      // posts nothing of its own. The offers in these tests are the only
      // demand in the world, which is what makes the outcome readable.
      ["iron-nickel", "aluminum", "silicate", "water-ice"].forEach((resourceId) => {
        institution.inventories[resourceId] = 200;
      });
    });
  const procurement = createHubProcurementOperation({ state, now });
  state.hubProcurement.orders = {};
  return { state, procurement };
}

// Put a supplier in front of more demand than it can carry, with the CHEAPEST
// offer written first — which is exactly the order the old code rewarded.
function oversubscribe(state, bids) {
  state.hubProcurement.orders = {};
  bids.forEach(([buyerInstitutionId, pricePerUnit], index) => {
    const id = `TEST-${index + 1}`;
    state.hubProcurement.orders[id] = {
      id,
      buyerInstitutionId, supplierInstitutionId: SUPPLIER,
      family: FAMILY, resourceId: RESOURCE,
      units: 6, deliveredUnits: 0,
      pricePerUnit, committedPayment: 6 * pricePerUnit,
      originalPricePerUnit: pricePerUnit,
      status: PROCUREMENT_STATUS.OFFERED,
      createdAt: 1_000 + index,
      supplierCandidates: [],
    };
  });
}

// "Served" is any order the seller AGREED to, not just one still sitting at
// `accepted`. These worlds stock every shelf so the seller already holds the
// goods, which promotes an accepted order straight to `ready` in the same tick.
const SERVED = [PROCUREMENT_STATUS.ACCEPTED, PROCUREMENT_STATUS.READY, PROCUREMENT_STATUS.SHIPPED, PROCUREMENT_STATUS.DELIVERED];

const servedOrders = (state) => listOrders(state, { supplierInstitutionId: SUPPLIER })
  .filter((order) => SERVED.includes(order.status));

const servedBuyers = (state) => servedOrders(state).map((order) => order.buyerInstitutionId).sort();

// ── The fix ─────────────────────────────────────────────────────────────────

test("a seller facing more demand than capacity takes the best-paying offers", () => {
  const { state, procurement } = createWorld();
  // Four buyers, six units each, twelve units of book: only two can be served.
  // Written cheapest-first, so arrival order and merit disagree completely.
  oversubscribe(state, [["yard-exchange", 400], ["scrap-forge", 500], ["blue-lantern", 900], ["morrow-shoal", 1_200]]);

  procurement.update();

  assert.deepEqual(servedBuyers(state), ["blue-lantern", "morrow-shoal"].sort(),
    "the two best-paying buyers won, not the two written first");
  assert.equal(state.hubProcurement.orders["TEST-1"].declinedReason, "supplier-at-capacity",
    "and the cheap ones lost on room, not on price");
  assert.equal(state.hubProcurement.orders["TEST-2"].declinedReason, "supplier-at-capacity");
});

test("a seller never promises more than its book can carry", () => {
  const { state, procurement } = createWorld();
  oversubscribe(state, [["yard-exchange", 900], ["scrap-forge", 900], ["blue-lantern", 900], ["morrow-shoal", 900]]);

  procurement.update();
  assert.ok(getCommittedSupply(state, SUPPLIER, FAMILY) <= MAX_OUTSTANDING_SALE_UNITS);
});

// The refusal has to be falsifiable. A buyer told only "at capacity" cannot
// tell being outbid from being unlucky — the hole `getMarketOutbid` closes on
// the extraction side.
test("a buyer refused for room is told who took it instead", () => {
  const { state, procurement } = createWorld();
  oversubscribe(state, [["yard-exchange", 400], ["blue-lantern", 900], ["morrow-shoal", 1_200]]);

  procurement.update();

  const refused = state.hubProcurement.orders["TEST-1"];
  assert.equal(refused.status, PROCUREMENT_STATUS.DECLINED);
  assert.equal(refused.declinedReason, "supplier-at-capacity");
  assert.ok(refused.reasons.some((reason) => /took .* first/.test(reason)),
    `the refusal names who got the room, got: ${refused.reasons.join(" | ")}`);

  const declined = state.ledger.getEventsAfterId(0)
    .find((event) => event.type === "procurement.orderDeclined" && event.payload.procurementOrderId === "TEST-1");
  assert.ok(declined.payload.preferredBuyerIds?.length > 0, "and the event carries them for the observer");
});

// Price is a judgement about the goods, not about the competition. An offer
// below what the material costs the seller is refused whoever else is asking,
// so capacity is only ever shared out among offers it would genuinely take.
test("an offer below the seller's cost is refused on price, not on room", () => {
  const { state, procurement } = createWorld();
  oversubscribe(state, [["yard-exchange", 1], ["blue-lantern", 900]]);

  procurement.update();
  assert.equal(state.hubProcurement.orders["TEST-1"].declinedReason, "below-supplier-cost");
  assert.ok(SERVED.includes(state.hubProcurement.orders["TEST-2"].status), "the viable offer was taken");
});

// ── Order must not decide the outcome ───────────────────────────────────────

test("the order offers were written in does not decide who wins", () => {
  const bids = [["yard-exchange", 400], ["scrap-forge", 700], ["blue-lantern", 500], ["morrow-shoal", 1_100]];
  const winners = (ordering) => {
    const { state, procurement } = createWorld();
    oversubscribe(state, ordering);
    procurement.update();
    return servedBuyers(state);
  };

  assert.deepEqual(winners(bids), winners([...bids].reverse()),
    "the same buyers win whichever way round the board was written");
  assert.deepEqual(winners(bids), ["morrow-shoal", "scrap-forge"].sort(), "and they are the two best-paying");
});

test("two identical offers break their tie the same way every run", () => {
  const bids = [["yard-exchange", 900], ["scrap-forge", 900], ["blue-lantern", 900]];
  const run = () => {
    const { state, procurement } = createWorld();
    oversubscribe(state, bids);
    procurement.update();
    return servedOrders(state).map((order) => order.id).sort();
  };

  assert.deepEqual(run(), run(), "a dead heat resolves deterministically");
  assert.equal(run().length, 2, "and it still only sells what it can carry");
});

// ── A losing buyer can answer ───────────────────────────────────────────────

// Repricing used to skip capacity refusals entirely, on the reasoning that
// "paying more does not conjure ore". True while the room went to whoever asked
// first; false now that the seller ranks on price. Without this an outbid buyer
// would be starved with no way to respond.
test("a buyer outbid for room is allowed to bid its way back in", () => {
  let clock = 1_000;
  const { state, procurement } = createWorld(() => clock);
  oversubscribe(state, [["yard-exchange", 400], ["blue-lantern", 900], ["morrow-shoal", 1_200]]);

  procurement.update();
  const outbid = state.hubProcurement.orders["TEST-1"];
  assert.equal(outbid.declinedReason, "supplier-at-capacity");
  const priceBefore = outbid.pricePerUnit;

  // Past the repricing throttle.
  clock += 90_000;
  procurement.update();

  assert.ok(outbid.pricePerUnit > priceBefore,
    `the outbid buyer raised its offer (${priceBefore} -> ${outbid.pricePerUnit})`);
});
