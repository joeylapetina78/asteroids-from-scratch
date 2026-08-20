import { WHITE_ASTEROID_COLOR } from "./Asteroid.js?v=fresh-20260820-0645-f8c9397";
import { createRandom, randomRange } from "../systems/random.js?v=fresh-20260820-0645-f8c9397";
import { RESOURCE_COLOR, getResourceShape, normalizeResourceType } from "../systems/resourceDefinitions.js?v=fresh-20260820-0645-f8c9397";
import { ROCKMOSS_CRAWLER_TYPE, getStrainAppearance } from "../systems/rockmossStrains.js?v=fresh-20260820-0645-f8c9397";

const PICKUP_RADIUS = 10;
const PICKUP_DRAG = 0.985;

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
  constructor({ x, y, type, velocity, sourceClaimId = null, sourceClaimName = null, tradeValue = null, label = null, quantity = 1, strain = null }) {
    this.position = { x, y };
    this.velocity = velocity;
    this.type = normalizeResourceType(type);
    this.sourceClaimId = sourceClaimId;
    this.sourceClaimName = sourceClaimName;
    this.tradeValue = tradeValue;
    this.label = label;
    this.quantity = quantity;
    this.strain = strain; // rock-life strain carried by a rockmoss-crawler spore
    // A spore wears its parent strain; everything else wears its resource family.
    const appearance = this.type === ROCKMOSS_CRAWLER_TYPE ? getStrainAppearance(strain) : null;
    this.color = appearance?.color ?? RESOURCE_COLOR[this.type] ?? "#888888";
    this.accent = appearance?.accent ?? null;
    this.radius = PICKUP_RADIUS;
    this.shape = appearance?.shape ?? getResourceShape(this.type);
    this.size = SHAPE_SIZE[this.shape] ?? (appearance ? 10 : 7);
    // How long this has been lying unclaimed. Grazers will not touch a fresh
    // drop, so the ordinary crack-a-rock-and-scoop-it-up loop is never disturbed.
    this.age = 0;
    this.grazedSeconds = 0;
  }

  update(deltaSeconds) {
    this.age += deltaSeconds;
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
      drawCrawlerPickup(context, this.shape, this.size, this.color, this.accent);
    } else {
      drawResourceShape(context, this.shape, this.size);
    }

    context.restore();
  }
}

// A crawler in the world keeps its legs and its breathing pulse — that is what
// makes it read as alive rather than as a lump of ore. Only the BODY varies by
// strain, using the same silhouette the cargo hold draws, so the thing you
// scooped up is recognisably the thing now sitting in your hold.
function drawCrawlerPickup(context, shape, size, color, accent) {
  const pulse = 0.85 + Math.sin(performance.now() / 170) * 0.12;
  const bodyLength = size * 0.95 * pulse;
  const bodyWidth = size * 0.48;

  context.fillStyle = color;
  context.strokeStyle = accent ?? "rgba(213, 255, 188, 0.9)";
  context.save();
  context.scale(pulse, pulse);
  drawSporeBody(context, shape, size);
  context.restore();

  context.strokeStyle = accent ?? "rgba(114, 255, 201, 0.7)";
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

  } else if (shape.startsWith("spore-")) {
    drawSporeBody(context, shape, size);

  } else {
    context.fillRect(-h, -h, size, size);
    context.strokeRect(-h, -h, size, size);
  }
}

// A spore's silhouette echoes the growth-shape of the rock-life it came from, so
// six strains in a cargo hold read as six different things rather than as six
// identical green blobs. Shared by the drifting pickup and the hold, which is
// why it lives beside the ore shapes instead of inside the pickup's own draw.
export function drawSporeBody(context, shape, size) {
  const h = size / 2;

  if (shape === "spore-crystal") {
    // Faceted, like the crystal growth it seeds.
    context.beginPath();
    context.moveTo(0, -h * 1.25);
    context.lineTo(h * 0.62, -h * 0.2);
    context.lineTo(h * 0.38, h * 1.1);
    context.lineTo(-h * 0.38, h * 1.1);
    context.lineTo(-h * 0.62, -h * 0.2);
    context.closePath();
    context.fill();
    context.stroke();

  } else if (shape === "spore-tube") {
    // A stubby capsule — the tube strain's segment.
    const halfLength = h * 1.15;
    const halfWidth = h * 0.46;
    context.beginPath();
    context.moveTo(-halfLength + halfWidth, -halfWidth);
    context.lineTo(halfLength - halfWidth, -halfWidth);
    context.arc(halfLength - halfWidth, 0, halfWidth, -Math.PI / 2, Math.PI / 2);
    context.lineTo(-halfLength + halfWidth, halfWidth);
    context.arc(-halfLength + halfWidth, 0, halfWidth, Math.PI / 2, -Math.PI / 2);
    context.closePath();
    context.fill();
    context.stroke();

  } else if (shape === "spore-crust") {
    // Low and plated, the way crust creeps flat across a rock.
    context.beginPath();
    context.moveTo(-h, h * 0.42);
    context.lineTo(-h * 0.62, -h * 0.36);
    context.lineTo(0, -h * 0.62);
    context.lineTo(h * 0.62, -h * 0.36);
    context.lineTo(h, h * 0.42);
    context.closePath();
    context.fill();
    context.stroke();

  } else if (shape === "spore-glow") {
    // A bright core inside a soft halo.
    context.beginPath();
    context.arc(0, 0, h * 0.95, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.arc(0, 0, h * 0.42, 0, Math.PI * 2);
    context.stroke();

  } else if (shape === "spore-pod") {
    // A teardrop seed — the pod strain's whole reason for existing.
    context.beginPath();
    context.moveTo(0, -h * 1.25);
    context.bezierCurveTo(h * 0.95, -h * 0.35, h * 0.7, h * 0.95, 0, h * 1.1);
    context.bezierCurveTo(-h * 0.7, h * 0.95, -h * 0.95, -h * 0.35, 0, -h * 1.25);
    context.closePath();
    context.fill();
    context.stroke();

  } else {
    // spore-blob, and the fallback for any strain that has not declared a shape.
    context.beginPath();
    context.ellipse(0, 0, h * 1.05, h * 0.72, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
}
