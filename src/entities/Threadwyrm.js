const SEGMENT_SPACING = 42;
const BODY_SEGMENTS = 26;
const BODY_WIDTH = 26;
const STRIKE_RANGE = 54;
const STRIKE_DAMAGE = 8;
const STRIKE_COOLDOWN_SECONDS = 2.8;

export class Threadwyrm {
  constructor({ id, path, seed, speed = 34 }) {
    this.id = id;
    this.type = "threadwyrm";
    this.path = path;
    this.seed = seed;
    this.speed = speed;
    this.pathLength = getPathLength(path);
    this.travel = seed % Math.max(1, this.pathLength);
    this.radius = BODY_SEGMENTS * SEGMENT_SPACING * 0.5;
    this.position = { ...samplePath(path, this.travel, this.pathLength).position };
    this.strikeCharge = 0;
    this.strikeCooldown = 0;
    this.lastHit = null;
  }

  update(deltaSeconds, world) {
    this.lastHit = null;
    this.travel = wrapDistance(this.travel + this.speed * deltaSeconds, this.pathLength);
    this.strikeCooldown = Math.max(0, this.strikeCooldown - deltaSeconds);
    this.strikeCharge = Math.max(0, this.strikeCharge - deltaSeconds * 0.55);
    this.position = { ...samplePath(this.path, this.travel, this.pathLength).position };

    const segments = this.getSegments();
    const shipDistance = getDistanceToBody(world.ship.position, segments);
    const disturbancePressure = getDisturbancePressure(world.disturbances ?? [], segments);

    if (world.shipPowered && shipDistance < STRIKE_RANGE * 1.35) {
      this.strikeCharge = Math.min(1, this.strikeCharge + deltaSeconds * 1.8);
    }

    if (disturbancePressure > 0) {
      this.strikeCharge = Math.min(1, this.strikeCharge + deltaSeconds * disturbancePressure * 1.6);
    }

    if (this.strikeCharge >= 1 && this.strikeCooldown === 0 && shipDistance < STRIKE_RANGE) {
      this.strikeCooldown = STRIKE_COOLDOWN_SECONDS;
      this.strikeCharge = 0.15;
      this.lastHit = {
        damage: STRIKE_DAMAGE,
        distance: Math.round(shipDistance),
      };
    }
  }

  getSegments() {
    const segments = [];

    for (let index = 0; index < BODY_SEGMENTS; index += 1) {
      const sample = samplePath(this.path, this.travel - index * SEGMENT_SPACING, this.pathLength);
      const taper = 1 - index / BODY_SEGMENTS;
      segments.push({
        ...sample,
        width: BODY_WIDTH * (0.35 + taper * 0.75),
        alpha: 0.15 + taper * 0.35,
      });
    }

    return segments;
  }

  consumeHit() {
    const hit = this.lastHit;
    this.lastHit = null;
    return hit;
  }

  draw(context, camera) {
    const segments = this.getSegments();
    const pulse = 0.5 + Math.sin(performance.now() / 620 + this.seed) * 0.2;

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    for (let index = segments.length - 1; index > 0; index -= 1) {
      const segment = segments[index];
      const next = segments[index - 1];

      context.strokeStyle = `rgba(132, 255, 236, ${segment.alpha * (0.52 + pulse)})`;
      context.lineWidth = segment.width;
      context.beginPath();
      context.moveTo(segment.position.x - camera.x, segment.position.y - camera.y);
      context.lineTo(next.position.x - camera.x, next.position.y - camera.y);
      context.stroke();
    }

    segments.forEach((segment, index) => {
      const screenX = segment.position.x - camera.x;
      const screenY = segment.position.y - camera.y;
      const eye = index === 0;

      context.fillStyle = eye ? "rgba(226, 255, 248, 0.88)" : `rgba(103, 255, 224, ${segment.alpha * 0.75})`;
      context.strokeStyle = eye ? "rgba(176, 255, 244, 0.92)" : "rgba(176, 255, 244, 0.26)";
      context.lineWidth = eye ? 2 : 1;
      context.beginPath();
      context.ellipse(screenX, screenY, segment.width * 0.42, segment.width * 0.22, segment.angle, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });

    if (this.strikeCharge > 0.08) {
      const head = segments[0];

      context.strokeStyle = `rgba(255, 122, 194, ${0.25 + this.strikeCharge * 0.45})`;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(head.position.x - camera.x, head.position.y - camera.y, 34 + this.strikeCharge * 18, 0, Math.PI * 2);
      context.stroke();
    }

    context.restore();
  }
}

function getPathLength(path) {
  return path.reduce((sum, point, index) => {
    const next = path[(index + 1) % path.length];
    return sum + distance(point, next);
  }, 0);
}

function samplePath(path, travel, pathLength) {
  let remaining = wrapDistance(travel, pathLength);

  for (let index = 0; index < path.length; index += 1) {
    const start = path[index];
    const end = path[(index + 1) % path.length];
    const segmentLength = distance(start, end);

    if (remaining <= segmentLength) {
      const blend = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        position: {
          x: start.x + (end.x - start.x) * blend,
          y: start.y + (end.y - start.y) * blend,
        },
        angle: Math.atan2(end.y - start.y, end.x - start.x),
      };
    }

    remaining -= segmentLength;
  }

  return {
    position: { ...path[0] },
    angle: 0,
  };
}

function getDistanceToBody(position, segments) {
  return segments.reduce((nearest, segment) => Math.min(nearest, distance(position, segment.position)), Infinity);
}

function getDisturbancePressure(disturbances, segments) {
  return disturbances.reduce((pressure, disturbance) => {
    const distanceToBody = getDistanceToBody(disturbance.position, segments);

    if (distanceToBody > disturbance.radius) {
      return pressure;
    }

    const closeness = 1 - distanceToBody / Math.max(1, disturbance.radius);
    const typeWeight = disturbance.type === "weapon" ? 1.4 : 0.68;

    return pressure + closeness * typeWeight * (disturbance.intensity ?? 1);
  }, 0);
}

function wrapDistance(value, max) {
  if (max <= 0) {
    return 0;
  }

  return ((value % max) + max) % max;
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
