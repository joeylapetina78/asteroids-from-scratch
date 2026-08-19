import {
  GRAZING_STAGE,
  getGrazeFieldRadius,
  getGrazingSteerTarget,
  getGrowthScale,
  isRipe,
} from "../systems/grazing.js?v=fresh-20260818-2212-559e0fe";

// How hard a grazer commits once it has locked onto food. Idle wandering keeps
// the old dreamy steering; a creature crossing a field to a meal does not.
const GRAZER_FEED_URGENCY = Object.freeze({
  approach: 6,
  nibble: 8,
  recoil: 6.5,
  finish: 2,
});
// And it swims faster while it is going somewhere on purpose.
const GRAZER_FEED_SPEED_SCALE = 1.6;

const LIFE_COLORS = {
  hunter: "#ff5d6c",
  threadling: "#b8f7ff",
  grazer: "#8cf0b2",
  skitter: "#d9b3ff",
  lantern: "#ffe98a",
  bloom: "#ff9ed6", // round pulsing drifter — soft rose, fertile/calm zones
  filament: "#c6ff70", // wiggling anchored hairs — alien lime, strange/scanergy zones
};

// A single Lifeform class covers the current autonomous agents. The type chooses
// both drawing style and steering recipe: hunters seek, threadlings flock,
// grazers orbit rocks, lanterns drift around rich rocks, and skitters dart
// around danger.
export class Lifeform {
  constructor({ type, x, y, velocity, seed, role = null, name = null, birthSeconds = 0 }) {
    this.type = type;
    this.role = role;
    this.name = name;
    this.position = { x, y };
    this.velocity = velocity;
    this.acceleration = { x: 0, y: 0 };
    this.seed = seed;
    this.wanderAngle = seed * 0.013;
    this.pulse = seed * 0.021;
    // Emerge animation: age counts up from birth; while age < birthSeconds the
    // creature scales and fades up out of its rock instead of snapping in.
    // birthSeconds 0 = born fully formed (initial seeding, hunters, incursions).
    this.age = 0;
    this.birthSeconds = birthSeconds;
    // A grazer thickens as it feeds, so `radius` is derived rather than fixed.
    this.baseRadius = getRadius(type);
    this.radius = this.baseRadius;
    this.fullness = 0;
    this.baseMaxSpeed = getMaxSpeed(type);
    this.maxSpeed = this.baseMaxSpeed;
    this.maxForce = getMaxForce(type);
    this.perception = getPerception(type);
    this.isAlive = true;
    this.health = type === "hunter" ? 100 : 1;
    this.webTrail = [];
  }

  update(deltaSeconds, world) {
    this.pulse += deltaSeconds;
    this.age += deltaSeconds;

    // What it has eaten shows on it, and a fat one is a bigger target.
    if (this.type === "grazer") {
      if (this.fullness > 0) this.radius = this.baseRadius * getGrowthScale(this);
      // Chasing a meal lifts the speed ceiling too, so a distant feast is worth
      // crossing the field for rather than a five-minute drift.
      this.maxSpeed = this.grazingTarget ? this.baseMaxSpeed * GRAZER_FEED_SPEED_SCALE : this.baseMaxSpeed;
    }

    if (this.type === "hunter") {
      this.updateHunter(deltaSeconds, world);
    } else if (this.type === "threadling") {
      this.updateThreadling(deltaSeconds, world);
    } else if (this.type === "grazer") {
      this.updateGrazer(deltaSeconds, world);
    } else if (this.type === "lantern") {
      this.updateLantern(deltaSeconds, world);
    } else if (this.type === "bloom") {
      this.updateBloom(deltaSeconds, world);
    } else if (this.type === "filament") {
      this.updateFilament(deltaSeconds, world);
    } else {
      this.updateSkitter(deltaSeconds, world);
    }

    this.integrate(deltaSeconds);
  }

  updateHunter(deltaSeconds, world) {
    const distanceToShip = distance(this.position, world.ship.position);

    // Powering the ship down removes the hunter lock. They still wander, which
    // keeps them alive in the world without always knowing where the player is.
    if (world.shipPowered && distanceToShip < 1150) {
      this.applySteer(seek(this, world.ship.position, this.maxSpeed), 2.35);
      this.applySteer(separate(this, nearbyLifeforms(this, world.lifeforms, 110), 78), 0.65);
    } else {
      this.applySteer(this.wander(deltaSeconds), world.shipPowered ? 0.8 : 1.15);
    }

    this.applySteer(orbitNearestAsteroid(this, world.asteroids, 460, 90, deltaSeconds), 0.28);
    this.avoidAsteroids(world.asteroids, 5.2);
  }

