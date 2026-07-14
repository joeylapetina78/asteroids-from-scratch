import { Threadwyrm } from "../entities/Threadwyrm.js?v=fresh-20260714-0212-d103f79";
import { createRandom, hashNumbers, randomRange } from "./random.js";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260714-0212-d103f79";

const THREADWYRM_ATTEMPTS = 14;
const MAX_THREADWYRMS = 3;
const MIN_ROUTE_POINTS = 5;
const ROUTE_RADIUS = 1250;

export function createThreadwyrmField(asteroids) {
  const random = createRandom(19223);
  const candidates = asteroids
    .filter((asteroid) => Math.hypot(asteroid.position.x, asteroid.position.y) > 1200)
    .map((asteroid) => ({ asteroid, weight: getThreadwyrmAnchorWeight(asteroid) }))
    .filter(({ weight }) => weight > 0.12)
    .sort((first, second) => second.weight - first.weight);

  const threadwyrms = [];
  const usedAnchors = new Set();

  for (let attempt = 0; attempt < THREADWYRM_ATTEMPTS && threadwyrms.length < MAX_THREADWYRMS; attempt += 1) {
    const anchor = pickWeightedAnchor(candidates, random, usedAnchors);

    if (!anchor) {
      break;
    }

    const route = createCorridorRoute(anchor, asteroids, random);

    if (route.length < MIN_ROUTE_POINTS) {
      usedAnchors.add(anchor);
      continue;
    }

    usedAnchors.add(anchor);
    const seed = hashNumbers(anchor.position.x, anchor.position.y, 7300 + attempt);
    threadwyrms.push(
      new Threadwyrm({
        id: `threadwyrm-${threadwyrms.length + 1}`,
        path: route,
        seed,
        speed: randomRange(random, 24, 42),
      }),
    );
  }

  return threadwyrms;
}

function createCorridorRoute(anchor, asteroids, random) {
  const nearby = asteroids
    .filter((asteroid) => asteroid !== anchor)
    .filter((asteroid) => distance(anchor.position, asteroid.position) < ROUTE_RADIUS)
    .sort((first, second) => distance(anchor.position, first.position) - distance(anchor.position, second.position))
    .slice(0, 12);

  const routeAnchors = [anchor, ...nearby].slice(0, Math.floor(randomRange(random, MIN_ROUTE_POINTS + 1, 10)));
  const center = getCenter(routeAnchors);

  return routeAnchors
    .sort(
      (first, second) =>
        Math.atan2(first.position.y - center.y, first.position.x - center.x) -
        Math.atan2(second.position.y - center.y, second.position.x - center.x),
    )
    .map((asteroid, index) => {
      const angle = Math.atan2(asteroid.position.y - center.y, asteroid.position.x - center.x);
      const offset = asteroid.radius + randomRange(random, 72, 138);

      return {
        x: asteroid.position.x + Math.cos(angle) * offset,
        y: asteroid.position.y + Math.sin(angle) * offset,
      };
    });
}

function getThreadwyrmAnchorWeight(asteroid) {
  const zone = getZoneProfile(asteroid.origin?.x ?? asteroid.position.x, asteroid.origin?.y ?? asteroid.position.y);
  const densityWeight = Math.max(0.2, zone.asteroidDensityMultiplier);
  const dangerWeight = 0.35 + zone.danger * 1.35;
  const ambientWeight = 0.35 + zone.ambientLifeBias * 0.55;
  const sparsePenalty = zone.tags.includes("sparse") ? 0.35 : 1;
  const corridorBonus = zone.tags.includes("dense") || zone.tags.includes("high-life") ? 1.25 : 1;

  return densityWeight * dangerWeight * ambientWeight * sparsePenalty * corridorBonus;
}

function pickWeightedAnchor(candidates, random, usedAnchors) {
  const available = candidates.filter(({ asteroid }) => !usedAnchors.has(asteroid));
  const totalWeight = available.reduce((sum, candidate) => sum + candidate.weight, 0);

  if (totalWeight <= 0) {
    return null;
  }

  let roll = random() * totalWeight;

  for (const candidate of available) {
    roll -= candidate.weight;

    if (roll <= 0) {
      return candidate.asteroid;
    }
  }

  return available[available.length - 1]?.asteroid ?? null;
}

function getCenter(asteroids) {
  const total = asteroids.reduce(
    (sum, asteroid) => ({
      x: sum.x + asteroid.position.x,
      y: sum.y + asteroid.position.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / asteroids.length,
    y: total.y / asteroids.length,
  };
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
