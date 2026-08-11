import { drawResourceShape } from "./ResourcePickup.js?v=fresh-20260810-2043-f726093";
import { getResourceColor, getResourceShape } from "../systems/resourceDefinitions.js?v=fresh-20260810-2043-f726093";
import { getTravelWearRate } from "../systems/wearRates.js?v=fresh-20260810-2043-f726093";
import { addCommitment, createCommitmentPortfolio, removeCommitment, remainingCapacity } from "../systems/commitmentPortfolio.js?v=fresh-20260810-2043-f726093";

// NpcShip is the first non-player ship actor. It borrows the "steering agent"
// feel from lifeforms, but it is a ship: it has hull, cargo shapes, routes, and
// can be attacked or damaged by rock impacts.
const MAX_SPEED = 96;
const MAX_FORCE = 0.34;
const ARRIVE_RADIUS = 330;
const WAYPOINT_RADIUS = 150;
const AVOID_RADIUS = 245;
const BODY_RADIUS = 24;
const STUCK_SPEED = 12;
const STUCK_SECONDS = 0.55;
const CAREFUL_TRIGGER_SECONDS = 1.05;
const CAREFUL_MODE_SECONDS = 4.2;
const CAREFUL_SPEED_MULTIPLIER = 0.48;
const CORRIDOR_CRUISE_SPEED_MULTIPLIER = 1.65;
const CARGO_CAR_SPACING = 34;
const CARGO_CAR_SPRING_FREQUENCY = 12;
const CARGO_CAR_MAX_LINK_LENGTH = CARGO_CAR_SPACING * 1.6;
const CARGO_CAR_MAX_SPEED = 220;
const CARGO_PHYSICS_STEP = 1 / 120;
const CARGO_PHYSICS_MAX_CATCHUP = 0.25;
const HUB_TETHER_PADDING = 42;
export const NPC_HAULER_MAX_HULL = 680;
export const NPC_HAULER_CARGO_CAPACITY = 12;

export class NpcShip {
  constructor({ id, name, route, x, y, seed = 1, laneOffset = 0, publicIdentity = null, maintenanceSiteId = null, palette = null }) {
    this.id = id;
    this.name = name;
    this.route = route;
    this.routeIndex = 1;
    this.laneOffset = laneOffset;
    this.position = { x, y };
    const firstWaypoint = getLaneWaypoint(route, 1, laneOffset);
    const initialDirection = normalize(firstWaypoint.x - x, firstWaypoint.y - y, 1);
    this.velocity = {
      x: initialDirection.x * (58 + seed * 5),
      y: initialDirection.y * (58 + seed * 5),
    };
    this.heading = Math.atan2(this.velocity.y, this.velocity.x);
    this.acceleration = { x: 0, y: 0 };
    this.seed = seed;
    this.radius = BODY_RADIUS;
    // Freight haulers are heavy commercial craft exposed for long periods on
    // predictable routes. Their hull is deliberately one of the toughest in
    // the local fleet: twenty direct player hits at the current 34 damage, or
    // roughly seventy-five ordinary 9-damage incursion hits.
    this.maxHull = NPC_HAULER_MAX_HULL;
    this.hull = this.maxHull;
    this.isAlive = true;
    this.pulse = seed * 0.37;
    this.cargoCars = 2 + (seed % 3);
    this.cargoSegments = createCargoSegments(this.position, initialDirection, this.cargoCars, seed);
    this.drawRadius = 260 + this.cargoCars * 85;
    this.stuckTimer = 0;
    this.avoidanceSide = laneOffset < 0 ? -1 : 1;
    this.turnSettleTimer = 0;
    this.carefulModeTimer = 0;
    this.blockedTimer = 0;
    this.lastWaypointDistance = distance(this.position, firstWaypoint);
    this.pendingEvents = [];
    this.activeHub = null;
    this.dockedSiteId = route[0]?.id ?? null;
    this.publicIdentity = publicIdentity;
    this.maintenanceSiteId = maintenanceSiteId;
    this.palette = {
      hullStroke: palette?.hullStroke ?? "#ffe6a6",
      hullFill: palette?.hullFill ?? "rgba(255, 230, 166, 0.11)",
      trainStroke: palette?.trainStroke ?? "#ffd36b",
      trainFill: palette?.trainFill ?? "rgba(255, 211, 107, 0.18)",
      linkStroke: palette?.linkStroke ?? "rgba(255, 230, 166, 0.42)",
    };
    this.completedRouteLegs = 0;
    this.operationalStatus = "seeking-work";
    this.commitmentPortfolio = createCommitmentPortfolio({ capacity: NPC_HAULER_CARGO_CAPACITY });
    this.wear = 0;
    this.wearIssueCount = 0;
    this.carefulWearSinceIssue = 0;
    this.pendingWearIssue = null;
    this.cargoTransfers = [];
    this.departureTimer = 0;
    this.activeTowRequestId = null;
    this.towDestinationSiteId = null;
    this.activeCorridorId = null;
    this.navigationMetrics = { distanceTraveled: 0, carefulDistance: 0, replanCount: 0, corridorEntries: 0 };
    this.shield = { installed: false, charge: 0, maxCharge: 0, absorbedDamage: 0 };
  }

