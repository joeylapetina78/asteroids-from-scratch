import assert from "node:assert/strict";
import test from "node:test";

import { createIncursionField } from "../src/systems/incursionField.js";

test("raiders outside the shield orbit still hold the gate's fabrication budget", () => {
  const field = createIncursionField();
  const { portal, spawned } = field.spawnPortal({ x: 0, y: 0, seed: 7 });
  const combatUnits = spawned.filter((unit) => unit.type !== "rift-seeder");
  spawned.forEach((unit) => { unit.position = { x: 2000, y: 0 }; });
  portal.nextWaveIn = 0;

  const result = field.update(1, spawned);
  assert.equal(portal.guardIds.size, 0, "distant raiders no longer shield the portal");
  assert.equal(portal.unitIds.size, combatUnits.length, "but remain part of its outstanding force");
  assert.equal(result.spawned.length, 0);
  assert.equal(result.events[0].type, "incursion.waveHeld");
  portal.age = 5;
  assert.equal(portal.getEncounterState().label, "RAIDERS OUT", "a remote population hold is not mislabeled as active reinforcement");
});

test("repeated wave checks remain bounded by living force rather than distance", () => {
  const field = createIncursionField();
  const opening = field.spawnPortal({ x: 0, y: 0, seed: 9 });
  const firstWave = opening.spawned;
  const lifeforms = [...firstWave];
  for (let pulse = 0; pulse < 40; pulse += 1) {
    lifeforms.forEach((unit) => { unit.position = { x: 2400 + pulse, y: 0 }; });
    opening.portal.nextWaveIn = 0;
    const result = field.update(1, lifeforms);
    lifeforms.push(...result.spawned);
  }
  assert.equal(lifeforms.length, firstWave.length, "roaming is not mistaken for casualties");
});
