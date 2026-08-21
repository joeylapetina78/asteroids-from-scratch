import { advanceFlightBody, getTurnTowardAngle, wrapAngle } from "../systems/flightPhysics.js?v=fresh-20260820-1932-a7cfb77";
import { normalizeResourceType } from "../systems/resourceDefinitions.js?v=fresh-20260820-1932-a7cfb77";
import { addCommitment, createCommitmentPortfolio, moveCommitmentToFront, removeCommitment, remainingCapacity } from "../systems/commitmentPortfolio.js?v=fresh-20260820-1932-a7cfb77";

const FLIGHT = { rotationSpeed: 2.35, thrustPower: 98, maxSpeed: 112, brakeDrag: 0.9, spaceDrag: 0.994 };
const MINING_RANGE = 250;
const MINING_ARC = 0.16;
// How close a worker parks to the rock it is cutting. Inside this it holds
// station and keeps rotating to stay on target rather than drifting off aim.
const HOLD_RANGE = MINING_RANGE * 0.72;
const SHOT_SPEED = 300;
const COLLECT_RANGE = 34;
const HOME_RANGE = 86;
// How long a worker waits before re-offering a load a buyer just refused for a
// transient reason. Without this the arrival callback retries every frame.
const DELIVERY_RETRY_SECONDS = 5;
const TRACTOR_RANGE = 440;
const TRACTOR_FORCE = 760;

export class MiningWorkerShip {
  constructor({ id, name, institutionId, controllerInstitutionId, publicIdentity = null, x, y, angle = 0, palette = {}, onEvent = () => {}, onDelivery = () => {} }) {
    this.id = id;
    this.name = name;
    this.type = "mining-worker";
    this.role = "worker";
    this.institutionId = institutionId;
    this.controllerInstitutionId = controllerInstitutionId;
    this.publicIdentity = publicIdentity;
    this.palette = {
      hullStroke: palette.hullStroke ?? "#ff9a72",
      hullFill: palette.hullFill ?? "rgba(255, 116, 82, 0.16)",
      cabStroke: palette.cabStroke ?? "#ffe0a3",
      tractorStroke: palette.tractorStroke ?? "rgba(126, 231, 255, 0.42)",
    };
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.angle = angle;
    this.radius = 18;
    this.hull = 120;
    this.maxHull = 120;
    this.isAlive = true;
    this.isThrusting = false;
    this.state = "idle";
    this.commitmentPortfolio = createCommitmentPortfolio({ capacity: 6 });
    this.deliveryBlock = null;
    this.serviceReturn = null;
    this.marketVisit = null;
    this.miningDisabled = false;
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
    this.shield = { installed: false, charge: 0, maxCharge: 0, absorbedDamage: 0 };
  }

  damage(amount) {
    let remaining = Math.max(0, amount);
    if (this.shield.installed && this.shield.charge > 0) {
      const absorbed = Math.min(remaining, this.shield.charge);
      this.shield.charge -= absorbed;
      this.shield.absorbedDamage += absorbed;
      remaining -= absorbed;
    }
    this.hull = Math.max(0, this.hull - remaining);
    if (this.hull === 0) this.isAlive = false;
  }

  installShield({ maxCharge = 72 } = {}) { this.shield = { installed: true, charge: maxCharge, maxCharge, absorbedDamage: this.shield?.absorbedDamage ?? 0 }; }
  rechargeShield(units) { if (!this.shield.installed) return 0; const before = this.shield.charge; this.shield.charge = Math.min(this.shield.maxCharge, this.shield.charge + Math.max(0, units)); return this.shield.charge - before; }

  get assignment() { return this.commitmentPortfolio.entries[0] ?? null; }
  set assignment(value) {
    // Compatibility projection for older saves, fixtures, and inspection code.
    this.commitmentPortfolio.entries = value ? [{ ...value, id: value.allocationId ?? value.contractId, reservedCapacity: value.harvestTargetQuantity ?? value.quantity ?? 0 }] : [];
  }

