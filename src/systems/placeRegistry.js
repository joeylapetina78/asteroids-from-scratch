import { PLACE_TYPES } from "./authorityModel.js?v=fresh-20260707-flash4";
import { ensureWorldRecords } from "./worldRecords.js?v=fresh-20260707-flash4";

export function upsertPlace(state, place) {
  const records = ensureWorldRecords(state);
  records.places[place.id] = {
    ...(records.places[place.id] ?? {}),
    ...place,
    updatedAt: Date.now(),
  };
  return records.places[place.id];
}

export function getPlace(state, placeId) {
  return ensureWorldRecords(state).places[placeId] ?? null;
}

export function getPlaceLineage(state, placeId) {
  const lineage = [];
  let current = getPlace(state, placeId);
  const visited = new Set();

  while (current && !visited.has(current.id)) {
    lineage.push(current);
    visited.add(current.id);
    current = current.parentPlaceId ? getPlace(state, current.parentPlaceId) : null;
  }

  return lineage;
}

export function isSameOrChildPlace(state, childPlaceId, parentPlaceId) {
  if (!childPlaceId || !parentPlaceId) {
    return false;
  }

  return getPlaceLineage(state, childPlaceId).some((place) => place.id === parentPlaceId);
}

export function ensureRegionPlace(state, region) {
  return upsertPlace(state, {
    id: `region:${region.id}`,
    type: PLACE_TYPES.REGION,
    sourceId: region.id,
    name: region.name,
    parentPlaceId: "system:first-reach",
    tags: [...(region.tags ?? [])],
  });
}
