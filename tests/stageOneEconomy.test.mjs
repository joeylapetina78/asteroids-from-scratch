// Stage One: routine wear pacing, and hub mining rights by resource family.

import assert from "node:assert/strict";
import test from "node:test";
import { ROUTINE_WEAR_SCALE, getBaseRates, getMiningWorkWear, getTravelWearRate } from "../src/systems/wearRates.js";
import { canActorDoAction } from "../src/systems/ruleChecker.js";
import { INSTITUTION_MINING_RIGHTS } from "../src/systems/authoritySeeds.js";
import { getResourceFamily } from "../src/systems/resourceDefinitions.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createSprcOperation } from "../src/systems/sprcOperation.js";
import { STANDING_MINING_ORDERS, createMiningOperation } from "../src/systems/miningOperation.js";
import { DIAGNOSTIC_STATE, getDiagnostic } from "../src/systems/diagnostics.js";

// ── Routine wear ───────────────────────────────────────────────────────────

test("routine wear is scaled to a quarter of the designed rate", () => {
  const base = getBaseRates();
  assert.equal(ROUTINE_WEAR_SCALE, 0.25);
  assert.equal(getMiningWorkWear(), base.miningWork * 0.25);
  assert.equal(getMiningWorkWear(), 0.03125);
});

test("a miner completes four times as many deliveries before service", () => {
  const deliveriesToService = Math.ceil(1 / getMiningWorkWear());
  const before = Math.ceil(1 / getBaseRates().miningWork);
  assert.equal(before, 8, "previously eight deliveries wore a ship out");
  assert.equal(deliveriesToService, 32, "now thirty-two");
});

test("every routine travel lane is scaled, and none is left behind", () => {
  const base = getBaseRates().travel;
  for (const corridor of [true, false]) {
    for (const careful of [true, false]) {
      const lane = corridor ? base.corridor : base.openField;
      const expected = (careful ? lane.careful : lane.standard) * 0.25;
      assert.equal(getTravelWearRate({ corridor, careful }), expected,
        `corridor=${corridor} careful=${careful} should be scaled`);
    }
  }
});

test("there is one wear rate for everyone, with no accelerated variant", () => {
  // Acceleration used to be implied by any dev start, so free-play sessions ran
  // at up to 12x wear and could never feel a change to these numbers.
  assert.equal(getMiningWorkWear({ accelerated: true }), getMiningWorkWear(),
    "an accelerated flag must not change the rate");
  assert.equal(getTravelWearRate({ accelerated: true, corridor: true }), getTravelWearRate({ corridor: true }));
});

// ── Mining rights by resource family ───────────────────────────────────────

function seededState() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  return state;
}

function mayMine(state, institutionId, placeId, resourceType) {
  return canActorDoAction(state, {
    actorId: `institution:${institutionId}`, action: "mine", placeId, resourceType, at: 1_000,
  }).allowed;
}

test("each hub may mine its own family and is refused every other one", () => {
  const state = seededState();
  const families = ["volatile", "structural", "industrial", "conductor", "energy", "advanced"];
  const sample = { volatile: "water-ice", structural: "iron-nickel", industrial: "silicate", conductor: "copper", energy: "uranium", advanced: "lithium" };

  for (const right of INSTITUTION_MINING_RIGHTS) {
    for (const family of families) {
      const allowed = mayMine(state, right.institutionId, right.placeId, sample[family]);
      assert.equal(allowed, right.families.includes(family),
        `${right.institutionId} + ${family} (${sample[family]}) should be ${right.families.includes(family)}`);
    }
  }
});

test("the cooperative keeps a right spanning the families its repairs need", () => {
  const state = seededState();
  // SPRC buys these four to keep the repair economy running. A one-family rule
  // would strand it.
  for (const resourceId of ["copper", "silicate", "iron-nickel", "aluminum"]) {
    assert.ok(mayMine(state, "sprc", "hub:scrap-porch", resourceId),
      `SPRC must be able to source ${resourceId} (${getResourceFamily(resourceId)})`);
  }
});

test("a right is granted over a family, so it covers materials by membership", () => {
  const state = seededState();
  // Neither is named anywhere in the grant; both are structural.
  assert.ok(mayMine(state, "yard-exchange", "hub:yard-exchange", "aluminum"));
  assert.ok(mayMine(state, "yard-exchange", "hub:yard-exchange", "titanium"));
});