  get commitments() { return this.commitmentPortfolio.entries; }
  get remainingCargoCapacity() { return remainingCapacity(this.commitmentPortfolio); }

  assign({ allocationId, contractId, resourceId, quantity, harvestTargetQuantity = quantity, destination, destinationSiteId = null, depositCandidates = [] }) {
    if (quantity <= 0) return false;
    const commitment = {
      id: allocationId ?? contractId,
      allocationId, contractId, resourceId: normalizeResourceType(resourceId), quantity,
      harvestTargetQuantity: Math.max(quantity, harvestTargetQuantity), destination, destinationSiteId,
      depositCandidates: [...depositCandidates], reservedCapacity: Math.max(quantity, harvestTargetQuantity),
    };
    const accepted = addCommitment(this.commitmentPortfolio, commitment, {
      compatible: (existing, candidate) => destinationsMatch(existing, candidate),
    });
    if (!accepted) return false;
    this.state = "prospecting";
    this.onEvent("assignment.accepted", { contractId, resourceId: commitment.resourceId, quantity, portfolioSize: this.commitments.length });
    return true;
  }

  update(deltaSeconds, world) {
    this.pulse += deltaSeconds;
    this.fireCooldown = Math.max(0, this.fireCooldown - deltaSeconds);
    if (this.serviceReturn) {
      this.state = "returning-service";
      this.targetAsteroid = null;
      return this.flyTo(deltaSeconds, this.serviceReturn.destination, HOME_RANGE, () => {
        const request = this.serviceReturn;
        this.serviceReturn = null;
        this.state = "awaiting-service";
        this.onEvent("service.arrived", { issueType: request.issueType, destinationSiteId: request.destinationSiteId });
      });
    }
    if (this.marketVisit) {
      this.state = "market-reposition";
      this.targetAsteroid = null;
      return this.flyTo(deltaSeconds, this.marketVisit.destination, HOME_RANGE, () => {
        const visit = this.marketVisit;
        this.marketVisit = null;
        this.state = "idle";
        this.onEvent("market.arrived", { destinationSiteId: visit.destinationSiteId, offerId: visit.offerId });
      });
    }
    if (this.miningDisabled) return this.brake(deltaSeconds);
    this.updateTractorField(deltaSeconds, world);
    if (!this.assignment) return this.brake(deltaSeconds);

    if (this.cargoAmount() >= this.assignment.harvestTargetQuantity) {
      const unfilled = this.commitments.find((entry) => (this.cargo[entry.resourceId] ?? 0) < entry.harvestTargetQuantity);
      if (unfilled && unfilled.id !== this.assignment.id) {
        moveCommitmentToFront(this.commitmentPortfolio, unfilled.id);
        this.targetAsteroid = null;
        this.state = "prospecting";
        return;
      }
      // Stay reported as blocked while waiting out a refusal, otherwise this
      // would flip back to "returning" every frame and hide the block from the
      // observatory and from anything else reading the state.
      const waitingOutRefusal = this.deliveryBlock && this.pulse < this.deliveryBlock.retryAt;
      this.state = waitingOutRefusal ? "delivery-blocked" : "returning";
      this.targetAsteroid = null;
      return this.flyTo(deltaSeconds, this.assignment.destination, HOME_RANGE, () => this.tryDeliver());
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
      this.targetAsteroid = bestResourceAsteroid(world.asteroids, this.assignment.resourceId, this.position);
      if (this.targetAsteroid) this.onEvent("prospect.selected", { resourceId: this.assignment.resourceId, x: Math.round(this.targetAsteroid.position.x), y: Math.round(this.targetAsteroid.position.y) });
    }
    if (!this.targetAsteroid) {
      this.state = "prospecting";
      const deposit = this.assignment.depositCandidates[0];
      if (!deposit) return this.brake(deltaSeconds);
      if (distance(this.position, deposit) <= 360) {
        this.assignment.depositCandidates.shift();
        return this.brake(deltaSeconds);
      }
      return this.flyTo(deltaSeconds, deposit, 280);
    }

    const targetDistance = distance(this.position, this.targetAsteroid.position);
    const targetAngle = Math.atan2(this.targetAsteroid.position.y - this.position.y, this.targetAsteroid.position.x - this.position.x);
    const angleError = Math.abs(wrapAngle(targetAngle - this.angle));
    this.state = targetDistance <= MINING_RANGE ? "mining" : "outbound";
    if (targetDistance <= HOLD_RANGE) {
      // Station-keeping still has to track the rock. Braking alone freezes the
      // heading, and a worker that coasted in sideways could then never satisfy
      // MINING_ARC again: it would sit on a full asteroid forever, firing
      // nothing, never breaking it, and so never re-targeting either.
      this.holdAndAim(deltaSeconds, targetAngle);
    } else {
      this.flyTo(deltaSeconds, this.targetAsteroid.position, HOLD_RANGE);
    }
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
    if (this.totalCargoAmount() >= this.commitmentPortfolio.capacity) return false;
    if (this.commitments.length > 0) {
      const resourceId = normalizeResourceType(pickup.type);
      const promised = this.commitments
        .filter((entry) => entry.resourceId === resourceId)
        .reduce((sum, entry) => sum + entry.harvestTargetQuantity, 0);
      if (promised <= (this.cargo[resourceId] ?? 0)) return false;
    }
    return pickup.producedByWorkerShipId === this.id || pickup.sourceClaimId == null;
  }

