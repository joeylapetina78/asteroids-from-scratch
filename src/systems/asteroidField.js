import { createRandomAsteroid } from "../entities/Asteroid.js";

export function createAsteroidField(canvas) {
  const asteroids = [];
  const cellSize = canvas.width;
  const cellRadius = 4;

  for (let cellX = -cellRadius; cellX <= cellRadius; cellX += 1) {
    for (let cellY = -cellRadius; cellY <= cellRadius; cellY += 1) {
      if (cellX === 0 && cellY === 0) {
        continue;
      }

      const x = cellX * cellSize + randomRange(-cellSize * 0.35, cellSize * 0.35);
      const y = cellY * cellSize + randomRange(-cellSize * 0.35, cellSize * 0.35);
      asteroids.push(createRandomAsteroid(x, y));
    }
  }

  return asteroids;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}
