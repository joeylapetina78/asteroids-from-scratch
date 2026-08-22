// How much fleet an operator carries, decided from its temperament.
//
// The conversion this file guards: `assessHiring` and `assessExpansion` were
// the generic decision loop written out longhand with the thresholds as module
// constants, so every mining company in the world grew at the same rate. The
// point is NOT that the numbers below are right — they are authored data and
// will be tuned. It is that two authored temperaments now produce two different
// companies with no per-company code anywhere.

import assert from "node:assert/strict";
import test from "node:test";
import {
  FLEET_CAPACITY_DEFAULTS,
  FLEET_NEED,
  createCommissionCapability,
  createHireCapability,
  createReleaseCapability,
  deriveFleetNeeds,
  planFleetCapacity,
  resolveFleetPolicy,
} from "../src/systems/fleetCapacity.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { CINDER_MINING_SEED, FLINT_MINING_SEED } from "../src/content/economy/miningInstitutions.js";

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
      { id: "ore-station-one", name: "Ore Station One", position: { x: 40000, y: -24000 } },
      { id: "coldwater-depot", name: "Coldwater Depot", position: { x: 70000, y: 46000 } },
      { id: "deep-research", name: "Deep Research", position: { x: -72000, y: 53000 } },
    ],
    addWorkerShip: () => {},
  };
  createMiningOperation({ state, game, now: () => 1_000, seed: CINDER_MINING_SEED });
  createMiningOperation({ state, game, now: () => 1_000, seed: FLINT_MINING_SEED });
  return state;
}

const NOW = 1_000_000;

// A fleet where every ship has been committed for `busySeconds`.
function busyFleet(busySeconds, size = 3) {
  return {
    size,
    allBusySince: NOW - busySeconds * 1000,
    ships: Array.from({ length: size }, (_, index) => ({ id: `ship-${index}`, name: `Ship ${index}`, busy: true, carrying: 0, idleSince: null })),
  };
}

// A fleet where one ship has had nothing to do for `idleSeconds`.
function idleFleet(idleSeconds, size = 3) {
  return {
    size,
    allBusySince: null,
    ships: Array.from({ length: size }, (_, index) => ({
      id: `ship-${index}`,
      name: `Ship ${index}`,
      busy: index !== 0,
      carrying: 0,
      idleSince: index === 0 ? NOW - idleSeconds * 1000 : null,
    })),
  };
}

// ── The conversion is faithful ──────────────────────────────────────────────

// The old constants were `HIRE_AFTER_BUSY_SECONDS = 60` and
// `RELEASE_AFTER_IDLE_SECONDS = 120`, applied to everybody. An operator with no
// temperament at all must still land exactly there, which is what makes the
// rest of this file a change in behaviour rather than a change in numbers.
test("a trait-neutral operator reproduces the constants this replaced", () => {
  const state = createWorld();
  state.logistics.institutions["neutral-co"] = {
    id: "neutral-co",
    name: "Neutral Co",
    traits: { caution: 0.5, growthBias: 0.5, urgencyBias: 0.5 },
  };

  const policy = resolveFleetPolicy(state, "neutral-co");
  assert.equal(policy.hireAfterBusySeconds, 60);
  assert.equal(policy.releaseAfterIdleSeconds, 120);
  assert.equal(policy.minFleet, FLEET_CAPACITY_DEFAULTS.minFleet);
  assert.equal(policy.maxFleet, FLEET_CAPACITY_DEFAULTS.maxFleet);
});

// ── Two temperaments, two companies ─────────────────────────────────────────

test("a cautious prospector and a growth-minded contractor carry different fleets", () => {
  const state = createWorld();
  const cinder = resolveFleetPolicy(state, "miner:cinder-contracting");   // Ivo: growth 0.55, caution 0.40
  const flint = resolveFleetPolicy(state, "miner:flint-prospecting");     // Rhea: growth 0.28, caution 0.72

  assert.ok(
    cinder.hireAfterBusySeconds < flint.hireAfterBusySeconds,
    `Ivo commits to a hull sooner than Rhea (${cinder.hireAfterBusySeconds}s vs ${flint.hireAfterBusySeconds}s)`,
  );
  assert.ok(
    cinder.releaseAfterIdleSeconds < flint.releaseAfterIdleSeconds,
    `and lets one go sooner too (${cinder.releaseAfterIdleSeconds}s vs ${flint.releaseAfterIdleSeconds}s)`,
  );
});

