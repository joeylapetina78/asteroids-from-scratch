import { createCommonAsteroid, createRandomAsteroid } from "../entities/Asteroid.js?v=family-shapes-v1";
import { createRandom, hashNumbers, randomRange } from "./random.js";

// Chunk-based asteroid streaming. The world is infinite: chunks are generated
// on-demand as the player moves and unloaded when they move away. The same
// chunk coordinates always produce the same asteroids (deterministic seed),
// so the field feels persistent even though most of it is not in memory.
const CHUNK_LOAD_RADIUS = 3;

export function createAsteroidChunks(canvas, resourceField) {
  const chunkSize = canvas.width;
  const loadedChunks = new Map(); // "cx,cy" → Asteroid[]

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
    const asteroidCount = getAsteroidCount(profile.density, random);
    const commonCount = getCommonAsteroidCount(profile.density, profile.commonRockBias, random);

    for (let i = 0; i < asteroidCount; i++) {
      const x = centerX + randomRange(random, -chunkSize * 0.42, chunkSize * 0.42);
      const y = centerY + randomRange(random, -chunkSize * 0.42, chunkSize * 0.42);
      chunkAsteroids.push(createRandomAsteroid(x, y, resourceField.getProfile(x, y), hashNumbers(seed, i)));
    }

    for (let i = 0; i < commonCount; i++) {
      const x = centerX + randomRange(random, -chunkSize * 0.48, chunkSize * 0.48);
      const y = centerY + randomRange(random, -chunkSize * 0.48, chunkSize * 0.48);
      chunkAsteroids.push(createCommonAsteroid(x, y, hashNumbers(seed, 1000 + i)));
    }

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

function getAsteroidCount(density, random) {
  if (density < 0.3) {
    return random() < 0.35 ? 1 : 0;
  }

  if (density < 0.55) {
    return random() < 0.75 ? 1 : 2;
  }

  if (density < 0.78) {
    return 2 + Math.floor(random() * 2);
  }

  return 3 + Math.floor(random() * 3);
}

function getCommonAsteroidCount(density, commonRockBias, random) {
  const baseCount = 3 + Math.floor(random() * 4);
  const densityBonus = Math.floor(density * 7);
  const biasedCount = (baseCount + densityBonus) * commonRockBias;

  return Math.max(1, Math.round(biasedCount));
}
