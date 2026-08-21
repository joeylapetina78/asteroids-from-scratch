import { FIRST_REACH_SETTLEMENTS } from "../content/economy/firstReachSettlements.js?v=fresh-20260820-2121-992690e";
import { PLACE_TYPES, POWER_TYPES, RIGHT_TYPES } from "./authorityModel.js?v=fresh-20260820-2121-992690e";
import { upsertAuthorityGrant } from "./authorityRegistry.js?v=fresh-20260820-2121-992690e";
import { upsertPlace } from "./placeRegistry.js?v=fresh-20260820-2121-992690e";
import { WORLD_SITES } from "./worldSites.js?v=fresh-20260820-2121-992690e";
import { listGeneratedSettlements } from "./settlementSeedPipeline.js?v=fresh-20260820-2121-992690e";

const MIN_TERRITORY_RADIUS = 1400;
const MAX_TERRITORY_RADIUS = 12000;
const NEIGHBOR_RADIUS_FACTOR = 0.52;
const VISITOR_APPROACH_RADIUS = 650;
const CLEARANCE_OFFICE_NAME = "Yard Exchange Travel Authority";
const TERRITORY_COLORS = Object.freeze({
  "yard-exchange": [62, 214, 255],
  "scrap-porch": [255, 145, 72],
  "the-ledge": [255, 211, 82],
  "blue-lantern": [117, 137, 255],
  "morrow-shoal": [83, 224, 156],
  "kiln-crossing": [255, 94, 112],
  "ore-station-one": [190, 118, 255],
  "coldwater-depot": [67, 157, 255],
  "deep-research": [236, 105, 207],
});

export const HUB_TERRITORY_RIGHTS = Object.freeze([
  RIGHT_TYPES.TRANSIT,
  RIGHT_TYPES.DOCKING,
  RIGHT_TYPES.MINING,
  RIGHT_TYPES.TRADE,
  RIGHT_TYPES.PATROL,
  RIGHT_TYPES.SALVAGE,
  RIGHT_TYPES.CONSTRUCTION,
  RIGHT_TYPES.ENFORCEMENT,
]);

// Territory is derived from settlement geography, not an authored circle used
// only by the overlay. Close neighbors meet at a nearest-hub boundary; isolated
// settlements retain a bounded jurisdiction and leave real frontier between them.
export const FIRST_REACH_HUB_TERRITORIES = Object.freeze(WORLD_SITES.map((site) => {
  const settlement = FIRST_REACH_SETTLEMENTS.find((candidate) => candidate.institution.siteId === site.id);
  const neighborDistance = WORLD_SITES
    .filter((candidate) => candidate.id !== site.id)
    .reduce((best, candidate) => Math.min(best, distance(site.position, candidate.position)), Infinity);
  return Object.freeze({
    id: `territory:${site.id}`,
    name: `${site.name} Jurisdiction`,
    siteId: site.id,
    hubInstitutionId: settlement?.institution.id ?? site.id,
    center: Object.freeze({ ...site.position }),
    radius: Math.min(MAX_TERRITORY_RADIUS, Math.max(MIN_TERRITORY_RADIUS, neighborDistance * NEIGHBOR_RADIUS_FACTOR)),
    visitorApproachRadius: Math.max(VISITOR_APPROACH_RADIUS, (site.interactionRadius ?? 180) * 3),
    visitorPolicy: "open-approach",
    color: Object.freeze([...(TERRITORY_COLORS[site.id] ?? [255, 110, 120])]),
    clearanceOfficeName: CLEARANCE_OFFICE_NAME,
  });
}));

export function getHubTerritories(state = null) {
  if (!state) return [...FIRST_REACH_HUB_TERRITORIES];
  const generated = listGeneratedSettlements(state)
    .filter((seed) => seed.geography?.position)
    .map((seed) => generatedTerritory(seed));
  return [...FIRST_REACH_HUB_TERRITORIES, ...generated];
}

export function getHubTerritory(territoryId, state = null) {
  return getHubTerritories(state).find((territory) => territory.id === territoryId || territory.siteId === territoryId) ?? null;
}

