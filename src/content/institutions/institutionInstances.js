export function createSprcInstitutionInstance(now = Date.now()) {
  return {
    id: "sprc",
    name: "Scrap Porch Recovery Cooperative",
    archetypeId: "repair-cooperative",
    ownerInstitutionId: "scrap-forge",
    controllerInstitutionId: "sal",
    departmentHeadPersonId: "sal",
    organizationRole: "department",
    siteId: "scrap-porch",
    serviceCapabilities: [
      { id: "freight-craft-maintenance", craftClasses: ["freight-hauler"], issueTypes: ["drive-fatigue", "maneuvering-strain", "hull-fatigue", "control-fault", "preventive-service"], repairCapabilities: ["structural-repair", "mechanical-repair", "control-systems"], facilityType: "repair-berth", servicePrice: 180 },
      { id: "mining-craft-maintenance", craftClasses: ["mining-craft"], issueTypes: ["structural-fatigue", "tractor-field-instability", "field-control-failure", "preventive-calibration"], repairCapabilities: ["structural-repair", "mechanical-repair", "tractor-field", "field-control"], facilityType: "repair-berth", servicePrice: 220 },
    ],
    accounts: { operating: { id: "account:scrap-forge-operating", balance: 0, committed: 0, currency: "credits" } },
    policies: {
      protectedCash: 900,
      inventoryTargets: { structuralFeedstockEquivalents: 8, "hull-plate": 10, "machine-part": 8, copper: 1 },
      safetyStock: { "hull-plate": 5, "machine-part": 4, copper: 1 },
      procurementBatchSizes: { copper: 3, silicate: 6 },
      projectedServiceCoverageTarget: 2,
      servicePriorities: ["disabled-systems", "damaged-hull", "routine-wear"],
    },
    inventories: { raw: { "iron-nickel": 0, aluminum: 0, "water-ice": 2, silicate: 2, copper: 1 }, produced: { "hull-plate": 1, "machine-part": 1 }, reserved: { raw: {}, produced: {} } },
    projects: { "sprc-second-cradle": { id: "sprc-second-cradle", name: "Second Repair Cradle", status: "planned", requirements: { "hull-plate": 6, "machine-part": 4, credits: 600 }, reserved: { "hull-plate": 0, "machine-part": 0, credits: 0 }, priority: 20, rationale: "Add a second berth after routine coverage and protected cash are secure." } },
    createdAt: now,
  };
}

export function createSalInstitutionInstance() {
  return {
    id: "sal",
    name: "Sal",
    archetypeId: "person",
    controls: [],
    delegatedRoles: [{ ownerInstitutionId: "scrap-forge", operationId: "sprc", role: "mechanic-and-recovery-factor" }],
    traits: { caution: 0.7, growthBias: 0.4, urgencyBias: 0.8 },
    authority: { mayProcure: true, mayScheduleProduction: true, mayFundProjects: true },
    relationships: [],
  };
}

export function createFarmInstitutionInstance(now = Date.now()) {
  return {
    id: "sunward-acre",
    name: "Sunward Acre",
    archetypeId: "farm",
    controllerInstitutionId: "tavi",
    accounts: { operating: { id: "account:sunward-acre", balance: 7200, committed: 0, currency: "credits" } },
    policies: { protectedCash: 300, inventoryTargets: { water: 12, seed: 4 }, safetyStock: { water: 3, seed: 1 } },
    inventories: { inputs: { water: 2, seed: 4 }, outputs: { crop: 0 }, reserved: { inputs: {}, outputs: {} } },
    projects: { greenhouse: { id: "greenhouse", status: "planned", requirements: { credits: 500 }, reserved: { credits: 0 }, priority: 10 } },
    needs: {}, problems: {}, responses: {}, procurementOrders: {}, createdAt: now,
  };
}

export function createTaviInstitutionInstance() {
  return {
    id: "tavi",
    name: "Tavi",
    archetypeId: "person",
    controls: ["sunward-acre"],
    traits: { caution: 0.5, growthBias: 0.3, urgencyBias: 0.6 },
    authority: { mayProcure: true, mayScheduleProduction: true, mayFundProjects: true },
    relationships: [],
  };
}

// Yard Exchange builds hulls.
//
// Wired exactly like SPRC above, because the pattern is the point: the HUB owns
// the yard, a named person runs it under delegated authority, and the money is
// the hub's own operating account rather than a fifth treasury nobody
// reconciles. See docs/shipbuilding.md and the "five hidden treasuries" note
// before giving this its own account.
export function createYardShipyardInstitutionInstance(now = Date.now()) {
  return {
    id: "yard-shipyard",
    name: "Yard Exchange Slipway",
    archetypeId: "shipyard",
    ownerInstitutionId: "yard-exchange",
    controllerInstitutionId: "mira-koss",
    departmentHeadPersonId: "mira-koss",
    organizationRole: "department",
    siteId: "yard-exchange",
    // What it will build, and what it costs the yard to build one. Price to a
    // BUYER is this plus a margin the relationship decides; the owning hub pays
    // cost. Stage 2 replaces `buildCost` with real materials.
    hullCatalog: [
      { id: "mining-craft", label: "Ore Worker", buildCost: 3500, quality: 1 },
      { id: "freight-craft", label: "Freighter", buildCost: 6000, quality: 1 },
    ],
    inventories: { raw: {}, produced: {}, reserved: { raw: {}, produced: {} } },
    projects: {},
    createdAt: now,
  };
}

// Runs the slipway for the hub. Authority is delegated, not owned — the same
// shape as Sal, so the hub remains the thing that owns and the person remains
// the thing that decides.
export function createMiraKossInstitutionInstance() {
  return {
    id: "mira-koss",
    name: "Mira Koss",
    archetypeId: "person",
    controls: [],
    delegatedRoles: [{ ownerInstitutionId: "yard-exchange", operationId: "yard-shipyard", role: "slipway-master" }],
    traits: { caution: 0.5, growthBias: 0.6, urgencyBias: 0.4 },
    authority: { mayProcure: true, mayScheduleProduction: true, mayFundProjects: false },
    relationships: [],
  };
}
