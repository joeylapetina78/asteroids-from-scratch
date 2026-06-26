const LIFE_COLORS = {
  hunter: "#ff5d6c",
  threadling: "#b8f7ff",
  grazer: "#8cf0b2",
  skitter: "#d9b3ff",
};

export class Lifeform {
  constructor({ type, x, y, velocity, seed }) {
    this.type = type;
    this.position = { x, y };
    this.velocity = velocity;
    this.acceleration = { x: 0, y: 0 };
    this.seed = seed;
    this.wanderAngle = seed * 0.013;
    this.pulse = seed * 0.021;
    this.radius = getRadius(type);
    this.maxSpeed = getMaxSpeed(type);
    this.maxForce = getMaxForce(type);
    this.perception = getPerception(type);
  }

  update(deltaSeconds, world) {
    this.pulse += deltaSeconds;

    if (this.type === "hunter") {
      this.updateHunter(deltaSeconds, world);
    } else if (this.type === "threadling") {
      this.updateThreadling(deltaSeconds, world);
    } else if (this.type === "grazer") {
      this.updateGrazer(deltaSeconds, world);
    } else {
      this.updateSkitter(deltaSeconds, world);
    }

    this.integrate(deltaSeconds);
  }

  updateHunter(deltaSeconds, world) {
    const distanceToShip = distance(this.position, world.ship.position);

    if (distanceToShip < 980) {
      this.applySteer(seek(this, world.ship.position, this.maxSpeed), 1.15);
    } else {
      this.applySteer(this.wander(deltaSeconds), 0.8);
    }

    this.avoidAsteroids(world.asteroids, 1.4);
  }

  updateThreadling(deltaSeconds, world) {
    const neighbors = world.lifeforms.filter(
      (lifeform) => lifeform !== this && lifeform.type === "threadling" && distanceSquared(this.position, lifeform.position) < 150 * 150,
    );

    if (neighbors.length > 0) {
      this.applySteer(separate(this, neighbors, 42), 1.45);
      this.applySteer(align(this, neighbors), 0.72);
      this.applySteer(cohere(this, neighbors), 0.58);
    }

    this.applySteer(this.wander(deltaSeconds), 0.35);
    this.avoidAsteroids(world.asteroids, 1.1);
  }

  updateGrazer(deltaSeconds, world) {
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

    if (distanceSquared(this.position, world.ship.position) < 220 * 220) {
      this.applySteer(flee(this, world.ship.position, this.maxSpeed), 1.3);
    }

    this.avoidAsteroids(world.asteroids, 1.0);
  }

  updateSkitter(deltaSeconds, world) {
    const asteroid = findNearestAsteroid(this.position, world.asteroids, 380);

    if (asteroid && distanceSquared(this.position, asteroid.position) < (asteroid.radius + 70) ** 2) {
      this.applySteer(flee(this, asteroid.position, this.maxSpeed), 0.8);
    }

    if (distanceSquared(this.position, world.ship.position) < 360 * 360) {
      this.applySteer(flee(this, world.ship.position, this.maxSpeed * 1.2), 1.5);
    }

    this.applySteer(this.wander(deltaSeconds * 1.6), 1.0);
    this.avoidAsteroids(world.asteroids, 1.55);
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
      const strength = (safeRadius - distanceToRock) / safeRadius;
      avoid.x += ((this.position.x - asteroid.position.x) / distanceToRock) * strength;
      avoid.y += ((this.position.y - asteroid.position.y) / distanceToRock) * strength;
      count += 1;
    });

    if (count === 0) {
      return;
    }

    avoid.x /= count;
    avoid.y /= count;
    this.applySteer(limit(avoid, this.maxForce * 2.8), weight);
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

    context.save();
    context.translate(screenX, screenY);
    context.rotate(heading);

    if (this.type === "hunter") {
      drawHunter(context, this);
    } else if (this.type === "threadling") {
      drawThreadling(context, this);
    } else if (this.type === "grazer") {
      drawGrazer(context, this);
    } else {
      drawSkitter(context, this);
    }

    context.restore();
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

function drawHunter(context, lifeform) {
  context.fillStyle = "rgba(255, 93, 108, 0.24)";
  context.strokeStyle = LIFE_COLORS.hunter;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(18, 0);
  context.lineTo(-10, -8);
  context.lineTo(-4, 0);
  context.lineTo(-10, 8);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.fillRect(5, -1.5, 4, 3);
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
  const pinch = 5 + Math.sin(lifeform.pulse * 3 + lifeform.seed) * 1.4;

  context.fillStyle = "rgba(140, 240, 178, 0.18)";
  context.strokeStyle = LIFE_COLORS.grazer;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(15, 0);
  context.bezierCurveTo(6, -pinch, -8, -pinch, -16, 0);
  context.bezierCurveTo(-8, pinch, 6, pinch, 15, 0);
  context.fill();
  context.stroke();
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

function getRadius(type) {
  if (type === "hunter") {
    return 24;
  }

  if (type === "threadling") {
    return 18;
  }

  return 20;
}

function getMaxSpeed(type) {
  if (type === "hunter") {
    return 150;
  }

  if (type === "threadling") {
    return 92;
  }

  if (type === "grazer") {
    return 76;
  }

  return 124;
}

function getMaxForce(type) {
  if (type === "hunter") {
    return 0.12;
  }

  if (type === "threadling") {
    return 0.08;
  }

  if (type === "grazer") {
    return 0.065;
  }

  return 0.14;
}

function getPerception(type) {
  if (type === "hunter") {
    return 115;
  }

  if (type === "threadling") {
    return 70;
  }

  return 90;
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
