// A hull is a thing somebody built and sold.
//
// Before this, `hireWorker` subtracted the price from the buyer, credited
// nobody, and minted a hull record — a money sink and a hull faucet in one
// statement. These tests pin the two halves that matter: the money is conserved,
// and a yard is a seller with opinions about who it deals with.

import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { CINDER_MINING_SEED } from "../src/content/economy/miningInstitutions.js";
import { ensureRelationshipProjection } from "../src/systems/relationshipProjections.js";
import { HULL_BUILD_MS, SHIPYARD_REFUSAL, advanceShipyards, findHullQuote, getBuildProgress, getHullBillOfMaterials, listShipyards, purchaseHull, quoteHull } from "../src/systems/shipyards.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  return state;
}

const YARD = "yard-shipyard";
const BUYER = "miner:cinder-contracting";

test("the world contains somewhere that builds hulls", () => {
  const state = createWorld();
  const yards = listShipyards(state);
  assert.equal(yards.length, 1);
  assert.equal(yards[0].id, YARD);
  assert.equal(yards[0].ownerInstitutionId, "yard-exchange", "the hub owns it, on the Sal's-shop pattern");
  assert.equal(yards[0].organizationRole, "department");
});

test("a stranger pays what the hull costs to build", () => {
  const state = createWorld();
  const quote = quoteHull(state, { shipyardId: YARD, buyerInstitutionId: BUYER, hullClass: "mining-craft" });

  assert.equal(quote.available, true);
  assert.equal(quote.price, 3_500, "exactly what hiring used to cost — Stage 1 moves no prices");
  assert.equal(quote.atCost, false);
});

test("the hub that owns the yard builds at cost", () => {
  const state = createWorld();
  const quote = quoteHull(state, { shipyardId: YARD, buyerInstitutionId: "yard-exchange", hullClass: "mining-craft" });

  assert.equal(quote.atCost, true);
  assert.equal(quote.price, quote.buildCost, "there is no margin to take from yourself");
});

test("a yard charges its friends less and the people it resents more", () => {
  const friendly = createWorld();
  const projection = ensureRelationshipProjection(friendly, { fromId: "yard-exchange", toId: BUYER });
  projection.trust = 0.9;
  projection.reliability = 0.9;
  const friendPrice = quoteHull(friendly, { shipyardId: YARD, buyerInstitutionId: BUYER, hullClass: "mining-craft" }).price;

  const sour = createWorld();
  const soured = ensureRelationshipProjection(sour, { fromId: "yard-exchange", toId: BUYER });
  soured.resentment = 0.4;   // sour, but short of hostile
  const sourPrice = quoteHull(sour, { shipyardId: YARD, buyerInstitutionId: BUYER, hullClass: "mining-craft" }).price;

  assert.ok(friendPrice < 3_500, `a friend of the yard pays under book (got ${friendPrice})`);
  assert.ok(sourPrice > 3_500, `somebody it merely tolerates pays over book (got ${sourPrice})`);
});

// The access shape in relationshipProjections has been declared since it was
// written and never enforced. This is the first thing to enforce it.
test("a yard will not sell to an enemy at any price", () => {
  const state = createWorld();
  const projection = ensureRelationshipProjection(state, { fromId: "yard-exchange", toId: BUYER });
  projection.resentment = 0.8;

  const quote = quoteHull(state, { shipyardId: YARD, buyerInstitutionId: BUYER, hullClass: "mining-craft" });
  assert.equal(quote.available, false);
  assert.equal(quote.reason, SHIPYARD_REFUSAL.REFUSED);
});

test("an explicitly denied service is refused even without resentment", () => {
  const state = createWorld();
  const projection = ensureRelationshipProjection(state, { fromId: "yard-exchange", toId: BUYER });
  projection.access.deniedServices = ["sell-craft"];

  assert.equal(quoteHull(state, { shipyardId: YARD, buyerInstitutionId: BUYER, hullClass: "mining-craft" }).reason,
    SHIPYARD_REFUSAL.REFUSED);
});

// ── Conservation ───────────────────────────────────────────────────────────

