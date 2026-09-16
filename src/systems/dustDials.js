// The sparkle dials: every figure that shapes the dust a crushed unit throws
// and the way the pipe draws it back. One table, read by the chamber that
// draws the dust and by the cockpit panel that lets the pilot turn the dials,
// so the two cannot disagree about what a dial is or where it stops.
//
// Kept apart from processor.js so the cockpit's stored layout can normalise a
// saved set of dials without pulling the whole chamber in behind it.

export const DUST_DIALS = Object.freeze([
  {
    key: "grains", label: "Grains", hint: "How many motes a crush throws.",
    min: 4, max: 40, step: 1, value: 18,
  },
  {
    key: "burstSpeed", label: "Burst", hint: "How hard the motes are thrown before the pipe takes over.",
    min: 40, max: 400, step: 10, value: 170,
  },
  {
    key: "freeFlight", label: "Free flight", hint: "Seconds the burst gets to be a burst.",
    min: 0, max: 0.5, step: 0.01, value: 0.12,
  },
  {
    key: "ramp", label: "Ramp", hint: "Seconds the pull takes to come on. Short reverses the cloud; long lets it turn.",
    min: 0.02, max: 0.6, step: 0.01, value: 0.16,
  },
  {
    key: "suctionSpeed", label: "Suction", hint: "How fast the dust streams once the pipe has it.",
    min: 300, max: 4000, step: 50, value: 1500,
  },
  {
    key: "steer", label: "Steer", hint: "How sharply a mote bends toward the pipe.",
    min: 2, max: 40, step: 1, value: 14,
  },
  {
    key: "swirl", label: "Swirl", hint: "Across-the-line share of the pull. Zero streams straight in.",
    min: 0, max: 2, step: 0.05, value: 0.85,
  },
  {
    key: "swirlRadius", label: "Swirl reach", hint: "Distance from the lip over which the swirl tightens to nothing.",
    min: 20, max: 400, step: 10, value: 140,
  },
  {
    key: "coreAlpha", label: "Core", hint: "Brightness of the mote itself.",
    min: 0, max: 1, step: 0.02, value: 0.42,
  },
  {
    key: "haloAlpha", label: "Halo", hint: "Brightness of the phosphor bloom around it.",
    min: 0, max: 0.6, step: 0.01, value: 0.16,
  },
  {
    key: "haloScale", label: "Halo size", hint: "Bloom radius as a multiple of the mote.",
    min: 1, max: 8, step: 0.1, value: 3.2,
  },
]);

export const DUST_DEFAULTS = Object.freeze(
  Object.fromEntries(DUST_DIALS.map((dial) => [dial.key, dial.value])),
);

// A saved set of dials, clamped to each dial's range; anything missing or
// unreadable falls back to the default for that dial alone.
export function normalizeDustSettings(source = null) {
  return Object.fromEntries(DUST_DIALS.map((dial) => {
    const value = Number(source?.[dial.key]);
    return [dial.key, Number.isFinite(value) ? Math.min(dial.max, Math.max(dial.min, value)) : dial.value];
  }));
}
