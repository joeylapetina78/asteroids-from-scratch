const PORTAL_RADIUS = 56;
const PORTAL_MAX_HEALTH = 220;
// The guard shield absorbs most damage but never all of it. A binary shield
// let a portal become permanently unkillable once waves outpaced the player.
const PORTAL_SHIELD_CHIP_FACTOR = 0.2;

export class InvaderPortal {
  constructor({ id, x, y, factionId = "rift-callers", seed = 1 }) {
    this.id = id;
    this.factionId = factionId;
    this.position = { x, y };
    this.radius = PORTAL_RADIUS;
    this.maxHealth = PORTAL_MAX_HEALTH;
    this.health = PORTAL_MAX_HEALTH;
    this.seed = seed;
    this.age = 0;
    this.waveCount = 0;
    this.nextWaveIn = 0;
    this.guardIds = new Set();
    this.devices = [];
    this.isAlive = true;
  }

  update(deltaSeconds, livingGuards) {
    this.age += deltaSeconds;
    this.guardIds = new Set([...this.guardIds].filter((id) => livingGuards.has(id)));
    this.nextWaveIn = Math.max(0, this.nextWaveIn - deltaSeconds);
    this.devices.forEach((device) => {
      device.pulse = (device.pulse ?? 0) + deltaSeconds;
    });
  }

  get isShielded() {
    return this.guardIds.size > 0;
  }

  // Returns true when the hit landed at full strength, false when the guard
  // shield absorbed most of it. Shielded hits still chip health so a portal
  // can never become permanently unkillable behind an uncleared wave.
  damage(amount) {
    const shielded = this.isShielded;
    const appliedAmount = shielded ? amount * PORTAL_SHIELD_CHIP_FACTOR : amount;

    this.health = Math.max(0, this.health - appliedAmount);
    if (this.health === 0) {
      this.isAlive = false;
    }
    return !shielded;
  }

  draw(context, camera) {
    const x = this.position.x - camera.x;
    const y = this.position.y - camera.y;
    const pulse = 0.5 + Math.sin(this.age * 4.2 + this.seed) * 0.5;
    const ringRadius = this.radius + pulse * 8;
    const healthRatio = this.maxHealth > 0 ? this.health / this.maxHealth : 0;

    context.save();
    context.translate(x, y);

    context.strokeStyle = this.isShielded ? "rgba(255, 116, 174, 0.78)" : "rgba(177, 102, 255, 0.82)";
    context.fillStyle = this.isShielded ? "rgba(82, 13, 42, 0.18)" : "rgba(56, 16, 92, 0.18)";
    context.lineWidth = 2.2;
    context.setLineDash(this.isShielded ? [10, 7] : []);
    context.beginPath();
    context.arc(0, 0, ringRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.setLineDash([]);

    context.strokeStyle = "rgba(224, 189, 255, 0.72)";
    context.lineWidth = 1.25;
    for (let index = 0; index < 5; index += 1) {
      const angle = this.age * (0.4 + index * 0.06) + index * ((Math.PI * 2) / 5);
      const inner = this.radius * 0.3;
      const outer = this.radius * (0.75 + pulse * 0.12);
      context.beginPath();
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.quadraticCurveTo(
        Math.cos(angle + 0.65) * this.radius * 0.55,
        Math.sin(angle + 0.65) * this.radius * 0.55,
        Math.cos(angle + 1.4) * outer,
        Math.sin(angle + 1.4) * outer,
      );
      context.stroke();
    }

    context.fillStyle = "rgba(22, 6, 36, 0.86)";
    context.strokeStyle = "rgba(255, 232, 255, 0.68)";
    context.lineWidth = 1.8;
    context.beginPath();
    context.arc(0, 0, 15 + pulse * 4, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.strokeStyle = "rgba(255, 211, 107, 0.88)";
    context.lineWidth = 2.2;
    const tickCount = Math.max(1, this.waveCount);
    for (let index = 0; index < tickCount; index += 1) {
      const angle = -Math.PI / 2 + index * 0.22;
      context.beginPath();
      context.moveTo(Math.cos(angle) * (this.radius + 14), Math.sin(angle) * (this.radius + 14));
      context.lineTo(Math.cos(angle) * (this.radius + 24), Math.sin(angle) * (this.radius + 24));
      context.stroke();
    }

    context.strokeStyle = "rgba(255, 255, 255, 0.45)";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, this.radius + 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * healthRatio);
    context.stroke();

    context.restore();

    this.drawDevices(context, camera);
  }

  drawDevices(context, camera) {
    this.devices.filter((device) => device.isAlive).forEach((device) => {
      const x = device.position.x - camera.x;
      const y = device.position.y - camera.y;
      const pulse = 0.5 + Math.sin((device.pulse ?? 0) * 3.2) * 0.5;

      context.save();
      context.translate(x, y);

      if (device.type === "rift-sentry") {
        context.fillStyle = "rgba(255, 116, 174, 0.18)";
        context.strokeStyle = "#ff74ae";
        context.lineWidth = 2;
        context.rotate((device.pulse ?? 0) * 0.7);
        context.beginPath();
        context.moveTo(0, -18);
        context.lineTo(16, 0);
        context.lineTo(0, 18);
        context.lineTo(-16, 0);
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(0, 0, 5 + pulse * 2, 0, Math.PI * 2);
        context.stroke();
      } else {
        context.strokeStyle = `rgba(123, 94, 255, ${0.3 + pulse * 0.25})`;
        context.fillStyle = "rgba(66, 38, 135, 0.08)";
        context.lineWidth = 1.5;
        context.setLineDash([7, 8]);
        context.beginPath();
        context.arc(0, 0, device.radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.setLineDash([]);
        context.strokeStyle = "rgba(194, 178, 255, 0.72)";
        context.beginPath();
        context.arc(0, 0, 16 + pulse * 3, 0, Math.PI * 2);
        context.stroke();
      }

      context.restore();
    });
  }
}
