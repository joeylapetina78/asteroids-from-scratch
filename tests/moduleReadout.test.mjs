import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_DRAWN_SLOTS,
  describeModuleReadout,
  formatCount,
  slotsReadout,
} from "../src/systems/moduleReadout.js";

test("a charge count is a number, not a sentence", () => {
  const readout = describeModuleReadout("miner", { charges: 1996 });
  assert.equal(readout.kind, "count");
  assert.equal(readout.value, "1,996");
  assert.equal(readout.label, "CHARGES");
});

test("a bay of beacons is slots you can count without reading", () => {
  const readout = describeModuleReadout("beacon-bay", { beaconsLoaded: 3, beaconCapacity: 5 });
  assert.equal(readout.kind, "slots");
  assert.equal(readout.filled, 3);
  assert.equal(readout.total, 5);
  assert.equal(readout.label, "3 / 5");
});

// Slots only work while you can count them at a glance.
test("too many slots to count becomes text instead", () => {
  const readout = describeModuleReadout("beacon-bay", {
    beaconsLoaded: 40, beaconCapacity: MAX_DRAWN_SLOTS + 1, text: "40 aboard",
  });
  assert.equal(readout.kind, "status");
});

test("slots never overfill or go negative, whatever it is handed", () => {
  assert.deepEqual(
    [slotsReadout(9, 5).filled, slotsReadout(-3, 5).filled, slotsReadout(2, 5).filled],
    [5, 0, 2],
  );
  assert.equal(slotsReadout(1, -4).total, 0);
});

test("fuel and hull are levels, with their figure alongside", () => {
  const fuel = describeModuleReadout("engine", { fuelFraction: 0.5, fuel: 2000 });
  assert.equal(fuel.kind, "level");
  assert.equal(fuel.fraction, 0.5);
  assert.equal(fuel.label, "2,000");

  const hull = describeModuleReadout("hull", { integrityFraction: 0.83 });
  assert.equal(hull.label, "83%");
});

test("a level is clamped rather than drawn off the end of its bar", () => {
  assert.equal(describeModuleReadout("hull", { integrityFraction: 4 }).fraction, 1);
  assert.equal(describeModuleReadout("hull", { integrityFraction: -2 }).fraction, 0);
  assert.equal(describeModuleReadout("hull", { integrityFraction: Number.NaN }).kind, "status");
});

// The fallback has to be total: a unit nobody has described yet still needs a
// window that works.
test("an undescribed unit still gets a readout", () => {
  const readout = describeModuleReadout("tow-cable", { text: "Idle" });
  assert.equal(readout.kind, "status");
  assert.equal(readout.text, "Idle");
});

test("a unit with nothing to say says so rather than showing NaN or blank", () => {
  ["miner", "engine", "hull", "beacon-bay", "scanner", "whatever"].forEach((panelId) => {
    const readout = describeModuleReadout(panelId, {});
    assert.equal(readout.kind, "status");
    assert.equal(readout.text, "\u2014");
  });
});

test("counts stay readable and never render as NaN", () => {
  assert.equal(formatCount(1996), "1,996");
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(12345678), "12,345,678");
  assert.equal(formatCount("nope"), "nope");
  assert.equal(formatCount(null), "\u2014");
});
