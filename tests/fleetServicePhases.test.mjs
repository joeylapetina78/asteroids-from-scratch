// The two fleet services, split along the clock's phases.
//
// The finding here is about insurance: it makes NO decisions at all. Cover is
// bound to whoever is eligible, premiums follow deliveries that already
// happened, and claims settle against wrecks that already exist. The whole
// system is observation, and it gets no `decide` phase rather than an empty one.

import assert from "node:assert/strict";
import test from "node:test";
import { createFleetInsuranceManager } from "../src/systems/fleetInsurance.js";
import { createFleetProtectionManager } from "../src/systems/fleetProtection.js";
import { createWorldClock, TICK_PHASE } from "../src/systems/worldClock.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

// A fixed clock, so two worlds built milliseconds apart are still comparable —
// policies stamp `startedAt` when they are bound.
function createWorld(now = () => 1_000) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const insurance = createFleetInsuranceManager({ state, now });
  const protection = createFleetProtectionManager({ state, getShips: () => [], now });
  return { state, insurance, protection };
}

// ── Insurance decides nothing ───────────────────────────────────────────────

test("insurance has no decide phase, because it never chooses anything", () => {
  const { insurance } = createWorld();
  assert.equal(typeof insurance.observe, "function");
  assert.equal(insurance.decide, undefined, "an empty decide would be a label with nothing behind it");
  assert.equal(insurance.settle, undefined);
});

test("an insurance tick is exactly its observation", () => {
  const byHand = createWorld();
  byHand.insurance.observe();

  const byUpdate = createWorld();
  byUpdate.insurance.update();

  assert.equal(
    JSON.stringify(byHand.state.fleetInsurance),
    JSON.stringify(byUpdate.state.fleetInsurance),
  );
});

// Binding cover sits alongside the event drain rather than after it: a newly
// eligible institution must hold a policy before its first delivery is read, or
// that delivery collects no premium and the miss is permanent.
test("cover is bound before the deliveries that pay for it are read", () => {
  const { state, insurance } = createWorld();
  insurance.observe();

  const policies = state.fleetInsurance?.policies ?? {};
  assert.ok(Object.keys(policies).length > 0, "eligible institutions were covered on the first pass");
  Object.values(policies).forEach((policy) => {
    assert.equal(policy.status, "active");
    assert.ok(policy.holderInstitutionId);
  });
});

test("observing twice at the same instant collects nothing twice", () => {
  const { state, insurance } = createWorld();
  insurance.update();

  const before = JSON.stringify(state.fleetInsurance);
  insurance.observe();
  assert.equal(JSON.stringify(state.fleetInsurance), before, "the ledger drain does not re-read what it already read");
});

// ── Protection splits ───────────────────────────────────────────────────────

test("protection exposes observe and decide, and update runs both", () => {
  const { protection } = createWorld();
  assert.equal(typeof protection.observe, "function");
  assert.equal(typeof protection.decide, "function");
  // An installation is recorded as it happens.
  assert.equal(protection.settle, undefined);
});

test("a hand-driven protection tick and update() reach the same place", () => {
  const byHand = createWorld();
  byHand.protection.observe();
  byHand.protection.decide();

  const byUpdate = createWorld();
  byUpdate.protection.update();

  assert.equal(
    JSON.stringify(byHand.state.fleetProtection),
    JSON.stringify(byUpdate.state.fleetProtection),
  );
});

// Reading the world's news is observing. If deciding also drained the ledger,
// the phase boundary would be decorative.
test("protection drains the ledger in observe, not in decide", () => {
  const { state, protection } = createWorld();
  state.ledger.recordEvent("npc.routeCompleted", { npcId: "nobody", siteId: "scrap-porch" }, { visible: false });
  const pending = state.fleetProtection.lastLedgerEventId;

  protection.decide();
  assert.equal(state.fleetProtection.lastLedgerEventId, pending, "deciding read no news");

  protection.observe();
  assert.ok(state.fleetProtection.lastLedgerEventId > pending, "observing did");
});

// ── Placement on the clock ──────────────────────────────────────────────────

// A fleet marked high-risk by a settled claim has to be known before anybody is
// offered hardware on the strength of it.
test("both services observe ahead of every decider", () => {
  const { insurance, protection } = createWorld();
  const ran = [];
  const clock = createWorldClock({ onSystemError: () => {} });

  // Registered after the deciders on purpose: phase must beat registration order.
  clock.register("somebody-else", () => ran.push("other-decide"));
  clock.register("fleet-protection", () => { ran.push("protection-decide"); protection.decide(); });
  clock.register("insurance", () => { ran.push("insurance-observe"); insurance.observe(); }, { phase: TICK_PHASE.OBSERVE });
  clock.register("protection-observe", () => { ran.push("protection-observe"); protection.observe(); }, { phase: TICK_PHASE.OBSERVE });

  clock.tick();
  assert.deepEqual(ran, [
    "insurance-observe", "protection-observe",
    "other-decide", "protection-decide",
  ]);
});