  updateThreadling(deltaSeconds, world) {
    const neighbors = nearbyLifeforms(this, world.lifeforms, 210, "threadling");
    const mixedNeighbors = nearbyLifeforms(this, world.lifeforms, 135);

    if (neighbors.length > 0) {
      this.applySteer(separate(this, neighbors, 48), 1.55);
      this.applySteer(align(this, neighbors), 0.95);
      this.applySteer(cohere(this, neighbors), 0.78);
    }

    this.applySteer(separate(this, mixedNeighbors, 34), 0.35);
    this.applySteer(orbitNearestAsteroid(this, world.asteroids, 520, 120, deltaSeconds), 0.9);
    this.applySteer(fleeIfClose(this, world.ship.position, 185, this.maxSpeed * 1.1), 1.15);
    this.applySteer(this.wander(deltaSeconds), 0.34);
    this.avoidAsteroids(world.asteroids, 4.8);
  }

  updateGrazer(deltaSeconds, world) {
    // Something abandoned in the field outranks the usual patrol around a rock.
    // The grazing system decides WHAT is worth going to and WHERE in the meal it
    // is; this only puts the body there. Each stage moves differently, which is
    // the whole reason the meal reads as an animal deciding rather than as a
    // countdown: a hard dart in, a quick flinch back, a slow settle.
    const bite = getGrazingSteerTarget(this);

    if (bite) {
      const stage = this.grazingStage;
      // A drifting grazer has almost no steering authority — `maxForce` 0.13
      // means about eleven seconds just to reach its own top speed. That is
      // right for an animal idling around a rock and hopeless for one crossing
      // a field to a meal, which is why a whole spill used to take minutes to
      // clear: nearly all of it was spent accelerating and turning, not eating.
      // Committing to food buys real urgency.
      const urgency = stage === GRAZING_STAGE.NIBBLE ? GRAZER_FEED_URGENCY.nibble
        : stage === GRAZING_STAGE.RECOIL ? GRAZER_FEED_URGENCY.recoil
        : stage === GRAZING_STAGE.FINISH ? GRAZER_FEED_URGENCY.finish
        : GRAZER_FEED_URGENCY.approach;
      const pace = stage === GRAZING_STAGE.FINISH ? 0.35 : 1;

      this.applySteer(seek(this, bite, this.maxSpeed * pace), urgency);
      this.applySteer(separate(this, nearbyLifeforms(this, world.lifeforms, 125), 58), 0.55);
      this.applySteer(fleeIfClose(this, world.ship.position, 300, this.maxSpeed * 1.15), 1.8);
      // Barely any rock-shyness while feeding. Grazers live around rocks, and at
      // full avoidance a drop resting against one sits exactly where approach and
      // avoidance cancel — the creature hangs there at a fixed distance forever,
      // holding a claim on food it can never reach.
      this.avoidAsteroids(world.asteroids, 0.9);
      return;
    }

    const asteroid = findNearestAsteroid(this.position, world.asteroids, 520);

    if (asteroid) {
      const orbit = {
        x: asteroid.position.x + Math.cos(this.pulse * 0.7 + this.seed) * (asteroid.radius + 54),
        y: asteroid.position.y + Math.sin(this.pulse * 0.7 + this.seed) * (asteroid.radius + 54),
      };
      this.applySteer(seek(this, orbit, this.maxSpeed), 0.95);
    } else {
      this.applySteer(this.wander(deltaSeconds), 0.75);
    }

    this.applySteer(separate(this, nearbyLifeforms(this, world.lifeforms, 125), 58), 0.55);
    this.applySteer(fleeIfClose(this, world.ship.position, 300, this.maxSpeed * 1.15), 1.8);

    this.avoidAsteroids(world.asteroids, 4.2);
  }

