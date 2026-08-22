// Where NPCs may put the things they build.
//
// The Yard Plate Works was placed by a hand-picked offset and landed in the
// berth approach — in the road, on the pad craft use to come and go. The fix is
// a rule rather than a better number, because a hub that commissions a factory
// at runtime has nobody to pick a number for it.

import assert from "node:assert/strict";
import test from "node:test";
import {
  FACILITY_RING,
  MINIMUM_SEPARATION_DEGREES,
  facilityHeadingDegrees,
  facilityOffset,
  isInReservedApproach,
} from "../src/systems/hubLayout.js";

test("nothing is ever built in the road", () => {
  ["shipyard", "parts-factory", "repair-facility"].forEach((kind) => {
    for (let ordinal = 0; ordinal < 12; ordinal += 1) {
      const heading = facilityHeadingDegrees(kind, ordinal);
      assert.equal(isInReservedApproach(heading), false,
        `${kind} #${ordinal} landed at ${heading}deg, inside the berth approach`);
    }
  });
});

test("no two facilities stand on each other", () => {
  const headings = [];
  for (let ordinal = 0; ordinal < 6; ordinal += 1) headings.push(facilityHeadingDegrees("parts-factory", ordinal));
  headings.push(facilityHeadingDegrees("shipyard", 0));

  headings.forEach((heading, index) => {
    headings.slice(index + 1).forEach((other) => {
      const gap = Math.abs(((heading - other + 540) % 360) - 180);
      assert.ok(gap >= MINIMUM_SEPARATION_DEGREES - 0.001,
        `two facilities only ${gap.toFixed(1)}deg apart`);
    });
  });
});

test("things that work together stand together", () => {
  const slipway = facilityHeadingDegrees("shipyard", 0);
  const firstWorks = facilityHeadingDegrees("parts-factory", 0);
  const gap = Math.abs(((slipway - firstWorks + 540) % 360) - 180);

  assert.ok(gap <= MINIMUM_SEPARATION_DEGREES * 1.5,
    `the works that feeds the ways should stand beside them, not ${gap.toFixed(1)}deg away`);
});

test("the same facility lands in the same place every run", () => {
  assert.equal(facilityHeadingDegrees("parts-factory", 2), facilityHeadingDegrees("parts-factory", 2));
  assert.deepEqual(facilityOffset("parts-factory", 1), facilityOffset("parts-factory", 1));
});

test("facilities sit outside the hub body and inside its approach ring", () => {
  const offset = facilityOffset("parts-factory", 0);
  const distance = Math.hypot(offset.x, offset.y);
  assert.equal(Math.round(distance), FACILITY_RING);
  assert.ok(distance > 74, "clear of the capital's body");
  assert.ok(distance < 330, "inside the approach ring, so it reads as part of the station");
});