export function getHubTerritoryAt(position, state = null) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return getHubTerritories(state)
    .map((territory) => ({ territory, distance: distance(position, territory.center) }))
    .filter(({ territory, distance: fromHub }) => fromHub <= territory.radius)
    .sort((a, b) => (a.distance / a.territory.radius) - (b.distance / b.territory.radius) || a.distance - b.distance)[0]
    ?? null;
}

export function seedHubTerritories(state) {
  const territories = getHubTerritories(state);
  territories.forEach((territory) => {
    upsertPlace(state, {
      id: territory.id,
      type: PLACE_TYPES.JURISDICTION,
      name: territory.name,
      parentPlaceId: "system:first-reach",
      sourceId: territory.siteId,
      controllerInstitutionId: territory.hubInstitutionId,
      geometry: { kind: "nearest-hub-domain", center: { ...territory.center }, radius: territory.radius },
      visitorPolicy: territory.visitorPolicy,
      display: { color: [...territory.color], clearanceOfficeName: territory.clearanceOfficeName },
    });
    const holderId = `institution:${territory.hubInstitutionId}`;
    upsertAuthorityGrant(state, {
      id: `authority:${holderId}:govern:${territory.id}`,
      holderId,
      powerType: POWER_TYPES.AUTHORIZE_WORK,
      jurisdictionType: PLACE_TYPES.JURISDICTION,
      jurisdictionId: territory.id,
      status: "active",
      basisAssetId: `asset:${territory.hubInstitutionId}:territory-charter`,
      limits: { rightTypes: HUB_TERRITORY_RIGHTS.filter((right) => right !== RIGHT_TYPES.ENFORCEMENT) },
    });
    upsertAuthorityGrant(state, {
      id: `authority:${holderId}:enforce:${territory.id}`,
      holderId,
      powerType: POWER_TYPES.ENFORCE_RULES,
      jurisdictionType: PLACE_TYPES.JURISDICTION,
      jurisdictionId: territory.id,
      status: "active",
      basisAssetId: `asset:${territory.hubInstitutionId}:territory-charter`,
      limits: { rightTypes: [RIGHT_TYPES.ENFORCEMENT] },
    });
  });
  return territories;
}

export function ensurePlayerTerritoryRights(state) {
  state.legal ??= {};
  state.legal.operatingRights ??= {};
  state.legal.operatingRights.territories ??= { grants: [] };
  state.legal.operatingRights.territories.grants ??= [];
  return state.legal.operatingRights.territories;
}

export function grantPlayerTerritoryRights(state, { territoryId, rights, issuerId, basisDocumentId, at = Date.now() }) {
  const territory = getHubTerritory(territoryId, state);
  if (!territory || !rights?.length) return null;
  const record = ensurePlayerTerritoryRights(state);
  const normalizedRights = [...new Set(rights.filter((right) => HUB_TERRITORY_RIGHTS.includes(right)))];
  let grant = record.grants.find((candidate) => candidate.territoryId === territory.id);
  if (!grant) {
    grant = { territoryId: territory.id, siteId: territory.siteId, issuerId, rights: [], grantedAt: at, basisDocumentIds: [] };
    record.grants.push(grant);
  }
  grant.rights = [...new Set([...grant.rights, ...normalizedRights])];
  grant.updatedAt = at;
  if (basisDocumentId && !grant.basisDocumentIds.includes(basisDocumentId)) grant.basisDocumentIds.push(basisDocumentId);

  const holderId = state.character?.controlledPersonEntityId ?? "person:player";
  upsertAuthorityGrant(state, {
    id: `authority:${holderId}:territory-access:${territory.id}`,
    holderId,
    powerType: POWER_TYPES.AUTHORIZE_WORK,
    jurisdictionType: PLACE_TYPES.JURISDICTION,
    jurisdictionId: territory.id,
    grantedById: issuerId ? `institution:${issuerId.replace(/^institution:/, "")}` : null,
    basisDocumentId,
    status: "active",
    limits: { rightTypes: [...grant.rights] },
  });
  updatePilotLicenseEndorsement(state, grant, territory);
  return grant;
}

