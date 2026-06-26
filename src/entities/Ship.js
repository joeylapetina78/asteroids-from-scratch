const ROTATION_SPEED = 4.5;
const THRUST_POWER = 280;
const REVERSE_THRUST_MULTIPLIER = 0.2;
const FUEL_BURN_RATE = 9;
const BRAKE_DRAG = 0.92;
const SPACE_DRAG = 0.995;

export class Ship {
  constructor(x, y, engine) {
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.angle = -Math.PI / 2;
    this.engine = engine;
    this.isThrusting = false;
  }

  update(deltaSeconds, input) {
    if (!this.engine.powered) {
      this.stopThrusting();
    } else {
      if (input.isDown("KeyA")) {
        this.angle -= ROTATION_SPEED * deltaSeconds;
      }

      if (input.isDown("KeyD")) {
        this.angle += ROTATION_SPEED * deltaSeconds;
      }

      this.isThrusting = input.isDown("KeyW") && this.engine.fuel > 0;
      if (this.isThrusting) {
        const thrustDirection = this.engine.thrustMode === "reverse" ? -1 : 1;
        const thrustPower = THRUST_POWER * (this.engine.thrustMode === "reverse" ? REVERSE_THRUST_MULTIPLIER : 1);

        this.engine.fuel = Math.max(0, this.engine.fuel - FUEL_BURN_RATE * deltaSeconds);
        this.velocity.x += Math.cos(this.angle) * thrustPower * thrustDirection * deltaSeconds;
        this.velocity.y += Math.sin(this.angle) * thrustPower * thrustDirection * deltaSeconds;
      }

      if (input.isDown("KeyS")) {
        this.velocity.x *= BRAKE_DRAG;
        this.velocity.y *= BRAKE_DRAG;
      }
    }

    this.velocity.x *= SPACE_DRAG;
    this.velocity.y *= SPACE_DRAG;

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
  }

  stopThrusting() {
    this.isThrusting = false;
  }

  draw(context, camera) {
    const screenX = this.position.x - camera.x;
    const screenY = this.position.y - camera.y;

    context.save();
    context.translate(screenX, screenY);
    context.rotate(this.angle);

    context.lineWidth = 2;
    context.strokeStyle = this.engine.powered ? "#f5f7fb" : "#555b66";
    context.fillStyle = this.engine.powered ? "#f5f7fb" : "#20242b";

    context.beginPath();
    context.moveTo(22, 0);
    context.lineTo(-14, -12);
    context.lineTo(-8, 0);
    context.lineTo(-14, 12);
    context.closePath();
    context.fill();
    context.stroke();

    if (this.isThrusting) {
      context.strokeStyle = "#ffcc66";
      context.beginPath();
      if (this.engine.thrustMode === "reverse") {
        context.moveTo(16, -4);
        context.lineTo(28 + Math.random() * 6, 0);
        context.lineTo(16, 4);
      } else {
        context.moveTo(-12, -6);
        context.lineTo(-26 - Math.random() * 10, 0);
        context.lineTo(-12, 6);
      }
      context.stroke();
    }

    context.restore();
  }
}