  update(deltaSeconds, world) {
    if (!this.isAlive) {
      return;
    }

    this.updateCargoTransfers(deltaSeconds);
    if (this.operationalStatus === "loading" || this.operationalStatus === "tow-loading") {
      const nextStatus = this.operationalStatus === "tow-loading" ? "being-towed" : "available";
      this.departureTimer = Math.max(0, this.departureTimer - deltaSeconds);
      if (this.departureTimer === 0) {
        this.dockedSiteId = null;
        this.operationalStatus = nextStatus;
      }
    }
    if (!["available", "being-towed"].includes(this.operationalStatus)) {
      this.velocity.x *= 0.82;
      this.velocity.y *= 0.82;
      this.updateCargoSegments(deltaSeconds);
      this.updateHubService(world.sites);
      return;
    }

    this.pulse += deltaSeconds;
    const waypoint = this.getWaypoint();
    const waypointDistance = distance(this.position, waypoint);

    if (waypointDistance <= WAYPOINT_RADIUS) {
      const arrivedSite = this.route[this.routeIndex];
      const isFinalDestination = this.routeIndex === this.route.length - 1;
      if (!isFinalDestination) {
        if (arrivedSite?.corridorId && arrivedSite.corridorId !== this.activeCorridorId) {
          this.activeCorridorId = arrivedSite.corridorId;
          this.navigationMetrics.corridorEntries += 1;
          this.pendingEvents.push({ type: "npc.corridorEntered", payload: { npcId: this.id, npcName: this.name, corridorId: arrivedSite.corridorId, shipmentId: this.activeShipmentId, towRequestId: this.activeTowRequestId } });
        }
        this.completedRouteLegs += 1;
        this.routeIndex += 1;
        this.turnSettleTimer = 0.9;
        this.lastWaypointDistance = distance(this.position, this.getWaypoint());
        return;
      }
      this.dockedSiteId = arrivedSite?.id ?? null;
      this.completedRouteLegs += 1;
      if (this.activeCorridorId) {
        this.pendingEvents.push({
          type: "npc.corridorExited",
          payload: {
            npcId: this.id,
            npcName: this.name,
            corridorId: this.activeCorridorId,
            siteId: arrivedSite?.id ?? null,
            siteName: arrivedSite?.name ?? null,
            shipmentId: this.activeShipmentId,
            towRequestId: this.activeTowRequestId,
            navigationMetrics: { ...this.navigationMetrics },
          },
        });
        this.activeCorridorId = null;
      }
      this.pendingEvents.push({
        type: "npc.routeCompleted",
        payload: {
          npcId: this.id,
          npcName: this.name,
          npcType: "route-hauler",
          siteId: arrivedSite?.id ?? null,
          siteName: arrivedSite?.name ?? null,
          routeLegsCompleted: this.completedRouteLegs,
          shipmentId: this.activeShipmentId,
          towRequestId: this.activeTowRequestId,
          navigationMetrics: { ...this.navigationMetrics },
          provisionalLogistics: false,
        },
      });
      if (!this.activeTowRequestId) this.emitPendingWearIssueAt(arrivedSite);
      this.operationalStatus = "awaiting-assignment";
      this.turnSettleTimer = 0.9;
      this.lastWaypointDistance = distance(this.position, this.getWaypoint());
    }

    this.updateCarefulMode(deltaSeconds, world.asteroids, waypointDistance);
    const corridorCruise = Boolean(this.activeCorridorId);
    this.applySteer(arrive(this, this.getWaypoint()), corridorCruise ? 1.4 : 1);
    this.applySteer(steerTowardOpenGap(this, this.getWaypoint(), world.asteroids), corridorCruise ? 0.18 : this.isCarefulMode ? 1.15 : 0.62);
    this.applySteer(avoidAsteroids(this, world.asteroids), this.getAvoidanceWeight());
    this.applySteer(separateShips(this, world.npcShips), this.turnSettleTimer > 0 ? 1.05 : 1.3);
    this.updateStuckEscape(deltaSeconds, world.npcShips, world.asteroids);
    this.integrate(deltaSeconds);
    this.updateCargoSegments(deltaSeconds);
    this.updateHubService(world.sites);
    this.turnSettleTimer = Math.max(0, this.turnSettleTimer - deltaSeconds);
    this.carefulModeTimer = Math.max(0, this.carefulModeTimer - deltaSeconds);
    this.lastWaypointDistance = distance(this.position, this.getWaypoint());
  }

