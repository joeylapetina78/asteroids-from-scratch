// One authored record per settlement.
//
// Runtime systems still own their domain state. This catalog owns the facts
// that previously had to agree across logistics, population demand, mining
// orders, and authority seeds. Adding a settlement should begin here; authored
// geography remains in the transportation network and is referenced by siteId.

const STANDARD_NEEDS = Object.freeze([
  "settlement-supply-unit",
  "life-support-pack",
  "household-goods-unit",
  "general-materials",
]);

export const FIRST_REACH_SETTLEMENTS = Object.freeze([
  {
    institution: {
      id: "yard-exchange", name: "Yard Exchange", siteId: "yard-exchange",
      archetypeId: "settlement", controllerInstitutionId: "person:yard-quartermaster",
      accounts: { operating: { balance: 50000, committed: 0 } },
      inventories: { "iron-nickel": 4, silicate: 0, "water-ice": 0 },
      renewableResources: ["iron-nickel"],
    },
    controller: {
      id: "person:yard-quartermaster", name: "Bex Ordell", archetypeId: "person",
      controls: ["yard-exchange"], traits: { caution: 0.35, growthBias: 0.2, urgencyBias: 0.3 },
    },
    population: {
      id: "population:yard-exchange", name: "Yard Exchange Population", size: 140,
      householdCash: 40000, householdCashCap: 40000,
      incomeAmount: 12000, incomeIntervalSeconds: 120, needIds: STANDARD_NEEDS,
    },
    extraction: {
      id: "mine-yard-iron", resourceId: "iron-nickel", resourceName: "Iron Nickel",
      miningFamilies: ["structural"],
    },
  },
  {
    institution: {
      id: "scrap-forge", name: "Scrap Porch", siteId: "scrap-porch",
      archetypeId: "settlement", controllerInstitutionId: "person:porch-quartermaster",
      accounts: { operating: { balance: 30000, committed: 0 } },
      inventories: { "water-ice": 6, "iron-nickel": 0, silicate: 0 },
      renewableResources: ["water-ice"],
    },
    controller: {
      id: "person:porch-quartermaster", name: "Hale Sunder", archetypeId: "person",
      controls: ["scrap-forge"], traits: { caution: 0.5, growthBias: 0.45, urgencyBias: 0.6 },
    },
    population: {
      id: "population:scrap-porch", name: "Scrap Porch Population", size: 95,
      householdCash: 40000, householdCashCap: 40000,
      incomeAmount: 12000, incomeIntervalSeconds: 120, needIds: STANDARD_NEEDS,
    },
    extraction: {
      id: "mine-porch-water", resourceId: "water-ice", resourceName: "Water Ice",
      miningFamilies: ["volatile"],
    },
  },
  {
    institution: {
      id: "the-ledge", name: "The Ledge", siteId: "the-ledge",
      archetypeId: "settlement", controllerInstitutionId: "person:ledge-quartermaster",
      accounts: { operating: { balance: 42000, committed: 0 } },
      inventories: { "iron-nickel": 0, silicate: 4, "water-ice": 0 },
      renewableResources: ["silicate"],
    },
    controller: {
      id: "person:ledge-quartermaster", name: "Ivry Nakash", archetypeId: "person",
      controls: ["the-ledge"], traits: { caution: 0.75, growthBias: 0.6, urgencyBias: 0.8 },
    },
    population: {
      id: "population:the-ledge", name: "The Ledge Population", size: 60,
      householdCash: 40000, householdCashCap: 40000,
      incomeAmount: 12000, incomeIntervalSeconds: 120, needIds: STANDARD_NEEDS,
    },
    extraction: {
      id: "mine-ledge-silicate", resourceId: "silicate", resourceName: "Silicate",
      miningFamilies: ["industrial"],
    },
  },
  {
    // The first competition proof: Blue Lantern and Scrap Porch can both
    // supply volatile material. Blue Lantern is nearer The Ledge through Yard
    // Exchange, begins with a deeper shelf, and is run by a low-margin operator,
    // but has a smaller treasury and a larger local population to protect.
    institution: {
      id: "blue-lantern", name: "Blue Lantern", siteId: "blue-lantern",
      archetypeId: "settlement", controllerInstitutionId: "person:blue-lantern-factor",
      accounts: { operating: { balance: 22000, committed: 0 } },
      inventories: { "water-ice": 18, "iron-nickel": 0, silicate: 0 },
      renewableResources: ["water-ice"],
    },
    controller: {
      id: "person:blue-lantern-factor", name: "Nia Pell", archetypeId: "person",
      controls: ["blue-lantern"], traits: { caution: 0.6, growthBias: 0.1, urgencyBias: 0.7 },
    },
    population: {
      id: "population:blue-lantern", name: "Blue Lantern Population", size: 110,
      householdCash: 30000, householdCashCap: 32000,
      incomeAmount: 9000, incomeIntervalSeconds: 120, needIds: STANDARD_NEEDS,
    },
    extraction: {
      id: "mine-blue-lantern-water", resourceId: "water-ice", resourceName: "Water Ice",
      miningFamilies: ["volatile"],
    },
  },
  {
    // Hub five is deliberately not a balanced copy. Morrow Shoal is a lean,
    // low-margin structural producer near Scrap Porch. Its iron competes with
    // Yard Exchange on delivered economics, while its small treasury and weak
    // household income make its own imports vulnerable to a bad trade cycle.
    institution: {
      id: "morrow-shoal", name: "Morrow Shoal", siteId: "morrow-shoal",
      archetypeId: "settlement", controllerInstitutionId: "person:morrow-shoal-factor",
      accounts: { operating: { balance: 9000, committed: 0 } },
      inventories: { "iron-nickel": 14, silicate: 0, "water-ice": 0 },
      renewableResources: ["iron-nickel"],
    },
    controller: {
      id: "person:morrow-shoal-factor", name: "Edda Morrow", archetypeId: "person",
      controls: ["morrow-shoal"], traits: { caution: 0.8, growthBias: 0, urgencyBias: 0.55 },
    },
    population: {
      id: "population:morrow-shoal", name: "Morrow Shoal Population", size: 78,
      householdCash: 12000, householdCashCap: 18000,
      incomeAmount: 4200, incomeIntervalSeconds: 120, needIds: STANDARD_NEEDS,
    },
    extraction: {
      id: "mine-morrow-iron", resourceId: "iron-nickel", resourceName: "Iron Nickel",
      miningFamilies: ["structural"],
    },
  },
]);

export function settlementInstitutionRecords() {
  return FIRST_REACH_SETTLEMENTS.flatMap((seed) => [seed.institution, seed.controller]);
}

export function settlementPopulationProfiles() {
  return FIRST_REACH_SETTLEMENTS.map((seed) => ({
    ...seed.population,
    hubInstitutionId: seed.institution.id,
    siteId: seed.institution.siteId,
    needIds: [...seed.population.needIds],
  }));
}

export function settlementExtractionDefinitions() {
  return FIRST_REACH_SETTLEMENTS.map((seed) => ({
    ...seed.extraction,
    siteId: seed.institution.siteId,
    siteName: seed.institution.name,
    buyerInstitutionId: seed.institution.id,
  }));
}

export function settlementMiningRights() {
  return FIRST_REACH_SETTLEMENTS.map((seed) => ({
    institutionId: seed.institution.id,
    placeId: `hub:${seed.institution.siteId}`,
    families: [...seed.extraction.miningFamilies],
  }));
}

export function settlementPlaces() {
  return FIRST_REACH_SETTLEMENTS.map((seed) => ({
    id: `hub:${seed.institution.siteId}`,
    sourceId: seed.institution.siteId,
    name: seed.institution.name,
  }));
}
