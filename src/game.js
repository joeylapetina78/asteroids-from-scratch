import { Bullet } from "./entities/Bullet.js?v=asteroid-breaks";
import { breakAsteroid } from "./entities/Asteroid.js?v=asteroid-breaks";
import { Ship } from "./entities/Ship.js?v=power-control";
import { createAsteroidField } from "./systems/asteroidField.js?v=asteroid-breaks";
import { createCamera } from "./systems/camera.js";
import { createInput } from "./systems/input.js?v=power-control";
import { clearScreen, drawGrid, drawVector, isVisible } from "./systems/rendering.js";
import { createResourceField } from "./systems/resourceField.js";
import { createGameState } from "./state/gameState.js";

const FIRE_COOLDOWN_SECONDS = 0.18;
const SHIP_COLLISION_RADIUS = 18;
const SHIP_HIT_COOLDOWN_SECONDS = 0.35;

export class Game {
  constructor(canvas, state = createGameState()) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.state = state;
    this.input = createInput();
    this.camera = createCamera(canvas);
    this.ship = new Ship(0, 0, state.ship);
    this.resourceField = createResourceField();
    this.asteroids = createAsteroidField(canvas, this.resourceField);
    this.bullets = [];
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
    this.ship.update(deltaSeconds, this.input);
    this.updateShooting();
    this.bullets.forEach((bullet) => bullet.update(deltaSeconds));
    this.updateAsteroidHits();
    this.bullets = this.bullets.filter((bullet) => bullet.isAlive);
    this.asteroids.forEach((asteroid) => asteroid.update(deltaSeconds));
    this.camera.follow(this.ship, deltaSeconds);
    this.input.finishFrame();
  }

  updateShooting() {
    const wantsToFire = this.input.wasPressed("Space") || this.input.isDown("Space");

    if (!this.state.ship.isPowered || !wantsToFire || this.fireCooldown > 0) {
      return;
    }

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
    return breakAsteroid(asteroid, this.impactSeed, impactVelocity);
  }

  draw() {
    clearScreen(this.context, this.canvas);
    drawGrid(this.context, this.canvas, this.camera);
    this.asteroids.forEach((asteroid) => {
      if (isVisible(asteroid, this.canvas, this.camera)) {
        asteroid.draw(this.context, this.camera);
      }
    });
    this.bullets.forEach((bullet) => bullet.draw(this.context, this.camera));
    drawVector(this.context, this.ship.position, this.ship.velocity, this.camera);
    this.ship.draw(this.context, this.camera);
  }
}

function circlesOverlap(firstPosition, firstRadius, secondPosition, secondRadius) {
  const distanceX = firstPosition.x - secondPosition.x;
  const distanceY = firstPosition.y - secondPosition.y;
  const radius = firstRadius + secondRadius;

  return distanceX * distanceX + distanceY * distanceY <= radius * radius;
}
