// What a rack unit shows in its own little window.
//
// Every unit used to report itself as one line of small text, which meant a
// miner with 1996 charges and a tow cable sitting idle looked like the same
// kind of fact. They are not. A charge count is a NUMBER and wants to be read
// at a glance; a bay of five beacons is a set of SLOTS and wants to be
// counted without reading at all; fuel is a LEVEL.
//
// So a readout is a shape plus its data, and the renderer picks the shape.
// Nothing here touches the DOM or knows what the game is doing: callers hand
// it the numbers, it returns a description, and `renderModuleReadout` in the
// cockpit turns that into elements.

// A big number with a quiet unit beside it: "1996 CHARGES".
export function countReadout(value, label) {
  return { kind: "count", value: formatCount(value), label: String(label ?? "").toUpperCase() };
}

// One cell per slot, filled ones first. For things you own a countable number
// of and can see are missing.
export function slotsReadout(filled, total, label = null) {
  const capacity = Math.max(0, Math.floor(Number(total) || 0));
  const used = Math.min(capacity, Math.max(0, Math.floor(Number(filled) || 0)));
  return {
    kind: "slots",
    filled: used,
    total: capacity,
    label: label == null ? `${used} / ${capacity}` : String(label).toUpperCase(),
  };
}

// A level, as a bar plus its figure.
export function levelReadout(fraction, label) {
  const value = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return { kind: "level", fraction: value, label: String(label ?? "") };
}

// Just words. The honest answer for a unit whose state is a state.
export function statusReadout(text, { quiet = false } = {}) {
  return { kind: "status", text: String(text ?? "").trim() || "—", quiet };
}

// Thousands separators stop a charge count from reading as a phone number,
// and a non-number never reaches the window as "NaN".
//
// Nothing is not zero. `Number(null)` is 0, so a missing reading used to be
// displayed as a confident "0 CHARGES" — a different and worse claim than
// admitting there is no reading.
export function formatCount(value) {
  if (value == null || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return Math.round(number).toLocaleString("en-US");
}

// How many cells a slot readout may draw before it stops being countable at a
// glance. Past this it reports itself as a count instead.
export const MAX_DRAWN_SLOTS = 12;

export function readoutFitsAsSlots(total) {
  const capacity = Math.floor(Number(total) || 0);
  return capacity > 0 && capacity <= MAX_DRAWN_SLOTS;
}

// The one entry point the cockpit calls: given a unit's numbers, what should
// its window show? Falling through to `statusReadout` is always correct, so a
// unit nobody has described yet still gets a working display.
export function describeModuleReadout(panelId, facts = {}) {
  switch (panelId) {
    case "miner":
      return Number.isFinite(facts.charges)
        ? countReadout(facts.charges, "charges")
        : statusReadout(facts.text);
    case "scanner":
      return Number.isFinite(facts.scanergy)
        ? countReadout(facts.scanergy, "scanergy")
        : statusReadout(facts.text);
    case "beacon-bay":
      return readoutFitsAsSlots(facts.beaconCapacity)
        ? slotsReadout(facts.beaconsLoaded, facts.beaconCapacity)
        : statusReadout(facts.text);
    case "engine":
      return Number.isFinite(facts.fuelFraction)
        ? levelReadout(facts.fuelFraction, formatCount(facts.fuel))
        : statusReadout(facts.text);
    case "hull":
      return Number.isFinite(facts.integrityFraction)
        ? levelReadout(facts.integrityFraction, `${Math.round(facts.integrityFraction * 100)}%`)
        : statusReadout(facts.text);
    default:
      return statusReadout(facts.text, { quiet: facts.quiet === true });
  }
}