  updateLantern(deltaSeconds, world) {
    const asteroid = findNearestResourceAsteroid(this.position, world.asteroids, 700);

    if (asteroid) {
      const herdOffset = (this.seed % 7) * 0.35;
      const orbitDistance = asteroid.radius + 92 + (this.seed % 4) * 18;
      const orbit = {
        x: asteroid.position.x + Math.cos(this.pulse * 0.34 + this.seed + herdOffset) * orbitDistance,
        y: asteroid.position.y + Math.sin(this.pulse * 0.34 + this.seed + herdOffset) * orbitDistance,
      };
      this.applySteer(seek(this, orbit, this.maxSpeed * 0.78), 0.92);
    } else {
      this.applySteer(this.wander(deltaSeconds), 0.55);
    }

    this.applySteer(separate(this, nearbyLifeforms(this, world.lifeforms, 155, "lantern"), 72), 0.78);
    this.applySteer(separate(this, nearbyLifeforms(this, world.lifeforms, 92), 34), 0.28);
    this.applySteer(fleeIfClose(this, world.ship.position, 240, this.maxSpeed * 1.05), 0.65);
    this.applySteer(fleeDisturbances(this, world.disturbances ?? [], this.maxSpeed * 1.75), 2.1);

    const nearestHunter = findNearestLifeform(this.position, world.lifeforms, "hunter", 620);

    if (nearestHunter) {
      this.applySteer(flee(this, nearestHunter.position, this.maxSpeed * 1.85), 2.35);
    }

    this.avoidAsteroids(world.asteroids, 3.7);
  }

  updateSkitter(deltaSeconds, world) {
    this.rememberWebTrail(deltaSeconds);
    const asteroid = findNearestAsteroid(this.position, world.asteroids, 380);

    if (asteroid && distanceSquared(this.position, asteroid.position) < (asteroid.radius + 70) ** 2) {
      this.applySteer(flee(this, asteroid.position, this.maxSpeed), 1.6);
    } else {
      this.applySteer(orbitNearestAsteroid(this, world.asteroids, 620, 150, deltaSeconds), 0.72);
    }

    this.applySteer(fleeIfClose(this, world.ship.position, 520, this.maxSpeed * 1.35), 2.15);
    this.applySteer(separate(this, nearbyLifeforms(this, world.lifeforms, 95), 52), 0.9);
    this.applySteer(this.wander(deltaSeconds * 1.6), 1.0);
    this.avoidAsteroids(world.asteroids, 5.6);
  }

  // Blooms drift in open water in loose schools, pulsing. They part gently as
  // the ship approaches rather than bolting — dreamy, not skittish.
  updateBloom(deltaSeconds, world) {
    const school = nearbyLifeforms(this, world.lifeforms, 260, "bloom");

    if (school.length > 0) {
      this.applySteer(cohere(this, school), 0.2);
      this.applySteer(separate(this, school, 96), 0.7);
    }

    this.applySteer(this.wander(deltaSeconds), 0.5);
    this.applySteer(fleeIfClose(this, world.ship.position, 260, this.maxSpeed * 1.2), 0.9);
    this.applySteer(fleeDisturbances(this, world.disturbances ?? [], this.maxSpeed * 1.5), 1.8);
    this.avoidAsteroids(world.asteroids, 3.2);
  }

  // Filaments are near-rooted: they hover close to a rock and spread into a
  // field. The wiggle lives in the draw, so they read as waving hairs even
  // while nearly still; they only recoil slightly when the ship is close.
  updateFilament(deltaSeconds, world) {
    this.applySteer(orbitNearestAsteroid(this, world.asteroids, 460, 70, deltaSeconds), 0.5);
    this.applySteer(this.wander(deltaSeconds * 0.6), 0.3);
    this.applySteer(separate(this, nearbyLifeforms(this, world.lifeforms, 90, "filament"), 46), 0.9);
    this.applySteer(fleeIfClose(this, world.ship.position, 200, this.maxSpeed * 1.1), 0.8);
    this.applySteer(fleeDisturbances(this, world.disturbances ?? [], this.maxSpeed * 1.6), 1.6);
    this.avoidAsteroids(world.asteroids, 3.0);
  }

  rememberWebTrail(deltaSeconds) {
    this.webTrail.forEach((point) => {
      point.age = (point.age ?? 0) + deltaSeconds;
    });
    this.webTrail = this.webTrail.filter((point) => (point.age ?? 0) < 4.5);

    if (!this.lastWebTrailTime) {
      this.lastWebTrailTime = this.pulse;
      this.webTrail.push({ x: this.position.x, y: this.position.y, age: 0 });
      return;
    }

    if (this.pulse - this.lastWebTrailTime < 0.18 + deltaSeconds * 0.2) {
      return;
    }

    this.lastWebTrailTime = this.pulse;
    this.webTrail.push({ x: this.position.x, y: this.position.y, age: 0 });
    if (this.webTrail.length > 7) {
      this.webTrail.shift();
    }
  }

