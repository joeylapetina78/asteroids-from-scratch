import { Bullet } from "./entities/Bullet.js?v=fuel-crystals";
import { breakAsteroid, WHITE_ASTEROID_COLOR } from "./entities/Asteroid.js?v=fuel-crystals";
import { createResourcePickupsFromAsteroid, ResourcePickup } from "./entities/ResourcePickup.js?v=ambusher-drops";
import { Ship } from "./entities/Ship.js?v=components";
import { createAsteroidField } from "./systems/asteroidField.js?v=zone-aware";
import { createCamera } from "./systems/camera.js";
import { createInput } from "./systems/input.js?v=power-control";
import { createHunterRespawn, createLifeField } from "./systems/lifeField.js?v=zone-aware";
import { clearScreen, drawGrid, drawVector, isVisible } from "./systems/rendering.js";
import { createResourceField } from "./systems/resourceField.js?v=zone-aware";
import { createScanner } from "./systems/scanner.js?v=multi-resource-scanner";
import { getZoneProfile } from "./systems/worldZones.js?v=world-zones";
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
const HUNTER_ENVIRONMENT_HIT_COOLDOWN_SECONDS = 0.38;
const MAX_HUNTER_ENVIRONMENT_HITS_PER_FRAME = 6;

export class Game {
  constructor(canvas, state = createGameState(), onHudChange = () => {}, onResourceCollected = () => {}, onDebugChange = () => {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.state = state;
    this.onHudChange = onHudChange;
    this.onResourceCollected = onResourceCollected;
    this.onDebugChange = onDebugChange;
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
    this.hunterRespawnSeed = 9000;
    this.shipDestroyed = false;
    this.activeLifeformCount = 0;
    this.activeHunterCount = 0;
    this.lastFrameTime = 0;
  }

  start() {
    requestAnimationFrame((time) => this.frame(time));
  }

  setShipPowered(isPowered) {
    if (this.shipDestroyed) {
      return;
    }

    this.state.components.engine.powered = isPowered;

    if (!isPowered) {
      this.input.clearGameKeys();
      this.fireCooldown = 0;
      this.ship.stopThrusting();
    }
  }

  scanForCrystals() {
    const scanner = this.state.components.scanner;

    if (this.shipDestroyed || !this.state.components.engine.powered || !scanner.installed || scanner.scanergy < SCANERGY_PER_SCAN) {
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
    if (!this.state.components.engine.powered || this.shipDestroyed) {
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
        shipPowered: this.state.components.engine.powered,
      });
    });
    this.activeLifeformCount = activeLifeforms.length;
    this.activeHunterCount = activeLifeforms.filter((lifeform) => lifeform.type === "hunter").length;
    this.updateHunterEnvironmentalHits(activeLifeforms, activeAsteroids, deltaSeconds);
    this.updateHunterHits();
    this.bullets = this.bullets.filter((bullet) => bullet.isAlive);
    this.lifeforms = this.lifeforms.filter((lifeform) => lifeform.isAlive);
    this.pickups.forEach((pickup) => pickup.update(deltaSeconds));
    this.updateParticles(deltaSeconds);
    this.updateCollector(deltaSeconds);
    this.collectPickups();
    this.scanner.update(deltaSeconds);
    this.camera.follow(this.ship, deltaSeconds);
    if (this.state.components.scanner.scanergy !== previousScanergy) {
      this.onHudChange(this.state);
    }
    this.updateDebugReadout();
    this.input.finishFrame();
  }

  updateDebugReadout() {
    this.onDebugChange({
      worldX: this.ship.position.x,
      worldY: this.ship.position.y,
      zoneProfile: getZoneProfile(this.ship.position.x, this.ship.position.y),
      asteroidCount: this.asteroids.length,
      lifeformCount: this.lifeforms.length,
      activeLifeformCount: this.activeLifeformCount,
      hunterCount: this.lifeforms.filter((lifeform) => lifeform.type === "hunter").length,
      activeHunterCount: this.activeHunterCount,
      pickupCount: this.pickups.length,
    });
  }

  updateHunterEnvironmentalHits(activeLifeforms, activeAsteroids, deltaSeconds) {
    const activeHunters = activeLifeforms.filter((lifeform) => lifeform.type === "hunter" && lifeform.isAlive);
    let impactCount = 0;

    activeHunters.forEach((hunter) => {
      hunter.environmentHitCooldown = Math.max(0, (hunter.environmentHitCooldown ?? 0) - deltaSeconds);
    });

    for (const hunter of activeHunters) {
      if (impactCount >= MAX_HUNTER_ENVIRONMENT_HITS_PER_FRAME || hunter.environmentHitCooldown > 0 || !hunter.isAlive) {
        continue;
      }

      const hitAsteroid = activeAsteroids.find((asteroid) =>
        circlesOverlap(hunter.position, hunter.radius, asteroid.position, asteroid.radius),
      );

      if (!hitAsteroid) {
        continue;
      }

      this.bumpHunterFromBody(hunter, hitAsteroid, 0.85);
      hunter.damage(this.getHunterEnvironmentDamage(hunter, hitAsteroid));
      hunter.environmentHitCooldown = HUNTER_ENVIRONMENT_HIT_COOLDOWN_SECONDS;
      this.createHunterImpactSparks(hunter);
      this.destroyHunterIfNeeded(hunter);
      impactCount += 1;
    }

    for (let firstIndex = 0; firstIndex < activeHunters.length; firstIndex += 1) {
      const firstHunter = activeHunters[firstIndex];

      if (impactCount >= MAX_HUNTER_ENVIRONMENT_HITS_PER_FRAME || !firstHunter.isAlive) {
        break;
      }

      for (let secondIndex = firstIndex + 1; secondIndex < activeHunters.length; secondIndex += 1) {
        const secondHunter = activeHunters[secondIndex];

        if (
          firstHunter.environmentHitCooldown > 0 ||
          secondHunter.environmentHitCooldown > 0 ||
          !secondHunter.isAlive ||
          !circlesOverlap(firstHunter.position, firstHunter.radius, secondHunter.position, secondHunter.radius)
        ) {
          continue;
        }

        this.separateHunters(firstHunter, secondHunter);
        firstHunter.damage(this.getHunterHunterDamage(firstHunter, secondHunter));
        secondHunter.damage(this.getHunterHunterDamage(secondHunter, firstHunter));
        firstHunter.environmentHitCooldown = HUNTER_ENVIRONMENT_HIT_COOLDOWN_SECONDS * 0.65;
        secondHunter.environmentHitCooldown = HUNTER_ENVIRONMENT_HIT_COOLDOWN_SECONDS * 0.65;
        this.createHunterImpactSparks(firstHunter);
        this.destroyHunterIfNeeded(firstHunter);
        this.destroyHunterIfNeeded(secondHunter);
        impactCount += 1;
        break;
      }
    }
  }

  updateShooting() {
    const wantsToFire = this.input.wasPressed("Space") || this.input.isDown("Space");

    const miner = this.state.components.miner;

    if (this.shipDestroyed || !this.state.components.engine.powered || !miner.installed || !miner.armed || !wantsToFire || this.fireCooldown > 0 || miner.ammo < AMMO_PER_SHOT) {
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

    if (this.shipDestroyed || !this.state.components.engine.powered || !collector.installed || collector.rangeSetting <= 0 || scanner.scanergy <= 0) {
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

  updateHunterHits() {
    const hitHunters = new Set();

    this.bullets.forEach((bullet) => {
      if (!bullet.isAlive) {
        return;
      }

      const hitHunter = this.lifeforms.find(
        (lifeform) =>
          lifeform.type === "hunter" &&
          lifeform.isAlive &&
          !hitHunters.has(lifeform) &&
          circlesOverlap(bullet.position, bullet.radius, lifeform.position, lifeform.radius),
      );

      if (!hitHunter) {
        return;
      }

      bullet.destroy();
      hitHunter.damage(100);
      hitHunters.add(hitHunter);
      this.createHunterBurst(hitHunter, bullet.velocity);
      this.createHunterDrops(hitHunter, bullet.velocity);
      this.respawnHunter();
    });

    if (this.shipHitCooldown > 0) {
      return;
    }

    const rammingHunter = this.lifeforms.find(
      (lifeform) =>
        lifeform.type === "hunter" &&
        lifeform.isAlive &&
        !hitHunters.has(lifeform) &&
        circlesOverlap(this.ship.position, SHIP_COLLISION_RADIUS, lifeform.position, lifeform.radius),
    );

    if (!rammingHunter) {
      return;
    }

    const impactDamage = this.getImpactDamage(rammingHunter);

    this.shipHitCooldown = SHIP_HIT_COOLDOWN_SECONDS;
    this.damageHull(impactDamage * 0.5);
    this.createShipSparks(rammingHunter);
    rammingHunter.damage(impactDamage * 0.85);

    if (rammingHunter.isAlive) {
      this.createHunterImpactSparks(rammingHunter);
    } else {
      this.createHunterBurst(rammingHunter, this.ship.velocity);
      this.createHunterDrops(rammingHunter, this.ship.velocity);
      this.respawnHunter();
    }
  }

  respawnHunter() {
    this.hunterRespawnSeed += 1;
    const hunter = createHunterRespawn(this.ship, this.asteroids, this.hunterRespawnSeed);

    if (hunter) {
      this.lifeforms.push(hunter);
    }
  }

  destroyHunterIfNeeded(hunter) {
    if (hunter.isAlive) {
      return;
    }

    this.createHunterBurst(hunter, hunter.velocity);
    this.createHunterDrops(hunter, hunter.velocity);
    this.respawnHunter();
  }

  damageHull(amount) {
    const hull = this.state.components.hull;

    if (!hull.installed) {
      return;
    }

    hull.integrity = Math.max(0, hull.integrity - amount);

    if (hull.integrity === 0 && !this.shipDestroyed) {
      this.destroyShip();
    }

    this.onHudChange(this.state);
  }

  destroyShip() {
    this.shipDestroyed = true;
    this.state.components.engine.powered = false;
    this.input.clearGameKeys();
    this.ship.stopThrusting();
    this.createShipDestructionBurst();
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

  createHunterBurst(hunter, impactVelocity) {
    const count = 22;

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.55;
      const speed = 80 + Math.random() * 230;

      this.particles.push({
        type: index % 3 === 0 ? "spark" : "square",
        position: {
          x: hunter.position.x + Math.cos(angle) * hunter.radius * 0.22,
          y: hunter.position.y + Math.sin(angle) * hunter.radius * 0.22,
        },
        velocity: {
          x: hunter.velocity.x * 0.35 + Math.cos(angle) * speed + impactVelocity.x * 0.025,
          y: hunter.velocity.y * 0.35 + Math.sin(angle) * speed + impactVelocity.y * 0.025,
        },
        color: index % 4 === 0 ? "#ffffff" : "#ff5d6c",
        size: 1.5 + Math.random() * 3,
        life: 0.28 + Math.random() * 0.38,
        maxLife: 0.66,
      });
    }
  }

  createHunterDrops(hunter, impactVelocity) {
    const count = 2 + Math.floor(Math.random() * 3);

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 55 + Math.random() * 125;
      const type = Math.random() < 0.18 ? "crystal" : "fuel";

      this.pickups.push(
        new ResourcePickup({
          x: hunter.position.x + Math.cos(angle) * 10,
          y: hunter.position.y + Math.sin(angle) * 10,
          type,
          velocity: {
            x: hunter.velocity.x * 0.2 + Math.cos(angle) * speed + impactVelocity.x * 0.012,
            y: hunter.velocity.y * 0.2 + Math.sin(angle) * speed + impactVelocity.y * 0.012,
          },
        }),
      );
    }
  }

  createHunterImpactSparks(hunter) {
    for (let index = 0; index < 12; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 55 + Math.random() * 130;

      this.particles.push({
        type: "spark",
        position: {
          x: hunter.position.x,
          y: hunter.position.y,
        },
        velocity: {
          x: hunter.velocity.x * 0.2 + Math.cos(angle) * speed,
          y: hunter.velocity.y * 0.2 + Math.sin(angle) * speed,
        },
        color: Math.random() > 0.35 ? "#ff5d6c" : "#ffffff",
        size: 1 + Math.random() * 2,
        life: 0.2 + Math.random() * 0.25,
        maxLife: 0.45,
      });
    }
  }

  bumpHunterFromBody(hunter, body, strength = 1) {
    const distanceX = hunter.position.x - body.position.x;
    const distanceY = hunter.position.y - body.position.y;
    const distance = Math.hypot(distanceX, distanceY) || 1;
    const overlap = hunter.radius + body.radius - distance;

    if (overlap <= 0) {
      return;
    }

    const normalX = distanceX / distance;
    const normalY = distanceY / distance;
    hunter.position.x += normalX * overlap * strength;
    hunter.position.y += normalY * overlap * strength;
    hunter.velocity.x += normalX * (70 + overlap * 3);
    hunter.velocity.y += normalY * (70 + overlap * 3);
  }

  separateHunters(firstHunter, secondHunter) {
    const distanceX = firstHunter.position.x - secondHunter.position.x;
    const distanceY = firstHunter.position.y - secondHunter.position.y;
    const distance = Math.hypot(distanceX, distanceY) || 1;
    const overlap = firstHunter.radius + secondHunter.radius - distance;

    if (overlap <= 0) {
      return;
    }

    const normalX = distanceX / distance;
    const normalY = distanceY / distance;
    const push = overlap * 0.5;

    firstHunter.position.x += normalX * push;
    firstHunter.position.y += normalY * push;
    secondHunter.position.x -= normalX * push;
    secondHunter.position.y -= normalY * push;
    firstHunter.velocity.x += normalX * 45;
    firstHunter.velocity.y += normalY * 45;
    secondHunter.velocity.x -= normalX * 45;
    secondHunter.velocity.y -= normalY * 45;
  }

  getHunterEnvironmentDamage(hunter, body) {
    const relativeVelocityX = hunter.velocity.x - body.velocity.x;
    const relativeVelocityY = hunter.velocity.y - body.velocity.y;
    const relativeSpeed = Math.hypot(relativeVelocityX, relativeVelocityY);

    return Math.min(34, Math.max(7, relativeSpeed * 0.055 + body.radius * 0.08));
  }

  getHunterHunterDamage(firstHunter, secondHunter) {
    const relativeVelocityX = firstHunter.velocity.x - secondHunter.velocity.x;
    const relativeVelocityY = firstHunter.velocity.y - secondHunter.velocity.y;
    const relativeSpeed = Math.hypot(relativeVelocityX, relativeVelocityY);

    return Math.min(12, Math.max(2, relativeSpeed * 0.025));
  }

  createShipSparks(impactBody) {
    const angleToShip = Math.atan2(this.ship.position.y - impactBody.position.y, this.ship.position.x - impactBody.position.x);
    const relativeSpeed = Math.hypot(this.ship.velocity.x - impactBody.velocity.x, this.ship.velocity.y - impactBody.velocity.y);
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

  createShipDestructionBurst() {
    const count = 70;

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.4;
      const speed = 90 + Math.random() * 360;

      this.particles.push({
        type: "spark",
        position: {
          x: this.ship.position.x + Math.cos(angle) * Math.random() * SHIP_COLLISION_RADIUS,
          y: this.ship.position.y + Math.sin(angle) * Math.random() * SHIP_COLLISION_RADIUS,
        },
        velocity: {
          x: this.ship.velocity.x * 0.3 + Math.cos(angle) * speed,
          y: this.ship.velocity.y * 0.3 + Math.sin(angle) * speed,
        },
        color: index % 5 === 0 ? "#ff5d6c" : index % 2 === 0 ? "#ffd36b" : "#ffffff",
        size: 1.4 + Math.random() * 3.2,
        life: 0.55 + Math.random() * 0.7,
        maxLife: 1.25,
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
