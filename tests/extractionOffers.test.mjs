// Extraction offers: work anyone can post, that anyone who digs can value.
//
// The thing being protected here is that the MINER contains no knowledge of who
// issues work. Every test below that adds an issuer does so without touching a
// line of the mining system.

import assert from "node:assert/strict";
import test from "node:test";
import {
  createExtractionOffer,
  listExtractionOfferSources,
  listExtractionOffers,
  registerExtractionOfferSource,
  unregisterExtractionOfferSource,
} from "../src/systems/extractionOffers.js";
// Imported for their registrations: the hub source lives with the miner, the
// procurement source lives with SPRC.
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { createSprcOperation } from "../src/systems/sprcOperation.js";
import { inspectActor } from "../src/systems/actorInspector.js";
import { collectIntentions } from "../src/systems/intentions.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

function seededState() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  return state;
}

const WORLD_SITES = [
  { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
  { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
  { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
];

function createMining(state) {
  const sprc = createSprcOperation({ state, now: () => 1_000 });
  sprc.update();
  return createMiningOperation({
    state,
    game: { worldSites: WORLD_SITES, addWorkerShip: () => {} },
    sprcOperation: sprc,
    now: () => 1_000,
  });
}

// ── The registry ───────────────────────────────────────────────────────────

test("the two issuers that exist today register themselves against the world", () => {
  const state = seededState();
  assert.deepEqual(listExtractionOfferSources(state), [], "an empty world has nobody offering work");
  createMining(state);
  const sources = listExtractionOfferSources(state);
  assert.ok(sources.includes("hub-standing-orders"), "settlements post extraction work");
  assert.ok(sources.includes("sprc-procurement"), "and so does SPRC, from its own module");
});

// The registry lives on `state` rather than in the module because `?v=` cache
// busting makes `foo.js` and `foo.js?v=x` separate module instances — a
// module-level registry would fork between the game and these tests.
test("two worlds do not share issuers", () => {
  const first = seededState();
  const second = seededState();
  registerExtractionOfferSource(first, "only-here", () => []);
  assert.ok(listExtractionOfferSources(first).includes("only-here"));
  assert.ok(!listExtractionOfferSources(second).includes("only-here"));
});

test("a source that fails is skipped rather than taking the board down", () => {
  const state = seededState();
  registerExtractionOfferSource(state, "broken", () => { throw new Error("issuer exploded"); });
  registerExtractionOfferSource(state, "fine", () => [createExtractionOffer({ id: "ok", siteId: "yard-exchange", resourceId: "silicate", amount: 1 })]);
  const offers = listExtractionOffers(state);
  assert.ok(offers.some((offer) => offer.id === "ok"), "the working issuer is still seen");
});

test("an offer fills in what a valuer needs but an issuer should not have to state", () => {
  const offer = createExtractionOffer({ id: "x", siteId: "the-ledge", resourceId: "iron-nickel", amount: 4, paymentPerUnit: 300 });
  assert.equal(offer.harvestTarget, 4, "harvesting defaults to what was actually asked for");
  assert.equal(offer.sellsSurplus, false, "and nothing is assumed about selling a remainder");
  assert.equal(offer.resourceName, "iron nickel");
  assert.equal(offer.siteName, "the-ledge");
  assert.equal(offer.reserve, null, "an issuer that needs no reservation supplies none");
});

// ── The two built-in issuers ───────────────────────────────────────────────

test("settlements appear on the board through the same surface as anyone else", () => {
  const state = seededState();
  const mining = createMining(state);
  mining.update();

  const offers = listExtractionOffers(state, { allocations: state.miningOperation.allocations, at: 1_000, harvestCapacity: 6 });
  const hubOffers = offers.filter((offer) => offer.kind === "standing");
  assert.ok(hubOffers.length > 0, "hubs are asking for ore");
  hubOffers.forEach((offer) => {
    assert.ok(offer.issuerInstitutionId, "every offer names who pays");
    assert.ok(offer.paymentPerUnit > 0, "and what it pays");
  });
});

test("a hub with no right to a family posts nothing, through the shared rule checker", () => {
  const state = seededState();
  const grant = Object.values(state.worldRecords.authorityGrants)
    .find((entry) => entry.holderId === "institution:yard-exchange" && entry.jurisdictionId === "hub:yard-exchange");
  assert.ok(grant, "the seeded grant exists");
  grant.limits = { resourceFamilies: ["conductor"] };

  const state2 = state;
  const mining = createMining(state2);
  mining.update();
  const offers = listExtractionOffers(state2, { allocations: state2.miningOperation.allocations, at: 1_000, harvestCapacity: 6 });
  assert.ok(!offers.some((offer) => offer.issuerInstitutionId === "yard-exchange" && offer.resourceId === "iron-nickel"),
    "Yard Exchange cannot commission structural extraction it holds no right to");
});

// ── The point of the whole thing ───────────────────────────────────────────

test("a brand-new issuer can hire a miner without any change to the mining system", () => {
  const state = seededState();
  const mining = createMining(state);
  mining.update();

  const before = listExtractionOffers(state, { allocations: state.miningOperation.allocations, at: 1_000, harvestCapacity: 6 });
  assert.ok(!before.some((offer) => offer.issuerInstitutionId === "sunward-acre"), "the farm is not on the board yet");

  // Tavi wants water ice. This is the entire integration: one registration.
  let reserved = false;
  registerExtractionOfferSource(state, "sunward-acre-inputs", () => [createExtractionOffer({
    id: "sunward-water-1",
    issuerInstitutionId: "sunward-acre",
    siteId: "scrap-porch", siteName: "Scrap Porch",
    resourceId: "water-ice",
    amount: 6, paymentPerUnit: 420,
    reserve: () => { reserved = true; return true; },
    source: { system: "farmOperation", record: "procurementOrder" },
  })]);

  const offers = listExtractionOffers(state, { allocations: state.miningOperation.allocations, at: 1_000, harvestCapacity: 6 });
  const farmOffer = offers.find((offer) => offer.issuerInstitutionId === "sunward-acre");
  assert.ok(farmOffer, "the farm's work is on the same board as the settlements'");
  assert.equal(farmOffer.resourceId, "water-ice");
  assert.equal(farmOffer.paymentPerUnit, 420);
  assert.equal(reserved, false, "and nothing is reserved merely by being looked at");

  unregisterExtractionOfferSource(state, "sunward-acre-inputs");
  assert.ok(!listExtractionOffers(state, { allocations: {}, at: 1_000, harvestCapacity: 6 })
    .some((offer) => offer.issuerInstitutionId === "sunward-acre"), "and it leaves the board when withdrawn");
});

test("a worker is actually dispatched against an outside issuer's offer", () => {
  const state = seededState();
  let reserveCalls = 0;
  registerExtractionOfferSource(state, "test-rich-issuer", () => [createExtractionOffer({
    id: "rich-offer",
    issuerInstitutionId: "somebody-new",
    siteId: "scrap-porch", siteName: "Scrap Porch",
    resourceId: "water-ice",
    amount: 6, paymentPerUnit: 5_000,
    reserve: () => { reserveCalls += 1; return true; },
  })]);

  const mining = createMining(state);
  const worker = mining.workers.find((entry) => entry.assignment?.contractId === "rich-offer");
  assert.ok(worker, "a worker committed to work posted by an institution the miner has never heard of");
  assert.equal(worker.assignment.resourceId, "water-ice");
  assert.equal(worker.assignment.quantity, 6);
  assert.equal(reserveCalls, 1, "the issuer was asked to hold the units exactly once, at commitment");

  const allocation = Object.values(mining.getState().allocations).find((entry) => entry.orderId === "rich-offer");
  assert.ok(allocation, "and the commitment is recorded as an allocation like any other");
  assert.equal(allocation.status, "active");
});

test("an issuer that withdraws at the last moment is not dispatched against", () => {
  const state = seededState();
  registerExtractionOfferSource(state, "test-withdrawing-issuer", () => [createExtractionOffer({
    id: "withdrawn-offer",
    issuerInstitutionId: "somebody-fickle",
    siteId: "scrap-porch", siteName: "Scrap Porch",
    resourceId: "water-ice",
    amount: 6, paymentPerUnit: 9_000,
    // Somebody else took these units between valuing and committing.
    reserve: () => false,
  })]);

  const mining = createMining(state);
  assert.ok(!Object.values(mining.getState().allocations).some((entry) => entry.orderId === "withdrawn-offer"),
    "no allocation is created against an offer the issuer pulled");
});

// ── chooseOrder is a question, not an action ───────────────────────────────
//
// It may evaluate and select. It must not reserve, create an intention, spend
// money, or begin work — those belong to explicit commitment steps. Locking
// this down is what makes it safe for deliberation, diagnostics and
// comparative-choice displays to ask an actor what it would do.

test("asking a miner what it would take does not commit it to anything", () => {
  const state = seededState();
  const mining = createMining(state);
  mining.update();

  let reserveCalls = 0;
  registerExtractionOfferSource(state, "test-reserving-issuer", () => [createExtractionOffer({
    id: "tempting-offer",
    issuerInstitutionId: "somebody-new",
    siteId: "scrap-porch", siteName: "Scrap Porch",
    resourceId: "water-ice",
    amount: 6, paymentPerUnit: 9_000,
    reserve: () => { reserveCalls += 1; return true; },
  })]);

  const before = {
    allocations: JSON.stringify(state.miningOperation.allocations),
    intentions: collectIntentions(state).length,
    balances: JSON.stringify(Object.fromEntries(
      Object.entries(state.logistics.institutions).map(([id, institution]) => [id, institution.accounts?.operating ?? null]),
    )),
    minerAccount: JSON.stringify(state.miningOperation.institution.accounts.operating),
    ledgerLength: state.ledger.getEventsAfterId(0).length,
  };

  const chosen = mining.chooseOrder();
  assert.equal(chosen.id, "tempting-offer", "it did select something");

  assert.equal(reserveCalls, 0, "but it reserved nothing");
  assert.equal(JSON.stringify(state.miningOperation.allocations), before.allocations, "no allocation was created");
  assert.equal(collectIntentions(state).length, before.intentions, "no intention was created");
  assert.equal(JSON.stringify(Object.fromEntries(
    Object.entries(state.logistics.institutions).map(([id, institution]) => [id, institution.accounts?.operating ?? null]),
  )), before.balances, "nobody's money moved");
  assert.equal(JSON.stringify(state.miningOperation.institution.accounts.operating), before.minerAccount, "including the miner's own");
});

test("asking twice gives the same answer and still commits nothing", () => {
  const state = seededState();
  const mining = createMining(state);
  mining.update();

  const first = mining.chooseOrder();
  const allocationsAfterFirst = JSON.stringify(state.miningOperation.allocations);
  const second = mining.chooseOrder();

  assert.equal(second?.id, first?.id, "a question with no side effects has a stable answer");
  assert.equal(JSON.stringify(state.miningOperation.allocations), allocationsAfterFirst,
    "and asking it repeatedly cannot accumulate commitments");
});

test("listing what an actor can see commits nothing either", () => {
  const state = seededState();
  const mining = createMining(state);
  mining.update();

  const before = JSON.stringify(state.miningOperation.allocations);
  const offers = mining.listOffers();
  assert.ok(Array.isArray(offers));
  assert.equal(JSON.stringify(state.miningOperation.allocations), before);
});

test("the actor panel shows the same board the miner chooses from, with real prices", () => {
  const state = seededState();
  const mining = createMining(state);
  mining.update();
  const worker = Object.values(state.miningOperation.ships)[0];

  const view = inspectActor(state, worker.id, { game: { workerShips: [] } });
  const extraction = (view.visibleOffers ?? []).filter((offer) => offer.kind === "extraction");
  assert.ok(extraction.length > 0, "a miner can see what is on offer where it stands");
  extraction.forEach((offer) => {
    assert.ok(Number.isFinite(offer.price), `every price is a number, got ${offer.price} for ${offer.id}`);
    assert.ok(offer.issuer, "and names who is paying");
  });
});

test("a miner picks the best-paying offer regardless of who posted it", () => {
  const state = seededState();
  const mining = createMining(state);
  mining.update();

  // Something worth far more than any settlement is paying, from an issuer the
  // mining system has never heard of.
  registerExtractionOfferSource(state, "test-rich-issuer", () => [createExtractionOffer({
    id: "rich-offer",
    issuerInstitutionId: "somebody-new",
    siteId: "scrap-porch", siteName: "Scrap Porch",
    resourceId: "water-ice",
    amount: 6, paymentPerUnit: 5_000,
  })]);

  const chosen = mining.chooseOrder();
  assert.ok(chosen, "a worker found something worth doing");
  assert.equal(chosen.id, "rich-offer",
    `the richest offer wins on net value alone, got ${chosen.id} from ${chosen.issuerInstitutionId}`);
});
