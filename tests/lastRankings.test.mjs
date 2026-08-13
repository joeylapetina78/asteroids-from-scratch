// The last two rankings that decided things on their own terms.
//
// `startNextProduction` was pure FIFO on insertion order — The Maw built
// whatever was queued first regardless of what was waiting on it — and
// `rankCarrierBids` weighted every carrier's regard for an issuer identically
// and settled dead heats by sorting institution ids.

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RELATIONSHIP_WEIGHT,
  rankCarrierBids,
  scoreCarrierBid,
  selectCarrierBid,
} from "../src/systems/carrierSelection.js";
import { createSprcOperation } from "../src/systems/sprcOperation.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

// ── The Maw builds what is most needed, not what queued first ───────────────

function createSprcWorld(now = () => 1_000) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const sprc = createSprcOperation({ state, now });
  sprc.update();
  return { state, sprc };
}

// Queue a production order and, optionally, the repair it unblocks.
function queue(state, { id, createdAt, repair = null, kind = null }) {
  if (repair) state.sprc.repairOrders[repair.id] = { reserved: { produced: {}, raw: {} }, requirements: { produced: {}, raw: {} }, ...repair };
  state.sprc.productionOrders[id] = {
    id, facilityId: "facility:sprc-maw", kind,
    sourceRepairOrderId: repair?.id ?? null,
    inputs: {}, output: { itemId: "structural-plate", amount: 1 },
    status: "queued", createdAt, startedAt: null, completesAt: null, durationSeconds: 30,
  };
  state.sprc.productionQueue.push(id);
}

test("a part for a broken machine is built before one for a scheduled service", () => {
  const { state, sprc } = createSprcWorld();
  state.sprc.productionQueue.length = 0;
  state.sprc.productionOrders = {};
  state.sprc.facilities.maw.activeProductionOrderId = null;

  // The routine job queued FIRST, which is what the old order rewarded.
  queue(state, { id: "PRD-routine", createdAt: 1_000, repair: { id: "REP-routine", priority: 60, servicePrice: 100, payerInstitutionId: "yard-exchange", status: "waiting-production" } });
  queue(state, { id: "PRD-broken", createdAt: 2_000, repair: { id: "REP-broken", priority: 80, servicePrice: 100, payerInstitutionId: "scrap-forge", status: "waiting-production" } });

  sprc.decide();
  assert.equal(state.sprc.facilities.maw.activeProductionOrderId, "PRD-broken",
    "the part that unblocks a breakdown goes on the mill first");
});

// Severity is a hard tier in `workQueue`, so this is a statement about order
// rather than a weight: a craft stranded waiting on a part is not opportunistic,
// and salvage is.
test("dismantling a wreck waits while any repair part is outstanding", () => {
  const { state, sprc } = createSprcWorld();
  state.sprc.productionQueue.length = 0;
  state.sprc.productionOrders = {};
  state.sprc.facilities.maw.activeProductionOrderId = null;

  queue(state, { id: "PRD-salvage", createdAt: 1_000, kind: "wreck-dismantling" });
  queue(state, { id: "PRD-part", createdAt: 9_000, repair: { id: "REP-1", priority: 60, servicePrice: 100, payerInstitutionId: "yard-exchange", status: "waiting-production" } });

  sprc.decide();
  assert.equal(state.sprc.facilities.maw.activeProductionOrderId, "PRD-part",
    "the repair part comes first even though the wreck queued long before it");
});

test("with nothing else waiting, the wreck does get dismantled", () => {
  const { state, sprc } = createSprcWorld();
  state.sprc.productionQueue.length = 0;
  state.sprc.productionOrders = {};
  state.sprc.facilities.maw.activeProductionOrderId = null;

  queue(state, { id: "PRD-salvage", createdAt: 1_000, kind: "wreck-dismantling" });

  sprc.decide();
  assert.equal(state.sprc.facilities.maw.activeProductionOrderId, "PRD-salvage");
});

test("two equally urgent parts still go oldest first", () => {
  const { state, sprc } = createSprcWorld();
  state.sprc.productionQueue.length = 0;
  state.sprc.productionOrders = {};
  state.sprc.facilities.maw.activeProductionOrderId = null;

  queue(state, { id: "PRD-newer", createdAt: 9_000, repair: { id: "REP-a", priority: 60, servicePrice: 100, payerInstitutionId: "yard-exchange", status: "waiting-production" } });
  queue(state, { id: "PRD-older", createdAt: 1_000, repair: { id: "REP-b", priority: 60, servicePrice: 100, payerInstitutionId: "yard-exchange", status: "waiting-production" } });

  sprc.decide();
  assert.equal(state.sprc.facilities.maw.activeProductionOrderId, "PRD-older");
});

