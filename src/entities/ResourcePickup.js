import { WHITE_ASTEROID_COLOR } from "./Asteroid.js?v=burst-fix-2";
import { createRandom, randomRange } from "../systems/random.js";

const PICKUP_RADIUS = 10;
const PICKUP_DRAG = 0.985;

export const RESOURCE_PICKUP_TYPES = {
  iron:    { color: "#ff7452", size: 7 },
  copper:  { color: "#49e1b8", size: 7 },
  ice:     { color: "#b8eaff", size: 8 },
  crystal: { color: "#de6fff", size: 7 },
};

// Kept for legacy callsites that pass "fuel" or "crystal" as type strings.
const LEGACY_TYPE_MAP = {
  fuel:    "iron",
  crystal: "crystal",
};

export class ResourcePickup {
  constructor({ x, y, type, velocity }) {
    this.position = { x, y };
    this.velocity = velocity;
    this.type = LEGACY_TYPE_MAP[type] ?? type;
    const def = RESOURCE_PICKUP_TYPES[this.type] ?? RESOURCE_PICKUP_TYPES.iron;
    this.color = def.color;
    this.radius = PICKUP_RADIUS;
    this.size = def.size;
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
    context.strokeStyle = "rgba(255,255,255,0.7)";
    context.lineWidth = 1;

    drawResourceShape(context, this.type, this.size);

    context.restore();
  }
}

export function createResourcePickupsFromAsteroid(asteroid, seed, impactVelocity = { x: 0, y: 0 }) {
  if (asteroid.color === WHITE_ASTEROID_COLOR) {
    return [];
  }

  const pickupType = getDominantPickupType(asteroid.resources);

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

// Returns the dominant non-stone resource type, or null for pure stone rocks.
function getDominantPickupType(resources) {
  const best = Object.entries(resources)
    .filter(([resource]) => resource !== "stone")
    .reduce(
      (best, [resource, amount]) => (amount > best.amount ? { resource, amount } : best),
      { resource: null, amount: 0 },
    );

  return best.resource;
}

// Shared shape drawing — called from ResourcePickup.draw and processor.js
export function drawResourceShape(context, type, size) {
  const h = size / 2;

  if (type === "iron") {
    // Blocky square — the original shape
    context.fillRect(-h, -h, size, size);
    context.strokeRect(-h, -h, size, size);

  } else if (type === "copper") {
    // Flat hexagon
    context.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = Math.cos(angle) * h;
      const y = Math.sin(angle) * h;
      if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    context.stroke();

  } else if (type === "ice") {
    // Smooth circle — volatile, rounded
    context.beginPath();
    context.arc(0, 0, h, 0, Math.PI * 2);
    context.fill();
    context.stroke();

  } else if (type === "crystal") {
    // Diamond / rhombus
    context.beginPath();
    context.moveTo(0, -h * 1.3);
    context.lineTo(h, 0);
    context.lineTo(0, h * 1.3);
    context.lineTo(-h, 0);
    context.closePath();
    context.fill();
    context.stroke();

  } else {
    // Fallback: square
    context.fillRect(-h, -h, size, size);
    context.strokeRect(-h, -h, size, size);
  }
}