  damage(amount) {
    let remaining = Math.max(0, amount);
    if (this.shield.installed && this.shield.charge > 0) {
      const absorbed = Math.min(remaining, this.shield.charge);
      this.shield.charge -= absorbed;
      this.shield.absorbedDamage += absorbed;
      remaining -= absorbed;
    }
    this.hull -= remaining;

    if (this.hull <= 0) {
      this.isAlive = false;
    }
  }

  getWaypoint() {
    return getLaneWaypoint(this.route, this.routeIndex, this.laneOffset);
  }

  canAcceptRoute(route) {
    return Array.isArray(route) && route.length >= 2 && route.every((site) => site?.id && site?.position);
  }

  canAcceptShipment({ originSiteId = this.dockedSiteId, destinationSiteId, quantity = 1 } = {}) {
    const required = Math.max(0, quantity);
    return Boolean(originSiteId && destinationSiteId && required > 0 && required <= this.remainingCargoCapacity);
  }

  get activeShipmentId() { return this.commitmentPortfolio.entries[0]?.shipmentId ?? null; }
  set activeShipmentId(value) {
    // Compatibility projection for old saves, fixtures, and systems that have
    // not yet learned to inspect a portfolio.
    this.commitmentPortfolio.entries = value ? [{ id: value, shipmentId: value, destinationSiteId: null, reservedCapacity: 1 }] : [];
  }

  get shipmentCommitments() { return this.commitmentPortfolio.entries; }
  get remainingCargoCapacity() { return remainingCapacity(this.commitmentPortfolio); }

  assignShipment({ shipmentId, destinationSiteId, originSiteId = this.dockedSiteId, quantity = 1, route = this.route }) {
    if (!this.canAcceptRoute(route)) return false;
    if (!this.canAcceptShipment({ originSiteId, destinationSiteId, quantity })) return false;
    const destinationIndex = route.findIndex((site) => site.id === destinationSiteId);
    if (destinationIndex < 0) return false;
    const accepted = addCommitment(this.commitmentPortfolio, {
      id: shipmentId, shipmentId, originSiteId, destinationSiteId,
      reservedCapacity: Math.max(0, quantity),
    });
    if (!accepted) return false;
    this.route = route;
    this.routeIndex = Math.min(1, destinationIndex);
    this.activeCorridorId = null;
    this.navigationMetrics = { distanceTraveled: 0, carefulDistance: 0, replanCount: 0, corridorEntries: 0 };
    this.departureTimer = 1.1;
    this.operationalStatus = "loading";
    this.cargoSegments.forEach((segment) => { segment.loaded = true; });
    this.lastWaypointDistance = distance(this.position, this.getWaypoint());
    return true;
  }

  // Replace only the physical itinerary. Cargo commitments remain independent
  // records, allowing one craft to unload at several hubs without pretending
  // they are one shipment. Itineraries are rebuilt while docked, never in
  // flight, so the craft cannot oscillate between newly posted work.
  assignItinerary(route) {
    if (!this.canAcceptRoute(route)) return false;
    this.route = route;
    this.routeIndex = 1;
    this.activeCorridorId = null;
    this.navigationMetrics = { distanceTraveled: 0, carefulDistance: 0, replanCount: 0, corridorEntries: 0 };
    this.departureTimer = 1.1;
    this.operationalStatus = "loading";
    this.cargoSegments.forEach((segment) => { segment.loaded = Boolean(this.activeShipmentId); });
    this.lastWaypointDistance = distance(this.position, this.getWaypoint());
    return true;
  }

  clearShipment(shipmentId = null) {
    if (shipmentId) removeCommitment(this.commitmentPortfolio, shipmentId);
    else this.commitmentPortfolio.entries = [];
    this.operationalStatus = this.activeShipmentId ? "awaiting-assignment" : "seeking-work";
    this.cargoSegments.forEach((segment) => { segment.loaded = Boolean(this.activeShipmentId); });
  }

  assignTow({ requestId, destinationSiteId, route = this.route }) {
    if (!this.canAcceptRoute(route)) return false;
    this.route = route;
    const destinationIndex = route.findIndex((site) => site.id === destinationSiteId);
    if (destinationIndex < 0) return false;
    this.activeTowRequestId = requestId;
    this.towDestinationSiteId = destinationSiteId;
    this.routeIndex = Math.min(1, destinationIndex);
    this.activeCorridorId = null;
    this.navigationMetrics = { distanceTraveled: 0, carefulDistance: 0, replanCount: 0, corridorEntries: 0 };
    this.departureTimer = 0.8;
    this.operationalStatus = "tow-loading";
    this.lastWaypointDistance = distance(this.position, this.getWaypoint());
    return true;
  }

  clearTow() {
    this.activeTowRequestId = null;
    this.towDestinationSiteId = null;
    if (!this.activeShipmentId) this.operationalStatus = "seeking-work";
  }

