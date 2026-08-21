// The single construction boundary for settlements. Authored content and
// procedural generation both describe a seed; everything downstream consumes
// the same compiled institutional actor record.

import { PLACE_TYPES, POWER_TYPES, RIGHT_TYPES } from "./authorityModel.js?v=fresh-20260820-2121-992690e";
import { upsertAuthorityGrant } from "./authorityRegistry.js?v=fresh-20260820-2121-992690e";
import { upsertPlace } from "./placeRegistry.js?v=fresh-20260820-2121-992690e";

export const FOUNDATIONAL_EXTRACTION_FAMILIES = Object.freeze([
  "volatile", "structural", "industrial", "conductor", "energy", "advanced", "strange",
]);

export const MUNICIPAL_CAPACITY_TYPES = Object.freeze([
  "mining-operator", "freight-operator", "patrol-service",
  "maintenance-service", "repair-facility", "parts-factory",
]);

export const STANDARD_SETTLEMENT_NEEDS = Object.freeze([
  "settlement-supply-unit", "life-support-pack", "household-goods-unit", "general-materials",
]);

const DEFAULT_AGENCY_PROFILE = Object.freeze({
  organizationType: "settlement-institution",
  governance: "local council",
  mandate: "Keep the community supplied, solvent, and capable of acting for itself.",
  values: ["continuity", "stewardship", "self-determination"],
});

export function compileSettlementSeed(rawSeed, { organizationProfile = null, origin = "authored" } = {}) {
  if (!rawSeed?.institution?.id || !rawSeed.institution.siteId) throw new Error("Settlement seed requires institution.id and institution.siteId");
  if (!rawSeed?.controller?.id) throw new Error(`Settlement ${rawSeed.institution.id} requires a controller`);
  if (!rawSeed?.population?.id) throw new Error(`Settlement ${rawSeed.institution.id} requires a population`);
  if (!rawSeed?.extraction?.id || !rawSeed.extraction.resourceId) throw new Error(`Settlement ${rawSeed.institution.id} requires installed extraction`);

  const seed = structuredClone(rawSeed);
  const institution = seed.institution;
  const profile = { ...DEFAULT_AGENCY_PROFILE, ...(organizationProfile ?? seed.organizationProfile ?? {}) };
  const geography = seed.geography ? normalizeGeography(seed.geography, institution) : null;
  const assets = [
    {
      id: `asset:${institution.id}:settlement-charter`, name: `${institution.name} Charter`,
      archetypeId: "settlement-charter", status: "active", scope: { siteId: institution.siteId },
    },
    {
      id: `asset:${institution.id}:territory-charter`, name: `${institution.name} Jurisdiction Charter`,
      archetypeId: "territory-charter", status: "active",
      scope: { territoryId: `territory:${institution.siteId}`, siteId: institution.siteId },
    },
    {
      id: `asset:${institution.id}:population`, name: seed.population.name,
      archetypeId: "population-constituency", status: "active",
      scope: { populationId: seed.population.id, siteId: institution.siteId, populationSize: seed.population.size },
    },
    {
      id: `asset:${institution.id}:mining-charter`, name: `${institution.name} Extraction Charter`,
      archetypeId: "mining-charter", status: "active",
      scope: {
        authorityGrantId: `authority:institution:${institution.id}:mining:hub:${institution.siteId}`,
        placeId: `hub:${institution.siteId}`,
        resourceIds: [seed.extraction.resourceId], resourceFamilies: [...seed.extraction.miningFamilies],
      },
    },
    {
      id: `asset:${institution.id}:municipal-capacity-charter`, name: `${institution.name} Municipal Capacity Charter`,
      archetypeId: "municipal-capacity-charter", status: "active",
      scope: { siteId: institution.siteId, capacityTypes: [...MUNICIPAL_CAPACITY_TYPES] },
    },
  ];

  return {
    ...seed,
    schemaVersion: 1,
    origin,
    geography,
    organizationProfile: profile,
    institution: {
      ...institution,
      actorKind: "institutional-npc",
      agency: {
        kind: "institutional", ...profile, traits: { ...seed.controller.traits },
        representativeIds: [seed.controller.id],
      },
      assets: mergeById(assets, institution.assets ?? []),
      hubState: institution.hubState ?? {
        version: 1, populationId: seed.population.id, needs: {}, projects: {}, departments: {},
        baseline: {
          mode: "self-sufficient",
          extractionFamilies: [...FOUNDATIONAL_EXTRACTION_FAMILIES],
          commissionableCapacityTypes: [...MUNICIPAL_CAPACITY_TYPES],
          specialization: { resourceId: seed.extraction.resourceId, resourceFamilies: [...seed.extraction.miningFamilies] },
        },
        history: [{ id: `hub-history:${institution.id}:founded`, type: "institution.founded", at: 0 }],
        counters: { need: 0, project: 0, history: 0 },
      },
    },
  };
}

