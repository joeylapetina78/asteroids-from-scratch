export function createSprcInstitutionInstance(now = Date.now()) {
  return {
    id: "sprc",
    name: "Scrap Porch Recovery Cooperative",
    archetypeId: "repair-cooperative",
    controllerInstitutionId: "sal",
    siteId: "scrap-porch",
    accounts: { operating: { id: "account:sprc-operating", balance: 1800, committed: 0, currency: "credits" } },
    policies: {
      protectedCash: 900,
      inventoryTargets: { structuralFeedstockEquivalents: 8, "hull-plate": 3, "machine-part": 2 },
      safetyStock: { "hull-plate": 1, "machine-part": 1 },
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
    controls: ["sprc"],
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
    accounts: { operating: { id: "account:sunward-acre", balance: 720, committed: 0, currency: "credits" } },
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
