// One authored record per settlement.
//
// Runtime systems still own their domain state. This catalog owns the facts
// that previously had to agree across logistics, population demand, mining
// orders, and authority seeds. Adding a settlement should begin here; authored
// geography remains in the transportation network and is referenced by siteId.

import { WORLD_SITES } from "../../systems/worldSites.js?v=fresh-20260822-0043-8abca575";
import {
  FOUNDATIONAL_EXTRACTION_FAMILIES, MUNICIPAL_CAPACITY_TYPES, STANDARD_SETTLEMENT_NEEDS,
  compileSettlementSeed, settlementExtractionDefinition, settlementMiningRight,
  settlementPlace, settlementPopulationProfile,
} from "../../systems/settlementSeedPipeline.js?v=fresh-20260822-0043-8abca575";

const STANDARD_NEEDS = STANDARD_SETTLEMENT_NEEDS;

// Step-three baseline: every settlement can lawfully rebuild foundational
// capacity. Its primary extraction record remains its specialty and opening
// advantage, but is no longer an absolute prohibition on other inputs.
export { FOUNDATIONAL_EXTRACTION_FAMILIES, MUNICIPAL_CAPACITY_TYPES };

// These describe the enduring NPC, not the person currently speaking for it.
// A representative can retire or be replaced while the organisation keeps its
// assets, obligations, relationships, policies and memory.
const ORGANIZATION_PROFILES = Object.freeze({
  "yard-exchange": { organizationType: "chartered-market-authority", governance: "merchant council", mandate: "Keep exchange, credit and regional trade open.", values: ["liquidity", "access", "order"] },
  "scrap-forge": { organizationType: "municipal-recovery-commons", governance: "workshop assembly", mandate: "Keep Scrap Porch inhabitable by recovering and reusing what the Reach discards.", values: ["repair", "reuse", "mutual survival"] },
  "the-ledge": { organizationType: "chartered-industrial-concession", governance: "appointed works board", mandate: "Turn a difficult industrial foothold into a durable settlement.", values: ["capacity", "discipline", "growth"] },
  "blue-lantern": { organizationType: "civic-mutual", governance: "resident cooperative", mandate: "Protect the Lantern's households and bargain collectively with the rest of the Reach.", values: ["security", "fair dealing", "continuity"] },
  "morrow-shoal": { organizationType: "claimant-commonwealth", governance: "claimholders' moot", mandate: "Preserve the Shoal's claims and sell enough ore to keep them independent.", values: ["independence", "stewardship", "solvency"] },
  "kiln-crossing": { organizationType: "industrial-guild-polity", governance: "masters' chapter", mandate: "Build a permanent manufacturing crossing beyond the inner belt.", values: ["craft", "reserves", "continuity"] },
  "ore-station-one": { organizationType: "extraction-syndicate", governance: "member directorate", mandate: "Expand the frontier's productive reach without losing control of the station.", values: ["output", "expansion", "autonomy"] },
  "coldwater-depot": { organizationType: "custodial-depot-trust", governance: "trusteeship", mandate: "Hold the outer water reserve through isolation and disruption.", values: ["reserve", "reliability", "patience"] },
  "deep-research": { organizationType: "research-order", governance: "collegium", mandate: "Maintain an independent community for work too remote or slow for the inner market.", values: ["inquiry", "patience", "institutional memory"] },
});

