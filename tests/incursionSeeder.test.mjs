import assert from "node:assert/strict";
import test from "node:test";

import { createIncursionField, createSeededDevice, RIFT_BLOOM_TYPES } from "../src/systems/incursionField.js";
import { RiftSeeder } from "../src/entities/RiftSeeder.js";

test("a new gate sends its perimeter seeder alongside the ordinary wave", () => {
  const field = createIncursionField();
  const { portal, spawned } = field.spawnPortal({ x: 20, y: 40, seed: 12 });
  assert.equal(spawned.length, 6);
  assert.equal(spawned[0].type, "rift-seeder");
  assert.equal(spawned[1].type, "fighter");
  assert.equal(portal.waveCount, 1);
  assert.equal(portal.scoutingComplete, false);
});

test("the seeder does not count against the combat wave budget", () => {
  const field = createIncursionField();
  const { portal, spawned } = field.spawnPortal({ x: 0, y: 0, seed: 13 });
  assert.equal(portal.unitIds.has(spawned[0].id), false);
  assert.equal(portal.unitIds.size, 5);
  assert.equal(portal.waveCount, 1);
});

test("the seeder fabricates both bloom families and mobile weapon variants", () => {
  const field = createIncursionField();
  const { portal } = field.spawnPortal({ x: 0, y: 0, seed: 77 });
  const devices = Array.from({ length: 80 }, (_, sequence) => createSeededDevice(portal, {
    position: { x: sequence * 40, y: 10 }, heading: 0.4, sequence,
  }, 0));
  assert.ok(devices.some((device) => RIFT_BLOOM_TYPES.includes(device.type)));
  assert.ok(devices.some((device) => device.mobile && device.motion));
  assert.ok(devices.some((device) => device.large));
});

test("the seeder takes the nearest radial exit and moves like heavy machinery", () => {
  const seeder = new RiftSeeder({ id: "seeder", x: 100, y: 0, seed: 4, sourcePortalId: "gate" });
  const hub = { id: "hub", type: "hub", position: { x: 0, y: 0 }, interactionRadius: 100 };
  const world = { portalPosition: { x: 100, y: 0 }, worldSites: [hub] };
  seeder.update(3, world);
  assert.equal(seeder.phase, "egress");
  assert.ok(seeder.egressTarget.x > 900);
  assert.ok(Math.abs(seeder.egressTarget.y) < 0.001);
  for (let index = 0; index < 200; index += 1) seeder.update(0.1, world);
  assert.ok(Math.hypot(seeder.velocity.x, seeder.velocity.y) <= 52.01);
});

test("the hazard trail begins on egress instead of waiting for the perimeter", () => {
  const seeder = new RiftSeeder({ id: "seeder", x: 100, y: 0, seed: 5, sourcePortalId: "gate" });
  const world = {
    portalPosition: { x: 100, y: 0 },
    worldSites: [{ id: "hub", type: "hub", position: { x: 0, y: 0 }, interactionRadius: 100 }],
  };
  seeder.update(3, world);
  seeder.update(0.1, world);
  assert.equal(seeder.phase, "egress");
  assert.equal(seeder.consumeDeployments().length, 1);
});
