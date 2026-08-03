import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import {
  AUTHORITY_OFFICE_SITE_ID,
  ensureGateBounty,
  getGateBountyOffer,
  redeemGateTrophy,
} from "../src/systems/gateBounty.js";

const trophy = (tradeValue) => ({ type: "rift-trophy", tradeValue, quantity: 1 });

test("the bounty fund stands up with a balance", () => {
  const state = createGameState();
  const bounty = ensureGateBounty(state);
  assert.ok(bounty.fund > 0);
  assert.equal(bounty.officeSiteId, AUTHORITY_OFFICE_SITE_ID);
});

test("a trophy is worth its level-fixed value, but only at the authority office", () => {
  const state = createGameState();
  const atOffice = getGateBountyOffer(state, AUTHORITY_OFFICE_SITE_ID, trophy(640));
  assert.equal(atOffice.redeemable, true);
  assert.equal(atOffice.payout, 640);

  const elsewhere = getGateBountyOffer(state, "the-ledge", trophy(640));
  assert.equal(elsewhere.redeemable, false);
  assert.equal(elsewhere.reason, "wrong-office");
});

test("redeeming at the office pays the bearer from the authority's fund", () => {
  const state = createGameState();
  const fundBefore = ensureGateBounty(state).fund;
  const result = redeemGateTrophy(state, { siteId: AUTHORITY_OFFICE_SITE_ID, unit: trophy(500) });
  assert.equal(result.redeemed, true);
  assert.equal(result.total, 500);
  assert.equal(ensureGateBounty(state).fund, fundBefore - 500, "the fund is the source of the payout");
  assert.equal(ensureGateBounty(state).paidCumulative, 500);
  assert.ok(state.ledger.getRecentEvents(10, { includeHidden: true }).some((event) => event.type === "authority.gateBountyPaid"));
});

test("a trophy cannot be turned in anywhere but the office", () => {
  const state = createGameState();
  const fundBefore = ensureGateBounty(state).fund;
  const result = redeemGateTrophy(state, { siteId: "blue-lantern", unit: trophy(500) });
  assert.equal(result.redeemed, false);
  assert.equal(result.reason, "wrong-office");
  assert.equal(ensureGateBounty(state).fund, fundBefore, "no money moves on a refused redemption");
});

test("an exhausted fund refuses rather than paying money it does not have", () => {
  const state = createGameState();
  ensureGateBounty(state).fund = 300;
  const result = redeemGateTrophy(state, { siteId: AUTHORITY_OFFICE_SITE_ID, unit: trophy(500) });
  assert.equal(result.redeemed, false);
  assert.equal(result.reason, "authority-underfunded");
  assert.equal(result.shortfall, 200);
  assert.equal(ensureGateBounty(state).fund, 300, "the fund is untouched");
  assert.ok(state.ledger.getRecentEvents(10, { includeHidden: true }).some((event) => event.type === "authority.gateBountyUnfunded"));
});

test("a higher-level gate is worth more, whoever turns its token in", () => {
  const state = createGameState();
  const small = redeemGateTrophy(state, { siteId: AUTHORITY_OFFICE_SITE_ID, unit: trophy(200) });
  const big = redeemGateTrophy(state, { siteId: AUTHORITY_OFFICE_SITE_ID, unit: trophy(1_200) });
  assert.ok(big.total > small.total, "the token from the bigger rift pays more");
});
