import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { CINDER_MINING_SEED, FLINT_MINING_SEED } from "../src/content/economy/miningInstitutions.js";
import { findActorRecord } from "../src/systems/actorConfig.js";
import { createExtractionOffer, registerExtractionOfferSource } from "../src/systems/extractionOffers.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (institution.inventories) Object.keys(institution.inventories).forEach((resourceId) => { institution.inventories[resourceId] = 0; });
  });
  const game = {
    worldSites: [
      { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
      { id: "blue-lantern", name: "Blue Lantern", position: { x: 2950, y: 2180 } },
      { id: "morrow-shoal", name: "Morrow Shoal", position: { x: -3820, y: 2320 } },
    ],
    addWorkerShip: () => {},
  };
  return { state, game };
}

test("a second mining institution enters the same extraction market from data", () => {
  const { state, game } = createWorld();
  const cinder = createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const flint = createMiningOperation({ state, game, now: () => 1_000, seed: FLINT_MINING_SEED });

  assert.equal(Object.keys(state.miningOperations).length, 2);
  assert.equal(flint.getState().institution.id, "miner:flint-prospecting");
  assert.equal(findActorRecord(state, "person:rhea-flint")?.name, "Rhea Flint");
  assert.notEqual(flint.workers[0].palette.hullStroke, cinder.workers[0].palette.hullStroke,
    "the competing fleets are visually distinct from their data");
  assert.ok(flint.workers.some((worker) => worker.assignment), "Flint wins at least one live order");

  const allocations = [...Object.values(cinder.getState().allocations), ...Object.values(flint.getState().allocations)]
    .filter((allocation) => allocation.status === "active");
  assert.equal(new Set(allocations.map((allocation) => allocation.orderId)).size, allocations.length,
    "the companies compete for shared work instead of double-booking it");
});

test("an extraction offer declares its physical acceptance and reservation semantics", () => {
  const offer = createExtractionOffer({
    id: "remote-test-order", issuerInstitutionId: "blue-lantern", siteId: "blue-lantern",
    resourceId: "iron-nickel", amount: 1, paymentPerUnit: 100,
  });
  assert.equal(offer.acceptanceSiteId, "blue-lantern");
  assert.equal(offer.reservationMode, "exclusive");
});

// Both companies start over with every ship free, so the next tick is a real
// contest rather than whatever the construction pass happened to leave behind.
function freeEveryShip(...operations) {
  operations.forEach((operation) => {
    Object.values(operation.getState().allocations).forEach((allocation) => { allocation.status = "released"; });
    operation.workers.forEach((worker) => worker.releaseAssignment("test-reset"));
  });
}

function assignmentMap(...operations) {
  return operations.flatMap((operation) => operation.workers)
    .filter((worker) => worker.assignment)
    .map((worker) => `${worker.id}=${worker.assignment.contractId}`)
    .sort()
    .join(",");
}

test("which company updates first does not decide who gets the work", () => {
  // Identical worlds, identical construction order — the ONLY difference is
  // which operation's update() is called first on the contested tick. Before
  // the shared clearing this was the single largest driver of the wealth gap
  // between the two companies.
  const cinderFirst = createWorld();
  const cinderA = createMiningOperation({ state: cinderFirst.state, game: cinderFirst.game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const flintA = createMiningOperation({ state: cinderFirst.state, game: cinderFirst.game, now: () => 1_000, seed: FLINT_MINING_SEED });
  freeEveryShip(cinderA, flintA);
  cinderA.update();
  flintA.update();

  const flintFirst = createWorld();
  const cinderB = createMiningOperation({ state: flintFirst.state, game: flintFirst.game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const flintB = createMiningOperation({ state: flintFirst.state, game: flintFirst.game, now: () => 1_000, seed: FLINT_MINING_SEED });
  freeEveryShip(cinderB, flintB);
  flintB.update();
  cinderB.update();

  const withCinderFirst = assignmentMap(cinderA, flintA);
  assert.ok(withCinderFirst.length > 0, "somebody took work on the contested tick");
  assert.equal(withCinderFirst, assignmentMap(cinderB, flintB),
    "the same ships take the same orders whichever company is polled first");
});

test("an outbid ship says who took the order instead of claiming there was no work", () => {
  const { state, game } = createWorld();
  // Every hub stocked, so the only thing on the board is the one order below
  // and there are plainly more ships than work.
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (institution.inventories) Object.keys(institution.inventories).forEach((resourceId) => { institution.inventories[resourceId] = 500; });
  });
  const cinder = createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  createMiningOperation({ state, game, now: () => 1_000, seed: FLINT_MINING_SEED });
  registerExtractionOfferSource(state, "test-single-order", () => [createExtractionOffer({
    id: "one-good-order", issuerInstitutionId: "yard-exchange", siteId: "yard-exchange", siteName: "Yard Exchange",
    resourceId: "iron-nickel", amount: 6, paymentPerUnit: 5_000,
  })]);
  cinder.update();

  const outbid = Object.values(state.diagnostics?.actors ?? {}).filter((actor) => actor.blocker?.kind === "outbid");
  assert.ok(outbid.length > 0, "with one order and five ships, somebody loses an auction");
  outbid.forEach((actor) => {
    assert.equal(actor.blocker.detail?.orderId, "one-good-order");
    assert.ok(actor.blocker.detail.winnerId, `${actor.actorName} names the ship that beat it`);
    assert.ok(actor.blocker.detail.winningNetValue >= actor.blocker.detail.ownNetValue,
      "and the bid that beat it was worth at least as much");
    assert.notEqual(actor.blocker.detail.winnerId, actor.actorId, "nobody outbids itself");
  });
  assert.ok(state.ledger.getRecentEvents(50).some((event) => event.type === "mining.outbid"),
    "and losing the auction is a fact in the world, not just a panel");
});

test("the competing fleets start with distinct, meaningful maintenance histories", () => {
  const { state, game } = createWorld();
  const cinder = createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const flint = createMiningOperation({ state, game, now: () => 1_000, seed: FLINT_MINING_SEED });
  const wear = [...Object.values(cinder.getState().ships), ...Object.values(flint.getState().ships)].map((ship) => ship.wear);
  assert.ok(Math.max(...wear) >= 0.6, "one veteran craft is already nearing service");
  assert.ok(new Set(wear).size >= 4, "the fleets do not begin on a synchronized maintenance clock");
  assert.ok(wear.every((value) => value < 1), "none begins already failed");
});

test("an unknown mining craft withdraws for public repair after critical incursion damage", () => {
  const { state, game } = createWorld();
  const mining = createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  const worker = mining.worker;
  const record = mining.getState().ships[worker.id];
  worker.hull = 50;

  state.ledger.recordEvent("incursion.npcHit", {
    npcId: worker.id, npcName: worker.name, npcType: "mining-worker", damage: 10, hullAfter: 50,
  }, { visible: false });
  mining.update();

  assert.equal(record.pendingIssue, "structural-fatigue");
  assert.equal(record.maintenanceStatus, "returning-for-service");
  assert.equal(worker.miningDisabled, true);
  assert.ok(state.ledger.getRecentEvents(20).some((event) =>
    event.type === "mining.maintenanceRequired" && event.payload.cause === "combat-damage"));
});