  queueCargoTransfer({ commodity, direction }) {
    this.cargoTransfers.push({ commodity, direction, progress: 0, duration: 0.9 });
  }

  updateCargoTransfers(deltaSeconds) {
    this.cargoTransfers.forEach((transfer) => { transfer.progress += deltaSeconds / transfer.duration; });
    this.cargoTransfers = this.cargoTransfers.filter((transfer) => transfer.progress < 1);
  }

  emitWearIssueIfNeeded() {
    const issueCount = Math.floor(this.wear / 6);
    if (issueCount <= this.wearIssueCount) return;
    this.wearIssueCount = issueCount;
    const issueType = this.carefulWearSinceIssue >= 0.12 ? "maneuvering-strain" : issueCount % 2 === 0 ? "control-fault" : "hull-fatigue";
    this.carefulWearSinceIssue = 0;
    this.pendingWearIssue = { npcId: this.id, npcName: this.name, shipVin: this.publicIdentity?.shipVin, wear: this.wear, issueCount, issueType, causedByCarefulMode: issueType === "maneuvering-strain" };
    this.operationalStatus = "disabled";
    this.pendingEvents.push({ type: "npc.assistanceRequired", payload: { ...this.pendingWearIssue, shipmentId: this.activeShipmentId, shipmentIds: this.shipmentCommitments.map((entry) => entry.shipmentId), reason: issueType, x: Math.round(this.position.x), y: Math.round(this.position.y) } });
  }

  emitPendingWearIssueAt(site) {
    if (!this.pendingWearIssue || site?.id !== this.maintenanceSiteId) return;
    this.pendingEvents.push({ type: "npc.wearIssue", payload: this.pendingWearIssue });
    this.pendingWearIssue = null;
  }

  getMaxSpeed() {
    const carefulMultiplier = this.isCarefulMode ? CAREFUL_SPEED_MULTIPLIER : 1;
    const corridorMultiplier = this.activeCorridorId ? CORRIDOR_CRUISE_SPEED_MULTIPLIER : 1;
    return MAX_SPEED * corridorMultiplier * carefulMultiplier * this.getTurnSpeedMultiplier() * (this.conditionSpeedMultiplier ?? 1);
  }

  getTurnSpeedMultiplier() {
    const current = this.route[this.routeIndex];
    const previous = this.route[this.routeIndex - 1];
    const next = this.route[this.routeIndex + 1];
    if (current?.type !== "corridor-waypoint" || !previous?.position || !next?.position) return 1;
    const incoming = normalize(current.position.x - previous.position.x, current.position.y - previous.position.y, 1);
    const outgoing = normalize(next.position.x - current.position.x, next.position.y - current.position.y, 1);
    const turnAngle = Math.acos(Math.max(-1, Math.min(1, incoming.x * outgoing.x + incoming.y * outgoing.y)));
    return Math.max(0.54, 1 - turnAngle / Math.PI * 0.72);
  }

  getAvoidanceWeight() {
    if (this.isCarefulMode) {
      return 1.15;
    }

    return this.turnSettleTimer > 0 ? 1.45 : 1.9;
  }

  get isCarefulMode() {
    return this.carefulModeTimer > 0;
  }

  consumeEvents() {
    const events = this.pendingEvents;

    this.pendingEvents = [];
    return events;
  }

  updateCarefulMode(deltaSeconds, asteroids, waypointDistance) {
    if (this.activeCorridorId) {
      // Maintained corridors deliberately keep their center clear. Shoulder
      // rocks may sit inside the broad navigation lookahead, but they should
      // not make a hauler distrust the road. Only an object intruding into the
      // craft's immediate physical envelope can trigger careful mode here.
      const immediateObstruction = asteroids.some((asteroid) => {
        const emergencyRadius = asteroid.radius + BODY_RADIUS + 30;
        return distanceSquared(this.position, asteroid.position) <= emergencyRadius * emergencyRadius;
      });
      if (!immediateObstruction) {
        this.blockedTimer = 0;
        this.carefulModeTimer = 0;
        return;
      }
    }
    const progress = this.lastWaypointDistance - waypointDistance;
    const nearRock = asteroids.some((asteroid) => {
      const carefulTriggerRadius = asteroid.radius + 150;

      return distanceSquared(this.position, asteroid.position) <= carefulTriggerRadius * carefulTriggerRadius;
    });
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const isMakingPoorProgress = progress < deltaSeconds * 12;

    if (nearRock && (speed < 34 || isMakingPoorProgress)) {
      this.blockedTimer += deltaSeconds;
    } else {
      this.blockedTimer = Math.max(0, this.blockedTimer - deltaSeconds * 1.5);
    }

    if (this.blockedTimer < CAREFUL_TRIGGER_SECONDS) {
      return;
    }

    const wasCareful = this.isCarefulMode;

    this.carefulModeTimer = CAREFUL_MODE_SECONDS;
    this.blockedTimer = 0;

    if (!wasCareful) {
      this.navigationMetrics.replanCount += 1;
      this.pendingEvents.push({
        type: "npc.navigationReplanned",
        payload: {
          npcId: this.id,
          npcName: this.name,
          npcType: "route-hauler",
          reason: "obstructed-route",
          x: Math.round(this.position.x),
          y: Math.round(this.position.y),
          waypointIndex: this.routeIndex,
          corridorId: this.activeCorridorId,
          replanCount: this.navigationMetrics.replanCount,
        },
      });
    }
  }

