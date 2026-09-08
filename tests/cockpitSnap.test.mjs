import test from "node:test";
import assert from "node:assert/strict";

import { alignCockpitPanel, snapCockpitPanel } from "../src/systems/cockpitSnap.js";

test("panels outside the viewport snap to the rectangular bay grid", () => {
  const result = snapCockpitPanel(
    { x: 51, y: 107 },
    { width: 120, height: 80 },
    { width: 1600, height: 900 },
  );

  assert.deepEqual(result, { x: 48, y: 96, region: "bay" });
});

test("internal controls align their horizontal and vertical centerlines", () => {
  const result = alignCockpitPanel(
    { x: 203, y: 286 },
    { x: [20, 70], y: [12, 42] },
    { x: [272, 500], y: [300, 600] },
  );

  assert.deepEqual(result, { x: 202, y: 288, guideX: 272, guideY: 300 });
});

test("alignment guides remain inactive outside the magnetic threshold", () => {
  const result = alignCockpitPanel(
    { x: 100, y: 100 },
    { x: [20], y: [20] },
    { x: [200], y: [200] },
  );

  assert.deepEqual(result, { x: 100, y: 100, guideX: null, guideY: null });
});

test("panels over the viewport snap to a radial intersection", () => {
  const result = snapCockpitPanel(
    { x: 940, y: 405 },
    { width: 120, height: 90 },
    { width: 1600, height: 900 },
  );

  assert.equal(result.region, "viewport");
  assert.equal(result.y, 405);
  assert.equal(result.x, 932);
});