  wander(deltaSeconds) {
    this.wanderAngle += Math.sin(this.pulse + this.seed) * 1.9 * deltaSeconds;
    const ahead = normalize(this.velocity.x, this.velocity.y, 1);
    const center = {
      x: this.position.x + ahead.x * 90,
      y: this.position.y + ahead.y * 90,
    };
    const target = {
      x: center.x + Math.cos(this.wanderAngle) * 58,
      y: center.y + Math.sin(this.wanderAngle) * 58,
    };

    return seek(this, target, this.maxSpeed * 0.72);
  }

  avoidAsteroids(asteroids, weight) {
    const avoid = { x: 0, y: 0 };
    let count = 0;

    asteroids.forEach((asteroid) => {
      const safeRadius = asteroid.radius + this.perception;
      const distanceToRockSquared = distanceSquared(this.position, asteroid.position);

      if (distanceToRockSquared === 0 || distanceToRockSquared > safeRadius * safeRadius) {
        return;
      }

      const distanceToRock = Math.sqrt(distanceToRockSquared);
      const overlap = asteroid.radius + this.radius - distanceToRock;
      const strength = ((safeRadius - distanceToRock) / safeRadius) ** 1.6;
      const awayX = (this.position.x - asteroid.position.x) / distanceToRock;
      const awayY = (this.position.y - asteroid.position.y) / distanceToRock;
      avoid.x += awayX * strength;
      avoid.y += awayY * strength;

      if (overlap > 0) {
        this.position.x += awayX * overlap * 0.18;
        this.position.y += awayY * overlap * 0.18;
        this.velocity.x += awayX * overlap * 0.7;
        this.velocity.y += awayY * overlap * 0.7;
      }

      count += 1;
    });

    if (count === 0) {
      return;
    }

    avoid.x /= count;
    avoid.y /= count;
    this.applySteer(limit(avoid, this.maxForce * 7.5), weight);
  }

  applySteer(force, weight = 1) {
    this.acceleration.x += force.x * weight;
    this.acceleration.y += force.y * weight;
  }

  integrate(deltaSeconds) {
    this.velocity.x += this.acceleration.x * deltaSeconds * 60;
    this.velocity.y += this.acceleration.y * deltaSeconds * 60;

    const limitedVelocity = limit(this.velocity, this.maxSpeed);
    this.velocity.x = limitedVelocity.x;
    this.velocity.y = limitedVelocity.y;

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.acceleration.x = 0;
    this.acceleration.y = 0;
  }

  draw(context, camera) {
    const screenX = this.position.x - camera.x;
    const screenY = this.position.y - camera.y;
    const heading = Math.atan2(this.velocity.y, this.velocity.x);

    if (this.type === "skitter") {
      drawSkitterTrail(context, this, camera);
    }

    context.save();
    context.translate(screenX, screenY);
    context.rotate(heading);

    // Surfacing: scale up from tiny + fade in over birthSeconds so the creature
    // reads as emerging from the rock rather than popping in at full size.
    if (this.birthSeconds > 0 && this.age < this.birthSeconds) {
      const t = this.age / this.birthSeconds;
      const eased = 1 - (1 - t) * (1 - t); // ease-out
      context.globalAlpha = eased;
      const emergeScale = 0.15 + 0.85 * eased;
      context.scale(emergeScale, emergeScale);
    }

    if (this.type === "hunter") {
      drawHunter(context, this);
    } else if (this.type === "threadling") {
      drawThreadling(context, this);
    } else if (this.type === "grazer") {
      drawGrazer(context, this);
    } else if (this.type === "lantern") {
      drawLantern(context, this);
    } else if (this.type === "bloom") {
      drawBloom(context, this);
    } else if (this.type === "filament") {
      drawFilament(context, this);
    } else {
      drawSkitter(context, this);
    }

    context.restore();
  }

  damage(amount) {
    this.health -= amount;

    if (this.health <= 0) {
      this.isAlive = false;
    }
  }
}

function seek(agent, target, speed) {
  const desired = normalize(target.x - agent.position.x, target.y - agent.position.y, speed);

  return limit(
    {
      x: desired.x - agent.velocity.x,
      y: desired.y - agent.velocity.y,
    },
    agent.maxForce,
  );
}

function flee(agent, target, speed) {
  const desired = normalize(agent.position.x - target.x, agent.position.y - target.y, speed);

  return limit(
    {
      x: desired.x - agent.velocity.x,
      y: desired.y - agent.velocity.y,
    },
    agent.maxForce,
  );
}

