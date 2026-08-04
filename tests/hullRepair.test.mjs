import assert from "node:assert/strict";
import test from "node:test";
import { addToTank, applyPanelPatch, getHullRepairRateMultiplier, HULL_REPAIR_RATE } from "../src/systems/panelMaintenance.js";
import { getResourceProcessValue } from "../src/systems/resourceDefinitions.js";
import { createGameState } from "../src/state/gameState.js";

test("addToTank never exceeds the cap or falls below zero", () => {
  assert.equal(addToTank(180, 250, 200), 200, "overfill is clamped to the cap");
  assert.equal(addToTank(50, 30, 200), 80, "an in-range add is exact");
  assert.equal(addToTank(100, -250, 200), 0, "a value cannot go negative");
  assert.equal(addToTank(0, 20, 100), 20, "empty tank fills by the added amount");
});

test("structural material is the efficient hull patch, others are emergency-only", () => {
  const iron = getResourceProcessValue("iron-nickel", "hull-repair");
  assert.equal(iron, 20);
  assert.equal(getResourceProcessValue("aluminum", "hull-repair"), iron * 2, "aluminum = 2x iron per SPRC equivalence");
  assert.equal(getResourceProcessValue("titanium", "hull-repair"), iron * 3);
  const emergency = getResourceProcessValue("water-ice", "hull-repair");
  assert.equal(emergency, 4, "fuel material is a poor emergency patch");
  assert.equal(getResourceProcessValue("copper", "hull-repair"), 4, "conductor is a poor emergency patch");
  assert.equal(iron / emergency, 5, "structural stays 5x better than a jury-rig");
  // 5 iron-nickel now fills one full reserve tank (= one full hull repair).
  assert.equal(iron * 5, 100);
});

test("converting resource into reserve consumes input and respects the reserve cap", () => {
  const hull = { integrity: 100, maxIntegrity: 100, repairReserve: 0, maxRepairReserve: 100 };
  // Process 20 iron-nickel (5 each) → exactly a full reserve, no overfill.
  const perUnit = getResourceProcessValue("iron-nickel", "hull-repair");
  for (let i = 0; i < 25; i += 1) {
    hull.repairReserve = addToTank(hull.repairReserve, perUnit, hull.maxRepairReserve);
  }
  assert.equal(hull.repairReserve, 100, "reserve is capped even after 25 units fed");
});

test("applyPanelPatch transfers reserve into integrity 1:1 and conserves total", () => {
  const hull = { integrity: 60, maxIntegrity: 100, repairReserve: 30 };
  const before = hull.integrity + hull.repairReserve;

  // One frame of a large budget: bounded by missing integrity (40) and reserve (30).
  const patched = applyPanelPatch(hull, hull, 1000);

  assert.equal(patched, 30, "patch is bounded by available reserve");
  assert.equal(hull.integrity, 90, "integrity rose by exactly the reserve spent");
  assert.equal(hull.repairReserve, 0, "reserve drained by exactly the integrity gained");
  assert.equal(hull.integrity + hull.repairReserve, before, "no material created or destroyed");
});

test("applyPanelPatch is bounded by the per-frame rate budget", () => {
  const hull = { integrity: 0, maxIntegrity: 100, repairReserve: 100 };
  const deltaSeconds = 0.1;

  const patched = applyPanelPatch(hull, hull, HULL_REPAIR_RATE * deltaSeconds);

  assert.equal(patched, HULL_REPAIR_RATE * deltaSeconds, "one frame patches at most rate*dt");
  assert.equal(hull.integrity, 2);
  assert.equal(hull.repairReserve, 98);
});

test("repair rate ramps from ten percent to full speed over an episode", () => {
  assert.equal(getHullRepairRateMultiplier(40, 40, 80), 0.1);
  assert.equal(getHullRepairRateMultiplier(60, 40, 80), 0.55);
  assert.equal(getHullRepairRateMultiplier(80, 40, 80), 1);
});

test("no patch occurs without stored reserve, and integrity never exceeds max", () => {
  const empty = { integrity: 40, maxIntegrity: 100, repairReserve: 0 };
  assert.equal(applyPanelPatch(empty, empty, 1000), 0, "no reserve → no repair");
  assert.equal(empty.integrity, 40, "integrity unchanged with an empty reserve");

  const full = { integrity: 100, maxIntegrity: 100, repairReserve: 50 };
  assert.equal(applyPanelPatch(full, full, 1000), 0, "full hull → nothing to patch");
  assert.equal(full.integrity, 100, "integrity never exceeds max");
  assert.equal(full.repairReserve, 50, "reserve is untouched when there is no headroom");
});

test("fresh state seeds a hull reserve tank and dormant condition", () => {
  const state = createGameState();
  const hull = state.components.hull;

  assert.equal(hull.repairReserve, 0);
  assert.equal(hull.maxRepairReserve, 100);
  assert.equal(hull.condition, "healthy", "condition field exists for the future wear system");
});
