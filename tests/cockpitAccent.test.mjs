import test from "node:test";
import assert from "node:assert/strict";

import {
  HOUSE_ACCENT,
  MAX_ACCENT_LIGHTNESS,
  MIN_ACCENT_LIGHTNESS,
  MIN_ACCENT_SATURATION,
  deriveAccentColor,
  parseHexColor,
  resolveAccentColor,
  rgbToHsl,
} from "../src/systems/cockpitAccent.js";

const DEFAULT_PHOSPHOR = "#7dffe0";

// The whole reason this is a rule rather than a constant: the pairing the
// cockpit already uses has to come out of it unchanged.
test("the default phosphor still gets the amber the cockpit has always used", () => {
  const accent = deriveAccentColor(DEFAULT_PHOSPHOR);
  const [, , lightness] = rgbToHsl(parseHexColor(accent));
  const [houseHue, houseSaturation, houseLightness] = rgbToHsl(parseHexColor(HOUSE_ACCENT));
  const [hue, saturation] = rgbToHsl(parseHexColor(accent));

  assert.ok(Math.abs(hue - houseHue) < 2, `hue drifted: ${hue} vs ${houseHue}`);
  assert.ok(Math.abs(saturation - houseSaturation) < 0.05);
  assert.ok(Math.abs(lightness - houseLightness) < 0.03);
});

const PHOSPHORS = ["#7dffe0", "#ee00ff", "#ffb000", "#33ff66", "#6cc4ff", "#ff4d4d", "#8a5cff", "#00e5ff"];

test("every phosphor gets an accent that is clearly a different colour", () => {
  PHOSPHORS.forEach((phosphor) => {
    const [phosphorHue] = rgbToHsl(parseHexColor(phosphor));
    const [accentHue] = rgbToHsl(parseHexColor(deriveAccentColor(phosphor)));
    const separation = Math.min(
      Math.abs(accentHue - phosphorHue),
      360 - Math.abs(accentHue - phosphorHue),
    );
    assert.ok(separation > 100, `${phosphor} and its accent are only ${separation.toFixed(0)}deg apart`);
  });
});

// An accent has to be legible on a near-black cockpit at any phosphor.
test("every accent stays inside the readable band", () => {
  PHOSPHORS.forEach((phosphor) => {
    const [, saturation, lightness] = rgbToHsl(parseHexColor(deriveAccentColor(phosphor)));
    assert.ok(saturation >= MIN_ACCENT_SATURATION - 0.01, `${phosphor} accent washed out: ${saturation}`);
    assert.ok(lightness >= MIN_ACCENT_LIGHTNESS - 0.01, `${phosphor} accent too dark: ${lightness}`);
    assert.ok(lightness <= MAX_ACCENT_LIGHTNESS + 0.01, `${phosphor} accent too pale: ${lightness}`);
  });
});

// A grey phosphor has no hue to rotate, so rotating it produces a colour with
// no relationship to what the player chose. #e8f4f2 is the case that proves
// chroma is the right measure: HSL calls it 35% saturated, the eye calls it
// white, and rotating it produced a washed tan nobody would pick.
test("a colourless phosphor falls back to the house amber", () => {
  ["#ffffff", "#e8f4f2", "#c9cdcc", "#808080", "#dfe6e4"].forEach((phosphor) => {
    assert.equal(deriveAccentColor(phosphor), HOUSE_ACCENT, `${phosphor} should not derive`);
  });
});

// And the boundary holds from the other side: a phosphor that IS a colour
// keeps its own derived accent rather than defaulting to the house one.
// The default phosphor is deliberately absent from this list — landing on the
// house amber is exactly what it is supposed to do, and the first test in
// this file is the one that pins it there.
test("a genuinely coloured phosphor never falls back", () => {
  ["#ee00ff", "#33ff66", "#8a5cff", "#ff4d4d", "#6cc4ff"].forEach((phosphor) => {
    assert.notEqual(deriveAccentColor(phosphor), HOUSE_ACCENT, `${phosphor} should derive`);
  });
});

test("nonsense is the house amber rather than a crash", () => {
  ["", null, undefined, "red", "#abc", "#gggggg"].forEach((value) => {
    assert.equal(deriveAccentColor(value), HOUSE_ACCENT);
  });
});

test("every derived accent is a six-digit hex the stylesheet can use", () => {
  PHOSPHORS.forEach((phosphor) => {
    assert.match(deriveAccentColor(phosphor), /^#[0-9a-f]{6}$/);
  });
});

// The override exists because the maths cannot see meaning: a green cockpit
// derives a red accent, and red already means a fault everywhere else.
test("a chosen accent wins over the derived one", () => {
  assert.equal(resolveAccentColor(DEFAULT_PHOSPHOR, "#33AAFF"), "#33aaff");
  assert.equal(resolveAccentColor("#33ff66", "#ffc45c"), "#ffc45c");
});

test("no choice, or a bad one, falls through to the derived accent", () => {
  [null, undefined, "", "nope", "#12345"].forEach((value) => {
    assert.equal(resolveAccentColor(DEFAULT_PHOSPHOR, value), deriveAccentColor(DEFAULT_PHOSPHOR));
  });
});
