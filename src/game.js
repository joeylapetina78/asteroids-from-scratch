import { Bullet } from "./entities/Bullet.js?v=fuel-crystals";
import { breakAsteroid, WHITE_ASTEROID_COLOR } from "./entities/Asteroid.js?v=fuel-crystals";
import { createResourcePickupsFromAsteroid } from "./entities/ResourcePickup.js?v=fuel-crystals";
import { Ship } from "./entities/Ship.js?v=components";
import { createAsteroidField } from "./systems/asteroidField.js?v=fuel-crystals";
import { createCamera } from "./systems/camera.js";
import { createInput } from "./systems/input.js?v=power-control";
import { createLifeField } from "./systems/lifeField.js?v=field-life-2";
import { clearScreen, drawGrid, drawVector, isVisible } from "./systems/rendering.js";
import { createResourceField } from "./systems/resourceField.js";
import { createScanner } from "./systems/scanner.js?v=multi-resource-scanner";
import { createGameState } from "./state/gameState.js?v=collector-panel";

const FIRE_COOLDOWN_SECONDS = 0.18;
const AMMO_PER_SHOT = 1;
const SCANERGY_PER_SCAN = 100;
const SHIP_COLLISION_RADIUS = 18;
const SHIP_HIT_COOLDOWN_SECONDS = 0.35;
const PICKUP_COLLECT_RADIUS = 24;
const COLLECTOR_MIN_RADIUS = 54;
const COLLECTOR_PULL_FORCE = 1650;
const COLLECTOR_MAX_SCANERGY_PER_SECOND = 50;
const PARTICLE_DRAG = 0.94;
const LIFE_SIMULATION_MARGIN = 900;

