import assert from "node:assert/strict";
import test from "node:test";
import {
  PANEL_ANCHORS, chooseAnchor, clampToViewport, fromAnchoredPosition,
  getAnchorPoint, hasAnchoredPosition, isPanelAnchor, toAnchoredPosition,
} from "../src/systems/panelAnchoring.js";

const WIDE = { width: 2560, height: 1440 };
const LAPTOP = { width: 1280, height: 800 };

test("a panel is anchored to the reference point it was arranged against", () => {
  assert.equal(chooseAnchor({ left: 20, top: 20 }, WIDE), "top-left");
  assert.equal(chooseAnchor({ left: 2500, top: 1400 }, WIDE), "bottom-right");
  assert.equal(chooseAnchor({ left: 1280, top: 720 }, WIDE), "center");
  assert.equal(chooseAnchor({ left: 2540, top: 700 }, WIDE), "middle-right");
  assert.equal(chooseAnchor({ left: 1270, top: 10 }, WIDE), "top-center");
});

test("anchor choice is about proportion, not pixels", () => {
  // On an ultrawide desk every anchor is horizontally "close" in raw pixels, so
  // an unnormalised comparison collapses onto whichever is vertically nearest.
  // A point 60% across and just below the top belongs to top-center.
  const ultrawide = { width: 3440, height: 1000 };
  assert.equal(chooseAnchor({ left: 1750, top: 40 }, ultrawide), "top-center");
});

test("a corner panel stays welded to its corner on any desk", () => {
  // The case that motivated this: an absolute offset would leave a bottom-right
  // panel floating in open space on a smaller screen.
  const placed = { left: WIDE.width - 320, top: WIDE.height - 240 };
  const anchored = toAnchoredPosition(placed, WIDE);
  assert.equal(anchored.anchor, "bottom-right");

  const restored = fromAnchoredPosition(anchored, LAPTOP);
  assert.equal(Math.round(LAPTOP.width - restored.left), Math.round(320 * (LAPTOP.width / WIDE.width)));
  assert.equal(Math.round(LAPTOP.height - restored.top), Math.round(240 * (LAPTOP.height / WIDE.height)));
  // Still in the bottom-right region, not adrift in the middle.
  assert.ok(restored.left > LAPTOP.width * 0.5);
  assert.ok(restored.top > LAPTOP.height * 0.5);
});

test("a round trip on the same desk is exact", () => {
  PANEL_ANCHORS.forEach((anchor) => {
    const point = getAnchorPoint(anchor, WIDE);
    const placed = { left: point.x + 37, top: point.y + 19 };
    const restored = fromAnchoredPosition(toAnchoredPosition(placed, WIDE, { anchor }), WIDE);
    assert.ok(Math.abs(restored.left - placed.left) < 1e-9, `${anchor} left`);
    assert.ok(Math.abs(restored.top - placed.top) < 1e-9, `${anchor} top`);
  });
});

test("a centred panel stays centred as the desk grows", () => {
  const centred = { left: WIDE.width / 2, top: WIDE.height / 2 };
  const anchored = toAnchoredPosition(centred, WIDE);
  assert.equal(anchored.anchor, "center");
  assert.equal(anchored.fx, 0);
  const restored = fromAnchoredPosition(anchored, LAPTOP);
  assert.equal(restored.left, LAPTOP.width / 2);
  assert.equal(restored.top, LAPTOP.height / 2);
});

test("clamping keeps a panel on the desk without rewriting where it belongs", () => {
  const anchored = toAnchoredPosition({ left: 2400, top: 1300 }, WIDE);
  const restored = fromAnchoredPosition(anchored, LAPTOP);
  const size = { width: 420, height: 300 };
  const clamped = clampToViewport(restored, size, LAPTOP);

  assert.ok(clamped.left + size.width <= LAPTOP.width - 12 + 1e-9);
  assert.ok(clamped.top + size.height <= LAPTOP.height - 12 + 1e-9);
  assert.ok(clamped.left >= 12 && clamped.top >= 12);

  // The stored record is untouched, so widening the window again restores the
  // intended position rather than the squeezed one.
  const back = fromAnchoredPosition(anchored, WIDE);
  assert.equal(Math.round(back.left), 2400);
  assert.equal(Math.round(back.top), 1300);
});

test("a panel bigger than the desk is pinned to the padding rather than pushed off", () => {
  const clamped = clampToViewport({ left: 500, top: 500 }, { width: 5000, height: 5000 }, LAPTOP);
  assert.equal(clamped.left, 12);
  assert.equal(clamped.top, 12);
});

test("malformed and legacy records degrade instead of throwing", () => {
  assert.equal(hasAnchoredPosition(null), false);
  assert.equal(hasAnchoredPosition({ x: 10, y: 10 }), false, "a legacy pixel record is not anchored");
  assert.equal(hasAnchoredPosition({ anchor: "nowhere", fx: 0, fy: 0 }), false);
  assert.equal(hasAnchoredPosition({ anchor: "center", fx: 0.1, fy: 0.2 }), true);
  assert.equal(isPanelAnchor("center"), true);
  assert.equal(isPanelAnchor("elsewhere"), false);

  const restored = fromAnchoredPosition({ anchor: "bogus", fx: NaN, fy: undefined }, LAPTOP);
  assert.deepEqual(restored, { left: 0, top: 0 });
});

test("a zero-sized desk does not divide by zero", () => {
  const anchored = toAnchoredPosition({ left: 100, top: 50 }, { width: 0, height: 0 });
  assert.ok(Number.isFinite(anchored.fx) && Number.isFinite(anchored.fy));
  const restored = fromAnchoredPosition(anchored, { width: 0, height: 0 });
  assert.ok(Number.isFinite(restored.left) && Number.isFinite(restored.top));
});
