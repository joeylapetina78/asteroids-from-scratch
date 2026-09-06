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

export const CINDER_MINING_SEED = MINING_INSTITUTION_SEEDS[0];
export const FLINT_MINING_SEED = MINING_INSTITUTION_SEEDS[1];
export const FRONTIER_MINING_SEEDS = MINING_INSTITUTION_SEEDS.slice(2);
