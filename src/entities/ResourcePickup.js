import { WHITE_ASTEROID_COLOR } from "./Asteroid.js?v=burst-fix-2";
import { createRandom, randomRange } from "../systems/random.js";

const PICKUP_SIZE = 7;
const PICKUP_RADIUS = 10;
const PICKUP_DRAG = 0.985;
const PICKUP_TYPES = {
  fuel: "#ff7452",
  crystal: "#73d2ff",
};

export class ResourcePickup {
  constructor({ x, y, type, velocity }) {
    this.position = { x, y };
    this.velocity = velocity;
    this.type = type;
    this.color = PICKUP_TYPES[type];
    this.radius = PICKUP_RADIUS;
    this.size = PICKUP_SIZE;
  }

  update(deltaSeconds) {
    this.velocity.x *= PICKUP_DRAG;
    this.velocity.y *= PICKUP_DRAG;
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
  }

  draw(context, camera) {
    const screenX = this.position.x - camera.x;
    const screenY = this.position.y - camera.y;

    context.save();
    context.translate(screenX, screenY);
    context.fillStyle = this.color;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    context.strokeRect(-this.size / 2, -this.size / 2, this.size, this.size);
    context.restore();
  }
}

export function createResourcePickupsFromAsteroid(asteroid, seed, impactVelocity = { x: 0, y: 0 }) {
  if (asteroid.color === WHITE_ASTEROID_COLOR) {
    return [];
  }

  const pickupType = getPickupType(asteroid.resources);

  if (!pickupType) {
    return [];
  }

  const random = createRandom(seed);
  const pickupCount = 2 + Math.floor(random() * 3);
  const pickups = [];
  const baseAngle = random() * Math.PI * 2;

  for (let index = 0; index < pickupCount; index += 1) {
    const angle = baseAngle + (Math.PI * 2 * index) / pickupCount + randomRange(random, -0.55, 0.55);
    const speed = randomRange(random, 78, 170);

    pickups.push(
      new ResourcePickup({
        x: asteroid.position.x + Math.cos(angle) * randomRange(random, 4, 12),
        y: asteroid.position.y + Math.sin(angle) * randomRange(random, 4, 12),
        type: pickupType,
        velocity: {
          x: asteroid.velocity.x * 0.12 + Math.cos(angle) * speed + impactVelocity.x * 0.0015,
          y: asteroid.velocity.y * 0.12 + Math.sin(angle) * speed + impactVelocity.y * 0.0015,
        },
      }),
    );
  }

  return pickups;
}

function getPickupType(resources) {
  const dominantResource = Object.entries(resources)
    .filter(([resource]) => resource !== "stone")
    .reduce((best, [resource, amount]) => (amount > best.amount ? { resource, amount } : best), {
      resource: null,
      amount: 0,
    }).resource;

  if (!dominantResource) {
    return null;
  }

  return dominantResource === "iron" ? "fuel" : "crystal";
}