export class Game {
  constructor(canvas, state = createGameState(), onHudChange = () => {}, onResourceCollected = () => {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.state = state;
    this.onHudChange = onHudChange;
    this.onResourceCollected = onResourceCollected;
    this.input = createInput();
    this.camera = createCamera(canvas);
    this.scanner = createScanner(canvas);
    this.ship = new Ship(0, 0, state.components.engine);
    this.resourceField = createResourceField();
    this.asteroids = createAsteroidField(canvas, this.resourceField);
    this.lifeforms = createLifeField(this.asteroids);
    this.bullets = [];
    this.particles = [];
    this.pickups = [];
    this.fireCooldown = 0;
    this.shipHitCooldown = 0;
    this.impactSeed = 0;
    this.lastFrameTime = 0;
  }

  start() {
    requestAnimationFrame((time) => this.frame(time));
  }

  setShipPowered(isPowered) {
    this.state.components.engine.powered = isPowered;

    if (!isPowered) {
      this.input.clearGameKeys();
      this.fireCooldown = 0;
      this.ship.stopThrusting();
    }
  }

  scanForCrystals() {
    const scanner = this.state.components.scanner;

    if (!this.state.components.engine.powered || !scanner.installed || scanner.scanergy < SCANERGY_PER_SCAN) {
      return;
    }

    scanner.scanergy -= SCANERGY_PER_SCAN;
    this.onHudChange(this.state);
    this.scanner.scan(this.ship, this.asteroids);
  }

  frame(time) {
    const deltaSeconds = Math.min((time - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = time;

    this.update(deltaSeconds);
    this.draw();

    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  update(deltaSeconds) {
    if (!this.state.components.engine.powered) {
      this.input.clearGameKeys();
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - deltaSeconds);
    this.shipHitCooldown = Math.max(0, this.shipHitCooldown - deltaSeconds);
    const previousFuel = this.state.components.engine.fuel;
    const previousScanergy = this.state.components.scanner.scanergy;
    this.ship.update(deltaSeconds, this.input);
    if (this.state.components.engine.fuel !== previousFuel) {
      this.onHudChange(this.state);
    }
    this.updateShooting();
    this.bullets.forEach((bullet) => bullet.update(deltaSeconds));
    this.updateAsteroidHits();
    this.bullets = this.bullets.filter((bullet) => bullet.isAlive);
    this.asteroids.forEach((asteroid) => asteroid.update(deltaSeconds));
    const activeLifeforms = this.lifeforms.filter((lifeform) =>
      isNearSimulationArea(lifeform, this.canvas, this.camera, this.ship, LIFE_SIMULATION_MARGIN),
    );
    const activeAsteroids = this.asteroids.filter((asteroid) =>
      isNearSimulationArea(asteroid, this.canvas, this.camera, this.ship, LIFE_SIMULATION_MARGIN),
    );

    activeLifeforms.forEach((lifeform) => {
      lifeform.update(deltaSeconds, {
        asteroids: activeAsteroids,
        lifeforms: activeLifeforms,
        ship: this.ship,
      });
    });
    this.pickups.forEach((pickup) => pickup.update(deltaSeconds));
    this.updateParticles(deltaSeconds);
    this.updateCollector(deltaSeconds);
    this.collectPickups();
    this.scanner.update(deltaSeconds);
    this.camera.follow(this.ship, deltaSeconds);
    if (this.state.components.scanner.scanergy !== previousScanergy) {
      this.onHudChange(this.state);
    }
    this.input.finishFrame();
  }

  updateShooting() {
    const wantsToFire = this.input.wasPressed("Space") || this.input.isDown("Space");

    const miner = this.state.components.miner;

    if (!this.state.components.engine.powered || !miner.installed || !miner.armed || !wantsToFire || this.fireCooldown > 0 || miner.ammo < AMMO_PER_SHOT) {
      return;
    }

    miner.ammo -= AMMO_PER_SHOT;
    this.onHudChange(this.state);
    this.bullets.push(new Bullet(this.ship));
    this.fireCooldown = FIRE_COOLDOWN_SECONDS;
  }

  updateCollector(deltaSeconds) {
    const collector = this.state.components.collector;
    const scanner = this.state.components.scanner;

    if (!this.state.components.engine.powered || !collector.installed || collector.rangeSetting <= 0 || scanner.scanergy <= 0) {
      return;
    }

    const scanergyCost = this.getCollectorScanergyCost() * deltaSeconds;
    scanner.scanergy = Math.max(0, scanner.scanergy - scanergyCost);

    if (scanner.scanergy === 0) {
      return;
    }

    const radius = this.getCollectorRadius();
    const radiusSquared = radius * radius;

    this.pickups.forEach((pickup) => {
      const distanceX = this.ship.position.x - pickup.position.x;
      const distanceY = this.ship.position.y - pickup.position.y;
      const distanceSquared = distanceX * distanceX + distanceY * distanceY;

      if (distanceSquared === 0 || distanceSquared > radiusSquared) {
        return;
      }

      const distance = Math.sqrt(distanceSquared);
      const pullStrength = Math.max(0.35, 1 - distance / radius) * (0.8 + collector.rangeSetting * 0.5);

      pickup.velocity.x += (distanceX / distance) * COLLECTOR_PULL_FORCE * pullStrength * deltaSeconds;
      pickup.velocity.y += (distanceY / distance) * COLLECTOR_PULL_FORCE * pullStrength * deltaSeconds;
    });
  }

  updateAsteroidHits() {
    const hitAsteroids = new Set();
    const newAsteroids = [];

    this.bullets.forEach((bullet) => {
      if (!bullet.isAlive) {
        return;
      }

      const hitAsteroid = this.asteroids.find(
        (asteroid) => !hitAsteroids.has(asteroid) && circlesOverlap(bullet.position, bullet.radius, asteroid.position, asteroid.radius),
      );

      if (!hitAsteroid) {
        return;
      }

      bullet.destroy();
      hitAsteroids.add(hitAsteroid);
      newAsteroids.push(...this.breakAsteroid(hitAsteroid, bullet.velocity));
    });

    if (this.shipHitCooldown === 0) {
      const shipHitAsteroid = this.asteroids.find(
        (asteroid) =>
          !hitAsteroids.has(asteroid) &&
          circlesOverlap(this.ship.position, SHIP_COLLISION_RADIUS, asteroid.position, asteroid.radius),
      );

      if (shipHitAsteroid) {
        this.shipHitCooldown = SHIP_HIT_COOLDOWN_SECONDS;
        this.damageHull(this.getImpactDamage(shipHitAsteroid));
        this.createShipSparks(shipHitAsteroid);
        hitAsteroids.add(shipHitAsteroid);
        newAsteroids.push(...this.breakAsteroid(shipHitAsteroid, this.ship.velocity));
      }
    }

    if (hitAsteroids.size === 0) {
      return;
    }

    this.asteroids = this.asteroids.filter((asteroid) => !hitAsteroids.has(asteroid));
    this.asteroids.push(...newAsteroids);
  }

  damageHull(amount) {
    const hull = this.state.components.hull;

    if (!hull.installed) {
      return;
    }

    hull.integrity = Math.max(0, hull.integrity - amount);
    this.onHudChange(this.state);
  }

  getImpactDamage(asteroid) {
    const relativeVelocityX = this.ship.velocity.x - asteroid.velocity.x;
    const relativeVelocityY = this.ship.velocity.y - asteroid.velocity.y;
    const relativeSpeed = Math.hypot(relativeVelocityX, relativeVelocityY);
    const massScale = asteroid.radius / 34;
    const damage = 4 + relativeSpeed * 0.04 + relativeSpeed * massScale * 0.07 + asteroid.radius * 0.18;

    return Math.min(100, Math.max(6, damage));
  }

  breakAsteroid(asteroid, impactVelocity) {
    this.impactSeed += 1;

    if (asteroid.tier <= 1) {
      this.pickups.push(
        ...createResourcePickupsFromAsteroid(asteroid, this.impactSeed + 50000, impactVelocity),
      );
      if (asteroid.color === WHITE_ASTEROID_COLOR) {
        this.createStoneBurst(asteroid, impactVelocity);
      }
    }

    return breakAsteroid(asteroid, this.impactSeed, impactVelocity);
  }

  createStoneBurst(asteroid, impactVelocity) {
    const count = 8 + Math.floor(asteroid.radius / 2);

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.45;
      const speed = 65 + Math.random() * 140;

      this.particles.push({
        type: "square",
        position: {
          x: asteroid.position.x + Math.cos(angle) * asteroid.radius * 0.2,
          y: asteroid.position.y + Math.sin(angle) * asteroid.radius * 0.2,
        },
        velocity: {
          x: asteroid.velocity.x * 0.35 + Math.cos(angle) * speed + impactVelocity.x * 0.035,
          y: asteroid.velocity.y * 0.35 + Math.sin(angle) * speed + impactVelocity.y * 0.035,
        },
        color: "#edf2ff",
        size: 2 + Math.random() * 3,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
      });
    }
  }

  createShipSparks(asteroid) {
    const angleToShip = Math.atan2(this.ship.position.y - asteroid.position.y, this.ship.position.x - asteroid.position.x);
    const relativeSpeed = Math.hypot(this.ship.velocity.x - asteroid.velocity.x, this.ship.velocity.y - asteroid.velocity.y);
    const count = Math.min(34, 10 + Math.floor(relativeSpeed / 24));

    for (let index = 0; index < count; index += 1) {
      const angle = angleToShip + (Math.random() - 0.5) * 1.7;
      const speed = 90 + Math.random() * 230 + relativeSpeed * 0.18;

      this.particles.push({
        type: "spark",
        position: {
          x: this.ship.position.x - Math.cos(angleToShip) * SHIP_COLLISION_RADIUS,
          y: this.ship.position.y - Math.sin(angleToShip) * SHIP_COLLISION_RADIUS,
        },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        color: Math.random() > 0.35 ? "#ffd36b" : "#ffffff",
        size: 1 + Math.random() * 2,
        life: 0.22 + Math.random() * 0.28,
        maxLife: 0.5,
      });
    }
  }

  updateParticles(deltaSeconds) {
    this.particles.forEach((particle) => {
      particle.life -= deltaSeconds;
      particle.velocity.x *= PARTICLE_DRAG;
      particle.velocity.y *= PARTICLE_DRAG;
      particle.position.x += particle.velocity.x * deltaSeconds;
      particle.position.y += particle.velocity.y * deltaSeconds;
    });

    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  collectPickups() {
    const collectedPickups = new Set();

    this.pickups.forEach((pickup) => {
      if (!circlesOverlap(this.ship.position, PICKUP_COLLECT_RADIUS, pickup.position, pickup.radius)) {
        return;
      }

      collectedPickups.add(pickup);
      this.onResourceCollected(pickup.type);
    });

    if (collectedPickups.size === 0) {
      return;
    }

    this.pickups = this.pickups.filter((pickup) => !collectedPickups.has(pickup));
  }

  draw() {
    clearScreen(this.context, this.canvas);
    drawGrid(this.context, this.canvas, this.camera);
    this.asteroids.forEach((asteroid) => {
      if (isVisible(asteroid, this.canvas, this.camera)) {
        asteroid.draw(this.context, this.camera);
      }
    });
    this.lifeforms.forEach((lifeform) => {
      if (isVisible(lifeform, this.canvas, this.camera)) {
        lifeform.draw(this.context, this.camera);
      }
    });
    this.pickups.forEach((pickup) => {
      if (isVisible(pickup, this.canvas, this.camera)) {
        pickup.draw(this.context, this.camera);
      }
    });
    this.drawParticles();
    this.drawCollectorField();
    this.bullets.forEach((bullet) => bullet.draw(this.context, this.camera));
    drawVector(this.context, this.ship.position, this.ship.velocity, this.camera);
    this.scanner.draw(this.context, this.camera, this.ship);
    this.ship.draw(this.context, this.camera);
  }

  drawParticles() {
    this.particles.forEach((particle) => {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      const screenX = particle.position.x - this.camera.x;
      const screenY = particle.position.y - this.camera.y;

      this.context.save();
      this.context.globalAlpha = alpha;
      this.context.fillStyle = particle.color;
      this.context.translate(screenX, screenY);

      if (particle.type === "spark") {
        this.context.fillRect(-particle.size * 1.5, -particle.size / 2, particle.size * 3, particle.size);
      } else {
        this.context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      }

      this.context.restore();
    });
  }

  drawCollectorField() {
    if (!this.isCollectorActive()) {
      return;
    }

    const screenX = this.ship.position.x - this.camera.x;
    const screenY = this.ship.position.y - this.camera.y;

    this.context.save();
    this.context.strokeStyle = "rgba(115, 210, 255, 0.42)";
    this.context.fillStyle = "rgba(115, 210, 255, 0.05)";
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(screenX, screenY, this.getCollectorRadius(), 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.context.restore();
  }

  isCollectorActive() {
    return (
      this.state.components.engine.powered &&
      this.state.components.collector.installed &&
      this.state.components.collector.rangeSetting > 0 &&
      this.state.components.scanner.scanergy > 0
    );
  }

  getCollectorRadius() {
    const maxRadius = Math.min(this.canvas.width, this.canvas.height) * 0.48;
    const rangeCurve = Math.pow(this.state.components.collector.rangeSetting, 0.72);

    return COLLECTOR_MIN_RADIUS + (maxRadius - COLLECTOR_MIN_RADIUS) * rangeCurve;
  }

  getCollectorScanergyCost() {
    const rangeSetting = this.state.components.collector.rangeSetting;

    return 2 + COLLECTOR_MAX_SCANERGY_PER_SECOND * rangeSetting * rangeSetting;
  }
}

function isNearSimulationArea(entity, canvas, camera, ship, margin) {
  const radius = entity.radius ?? 0;
  const screenX = entity.position.x - camera.x;
  const screenY = entity.position.y - camera.y;
  const nearCamera =
    screenX > -margin - radius &&
    screenX < canvas.width + margin + radius &&
    screenY > -margin - radius &&
    screenY < canvas.height + margin + radius;

  if (nearCamera) {
    return true;
  }

  const distanceToShip = Math.hypot(entity.position.x - ship.position.x, entity.position.y - ship.position.y);

  return distanceToShip < margin * 1.8 + radius;
}

function circlesOverlap(firstPosition, firstRadius, secondPosition, secondRadius) {
  const distanceX = firstPosition.x - secondPosition.x;
  const distanceY = firstPosition.y - secondPosition.y;
  const radius = firstRadius + secondRadius;

  return distanceX * distanceX + distanceY * distanceY <= radius * radius;
}