test("rights are enforced at the hub that holds them, not globally", () => {
  const state = seededState();
  // The Ledge holds industrial at its own hub, and nothing at Yard Exchange.
  assert.ok(mayMine(state, "the-ledge", "hub:the-ledge", "silicate"));
  assert.equal(mayMine(state, "the-ledge", "hub:yard-exchange", "silicate"), false);
});

// ── Enforcement against real order posting ─────────────────────────────────

function createMining(state) {
  const game = {
    worldSites: [
      { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
    ],
    addWorkerShip: () => {},
  };
  const sprc = createSprcOperation({ state, now: () => 1_000 });
  sprc.update();
  return createMiningOperation({ state, game, sprcOperation: sprc, now: () => 1_000 });
}

test("every standing order shipped today is legal under the seeded rights", () => {
  const state = seededState();
  for (const order of STANDING_MINING_ORDERS) {
    assert.ok(mayMine(state, order.buyerInstitutionId, `hub:${order.siteId}`, order.resourceId),
      `${order.id} must be postable: ${order.resourceId} is ${getResourceFamily(order.resourceId)}`);
  }
});

test("an order outside a hub's families is withheld and reported exactly once", () => {
  const state = seededState();
  // Revoke Yard Exchange's structural right by narrowing it to a family it
  // does not trade in. Its iron-nickel order becomes unpostable.
  const grant = Object.values(state.worldRecords.authorityGrants)
    .find((entry) => entry.holderId === "institution:yard-exchange" && entry.jurisdictionId === "hub:yard-exchange");
  assert.ok(grant, "the seeded grant exists");
  grant.limits = { ...grant.limits, resourceFamilies: ["energy"] };

  const mining = createMining(state);
  for (let tick = 0; tick < 250; tick += 1) mining.update();

  const denials = state.ledger.getEventsAfterId(0).filter((entry) => entry.type === "institution.miningRightDenied");
  assert.equal(denials.length, 1, "a rights failure is recorded once, not once per evaluation");
  assert.equal(denials[0].payload.orderId, "mine-yard-iron");
  assert.equal(denials[0].payload.resourceFamily, "structural");

  const allocations = Object.values(mining.getState().allocations);
  assert.ok(allocations.every((entry) => entry.orderId !== "mine-yard-iron"),
    "and no worker is ever allocated to the withheld order");
});

test("restoring the right lets the order be posted again", () => {
  const state = seededState();
  const grant = Object.values(state.worldRecords.authorityGrants)
    .find((entry) => entry.holderId === "institution:yard-exchange" && entry.jurisdictionId === "hub:yard-exchange");
  grant.limits = { ...grant.limits, resourceFamilies: ["energy"] };
  const mining = createMining(state);
  mining.update();
  assert.equal(mayMine(state, "yard-exchange", "hub:yard-exchange", "iron-nickel"), false);

  grant.limits = { ...grant.limits, resourceFamilies: ["structural"] };
  mining.update();
  assert.ok(mayMine(state, "yard-exchange", "hub:yard-exchange", "iron-nickel"),
    "the hub can post again without a restart");
});

// ── Cinder hires and stands down ───────────────────────────────────────────

function createFleetWorld() {
  let clock = 1_000_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  const game = {
    worldSites: [
      { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
    ],
    addWorkerShip: () => {},
  };
  const mining = createMiningOperation({ state, game, now: () => clock });
  return { state, mining, advance: (seconds) => { clock += seconds * 1000; }, now: () => clock };
}

test("Cinder hires when the whole fleet has been committed for a minute", () => {
  const world = createFleetWorld();
  const before = world.mining.workers.length;
  world.state.miningOperation.institution.accounts.operating.balance = 5_000;
  // Pin every ship to work so the fleet reads as fully committed.
  world.mining.workers.forEach((worker) => {
    worker.assignment ??= { allocationId: "x", contractId: "x", resourceId: "iron-nickel", quantity: 1, harvestTargetQuantity: 1, destination: { x: 0, y: 0 }, depositCandidates: [] };
  });
  world.mining.update();
  world.advance(61);
  world.mining.workers.forEach((worker) => {
    worker.assignment ??= { allocationId: "x", contractId: "x", resourceId: "iron-nickel", quantity: 1, harvestTargetQuantity: 1, destination: { x: 0, y: 0 }, depositCandidates: [] };
  });
  world.mining.update();

  assert.equal(world.mining.workers.length, before + 1, "one more ship on the books");
  const hired = world.state.ledger.getEventsAfterId(0).filter((entry) => entry.type === "mining.workerHired");
  assert.equal(hired.length, 1, "and it is on the record, once");
  assert.ok(hired[0].payload.cost > 0, "with what it cost");
});

test("a minute of everyone being busy does not buy a ship on its own", () => {
  const world = createFleetWorld();
  const before = world.mining.workers.length;
  world.state.miningOperation.institution.accounts.operating.balance = 5_000;
  // Busy, then not, then busy again: the run is broken, so nothing is hired.
  world.mining.workers.forEach((worker) => { worker.assignment ??= { allocationId: "x", contractId: "x", resourceId: "iron-nickel", quantity: 1, destination: { x: 0, y: 0 } }; });
  world.mining.update();
  world.advance(40);
  world.mining.workers[0].assignment = null;
  world.mining.update();
  world.advance(40);
  world.mining.update();
  assert.equal(world.mining.workers.length, before, "the clock restarted when a ship freed up");
});

test("Cinder cannot hire what it cannot pay for, and says so", () => {
  const world = createFleetWorld();
  const before = world.mining.workers.length;
  world.state.miningOperation.institution.accounts.operating.balance = 10;
  world.mining.workers.forEach((worker) => { worker.assignment ??= { allocationId: "x", contractId: "x", resourceId: "iron-nickel", quantity: 1, destination: { x: 0, y: 0 } }; });
  world.mining.update();
  world.advance(61);
  world.mining.update();
  assert.equal(world.mining.workers.length, before, "no ship appeared");
  assert.equal(world.state.miningOperation.institution.accounts.operating.balance, 10, "and the money is untouched");
});

test("Cinder stands a ship down after two minutes with nothing to do", () => {
  const world = createFleetWorld();
  const before = world.mining.workers.length;
  world.mining.workers.forEach((worker) => { worker.assignment = null; worker.cargo = {}; });
  world.mining.update();
  world.advance(121);
  world.mining.workers.forEach((worker) => { worker.assignment = null; worker.cargo = {}; });
  world.mining.update();
  assert.ok(world.mining.workers.length < before, "the fleet shrank");
  const released = world.state.ledger.getEventsAfterId(0).filter((entry) => entry.type === "mining.workerReleased");
  assert.ok(released.length > 0, "and it says who and for how long");
  assert.ok(released[0].payload.idleSeconds >= 120);
  assert.equal(getDiagnostic(world.state, released[0].payload.shipInstitutionId)?.state, DIAGNOSTIC_STATE.RETIRED,
    "a released ship leaves the current actor population instead of returning as a free ghost");
});

test("completed mining allocations retain only a compact operational tail", () => {
  const world = createFleetWorld();
  const allocations = world.mining.getState().allocations;
  for (let index = 0; index < 75; index += 1) {
    allocations[`completed-${index}`] = {
      id: `completed-${index}`, status: "completed", acceptedAt: index, completedAt: index,
    };
  }

  world.mining.observe();
  const retained = Object.values(allocations).filter((allocation) => allocation.status === "completed");
  assert.equal(retained.length, 40);
  assert.equal(allocations["completed-0"], undefined);
  assert.ok(allocations["completed-74"]);
});

test("a ship carrying cargo is never stood down", () => {
  const world = createFleetWorld();
  world.mining.workers.forEach((worker) => { worker.assignment = null; worker.cargo = { "iron-nickel": 4 }; });
  world.mining.update();
  world.advance(300);
  world.mining.workers.forEach((worker) => { worker.assignment = null; });
  world.mining.update();
  assert.ok(world.mining.workers.every((worker) => worker.isAlive !== false),
    "cargo would vanish with the ship, so it stays");
});

test("the fleet never empties itself", () => {
  const world = createFleetWorld();
  for (let round = 0; round < 12; round += 1) {
    world.mining.workers.forEach((worker) => { worker.assignment = null; worker.cargo = {}; });
    world.mining.update();
    world.advance(121);
    world.mining.update();
  }
  assert.ok(world.mining.workers.length >= 1, "somebody is always left to work");
});
