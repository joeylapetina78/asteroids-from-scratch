import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createExtractionOffer, registerExtractionOfferSource } from "../src/systems/extractionOffers.js";
import {
  clearExtractionMarket,
  getMarketAssignment,
  getMarketOutbid,
  registerExtractionMarketParticipant,
} from "../src/systems/extractionMarket.js";

// A bidder that values every offer at a fixed number, so a test can state the
// ranking it means instead of reverse-engineering travel costs.
function flatBidder(id, netValue, { controllerId = `${id}-owner`, waitingSince = null, per = {} } = {}) {
  return {
    id,
    name: id,
    controllerId,
    waitingSince,
    bid: (offer) => {
      const value = per[offer.id] ?? netValue;
      return { acceptable: value > 0, reasons: [`${id} values ${offer.id} at ${value}`], metrics: { netValue: value } };
    },
  };
}

function offerWorld(offers) {
  const state = createGameState();
  registerExtractionOfferSource(state, "test-offers", () => offers);
  return state;
}

const oneOffer = () => [createExtractionOffer({
  id: "contested", issuerInstitutionId: "somebody", siteId: "yard-exchange",
  resourceId: "iron-nickel", amount: 6, paymentPerUnit: 400,
})];

// ── the point of the whole module ──────────────────────────────────────────
//
// Before this, whichever mining company's `update()` ran first took first
// refusal on every order, and the second only ever saw the remainder. These lock
// down that neither registering first nor asking first can win anything.

test("the highest bid takes the order whichever way round the field is built", () => {
  const registrationOrder = [["low-co", "high-co"], ["high-co", "low-co"]];
  registrationOrder.forEach(([first, second]) => {
    const bidders = { "low-co": () => [flatBidder("low-ship", 100)], "high-co": () => [flatBidder("high-ship", 300)] };
    const state = offerWorld(oneOffer());
    registerExtractionMarketParticipant(state, first, bidders[first]);
    registerExtractionMarketParticipant(state, second, bidders[second]);

    const round = clearExtractionMarket(state, { allocations: {} });
    assert.equal(getMarketAssignment(round, "high-ship")?.offer.id, "contested",
      `the better bid won when ${first} registered first`);
    assert.equal(getMarketAssignment(round, "low-ship"), null,
      `${second} did not lose the order by registering second`);
  });
});

test("a company that joins later is in the very next clearing", () => {
  const state = offerWorld(oneOffer());
  registerExtractionMarketParticipant(state, "early-co", () => [flatBidder("early-ship", 100)]);
  assert.equal(getMarketAssignment(clearExtractionMarket(state, { allocations: {} }), "early-ship")?.offer.id, "contested");

  // Exactly what `main.js` does: the second mining company is constructed after
  // the first has already updated once.
  registerExtractionMarketParticipant(state, "late-co", () => [flatBidder("late-ship", 300)]);
  const second = clearExtractionMarket(state, { allocations: {} });
  assert.equal(getMarketAssignment(second, "late-ship")?.offer.id, "contested");
  assert.equal(getMarketAssignment(second, "early-ship"), null, "and it wins on its bid, with no seniority to overcome");
});

// ── explaining the loss ────────────────────────────────────────────────────

test("a ship that loses an auction learns what beat it, and by how much", () => {
  const state = offerWorld(oneOffer());
  registerExtractionMarketParticipant(state, "low-co", () => [flatBidder("low-ship", 100)]);
  registerExtractionMarketParticipant(state, "high-co", () => [flatBidder("high-ship", 300)]);

  const outbid = getMarketOutbid(clearExtractionMarket(state, { allocations: {} }), "low-ship");
  assert.equal(outbid.orderId, "contested");
  assert.equal(outbid.ownNetValue, 100);
  assert.equal(outbid.winnerId, "high-ship");
  assert.equal(outbid.winnerControllerId, "high-ship-owner");
  assert.equal(outbid.winningNetValue, 300);
});

test("a ship with nothing acceptable to bid on is not reported as outbid", () => {
  const state = offerWorld(oneOffer());
  registerExtractionMarketParticipant(state, "broke-co", () => [flatBidder("broke-ship", -5)]);
  const round = clearExtractionMarket(state, { allocations: {} });
  assert.equal(getMarketAssignment(round, "broke-ship"), null);
  assert.equal(getMarketOutbid(round, "broke-ship"), null, "losing an auction and finding no work are different facts");
});

// ── rounds ─────────────────────────────────────────────────────────────────

