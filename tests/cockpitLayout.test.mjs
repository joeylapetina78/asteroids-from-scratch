import test from "node:test";
import assert from "node:assert/strict";

import {
  COCKPIT_MODULE_IDS,
  DEFAULT_COCKPIT_PHOSPHOR,
  createCockpitLayoutState,
  resetCockpitLayout,
} from "../src/systems/cockpitLayout.js";

test("a fresh layout starts bare", () => {
  const layout = createCockpitLayoutState();

  assert.deepEqual(layout.floatingPositions, {});
  assert.deepEqual(layout.openModules, []);
  assert.equal(layout.trayOpen, false);
  assert.equal(layout.phosphorColor, DEFAULT_COCKPIT_PHOSPHOR);
});

test("saved positions survive normalization, junk does not", () => {
  const layout = createCockpitLayoutState({
    floatingPositions: {
      hull: { x: 44.4, y: 116.6 },
      engine: { x: "nope", y: 12 },
      "not-a-module": { x: 10, y: 10 },
    },
  });

  assert.deepEqual(layout.floatingPositions.hull, { x: 44, y: 117 });
  assert.equal(layout.floatingPositions.engine, undefined);
  assert.equal(layout.floatingPositions["not-a-module"], undefined);
});

test("a responsive anchor is kept whole or dropped whole", () => {
  const layout = createCockpitLayoutState({
    floatingPositions: {
      hull: { x: 10, y: 20, anchorX: { fraction: 0.5, offset: 8 }, anchorY: { fraction: 0.25, offset: 4 } },
      // A half-written anchor is worse than none: it would restore one axis
      // proportionally and leave the other on stale pixels.
      engine: { x: 10, y: 20, anchorX: { fraction: 0.5, offset: 8 } },
    },
  });

  assert.deepEqual(layout.floatingPositions.hull.anchorX, { fraction: 0.5, offset: 8 });
  assert.equal(layout.floatingPositions.engine.anchorX, undefined);
});

test("the chambers are never listed as open modules", () => {
  const layout = createCockpitLayoutState({
    openModules: ["hull", "processor", "cargo", "hull", "bogus"],
  });

  assert.deepEqual(layout.openModules, ["hull"]);
});

test("an invalid phosphor colour falls back rather than sticking", () => {
  assert.equal(createCockpitLayoutState({ phosphorColor: "rgb(1,2,3)" }).phosphorColor, DEFAULT_COCKPIT_PHOSPHOR);
  assert.equal(createCockpitLayoutState({ phosphorColor: "#7DFFE0" }).phosphorColor, "#7dffe0");
});

test("a reset clears the arrangement but keeps the player's colour", () => {
  const layout = createCockpitLayoutState({
    floatingPositions: { hull: { x: 44, y: 116 } },
    openModules: ["hull"],
    trayOpen: true,
    phosphorColor: "#ff8800",
  });

  resetCockpitLayout(layout);

  assert.deepEqual(layout.floatingPositions, {});
  assert.deepEqual(layout.openModules, []);
  assert.equal(layout.trayOpen, false);
  assert.equal(layout.processorClawTarget, "cargo");
  assert.equal(layout.phosphorColor, "#ff8800");
});

test("every module id is unique", () => {
  assert.equal(new Set(COCKPIT_MODULE_IDS).size, COCKPIT_MODULE_IDS.length);
});
