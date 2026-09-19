// The guidance layer's dials: how the power phrase beside the attention
// arrow is drawn. Which face, how big, how heavy, how much phosphor glow,
// how see-through. One table, read by the cockpit panel that shows the
// dials and by the layout store that keeps them, like the sparkle dials.

export const GUIDANCE_FONTS = Object.freeze([
  { id: "michroma", label: "Michroma", hint: "Eurostile Extended: the 80s hardware badge.", stack: '"Michroma", "Eurostile Extended", "Microgramma D Extended", sans-serif' },
  { id: "orbitron", label: "Orbitron", hint: "Geometric, squared, more future than past.", stack: '"Orbitron", "Michroma", sans-serif' },
  { id: "audiowide", label: "Audiowide", hint: "Rounded, wide, the light-cycle poster.", stack: '"Audiowide", "Orbitron", sans-serif' },
  { id: "vt323", label: "VT323", hint: "The chatter's terminal face, tall and thin.", stack: '"VT323", "Courier New", monospace' },
  { id: "press-start", label: "Press Start 2P", hint: "Eight bits. Arcade cabinet, not cockpit.", stack: '"Press Start 2P", "VT323", monospace' },
  { id: "courier", label: "Courier New", hint: "The cockpit's own mono, plain.", stack: '"Courier New", "Lucida Console", monospace' },
]);

export const GUIDANCE_DIALS = Object.freeze([
  { key: "size", label: "Size", hint: "Type size, in rem.", min: 0.6, max: 2.4, step: 0.05, value: 1.1 },
  { key: "weight", label: "Weight", hint: "Stroke around the letters, in px. Heft for a light face.", min: 0, max: 3, step: 0.1, value: 0.9 },
  { key: "glow", label: "Glow", hint: "How far the phosphor bleeds around the letters.", min: 0, max: 2, step: 0.05, value: 1 },
  { key: "alpha", label: "Opacity", hint: "How solid the letters are. Lower is more phosphor.", min: 0.3, max: 1, step: 0.02, value: 0.84 },
  { key: "spacing", label: "Tracking", hint: "Space between letters, in em.", min: -0.05, max: 0.3, step: 0.01, value: 0.04 },
]);

export const GUIDANCE_DEFAULTS = Object.freeze({
  font: "michroma",
  ...Object.fromEntries(GUIDANCE_DIALS.map((dial) => [dial.key, dial.value])),
});

export function normalizeGuidanceSettings(source = null) {
  const font = GUIDANCE_FONTS.some((face) => face.id === source?.font) ? source.font : GUIDANCE_DEFAULTS.font;
  return {
    font,
    ...Object.fromEntries(GUIDANCE_DIALS.map((dial) => {
      const value = Number(source?.[dial.key]);
      return [dial.key, Number.isFinite(value) ? Math.min(dial.max, Math.max(dial.min, value)) : dial.value];
    })),
  };
}

export function getGuidanceFontStack(fontId) {
  return (GUIDANCE_FONTS.find((face) => face.id === fontId) ?? GUIDANCE_FONTS[0]).stack;
}
