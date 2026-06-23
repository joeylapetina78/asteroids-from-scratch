const BULLET_SPEED = 500;
const BULLET_LIFETIME = 1.4;
const BULLET_RADIUS = 1.25;

export class Bullet {
  constructor(ship) {
    this.position = {
      x: ship.position.x + Math.cos(ship.angle) * 24,
      y: ship.position.y + Math.sin(ship.angle) * 24,
    };
    this.velocity = {
      x: ship.velocity.x + Math.cos(ship.angle) * BULLET_SPEED,
      y: ship.velocity.y + Math.sin(ship.angle) * BULLET_SPEED,
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
