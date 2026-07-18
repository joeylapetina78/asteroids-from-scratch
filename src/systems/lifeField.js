import { Lifeform } from "../entities/Lifeform.js?v=fresh-20260717-2003-fcd6b0d";
import { createRandom, hashNumbers, randomRange } from "./random.js";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260717-2003-fcd6b0d";

// Life is seeded near asteroid anchors. Zone profiles weight those anchors so
// hunters belong to dangerous regions and ambient forms prefer livelier fields.
const HUNTER_PACK_ATTEMPTS = 4;
const HUNTER_MAX_STARTING_COUNT = 7;
const THREADLING_FLOCKS = 8;
const LANTERN_HERDS = 5;
const GRAZER_ATTEMPTS = 42;
const SKITTER_ATTEMPTS = 40;

export function createLifeField(asteroids) {
  const random = createRandom(7781);
  const lifeforms = [];
  const anchors = asteroids
    .filter((asteroid) => Math.hypot(asteroid.position.x, asteroid.position.y) > 340)
    .sort(
      (first, second) =>
        Math.hypot(first.position.x, first.position.y) - Math.hypot(second.position.x, second.position.y) ||
        first.position.x - second.position.x ||
        first.position.y - second.position.y,
    );

  if (anchors.length === 0) {
    return lifeforms;
  }

  seedRockmoss(anchors, random);
  addHunters(lifeforms, anchors, random);
  addThreadlings(lifeforms, anchors, random);
  addLanternHerds(lifeforms, anchors, random);
  addGrazers(lifeforms, anchors, random);
  addSkitters(lifeforms, anchors, random);

  return lifeforms;
}

export function createHunterRespawn(ship, asteroids, seed) {
  // Respawns also use zone-weighted anchors so killing a hunter does not turn
  // every part of space into a permanent hunter factory.
  const anchors = asteroids
    .filter((asteroid) => Math.hypot(asteroid.position.x - ship.position.x, asteroid.position.y - ship.position.y) > 1100)
    .map((asteroid) => ({ asteroid, weight: getHunterAnchorWeight(asteroid) }))
    .filter(({ weight }) => weight > 0.015)
    .sort(
      (first, second) =>
        Math.hypot(first.asteroid.position.x - ship.position.x, first.asteroid.position.y - ship.position.y) -
        Math.hypot(second.asteroid.position.x - ship.position.x, second.asteroid.position.y - ship.position.y),
    );

  if (anchors.length === 0) {
    return null;
  }

  const random = createRandom(seed);
  const anchor = pickWeightedAnchor(anchors.slice(0, Math.min(28, anchors.length)), random);

  return createLifeformNear("hunter", anchor, random, 340, seed);
}

export function createHunterNearShip(ship, seed) {
  const random = createRandom(seed);
  const baseAngle = Math.atan2(ship.velocity.y, ship.velocity.x);
  const isMoving = Math.hypot(ship.velocity.x, ship.velocity.y) > 18;
  const angle = (isMoving ? baseAngle : ship.angle) + randomRange(random, -0.8, 0.8);
  const distance = randomRange(random, 430, 560);
  const x = ship.position.x + Math.cos(angle) * distance;
  const y = ship.position.y + Math.sin(angle) * distance;

  return new Lifeform({
    type: "hunter",
    x,
    y,
    velocity: {
      x: Math.cos(angle + Math.PI / 2) * randomRange(random, 35, 70),
      y: Math.sin(angle + Math.PI / 2) * randomRange(random, 35, 70),
    },
    seed: hashNumbers(x, y, seed),
  });
}

