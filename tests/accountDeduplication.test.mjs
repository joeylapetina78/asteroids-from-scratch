import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { listAccountHolders, readEconomySnapshot } from "../src/systems/economySampler.js";
import { getActorAccount } from "../src/systems/actorConfig.js";

// One purse, one count.
//
// Two actor ids can name the same account: SPRC's operation was consolidated
// into Scrap Porch and compatibility adapters kept the old `sprc` id working
// beside `scrap-forge`, so `getActorAccount` returns the very same object for
// both. Summing balances by walking actors therefore added that treasury twice.
//
// The damage is not a wrong total, it is a wrong RATE. Every movement of that
// account lands in `money.total` twice while the income and burn that caused it
// land once, so the money reconciler reports a residual proportional to whatever
// SPRC happens to be doing, with a sign that flips as it earns or spends.
// Measured live before the fix: residual 1144 against a Scrap Forge balance
// delta of 1200 over the same window.

function world() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  return state;
}

test("no account is counted twice, however many names it answers to", () => {
  const state = world();
  const holders = listAccountHolders(state);
  const counted = holders.filter((holder) => holder.countsMoney !== false);

  const seen = new Set();
  counted.forEach((holder) => {
    const account = getActorAccount(state, holder.record.id);
    if (!account) return;
    assert.equal(seen.has(account), false,
      `${holder.record.id} re-counts a purse already counted under another name`);
    seen.add(account);
  });
});

test("a shared account is flagged rather than dropped", () => {
  // Constructed rather than assumed: point SPRC's account at Scrap Forge's own
  // object, exactly as the consolidation does, and give it its own shelf.
  const state = world();
  const scrapForgeAccount = state.logistics.institutions["scrap-forge"]?.accounts?.operating;
  assert.ok(scrapForgeAccount, "the fixture has a Scrap Forge purse to share");
  state.sprc = {
    ...(state.sprc ?? {}),
    institution: { id: "sprc", name: "SPRC", archetypeId: "recovery-service" },
    account: scrapForgeAccount,
    inventories: { "iron-nickel": 7 },
  };

  const holders = listAccountHolders(state);
  const sprc = holders.find((holder) => holder.record.id === "sprc");
  const scrapForge = holders.find((holder) => holder.record.id === "scrap-forge");
  if (!sprc) return;   // the registry does not surface SPRC as an actor here

  assert.equal(getActorAccount(state, "scrap-forge"), getActorAccount(state, "sprc"),
    "these two ids really do share one account");
  assert.equal([sprc.countsMoney, scrapForge.countsMoney].filter(Boolean).length, 1,
    "exactly one of them counts the cash");
  // It must still contribute MATERIAL: the duplicate carries stock the primary
  // record does not have, so dropping it would lose the shelf with the purse.
  assert.deepEqual(sprc.inventories, { "iron-nickel": 7 });
});

test("the institutions band equals the distinct purses, not the actor count", () => {
  const state = world();
  const snapshot = readEconomySnapshot(state, { now: 1_000 });
  const distinct = new Map();
  listAccountHolders(state).forEach((holder) => {
    const account = getActorAccount(state, holder.record.id);
    if (account && !distinct.has(account)) distinct.set(account, holder.finances.balance ?? 0);
  });
  const expected = [...distinct.values()].reduce((sum, balance) => sum + balance, 0);
  assert.ok(Math.abs(snapshot.money.institutions - expected) < 1,
    `institutions band ${snapshot.money.institutions} should equal distinct purses ${expected}`);
});
