import { advanceFlightBody, getTurnTowardAngle, wrapAngle } from "../systems/flightPhysics.js?v=fresh-20260719-2101-381ce20";

const FIGHTER_FLIGHT = {
  rotationSpeed: 2.55,
  thrustPower: 112,
  maxSpeed: 132,
  brakeDrag: 0.91,
  spaceDrag: 0.995,
};
const FIGHTER_ENGAGE_RANGE = 1080;
const FIGHTER_STANDOFF_DISTANCE = 430;
const FIGHTER_FIRE_RANGE = 610;
const FIGHTER_FIRE_ARC = 0.13;
const FIGHTER_FIRE_COOLDOWN = 1.05;
const FIGHTER_PROJECTILE_SPEED = 320;

export class FlightFighter {
  constructor({ id, x, y, angle = 0, seed = 1, sourcePortalId = null, name = "Rift Fighter" }) {
    this.id = id;
    this.type = "fighter";
    this.role = "invader";
    this.name = name;
    this.sourcePortalId = sourcePortalId;
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.angle = angle;
    this.radius = 20;
    this.health = 128;
    this.maxHealth = 128;
    this.seed = seed;
    this.isAlive = true;
    this.isThrusting = false;
    this.fireCooldown = 0.35 + (seed % 7) * 0.08;
    this.pendingShots = [];
    this.pulse = seed * 0.02;
  }

  update(deltaSeconds, world) {
    this.pulse += deltaSeconds;
    this.fireCooldown = Math.max(0, this.fireCooldown - deltaSeconds);

    const target = world.ship;
    const distanceToShip = Math.hypot(target.position.x - this.position.x, target.position.y - this.position.y);
    const isEngaging = world.shipPowered && distanceToShip <= FIGHTER_ENGAGE_RANGE;
    const aimTarget = isEngaging ? getLeadPosition(target, distanceToShip) : this.getPatrolTarget(world.portalPosition);
    const targetAngle = Math.atan2(aimTarget.y - this.position.y, aimTarget.x - this.position.x);
    const angleError = wrapAngle(targetAngle - this.angle);
    const retreating = isEngaging && distanceToShip < FIGHTER_STANDOFF_DISTANCE * 0.58;
    const shouldThrust = !retreating && (Math.abs(angleError) < 0.68 || distanceToShip > FIGHTER_STANDOFF_DISTANCE * 1.22);

    advanceFlightBody(
      this,
      deltaSeconds,
      {
        turn: getTurnTowardAngle(this.angle, targetAngle),
        thrust: shouldThrust,
        brake: retreating && Math.abs(angleError) < 0.35,
      },
      FIGHTER_FLIGHT,
    );

    if (isEngaging && distanceToShip <= FIGHTER_FIRE_RANGE && Math.abs(angleError) <= FIGHTER_FIRE_ARC && this.fireCooldown === 0) {
      this.fireCooldown = FIGHTER_FIRE_COOLDOWN;
      this.pendingShots.push(this.createShot());
    }
  }

  getPatrolTarget(portalPosition) {
    const center = portalPosition ?? this.position;
    const angle = this.pulse * 0.52 + this.seed * 0.007;
    const radius = 190 + (this.seed % 4) * 34;

    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  }

  createShot() {
    return {
      portalId: this.sourcePortalId,
      sourceType: "fighter",
      position: {
        x: this.position.x + Math.cos(this.angle) * 24,
        y: this.position.y + Math.sin(this.angle) * 24,
      },
      velocity: {
        x: this.velocity.x + Math.cos(this.angle) * FIGHTER_PROJECTILE_SPEED,
        y: this.velocity.y + Math.sin(this.angle) * FIGHTER_PROJECTILE_SPEED,
      },
      radius: 3.2,
      age: 0,
      maxAge: 2.2,
      damage: 11,
    };
  }

  consumeShots() {
    const shots = this.pendingShots;
    this.pendingShots = [];
    return shots;
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) {
      this.isAlive = false;
    }
  }

  draw(context, camera) {
    const x = this.position.x - camera.x;
    const y = this.position.y - camera.y;

    context.save();
    context.translate(x, y);
    context.rotate(this.angle);
    context.fillStyle = "rgba(190, 114, 255, 0.18)";
    context.strokeStyle = "#c276ff";
    context.lineWidth = 2.2;
    context.beginPath();
    context.moveTo(23, 0);
    context.lineTo(4, -12);
    context.lineTo(-17, -9);
    context.lineTo(-9, 0);
    context.lineTo(-17, 9);
    context.lineTo(4, 12);
    context.closePath();
    context.fill();
    context.stroke();

    context.strokeStyle = "rgba(255, 215, 251, 0.9)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(4, -12);
    context.lineTo(9, 0);
    context.lineTo(4, 12);
    context.stroke();

    if (this.isThrusting) {
      context.strokeStyle = "rgba(255, 106, 211, 0.92)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-15, -5);
      context.lineTo(-27 - Math.sin(this.pulse * 12) * 4, 0);
      context.lineTo(-15, 5);
      context.stroke();
    }
    context.restore();
  }
}

function getLeadPosition(ship, distanceToShip) {
  const leadSeconds = Math.min(0.7, distanceToShip / FIGHTER_PROJECTILE_SPEED);
  return {
    x: ship.position.x + ship.velocity.x * leadSeconds,
    y: ship.position.y + ship.velocity.y * leadSeconds,
  };
}
