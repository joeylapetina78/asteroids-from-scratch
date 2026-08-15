import { Lifeform } from "../entities/Lifeform.js?v=fresh-20260815-0037-8f1e3cc";
import { createRandom, hashNumbers, randomRange } from "./random.js?v=fresh-20260815-0037-8f1e3cc";
import { pickRockmossStrain } from "./rockmossStrains.js?v=fresh-20260815-0037-8f1e3cc";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260815-0037-8f1e3cc";

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

// Streaming ambient life. createLifeField only seeds the start area once; this
// keeps space alive everywhere by spawning creatures off-screen around the
// ship as it travels into new space, weighted by the LOCAL zone profile (which
// now exists everywhere, including The Black). The game's life director calls
// this whenever the area around the ship is under its target population.
// MIN sits inside the ~480px screen half-width on purpose: a larger no-spawn
// ring leaves the ship in a life-free bubble that fills the whole view. Flocks
// spawn near anchor rocks (many on-screen), so new life reads as emerging from
// the rocks rather than popping into empty space.
const AMBIENT_STREAM_MIN_DIST = 320;
const AMBIENT_STREAM_MAX_DIST = 1300; // kept near the view so life reads on-screen

// `count` here is a number of FLOCKS. Each flock is a cluster of same-type
// creatures near one anchor rock, so life reads as dense schools you fly past
// — the way the start area feels — instead of lone dots spread too thin to
// notice.
export function createAmbientLifeBatch({ ship, asteroids, random = Math.random, count = 2, seed = 0 }) {
  const ringAnchors = asteroids.filter((asteroid) => {
    const dist = Math.hypot(asteroid.position.x - ship.position.x, asteroid.position.y - ship.position.y);
    return dist >= AMBIENT_STREAM_MIN_DIST && dist <= AMBIENT_STREAM_MAX_DIST;
  });

  if (ringAnchors.length === 0) {
    return [];
  }

  // Far rocks outnumber near ones ~30:1, so proximity weighting alone still
  // spawns most flocks off-screen. Instead: guarantee the first flock lands at
  // one of the few NEAREST rocks (reliably on/near screen), and spread the rest
  // by proximity-weighted pick for a natural feel.
  const nearest = [...ringAnchors]
    .sort((a, b) => distanceToShip(a, ship) - distanceToShip(b, ship))
    .slice(0, 5);
  const weighted = ringAnchors.map((asteroid) => {
    const proximity = 1 / (1 + distanceToShip(asteroid, ship) / 320);
    return { asteroid, weight: (getAmbientAnchorWeight(asteroid) + 0.05) * proximity };
  });
  const lifeforms = [];

  for (let flock = 0; flock < count; flock += 1) {
    const anchor = flock === 0
      ? nearest[Math.floor(random() * nearest.length)]
      : pickWeightedAnchor(weighted, random);

    if (!anchor) {
      break;
    }

    const zone = getZoneProfile(anchor.position.x, anchor.position.y);
    const type = pickAmbientType(zone, anchor, random);
    const flockSize = getAmbientFlockSize(type, random);

    for (let member = 0; member < flockSize; member += 1) {
      lifeforms.push(createEmergingLifeformNear(type, anchor, random, hashNumbers(seed, flock * 40 + member, Math.round(anchor.position.x))));
    }
  }

  return lifeforms;
}

function distanceToShip(asteroid, ship) {
  return Math.hypot(asteroid.position.x - ship.position.x, asteroid.position.y - ship.position.y);
}

function getAmbientFlockSize(type, random) {
  if (type === "threadling") return 6 + Math.floor(random() * 6); // 6–11, tight schools
  if (type === "skitter") return 3 + Math.floor(random() * 5); // 3–7
  if (type === "lantern") return 3 + Math.floor(random() * 4); // 3–6
  if (type === "bloom") return 3 + Math.floor(random() * 4); // 3–6, loose drifting school
  if (type === "filament") return 5 + Math.floor(random() * 6); // 5–10, a field of hairs
  return 2 + Math.floor(random() * 4); // grazers 2–5
}

// Ambient streaming seeds PEACEFUL life only. Predators stay governed by the
// existing danger-based hunter systems (createLifeField packs in dangerous
// zones + respawn-on-death), so The Black fills with grazing life without
// turning every far corner into a running gunfight. `zone` is kept for future
// per-zone creature mixes.
function pickAmbientType(zone, anchor, random) {
  const resourceScore = getResourceScore(anchor);
  const tags = zone.tags ?? [];
  // Blooms belong to calm, fertile water; filaments to strange scanergy/cluster
  // pockets. Zone-driven so you can read a place by the life drifting through it.
  const isFertile = tags.includes("ambient-life") || tags.includes("safe");
  const isStrange = tags.includes("scanergy-rich") || tags.includes("cluster-pocket") || tags.includes("strange");
  const weights = [
    ["grazer", 1.0],
    ["skitter", 0.85],
    ["threadling", 1.15],
    ["lantern", 0.35 + Math.min(0.9, resourceScore * 1.3)],
    ["bloom", 0.3 + (isFertile ? 1.0 : 0) + Math.max(0, (zone.ambientLifeBias ?? 0.6) - 0.6) * 0.8],
    ["filament", 0.15 + (isStrange ? 1.1 : 0) + Math.min(0.6, resourceScore * 0.8)],
  ];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;

  for (const [type, weight] of weights) {
    roll -= weight;
    if (roll <= 0) {
      return type;
    }
  }

  return "grazer";
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
  anchors.forEach((anchor) => {
    seedRockmossOnAsteroid(anchor, random);
  });
}

