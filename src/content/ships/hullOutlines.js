// What a hull is, as lines.
//
// One source of geometry for two readers. The entity renderers draw the whole
// shape at once; the slipway draws the same strokes in order, one at a time, so
// the thing taking shape on the ways is literally the thing that flies off when
// it is done. Before this the yard drew a generic side-on boat that resembled
// nothing in the world.
//
// `fill` is the closed body polygon — entities fill it and stroke it as they
// always have, so nothing about a flying craft changes. `strokes` is the build
// order: keel and body edges first, then the fittings that make it a particular
// kind of ship. Each stroke is a polyline.

export const HULL_OUTLINES = Object.freeze({
  // The ore worker: a stubby six-point body with a cab set into it.
  // Matches MiningWorkerShip.draw exactly.
  "mining-craft": Object.freeze({
    label: "Ore Worker",
    fill: [[22, 0], [1, -12], [-15, -8], [-10, 0], [-15, 8], [1, 12]],
    strokes: [
      [[-15, 8], [-10, 0]],        // keel, aft
      [[-10, 0], [-15, -8]],       // keel, forward
      [[-15, -8], [1, -12]],       // port side
      [[1, -12], [22, 0]],         // port bow
      [[22, 0], [1, 12]],          // starboard bow
      [[1, 12], [-15, 8]],         // starboard side
      [[-3, -5], [6, -5], [6, 5], [-3, 5], [-3, -5]],   // the cab
    ],
  }),

  // The freighter: the same triangle every hauler in the world flies, then the
  // cargo boxes it tows.
  "freight-craft": Object.freeze({
    label: "Freighter",
    fill: [[22, 0], [-8, -13], [-8, 13]],
    strokes: [
      [[-8, 13], [-8, -13]],       // transom
      [[-8, -13], [22, 0]],        // port side
      [[22, 0], [-8, 13]],         // starboard side
      [[-16, -6], [-26, -6], [-26, 6], [-16, 6], [-16, -6]],   // first container
      [[-30, -6], [-40, -6], [-40, 6], [-30, 6], [-30, -6]],   // second container
    ],
  }),

  // The long-haul freighter: the same hull, plus the drive ring in the nose
  // that marks it in flight.
  "freight-craft-subspace": Object.freeze({
    label: "Long-Haul Freighter",
    fill: [[22, 0], [-8, -13], [-8, 13]],
    strokes: [
      [[-8, 13], [-8, -13]],
      [[-8, -13], [22, 0]],
      [[22, 0], [-8, 13]],
      [[-16, -6], [-26, -6], [-26, 6], [-16, 6], [-16, -6]],
      [[-30, -6], [-40, -6], [-40, 6], [-30, 6], [-30, -6]],
      "drive-ring",                // drawn as a circle, not a polyline
    ],
  }),
});

export function getHullOutline(hullClass) {
  return HULL_OUTLINES[hullClass] ?? HULL_OUTLINES["freight-craft"];
}

// How many strokes a hull takes to build. The slipway paces itself by this so
// every class takes the same wall-clock time regardless of how many lines it
// happens to need.
export function countHullStrokes(hullClass) {
  return getHullOutline(hullClass).strokes.length;
}