function addHunters(lifeforms, anchors, random) {
  const weightedAnchors = anchors
    .map((anchor) => ({ asteroid: anchor, weight: getHunterAnchorWeight(anchor) }))
    .filter(({ weight }) => weight > 0.015);
  let hunterCount = 0;

  for (let pack = 0; pack < HUNTER_PACK_ATTEMPTS && hunterCount < HUNTER_MAX_STARTING_COUNT; pack += 1) {
    const anchor = pickWeightedAnchor(weightedAnchors, random);

    if (!anchor) {
      return;
    }

    const zone = getAnchorZoneProfile(anchor);
    const packSize = getHunterPackSize(zone, random);

    for (let index = 0; index < packSize && hunterCount < HUNTER_MAX_STARTING_COUNT; index += 1) {
      lifeforms.push(createLifeformNear("hunter", anchor, random, 210, pack * 20 + index));
      hunterCount += 1;
    }
  }
}

function addThreadlings(lifeforms, anchors, random) {
  const weightedAnchors = getAmbientWeightedAnchors(anchors);

  for (let flock = 0; flock < THREADLING_FLOCKS; flock += 1) {
    const anchor = pickWeightedAnchor(weightedAnchors, random);

    if (!anchor) {
      return;
    }

    const flockSize = Math.round(randomRange(random, 9, 14) * getAmbientSpawnScale(anchor));

    for (let index = 0; index < flockSize; index += 1) {
      lifeforms.push(createLifeformNear("threadling", anchor, random, 175, 100 + flock * 20 + index));
    }
  }
}

function addLanternHerds(lifeforms, anchors, random) {
  const weightedAnchors = anchors
    .map((anchor) => ({ asteroid: anchor, weight: getLanternAnchorWeight(anchor) }))
    .filter(({ weight }) => weight > 0.1);

  for (let herd = 0; herd < LANTERN_HERDS; herd += 1) {
    const anchor = pickWeightedAnchor(weightedAnchors, random);

    if (!anchor) {
      return;
    }

    const herdSize = Math.round(randomRange(random, 4, 8) * clamp(getLanternAnchorWeight(anchor), 0.75, 1.25));

    for (let index = 0; index < herdSize; index += 1) {
      lifeforms.push(createLifeformNear("lantern", anchor, random, 210, 700 + herd * 20 + index));
    }
  }
}

function addGrazers(lifeforms, anchors, random) {
  const weightedAnchors = getAmbientWeightedAnchors(anchors);

  for (let index = 0; index < GRAZER_ATTEMPTS; index += 1) {
    const anchor = pickWeightedAnchor(weightedAnchors, random);

    if (!anchor || random() > getAmbientSpawnChance(anchor)) {
      continue;
    }

    lifeforms.push(createLifeformNear("grazer", anchor, random, 135, 300 + index));
  }
}

function addSkitters(lifeforms, anchors, random) {
  const weightedAnchors = getAmbientWeightedAnchors(anchors);

  for (let index = 0; index < SKITTER_ATTEMPTS; index += 1) {
    const anchor = pickWeightedAnchor(weightedAnchors, random);

    if (!anchor || random() > getAmbientSpawnChance(anchor) * 0.92) {
      continue;
    }

    lifeforms.push(createLifeformNear("skitter", anchor, random, 230, 500 + index));
  }
}

function seedRockmoss(anchors, random) {
  anchors.forEach((anchor, index) => {
    const mossWeight = getRockmossAnchorWeight(anchor);

    if (mossWeight <= 0.18 || random() > clamp(mossWeight * 0.18, 0.02, 0.38)) {
      return;
    }

    const resourceScore = getResourceScore(anchor);
    anchor.rockmoss = {
      seed: hashNumbers(anchor.position.x, anchor.position.y, 9100 + index),
      coverage: clamp(0.22 + mossWeight * 0.22 + resourceScore * 0.12 + randomRange(random, -0.08, 0.14), 0.18, 0.72),
      glow: clamp(0.34 + resourceScore * 0.2 + randomRange(random, -0.08, 0.18), 0.25, 0.9),
    };
  });
}

