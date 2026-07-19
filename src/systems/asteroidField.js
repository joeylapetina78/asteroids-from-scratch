import { createCommonAsteroid, createRandomAsteroid } from "../entities/Asteroid.js?v=fresh-20260719-1259-cb7d5ac";
import { createRandom, hashNumbers, randomRange } from "./random.js";
import { getResourceColor } from "./resourceDefinitions.js?v=fresh-20260719-1259-cb7d5ac";
import { getAmbientSurvivalResourceWeights } from "./resourceField.js?v=fresh-20260719-1259-cb7d5ac";
import { getChunkTerrainProfile } from "./worldTerrain.js?v=fresh-20260719-1259-cb7d5ac";

// Chunk-based asteroid streaming. The world is infinite: chunks are generated
// on-demand as the player moves and unloaded when they move away. The same
// chunk coordinates always produce the same asteroids (deterministic seed),
// so the field feels persistent even though most of it is not in memory.
const CHUNK_LOAD_RADIUS = 3;

export function createAsteroidChunks(canvas, resourceField) {
  const chunkSize = canvas.width;
  const loadedChunks = new Map(); // "cx,cy" â†’ Asteroid[]

  function toChunkCoords(worldX, worldY) {
    return [Math.floor(worldX / chunkSize), Math.floor(worldY / chunkSize)];
  }

  function makeKey(cx, cy) {
    return `${cx},${cy}`;
  }

  function generateChunk(cx, cy) {
    const chunkAsteroids = [];
    const seed = hashNumbers(42, cx, cy);
    const random = createRandom(seed);
    const centerX = cx * chunkSize;
    const centerY = cy * chunkSize;
    const profile = resourceField.getProfile(centerX, centerY);
    const terrain = getChunkTerrainProfile(centerX, centerY);
    const asteroidCount = clampCount(
      getAsteroidCount(profile.density * terrain.densityMultiplier, random, terrain.resourceMultiplier, terrain.minResourceCount ?? 0),
      terrain.minResourceCount ?? 0,
      terrain.maxResourceCount ?? Infinity,
    );
    const commonCount = clampCount(
      getCommonAsteroidCount(profile.density * terrain.densityMultiplier, profile.commonRockBias, random, terrain.commonMultiplier, terrain.minCommonCount ?? 1),
      terrain.minCommonCount ?? 1,
      terrain.maxCommonCount ?? Infinity,
    );
    const clusters = createTerrainClusters(centerX, centerY, chunkSize, terrain, random);

    for (let i = 0; i < asteroidCount; i++) {
      const position = getTerrainPosition({ centerX, centerY, chunkSize, terrain, clusters, random, index: i, count: asteroidCount });
      const asteroid = createRandomAsteroid(position.x, position.y, resourceField.getProfile(position.x, position.y), hashNumbers(seed, i));
      tuneAsteroidForTerrain(asteroid, terrain, random);
      chunkAsteroids.push(asteroid);
    }

    for (let i = 0; i < commonCount; i++) {
      const position = getTerrainPosition({ centerX, centerY, chunkSize, terrain, clusters, random, index: i, count: commonCount });
      const asteroid = createCommonAsteroid(position.x, position.y, hashNumbers(seed, 1000 + i));
      tuneAsteroidForTerrain(asteroid, terrain, random);
      chunkAsteroids.push(asteroid);
    }

    createAmbientSurvivalDeposits({ centerX, centerY, chunkSize, terrain, tags: profile.tags, random, seed })
      .forEach((asteroid) => chunkAsteroids.push(asteroid));

    return chunkAsteroids;
  }

  // Call once per frame with the player's world position. Returns asteroids to
  // add to the live array and a Set of asteroids to remove. The caller (game.js)
  // owns the live array and applies the diff itself so it can manage fragments
  // and other dynamic asteroids independently.
  function update(shipX, shipY) {
    const [playerCX, playerCY] = toChunkCoords(shipX, shipY);
    const added = [];
    const removedSet = new Set();

    for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
      for (let dy = -CHUNK_LOAD_RADIUS; dy <= CHUNK_LOAD_RADIUS; dy++) {
        const key = makeKey(playerCX + dx, playerCY + dy);

        if (!loadedChunks.has(key)) {
          const chunkAsteroids = generateChunk(playerCX + dx, playerCY + dy);
          loadedChunks.set(key, chunkAsteroids);
          added.push(...chunkAsteroids);
        }
      }
    }

    const toUnload = [];

    for (const [key] of loadedChunks) {
      const [cx, cy] = key.split(",").map(Number);

      if (Math.abs(cx - playerCX) > CHUNK_LOAD_RADIUS || Math.abs(cy - playerCY) > CHUNK_LOAD_RADIUS) {
        toUnload.push(key);
      }
    }

    for (const key of toUnload) {
      loadedChunks.get(key).forEach((a) => removedSet.add(a));
      loadedChunks.delete(key);
    }

    return { added, removedSet };
  }

  return { update };
}

