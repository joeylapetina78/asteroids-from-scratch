import { Lifeform } from "../entities/Lifeform.js?v=hunter-tuning";
import { createRandom, hashNumbers, randomRange } from "./random.js";

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

  addHunters(lifeforms, anchors, random);
  addThreadlings(lifeforms, anchors, random);
  addGrazers(lifeforms, anchors, random);
  addSkitters(lifeforms, anchors, random);

  return lifeforms;
}

export function createHunterRespawn(ship, asteroids, seed) {
  const anchors = asteroids
    .filter((asteroid) => Math.hypot(asteroid.position.x - ship.position.x, asteroid.position.y - ship.position.y) > 1100)
    .sort(
      (first, second) =>
        Math.hypot(first.position.x - ship.position.x, first.position.y - ship.position.y) -
        Math.hypot(second.position.x - ship.position.x, second.position.y - ship.position.y),
    );

  if (anchors.length === 0) {
    return null;
  }

  const random = createRandom(seed);
  const anchor = anchors[Math.floor(random() * Math.min(18, anchors.length))];

  return createLifeformNear("hunter", anchor, random, 340, seed);
}

function addHunters(lifeforms, anchors, random) {
  for (let index = 0; index < 10; index += 1) {
    const anchor = anchors[(index * 17 + 3) % anchors.length];

    lifeforms.push(createLifeformNear("hunter", anchor, random, 260, index));
  }
}

function addThreadlings(lifeforms, anchors, random) {
  for (let flock = 0; flock < 9; flock += 1) {
    const anchor = anchors[(flock * 13 + 1) % anchors.length];

    for (let index = 0; index < 13; index += 1) {
      lifeforms.push(createLifeformNear("threadling", anchor, random, 175, 100 + flock * 20 + index));
    }
  }
}

function addGrazers(lifeforms, anchors, random) {
  for (let index = 0; index < 44; index += 1) {
    const anchor = anchors[(index * 7 + 5) % anchors.length];

    lifeforms.push(createLifeformNear("grazer", anchor, random, 135, 300 + index));
  }
}

function addSkitters(lifeforms, anchors, random) {
  for (let index = 0; index < 42; index += 1) {
    const anchor = anchors[(index * 11 + 9) % anchors.length];

    lifeforms.push(createLifeformNear("skitter", anchor, random, 230, 500 + index));
  }
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
