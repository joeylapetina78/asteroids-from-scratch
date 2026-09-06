import assert from "node:assert/strict";
import test from "node:test";

import { createIncursionField } from "../src/systems/incursionField.js";

test("raiders outside the shield orbit still hold the gate's fabrication budget", () => {
  const field = createIncursionField();
  const { portal, spawned } = field.spawnPortal({ x: 0, y: 0, seed: 7 });
  spawned.forEach((unit) => { unit.position = { x: 2000, y: 0 }; });
  portal.nextWaveIn = 0;

  const result = field.update(1, spawned);
  assert.equal(portal.guardIds.size, 0, "distant raiders no longer shield the portal");
  assert.equal(portal.unitIds.size, spawned.length, "but remain part of its outstanding force");
  assert.equal(result.spawned.length, 0);
  assert.equal(result.events[0].type, "incursion.waveHeld");
});

test("repeated wave checks remain bounded by living force rather than distance", () => {
  const field = createIncursionField();
  const opening = field.spawnPortal({ x: 0, y: 0, seed: 9 });
  const lifeforms = [...opening.spawned];
  for (let pulse = 0; pulse < 40; pulse += 1) {
    lifeforms.forEach((unit) => { unit.position = { x: 2400 + pulse, y: 0 }; });
    opening.portal.nextWaveIn = 0;
    const result = field.update(1, lifeforms);
    lifeforms.push(...result.spawned);
  }
  assert.equal(lifeforms.length, opening.spawned.length, "roaming is not mistaken for casualties");
});