// Zone-weighted roll for one rock: sets asteroid.rockmoss (with a zone-picked
// strain) if it qualifies, returns whether it seeded. Shared by the start field
// and by chunk streaming so deep space grows the same varied rock-life.
export function seedRockmossOnAsteroid(asteroid, random) {
  const mossWeight = getRockmossAnchorWeight(asteroid);

  if (mossWeight <= 0.18 || random() > clamp(mossWeight * 0.18, 0.02, 0.38)) {
    return false;
  }

  const resourceScore = getResourceScore(asteroid);
  asteroid.rockmoss = {
    seed: hashNumbers(asteroid.position.x, asteroid.position.y, 9100),
    coverage: clamp(0.22 + mossWeight * 0.22 + resourceScore * 0.12 + randomRange(random, -0.08, 0.14), 0.18, 0.72),
    glow: clamp(0.34 + resourceScore * 0.2 + randomRange(random, -0.08, 0.18), 0.25, 0.9),
    strain: pickRockmossStrain(getAnchorZoneProfile(asteroid), random),
  };
  return true;
}

// Seed strained rock-life on freshly streamed chunk rocks so varieties appear as
// you fly, not just near the start. Deterministic per rock position (same rock
// looks the same each visit); skips rocks that already carry moss (e.g. inherited).
export function seedChunkRockmoss(asteroids) {
  asteroids.forEach((asteroid) => {
    if (asteroid.rockmoss) {
      return;
    }

    const random = createRandom(hashNumbers(Math.round(asteroid.position.x), Math.round(asteroid.position.y), 4242));
    seedRockmossOnAsteroid(asteroid, random);
  });
}

// Ambient life surfaces from under a rock: spawn INSIDE the anchor's silhouette
// (not the loose 210-240 ring createLifeformNear uses) and flag a short emerge
// so it scales/fades up instead of snapping in. Existing per-type steering
// (orbit, flock, flee) fans the flock back out from the rock on its own.
const AMBIENT_EMERGE_SECONDS = 0.7;
const AMBIENT_MIN_UNDER_RADIUS = 40; // pebbles still get a small huddle

function createEmergingLifeformNear(type, anchor, random, seedOffset) {
  const underRadius = Math.max(anchor.radius ?? AMBIENT_MIN_UNDER_RADIUS, AMBIENT_MIN_UNDER_RADIUS) * 0.8;
  const angle = random() * Math.PI * 2;
  const distance = randomRange(random, 0, underRadius);
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
    birthSeconds: AMBIENT_EMERGE_SECONDS,
  });
}

// Rock-life surfacing at a spill of abandoned material.
//
// It slips out from behind a nearby rock when there is one to hide behind, and
// otherwise rises straight out of the dark — either way through the same emerge
// animation ambient life uses, so it scales and fades up rather than appearing.
// A creature that pops into existence next to your salvage reads as a spawner;
// one that surfaces reads as something that was always out there.
const FEAST_EMERGE_SECONDS = 1.1;
const FEAST_ROCK_SEARCH_RADIUS = 420;

export function createGrazerAtFeast(centre, asteroids, random = Math.random) {
  const cover = asteroids
    .filter((asteroid) => Math.hypot(asteroid.position.x - centre.x, asteroid.position.y - centre.y) <= FEAST_ROCK_SEARCH_RADIUS)
    .sort((first, second) =>
      Math.hypot(first.position.x - centre.x, first.position.y - centre.y)
      - Math.hypot(second.position.x - centre.x, second.position.y - centre.y))[0] ?? null;

  const angle = random() * Math.PI * 2;
  // Behind the rock, or a little way off in open space — never right on top of
  // the food, so the first thing it does is swim in.
  const origin = cover
    ? {
        x: cover.position.x + Math.cos(angle) * (cover.radius ?? 40) * 0.85,
        y: cover.position.y + Math.sin(angle) * (cover.radius ?? 40) * 0.85,
      }
    : {
        x: centre.x + Math.cos(angle) * randomRange(random, 190, 330),
        y: centre.y + Math.sin(angle) * randomRange(random, 190, 330),
      };

  const towardFood = Math.atan2(centre.y - origin.y, centre.x - origin.x);
  const speed = randomRange(random, 30, 70);

  return new Lifeform({
    type: "grazer",
    x: origin.x,
    y: origin.y,
    velocity: { x: Math.cos(towardFood) * speed, y: Math.sin(towardFood) * speed },
    seed: hashNumbers(Math.round(origin.x), Math.round(origin.y), 8813),
    birthSeconds: FEAST_EMERGE_SECONDS,
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
  const ambientBonus = zone.tags.includes("ambient-life") ? 1.3 : 1;

  return zone.ambientLifeBias * densityWeight * dangerPenalty * sparsePenalty * ambientBonus;
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
