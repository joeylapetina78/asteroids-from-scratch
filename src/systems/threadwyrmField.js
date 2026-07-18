import { Threadwyrm } from "../entities/Threadwyrm.js?v=fresh-20260717-2312-49de7be";
import { createRandom, hashNumbers, randomRange } from "./random.js";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260717-2312-49de7be";

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
    .slice(0, 16);

  const routeAnchors = createMeanderAnchors(
    [anchor, ...nearby],
    Math.floor(randomRange(random, MIN_ROUTE_POINTS + 2, 11)),
    random,
  );
  const center = getCenter(routeAnchors);

  return routeAnchors.map((asteroid, index) => {
    const next = routeAnchors[(index + 1) % routeAnchors.length];
    const prev = routeAnchors[(index - 1 + routeAnchors.length) % routeAnchors.length];
    const travelAngle = Math.atan2(next.position.y - prev.position.y, next.position.x - prev.position.x);
    const side = index % 2 === 0 ? 1 : -1;
    const offsetAngle = travelAngle + Math.PI / 2 * side + randomRange(random, -0.45, 0.45);
    const offset = asteroid.radius + randomRange(random, 82, 180);

    return {
      x: asteroid.position.x + Math.cos(offsetAngle) * offset,
      y: asteroid.position.y + Math.sin(offsetAngle) * offset,
    };
  });
}

function createMeanderAnchors(candidates, count, random) {
  if (candidates.length <= count) {
    return [...candidates];
  }

  const selected = [candidates[0]];
  const remaining = candidates.slice(1);

  while (selected.length < count && remaining.length > 0) {
    const last = selected[selected.length - 1];
    remaining.sort((first, second) => distance(last.position, first.position) - distance(last.position, second.position));
    const window = remaining.slice(0, Math.min(5, remaining.length));
    const choice = window[Math.floor(random() * window.length)];
    selected.push(choice);
    remaining.splice(remaining.indexOf(choice), 1);
  }

  return selected;
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