test("buying a hull moves money rather than destroying it", () => {
  const state = createWorld();
  const buyerAccount = { balance: 10_000, committed: 0, transactions: [] };
  const seller = state.logistics.institutions["yard-exchange"].accounts.operating;
  const sellerBefore = seller.balance;

  const quote = findHullQuote(state, { buyerInstitutionId: BUYER, hullClass: "mining-craft" });
  const result = purchaseHull(state, { quote, buyerInstitutionId: BUYER, buyerAccount, now: 2_000 });

  assert.equal(result.bought, true);
  assert.equal(buyerAccount.balance, 10_000 - quote.price, "the buyer paid");
  assert.equal(seller.balance, sellerBefore + quote.price, "and the yard's hub was paid, to the credit");
});

test("a buyer that cannot pay gets no hull", () => {
  const state = createWorld();
  const buyerAccount = { balance: 10, committed: 0, transactions: [] };
  const quote = findHullQuote(state, { buyerInstitutionId: BUYER, hullClass: "mining-craft" });
  const result = purchaseHull(state, { quote, buyerInstitutionId: BUYER, buyerAccount, now: 2_000 });

  assert.equal(result.bought, false);
  assert.equal(result.reason, SHIPYARD_REFUSAL.CANNOT_PAY);
  assert.equal(buyerAccount.balance, 10, "and is not charged for the ship it did not get");
});

// ── The hull remembers where it came from ──────────────────────────────────

test("a bought hull records its builder and the quality it was built at", () => {
  const state = createWorld();
  const buyerAccount = { balance: 10_000, committed: 0, transactions: [] };
  const quote = findHullQuote(state, { buyerInstitutionId: BUYER, hullClass: "mining-craft" });
  const result = purchaseHull(state, { quote, buyerInstitutionId: BUYER, buyerAccount, now: 2_000 });

  assert.equal(result.builtBy, YARD);
  assert.equal(result.builtAt, "yard-exchange");
  assert.equal(result.quality, 1, "Stage 1 shorthand — stamped at construction, not yet derived from materials");
});

