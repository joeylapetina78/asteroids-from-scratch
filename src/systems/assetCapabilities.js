import { INSTITUTION_ARCHETYPES } from "../content/institutions/institutionArchetypes.js?v=fresh-20260820-0654-6716a5f";
import { getAssetArchetype } from "../content/assets/assetArchetypes.js?v=fresh-20260820-0654-6716a5f";
import { ACTOR_ROLE, getActorRecord, listActors } from "./actorRegistry.js?v=fresh-20260820-0654-6716a5f";

// A capability portfolio is a projection, never a second owner of state.
// Domain systems keep their ships, factories and facilities. Sources expose
// live references to those records and this module explains what those assets
// let their controller do.

const BUILT_IN_ASSET_SOURCES = Object.freeze([
  {
    id: "inline-actor-assets",
    collect: (state) => listActors(state, { role: ACTOR_ROLE.INSTITUTION })
      .flatMap(({ id, record }) => (record.assets ?? []).map((asset) => ({ ...asset, ownerActorId: asset.ownerActorId ?? id }))),
  },
  {
    id: "industrial-factories",
    collect: (state) => Object.values(state.industrial?.factories ?? {}).map((factory) => ({
      id: factory.id,
      name: factory.name,
      archetypeId: "parts-factory",
      ownerActorId: factory.institutionId,
      status: factory.status,
      sourceRecord: factory,
      scope: { recipes: structuredClone(factory.recipes ?? []) },
    })),
  },
  {
    id: "mining-craft",
    collect: (state) => listActors(state, { role: ACTOR_ROLE.SHIP })
      .filter(({ record }) => record.ownerInstitutionId)
      .map(({ id, record }) => ({
        id,
        name: record.name,
        archetypeId: "mining-craft",
        ownerActorId: record.ownerInstitutionId,
        status: record.status,
        sourceRecord: record,
      })),
  },
  {
    id: "freight-craft",
    collect: (state) => Object.entries(state.logistics?.haulers ?? {}).map(([physicalId, hauler]) => {
      const ship = state.logistics?.institutions?.[hauler.shipInstitutionId];
      return {
        id: ship?.id ?? `asset:${physicalId}`,
        name: ship?.name ?? physicalId,
        archetypeId: "freight-craft",
        ownerActorId: hauler.carrierInstitutionId,
        status: hauler.status,
        sourceRecord: ship ?? hauler,
        scope: { physicalId, cargoCapacity: ship?.cargoCapacity ?? null },
      };
    }),
  },
  {
    id: "sprc-facilities",
    collect: (state) => Object.values(state.sprc?.facilities ?? {}).map((facility) => ({
      id: facility.id,
      name: facility.name,
      archetypeId: facility.facilityType === "repair-berth" ? "repair-facility" : facility.facilityType,
      ownerActorId: state.sprc?.institution?.ownerInstitutionId ?? state.sprc?.institution?.id,
      status: facility.status,
      sourceRecord: facility,
    })),
  },
]);

function registry(state) {
  state.assetCapabilityRegistry ??= { sources: {} };
  state.assetCapabilityRegistry.sources ??= {};
  return state.assetCapabilityRegistry;
}

// A future domain plugs its assets into the NPC API here. The function is kept
// on transient state and is intentionally not part of the save payload.
export function registerAssetSource(state, id, collect) {
  if (!state || !id || typeof collect !== "function") return;
  registry(state).sources[id] = collect;
}

export function unregisterAssetSource(state, id) {
  delete registry(state).sources[id];
}

export function listAssetSources(state) {
  return [...BUILT_IN_ASSET_SOURCES.map(({ id }) => id), ...Object.keys(registry(state).sources)];
}

export function listAssets(state, { ownerActorId = null, archetypeId = null, activeOnly = true } = {}) {
  const sources = [
    ...BUILT_IN_ASSET_SOURCES,
    ...Object.entries(registry(state).sources).map(([id, collect]) => ({ id, collect })),
  ];
  const seen = new Set();
  return sources.flatMap((source) => {
    try {
      return source.collect(state) ?? [];
    } catch (error) {
      console.warn(`[assetCapabilities] source '${source.id}' failed: ${error.message}`);
      return [];
    }
  }).filter((asset) => {
    if (!asset?.id || seen.has(asset.id)) return false;
    seen.add(asset.id);
    if (ownerActorId && asset.ownerActorId !== ownerActorId) return false;
    if (archetypeId && asset.archetypeId !== archetypeId) return false;
    if (activeOnly && ["destroyed", "revoked", "expired", "offline"].includes(asset.status)) return false;
    return true;
  });
}

function normalizeGrant(grant, source) {
  const record = typeof grant === "string" ? { id: grant } : grant;
  return { ...record, source };
}

export function getAssetCapabilities(asset) {
  const archetype = getAssetArchetype(asset?.archetypeId);
  return [
    ...(archetype?.capabilities ?? []).map((grant) => normalizeGrant(grant, {
      kind: "asset-archetype", id: archetype.id, assetId: asset.id,
    })),
    ...(asset?.capabilities ?? []).map((grant) => normalizeGrant(grant, {
      kind: "asset-instance", id: asset.id, assetId: asset.id,
    })),
  ].map((grant) => ({
    ...grant,
    scope: { ...(asset?.scope ?? {}), ...(grant.scope ?? {}) },
  }));
}

export function getActorCapabilityPortfolio(state, actorId) {
  const actor = getActorRecord(state, actorId);
  if (!actor) return { actorId, found: false, assets: [], capabilities: [], offerTypes: [] };
  const archetype = INSTITUTION_ARCHETYPES[actor.archetypeId] ?? null;
  const assets = listAssets(state, { ownerActorId: actorId });
  const capabilities = [
    ...(archetype?.capabilities ?? []).map((grant) => normalizeGrant(grant, {
      kind: "actor-archetype", id: actor.archetypeId, assetId: null,
    })),
    ...assets.flatMap(getAssetCapabilities),
  ];
  const offerTypes = new Set(archetype?.offerTypes ?? []);
  assets.forEach((asset) => {
    const assetArchetype = getAssetArchetype(asset.archetypeId);
    (assetArchetype?.offerTypes ?? []).forEach((type) => offerTypes.add(type));
    (asset.offerTypes ?? []).forEach((type) => offerTypes.add(type));
  });
  return { actorId, found: true, assets, capabilities, offerTypes: [...offerTypes] };
}

export function getActorCapabilities(state, actorId, capabilityId = null) {
  const capabilities = getActorCapabilityPortfolio(state, actorId).capabilities;
  return capabilityId ? capabilities.filter((grant) => grant.id === capabilityId) : capabilities;
}

export function actorHasCapability(state, actorId, capabilityId, predicate = null) {
  return getActorCapabilities(state, actorId, capabilityId)
    .some((grant) => !predicate || predicate(grant.scope ?? {}, grant));
}