  updateStuckEscape(deltaSeconds, ships, asteroids) {
    const isCloseToOtherShip = ships.some(
      (ship) => ship !== this && ship.isAlive && distance(this.position, ship.position) < 95,
    );
    const isPinnedByRock = asteroids.some((asteroid) => {
      const safeRadius = asteroid.radius + BODY_RADIUS + 35;

      return distanceSquared(this.position, asteroid.position) < safeRadius * safeRadius;
    });
    const speed = Math.hypot(this.velocity.x, this.velocity.y);

    if ((!isCloseToOtherShip && !isPinnedByRock) || speed > STUCK_SPEED) {
      this.stuckTimer = 0;
      return;
    }

    this.stuckTimer += deltaSeconds;

    if (this.stuckTimer < STUCK_SECONDS) {
      return;
    }

    const routeDirection = normalize(this.getWaypoint().x - this.position.x, this.getWaypoint().y - this.position.y, 1);
    const sideDirection = {
      x: -routeDirection.y * this.avoidanceSide,
      y: routeDirection.x * this.avoidanceSide,
    };
    const angle = Math.atan2(sideDirection.y, sideDirection.x);
    this.velocity.x += Math.cos(angle) * 95;
    this.velocity.y += Math.sin(angle) * 95;
    this.position.x += Math.cos(angle) * 18;
    this.position.y += Math.sin(angle) * 18;
    this.stuckTimer = 0;
  }

  applySteer(force, weight = 1) {
    this.acceleration.x += force.x * weight;
    this.acceleration.y += force.y * weight;
  }

  integrate(deltaSeconds) {
    this.velocity.x += this.acceleration.x * deltaSeconds * 60;
    this.velocity.y += this.acceleration.y * deltaSeconds * 60;

    const limitedVelocity = limit(this.velocity, this.getMaxSpeed());
    this.velocity.x = limitedVelocity.x;
    this.velocity.y = limitedVelocity.y;

    const moveX = this.velocity.x * deltaSeconds;
    const moveY = this.velocity.y * deltaSeconds;
    this.position.x += moveX;
    this.position.y += moveY;
    const traveled = Math.hypot(moveX, moveY);
    this.navigationMetrics.distanceTraveled += traveled;
    if (this.isCarefulMode) this.navigationMetrics.carefulDistance += traveled;
    if (this.operationalStatus === "available") {
      const wearIncrement = traveled * getTravelWearRate({
        corridor: Boolean(this.activeCorridorId),
        careful: this.isCarefulMode,
      });
      this.wear += wearIncrement;
      if (this.isCarefulMode) this.carefulWearSinceIssue += wearIncrement;
      this.emitWearIssueIfNeeded();
    }
    this.acceleration.x = 0;
    this.acceleration.y = 0;
    this.updateHeading(deltaSeconds);
  }

  updateHeading(deltaSeconds) {
    const speed = Math.hypot(this.velocity.x, this.velocity.y);

    if (speed < 4) {
      return;
    }

    this.heading = lerpAngle(this.heading, Math.atan2(this.velocity.y, this.velocity.x), Math.min(1, deltaSeconds * 5.8));
  }