  returnForService({ destination, destinationSiteId, issueType }) {
    this.miningDisabled = true;
    this.serviceReturn = { destination, destinationSiteId, issueType };
    this.targetAsteroid = null;
    this.tractorActive = false;
    this.tractorTargets = [];
    return true;
  }

  visitMarket({ destination, destinationSiteId, offerId }) {
    if (this.assignment || this.serviceReturn || this.miningDisabled) return false;
    this.marketVisit = { destination, destinationSiteId, offerId };
    this.targetAsteroid = null;
    return true;
  }

  completeService() {
    this.miningDisabled = false;
    this.serviceReturn = null;
    this.state = "idle";
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

  // Hold position but keep turning onto the bearing. Asteroids drift, so a
  // worker that stops tracking loses its firing arc even if it arrived aimed.
  holdAndAim(deltaSeconds, targetAngle) {
    advanceFlightBody(this, deltaSeconds, { turn: getTurnTowardAngle(this.angle, targetAngle), thrust: false, brake: true }, FLIGHT);
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
  totalCargoAmount() { return Object.values(this.cargo).reduce((sum, units) => sum + Math.max(0, units ?? 0), 0); }

  // Hand the assignment back but KEEP the cargo. The load stays aboard as
  // uncommitted material the worker can sell or re-target, rather than being
  // destroyed or held hostage by a contract that will never accept it.
  releaseAssignment(reason = "released") {
    const assignment = this.assignment;
    if (!assignment) return null;
    removeCommitment(this.commitmentPortfolio, assignment.id);
    this.deliveryBlock = null;
    this.state = "idle";
    return { ...assignment, reason };
  }

  // `flyTo` invokes its arrival callback every frame while inside stopRange, so
  // this is the throttle: a refused delivery must not be retried per frame.
  tryDeliver() {
    if (this.deliveryBlock && this.pulse < this.deliveryBlock.retryAt) return;
    this.deliver();
  }

  deliver() {
    const assignment = this.assignment;
    const amount = this.cargoAmount();
    if (!assignment || amount <= 0) return;
    const result = this.onDelivery({ ...assignment, amount, ship: this }) ?? { acceptedUnits: 0, paid: 0 };
    const acceptedUnits = Math.min(amount, Math.max(0, result.acceptedUnits ?? 0));
    if (acceptedUnits <= 0) {
      this.handleRefusedDelivery(assignment, amount, result.refusal ?? null);
      return;
    }
    this.deliveryBlock = null;
    const surplusSoldUnits = Math.min(amount - acceptedUnits, Math.max(0, result.surplusSoldUnits ?? 0));
    this.cargo[assignment.resourceId] = Math.max(0, amount - acceptedUnits - surplusSoldUnits);
    removeCommitment(this.commitmentPortfolio, assignment.id);
    this.state = this.assignment ? "returning" : "idle";
    this.onEvent("delivery.completed", { contractId: assignment.contractId, resourceId: assignment.resourceId, quantity: acceptedUnits, paid: result.paid ?? 0 });
  }

  // A buyer refused the load. Report it ONCE per episode, then either wait for
  // a transient condition to clear or, if the refusal is permanent, give the
  // assignment back so the worker is not stranded holding unwanted cargo.
  handleRefusedDelivery(assignment, amount, refusal) {
    const reason = refusal?.reason ?? "delivery-refused";
    const permanent = Boolean(refusal?.permanent);

    if (permanent) {
      // completeDelivery has already returned the allocation; drop the
      // commitment and keep the material.
      this.releaseAssignment(reason);
      this.onEvent("delivery.abandoned", {
        contractId: assignment.contractId,
        resourceId: assignment.resourceId,
        quantity: amount,
        reason,
        cargoRetained: amount,
      });
      return;
    }

    this.state = "delivery-blocked";
    const alreadyReported = this.deliveryBlock?.reason === reason;
    this.deliveryBlock = {
      reason,
      retryAt: this.pulse + DELIVERY_RETRY_SECONDS,
      attempts: (this.deliveryBlock?.attempts ?? 0) + 1,
    };
    if (alreadyReported) return;
    this.onEvent("delivery.rejected", {
      contractId: assignment.contractId,
      resourceId: assignment.resourceId,
      quantity: amount,
      reason,
      retryInSeconds: DELIVERY_RETRY_SECONDS,
    });
  }

  draw(context, camera) {
    context.save();
    context.translate(this.position.x - camera.x, this.position.y - camera.y);
    context.rotate(this.angle);
    context.fillStyle = this.palette.hullFill;
    context.strokeStyle = this.palette.hullStroke;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(22, 0); context.lineTo(1, -12); context.lineTo(-15, -8); context.lineTo(-10, 0); context.lineTo(-15, 8); context.lineTo(1, 12); context.closePath();
    context.fill(); context.stroke();
    context.strokeStyle = this.palette.cabStroke;
    context.strokeRect(-3, -5, 9, 10);
    if (this.tractorActive) {
      context.save();
      context.rotate(-this.angle);
      context.strokeStyle = this.palette.tractorStroke;
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
  return getResourceAbundance(asteroid, resourceId) >= 0.1;
}

function bestResourceAsteroid(asteroids, resourceId, position) {
  return asteroids.reduce((best, asteroid) => {
    const abundance = getResourceAbundance(asteroid, resourceId);
    if (abundance < 0.1) return best;
    const score = (abundance * Math.max(1, asteroid.tier ?? 1)) / Math.max(120, distance(position, asteroid.position));
    return !best || score > best.score ? { asteroid, score } : best;
  }, null)?.asteroid ?? null;
}

function getResourceAbundance(asteroid, resourceId) {
  return Object.entries(asteroid.resources ?? {}).reduce((total, [id, amount]) =>
    normalizeResourceType(id) === resourceId ? total + amount : total, 0);
}

function nearest(items, position) {
  return items.reduce((best, item) => !best || distance(position, item.position) < distance(position, best.position) ? item : best, null);
}

function distance(first, second) { return Math.hypot(first.x - second.x, first.y - second.y); }

function destinationsMatch(first, second) {
  if (first.destinationSiteId || second.destinationSiteId) return first.destinationSiteId === second.destinationSiteId;
  return Math.hypot((first.destination?.x ?? 0) - (second.destination?.x ?? 0), (first.destination?.y ?? 0) - (second.destination?.y ?? 0)) < 1;
}
