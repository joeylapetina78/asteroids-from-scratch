import { WHITE_ASTEROID_COLOR } from "./Asteroid.js?v=fresh-20260719-0052-baf9309";
import { createRandom, randomRange } from "../systems/random.js";
import { RESOURCE_COLOR, getResourceShape, normalizeResourceType } from "../systems/resourceDefinitions.js?v=fresh-20260719-0052-baf9309";

const PICKUP_RADIUS = 10;
const PICKUP_DRAG = 0.985;
const ROCKMOSS_CRAWLER_TYPE = "rockmoss-crawler";

// Named sizes per shape so volatiles (circle) feel lighter and strange (shard) feel larger.
const SHAPE_SIZE = {
  circle:   10,
  square:   9,
  triangle: 9,
  hexagon:  9,
  octagon:  9,
  diamond:  9,
  shard:    11,
};

export class ResourcePickup {
  constructor({ x, y, type, velocity, sourceClaimId = null, sourceClaimName = null }) {
    this.position = { x, y };
    this.velocity = velocity;
    this.type = normalizeResourceType(type);
    this.sourceClaimId = sourceClaimId;
    this.sourceClaimName = sourceClaimName;
    this.color = RESOURCE_COLOR[this.type] ?? "#888888";
    this.radius = PICKUP_RADIUS;
    this.shape = getResourceShape(this.type);
    this.size = SHAPE_SIZE[this.shape] ?? 7;
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

    if (this.type === ROCKMOSS_CRAWLER_TYPE) {
      drawCrawlerPickup(context, this.size);
    } else {
      drawResourceShape(context, this.shape, this.size);
    }

    context.restore();
  }
}

function drawCrawlerPickup(context, size) {
  const pulse = 0.85 + Math.sin(performance.now() / 170) * 0.12;
  const bodyLength = size * 0.95 * pulse;
  const bodyWidth = size * 0.48;

  context.fillStyle = "rgba(115, 255, 191, 0.78)";
  context.strokeStyle = "rgba(213, 255, 188, 0.9)";
  context.beginPath();
  context.ellipse(0, 0, bodyLength * 0.5, bodyWidth * 0.5, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.strokeStyle = "rgba(114, 255, 201, 0.7)";
  context.beginPath();
  context.moveTo(-bodyLength * 0.25, -bodyWidth * 0.45);
  context.lineTo(-bodyLength * 0.58, -bodyWidth * 0.82);
  context.moveTo(-bodyLength * 0.25, bodyWidth * 0.45);
  context.lineTo(-bodyLength * 0.58, bodyWidth * 0.82);
  context.moveTo(bodyLength * 0.22, -bodyWidth * 0.42);
  context.lineTo(bodyLength * 0.55, -bodyWidth * 0.72);
  context.moveTo(bodyLength * 0.22, bodyWidth * 0.42);
  context.lineTo(bodyLength * 0.55, bodyWidth * 0.72);
  context.stroke();
}

export function createResourcePickupsFromAsteroid(asteroid, seed, impactVelocity = { x: 0, y: 0 }, metadata = {}) {
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
        sourceClaimId: metadata.sourceClaimId ?? asteroid.sourceClaimId ?? null,
        sourceClaimName: metadata.sourceClaimName ?? asteroid.sourceClaimName ?? null,
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

// Shared shape drawing — called from ResourcePickup.draw and processor.js.
// Takes the SHAPE string (from getResourceShape), not the resource ID.
export function drawResourceShape(context, shape, size) {
  const h = size / 2;

  if (shape === "circle") {
    context.beginPath();
    context.arc(0, 0, h, 0, Math.PI * 2);
    context.fill();
    context.stroke();

  } else if (shape === "square") {
    context.fillRect(-h, -h, size, size);
    context.strokeRect(-h, -h, size, size);

  } else if (shape === "triangle") {
    const th = h * 1.155; // height of equilateral triangle with half-width h
    context.beginPath();
    context.moveTo(0, -th * 0.67);
    context.lineTo(h, th * 0.33);
    context.lineTo(-h, th * 0.33);
    context.closePath();
    context.fill();
    context.stroke();

  } else if (shape === "hexagon") {
    context.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = Math.cos(angle) * h;
      const py = Math.sin(angle) * h;
      if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
    context.stroke();

  } else if (shape === "octagon") {
    context.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) * i - Math.PI / 8;
      const px = Math.cos(angle) * h;
      const py = Math.sin(angle) * h;
      if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
    context.stroke();

  } else if (shape === "diamond") {
    context.beginPath();
    context.moveTo(0, -h * 1.3);
    context.lineTo(h, 0);
    context.lineTo(0, h * 1.3);
    context.lineTo(-h, 0);
    context.closePath();
    context.fill();
    context.stroke();

  } else if (shape === "shard") {
    // 4-pointed sharp star
    const tip = h * 1.4;
    const notch = h * 0.32;
    context.beginPath();
    context.moveTo(0, -tip);
    context.lineTo(notch, -notch);
    context.lineTo(tip, 0);
    context.lineTo(notch, notch);
    context.lineTo(0, tip);
    context.lineTo(-notch, notch);
    context.lineTo(-tip, 0);
    context.lineTo(-notch, -notch);
    context.closePath();
    context.fill();
    context.stroke();

  } else {
    context.fillRect(-h, -h, size, size);
    context.strokeRect(-h, -h, size, size);
  }
}
