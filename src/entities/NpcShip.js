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

export class NpcShip {
  constructor({ id, name, route, x, y, seed = 1, laneOffset = 0 }) {
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
    this.hull = 180;
    this.isAlive = true;
    this.pulse = seed * 0.37;
    this.cargoCars = 2 + (seed % 3);
    this.drawRadius = 260 + this.cargoCars * 85;
    this.stuckTimer = 0;
    this.avoidanceSide = laneOffset < 0 ? -1 : 1;
    this.turnSettleTimer = 0;
    this.carefulModeTimer = 0;
    this.blockedTimer = 0;
    this.lastWaypointDistance = distance(this.position, firstWaypoint);
    this.pendingEvents = [];
  }

  update(deltaSeconds, world) {
    if (!this.isAlive) {
      return;
    }

    this.pulse += deltaSeconds;
    const waypoint = this.getWaypoint();
    const waypointDistance = distance(this.position, waypoint);

    if (waypointDistance <= WAYPOINT_RADIUS) {
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      this.turnSettleTimer = 0.9;
      this.lastWaypointDistance = distance(this.position, this.getWaypoint());
    }

    this.updateCarefulMode(deltaSeconds, world.asteroids, waypointDistance);
    this.applySteer(arrive(this, this.getWaypoint()));
    this.applySteer(avoidAsteroids(this, world.asteroids), this.getAvoidanceWeight());
    this.applySteer(separateShips(this, world.npcShips), this.turnSettleTimer > 0 ? 1.05 : 1.3);
    this.updateStuckEscape(deltaSeconds, world.npcShips, world.asteroids);
    this.integrate(deltaSeconds);
    this.turnSettleTimer = Math.max(0, this.turnSettleTimer - deltaSeconds);
    this.carefulModeTimer = Math.max(0, this.carefulModeTimer - deltaSeconds);
    this.lastWaypointDistance = distance(this.position, this.getWaypoint());
  }

  damage(amount) {
    this.hull -= amount;

    if (this.hull <= 0) {
      this.isAlive = false;
    }
  }

  getWaypoint() {
    return getLaneWaypoint(this.route, this.routeIndex, this.laneOffset);
  }

  getMaxSpeed() {
    return this.isCarefulMode ? MAX_SPEED * CAREFUL_SPEED_MULTIPLIER : MAX_SPEED;
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
      this.pendingEvents.push({
        type: "npc.carefulMode",
        payload: {
          npcId: this.id,
          npcName: this.name,
          npcType: "route-hauler",
          reason: "obstructed-route",
          x: Math.round(this.position.x),
          y: Math.round(this.position.y),
          waypointIndex: this.routeIndex,
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

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
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

  draw(context, camera) {
    if (!this.isAlive) {
      return;
    }

    const screenX = this.position.x - camera.x;
    const screenY = this.position.y - camera.y;

    context.save();
    context.translate(screenX, screenY);
    context.rotate(this.heading);

    context.strokeStyle = "#ffe6a6";
    context.fillStyle = "rgba(255, 230, 166, 0.11)";
    context.lineWidth = 2;

    context.beginPath();
    context.moveTo(22, 0);
    context.lineTo(-8, -13);
    context.lineTo(-8, 13);
    context.closePath();
    context.fill();
    context.stroke();

    for (let index = 0; index < this.cargoCars; index += 1) {
      const carX = -34 - index * 30;
      const sway = Math.sin(this.pulse * 2.3 + index + this.seed) * 2;

      context.strokeStyle = "rgba(255, 230, 166, 0.46)";
      context.beginPath();
      context.moveTo(carX + 14, 0);
      context.lineTo(carX + 22, sway);
      context.stroke();

      context.strokeStyle = "#ffd36b";
      context.fillStyle = "rgba(255, 211, 107, 0.13)";
      context.strokeRect(carX - 10, -10 + sway, 22, 20);
      context.fillRect(carX - 10, -10 + sway, 22, 20);
    }

    context.restore();
  }
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