// The difference has to be big enough to actually change what happens, not just
// to differ in the third decimal place.
test("the same busy fleet is a shortage for one operator and not the other", () => {
  const state = createWorld();
  const cinder = resolveFleetPolicy(state, "miner:cinder-contracting");
  const flint = resolveFleetPolicy(state, "miner:flint-prospecting");
  const fleet = busyFleet(65);

  const cinderNeeds = deriveFleetNeeds({ fleet, policy: cinder, now: NOW });
  const flintNeeds = deriveFleetNeeds({ fleet, policy: flint, now: NOW });

  assert.equal(cinderNeeds.filter((need) => need.kind === FLEET_NEED.CAPACITY).length, 1, "Ivo is turning work away");
  assert.equal(flintNeeds.filter((need) => need.kind === FLEET_NEED.CAPACITY).length, 0, "Rhea is not convinced yet");
});

test("the same idle ship is waste to one operator and not the other", () => {
  const state = createWorld();
  const cinder = resolveFleetPolicy(state, "miner:cinder-contracting");
  const flint = resolveFleetPolicy(state, "miner:flint-prospecting");
  const fleet = idleFleet(120);

  assert.equal(deriveFleetNeeds({ fleet, policy: cinder, now: NOW }).filter((need) => need.kind === FLEET_NEED.SURPLUS).length, 1);
  assert.equal(deriveFleetNeeds({ fleet, policy: flint, now: NOW }).filter((need) => need.kind === FLEET_NEED.SURPLUS).length, 0);
});

// ── The floor, which the old loop held implicitly ───────────────────────────

// The loop this replaced re-read the live fleet size on every iteration, so the
// floor held without being stated. Deriving all the needs up front loses that
// unless the cap is applied to the whole set — and a fleet that releases itself
// to zero stops existing.
test("a fleet with every ship idle never releases below its floor", () => {
  const state = createWorld();
  const policy = resolveFleetPolicy(state, "miner:cinder-contracting");
  const fleet = {
    size: 4,
    allBusySince: null,
    ships: Array.from({ length: 4 }, (_, index) => ({ id: `ship-${index}`, name: `Ship ${index}`, busy: false, carrying: 0, idleSince: NOW - 600 * 1000 })),
  };

  const surplus = deriveFleetNeeds({ fleet, policy, now: NOW }).filter((need) => need.kind === FLEET_NEED.SURPLUS);
  assert.equal(surplus.length, fleet.size - policy.minFleet, "only what the fleet can spare");
});

test("a ship still carrying cargo is never surplus", () => {
  const state = createWorld();
  const policy = resolveFleetPolicy(state, "miner:cinder-contracting");
  const fleet = idleFleet(600);
  fleet.ships[0].carrying = 4;

  assert.equal(deriveFleetNeeds({ fleet, policy, now: NOW }).filter((need) => need.kind === FLEET_NEED.SURPLUS).length, 0);
});

test("a full fleet does not hire past its ceiling", () => {
  const state = createWorld();
  const policy = resolveFleetPolicy(state, "miner:cinder-contracting");
  const fleet = busyFleet(600, policy.maxFleet);

  assert.equal(deriveFleetNeeds({ fleet, policy, now: NOW }).filter((need) => need.kind === FLEET_NEED.CAPACITY).length, 0);
});

// ── Planning ────────────────────────────────────────────────────────────────

function plan(state, institutionId, fleet, { balance = 100_000, capabilities = null } = {}) {
  const policy = resolveFleetPolicy(state, institutionId);
  const hired = [];
  const released = [];
  const commissioned = [];
  const result = planFleetCapacity({
    state,
    institution: { id: institutionId },
    controller: null,
    fleet,
    policy,
    account: { balance, committed: 0 },
    now: NOW,
    capabilities: capabilities ?? [
      createCommissionCapability({ execute: ({ projectId }) => commissioned.push(projectId) }),
      createHireCapability({ cost: policy.hireCost, execute: () => hired.push(true) }),
      createReleaseCapability({ execute: ({ shipId }) => released.push(shipId) }),
    ],
  });
  result.selected.forEach((response) => response.execute?.(response.subject));
  return { ...result, hired, released, commissioned, policy };
}