function createLifeformNear(type, anchor, random, radius, seedOffset) {
  const angle = random() * Math.PI * 2;
  const distance = randomRange(random, radius * 0.35, radius);
  const speed = randomRange(random, 20, 70);

  return new Lifeform({
    type,
    x: anchor.position.x + Math.cos(angle) * distance,
    y: anchor.position.y + Math.sin(angle) * distance,
    velocity: {
      x: Math.cos(angle + Math.PI / 2) * speed,
      y: Math.sin(angle + Math.PI / 2) * speed,
    },
    seed: hashNumbers(anchor.position.x, anchor.position.y, seedOffset),
  });
}

function pickWeightedAnchor(weightedAnchors, random) {
  if (weightedAnchors.length === 0) {
    return null;
  }

  const totalWeight = weightedAnchors.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = random() * totalWeight;

  for (const candidate of weightedAnchors) {
    roll -= candidate.weight;

    if (roll <= 0) {
      return candidate.asteroid;
    }
  }

  return weightedAnchors[weightedAnchors.length - 1].asteroid;
}

function getAmbientWeightedAnchors(anchors) {
  return anchors
    .map((anchor) => ({ asteroid: anchor, weight: getAmbientAnchorWeight(anchor) }))
    .filter(({ weight }) => weight > 0.08);
}

function getAnchorZoneProfile(anchor) {
  const origin = anchor.origin ?? anchor.position;

  return getZoneProfile(origin.x, origin.y);
}

function getHunterAnchorWeight(anchor) {
  const zone = getAnchorZoneProfile(anchor);
  const dangerWeight = Math.max(0, zone.danger - 0.08);
  const influenceWeight = 0.35 + zone.influence * 0.65;
  const sparsePenalty = zone.tags.includes("sparse") || zone.tags.includes("low-life") ? 0.35 : 1;

  return zone.hunterBias * dangerWeight * influenceWeight * sparsePenalty;
}

function getAmbientAnchorWeight(anchor) {
  const zone = getAnchorZoneProfile(anchor);
  const densityWeight = 0.4 + zone.asteroidDensityMultiplier * 0.6;
  const dangerPenalty = 1 - zone.danger * 0.12;
  const sparsePenalty = zone.tags.includes("sparse") || zone.tags.includes("low-life") ? 0.45 : 1;

  return zone.ambientLifeBias * densityWeight * dangerPenalty * sparsePenalty;
}

function getLanternAnchorWeight(anchor) {
  const zone = getAnchorZoneProfile(anchor);
  const resourceScore = getResourceScore(anchor);
  const dangerPenalty = 1 - zone.danger * 0.28;
  const sparsePenalty = zone.tags.includes("sparse") || zone.tags.includes("low-life") ? 0.55 : 1;

  return getAmbientAnchorWeight(anchor) * (0.45 + resourceScore * 1.65) * dangerPenalty * sparsePenalty;
}

function getRockmossAnchorWeight(anchor) {
  const zone = getAnchorZoneProfile(anchor);
  const resourceScore = getResourceScore(anchor);
  const safeEcologyBonus = 1.15 - zone.danger * 0.35;
  const sparsePenalty = zone.tags.includes("sparse") || zone.tags.includes("low-life") ? 0.45 : 1;

  return zone.ambientLifeBias * safeEcologyBonus * sparsePenalty * (0.55 + resourceScore * 1.4);
}

function getResourceScore(anchor) {
  if (!anchor.resources) {
    return 0;
  }

  return Object.entries(anchor.resources).reduce((sum, [resource, amount]) => {
    if (resource === "stone") {
      return sum;
    }
    return sum + Math.max(0, amount);
  }, 0);
}

function getHunterPackSize(zone, random) {
  const dangerPackBonus = zone.danger > 0.55 && random() < zone.danger * 0.55 ? 1 : 0;
  const biasPackBonus = zone.hunterBias > 1.1 && random() < 0.22 ? 1 : 0;

  return 1 + dangerPackBonus + biasPackBonus;
}

function getAmbientSpawnScale(anchor) {
  return clamp(getAmbientAnchorWeight(anchor), 0.55, 1.28);
}

function getAmbientSpawnChance(anchor) {
  return clamp(0.45 + getAmbientAnchorWeight(anchor) * 0.42, 0.15, 0.95);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
