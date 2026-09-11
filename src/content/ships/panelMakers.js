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
// Legal grains are the divisors of 216 that keep the pitch on the 12px minor
// grid. Anything else cannot tile the bay and is rejected by the tests.
export const PANEL_CONTENT_WIDTH = 216;
export const PANEL_MINOR_GRID = 12;

export const METER_GRAINS = Object.freeze({
  blunt: Object.freeze({ cells: 6, pitch: 36, bar: 32 }),
  coarse: Object.freeze({ cells: 9, pitch: 24, bar: 20 }),
  standard: Object.freeze({ cells: 18, pitch: 12, bar: 8 }),
});

export const DEFAULT_PANEL_MAKER_ID = "generic";

export const PANEL_MAKERS = Object.freeze({
  // The house that fits out Yard Exchange's starter hulls. Cheap, legible,
  // unembarrassed: big type, blunt meters, chunky switches you can hit with a
  // glove on, name stamped on everything.
  rook: Object.freeze({ id: "rook", brand: "Rook", meterGrain: "coarse", controlHeight: 36 }),
  // Precision drives for people who can fly them. Fine gauges, tight type, and
  // low-profile controls — which is why the engine's power switch sits flatter
  // than the hull's dock button. That is the house, not a one-off exception.
  vektor: Object.freeze({ id: "vektor", brand: "Vektor", meterGrain: "standard", controlHeight: 24 }),
  // Unbranded salvage-market fitment. Whoever made it did not sign it.
  generic: Object.freeze({ id: "generic", brand: null, meterGrain: "standard", controlHeight: 36 }),
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
// The plate stencilled on a rack unit's face: who built it and which model.
//
// This replaces a code that was just the panel's own name cut to four letters,
// which is why the bay used to read "HULL HULL" and "SCAN SCANNER". A prefix
// per maker and a model number per unit says something the name does not, and
// it puts the maker system — the whole reason these panels look different from
// each other — somewhere the player can actually read it.
//
// Rook stamps its name on everything, Vektor numbers its instruments, and
// salvage-market fitments are unsigned: those get a bare number behind a
// double dash, which is the yard saying it does not know either.
export const MAKER_PLATE_PREFIX = Object.freeze({ rook: "RK", vektor: "VK", generic: "——" });

const PANEL_MODEL_NUMBERS = Object.freeze({
  hull: "114", engine: "22", cargo: "96", processor: "70",
  miner: "44", collector: "31", scanner: "18",
  "beacon-locator": "07", "beacon-bay": "09",
  "tow-cable": "03", "moss-seeder": "12", "moss-harvester": "13",
  shield: "51", cloak: "60",
});

export function getPanelPlate(panelId, { engineBrand = null } = {}) {
  const prefix = MAKER_PLATE_PREFIX[getPanelMakerId(panelId, { engineBrand })] ?? MAKER_PLATE_PREFIX.generic;
  const model = PANEL_MODEL_NUMBERS[panelId] ?? "00";
  return `${prefix}·${model}`;
}

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
