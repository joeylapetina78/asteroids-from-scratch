import { Bullet } from "./entities/Bullet.js?v=fuel-crystals";
import { breakAsteroid, WHITE_ASTEROID_COLOR } from "./entities/Asteroid.js?v=burst-fix-2";
import { createResourcePickupsFromAsteroid, ResourcePickup } from "./entities/ResourcePickup.js?v=burst-fix-2";
import { Ship } from "./entities/Ship.js?v=starter-skiff-v1";
import { createAsteroidField } from "./systems/asteroidField.js?v=zone-aware";
import { createCamera } from "./systems/camera.js";
import { createInput } from "./systems/input.js?v=docking-services";
import { createHunterNearShip, createHunterRespawn, createLifeField } from "./systems/lifeField.js?v=red-work-tuning-v1";
import { createNpcRouteShips } from "./systems/npcRoutes.js?v=soft-cargo-train";
import { clearScreen, drawGrid, drawVector, isVisible } from "./systems/rendering.js?v=draw-radius";
import { createResourceField } from "./systems/resourceField.js?v=zone-aware";
import { createScanner } from "./systems/scanner.js?v=mission-targets";
import { getZoneProfile } from "./systems/worldZones.js?v=world-zones";
import { getNearbyWorldSite, getNearestWorldSite, getWorldSites, isInSiteRange } from "./systems/worldSites.js?v=hub-contract-windows-v1";
import { createGameState } from "./state/gameState.js?v=tow-control-lock-v1";

// Game is the main simulation coordinator for the viewport canvas. It owns world
// objects, advances gameplay rules, then reports display-ready state back to
// main.js so the page panels can stay dumb and component-like.
const FIRE_COOLDOWN_SECONDS = 0.18;
const AMMO_PER_SHOT = 1;
const SCANERGY_PER_SCAN = 100;
const SHIP_COLLISION_RADIUS = 18;
const SHIP_HIT_COOLDOWN_SECONDS = 0.35;
const PICKUP_COLLECT_RADIUS = 24;
const COLLECTOR_PULL_FORCE = 1650;
const COLLECTOR_MAX_SCANERGY_PER_SECOND = 50;
const PARTICLE_DRAG = 0.94;
const LIFE_SIMULATION_MARGIN = 900;
const NPC_SIMULATION_MARGIN = 1300;
const HUNTER_ENVIRONMENT_HIT_COOLDOWN_SECONDS = 0.38;
const MAX_HUNTER_ENVIRONMENT_HITS_PER_FRAME = 6;
const NPC_ENVIRONMENT_HIT_COOLDOWN_SECONDS = 0.55;
const HUB_DEFENSE_COOLDOWN_SECONDS = 0.16;
const HUB_DEFENSE_RADIUS_PADDING = 170;
const MAX_HUB_DEFENSE_HITS_PER_FRAME = 3;
const VIEWPORT_TITLE_SECONDS = 5.6;
const DOCK_MESSAGE_SECONDS = 2.8;
const REPAIR_CREDITS_PER_HULL = 2;
const DAMAGE_FLASH_DECAY_PER_SECOND = 2.9;
const MAX_DAMAGE_FLASH_ALPHA = 0.42;
const MAX_IMPACT_SHAKE_PIXELS = 28;
const STORY_MOVEMENT_DISTANCE = 16;
const STORY_PROXIMITY_RADIUS = 64;
const STORY_PROXIMITY_COOLDOWN_SECONDS = 3.5;
const DOCK_TETHER_BREAK_DAMAGE = 12;
const DOCK_TETHER_BREAK_IMPULSE = 210;
const TOW_BASE_COST = 260;
const TOW_COST_PER_1000_UNITS = 120;
const TOW_APPROACH_SPEED = 108;
const TOW_RETURN_SPEED = 88;
const TOW_ATTACH_DISTANCE = 84;
const TOW_DELIVERY_DISTANCE = 48;
const TOW_LINE_LENGTH = 120;
const TOW_LINE_STIFFNESS = 2.8;
const TOW_LINE_DAMPING = 0.965;
const TOW_CUTTER_RANGE = 285;
const TOW_CUTTER_COOLDOWN_SECONDS = 1.15;