test("re-clearing after the winner commits leaves everyone else exactly where they were", () => {
  // The reason it is safe not to cache a round: the second company re-clears
  // over a world where the first company's ships are gone and their orders are
  // taken, and gets the same answer the one shared ranking gave it.
  const offers = [
    createExtractionOffer({ id: "rich", siteId: "yard-exchange", resourceId: "iron-nickel", amount: 6, paymentPerUnit: 900 }),
    createExtractionOffer({ id: "thin", siteId: "scrap-porch", resourceId: "silicate", amount: 6, paymentPerUnit: 100 }),
  ];
  const state = offerWorld(offers);
  registerExtractionMarketParticipant(state, "a-co", () => [flatBidder("a-ship", 0, { per: { rich: 500, thin: 90 } })]);
  registerExtractionMarketParticipant(state, "b-co", () => [flatBidder("b-ship", 0, { per: { rich: 400, thin: 80 } })]);

  const shared = clearExtractionMarket(state, { allocations: {} });
  assert.equal(getMarketAssignment(shared, "a-ship").offer.id, "rich");
  assert.equal(getMarketAssignment(shared, "b-ship").offer.id, "thin");

  // a-co has now dispatched and committed; b-co clears for itself.
  const state2 = offerWorld(offers);
  registerExtractionMarketParticipant(state2, "b-co", () => [flatBidder("b-ship", 0, { per: { rich: 400, thin: 80 } })]);
  const afterCommit = clearExtractionMarket(state2, { allocations: { "allocation:1": { orderId: "rich", status: "active" } } });
  assert.equal(getMarketAssignment(afterCommit, "b-ship").offer.id, "thin",
    "the loser's fallback is the same order the shared ranking already gave it");
});

// ── what an issuer's own terms still decide ────────────────────────────────

test("an exclusive offer takes one supplier and a concurrent one takes several", () => {
  const exclusive = createExtractionOffer({ id: "exclusive", siteId: "yard-exchange", resourceId: "iron-nickel", amount: 6, paymentPerUnit: 400 });
  const shared = createExtractionOffer({ id: "shared", siteId: "scrap-porch", resourceId: "silicate", amount: 6, paymentPerUnit: 300, concurrent: true });

  const state = offerWorld([exclusive, shared]);
  // Both ships want the exclusive order most; only one can have it, and the
  // other falls to the concurrent one rather than sitting idle.
  registerExtractionMarketParticipant(state, "one-co", () => [flatBidder("one-ship", 0, { per: { exclusive: 500, shared: 200 } })]);
  registerExtractionMarketParticipant(state, "two-co", () => [flatBidder("two-ship", 0, { per: { exclusive: 400, shared: 200 } })]);
  registerExtractionMarketParticipant(state, "three-co", () => [flatBidder("three-ship", 0, { per: { exclusive: 300, shared: 250 } })]);

  const round = clearExtractionMarket(state, { allocations: {} });
  assert.equal(getMarketAssignment(round, "one-ship").offer.id, "exclusive");
  assert.equal(getMarketAssignment(round, "two-ship").offer.id, "shared");
  assert.equal(getMarketAssignment(round, "three-ship").offer.id, "shared",
    "an issuer that said it can take several suppliers gets them in the same round");
});

test("work already committed elsewhere is not re-auctioned", () => {
  const state = offerWorld(oneOffer());
  registerExtractionMarketParticipant(state, "a-co", () => [flatBidder("a-ship", 300)]);
  const round = clearExtractionMarket(state, {
    allocations: { "allocation:1": { orderId: "contested", status: "active" } },
  });
  assert.equal(getMarketAssignment(round, "a-ship"), null);
  assert.equal(round.offerCount, 0);
});

// ── tie-breaks ─────────────────────────────────────────────────────────────

test("a dead heat goes to whoever has been waiting longest, not to whoever sorts first", () => {
  const state = offerWorld(oneOffer());
  registerExtractionMarketParticipant(state, "aaa-co", () => [flatBidder("aaa-ship", 200, { waitingSince: 9_000 })]);
  registerExtractionMarketParticipant(state, "zzz-co", () => [flatBidder("zzz-ship", 200, { waitingSince: 1_000 })]);

  const round = clearExtractionMarket(state, { allocations: {} });
  assert.equal(getMarketAssignment(round, "zzz-ship")?.offer.id, "contested",
    "the ship that has been idle longer takes the tied order");
  assert.equal(getMarketAssignment(round, "aaa-ship"), null);
});

test("a badly-behaved bidder does not take the clearing down with it", () => {
  const state = offerWorld(oneOffer());
  registerExtractionMarketParticipant(state, "broken-co", () => { throw new Error("boom"); });
  registerExtractionMarketParticipant(state, "throwing-bidder-co", () => [{
    id: "throwing-ship", bid: () => { throw new Error("bad valuation"); },
  }]);
  registerExtractionMarketParticipant(state, "sound-co", () => [flatBidder("sound-ship", 100)]);

  const round = clearExtractionMarket(state, { allocations: {} });
  assert.equal(getMarketAssignment(round, "sound-ship")?.offer.id, "contested");
});