  updateCargoSegments(deltaSeconds) {
    // The train used to mix seconds-based acceleration with a frame-scaled
    // position update. One slow frame could inject enough energy for every car
    // to overcorrect forever. A fixed substep and critically damped spring keep
    // the visual rope stable across normal frames, pauses, and tab throttling.
    let remaining = Math.min(Math.max(0, deltaSeconds), CARGO_PHYSICS_MAX_CATCHUP);
    while (remaining > 0) {
      const step = Math.min(CARGO_PHYSICS_STEP, remaining);
      let anchor = this.position;

      this.cargoSegments.forEach((segment) => {
        if (!Number.isFinite(segment.position.x + segment.position.y + segment.velocity.x + segment.velocity.y)) {
          segment.position.x = anchor.x - Math.cos(this.heading) * CARGO_CAR_SPACING;
          segment.position.y = anchor.y - Math.sin(this.heading) * CARGO_CAR_SPACING;
          segment.velocity.x = 0;
          segment.velocity.y = 0;
        }

        const offsetX = segment.position.x - anchor.x;
        const offsetY = segment.position.y - anchor.y;
        const currentDistance = Math.hypot(offsetX, offsetY) || 1;
        const targetX = anchor.x + (offsetX / currentDistance) * CARGO_CAR_SPACING;
        const targetY = anchor.y + (offsetY / currentDistance) * CARGO_CAR_SPACING;
        const omega = CARGO_CAR_SPRING_FREQUENCY;
        const accelerationX = (targetX - segment.position.x) * omega * omega - segment.velocity.x * 2 * omega;
        const accelerationY = (targetY - segment.position.y) * omega * omega - segment.velocity.y * 2 * omega;

        segment.velocity.x += accelerationX * step;
        segment.velocity.y += accelerationY * step;
        const boundedVelocity = limit(segment.velocity, CARGO_CAR_MAX_SPEED);
        segment.velocity.x = boundedVelocity.x;
        segment.velocity.y = boundedVelocity.y;
        segment.position.x += segment.velocity.x * step;
        segment.position.y += segment.velocity.y * step;

        const linkX = segment.position.x - anchor.x;
        const linkY = segment.position.y - anchor.y;
        const linkLength = Math.hypot(linkX, linkY);
        if (linkLength > CARGO_CAR_MAX_LINK_LENGTH) {
          segment.position.x = anchor.x + (linkX / linkLength) * CARGO_CAR_MAX_LINK_LENGTH;
          segment.position.y = anchor.y + (linkY / linkLength) * CARGO_CAR_MAX_LINK_LENGTH;
          const outwardSpeed = segment.velocity.x * (linkX / linkLength) + segment.velocity.y * (linkY / linkLength);
          if (outwardSpeed > 0) {
            segment.velocity.x -= (linkX / linkLength) * outwardSpeed;
            segment.velocity.y -= (linkY / linkLength) * outwardSpeed;
          }
        }
        anchor = segment.position;
      });
      remaining -= step;
    }

    let anchor = this.position;
    this.cargoSegments.forEach((segment) => {
      segment.heading = lerpAngle(segment.heading, Math.atan2(anchor.y - segment.position.y, anchor.x - segment.position.x), Math.min(1, deltaSeconds * 7));
      anchor = segment.position;
    });
  }

  installShield({ maxCharge = 72 } = {}) {
    this.shield = { installed: true, charge: maxCharge, maxCharge, absorbedDamage: this.shield?.absorbedDamage ?? 0 };
  }

  rechargeShield(units) {
    if (!this.shield.installed) return 0;
    const before = this.shield.charge;
    this.shield.charge = Math.min(this.shield.maxCharge, this.shield.charge + Math.max(0, units));
    return this.shield.charge - before;
  }

  updateHubService(sites = []) {
    this.activeHub =
      sites.find((site) => {
        if (site.type !== "hub") {
          return false;
        }

        return distance(this.position, site.position) <= site.interactionRadius + HUB_TETHER_PADDING;
      }) ?? null;
  }

  draw(context, camera) {
    if (!this.isAlive) {
      return;
    }

    const screenX = this.position.x - camera.x;
    const screenY = this.position.y - camera.y;

    context.save();
    context.translate(screenX, screenY);
    context.rotate(this.heading);

    context.strokeStyle = this.palette.hullStroke;
    context.fillStyle = this.palette.hullFill;
    context.lineWidth = 2;

    context.beginPath();
    context.moveTo(22, 0);
    context.lineTo(-8, -13);
    context.lineTo(-8, 13);
    context.closePath();
    context.fill();
    context.stroke();

    context.restore();

    if (this.activeTowRequestId) this.drawTowRunner(context, camera);

    this.drawCargoTrain(context, camera);
    this.drawHubTethers(context, camera);
  }

  drawTowRunner(context, camera) {
    const runnerX = this.position.x + Math.cos(this.heading) * 72;
    const runnerY = this.position.y + Math.sin(this.heading) * 72;
    context.save();
    context.strokeStyle = "rgba(126, 232, 255, 0.78)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(this.position.x - camera.x, this.position.y - camera.y);
    context.lineTo(runnerX - camera.x, runnerY - camera.y);
    context.stroke();
    context.translate(runnerX - camera.x, runnerY - camera.y);
    context.rotate(this.heading);
    context.strokeStyle = "#9ee8ff";
    context.fillStyle = "rgba(90, 190, 225, 0.16)";
    context.beginPath();
    context.moveTo(18, 0);
    context.lineTo(-10, -11);
    context.lineTo(-10, 11);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }

  drawCargoTrain(context, camera) {
    let anchor = this.position;

    this.cargoSegments.forEach((segment, index) => {
      const screenX = segment.position.x - camera.x;
      const screenY = segment.position.y - camera.y;
      const anchorX = anchor.x - camera.x;
      const anchorY = anchor.y - camera.y;
      const sway = Math.sin(this.pulse * 2.3 + index + this.seed) * 1.5;

      context.save();
      context.strokeStyle = this.palette.linkStroke;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(anchorX, anchorY);
      context.lineTo(screenX, screenY);
      context.stroke();

      context.translate(screenX, screenY);
      context.rotate(segment.heading);
      context.strokeStyle = this.palette.trainStroke;
      context.fillStyle = segment.loaded ? this.palette.trainFill : this.palette.hullFill;
      context.strokeRect(-11, -10 + sway, 22, 20);
      context.fillRect(-11, -10 + sway, 22, 20);
      context.restore();

      anchor = segment.position;
    });
  }

  drawHubTethers(context, camera) {
    if (!this.activeHub || this.cargoTransfers.length === 0) {
      return;
    }

    const hubX = this.activeHub.position.x - camera.x;
    const hubY = this.activeHub.position.y - camera.y;

    this.cargoTransfers.forEach((transfer, index) => {
      const segment = this.cargoSegments[index % this.cargoSegments.length];
      const segmentX = segment.position.x - camera.x;
      const segmentY = segment.position.y - camera.y;
      const flow = transfer.direction === "from-hub" ? 1 - transfer.progress : transfer.progress;
      const lightX = segmentX + (hubX - segmentX) * flow;
      const lightY = segmentY + (hubY - segmentY) * flow;

      context.save();
      context.strokeStyle = "rgba(158, 232, 255, 0.24)";
      context.lineWidth = 1;
      context.setLineDash([4, 7]);
      context.beginPath();
      context.moveTo(segmentX, segmentY);
      context.lineTo(hubX, hubY);
      context.stroke();
      context.setLineDash([]);
      context.translate(lightX, lightY);
      context.fillStyle = getResourceColor(transfer.commodity);
      context.strokeStyle = "rgba(255, 255, 255, 0.88)";
      context.lineWidth = 1;
      drawResourceShape(context, getResourceShape(transfer.commodity), 8);
      context.restore();
    });
  }
}

function createCargoSegments(position, direction, count, seed) {
  return Array.from({ length: count }, (_, index) => {
    const distanceBehindCab = CARGO_CAR_SPACING * (index + 1);

    return {
      position: {
        x: position.x - direction.x * distanceBehindCab,
        y: position.y - direction.y * distanceBehindCab,
      },
      velocity: { x: 0, y: 0 },
      heading: Math.atan2(direction.y, direction.x),
      loaded: (seed + index) % 2 === 0,
    };
  });
}

function arrive(ship, target) {
  const offsetX = target.x - ship.position.x;
  const offsetY = target.y - ship.position.y;
  const distanceToTarget = Math.hypot(offsetX, offsetY);
  const maxSpeed = ship.getMaxSpeed();
  const speed = distanceToTarget < ARRIVE_RADIUS ? maxSpeed * (distanceToTarget / ARRIVE_RADIUS) : maxSpeed;
  const desired = normalize(offsetX, offsetY, Math.max(ship.isCarefulMode ? 18 : 35, speed));

  return limit(
    {
      x: desired.x - ship.velocity.x,
      y: desired.y - ship.velocity.y,
    },
    MAX_FORCE,
  );
}

function getLaneWaypoint(route, routeIndex, laneOffset) {
  const previous = route[(routeIndex - 1 + route.length) % route.length].position;
  const current = route[routeIndex].position;
  const lane = normalize(current.x - previous.x, current.y - previous.y, 1);
  const side = { x: -lane.y, y: lane.x };

  return {
    x: current.x + side.x * laneOffset,
    y: current.y + side.y * laneOffset,
  };
}