// Procedural generation chooses facts and motivations here, then deliberately
// passes through compileSettlementSeed just like authored content.
export function createProceduralSettlementSeed(spec) {
  if (!spec?.id || !spec.name || !spec.position) throw new Error("Procedural settlement requires id, name, and position");
  const traits = spec.traits ?? {
    caution: 0.3 + deterministicUnit(`${spec.id}:caution`) * 0.55,
    growthBias: 0.15 + deterministicUnit(`${spec.id}:growth`) * 0.7,
    urgencyBias: 0.25 + deterministicUnit(`${spec.id}:urgency`) * 0.65,
  };
  const resourceId = spec.resourceId ?? "iron-nickel";
  const resourceName = spec.resourceName ?? titleCase(resourceId);
  const family = spec.resourceFamily ?? "structural";
  const populationSize = spec.populationSize ?? 40 + Math.floor(deterministicUnit(`${spec.id}:population`) * 100);
  const rawSeed = {
    institution: {
      id: spec.id, name: spec.name, siteId: spec.siteId ?? spec.id, archetypeId: "settlement",
      controllerInstitutionId: spec.controllerId ?? `person:${spec.id}:steward`,
      accounts: { operating: { balance: spec.openingBalance ?? 18000 + populationSize * 180, committed: 0 } },
      inventories: { [resourceId]: spec.openingResourceUnits ?? 8 },
      renewableResources: [resourceId],
      protectionPolicy: spec.protectionPolicy ?? { mode: "hybrid", protectedCash: 5000, jurisdictionRadius: 1800, responseThreshold: 0.32 },
    },
    controller: {
      id: spec.controllerId ?? `person:${spec.id}:steward`, name: spec.representativeName ?? `${spec.name} Steward`,
      archetypeId: "person", controls: [spec.id], traits,
    },
    population: {
      id: `population:${spec.siteId ?? spec.id}`, name: `${spec.name} Population`, size: populationSize,
      householdCash: spec.householdCash ?? populationSize * 220,
      householdCashCap: spec.householdCashCap ?? populationSize * 280,
      incomeAmount: spec.incomeAmount ?? populationSize * 65,
      incomeIntervalSeconds: spec.incomeIntervalSeconds ?? 120,
      needIds: [...(spec.needIds ?? STANDARD_SETTLEMENT_NEEDS)],
    },
    extraction: {
      id: spec.extractionId ?? `mine-${spec.siteId ?? spec.id}-${resourceId}`,
      resourceId, resourceName, miningFamilies: [family],
    },
    geography: {
      id: spec.siteId ?? spec.id, name: spec.name, type: "hub", position: { ...spec.position },
      radius: spec.radius ?? 44, interactionRadius: spec.interactionRadius ?? 185,
      jurisdictionRadius: spec.jurisdictionRadius ?? spec.protectionPolicy?.jurisdictionRadius ?? 1800,
      beaconId: spec.beaconId ?? `beacon-${spec.siteId ?? spec.id}`,
      capabilities: [...(spec.capabilities ?? ["trade"])], services: [...(spec.services ?? [])],
    },
    organizationProfile: spec.organizationProfile,
  };
  return compileSettlementSeed(rawSeed, { origin: "procedural" });
}

export function settlementPopulationProfile(seed) {
  return {
    ...structuredClone(seed.population), hubInstitutionId: seed.institution.id,
    siteId: seed.institution.siteId, needIds: [...seed.population.needIds],
  };
}

export function settlementExtractionDefinition(seed) {
  return {
    ...structuredClone(seed.extraction), specialty: true, siteId: seed.institution.siteId,
    siteName: seed.institution.name, buyerInstitutionId: seed.institution.id,
  };
}

export function settlementMiningRight(seed) {
  return { institutionId: seed.institution.id, placeId: `hub:${seed.institution.siteId}`, families: [...FOUNDATIONAL_EXTRACTION_FAMILIES] };
}

export function settlementPlace(seed) {
  return { id: `hub:${seed.institution.siteId}`, sourceId: seed.institution.siteId, name: seed.institution.name };
}

export function ensureSettlementRegistry(state) {
  state.settlements ??= { version: 1, generated: {} };
  state.settlements.generated ??= {};
  return state.settlements;
}