test("a shortage it can pay for is answered", () => {
  const state = createWorld();
  const result = plan(state, "miner:cinder-contracting", busyFleet(600));
  assert.equal(result.hired.length, 1);
  assert.equal(result.blocked.length, 0);
});

// The interesting half of the story: wanting a ship and not affording one is
// something the operation already knew to report, and it must survive.
test("a shortage it cannot pay for is reported rather than dropped", () => {
  const state = createWorld();
  const result = plan(state, "miner:cinder-contracting", busyFleet(600), { balance: 10 });

  assert.equal(result.hired.length, 0, "no ship appeared");
  assert.equal(result.blocked.length, 1, "and the wanting is on the record");
  assert.equal(result.blocked[0].capabilityId, "hire-worker");
  assert.ok(result.blocked[0].affordability.requiredAmount > result.blocked[0].affordability.spendable);
});

// An approved project and a live shortage are two different justifications, so
// both are answered — matching what the two separate assessments did before.
// What must NOT happen is one need being paid for twice.
test("each need is answered exactly once", () => {
  const state = createWorld();
  const fleet = busyFleet(600);
  fleet.approvedProjects = [{ id: "project-a", name: "Project A", requiredCredits: 3_500 }];

  const result = plan(state, "miner:cinder-contracting", fleet);
  assert.deepEqual(result.commissioned, ["project-a"]);
  assert.equal(result.hired.length, 1);
  assert.equal(result.selected.length, new Set(result.selected.map((entry) => entry.needId)).size, "no need answered twice");
});

// A fleet entirely in for repair is not turning work away — but the hull it
// already signed off on is waiting on money, not on a free ship.
test("an approved project is funded even with no ship currently working", () => {
  const state = createWorld();
  const grounded = { size: 3, allBusySince: null, ships: [], approvedProjects: [{ id: "project-a", name: "Project A", requiredCredits: 3_500 }] };

  const result = plan(state, "miner:cinder-contracting", grounded);
  assert.deepEqual(result.commissioned, ["project-a"]);
  assert.equal(result.hired.length, 0, "and nothing else is bought on the strength of an empty fleet");
});

// An approved project carries its own justification — whatever approved it knew
// something the generic busy clock does not. Gating it behind that clock a
// second time is how an approved expansion sits approved forever.
test("an approved project is funded without the fleet also reading as fully committed", () => {
  const state = createWorld();
  const quietFleet = {
    size: 3,
    allBusySince: null,
    ships: [{ id: "ship-0", name: "Ship 0", busy: false, carrying: 0, idleSince: null }],
    approvedProjects: [{ id: "cinder-four", name: "Commission Cinder Four", requiredCredits: 3_500 }],
  };

  const result = plan(state, "miner:cinder-contracting", quietFleet);
  assert.deepEqual(result.commissioned, ["cinder-four"]);
});

test("spending is checked against the reserve, not just the balance", () => {
  const state = createWorld();
  const policy = resolveFleetPolicy(state, "miner:cinder-contracting");
  const result = planFleetCapacity({
    state,
    institution: { id: "miner:cinder-contracting" },
    fleet: busyFleet(600),
    policy: { ...policy, protectedCash: 99_000 },
    account: { balance: 100_000, committed: 0 },
    now: NOW,
    capabilities: [createHireCapability({ cost: policy.hireCost, execute: () => {} })],
  });

  assert.equal(result.selected.length, 0, "the float is not available to spend");
  assert.equal(result.blocked.length, 1);
});

// ── A new operator needs no code ────────────────────────────────────────────

