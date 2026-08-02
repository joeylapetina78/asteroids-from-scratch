import assert from "node:assert/strict";
import test from "node:test";
import { createEncounterDirector } from "../src/systems/encounterDirector.js";

test("economic casualties make the encounter director ease opposition", () => {
  const stats = new Map();
  const director = createEncounterDirector({ getStat: (key, fallback) => stats.get(key) ?? fallback });

  for (let tick = 0; tick < 8; tick += 1) {
    director.update(2, { hullIntegrity: 100, hullMaxIntegrity: 100, economy: { criticalCraftCount: 1, openRepairCount: 1 } });
  }

  const snapshot = director.getDebugSnapshot();
  assert.ok(snapshot.lastSample.economicConcern > 0);
  assert.ok(snapshot.pacing.waveSizeMultiplier < 1, "a damaged productive craft and repair queue reduce wave size");
  assert.ok(snapshot.pacing.waveDelayMultiplier > 1, "economic recovery creates more time between waves");
});

test("a calm economy still permits the director's small authored escalation", () => {
  const director = createEncounterDirector({ getStat: (_key, fallback) => fallback });
  for (let tick = 0; tick < 8; tick += 1) director.update(2, { hullIntegrity: 100, hullMaxIntegrity: 100, economy: {} });
  assert.ok(director.getIncursionPacing().waveSizeMultiplier > 1);
});

test("sustained maximum economic concern requests one bounded portal suppression", () => {
  const director = createEncounterDirector({ getStat: (_key, fallback) => fallback });
  for (let tick = 0; tick < 30; tick += 1) {
    director.update(2, { hullIntegrity: 100, hullMaxIntegrity: 100, economy: { criticalCraftCount: 2 } });
  }
  assert.equal(director.consumePortalSuppressionRequest(), true);
  assert.equal(director.consumePortalSuppressionRequest(), false, "the same emergency cannot repeatedly collapse portals");
  assert.equal(director.getDebugSnapshot().economicEmergencySeconds, 60);
});