const FIRST_REACH_SETTLEMENT_SEEDS = [
  {
    institution: {
      id: "yard-exchange", name: "Yard Exchange", siteId: "yard-exchange",
      archetypeId: "settlement", controllerInstitutionId: "person:yard-quartermaster",
      accounts: { operating: { balance: 50000, committed: 0 } },
      inventories: { "iron-nickel": 4, silicate: 0, "water-ice": 0 },
      renewableResources: ["iron-nickel"],
      protectionPolicy: { mode: "direct", protectedCash: 12000, jurisdictionRadius: 1900, responseThreshold: 0.22 },
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
      // Includes the 18,000 credits formerly held in a second SPRC treasury.
      accounts: { operating: { id: "account:scrap-forge-operating", balance: 48000, committed: 0, currency: "credits" } },
      inventories: { "water-ice": 6, "iron-nickel": 0, silicate: 0 },
      renewableResources: ["water-ice"],
      protectionPolicy: { mode: "direct", protectedCash: 8000, jurisdictionRadius: 1700, responseThreshold: 0.28 },
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
      protectionPolicy: { mode: "contract", protectedCash: 14000, jurisdictionRadius: 2200, responseThreshold: 0.18 },
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
      protectionPolicy: { mode: "hybrid", protectedCash: 7000, jurisdictionRadius: 1800, responseThreshold: 0.3, contractSeverity: 0.62 },
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
      protectionPolicy: { mode: "contract", protectedCash: 3500, jurisdictionRadius: 1600, responseThreshold: 0.4 },
    },
    controller: {
      id: "person:morrow-shoal-factor", name: "Edda Morrow", archetypeId: "person",
      controls: ["morrow-shoal"], traits: { caution: 0.8, growthBias: 0, urgencyBias: 0.55 },
    },
    population: {
      id: "population:morrow-shoal", name: "Morrow Shoal Population", size: 78,
      householdCash: 12000, householdCashCap: 18000,
      incomeAmount: 4200, incomeIntervalSeconds: 120, needIds: STANDARD_NEEDS,
      distressPolicy: {
        cashThreshold: 3600,
        essentialNeedIds: ["life-support-pack", "general-materials"],
        deferredNeedIds: ["settlement-supply-unit", "household-goods-unit"],
        emergencyCreditLimit: 6000,
        repaymentShare: 0.25,
      },
    },
    extraction: {
      id: "mine-morrow-iron", resourceId: "iron-nickel", resourceName: "Iron Nickel",
      miningFamilies: ["structural"],
    },
  },
  {
    // Hub six completes the first competitive commodity triangle. Kiln
    // Crossing can produce the same ordinary industrial feedstock as The
    // Ledge, but sits beyond it on the network, carries a larger local
    // population, and protects a thinner treasury. Its larger opening shelf
    // can win early work, while distance and finite capacity leave room for
    // The Ledge to win the next comparison.
    institution: {
      id: "kiln-crossing", name: "Kiln Crossing", siteId: "kiln-crossing",
      archetypeId: "settlement", controllerInstitutionId: "person:kiln-crossing-factor",
      accounts: { operating: { balance: 16000, committed: 0 } },
      inventories: { "iron-nickel": 0, silicate: 0, carbonaceous: 16, "water-ice": 0 },
      renewableResources: ["carbonaceous"],
      protectionPolicy: { mode: "hybrid", protectedCash: 6000, jurisdictionRadius: 1900, responseThreshold: 0.32, contractSeverity: 0.7 },
    },
    controller: {
      id: "person:kiln-crossing-factor", name: "Ansa Vale", archetypeId: "person",
      controls: ["kiln-crossing"], traits: { caution: 0.68, growthBias: 0.15, urgencyBias: 0.25 },
    },
    population: {
      id: "population:kiln-crossing", name: "Kiln Crossing Population", size: 125,
      householdCash: 24000, householdCashCap: 28000,
      incomeAmount: 7200, incomeIntervalSeconds: 120, needIds: STANDARD_NEEDS,
    },
    extraction: {
      id: "mine-kiln-carbonaceous", resourceId: "carbonaceous", resourceName: "Carbonaceous Material",
      miningFamilies: ["industrial"],
    },
  },

  // ── The far stations ──────────────────────────────────────────────────────
  //
  // Three hubs that already existed as PLACES — positions, names, beacons, a
  // repair bay — and had no economy at all. They sat 46,000 to 89,000 units out
  // as bare waypoints while the whole economy happened in a 10,000-unit huddle
  // near the origin.
  //
  // They are settlements now, for two reasons. Somewhere that far away is what
  // the detail system exists for, and until one existed there was nothing for
  // it to defer. And every one of them is a long freight run from anywhere,
  // which is the first real test of an economy that prices distance honestly:
  // the corridor to Coldwater is forty times the length of the Yard-to-Porch
  // hop, and the freight quote should say so.
  //
  // Each mines ONE family, like everyone else, and must buy the other two. That
  // is deliberate — a self-sufficient outpost would be a simpler world but it
  // would trade with nobody, and trade is the thing worth testing out here.
  {
    institution: {
      id: "ore-station-one", name: "Ore Station One", siteId: "ore-station-one",
      archetypeId: "settlement", controllerInstitutionId: "person:ore-station-super",
      accounts: { operating: { balance: 62000, committed: 0 } },
      inventories: { aluminum: 14, "iron-nickel": 0, silicate: 0, "water-ice": 0 },
      // The only aluminium in the world: a structural material with half again
      // the effective yield of iron-nickel, so the far station is worth the haul
      // for something other than being far away.
      renewableResources: ["aluminum"],
      protectionPolicy: { mode: "direct", protectedCash: 14000, jurisdictionRadius: 2200, responseThreshold: 0.3 },
    },
    controller: {
      id: "person:ore-station-super", name: "Dag Wren", archetypeId: "person",
      controls: ["ore-station-one"],
      // Runs a working ore station and wants it bigger: quick to chase supply,
      // quick to cut a price to keep the freight moving.
      traits: { caution: 0.4, growthBias: 0.7, urgencyBias: 0.5 },
    },
    population: {
      id: "population:ore-station-one", name: "Ore Station One Crew", size: 85,
      householdCash: 20000, householdCashCap: 24000,
      incomeAmount: 6000, incomeIntervalSeconds: 120, needIds: STANDARD_NEEDS,
    },
    extraction: {
      id: "mine-ore-station-aluminum", resourceId: "aluminum", resourceName: "Aluminum",
      miningFamilies: ["structural"],
    },
  },
  {
    institution: {
      id: "coldwater-depot", name: "Coldwater Depot", siteId: "coldwater-depot",
      archetypeId: "settlement", controllerInstitutionId: "person:coldwater-keeper",
      accounts: { operating: { balance: 58000, committed: 0 } },
      inventories: { "water-ice": 18, "iron-nickel": 0, silicate: 0 },
      renewableResources: ["water-ice"],
      protectionPolicy: { mode: "direct", protectedCash: 16000, jurisdictionRadius: 2000, responseThreshold: 0.35 },
    },
    controller: {
      id: "person:coldwater-keeper", name: "Sera Okonjo", archetypeId: "person",
      controls: ["coldwater-depot"],
      // The most isolated place in the world, and it bargains like it: holds its
      // price hard, hoards its margin, in no hurry about anything.
      traits: { caution: 0.85, growthBias: 0.1, urgencyBias: 0.4 },
    },
    population: {
      id: "population:coldwater-depot", name: "Coldwater Depot Crew", size: 70,
      householdCash: 18000, householdCashCap: 22000,
      incomeAmount: 5200, incomeIntervalSeconds: 120, needIds: STANDARD_NEEDS,
    },
    extraction: {
      id: "mine-coldwater-water", resourceId: "water-ice", resourceName: "Water Ice",
      miningFamilies: ["volatile"],
    },
  },
  {
    institution: {
      id: "deep-research", name: "Deep Research", siteId: "deep-research",
      archetypeId: "settlement", controllerInstitutionId: "person:deep-research-warden",
      accounts: { operating: { balance: 54000, committed: 0 } },
      inventories: { carbonaceous: 16, "iron-nickel": 0, "water-ice": 0 },
      renewableResources: ["carbonaceous"],
      protectionPolicy: { mode: "contract", protectedCash: 12000, jurisdictionRadius: 1800, responseThreshold: 0.4, contractSeverity: 0.6 },
    },
    controller: {
      id: "person:deep-research-warden", name: "Tolan Reyes", archetypeId: "person",
      controls: ["deep-research"],
      // Patient to a fault. Revisits nothing in a hurry and will not be rushed
      // into paying over the odds, which out here mostly means waiting.
      traits: { caution: 0.55, growthBias: 0.35, urgencyBias: 0.15 },
    },
    population: {
      id: "population:deep-research", name: "Deep Research Staff", size: 60,
      householdCash: 17000, householdCashCap: 21000,
      incomeAmount: 4800, incomeIntervalSeconds: 120, needIds: STANDARD_NEEDS,
    },
    extraction: {
      id: "mine-deep-research-carbon", resourceId: "carbonaceous", resourceName: "Carbonaceous Material",
      miningFamilies: ["industrial"],
    },
  },
];

export const FIRST_REACH_SETTLEMENTS = Object.freeze(
  FIRST_REACH_SETTLEMENT_SEEDS.map((seed) => compileSettlementSeed({
    ...seed,
    geography: WORLD_SITES.find((site) => site.id === seed.institution.siteId),
  }, { organizationProfile: ORGANIZATION_PROFILES[seed.institution.id], origin: "authored" })),
);

export function settlementInstitutionRecords() {
  return FIRST_REACH_SETTLEMENTS.flatMap((seed) => [seed.institution, seed.controller]);
}

export function settlementPopulationProfiles() {
  return FIRST_REACH_SETTLEMENTS.map(settlementPopulationProfile);
}

export function settlementExtractionDefinitions() {
  return FIRST_REACH_SETTLEMENTS.map(settlementExtractionDefinition);
}

export function settlementMiningRights() {
  return FIRST_REACH_SETTLEMENTS.map(settlementMiningRight);
}

export function settlementPlaces() {
  return FIRST_REACH_SETTLEMENTS.map(settlementPlace);
}
