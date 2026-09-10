// One number sets the size of the whole cockpit.
//
// A player who needs bigger text does not want bigger text in the same boxes —
// the boxes are 224px wide and the text would simply run out of them, taking
// the alignment work with it. What they want is a bigger cockpit. So this
// takes a single scale and derives EVERYTHING from it: the grid, the bay
// footprints, the control ladder, the meter pitches and the type steps. Scale
// up and every relationship survives, because they are all the same arithmetic.
//
// Everything comes back as whole pixels. That is the point of computing it here
// rather than writing `calc()` in the stylesheet: CSS cannot round, and a
// fractional pixel is exactly what put 20 of this project's 21 type sizes off
// the lattice in the first place.
//
// See docs/panel-mounting-standard.md for what these mean; this file only
// decides how big they are.

// The 100% cockpit. These are the values the stylesheet also carries as its
// own literals, so a page that never runs the scaler still looks right.
export const BASE_MAJOR_GRID = 24;
export const BASE_FLANGE = 4;
export const BASE_TYPE_STEPS = Object.freeze({ xs: 8, s: 10, m: 12, l: 16, xl: 24 });

// A bay is nine columns of content, a half-bay four.
export const CONTENT_COLUMNS_FULL = 9;
export const CONTENT_COLUMNS_HALF = 4;

// Below this, type stops being type. The bottom of the scale clamps here
// rather than shrinking proportionally.
export const MIN_TYPE_SIZE = 8;

// Below 100% the type floor starts biting before the grid does: the grid keeps
// shrinking and the text stops, so text grows RELATIVE to its box and the
// small steps jam together. That is the trade a smaller cockpit makes, and
// 0.75 is as far as it stays readable.
export const MIN_SCALE = 0.75;
export const MAX_SCALE = 2;

export function clampScale(scale) {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function getCockpitScale(requestedScale = 1) {
  const scale = clampScale(requestedScale);

  // The major grid is rounded to an EVEN number first, and everything else is
  // derived from it. The minor grid has to be exactly half the major one —
  // that is what lets a panel sit on a midpoint without throwing its own
  // interior off the lattice — and half of an odd number is not a pixel.
  const major = Math.max(2, Math.round(BASE_MAJOR_GRID * scale / 2) * 2);
  const minor = major / 2;
  const unit = Math.max(1, Math.round(minor / 3));
  const flange = Math.max(1, Math.round(BASE_FLANGE * scale));

  const contentFull = major * CONTENT_COLUMNS_FULL;
  const contentHalf = major * CONTENT_COLUMNS_HALF;

  return {
    scale,
    unit,
    minor,
    major,
    flange,
    contentFull,
    contentHalf,
    widthFull: contentFull + flange * 2,
    widthHalf: contentHalf + flange * 2,
    // The control ladder, in minor rows: 2 flat, 3 ordinary, 5 panic target.
    controlFlat: minor * 2,
    control: minor * 3,
    controlLarge: minor * 5,
    // Meter grains stay valid at any scale: content is 18 minor rows across,
    // so pitches of one, two and three rows tile it exactly 18, 9 and 6 times.
    meterPitchFine: minor,
    meterPitchCoarse: minor * 2,
    meterPitchBlunt: minor * 3,
    meterHeight: minor * 2,
    // Line boxes are grid rows, never ratios. That is what keeps a paragraph
    // of readouts sitting on the same lattice as the controls beside it.
    lineTight: minor,
    lineLoose: major,
    type: getTypeSteps(scale),
  };
}

// The type steps, rounded and then forced apart.
//
// This is where a pure ratio has to give. At 100% the smallest steps are two
// pixels apart, and rounding a ratio-derived scale collapses them onto each
// other — 8 and 9.6 both want to be 8 or 10. So after rounding, each step is
// pushed to at least one pixel above the one below it.
//
// The bottom of the scale is therefore slightly compressed rather than
// ratio-correct, and it stops being compressed as the player scales up: at
// 175% the same steps are 14 and 18 and the ratio comes back on its own. Which
// is the right way round, because scaling up is what someone who cannot read
// the small text is doing.
export function getTypeSteps(requestedScale = 1) {
  const scale = clampScale(requestedScale);
  const steps = {};
  let previous = 0;

  Object.entries(BASE_TYPE_STEPS).forEach(([name, base]) => {
    const rounded = Math.max(MIN_TYPE_SIZE, Math.round(base * scale));
    const size = Math.max(rounded, previous + 1);
    steps[name] = size;
    previous = size;
  });

  return steps;
}

// The custom properties the stylesheet reads. Named here so the CSS and the
// scaler cannot drift: if a token is renamed, it is renamed once.
export function getCockpitScaleProperties(requestedScale = 1) {
  const sizes = getCockpitScale(requestedScale);

  return {
    "--u": `${sizes.unit}px`,
    "--minor": `${sizes.minor}px`,
    "--grid-major": `${sizes.major}px`,
    "--panel-flange": `${sizes.flange}px`,
    "--panel-content-full": `${sizes.contentFull}px`,
    "--panel-content-half": `${sizes.contentHalf}px`,
    "--panel-width-full": `${sizes.widthFull}px`,
    "--panel-width-half": `${sizes.widthHalf}px`,
    "--control-h": `${sizes.control}px`,
    "--control-h-flat": `${sizes.controlFlat}px`,
    "--control-h-lg": `${sizes.controlLarge}px`,
    "--control-h-primary": `${sizes.control}px`,
    "--meter-h": `${sizes.meterHeight}px`,
    "--line-tight": `${sizes.lineTight}px`,
    "--line-loose": `${sizes.lineLoose}px`,
    "--type-xs": `${sizes.type.xs}px`,
    "--type-s": `${sizes.type.s}px`,
    "--type-m": `${sizes.type.m}px`,
    "--type-l": `${sizes.type.l}px`,
    "--type-xl": `${sizes.type.xl}px`,
  };
}