test("a third mining company gets its own temperament from data alone", () => {
  const state = createWorld();
  state.logistics.institutions["upstart-boss"] = {
    id: "upstart-boss",
    name: "Upstart Boss",
    archetypeId: "person",
    traits: { caution: 0.05, growthBias: 0.95, urgencyBias: 0.9 },
  };
  state.logistics.institutions["upstart-co"] = {
    id: "upstart-co",
    name: "Upstart Co",
    controllerInstitutionId: "upstart-boss",
  };

  const upstart = resolveFleetPolicy(state, "upstart-co");
  const cinder = resolveFleetPolicy(state, "miner:cinder-contracting");
  const flint = resolveFleetPolicy(state, "miner:flint-prospecting");

  assert.ok(upstart.hireAfterBusySeconds < cinder.hireAfterBusySeconds);
  assert.ok(upstart.releaseAfterIdleSeconds < flint.releaseAfterIdleSeconds);
  // And it acts on a shortage the others would still be thinking about.
  assert.equal(deriveFleetNeeds({ fleet: busyFleet(50), policy: upstart, now: NOW }).filter((need) => need.kind === FLEET_NEED.CAPACITY).length, 1);
  assert.equal(deriveFleetNeeds({ fleet: busyFleet(50), policy: flint, now: NOW }).filter((need) => need.kind === FLEET_NEED.CAPACITY).length, 0);
});

// ── What a hull uniquely lets its owner do ─────────────────────────────────

// Observed live: Flint and Cinder each paid 7,500cr to refit a hull with a
// subspace drive, then stood that very hull down. The hull that just gained
// reach is the one idling — it is waiting for the distant work only it can
// take — so it sorted first for release by longest-idle.
//
// The answer is NOT a rule that the last long-range hull may never be sold.
// An operator may decide badly, strand its own hub and leave a derelict; that
// is content. What was missing is that the decision never weighed what the
// hull uniquely enables. Now it does, and temperament still decides.
test("work only one hull can take buys that hull patience", () => {
  const state = createWorld();
  const policy = resolveFleetPolicy(state, "miner:cinder-contracting");
  const idleSeconds = policy.releaseAfterIdleSeconds + 60;

  const plain = idleFleet(idleSeconds);
  assert.equal(
    deriveFleetNeeds({ fleet: plain, policy, now: NOW }).filter((need) => need.kind === FLEET_NEED.SURPLUS).length,
    1,
    "a hull that enables nothing special is waste at this idle time",
  );

  const valuable = idleFleet(idleSeconds);
  valuable.ships[0].capabilityValue = policy.hireCost * 3;   // reachable work worth three hulls
  assert.equal(
    deriveFleetNeeds({ fleet: valuable, policy, now: NOW }).filter((need) => need.kind === FLEET_NEED.SURPLUS).length,
    0,
    "the same idle time, but this one is the only ship that can serve open work",
  );
});

// Patience, not immunity. The operator is allowed to be wrong.
test("a capability does not make a hull unsellable", () => {
  const state = createWorld();
  const policy = resolveFleetPolicy(state, "miner:cinder-contracting");
  const fleet = idleFleet(policy.releaseAfterIdleSeconds * 40);
  fleet.ships[0].capabilityValue = policy.hireCost * 3;

  const surplus = deriveFleetNeeds({ fleet, policy, now: NOW }).filter((need) => need.kind === FLEET_NEED.SURPLUS);
  assert.equal(surplus.length, 1, "waited out and still no work — it goes, and the hub may be stranded");
});

// The same hull, the same work, two operators. Flint is sticky and Cinder is
// quick, out of traits already authored for them.
test("two operators weigh the same capability differently", () => {
  const state = createWorld();
  const cinder = resolveFleetPolicy(state, "miner:cinder-contracting");
  const flint = resolveFleetPolicy(state, "miner:flint-prospecting");
  assert.ok(flint.capabilityPatience > cinder.capabilityPatience, "the cautious operator holds a capability longer");
});

test("untagged fleets release exactly as before", () => {
  const state = createWorld();
  const policy = resolveFleetPolicy(state, "miner:cinder-contracting");
  const fleet = idleFleet(600);

  assert.equal(deriveFleetNeeds({ fleet, policy, now: NOW }).filter((need) => need.kind === FLEET_NEED.SURPLUS).length, 1);
});
