import { Lifeform } from "../entities/Lifeform.js?v=field-life";
import { createRandom, hashNumbers, randomRange } from "./random.js";

export function createLifeField(asteroids) {
  const random = createRandom(7781);
  const lifeforms = [];
  const anchors = asteroids
    .filter((asteroid) => Math.hypot(asteroid.position.x, asteroid.position.y) > 340)
    .sort((first, second) => first.position.x - second.position.x || first.position.y - second.position.y);

  if (anchors.length === 0) {
    return lifeforms;
  }

  addHunters(lifeforms, anchors, random);
  addThreadlings(lifeforms, anchors, random);
  addGrazers(lifeforms, anchors, random);
  addSkitters(lifeforms, anchors, random);

  return lifeforms;
}

function addHunters(lifeforms, anchors, random) {
  for (let index = 0; index < 5; index += 1) {
    const anchor = anchors[(index * 23 + 11) % anchors.length];

    lifeforms.push(createLifeformNear("hunter", anchor, random, 210, index));
  }
}

function addThreadlings(lifeforms, anchors, random) {
  for (let flock = 0; flock < 4; flock += 1) {
    const anchor = anchors[(flock * 31 + 7) % anchors.length];

    for (let index = 0; index < 9; index += 1) {
      lifeforms.push(createLifeformNear("threadling", anchor, random, 120, 100 + flock * 20 + index));
    }
  }
}

function addGrazers(lifeforms, anchors, random) {
  for (let index = 0; index < 18; index += 1) {
    const anchor = anchors[(index * 17 + 5) % anchors.length];

    lifeforms.push(createLifeformNear("grazer", anchor, random, 90, 300 + index));
  }
}

function addSkitters(lifeforms, anchors, random) {
  for (let index = 0; index < 16; index += 1) {
    const anchor = anchors[(index * 19 + 13) % anchors.length];

    lifeforms.push(createLifeformNear("skitter", anchor, random, 180, 500 + index));
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
