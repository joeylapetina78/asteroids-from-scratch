// Where things get built around a hub.
//
// Facilities were placed by hand-picked offsets, and it went how hand-picked
// offsets go: the Yard Plate Works landed on the berth approach — in the road,
// on the pad craft use to come and go. Every new kind of building would have
// needed another number chosen by eye, and a hub that commissions a factory at
// runtime had nobody to choose one for it.
//
// So placement is a rule instead. Three things it has to honour:
//
//   1. Nothing stands in the road. Craft approach and berth through a reserved
//      corridor and no structure may occupy it.
//   2. Nothing stands on anything else. Slots are spaced by angle so two
//      facilities cannot overlap however many a hub builds.
//   3. Things that work together stand together. A parts factory feeds the
//      slipway, so it is placed beside it rather than wherever there was room.

// How far out from the hub centre facilities sit. Outside the body, inside the
// approach ring, so everything reads as belonging to the station.
export const FACILITY_RING = 215;

// The berth approach, in degrees, measured the way canvas measures: 0 is due
// right, positive is clockwise. Craft come and go across this arc, so it stays
// empty.
export const RESERVED_APPROACH = Object.freeze({ fromDegrees: -75, toDegrees: 75 });

// The least angle between two facilities. At FACILITY_RING this keeps roughly a
// hull's width between them.
export const MINIMUM_SEPARATION_DEGREES = 26;

// Where each kind of work sits, by heading. The slipway anchors the industrial
// side of the station at due left, and everything that feeds it fans out around
// it — closest first, because the thing that supplies the ways should be the
// thing standing next to them.
const ANCHORS = Object.freeze({
  shipyard: 180,
  "parts-factory": 180,     // fans out either side of the slipway
  "repair-facility": 90,    // below, clear of the approach and of the works
});

const FAN = Object.freeze([0, -MINIMUM_SEPARATION_DEGREES, MINIMUM_SEPARATION_DEGREES,
  -MINIMUM_SEPARATION_DEGREES * 2, MINIMUM_SEPARATION_DEGREES * 2,
  -MINIMUM_SEPARATION_DEGREES * 3, MINIMUM_SEPARATION_DEGREES * 3]);

export function isInReservedApproach(degrees) {
  const wrapped = normalize(degrees);
  const from = normalize(RESERVED_APPROACH.fromDegrees);
  const to = normalize(RESERVED_APPROACH.toDegrees);
  return from > to ? wrapped >= from || wrapped <= to : wrapped >= from && wrapped <= to;
}

function normalize(degrees) {
  return ((degrees % 360) + 360) % 360;
}

// The heading for one facility of a kind, given how many of that kind come
// before it. Deterministic: the same facility lands in the same place every
// run, so the station a player learns stays the station they know.
export function facilityHeadingDegrees(kind, ordinal = 0) {
  const anchor = ANCHORS[kind] ?? 180;
  // The slipway keeps the anchor itself; factories start beside it.
  const offsets = kind === "shipyard" ? [0] : FAN.slice(1);
  const chosen = offsets[ordinal % offsets.length]
    + Math.floor(ordinal / offsets.length) * MINIMUM_SEPARATION_DEGREES * offsets.length;
  const heading = anchor + chosen;
  return isInReservedApproach(heading) ? mirrorOutOfApproach(heading) : normalize(heading);
}

// A heading that would land in the road is reflected back across the anchor.
function mirrorOutOfApproach(degrees) {
  const mirrored = normalize(360 - normalize(degrees));
  return isInReservedApproach(mirrored) ? 180 : mirrored;
}

// Screen offset from the hub centre for a facility.
export function facilityOffset(kind, ordinal = 0, radius = FACILITY_RING) {
  const radians = (facilityHeadingDegrees(kind, ordinal) * Math.PI) / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}
