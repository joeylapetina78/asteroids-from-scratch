const ROTATION_SPEED = 4.5;
const THRUST_POWER = 280;
const BRAKE_DRAG = 0.92;
const SPACE_DRAG = 0.995;
const SHIP_RADIUS = 18;

export class Ship {
  constructor(x, y) {
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.angle = -Math.PI / 2;
    this.isThrusting = false;
  }

  update(deltaSeconds, input, bounds) {
    if (input.isDown("KeyA")) {
      this.angle -= ROTATION_SPEED * deltaSeconds;
    }

    if (input.isDown("KeyD")) {
      this.angle += ROTATION_SPEED * deltaSeconds;
    }

    this.isThrusting = input.isDown("KeyW");
    if (this.isThrusting) {
      this.velocity.x += Math.cos(this.angle) * THRUST_POWER * deltaSeconds;
      this.velocity.y += Math.sin(this.angle) * THRUST_POWER * deltaSeconds;
    }

    if (input.isDown("KeyS")) {
      this.velocity.x *= BRAKE_DRAG;
      this.velocity.y *= BRAKE_DRAG;
    }

    this.velocity.x *= SPACE_DRAG;
    this.velocity.y *= SPACE_DRAG;

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;

    this.wrapAround(bounds);
  }

  wrapAround(bounds) {
    if (this.position.x < -SHIP_RADIUS) {
      this.position.x = bounds.width + SHIP_RADIUS;
    } else if (this.position.x > bounds.width + SHIP_RADIUS) {
      this.position.x = -SHIP_RADIUS;
    }

    if (this.position.y < -SHIP_RADIUS) {
      this.position.y = bounds.height + SHIP_RADIUS;
    } else if (this.position.y > bounds.height + SHIP_RADIUS) {
      this.position.y = -SHIP_RADIUS;
    }
  }

  draw(context) {
    context.save();
    context.translate(this.position.x, this.position.y);
    context.rotate(this.angle);

    context.lineWidth = 2;
    context.strokeStyle = "#f5f7fb";
    context.fillStyle = "#07080c";

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
      context.moveTo(-12, -6);
      context.lineTo(-26 - Math.random() * 10, 0);
      context.lineTo(-12, 6);
      context.stroke();
    }

    context.restore();
  }
}