function fleeIfClose(agent, target, range, speed) {
  const distanceToTargetSquared = distanceSquared(agent.position, target);

  if (distanceToTargetSquared > range * range) {
    return { x: 0, y: 0 };
  }

  const force = flee(agent, target, speed);
  const distanceToTarget = Math.sqrt(distanceToTargetSquared);
  const closeness = 1 - distanceToTarget / range;

  return {
    x: force.x * (0.35 + closeness * 1.65),
    y: force.y * (0.35 + closeness * 1.65),
  };
}

function fleeDisturbances(agent, disturbances, speed) {
  const force = { x: 0, y: 0 };
  let count = 0;

  disturbances.forEach((disturbance) => {
    const distanceToDisturbance = distance(agent.position, disturbance.position);

    if (distanceToDisturbance > disturbance.radius) {
      return;
    }

    const closeness = 1 - distanceToDisturbance / Math.max(1, disturbance.radius);
    const typeWeight = disturbance.type === "weapon" ? 1.35 : 0.82;
    const away = normalize(
      agent.position.x - disturbance.position.x,
      agent.position.y - disturbance.position.y,
      speed * closeness * typeWeight * (disturbance.intensity ?? 1),
    );

    force.x += away.x;
    force.y += away.y;
    count += 1;
  });

  if (count === 0) {
    return force;
  }

  return limit(
    {
      x: force.x / count,
      y: force.y / count,
    },
    agent.maxForce * 2.2,
  );
}

function separate(agent, neighbors, desiredDistance) {
  const force = { x: 0, y: 0 };

  neighbors.forEach((neighbor) => {
    const distanceToNeighbor = Math.max(1, distance(agent.position, neighbor.position));

    if (distanceToNeighbor > desiredDistance) {
      return;
    }

    force.x += (agent.position.x - neighbor.position.x) / distanceToNeighbor;
    force.y += (agent.position.y - neighbor.position.y) / distanceToNeighbor;
  });

  return limit(force, agent.maxForce * 1.7);
}

function nearbyLifeforms(agent, lifeforms, range, type = null) {
  const rangeSquared = range * range;

  return lifeforms.filter(
    (lifeform) =>
      lifeform !== agent &&
      (type === null || lifeform.type === type) &&
      distanceSquared(agent.position, lifeform.position) < rangeSquared,
  );
}

function findNearestLifeform(position, lifeforms, type, range) {
  const rangeSquared = range * range;
  let nearest = null;
  let nearestDistanceSquared = rangeSquared;

  lifeforms.forEach((lifeform) => {
    if (!lifeform.isAlive || lifeform.type !== type) {
      return;
    }

    const distanceToLifeform = distanceSquared(position, lifeform.position);

    if (distanceToLifeform < nearestDistanceSquared) {
      nearest = lifeform;
      nearestDistanceSquared = distanceToLifeform;
    }
  });

  return nearest;
}

function orbitNearestAsteroid(agent, asteroids, range, orbitDistance, deltaSeconds) {
  const asteroid = findNearestAsteroid(agent.position, asteroids, range);

  if (!asteroid) {
    return { x: 0, y: 0 };
  }

  const angleToAgent = Math.atan2(agent.position.y - asteroid.position.y, agent.position.x - asteroid.position.x);
  const orbitDirection = agent.seed % 2 === 0 ? -1 : 1;
  const targetAngle = angleToAgent + orbitDirection * (0.75 + deltaSeconds * 0.2);
  const targetDistance = asteroid.radius + orbitDistance;
  const target = {
    x: asteroid.position.x + Math.cos(targetAngle) * targetDistance,
    y: asteroid.position.y + Math.sin(targetAngle) * targetDistance,
  };

  return seek(agent, target, agent.maxSpeed * 0.88);
}

function align(agent, neighbors) {
  const average = neighbors.reduce(
    (sum, neighbor) => ({
      x: sum.x + neighbor.velocity.x,
      y: sum.y + neighbor.velocity.y,
    }),
    { x: 0, y: 0 },
  );
  average.x /= neighbors.length;
  average.y /= neighbors.length;

  return limit(
    {
      x: average.x - agent.velocity.x,
      y: average.y - agent.velocity.y,
    },
    agent.maxForce,
  );
}

function cohere(agent, neighbors) {
  const center = neighbors.reduce(
    (sum, neighbor) => ({
      x: sum.x + neighbor.position.x,
      y: sum.y + neighbor.position.y,
    }),
    { x: 0, y: 0 },
  );
  center.x /= neighbors.length;
  center.y /= neighbors.length;

  return seek(agent, center, agent.maxSpeed * 0.85);
}

