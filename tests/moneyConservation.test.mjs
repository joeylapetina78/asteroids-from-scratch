// Money is conserved, and every payout has a payer.
//
// The economy tab reported a 100% residual — every credit the player gained was
// unexplained — because the paths that paid the player did not take the money
// from anybody. An ore sale credited the pilot from nowhere and destroyed the
// cargo; a contract reward and a loan principal were conjured; and payments the
// player MADE were deleted rather than delivered to the payee.
//
// These tests exist so that can never quietly come back. Each one asserts the
// only thing that really matters: after the transaction, the world holds exactly
// as much money as before, and somebody real is on the other side of it.

import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { sellMaterialToHub, getHubWholesalePrice } from "../src/systems/hubInventory.js";
import {
  creditPayee,
  getIssuerCommitments,
  getIssuerEndowment,
  payFromIssuer,
} from "../src/systems/contractTreasury.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  return state;
}

// Everything in the world that holds credits.
function totalMoney(state) {
  return Object.values(state.logistics.institutions)
    .reduce((sum, institution) => sum + (institution.accounts?.operating?.balance ?? 0), 0);
}

// ── Selling material to a hub ───────────────────────────────────────────────

test("a sale moves money and material rather than creating either", () => {
  const state = createWorld();
  const hub = state.logistics.institutions["yard-exchange"];
  const before = { cash: hub.accounts.operating.balance, ore: hub.inventories["iron-nickel"] ?? 0 };

  const sale = sellMaterialToHub(state, { siteId: "yard-exchange", resourceId: "iron-nickel", units: 10 });

  assert.equal(sale.acceptedUnits, 10);
  assert.equal(hub.accounts.operating.balance, before.cash - sale.payment,
    "the buyer is out of pocket by exactly what it paid");
  assert.equal(hub.inventories["iron-nickel"] ?? 0, before.ore + 10,
    "and it received the material it paid for — the cargo does not evaporate");
});

test("a hub that cannot pay buys nothing and says why", () => {
  const state = createWorld();
  const hub = state.logistics.institutions["yard-exchange"];
  // A settlement opens holding working stock of what it mines, so the shelf is
  // not empty to begin with — what matters is that it does not GROW.
  const shelfBefore = hub.inventories["iron-nickel"] ?? 0;
  hub.accounts.operating.balance = 0;

  const sale = sellMaterialToHub(state, { siteId: "yard-exchange", resourceId: "iron-nickel", units: 10 });

  assert.equal(sale.acceptedUnits, 0);
  assert.equal(sale.payment, 0);
  assert.equal(sale.reason, "buyer-cannot-fund");
  assert.equal(hub.inventories["iron-nickel"] ?? 0, shelfBefore, "and it takes nothing it did not pay for");
});

// Being able to run out of money is the whole point: it is what stops any holder
// of ore from being an unlimited credit faucet.
test("a hub buys only as much as it can afford", () => {
  const state = createWorld();
  const hub = state.logistics.institutions["yard-exchange"];
  const price = getHubWholesalePrice("iron-nickel");
  hub.accounts.operating.balance = price * 3;

  const sale = sellMaterialToHub(state, { siteId: "yard-exchange", resourceId: "iron-nickel", units: 10 });

  assert.equal(sale.acceptedUnits, 3, "a partial fill, not a free ten");
  assert.equal(sale.reason, "buyer-partly-funded");
  assert.equal(hub.accounts.operating.balance, 0);
});

test("a dock that trades under another name still pays from the right pocket", () => {
  const state = createWorld();
  const forge = state.logistics.institutions["scrap-forge"];
  const before = forge.accounts.operating.balance;

  const sale = sellMaterialToHub(state, { siteId: "scrap-porch", resourceId: "iron-nickel", units: 4 });

  assert.equal(sale.buyerId, "scrap-forge");
  assert.equal(forge.accounts.operating.balance, before - sale.payment);
});

// ── Contract rewards and loans ──────────────────────────────────────────────

test("an issuer opens holding what its authored contracts promise", () => {
  const commitments = getIssuerCommitments("Yard Exchange Finance Office");
  assert.ok(commitments > 0, "the Finance Office does promise money somewhere");
  assert.ok(getIssuerEndowment("Yard Exchange Finance Office") >= commitments,
    "so it can always honour what the content already committed it to");
});

