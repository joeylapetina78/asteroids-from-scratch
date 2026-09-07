import test from "node:test";
import assert from "node:assert/strict";

import { getScanMarkerEdgePoint } from "../src/systems/scanner.js";

const canvas = { width: 1000, height: 800 };

test("cockpit scan markers land on the circular viewport rim", () => {
  const boundary = { type: "circle", centerX: 500, centerY: 400, radius: 360 };
  const diagonal = Math.SQRT1_2;
  const point = getScanMarkerEdgePoint(500, 400, diagonal, -diagonal, canvas, boundary);

  assert.ok(Math.abs(Math.hypot(point.x - boundary.centerX, point.y - boundary.centerY) - 332) < 0.0001);
  assert.ok(point.x > boundary.centerX);
  assert.ok(point.y < boundary.centerY);
});

test("panorama scan markers retain the rectangular viewport edge", () => {
  const point = getScanMarkerEdgePoint(500, 400, 1, 0, canvas, { type: "rectangle" });

  assert.deepEqual(point, { x: 972, y: 400 });
});