function findNearestAsteroid(position, asteroids, range) {
  let best = null;
  let bestDistanceSquared = range * range;

  asteroids.forEach((asteroid) => {
    const currentDistanceSquared = distanceSquared(position, asteroid.position);

    if (currentDistanceSquared < bestDistanceSquared) {
      best = asteroid;
      bestDistanceSquared = currentDistanceSquared;
    }
  });

  return best;
}

function findNearestResourceAsteroid(position, asteroids, range) {
  let best = null;
  let bestScore = 0;
  const rangeSquared = range * range;

  asteroids.forEach((asteroid) => {
    const currentDistanceSquared = distanceSquared(position, asteroid.position);

    if (currentDistanceSquared > rangeSquared) {
      return;
    }

    const resourceScore = getResourceScore(asteroid);
    if (resourceScore <= 0) {
      return;
    }

    const nearness = 1 - currentDistanceSquared / rangeSquared;
    const score = resourceScore * (0.35 + nearness);
    if (score > bestScore) {
      best = asteroid;
      bestScore = score;
    }
  });

  return best;
}

function getResourceScore(asteroid) {
  if (!asteroid.resources) {
    return 0;
  }

  return Object.entries(asteroid.resources).reduce((sum, [resource, amount]) => {
    if (resource === "stone") {
      return sum;
    }
    return sum + Math.max(0, amount);
  }, 0);
}

function drawHunter(context, lifeform) {
  const isPirate = lifeform.role === "pirate";
  const isInvader = lifeform.role === "invader";
  const fillColor = isPirate
    ? "rgba(255, 178, 77, 0.22)"
    : isInvader
      ? "rgba(177, 102, 255, 0.22)"
      : "rgba(255, 93, 108, 0.24)";
  const strokeColor = isPirate ? "#ffb24d" : isInvader ? "#b166ff" : LIFE_COLORS.hunter;

  const scale = lifeform.radius / 24;
  context.save();
  context.scale(scale, scale);
  context.fillStyle = fillColor;
  context.strokeStyle = strokeColor;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(isPirate ? 22 : 18, 0);
  context.lineTo(-10, -8);
  context.lineTo(-4, 0);
  context.lineTo(-10, 8);
  context.closePath();
  context.fill();
  context.stroke();
  if (isPirate || isInvader) {
    context.beginPath();
    context.moveTo(-2, -10);
    context.lineTo(isInvader ? 8 : 3, -17);
    context.lineTo(7, -7);
    context.moveTo(-2, 10);
    context.lineTo(isInvader ? 8 : 3, 17);
    context.lineTo(7, 7);
    context.stroke();
  }
  context.fillStyle = isPirate ? "#1b0e10" : isInvader ? "#ffffff" : "#ffffff";
  context.fillRect(5, -1.5, isPirate ? 6 : 4, 3);
  context.restore();
}

function drawThreadling(context, lifeform) {
  const wave = Math.sin(lifeform.pulse * 10 + lifeform.seed) * 3;

  context.strokeStyle = LIFE_COLORS.threadling;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(12, 0);
  context.quadraticCurveTo(0, -6 - wave, -14, 0);
  context.quadraticCurveTo(0, 6 + wave, 12, 0);
  context.stroke();
}

