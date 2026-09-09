import test from "node:test";
import assert from "node:assert/strict";

import {
  COCKPIT_PANEL_FLANGE,
  COCKPIT_RECT_GRID,
  COCKPIT_SNAP_STRIDE,
  alignCockpitPanel,
  ceilToColumn,
  floorToColumn,
  createResponsiveCockpitPosition,
  getCockpitRingStep,
  getCockpitScope,
  restoreResponsiveCockpitPosition,
  snapCockpitPanel,
  snapCockpitPanelToBay,
} from "../src/systems/cockpitSnap.js";

test("panels outside the viewport snap their CONTENT box to the bay grid", () => {
  const result = snapCockpitPanel(
    { x: 51, y: 107 },
    { width: 120, height: 80 },
    { width: 1600, height: 900 },
  );

  // The border box sits a flange short of the column so that the content edge
  // — the thing the reader sees lined up — lands exactly on it.
  assert.deepEqual(result, { x: 56, y: 104, region: "bay" });
  assert.equal((result.x + COCKPIT_PANEL_FLANGE) % COCKPIT_SNAP_STRIDE, 0);
  assert.equal((result.y + COCKPIT_PANEL_FLANGE) % COCKPIT_SNAP_STRIDE, 0);
});

test("a panel with no flange still snaps its own edge", () => {
  const result = snapCockpitPanel(
    { x: 51, y: 107 },
    { width: 120, height: 80 },
    { width: 1600, height: 900 },
    { flange: 0 },
  );

  assert.deepEqual(result, { x: 48, y: 108, region: "bay" });
});

test("the scope publishes one ring step for both the snap and the stylesheet", () => {
  const wide = getCockpitScope({ width: 1440, height: 900 });
  assert.deepEqual(
    { centerX: wide.centerX, centerY: wide.centerY, radius: wide.radius },
    { centerX: 720, centerY: 450, radius: 450 },
  );
  assert.equal(wide.ringStep, getCockpitRingStep(450));

  // The floor matters: on a short desk the computed step would fall under it.
  assert.equal(getCockpitScope({ width: 1000, height: 640 }).ringStep, 48);
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

test("the bay snap puts a first-opened panel's content on a column", () => {
  const placed = snapCockpitPanelToBay({ x: 190, y: 94 });

  assert.equal((placed.x + COCKPIT_PANEL_FLANGE) % COCKPIT_SNAP_STRIDE, 0);
  assert.equal((placed.y + COCKPIT_PANEL_FLANGE) % COCKPIT_SNAP_STRIDE, 0);
  // No radial branch: a default position near the viewport centre must not be
  // dragged onto a ring, or the free-slot search it came from is undone.
  const nearCentre = snapCockpitPanelToBay({ x: 700, y: 440 });
  assert.deepEqual(nearCentre, { x: 704, y: 440 });
});

test("quantized clamp bounds never escape the limit they came from", () => {
  // A floor rounds up and a ceiling rounds down, so a clamped panel lands on a
  // column WITHOUT being pushed back outside the bound.
  assert.ok(ceilToColumn(44) >= 44);
  assert.ok(floorToColumn(1212) <= 1212);
  assert.equal((ceilToColumn(44) + COCKPIT_PANEL_FLANGE) % COCKPIT_SNAP_STRIDE, 0);
  assert.equal((floorToColumn(1212) + COCKPIT_PANEL_FLANGE) % COCKPIT_SNAP_STRIDE, 0);
  // A bound already on the grid is left exactly where it is.
  const onGrid = ceilToColumn(44);
  assert.equal(ceilToColumn(onGrid), onGrid);
  assert.equal(floorToColumn(onGrid), onGrid);
});

test("a panel can be parked on a midpoint as well as on a line", () => {
  // Half a column is a legal, reachable place to put an instrument — that is
  // the whole point of the stride being half the major grid.
  assert.equal(COCKPIT_SNAP_STRIDE * 2, COCKPIT_RECT_GRID);

  const onLine = snapCockpitPanelToBay({ x: 44, y: 44 });
  const onMidpoint = snapCockpitPanelToBay({ x: 56, y: 56 });

  assert.equal((onLine.x + COCKPIT_PANEL_FLANGE) % COCKPIT_RECT_GRID, 0);
  assert.equal((onMidpoint.x + COCKPIT_PANEL_FLANGE) % COCKPIT_RECT_GRID, COCKPIT_SNAP_STRIDE);
  assert.notEqual(onLine.x, onMidpoint.x);
});
