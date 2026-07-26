import { advanceFlightBody, getTurnTowardAngle, wrapAngle } from "../systems/flightPhysics.js?v=fresh-20260726-1110-e081493";
import { normalizeResourceType } from "../systems/resourceDefinitions.js?v=fresh-20260726-1110-e081493";

const FLIGHT = { rotationSpeed: 2.35, thrustPower: 98, maxSpeed: 112, brakeDrag: 0.9, spaceDrag: 0.994 };
const MINING_RANGE = 250;
const MINING_ARC = 0.16;
const SHOT_SPEED = 300;
const COLLECT_RANGE = 34;
const HOME_RANGE = 86;
const TRACTOR_RANGE = 440;
const TRACTOR_FORCE = 760;

export class MiningWorkerShip {
  constructor({ id, name, institutionId, controllerInstitutionId, x, y, angle = 0, onEvent = () => {}, onDelivery = () => {} }) {
    this.id = id;
    this.name = name;
    this.type = "mining-worker";
    this.role = "worker";
    this.institutionId = institutionId;
    this.controllerInstitutionId = controllerInstitutionId;
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.angle = angle;
    this.radius = 18;
    this.isAlive = true;
    this.isThrusting = false;
    this.state = "idle";
    this.assignment = null;
    this.targetAsteroid = null;
    this.cargo = {};
    this.fireCooldown = 0;
    this.pendingShots = [];
    this.capabilities = { miningLaser: true, cargoCollector: true, tractorField: { powered: true, powerSource: "evergreen" } };
    this.tractorActive = false;
    this.tractorTargets = [];
    this.pulse = 0;
    this.onEvent = onEvent;
    this.onDelivery = onDelivery;
  }

  assign({ allocationId, contractId, resourceId, quantity, destination }) {
    if (this.assignment || quantity <= 0) return false;
    this.assignment = { allocationId, contractId, resourceId: normalizeResourceType(resourceId), quantity, destination };
    this.state = "prospecting";
    this.onEvent("assignment.accepted", { contractId, resourceId: this.assignment.resourceId, quantity });
    return true;
  }

  update(deltaSeconds, world) {
    this.pulse += deltaSeconds;
    this.fireCooldown = Math.max(0, this.fireCooldown - deltaSeconds);
    this.updateTractorField(deltaSeconds, world);
    if (!this.assignment) return this.brake(deltaSeconds);

    if (this.cargoAmount() >= this.assignment.quantity) {
      this.state = "returning";
      this.targetAsteroid = null;
      return this.flyTo(deltaSeconds, this.assignment.destination, HOME_RANGE, () => this.deliver());
    }

    const pickup = nearest(world.pickups.filter((item) => this.canRecoverPickup(item) && normalizeResourceType(item.type) === this.assignment.resourceId), this.position);
    if (pickup && distance(this.position, pickup.position) < 520) {
      this.state = "collecting";
      if (distance(this.position, pickup.position) <= COLLECT_RANGE + pickup.radius) {
        const collected = world.collectPickup(pickup, this);
        if (collected) {
          this.cargo[collected.type] = (this.cargo[collected.type] ?? 0) + (collected.quantity ?? 1);
          this.onEvent("resource.collected", { resourceId: collected.type, quantity: collected.quantity ?? 1, contractId: this.assignment.contractId });
        }
        return;
      }
      return this.flyTo(deltaSeconds, pickup.position, COLLECT_RANGE);
    }

    if (!this.targetAsteroid || !world.asteroids.includes(this.targetAsteroid) || !hasResource(this.targetAsteroid, this.assignment.resourceId)) {
      this.targetAsteroid = nearest(world.asteroids.filter((asteroid) => hasResource(asteroid, this.assignment.resourceId)), this.position);
      if (this.targetAsteroid) this.onEvent("prospect.selected", { resourceId: this.assignment.resourceId, x: Math.round(this.targetAsteroid.position.x), y: Math.round(this.targetAsteroid.position.y) });
    }
    if (!this.targetAsteroid) {
      this.state = "prospecting";
      return this.brake(deltaSeconds);
    }

    const targetDistance = distance(this.position, this.targetAsteroid.position);
    const targetAngle = Math.atan2(this.targetAsteroid.position.y - this.position.y, this.targetAsteroid.position.x - this.position.x);
    const angleError = Math.abs(wrapAngle(targetAngle - this.angle));
    this.state = targetDistance <= MINING_RANGE ? "mining" : "outbound";
    this.flyTo(deltaSeconds, this.targetAsteroid.position, MINING_RANGE * 0.72);
    if (targetDistance <= MINING_RANGE && angleError <= MINING_ARC && this.fireCooldown === 0) {
      this.fireCooldown = 0.48;
      this.pendingShots.push(this.createShot());
    }
  }

