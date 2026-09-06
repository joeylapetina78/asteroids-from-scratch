import test from "node:test";
import assert from "node:assert/strict";

import { getDevStart } from "../src/systems/saveManager.js";

test("a normal launch starts in explorer mode", () => {
  assert.equal(getDevStart(""), "explorer");
});

test("an explicit start mode still overrides the explorer default", () => {
  assert.equal(getDevStart("?devStart=panorama"), "panorama");
  assert.equal(getDevStart("?devStart=red-work"), "red-work");
});
