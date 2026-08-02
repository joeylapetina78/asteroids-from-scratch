import assert from "node:assert/strict";
import test from "node:test";
import { NpcShip } from "../src/entities/NpcShip.js";

const route = [
  { id: "origin", position: { x: 0, y: 0 } },
  { id: "destination", position: { x: 1000, y: 0 } },
];

function assertStableTrain(ship) {
  let anchor = ship.position;
  ship.cargoSegments.forEach((segment) => {
    const linkLength = Math.hypot(segment.position.x - anchor.x, segment.position.y - anchor.y);
    const speed = Math.hypot(segment.velocity.x, segment.velocity.y);
    assert.ok(Number.isFinite(linkLength), "cargo position remains finite");
    assert.ok(linkLength <= 34 * 1.61, `cargo link remains bounded, got ${linkLength}`);
    assert.ok(speed <= 220.01, `cargo speed remains bounded, got ${speed}`);
    anchor = segment.position;
  });
}

test("a throttled frame cannot launch a hauler's cargo train across the world", () => {
  const ship = new NpcShip({ id: "train-test", name: "Train Test", route, x: 0, y: 0, seed: 2 });
  ship.position.x = 420;
  ship.position.y = -180;
  ship.updateCargoSegments(1.5);
  assertStableTrain(ship);
});

test("cargo links remain stable through repeated turns and uneven frame times", () => {
  const ship = new NpcShip({ id: "turn-test", name: "Turn Test", route, x: 0, y: 0, seed: 3 });
  for (let frame = 0; frame < 900; frame += 1) {
    const angle = frame * 0.025;
    ship.position.x += Math.cos(angle) * 1.4;
    ship.position.y += Math.sin(angle) * 1.4;
    ship.heading = angle;
    ship.updateCargoSegments(frame % 97 === 0 ? 0.18 : 1 / 60);
    assertStableTrain(ship);
  }
});