function steerTowardOpenGap(ship, target, asteroids) {
  if (!asteroids?.length) return { x: 0, y: 0 };

  const targetHeading = Math.atan2(target.y - ship.position.y, target.x - ship.position.x);
  const currentHeading = Math.atan2(ship.velocity.y, ship.velocity.x);
  const offsets = [0, -0.34, 0.34, -0.68, 0.68, -1.02, 1.02];
  const lookAhead = ship.activeTowRequestId ? [110, 220, 360, 500] : [105, 210, 340, 470];
  const shipEnvelope = ship.activeTowRequestId ? 104 : 72;
  let nearbyObstacle = false;
  let best = null;

  offsets.forEach((offset) => {
    const heading = targetHeading + offset;
    const direction = { x: Math.cos(heading), y: Math.sin(heading) };
    let minimumClearance = Infinity;

    lookAhead.forEach((lookDistance) => {
      const sample = {
        x: ship.position.x + direction.x * lookDistance,
        y: ship.position.y + direction.y * lookDistance,
      };
      asteroids.forEach((asteroid) => {
        const clearance = distance(sample, asteroid.position) - asteroid.radius - shipEnvelope;
        minimumClearance = Math.min(minimumClearance, clearance);
        if (distanceSquared(ship.position, asteroid.position) < 560 * 560) nearbyObstacle = true;
      });
    });

    const progress = Math.cos(offset) * 2.8;
    const clearanceScore = Math.min(3, minimumClearance / 115);
    const turnCost = Math.abs(Math.atan2(Math.sin(heading - currentHeading), Math.cos(heading - currentHeading))) * 0.3;
    const sidePreference = Math.sign(offset) === ship.avoidanceSide ? 0.08 : 0;
    const score = progress + clearanceScore - turnCost + sidePreference;
    if (!best || score > best.score) best = { heading, score };
  });

  if (!nearbyObstacle || !best) return { x: 0, y: 0 };
  const desiredSpeed = ship.getMaxSpeed() * (ship.isCarefulMode ? 0.9 : 1);
  return limit({
    x: Math.cos(best.heading) * desiredSpeed - ship.velocity.x,
    y: Math.sin(best.heading) * desiredSpeed - ship.velocity.y,
  }, MAX_FORCE * 1.75);
}

function avoidAsteroids(ship, asteroids) {
  const avoid = { x: 0, y: 0 };
  const forward = normalize(ship.velocity.x, ship.velocity.y, 1);
  const avoidRadius = ship.isCarefulMode ? 145 : AVOID_RADIUS;
  const feelerDistance = ship.isCarefulMode ? 92 : 150;
  let count = 0;

  asteroids.forEach((asteroid) => {
    const forwardPosition = {
      x: ship.position.x + forward.x * feelerDistance,
      y: ship.position.y + forward.y * feelerDistance,
    };
    const safeRadius = asteroid.radius + avoidRadius;
    const distanceToRockSquared = distanceSquared(ship.position, asteroid.position);
    const forwardDistanceSquared = distanceSquared(forwardPosition, asteroid.position);

    if (
      distanceToRockSquared === 0 ||
      (distanceToRockSquared > safeRadius * safeRadius && forwardDistanceSquared > safeRadius * safeRadius)
    ) {
      return;
    }

    const distanceToRock = Math.max(1, Math.sqrt(Math.min(distanceToRockSquared, forwardDistanceSquared)));
    const strength = Math.max(0, (safeRadius - distanceToRock) / safeRadius) ** 1.25;
    const awayX = (ship.position.x - asteroid.position.x) / distanceToRock;
    const awayY = (ship.position.y - asteroid.position.y) / distanceToRock;
    const passSideX = -forward.y * ship.avoidanceSide;
    const passSideY = forward.x * ship.avoidanceSide;
    const passAlignment = awayX * passSideX + awayY * passSideY < -0.15 ? -1 : 1;

    const awayWeight = ship.isCarefulMode ? 0.42 : 0.7;
    const passWeight = ship.isCarefulMode ? 1.08 : 0.9;

    avoid.x += awayX * strength * awayWeight + passSideX * passAlignment * strength * passWeight;
    avoid.y += awayY * strength * awayWeight + passSideY * passAlignment * strength * passWeight;
    count += 1;
  });

  if (count === 0) {
    return { x: 0, y: 0 };
  }

  avoid.x /= count;
  avoid.y /= count;

  return limit(avoid, MAX_FORCE * (ship.isCarefulMode ? 3.1 : 4.2));
}

function separateShips(ship, ships) {
  const force = { x: 0, y: 0 };
  let count = 0;

  ships.forEach((other) => {
    if (other === ship || !other.isAlive) {
      return;
    }

    const distanceToOther = Math.max(1, distance(ship.position, other.position));

    if (distanceToOther > 120) {
      return;
    }

    force.x += (ship.position.x - other.position.x) / distanceToOther;
    force.y += (ship.position.y - other.position.y) / distanceToOther;
    count += 1;
  });

  if (count === 0) {
    return { x: 0, y: 0 };
  }

  return limit(force, MAX_FORCE * 4.8);
}

function normalize(x, y, magnitude = 1) {
  const length = Math.hypot(x, y) || 1;

  return {
    x: (x / length) * magnitude,
    y: (y / length) * magnitude,
  };
}

function limit(vector, max) {
  const length = Math.hypot(vector.x, vector.y);

  if (length <= max || length === 0) {
    return { x: vector.x, y: vector.y };
  }

  return {
    x: (vector.x / length) * max,
    y: (vector.y / length) * max,
  };
}

function lerpAngle(from, to, amount) {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));

  return from + difference * amount;
}

function distance(first, second) {
  return Math.sqrt(distanceSquared(first, second));
}

function distanceSquared(first, second) {
  const distanceX = first.x - second.x;
  const distanceY = first.y - second.y;

  return distanceX * distanceX + distanceY * distanceY;
}
