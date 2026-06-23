const SPRING_STRENGTH = 0.012;
const DRIFT_DAMPING = 0.999;

export class Asteroid {
  constructor({ x, y, radius, color, points, velocity }) {
    this.origin = { x, y };
    this.position = { x, y };
    this.velocity = velocity;
    this.radius = radius;
    this.color = color;
    this.points = points;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = randomRange(-0.25, 0.25);
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

export function createRandomAsteroid(x, y) {
  const radius = randomRange(34, 92);
  const pointCount = Math.floor(randomRange(8, 15));
  const points = [];

  for (let index = 0; index < pointCount; index += 1) {
    points.push({
      angle: (Math.PI * 2 * index) / pointCount,
      distance: radius * randomRange(0.68, 1.18),
    });
  }

  return new Asteroid({
    x,
    y,
    radius,
    color: randomColor(),
    points,
    velocity: {
      x: randomRange(-10, 10),
      y: randomRange(-10, 10),
    },
  });
}

function randomColor() {
  const colors = ["#5cc8ff", "#ffcc66", "#ff7a90", "#9dff8a", "#d99cff", "#ffffff"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}
