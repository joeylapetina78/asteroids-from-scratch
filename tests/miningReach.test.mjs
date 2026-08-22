import assert from "node:assert/strict";
import test from "node:test";

import { evaluateMiningJob } from "../src/systems/valuation.js";
import { SHIP_DRIVES, getShipDrive } from "../src/systems/shipDrives.js";

// Wear is what makes distance expensive for a miner, exactly as it was for a
// carrier before subspace hulls existed.
//
// Measured live, with the frontier finally posting real orders at real prices:
//
//   mine-yard-iron             accept  net +2316   travel  4,731u   wear   416
//   mine-ledge-silicate        accept  net  +428   travel  9,725u   wear   856
//   mine-kiln-carbonaceous     REJECT  net  -322   travel 14,755u   wear 1,298
//   mine-ore-station-aluminum  REJECT  net  -241   travel 48,045u   wear 4,228
//   mine-coldwater-water       REJECT  net -3575   travel 84,284u   wear 7,417
//
// Ore Station One missed by 241 credits. Kiln Crossing is an INNER hub and was
// refused too, which is why this is not only a frontier question.

const STANDARD_WEAR = 0.00004;
// What a service visit really costs these companies in the running world, not
// the valuation's own placeholder default. Recovered from the live figures:
// 48,045u x 0.00004 x 2,200 = 4,228, and 4,731u gives 416.3 — both matching the
// reasons the market printed. Wear is expensive here because SERVICE is.
const LIVE_SERVICE_COST = 2_200;
// The other costs a real run carries, which the valuation's bare defaults omit:
// crew and consumables per completed run, and the mining-rights royalty owed to
// the site's population. Without them the model reproduces the live WEAR exactly
// but lands 321 credits optimistic, which is the difference between Ore Station
// One reading +80 and the -241 the market actually printed.
const LIVE_CREW_AND_CONSUMABLES = 105;
const LIVE_ROYALTY = 216;

function value({ travel, payout, driveId = null }) {
  const drive = getShipDrive(driveId ? { driveId } : null);
  return evaluateMiningJob({
    jobId: "test", payout, units: 6, travelDistance: travel,
    wearPerDistance: STANDARD_WEAR * drive.wearMultiplier,
    wearCostPerPoint: LIVE_SERVICE_COST,
    fixedOperatingCost: LIVE_CREW_AND_CONSUMABLES,
    royaltyCost: LIVE_ROYALTY,
  });
}

test("the authored numbers reproduce the refusals seen in the live world", () => {
  assert.equal(value({ travel: 4_731, payout: 3_000 }).acceptable, true, "Yard Exchange is served");
  assert.equal(value({ travel: 48_045, payout: 4_500 }).acceptable, false, "Ore Station One is not");
  assert.equal(value({ travel: 84_284, payout: 4_500 }).acceptable, false, "Coldwater Depot is not");
});

test("a subspace hull turns the frontier from refused into worth doing", () => {
  const oreStation = value({ travel: 48_045, payout: 4_500, driveId: "subspace" });
  const coldwater = value({ travel: 84_284, payout: 4_500, driveId: "subspace" });

  assert.equal(oreStation.acceptable, true, "Ore Station One clears with reach");
  assert.equal(coldwater.acceptable, true, "so does Coldwater Depot");
  assert.ok(oreStation.metrics.netValue > 2_500,
    `and comfortably, not marginally (${Math.round(oreStation.metrics.netValue)})`);
});

test("reach is bought, not granted: distance still costs a subspace hull something", () => {
  const near = value({ travel: 4_731, payout: 3_000, driveId: "subspace" });
  const far = value({ travel: 84_284, payout: 3_000, driveId: "subspace" });
  assert.ok(far.metrics.netValue < near.metrics.netValue,
    "a long haul is still worth less than a short one at the same price");

  // Far enough is still too far, even under subspace.
  const absurd = value({ travel: 4_000_000, payout: 4_500, driveId: "subspace" });
  assert.equal(absurd.acceptable, false, "the drive extends range, it does not abolish it");
});

test("a standard hull is unchanged by any of this", () => {
  assert.equal(SHIP_DRIVES["normal-space"].wearMultiplier, 1);
  const before = evaluateMiningJob({
    jobId: "t", payout: 3_000, units: 6, travelDistance: 4_731,
    wearCostPerPoint: LIVE_SERVICE_COST,
    fixedOperatingCost: LIVE_CREW_AND_CONSUMABLES, royaltyCost: LIVE_ROYALTY,
  });
  const after = value({ travel: 4_731, payout: 3_000 });
  assert.equal(Math.round(after.metrics.netValue), Math.round(before.metrics.netValue),
    "the authored fleet prices work exactly as it did");
});

