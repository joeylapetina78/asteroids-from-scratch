import { createRandom, randomRange } from "../systems/random.js";

// Asteroids are persistent world objects with a home origin. The spring back to
// origin keeps local fields coherent while still allowing impacts to jostle
// rocks and fragments.
const SPRING_STRENGTH = 0.012;
const DRIFT_DAMPING = 0.999;
export const WHITE_ASTEROID_COLOR = "#edf2ff";
const STONE_RESOURCES = {
  stone: 1,
  iron: 0,
  copper: 0,
  ice: 0,
  crystal: 0,
};

export class Asteroid {
  constructor({ x, y, radius, tier, color, resources, points, velocity, rotation, rotationSpeed }) {
    this.origin = { x, y };
    this.position = { x, y };
    this.velocity = velocity;
    this.radius = radius;
    this.tier = tier;
    this.color = color;
    this.resources = resources;
    this.points = points;
    this.rotation = rotation;
    this.rotationSpeed = rotationSpeed;
  }

  update(deltaSeconds) {
    const offsetX = this.position.x - this.origin.x;
    const offsetY = this.position.y - this.origin.y;

    this.velocity.x -= offsetX * SPRING_STRENGTH * deltaSeconds;
    this.velocity.y -= offsetY * SPRING_STRENGTH * deltaSeconds;
    this.velocity.x *= DRIFT_DAMPING;
    this.velocity.y *= DRIFT_DAMPING;

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.rotation += this.rotationSpeed * deltaSeconds;
  }

  draw(context, camera) {
    const screenX = this.position.x - camera.x;
    const screenY = this.position.y - camera.y;

    context.save();
    context.translate(screenX, screenY);
    context.rotate(this.rotation);

    context.lineWidth = 2;
    context.strokeStyle = this.color;
    context.fillStyle = "rgba(7, 8, 12, 0.85)";

    context.beginPath();
    this.points.forEach((point, index) => {
      const x = Math.cos(point.angle) * point.distance;
      const y = Math.sin(point.angle) * point.distance;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.closePath();
    context.fill();
    context.stroke();

    context.restore();
  }
}

export function createRandomAsteroid(x, y, profile, seed) {
  const random = createRandom(seed);
  const radius = randomRange(random, 30, 72) + profile.richness * 26;
  const tier = getTierForRadius(radius);

  return createAsteroid({
    x,
    y,
    radius,
    tier,
    color: profile.color,
    resources: profile.resources,
    random,
  });
}

export function createCommonAsteroid(x, y, seed) {
  const random = createRandom(seed);
  const radius = randomRange(random, 16, 52);
  const tier = radius > 38 ? 2 : 1;

  return createAsteroid({
    x,
    y,
    radius,
    tier,
    color: WHITE_ASTEROID_COLOR,
    resources: STONE_RESOURCES,
    random,
  });
}

export function breakAsteroid(asteroid, seed, impactVelocity = { x: 0, y: 0 }) {
  if (asteroid.tier <= 1) {
    return [];
  }

  const random = createRandom(seed);
  const fragmentCount = asteroid.tier === 3 ? 3 : 2 + Math.floor(random() * 2);
  const childTier = asteroid.tier - 1;
  const isResourceRock = asteroid.color !== WHITE_ASTEROID_COLOR;
  // Resource rocks keep some colored/resource-bearing fragments, but not all
  // fragments are valuable. This leaves white stone mixed into broken ore.
  const coloredFragmentCount = isResourceRock ? Math.max(1, Math.floor(fragmentCount * 0.45)) : 0;
  const coloredFragmentIndexes = pickFragmentIndexes(fragmentCount, coloredFragmentCount, random);
  const baseAngle = random() * Math.PI * 2;
  const fragments = [];

  for (let index = 0; index < fragmentCount; index += 1) {
    const angle = baseAngle + (Math.PI * 2 * index) / fragmentCount + randomRange(random, -0.65, 0.65);
    const distance = asteroid.radius * randomRange(random, 0.28, 0.52);
    const isColoredFragment = coloredFragmentIndexes.has(index);
    const radius = asteroid.radius * (childTier === 2 ? randomRange(random, 0.46, 0.58) : randomRange(random, 0.34, 0.44));
    const x = asteroid.position.x + Math.cos(angle) * distance;
    const y = asteroid.position.y + Math.sin(angle) * distance;

    const fragment = createAsteroid({
      x,
      y,
      radius,
      tier: childTier,
      color: isColoredFragment ? asteroid.color : WHITE_ASTEROID_COLOR,
      resources: isColoredFragment ? asteroid.resources : STONE_RESOURCES,
      random,
    });

    fragment.origin = { x, y };
    fragment.velocity.x =
      asteroid.velocity.x * 0.65 + Math.cos(angle) * randomRange(random, 34, 86) + impactVelocity.x * 0.02;
    fragment.velocity.y =
      asteroid.velocity.y * 0.65 + Math.sin(angle) * randomRange(random, 34, 86) + impactVelocity.y * 0.02;
    fragments.push(fragment);
  }

  return fragments;
}

function pickFragmentIndexes(fragmentCount, coloredFragmentCount, random) {
  const indexes = [...Array(fragmentCount).keys()];

  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = indexes[index];
    indexes[index] = indexes[swapIndex];
    indexes[swapIndex] = current;
  }

  return new Set(indexes.slice(0, coloredFragmentCount));
}

function createAsteroid({ x, y, radius, tier, color, resources, random }) {
  const pointCount = Math.floor(randomRange(random, 8, 15));
  const points = [];

  for (let index = 0; index < pointCount; index += 1) {
    points.push({
      angle: (Math.PI * 2 * index) / pointCount,
      distance: radius * randomRange(random, 0.68, 1.18),
    });
  }

  return new Asteroid({
    x,
    y,
    radius,
    tier,
    color,
    resources,
    points,
    velocity: {
      x: randomRange(random, -10, 10),
      y: randomRange(random, -10, 10),
    },
    rotation: random() * Math.PI * 2,
    rotationSpeed: randomRange(random, -0.25, 0.25),
  });
}

function getTierForRadius(radius) {
  if (radius >= 62) {
    return 3;
  }

  if (radius >= 28) {
    return 2;
  }

  return 1;
}
