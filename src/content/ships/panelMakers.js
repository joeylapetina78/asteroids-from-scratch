// Who built the instrument in front of you.
//
// Ship parts come from different companies with their own product lines, house
// styles and opinions about how loudly to put their name on a thing. That
// variety is deliberate and is not something the layout grid is allowed to
// flatten: the grid governs FIT, the maker governs FACE.
//
// What a maker MAY decide: colour accent, typeface, label placement, whether
// they brand it at all, control height, meter grain, bezel treatment, whimsy.
// What a maker MAY NOT decide: the bay footprint, the flange, or any dimension
// that is not a multiple of 8. Those are the mounting standard, and they exist
// because ships get refitted and parts get swapped between hulls.
//
// `brand` here is the same noun already used by `engineModels.js` and
// `shipOffers.js`; the engine panel reads its maker from the FITTED drive
// rather than this table, because which company built that panel genuinely
// changes when the drive is swapped.

// A segmented meter's grain: how many cells, and the pitch each one occupies.
//
// The pitch is structural — cells always tile the full 216px content width, so
// two instruments from different makers still line up when stacked. The COUNT
// is the maker's, and picking it picks the character: a nine-cell strip is a
// blunt commodity part, twenty-seven is a precision readout somebody paid for.
//
// Legal grains are the divisors of 216 that keep the pitch on the 8px minor
// grid. Anything else cannot tile the bay and is rejected by the tests.
export const PANEL_CONTENT_WIDTH = 216;

export const METER_GRAINS = Object.freeze({
  coarse: Object.freeze({ cells: 9, pitch: 24, bar: 20 }),
  standard: Object.freeze({ cells: 18, pitch: 12, bar: 8 }),
  fine: Object.freeze({ cells: 27, pitch: 8, bar: 6 }),
});

export const DEFAULT_PANEL_MAKER_ID = "generic";

export const PANEL_MAKERS = Object.freeze({
  // The house that fits out Yard Exchange's starter hulls. Cheap, legible,
  // unembarrassed: big type, blunt meters, name stamped on everything.
  rook: Object.freeze({ id: "rook", brand: "Rook", meterGrain: "coarse", controlHeight: 32 }),
  // Precision drives for people who can fly them. Fine gauges, tight type,
  // a switch with real travel on it.
  vektor: Object.freeze({ id: "vektor", brand: "Vektor", meterGrain: "standard", controlHeight: 40 }),
  // Unbranded salvage-market fitment. Whoever made it did not sign it.
  generic: Object.freeze({ id: "generic", brand: null, meterGrain: "standard", controlHeight: 32 }),
});

// Which maker built each panel, where that is not decided by fitted equipment.
const PANEL_MAKER_IDS = Object.freeze({
  hull: "rook",
  cargo: "rook",
  processor: "rook",
  miner: "generic",
  collector: "generic",
  scanner: "generic",
  "beacon-locator": "vektor",
  "beacon-bay": "vektor",
  "tow-cable": "generic",
  "moss-seeder": "generic",
  "moss-harvester": "generic",
  shield: "vektor",
  cloak: "vektor",
});

export function getPanelMaker(makerId) {
  return PANEL_MAKERS[makerId] ?? PANEL_MAKERS[DEFAULT_PANEL_MAKER_ID];
}

// The engine's maker is whoever built the drive that is currently fitted, so it
// is passed in rather than looked up. Everything else comes from the table.
export function getPanelMakerId(panelId, { engineBrand = null } = {}) {
  if (panelId === "engine") {
    const fitted = Object.values(PANEL_MAKERS)
      .find((maker) => maker.brand && maker.brand.toLowerCase() === String(engineBrand ?? "").toLowerCase());
    return fitted?.id ?? DEFAULT_PANEL_MAKER_ID;
  }

  return PANEL_MAKER_IDS[panelId] ?? DEFAULT_PANEL_MAKER_ID;
}

export function getMeterGrain(makerId) {
  return METER_GRAINS[getPanelMaker(makerId).meterGrain] ?? METER_GRAINS.standard;
}