function getAsteroidCount(density, random, multiplier = 1, minimum = 0) {
  const baseCount = getBaseAsteroidCount(density, random);
  return Math.max(minimum, Math.round(baseCount * multiplier));
}

function getBaseAsteroidCount(density, random) {
  if (density < 0.3) {
    return random() < 0.55 ? 1 : 0;
  }

  if (density < 0.55) {
    return 1 + Math.floor(random() * 3);
  }

  if (density < 0.78) {
    return 3 + Math.floor(random() * 3);
  }

  return 5 + Math.floor(random() * 5);
}

function getCommonAsteroidCount(density, commonRockBias, random, multiplier = 1, minimum = 1) {
  const baseCount = 6 + Math.floor(random() * 7);
  const densityBonus = Math.floor(density * 12);
  const biasedCount = (baseCount + densityBonus) * commonRockBias * multiplier;

  return Math.max(minimum, Math.round(biasedCount));
}

function clampCount(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function createTerrainClusters(centerX, centerY, chunkSize, terrain, random) {
  const spread = terrain.clusterSpread ?? 0.28;

  return Array.from({ length: terrain.clusterCount }, () => ({
    x: centerX + randomRange(random, -chunkSize * spread, chunkSize * spread),
    y: centerY + randomRange(random, -chunkSize * spread, chunkSize * spread),
  }));
}

function getTerrainPosition({ centerX, centerY, chunkSize, terrain, clusters, random, index, count }) {
  if (terrain.id === "cluster-pocket") {
    const cluster = clusters[index % clusters.length];
    return {
      x: cluster.x + randomRange(random, -chunkSize * terrain.spread, chunkSize * terrain.spread),
      y: cluster.y + randomRange(random, -chunkSize * terrain.spread, chunkSize * terrain.spread),
    };
  }

  if (terrain.id === "stone-wall" || terrain.id === "debris-stream") {
    const progress = count <= 1 ? 0.5 : index / (count - 1);
    const along = (progress - 0.5) * chunkSize * 0.92 + randomRange(random, -chunkSize * 0.06, chunkSize * 0.06);
    const curve = Math.sin(progress * Math.PI * 2 + terrain.phase) * chunkSize * (terrain.id === "stone-wall" ? 0.14 : 0.06);
    const across = curve + randomRange(random, -chunkSize * terrain.spread, chunkSize * terrain.spread) * terrain.jitter;
    const axis = { x: Math.cos(terrain.orientation), y: Math.sin(terrain.orientation) };
    const normal = { x: -axis.y, y: axis.x };

    return {
      x: centerX + axis.x * along + normal.x * across,
      y: centerY + axis.y * along + normal.y * across,
    };
  }

  if (terrain.id === "maze-corridor") {
    const pairIndex = Math.floor(index / 2);
    const pairCount = Math.max(1, Math.ceil(count / 2));
    const progress = pairCount <= 1 ? 0.5 : pairIndex / (pairCount - 1);
    const side = index % 2 === 0 ? -1 : 1;
    const along = (progress - 0.5) * chunkSize * 1.08 + randomRange(random, -chunkSize * 0.045, chunkSize * 0.045);
    const curve = Math.sin(progress * Math.PI * 2 + terrain.phase) * chunkSize * 0.12;
    const laneHalfWidth = chunkSize * 0.18;
    const across = curve + side * laneHalfWidth + randomRange(random, -chunkSize * terrain.spread, chunkSize * terrain.spread) * terrain.jitter;
    const axis = { x: Math.cos(terrain.orientation), y: Math.sin(terrain.orientation) };
    const normal = { x: -axis.y, y: axis.x };

    return {
      x: centerX + axis.x * along + normal.x * across,
      y: centerY + axis.y * along + normal.y * across,
    };
  }

  return {
    x: centerX + randomRange(random, -chunkSize * terrain.spread, chunkSize * terrain.spread),
    y: centerY + randomRange(random, -chunkSize * terrain.spread, chunkSize * terrain.spread),
  };
}

function tuneAsteroidForTerrain(asteroid, terrain, random) {
  const scale = terrain.sizeScale * randomRange(random, 0.88, 1.12);

  asteroid.radius *= scale;
  asteroid.tier = getTerrainTierForRadius(asteroid.radius);
  asteroid.points = asteroid.points.map((point) => ({
    ...point,
    distance: point.distance * scale,
  }));
  asteroid.velocity.x *= terrain.driftScale;
  asteroid.velocity.y *= terrain.driftScale;

  if (terrain.id === "debris-stream") {
    const streamSpeed = randomRange(random, 12, 30);
    asteroid.velocity.x += Math.cos(terrain.orientation) * streamSpeed;
    asteroid.velocity.y += Math.sin(terrain.orientation) * streamSpeed;
  }
}

function getTerrainTierForRadius(radius) {
  if (radius >= 62) {
    return 3;
  }

  if (radius >= 28) {
    return 2;
  }

  return 1;
}

function createAmbientSurvivalDeposits({ centerX, centerY, chunkSize, terrain, tags, random, seed }) {
  const chance = getAmbientDepositChance(terrain);
  const depositCount = random() < chance ? 1 + (random() < 0.12 ? 1 : 0) : 0;
  const weights = getAmbientSurvivalResourceWeights(tags);
  const deposits = [];

  for (let index = 0; index < depositCount; index += 1) {
    const type = weightedPick(weights, random);
    const x = centerX + randomRange(random, -chunkSize * 0.42, chunkSize * 0.42);
    const y = centerY + randomRange(random, -chunkSize * 0.42, chunkSize * 0.42);
    const asteroid = createRandomAsteroid(x, y, {
      color: getResourceColor(type),
      resources: { stone: 0.04, [type]: 0.96 },
      richness: 0,
    }, hashNumbers(seed, 7000 + index));

    // These are grab-and-go travel deposits: recognizably colored, but smaller
    // than a field's main ore bodies and quick to break into useful units.
    scaleAsteroid(asteroid, randomRange(random, 0.36, 0.5));
    asteroid.tier = 1;
    asteroid.isSurvivalDeposit = true;
    deposits.push(asteroid);
  }

  return deposits;
}

function getAmbientDepositChance(terrain) {
  if (terrain.id === "sparse-dead") return 0.1;
  if (terrain.id === "cluster-pocket") return 0.42;
  if (terrain.id === "debris-stream") return 0.38;
  return 0.32;
}

function weightedPick(weights, random) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;

  for (const [resourceId, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return resourceId;
  }

  return entries[0][0];
}

function scaleAsteroid(asteroid, scale) {
  asteroid.radius *= scale;
  asteroid.points = asteroid.points.map((point) => ({
    ...point,
    distance: point.distance * scale,
  }));
  asteroid.velocity.x *= 0.7;
  asteroid.velocity.y *= 0.7;
}
