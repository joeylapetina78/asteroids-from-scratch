import assert from "node:assert/strict";
import test from "node:test";

import { NpcShip } from "../src/entities/NpcShip.js";
import { createGameState } from "../src/state/gameState.js";
import { infrastructureNavigationObstacles } from "../src/systems/infrastructureNavigation.js";

const yard = { id: "yard-exchange", type: "hub", position: { x: 0, y: 0 } };
const porch = { id: "scrap-porch", type: "hub", position: { x: 2000, y: 0 } };

test("drawn industrial fixtures become NPC navigation exclusions", () => {
  const state = createGameState();
  const obstacles = infrastructureNavigationObstacles(state, [yard, porch]);

  assert.ok(obstacles.some((item) => item.id === "infrastructure:yard-shipyard"), "the slipway occupies navigable space");
  assert.ok(obstacles.some((item) => item.id === "infrastructure:yard-plate-works"), "the plate works occupies navigable space");
  assert.ok(obstacles.some((item) => item.id === "infrastructure:sprc-maw"), "the Maw occupies navigable space");
  assert.ok(obstacles.every((item) => item.radius >= 58), "each footprint includes cargo-train maneuvering room");
});

test("an NPC bends away from infrastructure in its path", () => {
  const destination = { id: "destination", type: "hub", position: { x: 1000, y: 0 } };
  const ship = new NpcShip({ id: "careful-hauler", name: "Careful Hauler", route: [yard, destination], x: 0, y: 0, seed: 2 });
  ship.operationalStatus = "available";
  ship.velocity = { x: 70, y: 0 };

  ship.update(1 / 30, {
    asteroids: [],
    navigationObstacles: [{ id: "infrastructure:test-works", position: { x: 150, y: 0 }, radius: 62 }],
    npcShips: [ship],
    sites: [yard, destination],
  });

  assert.notEqual(ship.velocity.y, 0, "the obstacle produces a sideways avoidance turn");
});

test("a hauler can depart Scrap Porch between the Maw and Berth Two", () => {
  const destination = { id: "blue-lantern", type: "hub", position: { x: 4000, y: 0 } };
  const state = createGameState();
  const obstacles = infrastructureNavigationObstacles(state, [yard, porch]);
  const ship = new NpcShip({
    id: "porch-departure",
    name: "Porch Departure",
    route: [porch, destination],
    x: porch.position.x,
    y: porch.position.y,
    seed: 2,
    laneOffset: 0,
  });
  ship.operationalStatus = "available";

  for (let frame = 0; frame < 30 * 20; frame += 1) {
    ship.update(1 / 30, {
      asteroids: [],
      navigationObstacles: obstacles,
      npcShips: [ship],
      sites: [porch, destination],
    });
  }

  assert.ok(ship.position.x > porch.position.x + 500, `the hauler cleared Scrap Porch, reaching x=${ship.position.x}`);
  assert.ok(ship.navigationMetrics.distanceTraveled > 500, "departure makes sustained progress");
});
