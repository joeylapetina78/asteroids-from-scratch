import { applyCraftUse, ensureCraftComponents } from "../systems/componentCondition.js?v=fresh-20260918-1800-ebd21f89";

const PORTAL_COMPONENTS = Object.freeze([
  { id: "rift-core", label: "Rift Core", capabilityIds: ["hold-gate"] },
  { id: "wave-fabricator", label: "Wave Fabricator", capabilityIds: ["fabricate-guard"] },
  { id: "shield-array", label: "Shield Array", capabilityIds: ["shield-gate"] },
  { id: "anchor", label: "Spatial Anchor", capabilityIds: ["stabilize-gate"] },
]);

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
    // Every living unit fabricated by this gate, including raiders that have
    // ranged beyond the close shield orbit. `guardIds` remains the nearby
    // shield screen; this registry is the gate's actual outstanding force.
    this.unitIds = new Set();
    this.devices = [];
    this.isWaveHeld = false;
    this.isAlive = true;
    ensureCraftComponents(this, PORTAL_COMPONENTS);
  }

  update(deltaSeconds, livingGuards, livingUnits = livingGuards) {
    this.age += deltaSeconds;
    this.guardIds = new Set([...this.guardIds].filter((id) => livingGuards.has(id)));
    this.unitIds = new Set([...this.unitIds].filter((id) => livingUnits.has(id)));
    this.nextWaveIn = Math.max(0, this.nextWaveIn - deltaSeconds);
    this.devices.forEach((device) => {
      device.pulse = (device.pulse ?? 0) + deltaSeconds;
    });
    applyCraftUse(this, {
      "rift-core": deltaSeconds * 0.000012,
      anchor: deltaSeconds * 0.000008,
      "shield-array": this.isShielded ? deltaSeconds * 0.00002 : 0,
    });
  }

  recordWaveFabrication(count) {
    applyCraftUse(this, { "wave-fabricator": Math.max(0, count) * 0.0015, "rift-core": Math.max(0, count) * 0.00035 });
  }

  get isShielded() {
    return this.guardIds.size > 0;
  }

  getEncounterState() {
    if (this.age < 5) return { id: "forming", label: "FORMING", color: "#aeeeff" };
    if (this.isWaveHeld) {
      return this.isShielded
        ? { id: "guarded", label: "GUARDS HOLD", color: "#ffb2d0" }
        : { id: "raiders-out", label: "RAIDERS OUT", color: "#ffd36b" };
    }
    if (!this.scoutingComplete) return { id: "scouting", label: "SEEDING", color: "#e09cff" };
    if (this.isShielded) {
      return { id: "shielded", label: "SHIELDED", color: "#ff74ae" };
    }
    if (this.nextWaveIn <= 12) return { id: "charging", label: "REINFORCING", color: "#ffd36b" };
    return { id: "exposed", label: "EXPOSED", color: "#d9a7ff" };
  }

  // Returns true when the hit landed at full strength, false when the guard
  // shield absorbed most of it. Shielded hits still chip health so a portal
  // can never become permanently unkillable behind an uncleared wave.
  damage(amount) {
    const shielded = this.isShielded;
    const appliedAmount = shielded ? amount * PORTAL_SHIELD_CHIP_FACTOR : amount;

    this.health = Math.max(0, this.health - appliedAmount);
    applyCraftUse(this, { "rift-core": appliedAmount / this.maxHealth, "shield-array": shielded ? appliedAmount / this.maxHealth * 0.5 : 0 });
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
    const encounterState = this.getEncounterState();

    context.save();
    context.translate(x, y);

    context.strokeStyle = encounterState.color;
    context.fillStyle = this.isShielded ? "rgba(82, 13, 42, 0.18)" : "rgba(56, 16, 92, 0.18)";
    context.lineWidth = 2.2;
    context.setLineDash(this.isShielded ? [10, 7] : []);
    context.beginPath();
    context.arc(0, 0, ringRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = encounterState.color;
    context.font = "bold 9px monospace";
    context.textAlign = "center";
    context.fillText(encounterState.label, 0, -this.radius - 40);
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

  }

  drawDevices(context, camera) {
    this.devices.filter((device) => device.isAlive).forEach((device) => {
      const x = device.position.x - camera.x;
      const y = device.position.y - camera.y;
      const pulse = 0.5 + Math.sin((device.pulse ?? 0) * 3.2) * 0.5;

      context.save();
      context.translate(x, y);

      if (device.motion) {
        const startX = device.motion.origin.x - device.motion.axis.x * device.motion.distance - device.position.x;
        const startY = device.motion.origin.y - device.motion.axis.y * device.motion.distance - device.position.y;
        const endX = device.motion.origin.x + device.motion.axis.x * device.motion.distance - device.position.x;
        const endY = device.motion.origin.y + device.motion.axis.y * device.motion.distance - device.position.y;
        context.strokeStyle = "rgba(224, 156, 255, 0.24)";
        context.setLineDash([5, 8]);
        context.beginPath(); context.moveTo(startX, startY); context.lineTo(endX, endY); context.stroke();
        context.setLineDash([]);
      }

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
      } else if (device.type === "rift-mine") {
        context.strokeStyle = "rgba(124, 232, 255, 0.9)";
        context.fillStyle = "rgba(44, 125, 178, 0.18)";
        context.lineWidth = 1.8;
        context.rotate((device.pulse ?? 0) * -0.55);
        context.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const angle = (Math.PI * 2 * index) / 6;
          const radius = index % 2 === 0 ? 20 + pulse * 3 : 8;
          const px = Math.cos(angle) * radius;
          const py = Math.sin(angle) * radius;
          if (index === 0) context.moveTo(px, py); else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(0, 0, 4 + pulse * 2, 0, Math.PI * 2);
        context.stroke();
      } else {
        const bloomColor = {
          "drag-bloom": "123, 94, 255", "slip-bloom": "96, 220, 255", "gust-bloom": "255, 218, 112",
          "venom-bloom": "116, 255, 132", "static-bloom": "255, 255, 255", "thrust-bloom": "255, 126, 72",
          "brake-bloom": "92, 150, 255", "spiral-bloom": "224, 126, 255", "pulse-bloom": "255, 105, 183",
        }[device.type] ?? "123, 94, 255";
        context.strokeStyle = `rgba(${bloomColor}, ${0.3 + pulse * 0.25})`;
        context.fillStyle = `rgba(${bloomColor}, 0.08)`;
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
