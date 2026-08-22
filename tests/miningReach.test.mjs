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

// ── What a hub may chase, by how badly it needs it ─────────────────────────
import { URGENCY, urgencyFromCoverage } from "../src/systems/valuation.js";

const CEILING = { routine: 2.5, urgent: 4, emergency: 6.5 };
const ceilingFor = (position, baseValue) => baseValue * CEILING[urgencyFromCoverage(position)];

test("an empty shelf is a different situation from a comfortable one", () => {
  const comfortable = { onHand: 100, incoming: 0, target: 100 };
  const short = { onHand: 20, incoming: 0, target: 100 };
  const empty = { onHand: 0, incoming: 0, target: 100 };

  assert.equal(urgencyFromCoverage(comfortable), URGENCY.ROUTINE);
  assert.equal(urgencyFromCoverage(short), URGENCY.URGENT);
  assert.equal(urgencyFromCoverage(empty), URGENCY.EMERGENCY);

  assert.ok(ceilingFor(empty, 300) > ceilingFor(short, 300));
  assert.ok(ceilingFor(short, 300) > ceilingFor(comfortable, 300));
});

test("the raised ceiling covers what the frontier actually needs", () => {
  // Every refused order in the live run was PINNED at the flat 2.5x cap and
  // still short of the run's cost. These are the prices they had to be able to
  // reach, per unit, over six-unit loads.
  const empty = { onHand: 0, incoming: 0, target: 100 };

  assert.ok(ceilingFor(empty, 300) >= 909, "ore-station aluminum, needing ~909/u");
  assert.ok(ceilingFor(empty, 300) >= 1_548, "coldwater water-ice, needing ~1548/u");
  assert.ok(ceilingFor(empty, 80) >= 288, "kiln carbonaceous, needing ~288/u — cheap ore, same bind");
});

test("a comfortable hub still cannot bid the world into inflation", () => {
  // The cap exists to keep prices meaningful. Only genuine scarcity lifts it,
  // and even then it is bounded rather than a blank cheque.
  const comfortable = { onHand: 100, incoming: 0, target: 100 };
  assert.equal(ceilingFor(comfortable, 300), 750, "book value x 2.5, exactly as before");
  assert.ok(ceilingFor({ onHand: 0, incoming: 0, target: 100 }, 300) < 300 * 10,
    "and desperation is bounded, not unbounded");
});
