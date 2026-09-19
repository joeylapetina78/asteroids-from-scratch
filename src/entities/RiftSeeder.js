import { advanceFlightBody, getTurnTowardAngle, wrapAngle } from "../systems/flightPhysics.js?v=fresh-20260919-1538-9d02b382";

// This is an industrial siege craft, not a fighter. Its mass and saw-mouth
// should read as patient, inevitable machinery rather than a fast fly-by.
const FLIGHT = { rotationSpeed: 0.72, thrustPower: 44, maxSpeed: 52, brakeDrag: 0.86, spaceDrag: 0.992 };
const ARRIVAL_DISTANCE = 72;
const DEPLOY_SECONDS = 4.8;
const PERIMETER_CLEARANCE = 150;
const PERIMETER_SPEED = 38;

export class RiftSeeder {
  constructor({ id, x, y, angle = 0, seed = 1, sourcePortalId = null }) {
    this.id = id;
    this.type = "rift-seeder";
    this.role = "invader";
    this.name = "Rift Perimeter Seeder";
    this.sourcePortalId = sourcePortalId;
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.angle = angle;
    this.radius = 48;
    this.health = 520;
    this.maxHealth = 520;
    this.seed = seed;
    this.isAlive = true;
    this.isThrusting = false;
    this.phase = "scanning";
    this.scanTimer = 2.5;
    this.orbitAngle = 0;
    this.orbitTravel = 0;
    this.deployCooldown = 0.8;
    this.pendingDeployments = [];
    this.returnedToGate = false;
    this.pulse = seed * 0.017;
  }

  update(deltaSeconds, world) {
    this.pulse += deltaSeconds;
    this.deployCooldown = Math.max(0, this.deployCooldown - deltaSeconds);
    const portal = world.portalPosition ?? this.position;
    const hubs = (world.worldSites ?? []).filter((site) => site.type === "hub");

    if (this.phase === "scanning") {
      this.scanTimer -= deltaSeconds;
      if (this.scanTimer <= 0) {
        this.targetHub = hubs.sort((a, b) => distance(this.position, a.position) - distance(this.position, b.position))[0] ?? null;
        if (!this.targetHub) this.phase = "returning";
        else {
          this.orbitRadius = Math.max(620, (this.targetHub.interactionRadius ?? 180) * 8 + PERIMETER_CLEARANCE);
          this.orbitAngle = Math.atan2(this.position.y - this.targetHub.position.y, this.position.x - this.targetHub.position.x);
          // Portals can open inside a defence jurisdiction. Before beginning
          // the survey, take the shortest radial path out instead of crossing
          // the hub on the way to an arbitrary point on the far perimeter.
          this.egressTarget = orbitPoint(this.targetHub.position, this.orbitRadius, this.orbitAngle);
          this.phase = "egress";
        }
      }
      this.flyToward(portal, deltaSeconds, true);
      return;
    }

    if (this.phase === "egress") {
      this.flyToward(this.egressTarget, deltaSeconds);
      this.deployWake();
      if (distance(this.position, this.egressTarget) <= ARRIVAL_DISTANCE) {
        this.phase = "orbiting";
        this.velocity.x *= 0.35;
        this.velocity.y *= 0.35;
      }
      return;
    }

    if (this.phase === "orbiting") {
      // Advance by linear perimeter speed, not a fixed angular rate. A large
      // jurisdiction therefore remains a long, plodding circuit and the target
      // waypoint never races ahead far enough to make the craft cut a chord.
      const step = deltaSeconds * PERIMETER_SPEED / this.orbitRadius;
      this.orbitAngle += step;
      this.orbitTravel += step;
      const lookAhead = Math.min(0.055, 90 / this.orbitRadius);
      const target = orbitPoint(this.targetHub.position, this.orbitRadius, this.orbitAngle + lookAhead);
      this.flyToward(target, deltaSeconds);
      this.deployWake();
      if (this.orbitTravel >= Math.PI * 2) this.phase = "returning";
      return;
    }

    this.flyToward(portal, deltaSeconds);
    this.deployWake();
    if (distance(this.position, portal) <= 82) {
      this.returnedToGate = true;
      this.isAlive = false;
    }
  }

  flyToward(target, deltaSeconds, brake = false) {
    const targetAngle = Math.atan2(target.y - this.position.y, target.x - this.position.x);
    const error = wrapAngle(targetAngle - this.angle);
    advanceFlightBody(this, deltaSeconds, {
      turn: getTurnTowardAngle(this.angle, targetAngle),
      thrust: !brake && Math.abs(error) < 0.82,
      brake,
    }, FLIGHT);
  }

  consumeDeployments() {
    const deployments = this.pendingDeployments;
    this.pendingDeployments = [];
    return deployments;
  }

  deployWake() {
    if (this.deployCooldown > 0) return;
    this.pendingDeployments.push({
      position: {
        x: this.position.x - Math.cos(this.angle) * this.radius * 0.8,
        y: this.position.y - Math.sin(this.angle) * this.radius * 0.8,
      },
      heading: this.angle,
      sequence: this.deploySequence ?? 0,
    });
    this.deploySequence = (this.deploySequence ?? 0) + 1;
    this.deployCooldown = DEPLOY_SECONDS;
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) this.isAlive = false;
  }

  draw(context, camera) {
    const x = this.position.x - camera.x;
    const y = this.position.y - camera.y;
    context.save();
    context.translate(x, y);
    context.rotate(this.angle);
    context.fillStyle = "rgba(105, 36, 132, 0.42)";
    context.strokeStyle = "#e09cff";
    context.lineWidth = 2.4;
    context.beginPath();
    context.moveTo(45, 0); context.lineTo(12, -34); context.lineTo(-42, -25);
    context.lineTo(-31, 0); context.lineTo(-42, 25); context.lineTo(12, 34); context.closePath();
    context.fill(); context.stroke();
    context.strokeStyle = "rgba(255, 255, 255, 0.55)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 54, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.health / this.maxHealth));
    context.stroke();
    context.save();
    context.rotate(-this.angle);
    context.fillStyle = "#f0c5ff";
    context.font = "bold 10px monospace";
    context.textAlign = "center";
    context.fillText("RIFT SEEDER", 0, -61);
    context.fillStyle = "rgba(224, 156, 255, 0.82)";
    context.font = "8px monospace";
    context.fillText(this.phase.toUpperCase(), 0, -50);
    context.restore();
    for (const side of [-1, 1]) {
      context.save();
      context.translate(38, side * 19);
      context.rotate((this.pulse * 7.5) * side);
      context.strokeStyle = "#ffd4eb";
      context.beginPath();
      for (let i = 0; i < 12; i += 1) {
        const a = i * Math.PI / 6;
        const r = i % 2 ? 11 : 17;
        const px = Math.cos(a) * r; const py = Math.sin(a) * r;
        if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.closePath(); context.stroke(); context.restore();
    }
    context.restore();
  }
}

function orbitPoint(center, radius, angle) {
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
