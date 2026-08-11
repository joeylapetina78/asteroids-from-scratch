// When an operator takes a machine out of service.
//
// Before this module there was no decision to test: `miningOperation` withdrew
// a craft if and only if a component had already failed, so every operator in
// the world ran every machine to destruction and the `emergency` stage the
// condition machine computes was never acted on by anybody.

import assert from "node:assert/strict";
import test from "node:test";
import {
  SERVICE_DEFAULTS,
  SERVICE_NEED,
  createWithdrawForServiceCapability,
  deriveServiceNeeds,
  planCraftService,
  resolveServicePolicy,
} from "../src/systems/serviceDecision.js";
import { COMPONENT_THRESHOLDS, applyCraftUse, ensureCraftComponents } from "../src/systems/componentCondition.js";
import { getMiningWorkWear } from "../src/systems/wearRates.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { CINDER_MINING_SEED, FLINT_MINING_SEED } from "../src/content/economy/miningInstitutions.js";

const NOW = 1_000_000;

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
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
  createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  createMiningOperation({ state, game, now: () => 1_000, seed: FLINT_MINING_SEED });
  return state;
}

// A craft whose worst component sits at exactly `wear`.
function craftAt(wear, { id = "craft-1", name = "Craft One" } = {}) {
  const craft = { id, name };
  ensureCraftComponents(craft, [{ id: "mining-laser", label: "Mining Laser", initialWearFactor: 1 }]);
  applyCraftUse(craft, { "mining-laser": wear }, { at: NOW });
  return craft;
}

// ── The conversion is faithful ──────────────────────────────────────────────

test("a trait-neutral operator still runs a machine to failure", () => {
  const state = createWorld();
  state.logistics.institutions["neutral-co"] = {
    id: "neutral-co",
    name: "Neutral Co",
    traits: { caution: 0.5, growthBias: 0.5, urgencyBias: 0.5 },
  };

  const policy = resolveServicePolicy(state, "neutral-co");
  assert.equal(policy.withdrawAtWear, SERVICE_DEFAULTS.withdrawAtWear);
  assert.equal(policy.withdrawAtWear, COMPONENT_THRESHOLDS.failed);

  assert.equal(deriveServiceNeeds({ craft: craftAt(0.95), policy, now: NOW }).length, 0, "still working at 0.95");
  assert.equal(deriveServiceNeeds({ craft: craftAt(1), policy, now: NOW }).length, 1, "off work once it breaks");
});

// Below the neutral middle there is nowhere further to go — `failed` is the
// ceiling — so a bold operator is unchanged rather than somehow worse.
test("a bold operator is not pushed past failure", () => {
  const state = createWorld();
  const cinder = resolveServicePolicy(state, "miner:cinder-contracting");   // Ivo: caution 0.40
  assert.equal(cinder.withdrawAtWear, COMPONENT_THRESHOLDS.failed);
});

// ── Temperament shows ───────────────────────────────────────────────────────

test("a cautious operator pulls a machine that still works", () => {
  const state = createWorld();
  const flint = resolveServicePolicy(state, "miner:flint-prospecting");     // Rhea: caution 0.72
  const cinder = resolveServicePolicy(state, "miner:cinder-contracting");

  assert.ok(flint.withdrawAtWear < cinder.withdrawAtWear, `Rhea pulls earlier (${flint.withdrawAtWear} vs ${cinder.withdrawAtWear})`);
  assert.ok(flint.withdrawAtWear >= COMPONENT_THRESHOLDS.emergency, "but never before the machine itself says it is in trouble");
});

test("the same worn craft is a problem for one operator and not the other", () => {
  const state = createWorld();
  const flint = resolveServicePolicy(state, "miner:flint-prospecting");
  const cinder = resolveServicePolicy(state, "miner:cinder-contracting");
  const craft = craftAt(0.95);

  const flintNeeds = deriveServiceNeeds({ craft, policy: flint, now: NOW });
  assert.equal(flintNeeds.length, 1, "Rhea takes it off work");
  assert.equal(flintNeeds[0].kind, SERVICE_NEED.WEAR);
  assert.equal(flintNeeds[0].context.failed, false, "while it is still running");
  assert.equal(flintNeeds[0].urgency, "urgent");

  assert.equal(deriveServiceNeeds({ craft, policy: cinder, now: NOW }).length, 0, "Ivo keeps earning with it");
});