// ── What a hub may chase, by who it is and how badly it needs it ───────────
//
// The version this replaced kept a local copy of the ceiling table in the test
// file, so it asserted its own fixture and would have passed no matter what the
// code did. It did exactly that when the table was deleted.
import { chaseMultiple } from "../src/systems/valuation.js";

const DAG_WREN = { urgencyBias: 0.5 };        // Ore Station One: chases supply
const TOLAN_REYES = { urgencyBias: 0.15 };    // Deep Research: will not be rushed
const priceFor = (traits, inventory, secondsUnserved, book) =>
  book * chaseMultiple({ traits, inventory, secondsUnserved });

test("a stocked buyer does not move off book at all", () => {
  const stocked = { onHand: 100, incoming: 0, target: 100 };
  assert.equal(chaseMultiple({ traits: DAG_WREN, inventory: stocked, secondsUnserved: 9_999 }), 1);
});

test("what a buyer will pay rises smoothly with how short it is", () => {
  const at = (onHand) => chaseMultiple({ traits: DAG_WREN, inventory: { onHand, incoming: 0, target: 100 } });
  const steps = [80, 60, 40, 20, 0].map(at);
  steps.forEach((step, index) => {
    if (index === 0) return;
    assert.ok(step > steps[index - 1], "no buckets: each step short raises the price");
  });
});

// The live freeze this fixes: Ore Station One repriced once while it still had
// stock, hit that moment's ceiling, and could never raise again while it
// starved down to 0.7 units against a target of 8.
test("a buyer that stays hungry keeps raising", () => {
  const empty = { onHand: 0, incoming: 0, target: 100 };
  const first = chaseMultiple({ traits: DAG_WREN, inventory: empty, secondsUnserved: 0 });
  const later = chaseMultiple({ traits: DAG_WREN, inventory: empty, secondsUnserved: 600 });
  const muchLater = chaseMultiple({ traits: DAG_WREN, inventory: empty, secondsUnserved: 3_600 });

  assert.ok(later > first, "ten minutes unanswered is worse than none");
  assert.ok(muchLater > later * 1.5, "and an hour is worse again");
});

test("two buyers in the same trouble do not offer the same price", () => {
  const empty = { onHand: 0, incoming: 0, target: 100 };
  const dag = chaseMultiple({ traits: DAG_WREN, inventory: empty, secondsUnserved: 600 });
  const tolan = chaseMultiple({ traits: TOLAN_REYES, inventory: empty, secondsUnserved: 600 });

  assert.ok(dag > tolan * 1.5,
    "Dag Wren chases supply; Tolan Reyes waits, and Deep Research stays hungry for it");
});

// The three orders that sat refused in the live run, and the prices they had to
// be able to reach per unit. Each had been posted and unanswered for minutes.
test("a starving frontier hub can reach the price its work actually costs", () => {
  const oreStation = { onHand: 0.72, incoming: 0, target: 8 };
  const coldwater = { onHand: 1.7, incoming: 0, target: 15 };
  const kiln = { onHand: 0, incoming: 0, target: 14.15 };
  // They do NOT all get there at the same moment, and that is the point.
  assert.ok(priceFor(DAG_WREN, oreStation, 600, 300) >= 909,
    "Dag Wren chases supply and covers ore-station aluminum within ten minutes");
  assert.ok(priceFor({ urgencyBias: 0.25 }, kiln, 600, 80) >= 288,
    "Kiln Crossing, cheap ore and the same bind, also inside ten minutes");

  // Sera Okonjo holds her price hard in the most isolated place in the world.
  // She reaches what Coldwater's water ice costs, but she takes her time about
  // it — so Coldwater stays dry longer than Ore Station does. Character, not a
  // tuning failure: the curve was not bent to make these land together.
  assert.ok(priceFor({ urgencyBias: 0.4 }, coldwater, 600, 300) < 1_548, "not yet at ten minutes");
  assert.ok(priceFor({ urgencyBias: 0.4 }, coldwater, 1_200, 300) >= 1_548, "but she gets there");
});

// There is no cap, by design — what stops a buyer is its own money, checked by
// the caller. But the curve must not explode the instant a shelf goes empty.
test("desperation is a climb, not a cliff", () => {
  const empty = { onHand: 0, incoming: 0, target: 100 };
  assert.ok(chaseMultiple({ traits: DAG_WREN, inventory: empty, secondsUnserved: 0 }) < 4,
    "an empty shelf alone does not justify any price");
});
