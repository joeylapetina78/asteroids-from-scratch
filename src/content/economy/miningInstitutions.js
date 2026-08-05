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
]);

export const CINDER_MINING_SEED = MINING_INSTITUTION_SEEDS[0];
export const FLINT_MINING_SEED = MINING_INSTITUTION_SEEDS[1];