function drawGrazer(context, lifeform) {
  // A fed grazer is visibly a fed grazer: longer, rounder, and lit from inside
  // by the spores it is growing. You should be able to pick the ripe one out of
  // a field at a glance, because that is the one worth shooting.
  const growth = getGrowthScale(lifeform);
  const swell = 1 + (growth - 1) * 1.35;
  const pinch = (5 + Math.sin(lifeform.pulse * 3 + lifeform.seed) * 1.4) * swell;
  const nose = 15 * growth;
  const tail = -16 * growth;
  const ripe = isRipe(lifeform);

  // Chewing shows in the body, not just in the path it takes.
  const chew = lifeform.grazingStage === GRAZING_STAGE.NIBBLE
    ? 1 + Math.sin(lifeform.pulse * 26) * 0.13
    : 1;

  // The feeding field, drawn at exactly the radius it actually reaches — the
  // glow IS the mouth, so nothing about a big one's reach is a hidden number.
  // Drawn before the body and outside the chew scaling so it stays a true circle
  // while the creature works.
  const field = getGrazeFieldRadius(lifeform);
  if (field > 0) {
    const breathe = 1 + Math.sin(lifeform.pulse * 1.6 + lifeform.seed) * 0.035;
    const reach = field * breathe;

    context.save();
    // Undo the heading rotation: a suction field has no facing.
    context.rotate(-Math.atan2(lifeform.velocity.y, lifeform.velocity.x));
    context.fillStyle = "rgba(150, 240, 170, 0.10)";
    context.beginPath();
    context.arc(0, 0, reach, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = ripe ? "rgba(198, 255, 150, 0.50)" : "rgba(150, 240, 178, 0.34)";
    context.lineWidth = 1.6;
    context.stroke();

    // Intake lines drifting inward, so you can see which way it is pulling.
    const spokes = 8;
    const drift = (lifeform.pulse * 0.55) % 1;
    context.strokeStyle = ripe ? "rgba(198, 255, 150, 0.34)" : "rgba(150, 240, 178, 0.22)";
    context.lineWidth = 1;
    for (let index = 0; index < spokes; index += 1) {
      const angle = (Math.PI * 2 * index) / spokes + lifeform.seed;
      const outer = reach * (1 - drift * 0.45);
      const inner = outer * 0.62;
      context.beginPath();
      context.moveTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      context.lineTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.stroke();
    }
    context.restore();
  }

  context.save();
  context.scale(chew, 2 - chew);

  context.fillStyle = ripe ? "rgba(198, 255, 150, 0.32)" : "rgba(140, 240, 178, 0.18)";
  context.strokeStyle = ripe ? "#c6ff96" : LIFE_COLORS.grazer;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(nose, 0);
  context.bezierCurveTo(nose * 0.4, -pinch, tail * 0.5, -pinch, tail, 0);
  context.bezierCurveTo(tail * 0.5, pinch, nose * 0.4, pinch, nose, 0);
  context.fill();
  context.stroke();

  // The spores it is carrying, showing through as it fills up.
  const carried = Math.min(4, Math.floor(lifeform.fullness ?? 0) >> 1);
  if (carried > 0) {
    context.fillStyle = ripe ? "rgba(214, 255, 170, 0.95)" : "rgba(180, 250, 200, 0.6)";
    for (let index = 0; index < carried; index += 1) {
      const along = tail * 0.55 + ((nose - tail * 0.55) * (index + 0.5)) / carried;
      context.beginPath();
      context.arc(along, Math.sin(lifeform.pulse * 2 + index) * pinch * 0.22, 1.7, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.restore();
}

function drawSkitter(context, lifeform) {
  context.strokeStyle = LIFE_COLORS.skitter;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, 8, -0.9, 0.9);
  context.stroke();
  context.beginPath();
  context.moveTo(-6, -5);
  context.lineTo(-14, -10);
  context.moveTo(-6, 5);
  context.lineTo(-14, 10);
  context.stroke();
}

function drawSkitterTrail(context, lifeform, camera) {
  if (lifeform.webTrail.length < 2) {
    return;
  }

  context.save();
  context.lineWidth = 1;
  context.setLineDash([7, 9]);
  lifeform.webTrail.forEach((point, index) => {
    if (index === 0) {
      return;
    }

    const previous = lifeform.webTrail[index - 1];
    const x = point.x - camera.x;
    const y = point.y - camera.y;
    const age = point.age ?? 0;
    context.strokeStyle = `rgba(217, 179, 255, ${Math.max(0.07, 0.24 - age * 0.035)})`;
    context.beginPath();
    context.moveTo(previous.x - camera.x, previous.y - camera.y);
    context.lineTo(x, y);
    context.stroke();
  });
  context.setLineDash([]);
  context.restore();
}

function drawLantern(context, lifeform) {
  const glow = 0.55 + Math.sin(lifeform.pulse * 4.2 + lifeform.seed) * 0.24;

  context.fillStyle = `rgba(255, 233, 138, ${0.1 + glow * 0.18})`;
  context.strokeStyle = LIFE_COLORS.lantern;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, 9 + glow * 3, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.strokeStyle = "rgba(255, 248, 190, 0.75)";
  context.beginPath();
  context.moveTo(-14, 0);
  context.quadraticCurveTo(-2, -9 - glow * 3, 14, 0);
  context.quadraticCurveTo(-2, 9 + glow * 3, -14, 0);
  context.stroke();
  context.fillStyle = "#fff8be";
  context.beginPath();
  context.arc(2, 0, 2.5, 0, Math.PI * 2);
  context.fill();
}

function drawBloom(context, lifeform) {
  const beat = 0.5 + Math.sin(lifeform.pulse * 2.4 + lifeform.seed) * 0.5; // 0..1 heartbeat
  const bell = 9 + beat * 6;

  // soft outer glow
  context.fillStyle = `rgba(255, 158, 214, ${0.05 + beat * 0.1})`;
  context.beginPath();
  context.arc(0, 0, bell + 8, 0, Math.PI * 2);
  context.fill();

  // translucent bell
  context.fillStyle = `rgba(255, 158, 214, ${0.14 + beat * 0.16})`;
  context.strokeStyle = LIFE_COLORS.bloom;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, bell, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  // bright core
  context.fillStyle = "rgba(255, 224, 242, 0.8)";
  context.beginPath();
  context.arc(0, 0, 2.4 + beat * 1.2, 0, Math.PI * 2);
  context.fill();

  // trailing tentacles (behind the direction of travel, at -x after heading rotate)
  context.strokeStyle = "rgba(255, 158, 214, 0.55)";
  context.lineWidth = 1.5;
  const tentacles = 4;
  for (let index = 0; index < tentacles; index += 1) {
    const angle = Math.PI + (index - (tentacles - 1) / 2) * 0.34;
    const sway = Math.sin(lifeform.pulse * 3 + index + lifeform.seed) * 3;
    const baseX = Math.cos(angle) * bell;
    const baseY = Math.sin(angle) * bell;
    context.beginPath();
    context.moveTo(baseX, baseY);
    context.quadraticCurveTo(baseX * 1.6 + sway, baseY * 1.6, baseX * 2.3, baseY * 2.3 + sway);
    context.stroke();
  }
}

function drawFilament(context, lifeform) {
  const strands = 5;
  const length = 15;

  context.strokeStyle = LIFE_COLORS.filament;
  context.lineWidth = 1.6;
  for (let strand = 0; strand < strands; strand += 1) {
    const base = (strand - (strands - 1) / 2) * 3.4;
    context.beginPath();
    context.moveTo(0, base);
    const segments = 4;
    for (let segment = 1; segment <= segments; segment += 1) {
      const t = segment / segments;
      const wave = Math.sin(lifeform.pulse * 3.5 + strand * 0.9 + lifeform.seed + t * 3) * (3 + t * 3);
      context.lineTo(length * t, base + wave);
    }
    context.stroke();
  }

  // glowing holdfast base
  context.fillStyle = "rgba(198, 255, 112, 0.5)";
  context.beginPath();
  context.arc(0, 0, 3, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(230, 255, 200, 0.9)";
  context.beginPath();
  context.arc(0, 0, 1.5, 0, Math.PI * 2);
  context.fill();
}

function getRadius(type) {
  if (type === "hunter") {
    return 21;
  }

  if (type === "threadling") {
    return 18;
  }

  if (type === "lantern") {
    return 22;
  }

  if (type === "bloom") {
    return 24;
  }

  if (type === "filament") {
    return 16;
  }

  return 20;
}

function getMaxSpeed(type) {
  if (type === "hunter") {
    return 185;
  }

  if (type === "threadling") {
    return 114;
  }

  if (type === "grazer") {
    return 88;
  }

  if (type === "lantern") {
    return 72;
  }

  if (type === "bloom") {
    return 46; // languid drift
  }

  if (type === "filament") {
    return 34; // near-rooted
  }

  return 154;
}

function getMaxForce(type) {
  if (type === "hunter") {
    return 0.28;
  }

  if (type === "threadling") {
    return 0.16;
  }

  if (type === "grazer") {
    return 0.13;
  }

  if (type === "lantern") {
    return 0.11;
  }

  if (type === "bloom") {
    return 0.09;
  }

  if (type === "filament") {
    return 0.08;
  }

  return 0.24;
}

function getPerception(type) {
  if (type === "hunter") {
    return 190;
  }

  if (type === "threadling") {
    return 125;
  }

  if (type === "lantern") {
    return 155;
  }

  if (type === "bloom") {
    return 150;
  }

  if (type === "filament") {
    return 130;
  }

  return 145;
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

function distance(first, second) {
  return Math.sqrt(distanceSquared(first, second));
}

function distanceSquared(first, second) {
  const distanceX = first.x - second.x;
  const distanceY = first.y - second.y;

  return distanceX * distanceX + distanceY * distanceY;
}