export function registerGeneratedSettlement(state, seed, { now = Date.now() } = {}) {
  const compiled = seed?.schemaVersion ? structuredClone(seed) : compileSettlementSeed(seed, { origin: "procedural" });
  const registry = ensureSettlementRegistry(state);
  registry.generated[compiled.institution.id] = compiled;
  state.logistics ??= { institutions: {}, haulers: {}, shipments: {}, movements: {}, containers: {}, responses: {}, history: [], counters: {} };
  state.logistics.institutions ??= {};
  state.logistics.institutions[compiled.institution.id] = structuredClone(compiled.institution);
  state.logistics.institutions[compiled.controller.id] = structuredClone(compiled.controller);
  state.population ??= { populations: {}, productionOrders: {}, counter: 0, operators: {}, laborAssignments: {}, operatorCounter: 0 };
  state.population.populations ??= {};
  state.population.populations[compiled.population.id] = createPopulationRecord(settlementPopulationProfile(compiled), now);
  materializeSettlementAuthority(state, compiled);
  registry.generated[compiled.institution.id].registeredAt = now;
  return compiled;
}

export function listGeneratedSettlements(state) {
  return Object.values(state?.settlements?.generated ?? {});
}

export function listGeneratedExtractionDefinitions(state) {
  return listGeneratedSettlements(state).map(settlementExtractionDefinition);
}

export function materializeSettlementAuthority(state, seed) {
  const hubId = `hub:${seed.institution.siteId}`;
  const territoryId = `territory:${seed.institution.siteId}`;
  const holderId = `institution:${seed.institution.id}`;
  upsertPlace(state, {
    id: hubId, type: PLACE_TYPES.HUB, sourceId: seed.institution.siteId, name: seed.institution.name,
    parentPlaceId: territoryId, controllerInstitutionId: seed.institution.id,
  });
  if (seed.geography?.position) {
    upsertPlace(state, {
      id: territoryId, type: PLACE_TYPES.JURISDICTION, sourceId: seed.institution.siteId,
      name: `${seed.institution.name} Jurisdiction`, parentPlaceId: "system:first-reach",
      controllerInstitutionId: seed.institution.id,
      geometry: { kind: "hub-domain", center: { ...seed.geography.position }, radius: seed.geography.jurisdictionRadius },
    });
  }
  upsertAuthorityGrant(state, {
    id: `authority:${holderId}:mining:${hubId}`, holderId,
    powerType: POWER_TYPES.AUTHORIZE_WORK, jurisdictionType: PLACE_TYPES.HUB,
    jurisdictionId: hubId, status: "active",
    basisAssetId: `asset:${seed.institution.id}:mining-charter`,
    limits: { rightTypes: [RIGHT_TYPES.MINING], resourceFamilies: [...FOUNDATIONAL_EXTRACTION_FAMILIES] },
  });
  if (seed.geography?.position) {
    upsertAuthorityGrant(state, {
      id: `authority:${holderId}:govern:${territoryId}`, holderId,
      powerType: POWER_TYPES.AUTHORIZE_WORK, jurisdictionType: PLACE_TYPES.JURISDICTION,
      jurisdictionId: territoryId, status: "active",
      basisAssetId: `asset:${seed.institution.id}:territory-charter`,
      limits: { rightTypes: [RIGHT_TYPES.TRANSIT, RIGHT_TYPES.DOCKING, RIGHT_TYPES.MINING, RIGHT_TYPES.TRADE, RIGHT_TYPES.PATROL, RIGHT_TYPES.SALVAGE, RIGHT_TYPES.CONSTRUCTION] },
    });
  }
}

function createPopulationRecord(profile, now) {
  const needs = Object.fromEntries(profile.needIds.map((needId) => [needId, {
    needId, backlog: 0, lastDemandAt: now, purchased: 0, consumed: 0, unmetSince: null, spent: 0,
  }]));
  return {
    id: profile.id, name: profile.name, archetypeId: "population",
    hubInstitutionId: profile.hubInstitutionId, siteId: profile.siteId, size: profile.size,
    householdCash: profile.householdCash, householdCashCap: profile.householdCashCap,
    incomeAmount: profile.incomeAmount, incomeIntervalSeconds: profile.incomeIntervalSeconds,
    distressPolicy: profile.distressPolicy ? structuredClone(profile.distressPolicy) : null,
    emergencyDebt: 0, distressActive: false, lastIncomeAt: now, totalIncome: 0, totalSpent: 0, needs,
  };
}

function normalizeGeography(geography, institution) {
  return {
    id: geography.id ?? institution.siteId, name: geography.name ?? institution.name,
    type: geography.type ?? "hub", beaconId: geography.beaconId ?? `beacon-${institution.siteId}`,
    position: { ...geography.position }, radius: geography.radius ?? 44,
    interactionRadius: geography.interactionRadius ?? 185,
    jurisdictionRadius: geography.jurisdictionRadius ?? institution.protectionPolicy?.jurisdictionRadius ?? 1800,
    capabilities: [...(geography.capabilities ?? [])], services: [...(geography.services ?? [])],
  };
}

function mergeById(base, additions) {
  const records = new Map(base.map((record) => [record.id, record]));
  additions.forEach((record) => records.set(record.id, structuredClone(record)));
  return [...records.values()];
}

function deterministicUnit(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function titleCase(value) {
  return String(value).split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
