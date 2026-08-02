export class ShipWreck {
  constructor({ id, name, position, velocity, radius = 22, recordId }) {
    this.id = id;
    this.name = name;
    this.type = "ship-wreck";
    this.position = { ...position };
    this.velocity = { ...velocity };
    this.radius = radius;
    this.recordId = recordId;
    this.isAlive = true;
    this.rotation = 0;
  }

  update(deltaSeconds) {
    this.velocity.x *= 0.995;
    this.velocity.y *= 0.995;
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.rotation += deltaSeconds * 0.12;
  }

  draw(context, camera) {
    context.save();
    context.translate(this.position.x - camera.x, this.position.y - camera.y);
    context.rotate(this.rotation);
    context.strokeStyle = "#ffb48f";
    context.fillStyle = "rgba(84, 45, 42, 0.42)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(24, 0);
    context.lineTo(5, -14);
    context.lineTo(-18, -8);
    context.lineTo(-9, 2);
    context.lineTo(-17, 12);
    context.lineTo(7, 9);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }
}

