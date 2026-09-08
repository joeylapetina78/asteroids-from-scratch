import test from "node:test";
import assert from "node:assert/strict";

import { snapCockpitPanel } from "../src/systems/cockpitSnap.js";

test("panels outside the viewport snap to the rectangular bay grid", () => {
  const result = snapCockpitPanel(
    { x: 51, y: 107 },
    { width: 120, height: 80 },
    { width: 1600, height: 900 },
  );

  assert.deepEqual(result, { x: 48, y: 96, region: "bay" });
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