export function getPlayerTerritoryGrant(state, territoryId) {
  const territory = getHubTerritory(territoryId, state);
  return territory
    ? ensurePlayerTerritoryRights(state).grants.find((grant) => grant.territoryId === territory.id) ?? null
    : null;
}

export function evaluateTerritoryAccess(state, position, rightType) {
  const match = getHubTerritoryAt(position, state);
  if (!match) return { controlled: false, allowed: true, via: "frontier" };
  const { territory, distance: fromHub } = match;
  const grant = getPlayerTerritoryGrant(state, territory.id);
  if (grant?.rights?.includes(rightType)) {
    return { controlled: true, allowed: true, via: "territory-grant", territory, grant };
  }
  if ([RIGHT_TYPES.TRANSIT, RIGHT_TYPES.DOCKING].includes(rightType) && fromHub <= territory.visitorApproachRadius) {
    return { controlled: true, allowed: true, via: "visitor-approach", territory };
  }
  return { controlled: true, allowed: false, territory };
}

export function summarizePlayerTerritoryRights(state) {
  const grants = ensurePlayerTerritoryRights(state).grants;
  const workTerritories = grants.filter((grant) => grant.rights.includes(RIGHT_TYPES.MINING));
  return {
    grants,
    workTerritories,
    licenseClass: workTerritories.length > 0 ? "Regional Operator" : "Provisional · 90-Day",
    scopeLabel: workTerritories.length > 0 ? `${workTerritories.length} hub jurisdiction${workTerritories.length === 1 ? "" : "s"}` : "Visitor access",
    miningLabel: workTerritories.length > 0
      ? workTerritories.map((grant) => getHubTerritory(grant.territoryId, state)?.name?.replace(/ Jurisdiction$/, "")).filter(Boolean).join(", ")
      : "Rook Ind. RI-7A3",
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function generatedTerritory(seed) {
  const site = seed.geography;
  return {
    id: `territory:${site.id}`, name: `${seed.institution.name} Jurisdiction`, siteId: site.id,
    hubInstitutionId: seed.institution.id, center: { ...site.position },
    radius: site.jurisdictionRadius ?? seed.institution.protectionPolicy?.jurisdictionRadius ?? MIN_TERRITORY_RADIUS,
    visitorApproachRadius: Math.max(VISITOR_APPROACH_RADIUS, (site.interactionRadius ?? 180) * 3),
    visitorPolicy: "open-approach", color: generatedColor(seed.institution.id),
    clearanceOfficeName: `${seed.institution.name} Administration`,
  };
}

function generatedColor(id) {
  let hash = 0;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 31);
  return [90 + (hash >>> 0) % 150, 90 + (hash >>> 8) % 150, 90 + (hash >>> 16) % 150];
}

function updatePilotLicenseEndorsement(state, grant, territory) {
  const license = state.legal?.pilotLicense;
  if (!license?.licenseId) return;
  license.territorialEndorsements ??= [];
  const endorsement = {
    territoryId: territory.id,
    siteId: territory.siteId,
    rights: [...grant.rights],
    basisDocumentIds: [...grant.basisDocumentIds],
  };
  const existingIndex = license.territorialEndorsements.findIndex((entry) => entry.territoryId === territory.id);
  if (existingIndex >= 0) license.territorialEndorsements[existingIndex] = endorsement;
  else license.territorialEndorsements.push(endorsement);
  if (grant.rights.includes(RIGHT_TYPES.MINING)) {
    license.class = "regional-operator";
    license.displayClass = "Regional Operator";
  }

  const compatibility = state.legal.pilotLicenses?.[license.licenseId];
  if (compatibility) Object.assign(compatibility, {
    class: license.class,
    displayClass: license.displayClass,
    territorialEndorsements: structuredClone(license.territorialEndorsements),
  });
  const document = state.worldRecords?.documents?.[license.licenseId];
  if (document) {
    document.title = license.class === "regional-operator" ? "Regional Operator Authorization" : document.title;
    document.class = license.class ?? "provisional";
    document.territorialEndorsements = structuredClone(license.territorialEndorsements);
    document.updatedAt = Date.now();
  }
}