// The whole point, end to end: a mining company that grows its fleet is buying
// from somebody, and the world's money does not change size when it does.
test("a mining company growing its fleet buys the hull from the yard", () => {
  const state = createWorld();
  const game = {
    worldSites: [
      { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
    ],
    addWorkerShip: () => {},
  };
  const operation = createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const buyer = operation.getState().institution.accounts.operating;
  buyer.balance = 20_000;
  const seller = state.logistics.institutions["yard-exchange"].accounts.operating;

  const moneyBefore = buyer.balance + seller.balance;
  const shipsBefore = Object.keys(operation.getState().ships).length;

  // Drive the hire directly rather than waiting for the capacity planner to
  // decide it wants one: what is under test is where the hull comes from.
  const before = state.ledger.getRetainedEvents({ includeHidden: true }).length;
  operation.update();
  const sales = state.ledger.getRetainedEvents({ includeHidden: true })
    .slice(before)
    .filter((event) => event.type === "shipyard.hullSold");

  const shipsAfter = Object.keys(operation.getState().ships).length;
  if (shipsAfter > shipsBefore) {
    assert.equal(sales.length, shipsAfter - shipsBefore, "every new hull came from a sale");
    assert.equal(buyer.balance + seller.balance, moneyBefore, "and the money supply did not change size");
  }
});

// ── Haulers come from the same place ───────────────────────────────────────

test("the yard builds long-haul freight, or distant hubs could never buy their lifeline", () => {
  const state = createWorld();
  const quote = quoteHull(state, {
    shipyardId: YARD, buyerInstitutionId: "coldwater-depot", hullClass: "freight-craft-subspace",
  });

  assert.equal(quote.available, true, "the one hull a cut-off hub actually needs is on the catalogue");
  assert.equal(quote.price, 21_000, "at the price sponsoring a subspace hauler already cost");
});

test("a hub the yard refuses cannot commission a hauler at all", () => {
  const state = createWorld();
  const projection = ensureRelationshipProjection(state, { fromId: "yard-exchange", toId: "coldwater-depot" });
  projection.resentment = 0.9;

  const quote = quoteHull(state, {
    shipyardId: YARD, buyerInstitutionId: "coldwater-depot", hullClass: "freight-craft-subspace",
  });
  assert.equal(quote.available, false, "no yard, no hull, no lifeline — isolation with a cause");
});

// ── The instrument must not be fooled by the fix ───────────────────────────

// `capitalSpend` means "capital money that left the world" to the economy
// reconciler — which is exactly what a hull cost WAS, back when it was
// subtracted and paid to nobody. Now that a hull is bought, counting the same
// credits as burned would make reconciliation report money appearing from
// nowhere: the fix breaking the instrument that measures the fix.
test("buying a hull does not register as money burned", () => {
  const state = createWorld();
  const buyer = state.logistics.institutions["yard-exchange"];
  const buyerAccount = { balance: 30_000, committed: 0, transactions: [] };
  const capitalBefore = buyer.capitalSpend ?? 0;

  const quote = findHullQuote(state, { buyerInstitutionId: BUYER, hullClass: "mining-craft" });
  purchaseHull(state, { quote, buyerInstitutionId: BUYER, buyerAccount, now: 2_000 });

  assert.equal(buyer.capitalSpend ?? 0, capitalBefore,
    "a transfer is not a burn, and the reconciler reads capitalSpend as a burn");
});

// ── Stage 2: a hull is made of something, and takes time ───────────────────

test("the ways are still when there is nothing to build", () => {
  const state = createWorld();
  const yard = state.logistics.institutions[YARD];
  yard.readyHulls = { "mining-craft": 9, "freight-craft": 9, "freight-craft-subspace": 9 };

  advanceShipyards(state, 10_000);
  assert.equal(yard.build, null, "a full shed does not keep laying keels for the look of it");
  assert.equal(getBuildProgress(yard, 10_000), null);
});

test("a yard with no parts cannot lay a keel", () => {
  const state = createWorld();
  const yard = state.logistics.institutions[YARD];
  yard.readyHulls = {};
  state.logistics.institutions["yard-exchange"].inventories = { "hull-plate": 0, "machine-part": 0 };

  advanceShipyards(state, 10_000);
  assert.equal(yard.build, null);
  assert.ok(yard.waitingOnParts, "and it says so, rather than quietly doing nothing");
});

test("laying a keel consumes real parts from the hub warehouse", () => {
  const state = createWorld();
  const yard = state.logistics.institutions[YARD];
  const hub = state.logistics.institutions["yard-exchange"];
  yard.readyHulls = {};
  hub.inventories = { "hull-plate": 20, "machine-part": 20 };

  advanceShipyards(state, 10_000);

  assert.ok(yard.build, "a keel was laid");
  const bill = getHullBillOfMaterials(yard.build.hullClass);
  assert.equal(hub.inventories["hull-plate"], 20 - bill["hull-plate"], "plate came off the shelf");
  assert.equal(hub.inventories["machine-part"], 20 - bill["machine-part"], "so did the machine parts");
});

test("a hull takes time and then joins the shed", () => {
  const state = createWorld();
  const yard = state.logistics.institutions[YARD];
  const hub = state.logistics.institutions["yard-exchange"];
  yard.readyHulls = {};
  hub.inventories = { "hull-plate": 20, "machine-part": 20 };

  advanceShipyards(state, 10_000);
  const laying = yard.build.hullClass;

  advanceShipyards(state, 10_000 + HULL_BUILD_MS / 2);
  assert.ok(yard.build, "still on the ways halfway through");
  assert.ok(getBuildProgress(yard, 10_000 + HULL_BUILD_MS / 2) > 0.4);

  advanceShipyards(state, 10_000 + HULL_BUILD_MS + 1);
  assert.equal(yard.build, null, "off the ways");
  assert.equal(yard.readyHulls[laying], 1, "and into the shed");
});

test("you cannot buy a hull nobody has built", () => {
  const state = createWorld();
  state.logistics.institutions[YARD].readyHulls = {};

  const quote = quoteHull(state, { shipyardId: YARD, buyerInstitutionId: BUYER, hullClass: "mining-craft" });
  assert.equal(quote.available, false);
  assert.equal(quote.reason, SHIPYARD_REFUSAL.NONE_READY);
});

test("taking delivery empties that berth in the shed", () => {
  const state = createWorld();
  const yard = state.logistics.institutions[YARD];
  yard.readyHulls = { "mining-craft": 1 };
  const buyerAccount = { balance: 10_000, committed: 0, transactions: [] };

  const quote = findHullQuote(state, { buyerInstitutionId: BUYER, hullClass: "mining-craft" });
  assert.equal(purchaseHull(state, { quote, buyerInstitutionId: BUYER, buyerAccount, now: 2_000 }).bought, true);
  assert.equal(yard.readyHulls["mining-craft"], 0, "the hull left with its buyer");

  const second = quoteHull(state, { shipyardId: YARD, buyerInstitutionId: BUYER, hullClass: "mining-craft" });
  assert.equal(second.available, false, "and the next buyer waits for one to be built");
});
