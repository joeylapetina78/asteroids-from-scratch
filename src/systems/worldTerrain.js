import { createRandom, hashNumbers } from "./random.js";
import { createValueNoise } from "./valueNoise.js";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260721-2114-33b9943";

// A coherent procedural terrain-character field. Low-frequency noise carves
// broad belts of navigation mood across ALL of space — thick mazes, cluster
// fields, open drifts, sparse patches — so The Black and every unauthored
// chunk gets real flight variety instead of collapsing to flat open drift.
// Because the noise is smooth, neighboring chunks agree, so formations read as
// coherent belts (with lanes, dead ends, and pockets between them) rather than
// per-chunk static. Authored zones layer their tag bonuses on top of this and
// still win locally.
const terrainNoise = createValueNoise(48221);

function terrainField(x, y, offsetX, offsetY, scale) {
  return terrainNoise(x + offsetX, y + offsetY, scale) * 0.7
    + terrainNoise(x + offsetX + 400, y + offsetY - 900, scale * 0.45) * 0.3;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// The broad "mood" of a location. density = how packed the space is; structure
// = how linear it runs (walls, corridors, streams) vs how blobby (clusters,
// gardens, open drift). Sampled at low frequency so a mood spans many chunks.
function getProceduralTerrainScores(x, y) {
  const density = terrainField(x, y, 5000, -3100, 5000);
  const structure = terrainField(x, y, -8100, 6400, 6200);
  const patch = terrainField(x, y, 12000, 900, 2400);

  const thick = clamp01((density - 0.34) / 0.4);
  const sparse = clamp01((0.44 - density) / 0.34);
  const linear = clamp01((structure - 0.42) / 0.34);
  const blobby = clamp01((0.56 - structure) / 0.34);

  return {
    "open-drift": 0.55 + sparse * 1.1 + blobby * 0.35,
    "cluster-pocket": 0.35 + blobby * (0.5 + density) * 1.7,
    "stone-wall": 0.12 + thick * linear * 2.6,
    "maze-corridor": 0.1 + thick * linear * 2.1 + thick * patch * 0.5,
    "debris-stream": 0.2 + linear * (0.45 + density * 0.6) * 1.3,
    "giant-garden": 0.08 + blobby * sparse * 0.9,
    "sparse-dead": 0.04 + sparse * sparse * 1.1,
  };
}

// Terrain is the flight-feel layer. Zones say what kind of place this is;
// terrain says how a chunk should arrange rocks inside that place.
const TERRAIN_ARCHETYPES = {
  "open-drift": {
    id: "open-drift",
    name: "Open Drift",
    densityMultiplier: 0.75,
    commonMultiplier: 0.7,
    resourceMultiplier: 0.9,
    sizeScale: 0.88,
    driftScale: 0.95,
    spread: 0.72,
    clusterCount: 1,
    minCommonCount: 1,
    maxCommonCount: 10,
    maxResourceCount: 4,
  },
  "cluster-pocket": {
    id: "cluster-pocket",
    name: "Cluster Pocket",
    densityMultiplier: 1.8,
    commonMultiplier: 1.3,
    resourceMultiplier: 1.5,
    sizeScale: 1,
    driftScale: 0.75,
    spread: 0.08,
    clusterCount: 3,
    clusterSpread: 0.34,
    minCommonCount: 4,
    maxCommonCount: 20,
    maxResourceCount: 8,
  },
  "stone-wall": {
    id: "stone-wall",
    name: "Stone Wall",
    densityMultiplier: 2.2,
    commonMultiplier: 1.5,
    resourceMultiplier: 1.1,
    sizeScale: 1.14,
    driftScale: 0.5,
    spread: 0.045,
    clusterCount: 1,
    minCommonCount: 8,
    maxCommonCount: 24,
    maxResourceCount: 6,
  },
  "maze-corridor": {
    id: "maze-corridor",
    name: "Maze Corridor",
    densityMultiplier: 2.0,
    commonMultiplier: 1.4,
    resourceMultiplier: 1.0,
    sizeScale: 1.08,
    driftScale: 0.45,
    spread: 0.035,
    clusterCount: 1,
    minCommonCount: 10,
    maxCommonCount: 28,
    maxResourceCount: 6,
  },
  "debris-stream": {
    id: "debris-stream",
    name: "Debris Stream",
    densityMultiplier: 1.5,
    commonMultiplier: 1.1,
    resourceMultiplier: 1.1,
    sizeScale: 0.72,
    driftScale: 2.25,
    spread: 0.035,
    clusterCount: 1,
    minCommonCount: 5,
    maxCommonCount: 18,
    maxResourceCount: 5,
  },
  "giant-garden": {
    id: "giant-garden",
    name: "Giant Garden",
    densityMultiplier: 0.6,
    commonMultiplier: 0.4,
    resourceMultiplier: 0.5,
    sizeScale: 1.9,
    driftScale: 0.28,
    spread: 0.62,
    clusterCount: 1,
    minCommonCount: 2,
    maxCommonCount: 8,
    maxResourceCount: 3,
  },
  "sparse-dead": {
    id: "sparse-dead",
    name: "Sparse Dead",
    densityMultiplier: 0.2,
    commonMultiplier: 0.12,
    resourceMultiplier: 0.15,
    sizeScale: 0.85,
    driftScale: 0.35,
    spread: 0.85,
    clusterCount: 1,
    minCommonCount: 0,
    maxCommonCount: 3,
    maxResourceCount: 1,
  },
};

export function getChunkTerrainProfile(x, y) {
  const zoneProfile = getZoneProfile(x, y);
  const random = createRandom(hashNumbers(Math.floor(x / 64), Math.floor(y / 64), 9109));
  const selectedId = pickTerrainArchetype(zoneProfile, random, x, y);
  const archetype = TERRAIN_ARCHETYPES[selectedId] ?? TERRAIN_ARCHETYPES["open-drift"];

  return {
    ...archetype,
    zoneProfile,
    orientation: random() * Math.PI * 2,
    phase: random() * Math.PI * 2,
    jitter: 0.75 + random() * 0.5,
  };
}

function pickTerrainArchetype(zoneProfile, random, x, y) {
  const tags = new Set(zoneProfile.tags ?? []);
  // Start from the procedural mood of this location, then let authored zone
  // tags push their character on top of it.
  const scores = getProceduralTerrainScores(x, y);

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

  // Authored safe/starter space stays deliberately open. "open-space" is the
  // default-everywhere tag, so it is intentionally NOT here — unauthored space
  // now takes its variety from the procedural field above.
  if (tags.has("starter") || tags.has("safe")) {
    scores["open-drift"] += 1.5;
  }

  if (tags.has("navigation-hazard")) {
    scores["maze-corridor"] += 1.1;
    scores["sparse-dead"] += 0.7;
  }

  // Sharpen before picking so the dominant mood usually wins and a belt stays
  // coherent across chunks, while lower-scoring archetypes still occasionally
  // break through to make organic pockets and edges rather than hard borders.
  const sharpened = Object.fromEntries(
    Object.entries(scores).map(([id, value]) => [id, Math.pow(Math.max(0, value), 2.4)]),
  );

  return weightedPick(sharpened, random);
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