// Nobody is more nervous than the machine is. `emergency` is the condition
// machine's own statement of "about to fail", and it is the floor.
test("even the most cautious operator possible stops at the emergency stage", () => {
  const state = createWorld();
  state.logistics.institutions["paranoid-co"] = {
    id: "paranoid-co",
    name: "Paranoid Co",
    traits: { caution: 1, growthBias: 0, urgencyBias: 1 },
  };

  assert.equal(resolveServicePolicy(state, "paranoid-co").withdrawAtWear, COMPONENT_THRESHOLDS.emergency);
  assert.equal(deriveServiceNeeds({ craft: craftAt(0.7), policy: resolveServicePolicy(state, "paranoid-co"), now: NOW }).length, 0,
    "a merely degraded machine keeps working even for the most cautious operator");
});

// ── A broken machine is never left working ──────────────────────────────────

// The load-bearing safety property. Withdrawal must not be priced, or a broke
// operator declines to pull a craft that has already failed and broken machines
// work forever — strictly worse than the world before this module.
test("a failed machine comes off work even for an operator with no money", () => {
  const state = createWorld();
  const policy = resolveServicePolicy(state, "miner:cinder-contracting");
  const withdrawn = [];

  const plan = planCraftService({
    institution: { id: "miner:cinder-contracting" },
    craft: craftAt(1),
    policy,
    account: { balance: 0, committed: 0 },
    now: NOW,
    capabilities: [createWithdrawForServiceCapability({ execute: (subject) => withdrawn.push(subject) })],
  });
  plan.selected.forEach((response) => response.execute?.(response.subject));

  assert.equal(withdrawn.length, 1, "it comes off work regardless of the balance");
  assert.equal(plan.blocked.length, 0);
  assert.equal(withdrawn[0].preventive, false);
});

test("a failed machine is an emergency, a worn one is not", () => {
  const state = createWorld();
  const policy = resolveServicePolicy(state, "miner:flint-prospecting");

  assert.equal(deriveServiceNeeds({ craft: craftAt(1), policy, now: NOW })[0].urgency, "emergency");
  assert.equal(deriveServiceNeeds({ craft: craftAt(0.95), policy, now: NOW })[0].urgency, "urgent");
});

test("a healthy machine raises nothing at all", () => {
  const state = createWorld();
  const policy = resolveServicePolicy(state, "miner:flint-prospecting");
  assert.deepEqual(deriveServiceNeeds({ craft: craftAt(0.1), policy, now: NOW }), []);
  assert.deepEqual(deriveServiceNeeds({ craft: { id: "bare", name: "Bare" }, policy, now: NOW }), [], "and neither does a craft with no components");
});

// ── End to end, through the operation ───────────────────────────────────────

test("Rhea pulls a worker off a delivery that Ivo would keep running", () => {
  const state = createWorld();
  // Flint is homed at Blue Lantern, so the world has to contain the sites both
  // companies actually work out of or one of them never picks up a job.
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

  // The window this test needs: a craft that, AFTER booking this delivery's
  // wear, sits above Rhea's threshold but below outright failure. Derived from
  // the policies rather than written as a literal, so tuning either the traits
  // or the wear rate cannot silently turn this into a test of nothing.
  const reference = createWorld();
  const flintThreshold = resolveServicePolicy(reference, "miner:flint-prospecting").withdrawAtWear;
  const landAt = (flintThreshold + COMPONENT_THRESHOLDS.failed) / 2;
  const preDeliveryWear = landAt - getMiningWorkWear();
  assert.ok(preDeliveryWear > 0 && landAt < COMPONENT_THRESHOLDS.failed, "the window exists");

  const outcomes = {};
  [["cinder", CINDER_MINING_SEED], ["flint", FLINT_MINING_SEED]].forEach(([label, seed]) => {
    const world = createGameState();
    world.logistics = createInitialLogisticsState(1_000);
    // Empty shelves everywhere, so both companies have orders worth taking.
    Object.values(world.logistics.institutions).forEach((institution) => {
      if (!institution.inventories) return;
      Object.keys(institution.inventories).forEach((resourceId) => { institution.inventories[resourceId] = 0; });
    });
    const manager = createMiningOperation({ state: world, game, now: () => 1_000, seed });
    const worker = manager.workers.find((candidate) => candidate.assignment);
    assert.ok(worker, `${label} has a worker on a job to finish`);
    const shipRecord = manager.getState().ships[worker.id];
    // Set the laser exactly, rather than accumulating onto whatever wear the
    // seed already gave this hull — the two fleets start with deliberately
    // different maintenance histories.
    shipRecord.components["mining-laser"].condition.wear = preDeliveryWear;
    worker.cargo[worker.assignment.resourceId] = worker.assignment.quantity;
    worker.deliver();
    outcomes[label] = manager.getState().ships[worker.id].maintenanceStatus;
  });

  assert.equal(outcomes.flint, "returning-for-service", "Rhea takes the outage on her own terms");
  assert.equal(outcomes.cinder, "available", "Ivo keeps earning and risks the breakdown");
});
