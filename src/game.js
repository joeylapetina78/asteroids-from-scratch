import { Bullet } from "./entities/Bullet.js?v=fuel-crystals";
import { breakAsteroid } from "./entities/Asteroid.js?v=fuel-crystals";
import { createResourcePickupsFromAsteroid } from "./entities/ResourcePickup.js?v=fuel-crystals";
import { Ship } from "./entities/Ship.js?v=fuel-crystals";
import { createAsteroidField } from "./systems/asteroidField.js?v=fuel-crystals";
import { createCamera } from "./systems/camera.js";
import { createInput } from "./systems/input.js?v=power-control";
import { clearScreen, drawGrid, drawVector, isVisible } from "./systems/rendering.js";
import { createResourceField } from "./systems/resourceField.js";
import { createScanner } from "./systems/scanner.js?v=multi-resource-scanner";
import { createGameState } from "./state/gameState.js?v=left-processor-economy";

const FIRE_COOLDOWN_SECONDS = 0.18;
const AMMO_PER_SHOT = 1;
const SCANERGY_PER_SCAN = 100;
const SHIP_COLLISION_RADIUS = 18;
const SHIP_HIT_COOLDOWN_SECONDS = 0.35;
const PICKUP_COLLECT_RADIUS = 24;

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
    this.ship = new Ship(0, 0, state.ship);
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
    this.state.ship.isPowered = isPowered;

    if (!isPowered) {
      this.input.clearGameKeys();
      this.fireCooldown = 0;
      this.ship.stopThrusting();
    }
  }

  scanForCrystals() {
    if (!this.state.ship.isPowered || this.state.ship.scanergy < SCANERGY_PER_SCAN) {
      return;
    }

    this.state.ship.scanergy -= SCANERGY_PER_SCAN;
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
    if (!this.state.ship.isPowered) {
      this.input.clearGameKeys();
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - deltaSeconds);
    this.shipHitCooldown = Math.max(0, this.shipHitCooldown - deltaSeconds);
    const previousFuel = this.state.ship.fuel;
    this.ship.update(deltaSeconds, this.input);
    if (this.state.ship.fuel !== previousFuel) {
      this.onHudChange(this.state);
    }
    this.updateShooting();
    this.bullets.forEach((bullet) => bullet.update(deltaSeconds));
    this.updateAsteroidHits();
    this.bullets = this.bullets.filter((bullet) => bullet.isAlive);
    this.asteroids.forEach((asteroid) => asteroid.update(deltaSeconds));
    this.pickups.forEach((pickup) => pickup.update(deltaSeconds));
    this.collectPickups();
    this.scanner.update(deltaSeconds);
    this.camera.follow(this.ship, deltaSeconds);
    this.input.finishFrame();
  }

  updateShooting() {
    const wantsToFire = this.input.wasPressed("Space") || this.input.isDown("Space");

    if (!this.state.ship.isPowered || !wantsToFire || this.fireCooldown > 0 || this.state.ship.ammo < AMMO_PER_SHOT) {
      return;
    }

    this.state.ship.ammo -= AMMO_PER_SHOT;
    this.onHudChange(this.state);
    this.bullets.push(new Bullet(this.ship));
    this.fireCooldown = FIRE_COOLDOWN_SECONDS;
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
    this.bullets.forEach((bullet) => bullet.draw(this.context, this.camera));
    drawVector(this.context, this.ship.position, this.ship.velocity, this.camera);
    this.scanner.draw(this.context, this.camera, this.ship);
    this.ship.draw(this.context, this.camera);
  }
}

function circlesOverlap(firstPosition, firstRadius, secondPosition, secondRadius) {
  const distanceX = firstPosition.x - secondPosition.x;
  const distanceY = firstPosition.y - secondPosition.y;
  const radius = firstRadius + secondRadius;

  return distanceX * distanceX + distanceY * distanceY <= radius * radius;
}
