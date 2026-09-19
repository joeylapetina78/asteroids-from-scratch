import test from "node:test";
import assert from "node:assert/strict";

import { DUST_DIALS, DUST_DEFAULTS, normalizeDustSettings } from "../src/systems/dustDials.js";
import { createCockpitLayoutState } from "../src/systems/cockpitLayout.js";
import { GUIDANCE_DEFAULTS, GUIDANCE_FONTS, normalizeGuidanceSettings } from "../src/systems/guidanceDials.js";

test("every sparkle dial has a default inside its own range", () => {
  DUST_DIALS.forEach((dial) => {
    assert.ok(dial.min < dial.max, dial.key);
    assert.ok(dial.value >= dial.min && dial.value <= dial.max, dial.key);
    assert.equal(DUST_DEFAULTS[dial.key], dial.value);
  });
  assert.equal(new Set(DUST_DIALS.map((dial) => dial.key)).size, DUST_DIALS.length);
});

test("a saved set of dials is clamped per dial and missing dials fall back alone", () => {
  const settings = normalizeDustSettings({ grains: 999, swirl: -3, coreAlpha: "0.5", haloScale: "nope" });
  assert.equal(settings.grains, 40);
  assert.equal(settings.swirl, 0);
  assert.equal(settings.coreAlpha, 0.5);
  assert.equal(settings.haloScale, DUST_DEFAULTS.haloScale);
  assert.equal(settings.suctionSpeed, DUST_DEFAULTS.suctionSpeed);
});

test("the cockpit's stored layout carries the sparkle dials and normalises them", () => {
  assert.deepEqual(createCockpitLayoutState(null).dust, DUST_DEFAULTS);
  const restored = createCockpitLayoutState({ dust: { grains: 30, ramp: 5 } });
  assert.equal(restored.dust.grains, 30);
  assert.equal(restored.dust.ramp, 0.6);
});

test("the guidance dials normalise a saved set and reject an unknown face", () => {
  assert.deepEqual(normalizeGuidanceSettings(null), GUIDANCE_DEFAULTS);
  const saved = normalizeGuidanceSettings({ font: "comic-sans", size: 9, glow: -1 });
  assert.equal(saved.font, GUIDANCE_DEFAULTS.font);
  assert.equal(saved.size, 2.4);
  assert.equal(saved.glow, 0);
  assert.ok(GUIDANCE_FONTS.every((face) => face.stack.includes(face.label) || face.id === "courier"));
  assert.deepEqual(createCockpitLayoutState({ guidance: { font: "vt323" } }).guidance.font, "vt323");
});
