import { Bullet } from "./entities/Bullet.js?v=fuel-crystals";
import { breakAsteroid } from "./entities/Asteroid.js?v=fuel-crystals";
import { createResourcePickupsFromAsteroid } from "./entities/ResourcePickup.js?v=fuel-crystals";
import { Ship } from "./entities/Ship.js?v=components";
import { createAsteroidField } from "./systems/asteroidField.js?v=fuel-crystals";
import { createCamera } from "./systems/camera.js";
import { createInput } from "./systems/input.js?v=power-control";
import { clearScreen, drawGrid, drawVector, isVisible } from "./systems/rendering.js";
import { createResourceField } from "./systems/resourceField.js";
import { createScanner } from "./systems/scanner.js?v=multi-resource-scanner";
import { createGameState } from "./state/gameState.js?v=collector-panel";

const FIRE_COOLDOWN_SECONDS = 0.18;
const AMMO_PER_SHOT = 1;
const SCANERGY_PER_SCAN = 100;
const SHIP_COLLISION_RADIUS = 18;
const SHIP_HIT_COOLDOWN_SECONDS = 0.35;
const HULL_DAMAGE_PER_ASTEROID_HIT = 7;
const PICKUP_COLLECT_RADIUS = 24;
const COLLECTOR_MIN_RADIUS = 54;
const COLLECTOR_PULL_FORCE = 980;
const COLLECTOR_MAX_SCANERGY_PER_SECOND = 50;

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
    this.bullets = [];
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
    this.pickups.forEach((pickup) => pickup.update(deltaSeconds));
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
      const pullStrength = (1 - distance / radius) * collector.rangeSetting;

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
        this.damageHull(HULL_DAMAGE_PER_ASTEROID_HIT);
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

  breakAsteroid(asteroid, impactVelocity) {
    this.impactSeed += 1;

    if (asteroid.tier <= 1) {
      this.pickups.push(
        ...createResourcePickupsFromAsteroid(asteroid, this.impactSeed + 50000, impactVelocity),
      );
    }

    return breakAsteroid(asteroid, this.impactSeed, impactVelocity);
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
    this.pickups.forEach((pickup) => {
      if (isVisible(pickup, this.canvas, this.camera)) {
        pickup.draw(this.context, this.camera);
      }
    });
    this.drawCollectorField();
    this.bullets.forEach((bullet) => bullet.draw(this.context, this.camera));
    drawVector(this.context, this.ship.position, this.ship.velocity, this.camera);
    this.scanner.draw(this.context, this.camera, this.ship);
    this.ship.draw(this.context, this.camera);
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
    const maxRadius = Math.min(this.canvas.width, this.canvas.height) * 0.44;
    const rangeCurve = Math.pow(this.state.components.collector.rangeSetting, 0.85);

    return COLLECTOR_MIN_RADIUS + (maxRadius - COLLECTOR_MIN_RADIUS) * rangeCurve;
  }

  getCollectorScanergyCost() {
    const rangeSetting = this.state.components.collector.rangeSetting;

    return 2 + COLLECTOR_MAX_SCANERGY_PER_SECOND * rangeSetting * rangeSetting;
  }
}

function circlesOverlap(firstPosition, firstRadius, secondPosition, secondRadius) {
  const distanceX = firstPosition.x - secondPosition.x;
  const distanceY = firstPosition.y - secondPosition.y;
  const radius = firstRadius + secondRadius;

  return distanceX * distanceX + distanceY * distanceY <= radius * radius;
}
