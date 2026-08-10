const BULLET_SPEED = 500;
const BULLET_LIFETIME = 1.4;
const BULLET_RADIUS = 1.25;

export class Bullet {
  // `launchAngle` lets a worn mining laser fire off the ship's heading (aim
  // drift). Defaults to the ship's angle, so ordinary fire is unchanged.
  constructor(ship, launchAngle = null) {
    const angle = launchAngle ?? ship.angle;
    this.position = {
      x: ship.position.x + Math.cos(angle) * 24,
      y: ship.position.y + Math.sin(angle) * 24,
    };
    this.velocity = {
      x: ship.velocity.x + Math.cos(angle) * BULLET_SPEED,
      y: ship.velocity.y + Math.sin(angle) * BULLET_SPEED,
    };
    this.age = 0;
    this.radius = BULLET_RADIUS;
  }

  update(deltaSeconds) {
    this.age += deltaSeconds;
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
  }

  get isAlive() {
    return this.age < BULLET_LIFETIME;
  }

  destroy() {
    this.age = BULLET_LIFETIME;
  }

  draw(context, camera) {
    const screenX = this.position.x - camera.x;
    const screenY = this.position.y - camera.y;

    context.save();
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(screenX, screenY, BULLET_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}
