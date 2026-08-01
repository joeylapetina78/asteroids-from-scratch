// Actor configuration: an actor's behaviour comes from what it has, not from
// which system happens to be asking.
//
// The point of these tests is NOT that the numbers below are correct — they
// are authored data and will be tuned. It is that changing that data changes
// behaviour, with no per-actor code anywhere in the decision path.

import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TRAITS, findActorRecord, getActorAccount, getActorFinances, getActorProtectedCash, getActorTraits, getControllerId } from "../src/systems/actorConfig.js";
import { evaluateProcurement, evaluateSupplierAsk } from "../src/systems/valuation.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createInitialMiningState } from "../src/systems/miningOperation.js";
import { createTowServiceManager } from "../src/systems/towService.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  state.miningOperation = createInitialMiningState(1_000);
  return state;
}

// ── Resolution across the state shapes ─────────────────────────────────────

// The guard that would have caught the tow lookup reading `state.towService`
// when the state key is `state.towing`. Nothing failed — `getActorTraits`
// handed back the framework default, so Nell quoted with somebody else's
// temperament and looked entirely normal doing it. A missing actor and an actor
// with no traits are indistinguishable at the call site, so the only place the
// difference can be caught is here.
test("every seeded actor resolves — a silent default is how misconfiguration hides", () => {
  const state = createWorld();
  createTowServiceManager({ state, ships: [], destinations: [], now: () => 1_000 });

  const mustResolve = [
    "yard-exchange", "scrap-forge", "the-ledge",
    "person:yard-quartermaster", "person:porch-quartermaster", "person:ledge-quartermaster",
    "carrier:yard-hauler", "carrier:porch-runner",
    "person:yard-hauler-operator", "person:hauler-scrap-yard-operator",
    "miner:cinder-contracting", "person:ivo-cinder",
    "sprc", "sal",
    "first-reach-recovery", "nell-winch",
  ];
  const missing = mustResolve.filter((actorId) => findActorRecord(state, actorId) === null);
  assert.deepEqual(missing, [], `these actors are configured but unreachable: ${missing.join(", ")}`);
});

test("every actor that decides has a temperament of its own", () => {
  const state = createWorld();
  createTowServiceManager({ state, ships: [], destinations: [], now: () => 1_000 });

  // Anything that prices, bids or quotes must not be silently taking the
  // framework default — that is the shape of the bug, not of a design choice.
  const decidingActors = ["yard-exchange", "scrap-forge", "the-ledge", "carrier:yard-hauler", "carrier:porch-runner", "miner:cinder-contracting", "first-reach-recovery"];
  const defaulted = decidingActors.filter((actorId) => {
    const traits = getActorTraits(state, actorId);
    return traits === DEFAULT_TRAITS;
  });
  assert.deepEqual(defaulted, [], `these actors decide with nobody's temperament: ${defaulted.join(", ")}`);
});

test("an actor is found wherever its record happens to live", () => {
  const state = createWorld();
  assert.equal(findActorRecord(state, "yard-exchange")?.id, "yard-exchange", "a hub, in logistics");
  assert.equal(findActorRecord(state, "carrier:yard-hauler")?.id, "carrier:yard-hauler", "a carrier, in logistics");
  assert.equal(findActorRecord(state, "miner:cinder-contracting")?.id, "miner:cinder-contracting", "a miner, in its own operation");
  assert.equal(findActorRecord(state, "person:ivo-cinder")?.id, "person:ivo-cinder", "a person controlling one");
  assert.equal(findActorRecord(state, "sprc")?.id, "sprc", "an institution beside both");
  assert.equal(findActorRecord(state, "nobody-at-all"), null);
});

test("an institution decides through whoever runs it", () => {
  const state = createWorld();
  assert.equal(getControllerId(state, "yard-exchange"), "person:yard-quartermaster");
  assert.equal(getControllerId(state, "carrier:porch-runner"), "person:hauler-scrap-yard-operator");
  assert.equal(getControllerId(state, "miner:cinder-contracting"), "person:ivo-cinder");
  // A person controls themselves rather than resolving to nothing.
  assert.equal(getControllerId(state, "person:ivo-cinder"), "person:ivo-cinder");
});

test("traits come from the controller, not from the institution", () => {
  const state = createWorld();
  const hub = findActorRecord(state, "the-ledge");
  assert.equal(hub.traits, undefined, "the settlement itself has no temperament");
  assert.deepEqual(getActorTraits(state, "the-ledge"), findActorRecord(state, "person:ledge-quartermaster").traits,
    "it borrows its quartermaster's");
});

