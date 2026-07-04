import { createRandom, hashNumbers } from "./random.js";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260704-0155-737ee43";

// Terrain is the flight-feel layer. Zones say what kind of place this is;
// terrain says how a chunk should arrange rocks inside that place.
const TERRAIN_ARCHETYPES = {
  "open-drift": {
    id: "open-drift",
    name: "Open Drift",
    densityMultiplier: 0.5,
    commonMultiplier: 0.45,
    resourceMultiplier: 0.65,
    sizeScale: 0.88,
    driftScale: 0.95,
    spread: 0.72,
    clusterCount: 1,
    minCommonCount: 0,
    maxCommonCount: 4,
    maxResourceCount: 2,
  },
  "cluster-pocket": {
    id: "cluster-pocket",
    name: "Cluster Pocket",
    densityMultiplier: 1.25,
    commonMultiplier: 0.95,
    resourceMultiplier: 1.15,
    sizeScale: 1,
    driftScale: 0.75,
    spread: 0.08,
    clusterCount: 3,
    clusterSpread: 0.34,
    minCommonCount: 2,
    maxCommonCount: 8,
    maxResourceCount: 4,
  },
  "stone-wall": {
    id: "stone-wall",
    name: "Stone Wall",
    densityMultiplier: 1.6,
    commonMultiplier: 1.15,
    resourceMultiplier: 0.85,
    sizeScale: 1.14,
    driftScale: 0.5,
    spread: 0.045,
    clusterCount: 1,
    minCommonCount: 4,
    maxCommonCount: 10,
    maxResourceCount: 3,
  },
  "maze-corridor": {
    id: "maze-corridor",
    name: "Maze Corridor",
    densityMultiplier: 1.5,
    commonMultiplier: 1.1,
    resourceMultiplier: 0.8,
    sizeScale: 1.08,
    driftScale: 0.45,
    spread: 0.035,
    clusterCount: 1,
    minCommonCount: 5,
    maxCommonCount: 12,
    maxResourceCount: 3,
  },
  "debris-stream": {
    id: "debris-stream",
    name: "Debris Stream",
    densityMultiplier: 1.1,
    commonMultiplier: 0.75,
    resourceMultiplier: 0.9,
    sizeScale: 0.72,
    driftScale: 2.25,
    spread: 0.035,
    clusterCount: 1,
    minCommonCount: 3,
    maxCommonCount: 10,
    maxResourceCount: 3,
  },
  "giant-garden": {
    id: "giant-garden",
    name: "Giant Garden",
    densityMultiplier: 0.45,
    commonMultiplier: 0.28,
    resourceMultiplier: 0.35,
    sizeScale: 1.9,
    driftScale: 0.28,
    spread: 0.62,
    clusterCount: 1,
    minCommonCount: 1,
    maxCommonCount: 4,
    maxResourceCount: 1,
  },
  "sparse-dead": {
    id: "sparse-dead",
    name: "Sparse Dead",
    densityMultiplier: 0.15,
    commonMultiplier: 0.08,
    resourceMultiplier: 0.12,
    sizeScale: 0.85,
    driftScale: 0.35,
    spread: 0.85,
    clusterCount: 1,
    minCommonCount: 0,
    maxCommonCount: 2,
    maxResourceCount: 1,
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
    "open-drift": 1.1,
    "cluster-pocket": 0.45,
    "stone-wall": 0.25,
    "maze-corridor": 0.15,
    "debris-stream": 0.2,
    "giant-garden": 0.15,
    "sparse-dead": 0.1,
  };

  for (const id of Object.keys(TERRAIN_ARCHETYPES)) {
    if (tags.has(id)) {
      scores[id] += 4;
    }
  }

  if (tags.has("sparse") || tags.has("low-resource")) {
    scores["sparse-dead"] += 3.2;
    scores["open-drift"] += 1;
  }

  if (tags.has("dense-rocks") || zoneProfile.asteroidDensityMultiplier > 1.25) {
    scores["maze-corridor"] += 2.2;
    scores["stone-wall"] += 1.8;
    scores["cluster-pocket"] += 0.8;
  }

  if (tags.has("scrap") || zoneProfile.scrapBias > 1) {
    scores["debris-stream"] += 2.6;
    scores["cluster-pocket"] += 0.5;
  }

  if (tags.has("ancient") || tags.has("carbonaceous")) {
    scores["giant-garden"] += 2.6;
    scores["cluster-pocket"] += 0.5;
  }

  if (tags.has("volatile") || tags.has("scanner-interest")) {
    scores["open-drift"] += 0.7;
    scores["cluster-pocket"] += 1.2;
  }

  if (tags.has("metallic") || tags.has("industrial")) {
    scores["stone-wall"] += 1.1;
    scores["maze-corridor"] += 0.8;
  }

  if (tags.has("starter") || tags.has("safe") || tags.has("open-space")) {
    scores["open-drift"] += 1.5;
  }

  if (tags.has("navigation-hazard")) {
    scores["maze-corridor"] += 1.1;
    scores["sparse-dead"] += 0.7;
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