test("issuers exist from world creation, not on first payment", () => {
  const state = createWorld();
  const offices = Object.values(state.logistics.institutions).filter((i) => i.archetypeId === "office");
  assert.ok(offices.length >= 2, "contract issuers are real organisations with real accounts");
  offices.forEach((office) => {
    assert.ok(office.accounts.operating.balance > 0, `${office.name} has money to pay with`);
  });
});

test("a reward leaves the issuer's account", () => {
  const state = createWorld();
  const before = totalMoney(state);
  const rook = state.logistics.institutions["rook-industries"];
  const rookBefore = rook.accounts.operating.balance;

  const payout = payFromIssuer(state, { issuer: "Rook", amount: 1000, referenceId: "test" });

  assert.equal(payout.paid, 1000);
  assert.equal(rook.accounts.operating.balance, rookBefore - 1000, "somebody is poorer for having paid you");
  assert.equal(totalMoney(state), before - 1000,
    "the credits left the institutions and are now the player's — not created alongside them");
});

test("an issuer that cannot cover a reward refuses instead of conjuring it", () => {
  const state = createWorld();
  const rook = state.logistics.institutions["rook-industries"];
  rook.accounts.operating.balance = 10;

  const payout = payFromIssuer(state, { issuer: "Rook", amount: 1000, referenceId: "test" });

  assert.equal(payout.paid, 0);
  assert.equal(payout.funded, false);
  assert.equal(payout.reason, "issuer-underfunded");
  assert.equal(rook.accounts.operating.balance, 10, "and it is not overdrawn");
});

// A hub posting its own job funds it from its own account rather than from an
// invented office.
test("a contract issued by a real institution is paid by that institution", () => {
  const state = createWorld();
  const ledge = state.logistics.institutions["the-ledge"];
  const before = ledge.accounts.operating.balance;

  const payout = payFromIssuer(state, { issuer: "The Ledge", institutionId: "the-ledge", amount: 700, referenceId: "test" });

  assert.equal(payout.paid, 700);
  assert.equal(payout.institutionId, "the-ledge");
  assert.equal(ledge.accounts.operating.balance, before - 700);
});

test("an issuer nobody has banked is reported rather than allowed to print", () => {
  const state = createWorld();
  const payout = payFromIssuer(state, { issuer: "Some Unbanked Cartel", amount: 500, referenceId: "test" });

  assert.equal(payout.paid, 0);
  assert.equal(payout.funded, false);
  assert.equal(payout.reason, "no-treasury");
});

// ── The other direction ─────────────────────────────────────────────────────

// The mirror of a faucet is a sink, and it hides just as well: a leak and a sink
// cancel in a total while both are wrong.
test("money the player pays reaches the payee instead of leaving the world", () => {
  const state = createWorld();
  const lender = state.logistics.institutions["yard-exchange-finance"];
  const before = { total: totalMoney(state), lender: lender.accounts.operating.balance };

  const receipt = creditPayee(state, { payeeEntityId: "institution:yard-exchange-finance", amount: 5000, referenceId: "test" });

  assert.equal(receipt.credited, 5000);
  assert.equal(lender.accounts.operating.balance, before.lender + 5000);
  assert.equal(totalMoney(state), before.total + 5000, "the repayment arrived somewhere real");
});

test("a payee with no account is named rather than silently swallowing the money", () => {
  const state = createWorld();
  const before = totalMoney(state);

  const receipt = creditPayee(state, { payeeEntityId: "institution:nobody-at-all", amount: 500, referenceId: "test" });

  assert.equal(receipt.credited, 0);
  assert.equal(receipt.reason, "payee-has-no-account");
  assert.equal(totalMoney(state), before, "and nothing was invented to cover it");
});

// ── A full round trip ───────────────────────────────────────────────────────

test("borrow, sell, and repay leaves the world's money exactly where it started", () => {
  const state = createWorld();
  const start = totalMoney(state);
  let pilot = 0;

  const loan = payFromIssuer(state, { issuer: "Yard Exchange Finance Office", amount: 8000, referenceId: "round-trip" });
  pilot += loan.paid;

  const sale = sellMaterialToHub(state, { siteId: "yard-exchange", resourceId: "iron-nickel", units: 25 });
  pilot += sale.payment;

  creditPayee(state, { payeeEntityId: "institution:yard-exchange-finance", amount: 8000, referenceId: "round-trip" });
  pilot -= 8000;

  assert.equal(totalMoney(state) + pilot, start,
    "every credit is still accounted for — the world plus the pilot is unchanged");
  assert.equal(pilot, sale.payment, "and the pilot is up exactly what the hub paid for the ore");
});