test("an actor with nobody running it falls back rather than guessing", () => {
  const state = createWorld();
  state.logistics.institutions["orphan-hub"] = { id: "orphan-hub", accounts: { operating: { balance: 0, committed: 0 } } };
  assert.deepEqual(getActorTraits(state, "orphan-hub"), DEFAULT_TRAITS);
  assert.deepEqual(getActorTraits(state, "orphan-hub", { caution: 0.9 }), { caution: 0.9 }, "callers may name their own fallback");
});

test("an account is found whether it sits on the institution or beside it", () => {
  const state = createWorld();
  assert.ok(getActorAccount(state, "yard-exchange")?.balance > 0, "hub accounts hang off the institution");
  assert.ok(getActorAccount(state, "sprc")?.balance > 0, "SPRC keeps its account beside one");
  assert.equal(getActorAccount(state, "person:ivo-cinder"), null, "a person without an account has none");
});

test("the money an actor will not spend is found wherever that actor keeps it", () => {
  const state = createWorld();
  // Three systems named this three different ways, and a reader had to know
  // which kind of actor it was looking at to find it.
  assert.ok(getActorProtectedCash(state, "sprc") > 0, "SPRC publishes a live reserve on its account");
  assert.ok(getActorProtectedCash(state, "carrier:yard-hauler") > 0, "a carrier keeps a transport-policy floor");
  assert.equal(getActorProtectedCash(state, "person:ivo-cinder"), 0, "an actor with no float reports none, not undefined");
});

test("a live reserve beats the configured default", () => {
  const state = createWorld();
  const account = getActorAccount(state, "sprc");
  account.protectedReserve = 4_242;
  assert.equal(getActorProtectedCash(state, "sprc"), 4_242,
    "an operating plan that revised its float is what the actor is actually holding back");
});

test("finances answer balance, committed and genuinely available in one call", () => {
  const state = createWorld();
  const account = getActorAccount(state, "yard-exchange");
  account.balance = 10_000;
  account.committed = 2_000;
  account.protectedReserve = 1_500;

  const finances = getActorFinances(state, "yard-exchange");
  assert.equal(finances.balance, 10_000);
  assert.equal(finances.committed, 2_000);
  assert.equal(finances.protectedCash, 1_500);
  assert.equal(finances.available, 6_500, "what is left after commitments and the float");
  assert.equal(getActorFinances(state, "person:ivo-cinder"), null, "no account, no finances");
});

test("available never goes negative when commitments exceed the balance", () => {
  const state = createWorld();
  const account = getActorAccount(state, "the-ledge");
  account.balance = 1_000;
  account.committed = 5_000;
  assert.equal(getActorFinances(state, "the-ledge").available, 0, "overcommitted is zero spendable, not a negative");
});

// ── The differentiation this exists to produce ─────────────────────────────

test("two hubs with different quartermasters pay different prices for the same shortage", () => {
  const state = createWorld();
  const bid = (hubId) => evaluateProcurement({
    itemId: "water-ice", baseUnitPrice: 300, marketUnitValue: 300,
    urgency: "routine", inventory: { onHand: 0, incoming: 0, target: 12 },
    requestedUnits: 6, account: { balance: 50_000, committed: 0 },
    policy: { protectedCash: 3_000 }, traits: getActorTraits(state, hubId),
  }).recommendedPrice;

  // Ivry runs the outpost closest to going without, so she pays up rather than
  // run dry; Bex runs a supplied depot and does not chase.
  assert.ok(bid("the-ledge") > bid("yard-exchange"),
    `The Ledge should outbid Yard Exchange on the same shortage (${bid("the-ledge")} vs ${bid("yard-exchange")})`);
});

test("two carriers with different operators quote the same run differently", () => {
  const state = createWorld();
  const quote = (carrierId) => evaluateSupplierAsk({
    workId: "run", costComponents: { travel: 250, maintenance: 150 },
    traits: getActorTraits(state, carrierId),
  });

  const dara = quote("carrier:yard-hauler");
  const mara = quote("carrier:porch-runner");
  assert.notEqual(dara.recommendedPrice, mara.recommendedPrice, "the two operators do not quote alike");
  assert.equal(dara.minAcceptablePrice, mara.minAcceptablePrice,
    "but temperament never moves the floor — cost is cost");
});

test("changing only the data changes the decision", () => {
  const state = createWorld();
  const before = getActorTraits(state, "yard-exchange").growthBias;
  const ask = () => evaluateSupplierAsk({
    workId: "lot", costComponents: { other: 1_000 }, traits: getActorTraits(state, "yard-exchange"),
  }).recommendedPrice;

  const asked = ask();
  findActorRecord(state, "person:yard-quartermaster").traits = { ...getActorTraits(state, "yard-exchange"), growthBias: before + 0.5 };
  assert.ok(ask() > asked, "a greedier quartermaster asks more, with no code change anywhere");
});