test("the mill order is readable, like the berth's", () => {
  const { sprc } = createSprcWorld();
  const { productionQueue } = sprc.getSnapshot();
  assert.ok(Array.isArray(productionQueue), "the snapshot carries it");
  productionQueue.forEach((entry) => {
    assert.ok(entry.id);
    assert.equal(typeof entry.position, "number");
    assert.equal(typeof entry.severity, "number");
  });
});

// ── Carrier bids ────────────────────────────────────────────────────────────

const bid = (overrides = {}) => ({
  offerId: "offer-1", carrierId: "carrier-a", shipId: "ship-a",
  eligible: true, committed: false,
  offeredPrice: 1_000, askingPrice: 800,
  relationship: null,
  ...overrides,
});

test("a bid with no stated weight scores exactly as it always did", () => {
  const warm = { trust: 1, reliability: 1, gratitude: 1, familiarity: 1, resentment: 0 };
  assert.equal(
    scoreCarrierBid(bid({ relationship: warm })),
    scoreCarrierBid(bid({ relationship: warm, relationshipWeight: DEFAULT_RELATIONSHIP_WEIGHT })),
    "the default is the number this module used for everybody",
  );
});

test("a carrier that only counts money ignores the relationship entirely", () => {
  const warm = { trust: 1, reliability: 1, gratitude: 1, familiarity: 1, resentment: 0 };
  const mercenary = scoreCarrierBid(bid({ relationship: warm, relationshipWeight: 0 }));
  assert.equal(mercenary, 200, "pure surplus, nothing else");
});

test("a carrier that values a relationship will take less money for a trusted issuer", () => {
  const warm = { trust: 1, reliability: 1, gratitude: 1, familiarity: 1, resentment: 0 };
  // A better-paying run from a stranger, against a thinner one from a friend.
  const stranger = bid({ offerId: "rich", carrierId: "c", shipId: "s", offeredPrice: 1_000, askingPrice: 900, relationship: null });
  const friend = bid({ offerId: "warm", carrierId: "c", shipId: "s", offeredPrice: 1_000, askingPrice: 950, relationship: warm });

  const mercenary = rankCarrierBids([
    { ...stranger, relationshipWeight: 0 },
    { ...friend, relationshipWeight: 0 },
  ]);
  assert.equal(mercenary[0].offerId, "rich", "money alone picks the better-paying run");

  const loyal = rankCarrierBids([
    { ...stranger, relationshipWeight: 60 },
    { ...friend, relationshipWeight: 60 },
  ]);
  assert.equal(loyal[0].offerId, "warm", "regard for the issuer overturns a thin margin");
});

// The header used to claim "stable IDs, never registry or update order". Stable
// it was — but sorting on an id IS an ordering, and the carrier whose name sorts
// earliest wins every dead heat forever.
// Any single pair may break either way — a fair tiebreak agrees with the
// alphabet about half the time. What must NOT happen is the alphabet winning
// SYSTEMATICALLY, which is precisely what sorting on ids did: one carrier's
// name outranked another's in every dead heat they ever had.
test("a dead heat is not settled by whose name sorts first", () => {
  const tie = (carrierId, offerId) => bid({ carrierId, shipId: `ship-${carrierId}`, offerId, offeredPrice: 1_000, askingPrice: 800 });

  let alphabeticalWins = 0;
  const pairs = 200;
  for (let index = 0; index < pairs; index += 1) {
    const ranked = rankCarrierBids([
      tie("carrier:zzz-cartage", `offer-${index}`),
      tie("carrier:aaa-hauling", `offer-${index}`),
    ]);
    assert.equal(ranked[0].selectionScore, ranked[1].selectionScore, "the two really are tied");
    if (ranked[0].carrierId === "carrier:aaa-hauling") alphabeticalWins += 1;
  }

  assert.ok(alphabeticalWins > pairs * 0.25 && alphabeticalWins < pairs * 0.75,
    `the alphabetically-first carrier won ${alphabeticalWins}/${pairs} dead heats — sorting on ids would make it ${pairs}/${pairs}`);
});

test("a dead heat resolves the same way whichever order it arrives in", () => {
  const tie = (carrierId, shipId) => bid({ carrierId, shipId, offerId: "same-offer", offeredPrice: 1_000, askingPrice: 800 });
  const forward = rankCarrierBids([tie("carrier:a", "ship-a"), tie("carrier:b", "ship-b")]);
  const backward = rankCarrierBids([tie("carrier:b", "ship-b"), tie("carrier:a", "ship-a")]);

  assert.deepEqual(forward.map((entry) => entry.carrierId), backward.map((entry) => entry.carrierId));
});

test("an ineligible or committed bid is still never selected", () => {
  assert.equal(scoreCarrierBid(bid({ eligible: false })), -Infinity);
  assert.equal(scoreCarrierBid(bid({ committed: true })), -Infinity);
  assert.equal(selectCarrierBid([bid({ eligible: false }), bid({ committed: true })]), null);
});
