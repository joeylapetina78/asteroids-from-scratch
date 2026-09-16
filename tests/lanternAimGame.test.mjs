import assert from "node:assert/strict";
import test from "node:test";

import { Lifeform } from "../src/entities/Lifeform.js";

function createLantern() {
  return new Lifeform({ type: "lantern", x: 0, y: 0, velocity: { x: 8, y: 0 }, seed: 21 });
}

const world = {
  asteroids: [], lifeforms: [], disturbances: [], shipPowered: true,
  ship: { position: { x: 240, y: 0 }, velocity: { x: 20, y: 0 }, angle: 0 },
};

test("a hit advances a gold lantern to its faster pink stage", () => {
  const lantern = createLantern();
  assert.equal(lantern.aimStage, 0);
  assert.equal(lantern.hitLantern(), true);
  lantern.update(0.1, world);
  assert.equal(lantern.aimStage, 1);
  assert.ok(lantern.maxSpeed > lantern.baseMaxSpeed);
  assert.equal(lantern.isAlive, true);
});

test("a second hit turns it red, then spends the creature as a player-only bolt", () => {
  const lantern = createLantern();
  lantern.hitLantern();
  lantern.hitLantern();
  assert.equal(lantern.aimStage, 2);
  lantern.update(0.8, world);
  const [shot] = lantern.consumeShots();
  assert.equal(lantern.isAlive, false);
  assert.equal(shot.sourceType, "lantern");
  assert.equal(shot.playerOnly, true);
  assert.equal(shot.color, "#ff4d5a");
  assert.equal(shot.damage, 24);
  assert.equal(lantern.consumeShots().length, 0);
});
