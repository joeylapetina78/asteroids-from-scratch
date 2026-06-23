import { createRandom, randomRange } from "../systems/random.js";

const SPRING_STRENGTH = 0.012;
const DRIFT_DAMPING = 0.999;

export class Asteroid {
  constructor({ x, y, radius, color, resources, points, velocity, rotation, rotationSpeed }) {
    this.origin = { x, y };
    this.position = { x, y };
    this.velocity = velocity;
    this.radius = radius;
    this.color = color;
    this.resources = resources;
    this.points = points;
    this.rotation = rotation;
    this.rotationSpeed = rotationSpeed;
  }

  update(deltaSeconds) {
    const offsetX = this.position.x - this.origin.x;
    const offsetY = this.position.y - this.origin.y;

    this.velocity.x -= offsetX * SPRING_STRENGTH * deltaSeconds;
    this.velocity.y -= offsetY * SPRING_STRENGTH * deltaSeconds;
    this.velocity.x *= DRIFT_DAMPING;
    this.velocity.y *= DRIFT_DAMPING;

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.rotation += this.rotationSpeed * deltaSeconds;
  }

  draw(context, camera) {
    const screenX = this.position.x - camera.x;
    const screenY = this.position.y - camera.y;

    context.save();
    context.translate(screenX, screenY);
    context.rotate(this.rotation);

    context.lineWidth = 2;
    context.strokeStyle = this.color;
    context.fillStyle = "rgba(7, 8, 12, 0.85)";

    context.beginPath();
    this.points.forEach((point, index) => {
      const x = Math.cos(point.angle) * point.distance;
      const y = Math.sin(point.angle) * point.distance;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.closePath();
    context.fill();
    context.stroke();

    context.restore();
  }
}

export function createRandomAsteroid(x, y, profile, seed) {
  const random = createRandom(seed);
  const radius = randomRange(random, 30, 72) + profile.richness * 26;
  const pointCount = Math.floor(randomRange(random, 8, 15));
  const points = [];

  for (let index = 0; index < pointCount; index += 1) {
    points.push({
      angle: (Math.PI * 2 * index) / pointCount,
      distance: radius * randomRange(random, 0.68, 1.18),
    });
  }

  return new Asteroid({
    x,
    y,
    radius,
    color: profile.color,
    resources: profile.resources,
    points,
    velocity: {
      x: randomRange(random, -10, 10),
      y: randomRange(random, -10, 10),
    },
    rotation: random() * Math.PI * 2,
    rotationSpeed: randomRange(random, -0.25, 0.25),
  });
}