export class Game {
  constructor(
    canvas,
    state = createGameState(),
    onHudChange = () => {},
    onResourceCollected = () => {},
    onDebugChange = () => {},
    onSiteChange = () => {},
    audio = null,
    onLogicUpdate = () => {},
  ) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.state = state;
    this.onHudChange = onHudChange;
    this.onResourceCollected = onResourceCollected;
    this.onDebugChange = onDebugChange;
    this.onSiteChange = onSiteChange;
    this.audio = audio;
    this.onLogicUpdate = onLogicUpdate;
    this.input = createInput();
    this.camera = createCamera(canvas);
    this.scanner = createScanner(canvas);
    this.ship = new Ship(0, 0, state.components.engine, state.ship);
    this.resourceField = createResourceField();
    this.worldSites = getWorldSites();
    this.asteroids = createAsteroidField(canvas, this.resourceField);
    this.lifeforms = createLifeField(this.asteroids);
    this.npcShips = createNpcRouteShips(this.worldSites);
    this.bullets = [];
    this.particles = [];
    this.siteDefenseBeams = [];
    this.pickups = [];
    this.fireCooldown = 0;
    this.shipHitCooldown = 0;
    this.impactSeed = 0;
    this.hunterRespawnSeed = 9000;
    this.shipDestroyed = false;
    this.activeLifeformCount = 0;
    this.activeHunterCount = 0;
    this.nearbySite = null;
    this.dockedSite = null;
    this.hubDefenseCooldown = 0;
    this.unarmedFireAttempts = 0;
    this.hasRecordedUnarmedFireReminder = false;
    this.hasRecordedStrandedEvent = false;
    this.hasRecordedLowFuelEvent = false;
    this.viewportTitle = null;
    this.viewportTitleTimer = 0;
    this.discoveredSiteIds = new Set();
    this.currentZoneId = null;
    this.hasRecordedPlayerThrust = false;
    this.lastShipMovementEventPosition = { ...this.ship.position };
    this.visibleStorySiteIds = new Set();
    this.nearbyStorySiteIds = new Set();
    this.visibleStoryNpcIds = new Set();
    this.proximityCooldowns = new Map();
    this.lastFrameTime = 0;
    this.damageFlashAlpha = 0;
    this.cameraShake = {
      time: 0,
      duration: 0,
      magnitude: 0,
      seed: 0,
    };
    this.activeTow = null;
  }

  start() {
    requestAnimationFrame((time) => this.frame(time));
  }

  placeShipNearSite(siteId, offset = { x: 210, y: -90 }) {
    const site = this.worldSites.find((worldSite) => worldSite.id === siteId);

    if (!site) {
      return;
    }

    const yardExchange = this.worldSites.find((worldSite) => worldSite.id === "yard-exchange");
    this.ship.position.x = site.position.x + offset.x;
    this.ship.position.y = site.position.y + offset.y;
    this.ship.velocity.x = 26;
    this.ship.velocity.y = -14;
    this.ship.angle = yardExchange
      ? Math.atan2(yardExchange.position.y - this.ship.position.y, yardExchange.position.x - this.ship.position.x)
      : -Math.PI / 2;
    this.camera.centerX = this.ship.position.x;
    this.camera.centerY = this.ship.position.y;
    this.camera.x = this.camera.centerX - this.canvas.width / 2;
    this.camera.y = this.camera.centerY - this.canvas.height / 2;
    this.lastShipMovementEventPosition = { ...this.ship.position };
  }

  getSaveSnapshot() {
    return {
      ship: {
        position: { ...this.ship.position },
        velocity: { ...this.ship.velocity },
        angle: this.ship.angle,
      },
      camera: {
        x: this.camera.x,
        y: this.camera.y,
        centerX: this.camera.centerX,
        centerY: this.camera.centerY,
      },
      dockedSiteId: this.dockedSite?.id ?? null,
    };
  }

  loadSaveSnapshot(snapshot) {
    if (!snapshot?.ship?.position) {
      return;
    }

    this.ship.position.x = snapshot.ship.position.x;
    this.ship.position.y = snapshot.ship.position.y;
    this.ship.velocity.x = snapshot.ship.velocity?.x ?? 0;
    this.ship.velocity.y = snapshot.ship.velocity?.y ?? 0;
    this.ship.angle = snapshot.ship.angle ?? this.ship.angle;
    this.camera.centerX = snapshot.camera?.centerX ?? this.ship.position.x;
    this.camera.centerY = snapshot.camera?.centerY ?? this.ship.position.y;
    this.camera.x = snapshot.camera?.x ?? this.camera.centerX - this.canvas.width / 2;
    this.camera.y = snapshot.camera?.y ?? this.camera.centerY - this.canvas.height / 2;
    this.lastShipMovementEventPosition = { ...this.ship.position };
    this.dockedSite = this.worldSites.find((site) => site.id === snapshot.dockedSiteId) ?? null;
  }

  setShipPowered(isPowered) {
    if (this.shipDestroyed || !this.state.components.engine.installed) {
      return;
    }

    if (isPowered && this.state.components.engine.fuel <= 0) {
      return;
    }

    if (isPowered && this.state.components.engine.powerLocked) {
      return;
    }

    const wasPowered = this.state.components.engine.powered;
    this.state.components.engine.powered = isPowered;
    this.audio?.playPower(isPowered);

    if (isPowered && !wasPowered) {
      this.state.ledger.recordEvent(
        "engine.powered",
        {
          x: Math.round(this.ship.position.x),
          y: Math.round(this.ship.position.y),
        },
        { visible: false },
      );
    }

    if (!isPowered && wasPowered) {
      this.state.ledger.recordEvent(
        "engine.poweredDown",
        {
          x: Math.round(this.ship.position.x),
          y: Math.round(this.ship.position.y),
          dockedSiteId: this.dockedSite?.id ?? null,
        },
        { visible: false },
      );
    }

    if (!isPowered) {
      this.input.clearGameKeys();
      this.fireCooldown = 0;
      this.state.components.collector.isActive = false;
      this.ship.stopThrusting();
    }
  }

  scanForCrystals() {
    const scanner = this.state.components.scanner;

    if (this.shipDestroyed || !scanner.installed || scanner.scanergy < SCANERGY_PER_SCAN) {
      return;
    }

    scanner.scanergy -= SCANERGY_PER_SCAN;
    this.audio?.playScanner();
    this.state.ledger.recordEvent(
      "scanner.used",
      {
        scanergySpent: SCANERGY_PER_SCAN,
        scanergyRemaining: scanner.scanergy,
        x: Math.round(this.ship.position.x),
        y: Math.round(this.ship.position.y),
      },
      { visible: false },
    );
    this.onHudChange(this.state);
    this.scanner.scan(this.ship, this.asteroids, this.worldSites, {
      targets: scanner.targets,
      targetSiteId: this.state.journey.mission?.targetSiteId,
    });
  }

  frame(time) {
    const deltaSeconds = Math.min((time - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = time;

    this.update(deltaSeconds);
    this.onLogicUpdate(this.state);
    this.draw();

    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  update(deltaSeconds) {
    if (!this.state.components.engine.powered || this.shipDestroyed) {
      this.input.clearGameKeys();
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - deltaSeconds);
    this.shipHitCooldown = Math.max(0, this.shipHitCooldown - deltaSeconds);
    this.viewportTitleTimer = Math.max(0, this.viewportTitleTimer - deltaSeconds);
    this.updateImpactFeedback(deltaSeconds);
    const previousFuel = this.state.components.engine.fuel;
    const previousScanergy = this.state.components.scanner.scanergy;
    // Order matters: ship/world state is advanced first, then collisions and UI
    // readouts are derived from the updated world.
    this.ship.update(deltaSeconds, this.input);
    if (previousFuel > 0 && this.state.components.engine.fuel <= 0 && this.state.components.engine.powered) {
      this.setShipPowered(false);
    }
    this.audio?.updateEngine({
      powered: this.state.components.engine.powered && !this.shipDestroyed,
      thrusting: this.ship.isThrusting && !this.shipDestroyed,
    });
    this.updatePlayerThrustEvent();
    this.updateMovementEvent();
    this.updateWorldSiteInteraction();
    this.updateZoneTitle();
    if (this.state.components.engine.fuel !== previousFuel) {
      this.onHudChange(this.state);
    }
    this.updateLowFuelEvent(previousFuel);
    this.updateStrandedEvent(previousFuel);
    this.updateShooting();
    this.bullets.forEach((bullet) => bullet.update(deltaSeconds));
    this.updateAsteroidHits();
    this.bullets = this.bullets.filter((bullet) => bullet.isAlive);
    this.asteroids.forEach((asteroid) => asteroid.update(deltaSeconds));
    this.updateHubDefenses(deltaSeconds);
    // Lifeforms are preserved off-screen, but only nearby ones are simulated.
    // That keeps the field feeling persistent without paying every steering
    // cost for every distant creature each frame.
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
    this.updateNpcShips(activeAsteroids, deltaSeconds);
    this.updateEmergencyTow(deltaSeconds);
    this.updateNpcBulletHits();
    this.bullets = this.bullets.filter((bullet) => bullet.isAlive);
    this.lifeforms = this.lifeforms.filter((lifeform) => lifeform.isAlive);
    this.npcShips = this.npcShips.filter((ship) => ship.isAlive);
    this.pickups.forEach((pickup) => pickup.update(deltaSeconds));
    this.updateParticles(deltaSeconds);
    this.updateSiteDefenseBeams(deltaSeconds);
    this.updateCollector(deltaSeconds);
    this.collectPickups();
    this.scanner.update(deltaSeconds);
    this.camera.follow(this.ship, deltaSeconds);
    this.updateStoryEventSensors(activeAsteroids, activeLifeforms, deltaSeconds);
    if (this.state.components.scanner.scanergy !== previousScanergy) {
      this.onHudChange(this.state);
    }
    this.updateDebugReadout();
    this.updateSiteReadout();
    this.input.finishFrame();
  }

  updateWorldSiteInteraction() {
    // Sites are authored world objects. The Docking panel is always available,
    // but the Hub service panel only appears while the ship is docked at a hub.
    const nearby = getNearbyWorldSite(this.ship.position, this.worldSites);
    const previousNearbySiteId = this.nearbySite?.id ?? null;
    this.nearbySite = nearby?.site ?? null;

    if (this.dockedSite && !isInSiteRange(this.ship.position, this.dockedSite)) {
      this.breakDockingTether(this.dockedSite);
    }

    if (this.nearbySite && this.nearbySite.id !== previousNearbySiteId && !this.discoveredSiteIds.has(this.nearbySite.id)) {
      this.discoveredSiteIds.add(this.nearbySite.id);
      this.showViewportTitle(
        this.nearbySite.name,
        getSiteSubtitle(this.nearbySite),
        "site",
        VIEWPORT_TITLE_SECONDS,
        getTitleSideForPosition(this.ship.position, this.nearbySite.position),
      );
    }

    if (this.nearbySite && !this.nearbyStorySiteIds.has(this.nearbySite.id)) {
      this.nearbyStorySiteIds.add(this.nearbySite.id);
      this.state.ledger.recordEvent(
        "site.nearby",
        {
          siteId: this.nearbySite.id,
          siteName: this.nearbySite.name,
          siteType: this.nearbySite.type,
          x: Math.round(this.nearbySite.position.x),
          y: Math.round(this.nearbySite.position.y),
        },
        { visible: false },
      );
    }

    if (this.input.wasPressed("KeyE") && this.nearbySite && this.state.components.docking.installed) {
      this.setDockedSite(this.dockedSite ? null : this.nearbySite);
    }
  }

  updateMovementEvent() {
    const distanceMoved = distance(this.ship.position, this.lastShipMovementEventPosition);

    if (distanceMoved < STORY_MOVEMENT_DISTANCE) {
      return;
    }

    this.lastShipMovementEventPosition = { ...this.ship.position };
    this.state.ledger.recordEvent(
      "ship.moved",
      {
        x: Math.round(this.ship.position.x),
        y: Math.round(this.ship.position.y),
        distance: Math.round(distanceMoved),
        speed: Math.round(Math.hypot(this.ship.velocity.x, this.ship.velocity.y)),
      },
      { visible: false },
    );
  }

  updatePlayerThrustEvent() {
    if (this.hasRecordedPlayerThrust || !this.ship.isThrusting) {
      return;
    }

    this.hasRecordedPlayerThrust = true;
    this.state.ledger.recordEvent(
      "ship.thrusted",
      {
        x: Math.round(this.ship.position.x),
        y: Math.round(this.ship.position.y),
        speed: Math.round(Math.hypot(this.ship.velocity.x, this.ship.velocity.y)),
      },
      { visible: false },
    );
  }

  updateStoryEventSensors(activeAsteroids, activeLifeforms, deltaSeconds) {
    this.tickProximityCooldowns(deltaSeconds);
    this.updateViewportStoryEvents();
    this.updateProximityStoryEvents(activeAsteroids, activeLifeforms);
  }

  tickProximityCooldowns(deltaSeconds) {
    this.proximityCooldowns.forEach((cooldown, key) => {
      const nextCooldown = cooldown - deltaSeconds;

      if (nextCooldown <= 0) {
        this.proximityCooldowns.delete(key);
      } else {
        this.proximityCooldowns.set(key, nextCooldown);
      }
    });
  }

  updateViewportStoryEvents() {
    this.worldSites.forEach((site) => {
      if (this.visibleStorySiteIds.has(site.id) || !isInViewport(site, this.canvas, this.camera, site.radius)) {
        return;
      }

      this.visibleStorySiteIds.add(site.id);
      this.state.ledger.recordEvent(
        "site.enteredViewport",
        {
          siteId: site.id,
          siteName: site.name,
          siteType: site.type,
          x: Math.round(site.position.x),
          y: Math.round(site.position.y),
        },
        { visible: false },
      );
    });

    this.npcShips.forEach((ship) => {
      if (this.visibleStoryNpcIds.has(ship.id) || !isInViewport(ship, this.canvas, this.camera, ship.drawRadius ?? ship.radius)) {
        return;
      }

      this.visibleStoryNpcIds.add(ship.id);
      this.state.ledger.recordEvent(
        "npc.enteredViewport",
        {
          npcId: ship.id,
          npcName: ship.name,
          npcType: "route-hauler",
          x: Math.round(ship.position.x),
          y: Math.round(ship.position.y),
        },
        { visible: false },
      );
    });
  }

  updateProximityStoryEvents(activeAsteroids, activeLifeforms) {
    const candidates = [
      ...activeAsteroids.map((asteroid) => ({
        id: `asteroid:${getEntityStoryId(asteroid)}`,
        targetType: "asteroid",
        targetName: getAsteroidResourceType(asteroid),
        position: asteroid.position,
        radius: asteroid.radius,
      })),
      ...this.npcShips.map((ship) => ({
        id: `npc:${ship.id}`,
        targetType: "npc",
        targetName: ship.name,
        position: ship.position,
        radius: ship.radius,
      })),
      ...activeLifeforms
        .filter((lifeform) => lifeform.type === "hunter")
        .map((lifeform) => ({
          id: `lifeform:${getEntityStoryId(lifeform)}`,
          targetType: "hunter",
          targetName: "hunter",
          position: lifeform.position,
          radius: lifeform.radius,
        })),
    ];

    candidates.forEach((candidate) => {
      const distanceToSurface =
        distance(this.ship.position, candidate.position) -
        SHIP_COLLISION_RADIUS -
        candidate.radius;

      if (distanceToSurface > STORY_PROXIMITY_RADIUS || this.proximityCooldowns.has(candidate.id)) {
        return;
      }

      this.proximityCooldowns.set(candidate.id, STORY_PROXIMITY_COOLDOWN_SECONDS);
      this.state.ledger.recordEvent(
        "ship.nearObject",
        {
          targetId: candidate.id,
          targetType: candidate.targetType,
          targetName: candidate.targetName,
          distance: Math.round(Math.max(0, distanceToSurface)),
          x: Math.round(this.ship.position.x),
          y: Math.round(this.ship.position.y),
        },
        { visible: false },
      );
    });
  }

  recordShipCollision(targetType, target, damageAmount) {
    this.state.ledger.recordEvent(
      "ship.collision",
      {
        targetId: getEntityStoryId(target),
        targetType,
        targetName: target.name ?? target.type ?? getAsteroidResourceType(target),
        damage: damageAmount,
        speed: Math.round(Math.hypot(this.ship.velocity.x, this.ship.velocity.y)),
        hullAfter: Math.max(0, this.state.components.hull.integrity - damageAmount),
        x: Math.round(this.ship.position.x),
        y: Math.round(this.ship.position.y),
      },
      { visible: false },
    );
  }

  setDockedSite(site, options = {}) {
    const previousDockedSite = this.dockedSite;
    const previousDockedSiteId = previousDockedSite?.id ?? null;
    this.dockedSite = site;

    if (site) {
      if (previousDockedSiteId !== site.id) {
        this.state.ledger.recordEvent("site.docked", {
          siteId: site.id,
          siteName: site.name,
          siteType: site.type,
        });
        this.reviewShipRegistryAtHub(site);
        this.audio?.playDock();
      }

      // Fuel is now purchased from the supply window, not auto-filled on dock.

      this.showViewportTitle(
        site.name,
        "docking tether connected",
        "dock",
        DOCK_MESSAGE_SECONDS,
        getTitleSideForPosition(this.ship.position, site.position),
      );
    } else if (previousDockedSite) {
      this.state.ledger.recordEvent(
        options.forced ? "site.tetherBroken" : "site.undocked",
        {
          siteId: previousDockedSite.id,
          siteName: previousDockedSite.name,
          siteType: previousDockedSite.type,
          damage: options.damage ?? 0,
        },
        { visible: Boolean(options.forced) },
      );
    }

    this.updateSiteReadout();
  }

  reviewShipRegistryAtHub(site) {
    if (site.type !== "hub") {
      return;
    }

    const hull = this.state.components.hull;
    const legal = this.state.ship.legal ?? {};
    const registrations = legal.registrations ?? {};
    const pilot = this.state.pilot;
    const unauthorizedZones = pilot.visitedZoneIds.filter((zoneId) => !pilot.authorizedZones.includes(zoneId));

    this.state.ledger.recordEvent(
      "ship.registryReviewed",
      {
        siteId: site.id,
        siteName: site.name,
        shipName: this.state.ship.name,
        pilotLicenseId: pilot.licenseId ?? null,
        pilotName: pilot.firstName ? `${pilot.firstName} ${pilot.lastName}` : null,
        vin: hull.vinPlateAttached ? hull.vin : null,
        vinPlateAttached: hull.vinPlateAttached,
        titleHolder: legal.titleHolder ?? null,
        flightLicenseId: legal.flightLicenseId ?? null,
        flightRegistrationStatus: registrations.flight?.status ?? "none",
        miningRegistrationStatus: registrations.mining?.status ?? "none",
        patrolRegistrationStatus: registrations.patrol?.status ?? "none",
        unauthorizedZones,
      },
      { visible: false },
    );

    if (unauthorizedZones.length > 0) {
      this.state.ledger.recordEvent(
        "legal.zoneFlag",
        {
          siteId: site.id,
          siteName: site.name,
          unauthorizedZones,
          pilotLicenseId: pilot.licenseId ?? null,
        },
        { visible: true },
      );
    }
  }

  breakDockingTether(site) {
    const damage = DOCK_TETHER_BREAK_DAMAGE;
    const awayX = this.ship.position.x - site.position.x;
    const awayY = this.ship.position.y - site.position.y;
    const tetherDistance = Math.hypot(awayX, awayY) || 1;
    const normalX = awayX / tetherDistance;
    const normalY = awayY / tetherDistance;

    this.ship.velocity.x += normalX * DOCK_TETHER_BREAK_IMPULSE;
    this.ship.velocity.y += normalY * DOCK_TETHER_BREAK_IMPULSE;
    this.createDockTetherBreakSparks(site, normalX, normalY);
    this.damageHull(damage);
    this.triggerImpactFeedback(damage);
    this.setDockedSite(null, { forced: true, damage });
  }

  updateZoneTitle() {
    const zoneProfile = getZoneProfile(this.ship.position.x, this.ship.position.y);

    if (zoneProfile.strongestZoneId === this.currentZoneId || zoneProfile.influence < 0.55) {
      return;
    }

    const zoneId = zoneProfile.strongestZoneId;
    this.currentZoneId = zoneId;

    if (!this.state.pilot.visitedZoneIds.includes(zoneId)) {
      this.state.pilot.visitedZoneIds.push(zoneId);
    }

    this.state.ledger.recordEvent("zone.entered", {
      zoneId,
      zoneName: zoneProfile.strongestZoneName,
      influence: zoneProfile.influence,
      danger: zoneProfile.danger,
      tags: zoneProfile.tags,
    });
    this.showViewportTitle(zoneProfile.strongestZoneName, "zone entered", "zone", VIEWPORT_TITLE_SECONDS, "left");
  }

  showViewportTitle(title, subtitle, kind = "event", duration = VIEWPORT_TITLE_SECONDS, side = "left") {
    this.viewportTitle = { title, subtitle, kind, side };
    this.viewportTitleTimer = duration;
  }

  toggleDock() {
    if (!this.state.components.docking.installed || (!this.nearbySite && !this.dockedSite)) {
      return;
    }

    this.setDockedSite(this.dockedSite ? null : this.nearbySite);
  }

  repairAtDock() {
    const site = this.dockedSite;

    if (!site?.capabilities.includes("repair")) {
      return;
    }

    const repairCost = this.getRepairCost();
    const hullBeforeRepair = this.state.components.hull.integrity;

    if (repairCost <= 0 || repairCost > this.state.components.account.credits) {
      return;
    }

    this.state.components.account.credits -= repairCost;
    this.state.components.hull.integrity = this.state.components.hull.maxIntegrity;
    this.state.ledger.recordEvent("ship.repaired", {
      siteId: site.id,
      siteName: site.name,
      creditsSpent: repairCost,
      hullBefore: hullBeforeRepair,
      hullAfter: this.state.components.hull.integrity,
      hullRestored: this.state.components.hull.integrity - hullBeforeRepair,
    });
    this.shipDestroyed = false;
    this.onHudChange(this.state);
    this.setDockedSite(site);
  }

  getRepairCost() {
    const hull = this.state.components.hull;
    const missingHull = Math.max(0, hull.maxIntegrity - hull.integrity);

    return Math.ceil(missingHull * REPAIR_CREDITS_PER_HULL);
  }

  updateLowFuelEvent(previousFuel) {
    const engine = this.state.components.engine;
    const lowFuelLine = engine.maxFuel * 0.5;

    if (
      this.hasRecordedLowFuelEvent ||
      !engine.installed ||
      engine.maxFuel <= 0 ||
      previousFuel <= lowFuelLine ||
      engine.fuel > lowFuelLine
    ) {
      return;
    }

    this.hasRecordedLowFuelEvent = true;
    this.state.ledger.recordEvent(
      "ship.lowFuel",
      {
        fuel: Math.floor(engine.fuel),
        maxFuel: Math.floor(engine.maxFuel),
        percent: Math.round((engine.fuel / engine.maxFuel) * 100),
        hasScanner: Boolean(this.state.components.scanner.installed),
      },
      { visible: false },
    );
  }

  updateStrandedEvent(previousFuel) {
    const currentFuel = this.state.components.engine.fuel;

    if (this.hasRecordedStrandedEvent || previousFuel <= 0 || currentFuel > 0 || !this.state.components.engine.installed) {
      return;
    }

    this.recordStrandedEvent("out-of-fuel");
  }

  recordStrandedEvent(reason) {
    if (this.hasRecordedStrandedEvent) {
      return;
    }

    const nearest = getNearestWorldSite(this.ship.position, this.worldSites);

    this.hasRecordedStrandedEvent = true;
    this.state.ledger.recordEvent("ship.stranded", {
      reason,
      fuel: this.state.components.engine.fuel,
      hullIntegrity: this.state.components.hull.integrity,
      nearestSiteId: nearest?.site?.id ?? null,
      nearestSiteName: nearest?.site?.name ?? "unknown hub",
      nearestSiteDistance: Math.round(nearest?.distance ?? 0),
      x: Math.round(this.ship.position.x),
      y: Math.round(this.ship.position.y),
    });
  }

  createCargoTransferTrail(resourceType = "fuel") {
    const site = this.dockedSite;

    if (!site) {
      return;
    }

    this.audio?.playCargoTransfer(resourceType);
    const color = resourceType === "crystal" ? "#73d2ff" : "#ff7452";
    const distanceX = site.position.x - this.ship.position.x;
    const distanceY = site.position.y - this.ship.position.y;
    const transferDistance = distance(this.ship.position, site.position) || 1;
    const normalX = distanceX / transferDistance;
    const normalY = distanceY / transferDistance;

    for (let index = 0; index < 5; index += 1) {
      const progress = index * 0.045;
      const sideJitter = (index - 2) * 2.6;

      this.particles.push({
        type: "cargo-packet",
        position: {
          x: this.ship.position.x + distanceX * progress - normalY * sideJitter,
          y: this.ship.position.y + distanceY * progress + normalX * sideJitter,
        },
        velocity: {
          x: normalX * (230 + index * 14),
          y: normalY * (230 + index * 14),
        },
        color,
        size: 5,
        drag: 0.99,
        life: Math.max(0.35, transferDistance / 235) + index * 0.025,
        maxLife: Math.max(0.35, transferDistance / 235) + index * 0.025,
      });
    }
  }

  updateSiteReadout() {
    const nearest = getNearestWorldSite(this.ship.position, this.worldSites);

    this.onSiteChange({
      nearbySite: this.nearbySite,
      dockedSite: this.dockedSite,
      nearestSite: nearest?.site ?? null,
      nearestSiteDistance: nearest?.distance ?? 0,
      canRepair: Boolean(this.dockedSite?.capabilities.includes("repair")),
      repairCost: this.getRepairCost(),
      credits: this.state.components.account.credits,
      hullIntegrity: this.state.components.hull.integrity,
      hullMaxIntegrity: this.state.components.hull.maxIntegrity,
    });
  }

  emergencyTow(towCost = null) {
    if (this.activeTow) {
      return;
    }

    const nearest = getNearestWorldSite(this.ship.position, this.worldSites);
    const site = nearest?.site ?? this.worldSites.find((worldSite) => worldSite.id === "yard-exchange");
    const distanceToSite = nearest?.distance ?? distance(this.ship.position, site.position);
    const estimate = this.getEmergencyTowEstimate();
    const directionToShip = normalizeVector(this.ship.position.x - site.position.x, this.ship.position.y - site.position.y);
    const startDistance = Math.max(site.interactionRadius + 260, Math.min(distanceToSite * 0.55, 1200));

    this.activeTow = {
      phase: "approach",
      site,
      cost: towCost ?? estimate.cost,
      quotedDistance: Math.round(distanceToSite),
      position: {
        x: site.position.x + directionToShip.x * startDistance,
        y: site.position.y + directionToShip.y * startDistance,
      },
      velocity: {
        x: directionToShip.x * TOW_APPROACH_SPEED,
        y: directionToShip.y * TOW_APPROACH_SPEED,
      },
      heading: Math.atan2(directionToShip.y, directionToShip.x),
      pulse: 0,
      towedDistance: 0,
      cutterCooldown: 0,
      dropoffPosition: null,
    };

    this.setShipPowered(false);
    this.state.ledger.recordEvent(
      "tow.dispatched",
      {
        siteId: site.id,
        siteName: site.name,
        cost: this.activeTow.cost,
        distance: this.activeTow.quotedDistance,
      },
      { visible: true },
    );
    this.onHudChange(this.state);
  }

  isTowActive() {
    return Boolean(this.activeTow);
  }

  getEmergencyTowEstimate() {
    const nearest = getNearestWorldSite(this.ship.position, this.worldSites);
    const distanceToSite = nearest?.distance ?? 0;

    return {
      siteId: nearest?.site?.id ?? "yard-exchange",
      siteName: nearest?.site?.name ?? "Yard Exchange",
      distance: Math.round(distanceToSite),
      cost: TOW_BASE_COST + Math.ceil(distanceToSite / 1000) * TOW_COST_PER_1000_UNITS,
    };
  }

  updateEmergencyTow(deltaSeconds) {
    if (!this.activeTow) {
      return;
    }

    if (this.dockedSite) {
      this.activeTow = null;
      return;
    }

    const tow = this.activeTow;

    tow.pulse += deltaSeconds;
    tow.cutterCooldown = Math.max(0, tow.cutterCooldown - deltaSeconds);
    this.updateTowCutter(tow);

    if (tow.phase === "approach") {
      this.steerTowRunner(tow, this.ship.position, TOW_APPROACH_SPEED, deltaSeconds);

      if (distance(tow.position, this.ship.position) > TOW_ATTACH_DISTANCE) {
        return;
      }

      tow.phase = "return";
      tow.dropoffPosition = getTowDropoffPosition(tow.site, this.ship.position);
      this.shipDestroyed = false;
      this.state.components.hull.integrity = Math.max(this.state.components.hull.integrity, 1);
      this.createTowAttachSparks(tow);
      this.state.ledger.recordEvent(
        "tow.attached",
        {
          siteId: tow.site.id,
          siteName: tow.site.name,
          cost: tow.cost,
        },
        { visible: true },
      );
      return;
    }

    const towTarget = tow.dropoffPosition ?? getTowDropoffPosition(tow.site, this.ship.position);
    const runnerTarget = getTowRunnerTarget(tow.site, towTarget);
    const distanceToTarget = distance(this.ship.position, towTarget);
    const directionToHub = normalizeVector(runnerTarget.x - tow.position.x, runnerTarget.y - tow.position.y);

    this.steerTowRunner(tow, runnerTarget, TOW_RETURN_SPEED, deltaSeconds);
    this.applyTowLine(tow, deltaSeconds);
    tow.towedDistance += Math.max(0, dotProduct(this.ship.velocity, directionToHub) * deltaSeconds);

    if (distanceToTarget > TOW_DELIVERY_DISTANCE) {
      return;
    }

    this.completeEmergencyTow();
  }

  steerTowRunner(tow, target, maxSpeed, deltaSeconds) {
    const targetDirection = normalizeVector(target.x - tow.position.x, target.y - tow.position.y);
    const avoidance = getTowAvoidance(tow, this.asteroids);
    const steerDirection = normalizeVector(
      targetDirection.x + avoidance.x * 0.45,
      targetDirection.y + avoidance.y * 0.45,
    );
    const desiredVelocity = {
      x: steerDirection.x * maxSpeed,
      y: steerDirection.y * maxSpeed,
    };
    const turn = Math.min(1, deltaSeconds * 1.65);

    tow.velocity.x += (desiredVelocity.x - tow.velocity.x) * turn;
    tow.velocity.y += (desiredVelocity.y - tow.velocity.y) * turn;
    tow.position.x += tow.velocity.x * deltaSeconds;
    tow.position.y += tow.velocity.y * deltaSeconds;
    tow.heading = lerpAngle(tow.heading, Math.atan2(tow.velocity.y, tow.velocity.x), Math.min(1, deltaSeconds * 3.8));
  }

  applyTowLine(tow, deltaSeconds) {
    const offsetX = tow.position.x - this.ship.position.x;
    const offsetY = tow.position.y - this.ship.position.y;
    const lineDistance = Math.hypot(offsetX, offsetY) || 1;
    const stretch = lineDistance - TOW_LINE_LENGTH;

    if (stretch <= 0) {
      this.ship.velocity.x *= TOW_LINE_DAMPING;
      this.ship.velocity.y *= TOW_LINE_DAMPING;
      return;
    }

    const pullX = offsetX / lineDistance;
    const pullY = offsetY / lineDistance;
    const pull = Math.min(220, stretch * TOW_LINE_STIFFNESS);

    this.ship.velocity.x += pullX * pull * deltaSeconds;
    this.ship.velocity.y += pullY * pull * deltaSeconds;
    this.ship.velocity.x = this.ship.velocity.x * TOW_LINE_DAMPING + tow.velocity.x * 0.012;
    this.ship.velocity.y = this.ship.velocity.y * TOW_LINE_DAMPING + tow.velocity.y * 0.012;
    this.ship.position.x += this.ship.velocity.x * deltaSeconds;
    this.ship.position.y += this.ship.velocity.y * deltaSeconds;
  }

  updateTowCutter(tow) {
    if (tow.cutterCooldown > 0) {
      return;
    }

    const obstacle = getTowObstacle(tow, this.asteroids);

    if (!obstacle) {
      return;
    }

    tow.cutterCooldown = TOW_CUTTER_COOLDOWN_SECONDS;
    this.createTowCutterSparks(tow, obstacle);
    const fragments = this.breakAsteroid(obstacle, {
      x: tow.velocity.x + Math.cos(tow.heading) * 280,
      y: tow.velocity.y + Math.sin(tow.heading) * 280,
    });

    this.asteroids = this.asteroids.filter((asteroid) => asteroid !== obstacle);
    this.asteroids.push(...fragments);
  }

  completeEmergencyTow() {
    const tow = this.activeTow;

    if (!tow) {
      return;
    }

    const towTarget = tow.dropoffPosition ?? getTowDropoffPosition(tow.site, this.ship.position);

    this.activeTow = null;
    this.state.components.account.credits -= tow.cost;
    this.state.components.engine.fuel = 0;
    this.state.components.hull.integrity = Math.max(this.state.components.hull.integrity, 10);
    this.shipDestroyed = false;
    this.hasRecordedStrandedEvent = false;
    this.hasRecordedLowFuelEvent = false;
    this.ship.position.x = towTarget.x;
    this.ship.position.y = towTarget.y;
    this.ship.velocity.x = 0;
    this.ship.velocity.y = 0;
    this.setDockedSite(tow.site);
    this.state.ledger.recordEvent(
      "ship.towed",
      {
        siteId: tow.site.id,
        siteName: tow.site.name,
        cost: tow.cost,
        distance: Math.round(tow.towedDistance),
        fuelAfter: this.state.components.engine.fuel,
        hullAfter: this.state.components.hull.integrity,
      },
      { visible: true },
    );
    this.onHudChange(this.state);
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
      npcShipCount: this.npcShips.length,
      pickupCount: this.pickups.length,
      currentSite: this.dockedSite ?? this.nearbySite,
      nearestSite: getNearestWorldSite(this.ship.position, this.worldSites)?.site ?? null,
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

      this.bumpBodyFromBody(hunter, hitAsteroid, 0.85, { baseImpulse: 70, overlapImpulse: 3 });
      hunter.damage(this.getHunterEnvironmentDamage(hunter, hitAsteroid));
      hunter.environmentHitCooldown = HUNTER_ENVIRONMENT_HIT_COOLDOWN_SECONDS;
      this.createHunterImpactSparks(hunter);
      this.destroyHunterIfNeeded(hunter, "asteroid-collision");
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
        this.destroyHunterIfNeeded(firstHunter, "hunter-collision");
        this.destroyHunterIfNeeded(secondHunter, "hunter-collision");
        impactCount += 1;
        break;
      }
    }
  }

  updateShooting() {
    const wantsToFire = this.input.wasPressed("Space") || this.input.isDown("Space");

    const miner = this.state.components.miner;

    if (
      !this.shipDestroyed &&
      this.state.components.engine.powered &&
      miner.installed &&
      !miner.armed &&
      this.input.wasPressed("Space") &&
      !this.hasRecordedUnarmedFireReminder
    ) {
      this.unarmedFireAttempts += 1;

      if (this.unarmedFireAttempts >= 3) {
        this.hasRecordedUnarmedFireReminder = true;
        this.state.ledger.recordEvent(
          "weapon.unarmedAttempt",
          {
            weaponType: "miner",
            attempts: this.unarmedFireAttempts,
          },
          { visible: false },
        );
      }
    }

    if (this.shipDestroyed || !this.state.components.engine.powered || !miner.installed || !miner.armed || !wantsToFire || this.fireCooldown > 0 || miner.ammo < AMMO_PER_SHOT) {
      return;
    }

    this.unarmedFireAttempts = 0;
    miner.ammo -= AMMO_PER_SHOT;
    this.state.ledger.recordEvent(
      "weapon.fired",
      {
        weaponType: "miner",
        ammoSpent: AMMO_PER_SHOT,
      },
      { visible: false },
    );
    this.onHudChange(this.state);
    this.bullets.push(new Bullet(this.ship));
    this.audio?.playMiningShot();
    this.fireCooldown = FIRE_COOLDOWN_SECONDS;
  }

  updateCollector(deltaSeconds) {
    const collector = this.state.components.collector;
    const scanner = this.state.components.scanner;

    if (this.shipDestroyed || !this.state.components.engine.powered || !collector.installed || !collector.isActive || scanner.scanergy <= 0) {
      return;
    }

    const scanergyCost = COLLECTOR_MAX_SCANERGY_PER_SECOND * deltaSeconds;
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
      const pullStrength = Math.max(0.45, 1 - distance / radius) * 1.35;

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

    if (this.shipHitCooldown === 0 && !this.activeTow) {
      const shipHitAsteroid = this.asteroids.find(
        (asteroid) =>
          !hitAsteroids.has(asteroid) &&
          circlesOverlap(this.ship.position, SHIP_COLLISION_RADIUS, asteroid.position, asteroid.radius),
      );

      if (shipHitAsteroid) {
        const impactDamage = this.getImpactDamage(shipHitAsteroid);

        this.shipHitCooldown = SHIP_HIT_COOLDOWN_SECONDS;
        this.recordShipCollision("asteroid", shipHitAsteroid, impactDamage);
        this.damageHull(impactDamage);
        this.triggerImpactFeedback(impactDamage);
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
      this.recordEnemyDestroyed("hunter", "weapon");
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
    const hullDamage = impactDamage * 0.5;

    this.shipHitCooldown = SHIP_HIT_COOLDOWN_SECONDS;
    this.recordShipCollision("hunter", rammingHunter, hullDamage);
    this.damageHull(hullDamage);
    this.triggerImpactFeedback(hullDamage);
    this.createShipSparks(rammingHunter);
    rammingHunter.damage(impactDamage * 0.85);

    if (rammingHunter.isAlive) {
      this.createHunterImpactSparks(rammingHunter);
    } else {
      this.recordEnemyDestroyed("hunter", "ramming-ship");
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

  spawnHunterNearShip(reason = "story") {
    this.hunterRespawnSeed += 1;
    const hunter = createHunterNearShip(this.ship, this.hunterRespawnSeed);

    this.lifeforms.push(hunter);
    this.state.ledger.recordEvent(
      "enemy.spawned",
      {
        enemyType: "hunter",
        reason,
        x: Math.round(hunter.position.x),
        y: Math.round(hunter.position.y),
      },
      { visible: false },
    );
  }

  updateHubDefenses(deltaSeconds) {
    this.hubDefenseCooldown = Math.max(0, this.hubDefenseCooldown - deltaSeconds);

    if (this.hubDefenseCooldown > 0) {
      return;
    }

    const hitAsteroids = new Set();
    const hitHunters = new Set();

    this.worldSites
      .filter((site) => site.type === "hub")
      .forEach((site) => {
        if (hitAsteroids.size + hitHunters.size >= MAX_HUB_DEFENSE_HITS_PER_FRAME) {
          return;
        }

        const clearanceRadius = site.interactionRadius + HUB_DEFENSE_RADIUS_PADDING;
        const hunterTarget = this.lifeforms
          .filter((lifeform) => lifeform.type === "hunter" && lifeform.isAlive && !hitHunters.has(lifeform))
          .map((hunter) => ({
            hunter,
            distance: distance(hunter.position, site.position),
          }))
          .filter(({ hunter, distance }) => distance - hunter.radius <= clearanceRadius)
          .sort((first, second) => first.distance - second.distance)[0]?.hunter;

        if (hunterTarget) {
          hitHunters.add(hunterTarget);
          this.createHubDefenseBeam(site, hunterTarget);
          hunterTarget.damage(100);
          this.createHubDefenseBurst(site, hunterTarget);
          this.destroyHunterIfNeeded(hunterTarget, "hub-defense");
          return;
        }

        const target = this.asteroids
          .filter((asteroid) => !hitAsteroids.has(asteroid))
          .map((asteroid) => ({
            asteroid,
            distance: distance(asteroid.position, site.position),
          }))
          .filter(({ asteroid, distance }) => distance - asteroid.radius <= clearanceRadius)
          .sort((first, second) => first.distance - second.distance)[0]?.asteroid;

        if (!target) {
          return;
        }

        hitAsteroids.add(target);
        this.createHubDefenseBeam(site, target);
        this.createHubDefenseBurst(site, target);
      });

    if (hitAsteroids.size + hitHunters.size === 0) {
      return;
    }

    this.asteroids = this.asteroids.filter((asteroid) => !hitAsteroids.has(asteroid));
    this.hubDefenseCooldown = HUB_DEFENSE_COOLDOWN_SECONDS;
  }

  updateNpcShips(activeAsteroids, deltaSeconds) {
    const activeNpcShips = this.npcShips.filter((ship) =>
      isNearSimulationArea(ship, this.canvas, this.camera, this.ship, NPC_SIMULATION_MARGIN),
    );

    activeNpcShips.forEach((ship) => {
      ship.environmentHitCooldown = Math.max(0, (ship.environmentHitCooldown ?? 0) - deltaSeconds);
      ship.update(deltaSeconds, {
        asteroids: activeAsteroids,
        npcShips: activeNpcShips,
        sites: this.worldSites,
      });
      ship.consumeEvents().forEach((event) => {
        this.state.ledger.recordEvent(event.type, event.payload, { visible: false });
      });

      if (ship.environmentHitCooldown > 0) {
        return;
      }

      const hitAsteroid = activeAsteroids.find((asteroid) =>
        circlesOverlap(ship.position, ship.radius, asteroid.position, asteroid.radius),
      );

      if (!hitAsteroid) {
        return;
      }

      this.bumpBodyFromBody(ship, hitAsteroid, 0.55, { baseImpulse: 42, overlapImpulse: 1.8 });
      ship.damage(this.getNpcEnvironmentDamage(ship, hitAsteroid));
      ship.environmentHitCooldown = NPC_ENVIRONMENT_HIT_COOLDOWN_SECONDS;
      this.createNpcImpactSparks(ship);

      if (!ship.isAlive) {
        this.recordNpcDestroyed(ship, "asteroid-collision");
        this.createNpcBurst(ship, ship.velocity);
      }
    });
  }

  updateNpcBulletHits() {
    this.bullets.forEach((bullet) => {
      if (!bullet.isAlive) {
        return;
      }

      const hitShip = this.npcShips.find((ship) =>
        ship.isAlive && circlesOverlap(bullet.position, bullet.radius, ship.position, ship.radius),
      );

      if (!hitShip) {
        return;
      }

      bullet.destroy();
      hitShip.damage(34);
      this.createNpcImpactSparks(hitShip);

      if (!hitShip.isAlive) {
        this.recordNpcDestroyed(hitShip, "weapon");
        this.createNpcBurst(hitShip, bullet.velocity);
      }
    });
  }

  destroyHunterIfNeeded(hunter, cause = "environment") {
    if (hunter.isAlive) {
      return;
    }

    this.recordEnemyDestroyed("hunter", cause);
    this.createHunterBurst(hunter, hunter.velocity);
    this.createHunterDrops(hunter, hunter.velocity);
    this.respawnHunter();
  }

  recordEnemyDestroyed(enemyType, cause) {
    this.state.ledger.recordEvent("enemy.destroyed", {
      enemyType,
      cause,
    });
  }

  recordNpcDestroyed(ship, cause) {
    this.state.ledger.recordEvent(
      "npc.destroyed",
      {
        npcId: ship.id,
        npcName: ship.name,
        npcType: "route-hauler",
        cause,
      },
      { visible: isVisible(ship, this.canvas, this.camera) },
    );
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
    this.audio?.playHullHit(amount);
  }

  destroyShip() {
    this.shipDestroyed = true;
    this.state.components.engine.powered = false;
    this.state.components.collector.isActive = false;
    this.input.clearGameKeys();
    this.ship.stopThrusting();
    this.createShipDestructionBurst();
    this.recordStrandedEvent("hull-destroyed");
  }

  getImpactDamage(asteroid) {
    const relativeSpeed = getRelativeSpeed(this.ship, asteroid);
    const massScale = asteroid.radius / 34;
    const damage = 4 + relativeSpeed * 0.04 + relativeSpeed * massScale * 0.07 + asteroid.radius * 0.18;

    return Math.min(100, Math.max(6, damage));
  }

  triggerImpactFeedback(damageAmount) {
    const impact = Math.min(1, Math.max(0, damageAmount / 70));

    this.cameraShake.duration = 0.16 + impact * 0.3;
    this.cameraShake.time = this.cameraShake.duration;
    this.cameraShake.magnitude = Math.max(this.cameraShake.magnitude, 4 + impact * MAX_IMPACT_SHAKE_PIXELS);
    this.cameraShake.seed += 1;
    this.damageFlashAlpha = Math.min(MAX_DAMAGE_FLASH_ALPHA, this.damageFlashAlpha + 0.08 + impact * 0.34);
  }

  updateImpactFeedback(deltaSeconds) {
    this.damageFlashAlpha = Math.max(0, this.damageFlashAlpha - DAMAGE_FLASH_DECAY_PER_SECOND * deltaSeconds);
    this.cameraShake.time = Math.max(0, this.cameraShake.time - deltaSeconds);

    if (this.cameraShake.time === 0) {
      this.cameraShake.magnitude = 0;
    }
  }

  getShakenCamera() {
    if (this.cameraShake.time <= 0 || this.cameraShake.duration <= 0) {
      return this.camera;
    }

    const remaining = this.cameraShake.time / this.cameraShake.duration;
    const strength = this.cameraShake.magnitude * remaining * remaining;
    const pulse = this.lastFrameTime * 0.001;
    const seed = this.cameraShake.seed;
    const offsetX = Math.sin(pulse * 72 + seed * 13.1) * strength + Math.sin(pulse * 129 + seed * 4.7) * strength * 0.28;
    const offsetY = Math.cos(pulse * 68 + seed * 9.3) * strength + Math.sin(pulse * 117 + seed * 7.9) * strength * 0.28;

    return {
      ...this.camera,
      x: this.camera.x + offsetX,
      y: this.camera.y + offsetY,
    };
  }

  breakAsteroid(asteroid, impactVelocity) {
    this.impactSeed += 1;
    const resourceType = getAsteroidResourceType(asteroid);
    this.audio?.playRockBreak(asteroid.tier);

    this.state.ledger.recordEvent(
      "asteroid.destroyed",
      {
        resourceType,
        tier: asteroid.tier,
        finalBreak: asteroid.tier <= 1,
        radius: asteroid.radius,
      },
      { visible: false },
    );

    // Pickups come only from the final break. Bigger resource rocks become
    // smaller rocks first, so shooting still has the classic Asteroids cadence.
    if (asteroid.tier <= 1) {
      const minedPickups = createResourcePickupsFromAsteroid(asteroid, this.impactSeed + 50000, impactVelocity);

      if (minedPickups.length > 0) {
        const unitsByType = minedPickups.reduce((counts, pickup) => {
          counts[pickup.type] = (counts[pickup.type] ?? 0) + 1;
          return counts;
        }, {});

        this.state.ledger.recordEvent(
          "resource.mined",
          {
            sourceType: "asteroid",
            resourceType,
            totalUnits: minedPickups.length,
            units: unitsByType,
            x: Math.round(asteroid.position.x),
            y: Math.round(asteroid.position.y),
          },
          { visible: false },
        );
      }

      this.pickups.push(...minedPickups);
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

  createHubDefenseBeam(site, target) {
    this.siteDefenseBeams.push({
      start: { x: site.position.x, y: site.position.y },
      end: { x: target.position.x, y: target.position.y },
      life: 0.18,
      maxLife: 0.18,
    });
  }

  createHubDefenseBurst(site, target) {
    const count = 12 + Math.floor(target.radius / 5);
    const beamAngle = Math.atan2(target.position.y - site.position.y, target.position.x - site.position.x);

    for (let index = 0; index < count; index += 1) {
      const angle = beamAngle + Math.PI + (Math.random() - 0.5) * Math.PI * 1.4;
      const speed = 75 + Math.random() * 170;

      this.particles.push({
        type: index % 3 === 0 ? "spark" : "square",
        position: {
          x: target.position.x + (Math.random() - 0.5) * target.radius,
          y: target.position.y + (Math.random() - 0.5) * target.radius,
        },
        velocity: {
          x: target.velocity.x * 0.25 + Math.cos(angle) * speed,
          y: target.velocity.y * 0.25 + Math.sin(angle) * speed,
        },
        color: target.type === "hunter" ? (index % 4 === 0 ? "#ffffff" : "#ff8a96") : index % 4 === 0 ? "#ffffff" : "#9ee8ff",
        size: 1.5 + Math.random() * 3.2,
        life: 0.28 + Math.random() * 0.28,
        maxLife: 0.56,
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

  bumpBodyFromBody(entity, body, strength = 1, { baseImpulse, overlapImpulse }) {
    const distanceX = entity.position.x - body.position.x;
    const distanceY = entity.position.y - body.position.y;
    const centerDistance = distance(entity.position, body.position) || 1;
    const overlap = entity.radius + body.radius - centerDistance;

    if (overlap <= 0) {
      return;
    }

    const normalX = distanceX / centerDistance;
    const normalY = distanceY / centerDistance;
    entity.position.x += normalX * overlap * strength;
    entity.position.y += normalY * overlap * strength;
    entity.velocity.x += normalX * (baseImpulse + overlap * overlapImpulse);
    entity.velocity.y += normalY * (baseImpulse + overlap * overlapImpulse);
  }

  separateHunters(firstHunter, secondHunter) {
    const distanceX = firstHunter.position.x - secondHunter.position.x;
    const distanceY = firstHunter.position.y - secondHunter.position.y;
    const centerDistance = distance(firstHunter.position, secondHunter.position) || 1;
    const overlap = firstHunter.radius + secondHunter.radius - centerDistance;

    if (overlap <= 0) {
      return;
    }

    const normalX = distanceX / centerDistance;
    const normalY = distanceY / centerDistance;
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
    const relativeSpeed = getRelativeSpeed(hunter, body);

    return Math.min(34, Math.max(7, relativeSpeed * 0.055 + body.radius * 0.08));
  }

  getHunterHunterDamage(firstHunter, secondHunter) {
    const relativeSpeed = getRelativeSpeed(firstHunter, secondHunter);

    return Math.min(12, Math.max(2, relativeSpeed * 0.025));
  }

  getNpcEnvironmentDamage(ship, body) {
    const relativeSpeed = getRelativeSpeed(ship, body);

    return Math.min(28, Math.max(4, relativeSpeed * 0.04 + body.radius * 0.055));
  }

  createNpcImpactSparks(ship) {
    for (let index = 0; index < 10; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 115;

      this.particles.push({
        type: "spark",
        position: {
          x: ship.position.x,
          y: ship.position.y,
        },
        velocity: {
          x: ship.velocity.x * 0.2 + Math.cos(angle) * speed,
          y: ship.velocity.y * 0.2 + Math.sin(angle) * speed,
        },
        color: Math.random() > 0.3 ? "#ffd36b" : "#ffffff",
        size: 1 + Math.random() * 2,
        life: 0.22 + Math.random() * 0.25,
        maxLife: 0.47,
      });
    }
  }

  createNpcBurst(ship, impactVelocity) {
    for (let index = 0; index < 28; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 210;

      this.particles.push({
        type: index % 2 === 0 ? "spark" : "square",
        position: {
          x: ship.position.x + Math.cos(angle) * ship.radius * 0.25,
          y: ship.position.y + Math.sin(angle) * ship.radius * 0.25,
        },
        velocity: {
          x: ship.velocity.x * 0.35 + Math.cos(angle) * speed + impactVelocity.x * 0.02,
          y: ship.velocity.y * 0.35 + Math.sin(angle) * speed + impactVelocity.y * 0.02,
        },
        color: index % 4 === 0 ? "#ffffff" : "#ffd36b",
        size: 1.5 + Math.random() * 3,
        life: 0.35 + Math.random() * 0.45,
        maxLife: 0.8,
      });
    }
  }

  createShipSparks(impactBody) {
    const angleToShip = Math.atan2(this.ship.position.y - impactBody.position.y, this.ship.position.x - impactBody.position.x);
    const relativeSpeed = getRelativeSpeed(this.ship, impactBody);
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

  createTowAttachSparks(tow) {
    for (let index = 0; index < 28; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 180;

      this.particles.push({
        type: "spark",
        position: {
          x: this.ship.position.x + (Math.random() - 0.5) * 18,
          y: this.ship.position.y + (Math.random() - 0.5) * 18,
        },
        velocity: {
          x: tow.velocity.x * 0.2 + Math.cos(angle) * speed,
          y: tow.velocity.y * 0.2 + Math.sin(angle) * speed,
        },
        color: index % 3 === 0 ? "#73d2ff" : "#ffd36b",
        size: 1 + Math.random() * 2.2,
        life: 0.24 + Math.random() * 0.34,
        maxLife: 0.58,
      });
    }
  }

  createTowCutterSparks(tow, asteroid) {
    const angleToRock = Math.atan2(asteroid.position.y - tow.position.y, asteroid.position.x - tow.position.x);

    for (let index = 0; index < 22; index += 1) {
      const progress = index / 22;
      const sprayAngle = angleToRock + (Math.random() - 0.5) * 0.65;
      const speed = 70 + Math.random() * 170;

      this.particles.push({
        type: "spark",
        position: {
          x: tow.position.x + (asteroid.position.x - tow.position.x) * progress,
          y: tow.position.y + (asteroid.position.y - tow.position.y) * progress,
        },
        velocity: {
          x: Math.cos(sprayAngle) * speed,
          y: Math.sin(sprayAngle) * speed,
        },
        color: index % 4 === 0 ? "#73d2ff" : "#ffd36b",
        size: 1 + Math.random() * 2,
        life: 0.16 + Math.random() * 0.2,
        maxLife: 0.36,
      });
    }
  }

  createDockTetherBreakSparks(site, normalX, normalY) {
    const midpointX = (this.ship.position.x + site.position.x) / 2;
    const midpointY = (this.ship.position.y + site.position.y) / 2;

    for (let index = 0; index < 34; index += 1) {
      const angle = Math.atan2(normalY, normalX) + (Math.random() - 0.5) * 2.5;
      const speed = 100 + Math.random() * 260;

      this.particles.push({
        type: "spark",
        position: {
          x: midpointX + (Math.random() - 0.5) * 28,
          y: midpointY + (Math.random() - 0.5) * 28,
        },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        color: index % 4 === 0 ? "#73d2ff" : index % 2 === 0 ? "#ffd36b" : "#ffffff",
        size: 1 + Math.random() * 2.4,
        life: 0.28 + Math.random() * 0.42,
        maxLife: 0.7,
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
      const drag = particle.drag ?? PARTICLE_DRAG;
      particle.velocity.x *= drag;
      particle.velocity.y *= drag;
      particle.position.x += particle.velocity.x * deltaSeconds;
      particle.position.y += particle.velocity.y * deltaSeconds;
    });

    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  updateSiteDefenseBeams(deltaSeconds) {
    this.siteDefenseBeams.forEach((beam) => {
      beam.life -= deltaSeconds;
    });

    this.siteDefenseBeams = this.siteDefenseBeams.filter((beam) => beam.life > 0);
  }

  collectPickups() {
    const collectedPickups = new Set();

    this.pickups.forEach((pickup) => {
      if (!circlesOverlap(this.ship.position, PICKUP_COLLECT_RADIUS, pickup.position, pickup.radius)) {
        return;
      }

      collectedPickups.add(pickup);
      this.state.ledger.recordEvent(
        "resource.collected",
        {
          resourceType: pickup.type,
          amount: 1,
          x: Math.round(pickup.position.x),
          y: Math.round(pickup.position.y),
        },
        { visible: false },
      );
      this.onResourceCollected(pickup.type);
      this.audio?.playPickup(pickup.type);
    });

    if (collectedPickups.size === 0) {
      return;
    }

    this.pickups = this.pickups.filter((pickup) => !collectedPickups.has(pickup));
  }

  draw() {
    const drawCamera = this.getShakenCamera();

    clearScreen(this.context, this.canvas);
    drawGrid(this.context, this.canvas, drawCamera);
    this.drawWorldSites(drawCamera);
    this.drawSiteDefenseBeams(drawCamera);
    this.asteroids.forEach((asteroid) => {
      if (isVisible(asteroid, this.canvas, drawCamera)) {
        asteroid.draw(this.context, drawCamera);
      }
    });
    this.lifeforms.forEach((lifeform) => {
      if (isVisible(lifeform, this.canvas, drawCamera)) {
        lifeform.draw(this.context, drawCamera);
      }
    });
    this.npcShips.forEach((ship) => {
      if (isVisible(ship, this.canvas, drawCamera)) {
        ship.draw(this.context, drawCamera);
      }
    });
    this.drawEmergencyTow(drawCamera);
    this.pickups.forEach((pickup) => {
      if (isVisible(pickup, this.canvas, drawCamera)) {
        pickup.draw(this.context, drawCamera);
      }
    });
    this.drawParticles(drawCamera);
    this.drawCollectorField(drawCamera);
    this.bullets.forEach((bullet) => bullet.draw(this.context, drawCamera));
    drawVector(this.context, this.ship.position, this.ship.velocity, drawCamera);
    this.scanner.draw(this.context, drawCamera, this.ship);
    this.ship.draw(this.context, drawCamera);
    this.drawDamageFlash();
    this.drawViewportTitle();
  }

  drawEmergencyTow(camera = this.camera) {
    if (!this.activeTow) {
      return;
    }

    const tow = this.activeTow;
    const screenX = tow.position.x - camera.x;
    const screenY = tow.position.y - camera.y;

    this.context.save();

    if (tow.phase === "return") {
      const shipX = this.ship.position.x - camera.x;
      const shipY = this.ship.position.y - camera.y;
      const flow = (tow.pulse * 1.9) % 1;
      const lightX = shipX + (screenX - shipX) * flow;
      const lightY = shipY + (screenY - shipY) * flow;

      this.context.strokeStyle = "rgba(255, 211, 107, 0.64)";
      this.context.lineWidth = 2;
      this.context.setLineDash([7, 8]);
      this.context.beginPath();
      this.context.moveTo(shipX, shipY);
      this.context.lineTo(screenX, screenY);
      this.context.stroke();
      this.context.setLineDash([]);
      this.context.fillStyle = "#ffd36b";
      this.context.fillRect(lightX - 3, lightY - 3, 6, 6);
    }

    this.context.translate(screenX, screenY);
    this.context.rotate(tow.heading);
    this.context.strokeStyle = "#ffd36b";
    this.context.fillStyle = "rgba(255, 211, 107, 0.16)";
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.moveTo(28, 0);
    this.context.lineTo(-13, -15);
    this.context.lineTo(-7, 0);
    this.context.lineTo(-13, 15);
    this.context.closePath();
    this.context.fill();
    this.context.stroke();
    this.context.strokeStyle = "rgba(158, 232, 255, 0.72)";
    this.context.strokeRect(-31, -10, 16, 20);
    this.context.restore();
  }

  drawWorldSites(camera = this.camera) {
    this.worldSites.forEach((site) => {
      const screenX = site.position.x - camera.x;
      const screenY = site.position.y - camera.y;
      const isNearby = this.nearbySite?.id === site.id;
      const isDocked = this.dockedSite?.id === site.id;

      if (
        screenX < -site.interactionRadius ||
        screenX > this.canvas.width + site.interactionRadius ||
        screenY < -site.interactionRadius ||
        screenY > this.canvas.height + site.interactionRadius
      ) {
        return;
      }

      this.context.save();
      this.context.translate(screenX, screenY);
      this.context.strokeStyle = isDocked ? "#ffffff" : isNearby ? "#9ee8ff" : "#73d2ff";
      this.context.fillStyle = isDocked ? "rgba(255, 255, 255, 0.14)" : "rgba(115, 210, 255, 0.08)";
      this.context.lineWidth = isNearby ? 3 : 2;
      this.context.beginPath();
      this.context.arc(0, 0, site.radius, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.context.rotate(Math.PI / 4);
      this.context.strokeRect(-site.radius * 0.52, -site.radius * 0.52, site.radius * 1.04, site.radius * 1.04);
      this.context.restore();

      this.context.save();
      this.context.strokeStyle = isNearby ? "rgba(158, 232, 255, 0.34)" : "rgba(115, 210, 255, 0.13)";
      this.context.lineWidth = 1;
      this.context.beginPath();
      this.context.arc(screenX, screenY, site.interactionRadius, 0, Math.PI * 2);
      this.context.stroke();

      if (isNearby) {
        const shipX = this.ship.position.x - camera.x;
        const shipY = this.ship.position.y - camera.y;
        this.context.strokeStyle = isDocked ? "rgba(255, 255, 255, 0.78)" : "rgba(158, 232, 255, 0.46)";
        this.context.setLineDash([8, 8]);
        this.context.beginPath();
        this.context.moveTo(shipX, shipY);
        this.context.lineTo(screenX, screenY);
        this.context.stroke();
      }

      this.context.restore();
    });
  }

  drawSiteDefenseBeams(camera = this.camera) {
    this.siteDefenseBeams.forEach((beam) => {
      const alpha = Math.max(0, beam.life / beam.maxLife);
      const startX = beam.start.x - camera.x;
      const startY = beam.start.y - camera.y;
      const endX = beam.end.x - camera.x;
      const endY = beam.end.y - camera.y;

      this.context.save();
      this.context.globalAlpha = alpha;
      this.context.strokeStyle = "#9ee8ff";
      this.context.lineWidth = 3;
      this.context.beginPath();
      this.context.moveTo(startX, startY);
      this.context.lineTo(endX, endY);
      this.context.stroke();
      this.context.strokeStyle = "rgba(255, 255, 255, 0.85)";
      this.context.lineWidth = 1;
      this.context.beginPath();
      this.context.moveTo(startX, startY);
      this.context.lineTo(endX, endY);
      this.context.stroke();
      this.context.restore();
    });
  }

  drawViewportTitle() {
    if (this.viewportTitleTimer <= 0 || !this.viewportTitle) {
      return;
    }

    const duration = this.viewportTitle.kind === "dock" ? DOCK_MESSAGE_SECONDS : VIEWPORT_TITLE_SECONDS;
    const fade = Math.min(1, this.viewportTitleTimer / 0.55, (duration - this.viewportTitleTimer) / 0.5);
    const width = this.viewportTitle.kind === "dock" ? 300 : 340;
    const height = this.viewportTitle.kind === "dock" ? 78 : 112;
    const x = this.viewportTitle.side === "right" ? this.canvas.width - width - 24 : 24;
    const y = this.canvas.height * 0.17;
    const titleSize = this.viewportTitle.kind === "dock" ? 21 : 32;

    this.context.save();
    this.context.globalAlpha = Math.max(0, fade);
    this.context.fillStyle = "rgba(7, 8, 12, 0.28)";
    this.context.fillRect(x, y, width, height);
    this.context.strokeStyle = "rgba(158, 232, 255, 0.54)";
    this.context.beginPath();
    this.context.moveTo(x, y);
    this.context.lineTo(x + width * 0.82, y);
    this.context.stroke();
    this.context.fillStyle = "#ffffff";
    this.context.font = `${titleSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
    this.context.textAlign = "left";
    this.context.fillText(this.viewportTitle.title, x + 18, y + 36);
    this.context.fillStyle = "#9ee8ff";
    this.context.font = "13px Inter, ui-sans-serif, system-ui, sans-serif";
    this.context.fillText(this.viewportTitle.subtitle, x + 20, y + 70);
    this.context.restore();
  }

  drawDamageFlash() {
    if (this.damageFlashAlpha <= 0) {
      return;
    }

    const alpha = Math.min(MAX_DAMAGE_FLASH_ALPHA, this.damageFlashAlpha);

    this.context.save();
    this.context.fillStyle = `rgba(255, 34, 58, ${alpha})`;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.strokeStyle = `rgba(255, 92, 108, ${Math.min(0.85, alpha * 1.8)})`;
    this.context.lineWidth = 8;
    this.context.strokeRect(4, 4, this.canvas.width - 8, this.canvas.height - 8);
    this.context.restore();
  }

  drawParticles(camera = this.camera) {
    this.particles.forEach((particle) => {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      const screenX = particle.position.x - camera.x;
      const screenY = particle.position.y - camera.y;

      this.context.save();
      this.context.globalAlpha = alpha;
      this.context.fillStyle = particle.color;
      this.context.translate(screenX, screenY);

      if (particle.type === "spark") {
        this.context.fillRect(-particle.size * 1.5, -particle.size / 2, particle.size * 3, particle.size);
      } else if (particle.type === "cargo-packet") {
        this.context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
        this.context.strokeStyle = "rgba(255, 255, 255, 0.82)";
        this.context.lineWidth = 1;
        this.context.strokeRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      } else {
        this.context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      }

      this.context.restore();
    });
  }

  drawCollectorField(camera = this.camera) {
    if (!this.isCollectorActive()) {
      return;
    }

    const screenX = this.ship.position.x - camera.x;
    const screenY = this.ship.position.y - camera.y;

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
      this.state.components.collector.isActive &&
      this.state.components.scanner.scanergy > 0
    );
  }

  getCollectorRadius() {
    return Math.min(this.canvas.width, this.canvas.height) * 0.48;
  }
}

function isNearSimulationArea(entity, canvas, camera, ship, margin) {
  // The simulation bubble follows both the camera and the ship. This catches
  // fast movement where the ship might outrun the camera's spring for a moment.
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

  const distanceToShip = distance(entity.position, ship.position);

  return distanceToShip < margin * 1.8 + radius;
}

function distance(firstPosition, secondPosition) {
  return Math.hypot(firstPosition.x - secondPosition.x, firstPosition.y - secondPosition.y);
}

function getRelativeSpeed(firstBody, secondBody) {
  return Math.hypot(firstBody.velocity.x - secondBody.velocity.x, firstBody.velocity.y - secondBody.velocity.y);
}

function dotProduct(firstVector, secondVector) {
  return firstVector.x * secondVector.x + firstVector.y * secondVector.y;
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y) || 1;

  return {
    x: x / length,
    y: y / length,
  };
}

function getTowAvoidance(tow, asteroids) {
  const force = { x: 0, y: 0 };
  const forward = normalizeVector(tow.velocity.x, tow.velocity.y);
  const feeler = {
    x: tow.position.x + forward.x * 120,
    y: tow.position.y + forward.y * 120,
  };
  let count = 0;

  asteroids.forEach((asteroid) => {
    const safeRadius = asteroid.radius + 145;
    const distanceToTow = distance(tow.position, asteroid.position);
    const distanceToFeeler = distance(feeler, asteroid.position);
    const nearestDistance = Math.min(distanceToTow, distanceToFeeler);

    if (nearestDistance > safeRadius) {
      return;
    }

    const strength = ((safeRadius - Math.max(1, nearestDistance)) / safeRadius) ** 1.35;
    const away = normalizeVector(tow.position.x - asteroid.position.x, tow.position.y - asteroid.position.y);
    const side = {
      x: -forward.y,
      y: forward.x,
    };

    force.x += away.x * strength * 0.55 + side.x * strength * 0.75;
    force.y += away.y * strength * 0.55 + side.y * strength * 0.75;
    count += 1;
  });

  if (count === 0) {
    return force;
  }

  return normalizeVector(force.x / count, force.y / count);
}

function getTowObstacle(tow, asteroids) {
  const forward = normalizeVector(tow.velocity.x, tow.velocity.y);
  let bestObstacle = null;
  let bestProjection = Infinity;

  asteroids.forEach((asteroid) => {
    const offsetX = asteroid.position.x - tow.position.x;
    const offsetY = asteroid.position.y - tow.position.y;
    const projection = offsetX * forward.x + offsetY * forward.y;

    if (projection < 42 || projection > TOW_CUTTER_RANGE || projection >= bestProjection) {
      return;
    }

    const closestX = tow.position.x + forward.x * projection;
    const closestY = tow.position.y + forward.y * projection;
    const laneDistance = Math.hypot(asteroid.position.x - closestX, asteroid.position.y - closestY);

    if (laneDistance > asteroid.radius + 58) {
      return;
    }

    bestObstacle = asteroid;
    bestProjection = projection;
  });

  return bestObstacle;
}

function getTowDropoffPosition(site, shipPosition) {
  const awayFromHub = normalizeVector(shipPosition.x - site.position.x, shipPosition.y - site.position.y);

  return {
    x: site.position.x + awayFromHub.x * Math.min(site.interactionRadius * 0.72, site.radius + 80),
    y: site.position.y + awayFromHub.y * Math.min(site.interactionRadius * 0.72, site.radius + 80),
  };
}

function getTowRunnerTarget(site, dropoffPosition) {
  const towardHub = normalizeVector(site.position.x - dropoffPosition.x, site.position.y - dropoffPosition.y);

  return {
    x: dropoffPosition.x + towardHub.x * TOW_LINE_LENGTH,
    y: dropoffPosition.y + towardHub.y * TOW_LINE_LENGTH,
  };
}

function lerpAngle(from, to, amount) {
  let difference = to - from;

  while (difference > Math.PI) {
    difference -= Math.PI * 2;
  }

  while (difference < -Math.PI) {
    difference += Math.PI * 2;
  }

  return from + difference * amount;
}

function circlesOverlap(firstPosition, firstRadius, secondPosition, secondRadius) {
  const distanceX = firstPosition.x - secondPosition.x;
  const distanceY = firstPosition.y - secondPosition.y;
  const radius = firstRadius + secondRadius;

  return distanceX * distanceX + distanceY * distanceY <= radius * radius;
}

function isInViewport(entity, canvas, camera, radius = entity.radius ?? 0) {
  const screenX = entity.position.x - camera.x;
  const screenY = entity.position.y - camera.y;

  return screenX >= -radius && screenX <= canvas.width + radius && screenY >= -radius && screenY <= canvas.height + radius;
}

function getEntityStoryId(entity) {
  if (entity.id) {
    return entity.id;
  }

  const origin = entity.origin ?? entity.position;

  return `${Math.round(origin.x)}:${Math.round(origin.y)}:${Math.round(entity.radius ?? 0)}`;
}

function getSiteSubtitle(site) {
  if (site.capabilities.includes("repair")) {
    return "repair beacon acquired";
  }

  return `${site.type} signal acquired`;
}

function getTitleSideForPosition(shipPosition, targetPosition) {
  return targetPosition.x >= shipPosition.x ? "left" : "right";
}

function getAsteroidResourceType(asteroid) {
  if (asteroid.color === WHITE_ASTEROID_COLOR) {
    return "common";
  }

  const dominantResource = Object.entries(asteroid.resources)
    .filter(([resource]) => resource !== "stone")
    .reduce((best, [resource, amount]) => (amount > best.amount ? { resource, amount } : best), {
      resource: null,
      amount: 0,
    }).resource;

  if (!dominantResource) {
    return "unknown";
  }

  return dominantResource === "iron" ? "fuel" : "crystal";
}
