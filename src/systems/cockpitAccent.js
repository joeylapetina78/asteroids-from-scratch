// The cockpit's second colour.
//
// The player picks one colour, the phosphor, and everything on the desk is
// drawn in it. But a monochrome cockpit has nowhere to put a second kind of
// information, so a handful of things — the model codes stencilled on a rack
// unit, the rail that says a unit is out of its slot — have always been amber.
// A fixed amber that happens to look right against the default phosphor and
// was never checked against any other.
//
// It does not need to be fixed. The default pairing IS a rule: teal #7dffe0
// and amber #ffd36b are the same saturation, 123.5 degrees apart in hue, with
// the accent five percent darker. Apply that rule to whatever the player
// chose and the accent follows them, landing back on exactly today's amber
// when they are on the default phosphor.

// The house amber. Still the answer when there is no hue to rotate.
export const HOUSE_ACCENT = "#ffd36b";

export const ACCENT_HUE_SHIFT = 123.5;
export const ACCENT_LIGHTNESS_SCALE = 0.953;

// Below this chroma the phosphor is effectively grey: its hue is whatever
// rounding left behind, so rotating it produces a colour with no relationship
// to what the player picked. A white cockpit gets the house amber instead.
//
// Chroma rather than HSL saturation, because saturation is normalised by
// lightness and badly overstates how colourful a pale tint is: #e8f4f2 reads
// as 35% saturated and is, to the eye, white. Its chroma is 0.05, which is
// the number that matches what you actually see.
export const MIN_HUE_CHROMA = 0.18;

// An accent has to stay a colour, and stay readable on near-black.
export const MIN_ACCENT_SATURATION = 0.65;
export const MIN_ACCENT_LIGHTNESS = 0.55;
export const MAX_ACCENT_LIGHTNESS = 0.74;

export function parseHexColor(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color ?? "").trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// How colourful this is, independent of how light it is: the plain distance
// between the strongest and weakest channel.
export function getChroma([red, green, blue]) {
  return (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
}

export function rgbToHsl([red, green, blue]) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) return [0, 0, lightness];

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue = (max === r
    ? (g - b) / delta + (g < b ? 6 : 0)
    : max === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4) * 60;

  return [hue, saturation, lightness];
}

export function hslToHex(hue, saturation, lightness) {
  const channel = (offset) => {
    const k = (offset + hue / 30) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// The accent that belongs with this phosphor.
export function deriveAccentColor(phosphor) {
  const channels = parseHexColor(phosphor);
  if (!channels) return HOUSE_ACCENT;

  if (getChroma(channels) < MIN_HUE_CHROMA) return HOUSE_ACCENT;

  const [hue, saturation, lightness] = rgbToHsl(channels);

  return hslToHex(
    (hue - ACCENT_HUE_SHIFT + 360) % 360,
    Math.max(MIN_ACCENT_SATURATION, saturation),
    Math.min(MAX_ACCENT_LIGHTNESS, Math.max(MIN_ACCENT_LIGHTNESS, lightness * ACCENT_LIGHTNESS_SCALE)),
  );
}

// What the cockpit should actually paint with: the player's own choice when
// they have made one, otherwise the derived colour.
export function resolveAccentColor(phosphor, customAccent = null) {
  return parseHexColor(customAccent) ? String(customAccent).toLowerCase() : deriveAccentColor(phosphor);
}
