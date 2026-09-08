export const MINING_INSTITUTION_SEEDS = Object.freeze([
  Object.freeze({
    stateKey: "cinder-contracting",
    institution: { id: "miner:cinder-contracting", name: "Cinder Contracting", archetypeId: "mining-contractor", controllerInstitutionId: "person:ivo-cinder", referenceId: "FR-MIN-031", accounts: { operating: { id: "FR-ACCT-031", balance: 260, committed: 0, transactions: [] } } },
    controller: { id: "person:ivo-cinder", name: "Ivo Cinder", archetypeId: "person", controls: ["miner:cinder-contracting"], traits: { caution: 0.4, growthBias: 0.55, urgencyBias: 0.5 }, license: { id: "MEX-031-CINDER", class: "commercial-extraction", status: "active" } },
    fleetPrefix: "cinder",
    fleetName: "Cinder",
    shipPalette: { hullStroke: "#ff9a72", hullFill: "rgba(255, 116, 82, 0.16)", cabStroke: "#ffe0a3", tractorStroke: "rgba(126, 231, 255, 0.42)" },
    homeSiteId: "scrap-porch",
    operatingCosts: { crewPayPerContract: 65, consumablesPerContract: 25 },
    workers: [
      { id: "worker:cinder-one", name: "Cinder One", referenceId: "MW-031-CINDER", currentSiteId: "scrap-porch", initialWear: 0.65, offset: { x: -100, y: 80 } },
      { id: "worker:cinder-two", name: "Cinder Two", referenceId: "MW-032-CINDER", currentSiteId: "yard-exchange", initialWear: 0.25, offset: { x: -90, y: -90 } },
      { id: "worker:cinder-three", name: "Cinder Three", referenceId: "MW-033-CINDER", currentSiteId: "the-ledge", initialWear: 0.1, offset: { x: 100, y: 80 } },
    ],
    expansionWorker: { id: "worker:cinder-four", name: "Cinder Four", referenceId: "MW-034-CINDER", currentSiteId: "scrap-porch", initialWear: 0.15, offset: { x: 110, y: -80 } },
    expansionProject: { id: "cinder-four", name: "Commission Cinder Four", requiredCredits: 3500 },
  }),
  Object.freeze({
    stateKey: "flint-prospecting",
    institution: { id: "miner:flint-prospecting", name: "Flint Prospecting", archetypeId: "mining-contractor", controllerInstitutionId: "person:rhea-flint", referenceId: "FR-MIN-044", accounts: { operating: { id: "FR-ACCT-044", balance: 4200, committed: 0, transactions: [] } } },
    controller: { id: "person:rhea-flint", name: "Rhea Flint", archetypeId: "person", controls: ["miner:flint-prospecting"], traits: { caution: 0.72, growthBias: 0.28, urgencyBias: 0.35 }, license: { id: "MEX-044-FLINT", class: "commercial-extraction", status: "active" } },
    fleetPrefix: "flint",
    fleetName: "Flint",
    shipPalette: { hullStroke: "#72ffc9", hullFill: "rgba(70, 220, 166, 0.17)", cabStroke: "#c8ffe9", tractorStroke: "rgba(122, 255, 211, 0.46)" },
    homeSiteId: "blue-lantern",
    operatingCosts: { crewPayPerContract: 75, consumablesPerContract: 30 },
    workers: [
      { id: "worker:flint-one", name: "Flint One", referenceId: "MW-044-FLINT", currentSiteId: "blue-lantern", initialWear: 0.48, offset: { x: -85, y: 70 } },
      { id: "worker:flint-two", name: "Flint Two", referenceId: "MW-045-FLINT", currentSiteId: "yard-exchange", initialWear: 0.18, offset: { x: 90, y: -65 } },
    ],
    expansionWorker: null,
    expansionProject: null,
  }),
  // Rook Industries is the sponsoring operator already named on the RTC
  // provisional license form: mining rights in First Reach are extended through
  // ITS Commission permit, not the pilot's. Until now it existed only as a voice
  // in `npcs.js` with an authored contract ladder wrapped around it — an
  // employer with no treasury, no hulls, and no position in the extraction
  // clearing. It is seeded here so the sponsorship the player signs on the
  // opening form is backed by a company that actually competes for work.
  //
  // It is capitalized well above the small outfits ON PURPOSE, and that is a
  // character fact rather than a protective rule. Rook has to still be standing
  // after an entire player arc, because falling back to working for Rook is the
  // floor of the ownership ladder. An engine rule forbidding its bankruptcy
  // would be exactly the outcome-protection this project keeps rejecting; deep
  // reserves and patient traits are the diegetic version of the same thing. It
  // can still fail — it just has to be outcompeted for a long time first.
  Object.freeze({
    stateKey: "rook-industries",
    institution: { id: "miner:rook-industries", name: "Rook Industries", archetypeId: "mining-contractor", controllerInstitutionId: "person:rook", referenceId: "FR-MIN-007", accounts: { operating: { id: "FR-ACCT-007", balance: 32000, committed: 0, transactions: [] } } },
    controller: { id: "person:rook", name: "Rook", archetypeId: "person", controls: ["miner:rook-industries"], traits: { caution: 0.55, growthBias: 0.45, urgencyBias: 0.3 }, license: { id: "MEX-007-ROOK", class: "commercial-extraction", status: "active" } },
    fleetPrefix: "rook",
    fleetName: "Rook",
    // Every small outfit gets a colour of its own; the old sponsor flies
    // unpainted steel. Read on sight: the big fleet is the plain one.
    shipPalette: { hullStroke: "#cfd8e3", hullFill: "rgba(150, 172, 196, 0.18)", cabStroke: "#f2f6ff", tractorStroke: "rgba(198, 216, 236, 0.44)" },
    homeSiteId: "yard-exchange",
    // Rook pays its hands better than the small outfits do. That raises its cost
    // to serve and should cost it marginal auctions — the trade it makes for
    // crews who stay. Watch this number rather than trusting it: it is the one
    // that will later pay the player, and it has never been measured against a
    // full clearing.
    operatingCosts: { crewPayPerContract: 80, consumablesPerContract: 28 },
    workers: [
      { id: "worker:rook-one", name: "Rook One", referenceId: "MW-007-ROOK", currentSiteId: "yard-exchange", initialWear: 0.3, offset: { x: -150, y: 55 } },
      { id: "worker:rook-two", name: "Rook Two", referenceId: "MW-008-ROOK", currentSiteId: "scrap-porch", initialWear: 0.42, offset: { x: -30, y: -125 } },
      { id: "worker:rook-three", name: "Rook Three", referenceId: "MW-009-ROOK", currentSiteId: "the-ledge", initialWear: 0.18, offset: { x: -110, y: -70 } },
    ],
    // No expansion hull, deliberately. The fourth Rook berth is the player's:
    // story mode flies "Rook Provisional" under this company's permit, and the
    // next slice dispatches it out of this fleet rather than commissioning an
    // NPC into the seat the player is supposed to occupy.
    expansionWorker: null,
    expansionProject: null,
  }),
  Object.freeze({
    stateKey: "ore-station-diggers",
    institution: { id: "miner:ore-station-diggers", name: "Ore Station Diggers", archetypeId: "mining-contractor", controllerInstitutionId: "person:vesa-dag", referenceId: "FR-MIN-081", accounts: { operating: { id: "FR-ACCT-081", balance: 5200, committed: 0, transactions: [] } } },
    controller: { id: "person:vesa-dag", name: "Vesa Dag", archetypeId: "person", controls: ["miner:ore-station-diggers"], traits: { caution: 0.5, growthBias: 0.5, urgencyBias: 0.55 }, license: { id: "MEX-081-ORE", class: "commercial-extraction", status: "active" } },
    fleetPrefix: "ore-station", fleetName: "Ore Station",
    shipPalette: { hullStroke: "#d8c08a", hullFill: "rgba(205, 174, 105, 0.18)", cabStroke: "#fff0c4", tractorStroke: "rgba(255, 211, 126, 0.44)" },
    homeSiteId: "ore-station-one", operatingCosts: { crewPayPerContract: 80, consumablesPerContract: 35 },
    workers: [{ id: "worker:ore-station-one", name: "Ore Station Pick One", referenceId: "MW-081-ORE", currentSiteId: "ore-station-one", initialWear: 0.32, offset: { x: -90, y: 70 } }],
    expansionWorker: null, expansionProject: null,
  }),
  Object.freeze({
    stateKey: "coldwater-cutters",
    institution: { id: "miner:coldwater-cutters", name: "Coldwater Cutters", archetypeId: "mining-contractor", controllerInstitutionId: "person:mina-okonjo", referenceId: "FR-MIN-082", accounts: { operating: { id: "FR-ACCT-082", balance: 5000, committed: 0, transactions: [] } } },
    controller: { id: "person:mina-okonjo", name: "Mina Okonjo", archetypeId: "person", controls: ["miner:coldwater-cutters"], traits: { caution: 0.8, growthBias: 0.15, urgencyBias: 0.45 }, license: { id: "MEX-082-COLD", class: "commercial-extraction", status: "active" } },
    fleetPrefix: "coldwater", fleetName: "Coldwater",
    shipPalette: { hullStroke: "#88d9ff", hullFill: "rgba(88, 190, 240, 0.18)", cabStroke: "#dbf6ff", tractorStroke: "rgba(126, 231, 255, 0.44)" },
    homeSiteId: "coldwater-depot", operatingCosts: { crewPayPerContract: 75, consumablesPerContract: 30 },
    workers: [{ id: "worker:coldwater-one", name: "Coldwater One", referenceId: "MW-082-COLD", currentSiteId: "coldwater-depot", initialWear: 0.28, offset: { x: 85, y: -65 } }],
    expansionWorker: null, expansionProject: null,
  }),
  Object.freeze({
    stateKey: "deep-field-services",
    institution: { id: "miner:deep-field-services", name: "Deep Field Services", archetypeId: "mining-contractor", controllerInstitutionId: "person:elin-reyes", referenceId: "FR-MIN-083", accounts: { operating: { id: "FR-ACCT-083", balance: 4800, committed: 0, transactions: [] } } },
    controller: { id: "person:elin-reyes", name: "Elin Reyes", archetypeId: "person", controls: ["miner:deep-field-services"], traits: { caution: 0.65, growthBias: 0.3, urgencyBias: 0.25 }, license: { id: "MEX-083-DEEP", class: "commercial-extraction", status: "active" } },
    fleetPrefix: "deep-field", fleetName: "Deep Field",
    shipPalette: { hullStroke: "#b99cff", hullFill: "rgba(153, 116, 235, 0.18)", cabStroke: "#eadfff", tractorStroke: "rgba(190, 155, 255, 0.44)" },
    homeSiteId: "deep-research", operatingCosts: { crewPayPerContract: 85, consumablesPerContract: 35 },
    workers: [{ id: "worker:deep-field-one", name: "Deep Field One", referenceId: "MW-083-DEEP", currentSiteId: "deep-research", initialWear: 0.22, offset: { x: -80, y: -75 } }],
    expansionWorker: null, expansionProject: null,
  }),
]);

const seedByStateKey = (stateKey) => MINING_INSTITUTION_SEEDS.find((seed) => seed.stateKey === stateKey);

export const CINDER_MINING_SEED = seedByStateKey("cinder-contracting");
export const FLINT_MINING_SEED = seedByStateKey("flint-prospecting");
export const ROOK_MINING_SEED = seedByStateKey("rook-industries");

// Which operators are "the frontier" is a fact about where they live, not about
// where they sit in this array. This was `slice(2)`, so inserting any core
// operator above them silently promoted it into the frontier fleet — and past
// the test that pins that fleet's home sites, because the test read the same
// slice it was checking.
const FRONTIER_HOME_SITE_IDS = new Set(["ore-station-one", "coldwater-depot", "deep-research"]);
export const FRONTIER_MINING_SEEDS = MINING_INSTITUTION_SEEDS
  .filter((seed) => FRONTIER_HOME_SITE_IDS.has(seed.homeSiteId));
