import { createCommonAsteroid, createRandomAsteroid } from "../entities/Asteroid.js?v=fuel-crystals";
import { createRandom, hashNumbers, randomRange } from "./random.js";

export function createAsteroidField(canvas, resourceField) {
  const asteroids = [];
  const cellSize = canvas.width;
  const cellRadius = 4;

  for (let cellX = -cellRadius; cellX <= cellRadius; cellX += 1) {
    for (let cellY = -cellRadius; cellY <= cellRadius; cellY += 1) {
      if (cellX === 0 && cellY === 0) {
        continue;
      }

      const cellSeed = hashNumbers(42, cellX, cellY);
      const random = createRandom(cellSeed);
      const centerX = cellX * cellSize;
      const centerY = cellY * cellSize;
      const profile = resourceField.getProfile(centerX, centerY);
      const asteroidCount = getAsteroidCount(profile.density, random);
      const commonAsteroidCount = getCommonAsteroidCount(profile.density, profile.commonRockBias, random);

      for (let index = 0; index < asteroidCount; index += 1) {
        const x = centerX + randomRange(random, -cellSize * 0.42, cellSize * 0.42);
        const y = centerY + randomRange(random, -cellSize * 0.42, cellSize * 0.42);
        const asteroidProfile = resourceField.getProfile(x, y);
        asteroids.push(createRandomAsteroid(x, y, asteroidProfile, hashNumbers(cellSeed, index)));
      }

      for (let index = 0; index < commonAsteroidCount; index += 1) {
        const x = centerX + randomRange(random, -cellSize * 0.48, cellSize * 0.48);
        const y = centerY + randomRange(random, -cellSize * 0.48, cellSize * 0.48);
        asteroids.push(createCommonAsteroid(x, y, hashNumbers(cellSeed, 1000 + index)));
      }
    }
  }

  return asteroids;
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