  updateTractorField(deltaSeconds, world) {
    const recoverable = world.pickups.filter((pickup) => this.canRecoverPickup(pickup) && distance(this.position, pickup.position) <= TRACTOR_RANGE);
    this.tractorActive = recoverable.length > 0;
    this.tractorTargets = recoverable.slice(0, 5).map((pickup) => ({ x: pickup.position.x, y: pickup.position.y }));
    recoverable.forEach((pickup) => world.pullPickup(pickup, this, deltaSeconds, TRACTOR_FORCE));
    const collectedPickup = nearest(recoverable.filter((pickup) => distance(this.position, pickup.position) <= COLLECT_RANGE + pickup.radius), this.position);
    if (!collectedPickup) return;
    const collected = world.collectPickup(collectedPickup, this);
    if (!collected) return;
    this.cargo[collected.type] = (this.cargo[collected.type] ?? 0) + (collected.quantity ?? 1);
    this.onEvent("resource.collected", { resourceId: collected.type, quantity: collected.quantity ?? 1, contractId: this.assignment?.contractId ?? null, opportunistic: normalizeResourceType(collected.type) !== this.assignment?.resourceId });
  }

  canRecoverPickup(pickup) {
    if (pickup.type === "rockmoss-crawler") return false;
    return pickup.producedByWorkerShipId === this.id || pickup.sourceClaimId == null;
  }

  flyTo(deltaSeconds, target, stopRange, onArrival = null) {
    const targetAngle = Math.atan2(target.y - this.position.y, target.x - this.position.x);
    const targetDistance = distance(this.position, target);
    const angleError = wrapAngle(targetAngle - this.angle);
    if (targetDistance <= stopRange) {
      this.brake(deltaSeconds);
      onArrival?.();
      return;
    }
    advanceFlightBody(this, deltaSeconds, { turn: getTurnTowardAngle(this.angle, targetAngle), thrust: Math.abs(angleError) < 0.62, brake: false }, FLIGHT);
  }

  brake(deltaSeconds) {
    advanceFlightBody(this, deltaSeconds, { turn: 0, thrust: false, brake: true }, FLIGHT);
  }

  createShot() {
    return {
      sourceShipId: this.id,
      position: { x: this.position.x + Math.cos(this.angle) * 23, y: this.position.y + Math.sin(this.angle) * 23 },
      velocity: { x: this.velocity.x + Math.cos(this.angle) * SHOT_SPEED, y: this.velocity.y + Math.sin(this.angle) * SHOT_SPEED },
      radius: 3,
      age: 0,
      maxAge: 2,
      update(deltaSeconds) { this.age += deltaSeconds; this.position.x += this.velocity.x * deltaSeconds; this.position.y += this.velocity.y * deltaSeconds; },
    };
  }

  consumeShots() { const shots = this.pendingShots; this.pendingShots = []; return shots; }
  cargoAmount() { return this.cargo[this.assignment?.resourceId] ?? 0; }

  deliver() {
    const assignment = this.assignment;
    const amount = this.cargoAmount();
    if (!assignment || amount <= 0) return;
    this.onDelivery({ ...assignment, amount, ship: this });
    this.cargo[assignment.resourceId] = Math.max(0, amount - assignment.quantity);
    this.assignment = null;
    this.state = "idle";
    this.onEvent("delivery.completed", { contractId: assignment.contractId, resourceId: assignment.resourceId, quantity: Math.min(amount, assignment.quantity) });
  }

  draw(context, camera) {
    context.save();
    context.translate(this.position.x - camera.x, this.position.y - camera.y);
    context.rotate(this.angle);
    context.fillStyle = "rgba(255, 116, 82, 0.16)";
    context.strokeStyle = "#ff9a72";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(22, 0); context.lineTo(1, -12); context.lineTo(-15, -8); context.lineTo(-10, 0); context.lineTo(-15, 8); context.lineTo(1, 12); context.closePath();
    context.fill(); context.stroke();
    context.strokeStyle = "#ffe0a3";
    context.strokeRect(-3, -5, 9, 10);
    if (this.tractorActive) {
      context.save();
      context.rotate(-this.angle);
      context.strokeStyle = "rgba(126, 231, 255, 0.42)";
      context.lineWidth = 1.2;
      this.tractorTargets.forEach((target) => {
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(target.x - this.position.x, target.y - this.position.y);
        context.stroke();
      });
      context.restore();
    }
    if (this.isThrusting) {
      context.beginPath(); context.moveTo(-13, -5); context.lineTo(-25 - Math.sin(this.pulse * 13) * 3, 0); context.lineTo(-13, 5); context.stroke();
    }
    context.restore();
  }
}

function hasResource(asteroid, resourceId) {
  const dominant = Object.entries(asteroid.resources ?? {})
    .filter(([id]) => id !== "stone")
    .reduce((best, [id, amount]) => amount > best.amount ? { id, amount } : best, { id: null, amount: 0 });
  return dominant.id != null && normalizeResourceType(dominant.id) === resourceId;
}

function nearest(items, position) {
  return items.reduce((best, item) => !best || distance(position, item.position) < distance(position, best.position) ? item : best, null);
}

function distance(first, second) { return Math.hypot(first.x - second.x, first.y - second.y); }
