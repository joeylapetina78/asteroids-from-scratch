import { createRandom, hashNumbers } from "./random.js";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260703-2223-8e8c574";

// Terrain is the flight-feel layer. Zones say what kind of place this is;
// terrain says how a chunk should arrange rocks inside that place.
const TERRAIN_ARCHETYPES = {
  "open-drift": {
    id: "open-drift",
    name: "Open Drift",
    densityMultiplier: 0.85,
    commonMultiplier: 0.9,
    resourceMultiplier: 0.9,
    sizeScale: 0.95,
    driftScale: 0.85,
    spread: 0.48,
    clusterCount: 1,
  },
  "cluster-pocket": {
    id: "cluster-pocket",
    name: "Cluster Pocket",
    densityMultiplier: 1.15,
    commonMultiplier: 1.05,
    resourceMultiplier: 1.15,
    sizeScale: 1,
    driftScale: 0.75,
    spread: 0.2,
    clusterCount: 3,
  },
  "stone-wall": {
    id: "stone-wall",
    name: "Stone Wall",
    densityMultiplier: 1.35,
    commonMultiplier: 1.25,
    resourceMultiplier: 0.95,
    sizeScale: 1.05,
    driftScale: 0.55,
    spread: 0.13,
    clusterCount: 1,
  },
  "debris-stream": {
    id: "debris-stream",
    name: "Debris Stream",
    densityMultiplier: 1.1,
    commonMultiplier: 0.95,
    resourceMultiplier: 1.05,
    sizeScale: 0.82,
    driftScale: 1.8,
    spread: 0.1,
    clusterCount: 1,
  },
  "giant-garden": {
    id: "giant-garden",
    name: "Giant Garden",
    densityMultiplier: 0.75,
    commonMultiplier: 0.75,
    resourceMultiplier: 0.9,
    sizeScale: 1.45,
    driftScale: 0.35,
    spread: 0.42,
    clusterCount: 1,
  },
  "sparse-dead": {
    id: "sparse-dead",
    name: "Sparse Dead",
    densityMultiplier: 0.38,
    commonMultiplier: 0.45,
    resourceMultiplier: 0.5,
    sizeScale: 0.9,
    driftScale: 0.45,
    spread: 0.5,
    clusterCount: 1,
  },
};

export function getChunkTerrainProfile(x, y) {
  const zoneProfile = getZoneProfile(x, y);
  const random = createRandom(hashNumbers(Math.floor(x / 64), Math.floor(y / 64), 9109));
  const selectedId = pickTerrainArchetype(zoneProfile, random);
  const archetype = TERRAIN_ARCHETYPES[selectedId] ?? TERRAIN_ARCHETYPES["open-drift"];

  return {
    ...archetype,
    zoneProfile,
    orientation: random() * Math.PI * 2,
    phase: random() * Math.PI * 2,
    jitter: 0.75 + random() * 0.5,
  };
}

function pickTerrainArchetype(zoneProfile, random) {
  const tags = new Set(zoneProfile.tags ?? []);
  const scores = {
    "open-drift": 1,
    "cluster-pocket": 0.8,
    "stone-wall": 0.45,
    "debris-stream": 0.45,
    "giant-garden": 0.35,
    "sparse-dead": 0.25,
  };

  if (tags.has("sparse") || tags.has("low-resource")) {
    scores["sparse-dead"] += 3.5;
    scores["open-drift"] += 0.8;
  }

  if (tags.has("dense-rocks") || zoneProfile.asteroidDensityMultiplier > 1.25) {
    scores["stone-wall"] += 1.4;
    scores["cluster-pocket"] += 1.3;
  }

  if (tags.has("scrap") || zoneProfile.scrapBias > 1) {
    scores["debris-stream"] += 1.7;
    scores["cluster-pocket"] += 0.7;
  }

  if (tags.has("ancient") || tags.has("carbonaceous")) {
    scores["giant-garden"] += 1.8;
    scores["cluster-pocket"] += 0.5;
  }

  if (tags.has("volatile") || tags.has("scanner-interest")) {
    scores["open-drift"] += 0.6;
    scores["cluster-pocket"] += 0.9;
  }

  return weightedPick(scores, random);
}

function weightedPick(scores, random) {
  const entries = Object.entries(scores);
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0);
  let roll = random() * total;

  for (const [id, value] of entries) {
    roll -= Math.max(0, value);

    if (roll <= 0) {
      return id;
    }
  }

  return entries.at(-1)?.[0] ?? "open-drift";
}
