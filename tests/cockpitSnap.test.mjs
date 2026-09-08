import test from "node:test";
import assert from "node:assert/strict";

import { alignCockpitPanel, createResponsiveCockpitPosition, restoreResponsiveCockpitPosition, snapCockpitPanel } from "../src/systems/cockpitSnap.js";

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

test("a control snapped to center remains centered on a smaller desk", () => {
  const saved = createResponsiveCockpitPosition(
    { x: 700, y: 300 },
    { width: 200, height: 100 },
    { width: 1600, height: 900 },
    { guideX: 800, guideY: null },
  );
  const restored = restoreResponsiveCockpitPosition(saved, { width: 200, height: 100 }, { width: 1200, height: 700 });

  assert.equal(restored.x + saved.anchorX.offset, 600);
  assert.ok(Math.abs(restored.y - 222.2222222222222) < Number.EPSILON * 256);
});

test("an unsnapped panel scales inward around its own center", () => {
  const saved = createResponsiveCockpitPosition(
    { x: 1200, y: 700 },
    { width: 200, height: 100 },
    { width: 1600, height: 900 },
  );
  const restored = restoreResponsiveCockpitPosition(saved, { width: 200, height: 100 }, { width: 800, height: 450 });

  assert.deepEqual(restored, { x: 550, y: 325 });
});
