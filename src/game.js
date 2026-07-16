import { Bullet } from "./entities/Bullet.js?v=fresh-20260715-2022-moss-finance-v1";
import { breakAsteroid, WHITE_ASTEROID_COLOR } from "./entities/Asteroid.js?v=fresh-20260715-2022-moss-finance-v1";
import { createResourcePickupsFromAsteroid, ResourcePickup } from "./entities/ResourcePickup.js?v=fresh-20260715-2022-moss-finance-v1";
import { Ship } from "./entities/Ship.js?v=fresh-20260715-2022-moss-finance-v1";
import { createAsteroidChunks } from "./systems/asteroidField.js?v=fresh-20260715-2022-moss-finance-v1";
import { createCamera } from "./systems/camera.js";
import { createInput } from "./systems/input.js?v=fresh-20260715-2022-moss-finance-v1";
import { createHunterNearShip, createHunterRespawn, createLifeField } from "./systems/lifeField.js?v=fresh-20260715-2022-moss-finance-v1";
import { createNpcRouteShips } from "./systems/npcRoutes.js?v=fresh-20260715-2022-moss-finance-v1";
import { clearScreen, drawGrid, drawVector, isVisible } from "./systems/rendering.js?v=fresh-20260715-2022-moss-finance-v1";
import { createResourceField } from "./systems/resourceField.js?v=fresh-20260715-2022-moss-finance-v1";
import { createScanner } from "./systems/scanner.js?v=fresh-20260715-2022-moss-finance-v1";
import { createDriftMouthField } from "./systems/driftMouthField.js?v=fresh-20260715-2022-moss-finance-v1";
import { createThreadwyrmField } from "./systems/threadwyrmField.js?v=fresh-20260715-2022-moss-finance-v1";
import { recordVisitedZone } from "./systems/legalRecords.js?v=fresh-20260715-2022-moss-finance-v1";
import { inspectPublicIdentity } from "./systems/authorityInspections.js?v=fresh-20260715-2022-moss-finance-v1";
import { getRegistryEntityIdForSite, getRegistrySubject, rememberRegistrySubject } from "./systems/entityRegistry.js?v=fresh-20260715-2022-moss-finance-v1";
import { createControlledShipPublicIdentity, createNpcShipPublicIdentity } from "./systems/publicIdentity.js?v=fresh-20260715-2022-moss-finance-v1";
import { getZoneProfile, WORLD_ZONES, getZoneInfluence } from "./systems/worldZones.js?v=fresh-20260715-2022-moss-finance-v1";
import { createClaimField } from "./systems/claimField.js?v=fresh-20260715-2022-moss-finance-v1";
import { getNearbyWorldSite, getNearestWorldSite, getWorldSites, isInSiteRange } from "./systems/worldSites.js?v=fresh-20260715-2022-moss-finance-v1";
import { createGameState } from "./state/gameState.js?v=fresh-20260715-2022-moss-finance-v1";
import { canSpendCredits, debitCredits, getCredits, spendCredits } from "./systems/accounts.js?v=fresh-20260715-2022-moss-finance-v1";

// Game is the main simulation coordinator for the viewport canvas. It owns world
// objects, advances gameplay rules, then reports display-ready state back to
// main.js so the page panels can stay dumb and component-like.
// Cargo transfer trail color per resource family (volatile = blue, strange = purple, else orange).
const CARGO_TRAIL_COLOR = {
  "water-ice":      "#b8eaff",
  "methane-ice":    "#d0f0a0",
  "hydrogen":       "#fffdc0",
  "crystal-matrix": "#de6fff",
  "anomaly-shard":  "#ff3080",
};

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
const TOW_CABLE_MAX_LENGTH = 650;
const TOW_CABLE_MIN_LENGTH = 58;
const TOW_CABLE_HOOK_SPEED = 520;
const TOW_CABLE_REEL_SPEED = 210;
const TOW_CABLE_STIFFNESS = 2.9;
const TOW_CABLE_ASTEROID_PULL = 0.42;
const TOW_CABLE_HOOK_RADIUS = 8;
const MOSS_HARVESTER_INTAKE_RADIUS = 96;
const MOSS_HARVESTER_PROCESS_SECONDS = 3.8;
const PATROL_APPROACH_SPEED = 145;
const PATROL_DRIFT_SPEED = 58;
const PATROL_RETURN_SPEED = 88;
const PATROL_DEPART_SPEED = 180;
const PATROL_HOLD_DISTANCE = 112;
const PATROL_DEPART_DISTANCE = 980;
const PATROL_ORBIT_SPEED = 0.4;
const PATROL_ORBIT_RADIUS = 112;
const PATROL_TRANSIT_RADIUS_FACTOR = 1.6;
const HUB_SENSOR_RADIUS_MULTIPLIER = 2;
const PATROL_SCAN_SECONDS = 1.35;
const PATROL_TETHER_DAMPING = 0.88;
const PATROL_WAYPOINT_COUNT = 8;
const PATROL_WAYPOINT_RADIUS_FACTOR = 3.5;
const PATROL_WAYPOINT_REACH_DIST = 120;
const PATROL_WAYPOINT_DWELL_SECONDS = 2.4;
const PATROL_PASSIVE_SCAN_RANGE = 250;
const PATROL_PASSIVE_SCAN_INTERVAL = 2.2;
const PATROL_FLAGGED_DISMISS_SECONDS = 3.2;
const SCAN_RING_MAX_RADIUS = 130;
const SCAN_RING_DURATION = 1.4;
const PATROL_FLYBY_CHECK_INTERVAL = 8;
const PATROL_FLYBY_RANGE = 900;
const PATROL_FLYBY_SCAN_DIST = 180;
const PATROL_CREATE_RANGE_FACTOR = 4.2;
const SKITTER_WEB_TUG_RADIUS = 28;
const SKITTER_WEB_DAMPING = 0.78;
const SKITTER_WEB_PULL = 135;
const SKITTER_WEB_COOLDOWN_SECONDS = 1.1;
const LIFE_DISTURBANCE_WEAPON_RADIUS = 720;
const LIFE_DISTURBANCE_SCAN_RADIUS = 1050;
const LIFE_DISTURBANCE_SECONDS = 1.35;
const LIFEFORM_CONTACT_RANGES = {
  rockmoss: 150,
  lantern: 160,
  skitter: 175,
  threadwyrm: 210,
  "drift-mouth": 720,
};
const ROCKMOSS_CRAWLER_TYPE = "rockmoss-crawler";
const ROCKMOSS_WORK_DISTANCE_PER_PATCH = 170;
const ROCKMOSS_MIN_PATCHES = 1;

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
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    this.state = state;
    if (!this.state.components.towCable) {
      this.state.components.towCable = {
        installed: false,
        status: "Idle",
        lineLength: 0,
        maxLength: TOW_CABLE_MAX_LENGTH,
      };
    }
    if (!this.state.components.mossHarvester) {
      this.state.components.mossHarvester = {
        installed: false,
        deployed: false,
        status: "Stored",
        food: 0,
        intakeProgress: 0,
        intakeRadius: MOSS_HARVESTER_INTAKE_RADIUS,
        position: null,
      };
    }
    this.onHudChange = onHudChange;
    this.onResourceCollected = onResourceCollected;
    this.onDebugChange = onDebugChange;
    this.onSiteChange = onSiteChange;
    this.audio = audio;
    this.onLogicUpdate = onLogicUpdate;
    this.logicAccumulator = 0;
    this.input = createInput();
    this.camera = createCamera(canvas);
    this.scanner = createScanner(canvas);
    this.ship = new Ship(0, 0, state.components.engine, state.ship);
    this.resourceField = createResourceField();
    this.claimField = createClaimField();
    this._claimCanvas = null;
    this._claimCtx = null;
    this._claimImageData = null;
    this._claimCamKey = null;
    this.worldSites = getWorldSites();
    this.chunkManager = createAsteroidChunks(canvas, this.resourceField);
    const { added: initialAsteroids } = this.chunkManager.update(0, 0);
    this.asteroids = initialAsteroids;
    this.lifeforms = createLifeField(this.asteroids);
    this.threadwyrms = createThreadwyrmField(this.asteroids);
    this.driftMouths = createDriftMouthField();
    this.lifeDisturbances = [];
    this.lifeformContacts = new Set();
    this.npcShips = createNpcRouteShips(this.worldSites);
    this.bullets = [];
    this.particles = [];
    this.siteDefenseBeams = [];
    this.pickups = [];
    this.fireCooldown = 0;
    this.shipHitCooldown = 0;
    this.skitterWebCooldown = 0;
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
    this.tetherStrainCooldown = 0;
    this.hubInspectionCache = new Set();
    this.hubPatrolEnabled = true;
    this.scanRings = [];
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
    this.frameErrorLog = {
      update: false,
      draw: false,
    };
    this.activeTow = null;
    this.towCable = {
      phase: "idle",
      hookPosition: null,
      hookVelocity: { x: 0, y: 0 },
      anchor: null,
      lineLength: 0,
      control: "hold",
      pulse: 0,
    };
    this.activePatrolIntercept = null;
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

  cycleBeacon() {
    const locator = this.state.components.beaconLocator;

    if (this.shipDestroyed || !locator.installed) {
      return;
    }

    const rememberedTargets = this.getBeaconTargets();

    if (rememberedTargets.length === 0) {
      return;
    }

    if (locator.beaconLocatorUsed) {
      const currentIndex = Math.max(0, rememberedTargets.findIndex((target) => target.id === locator.activeBeaconId));
      const nextIndex = (currentIndex + 1) % rememberedTargets.length;
      locator.activeBeaconId = rememberedTargets[nextIndex].id;
    } else if (!rememberedTargets.some((target) => target.id === locator.activeBeaconId)) {
      locator.activeBeaconId = rememberedTargets[0].id;
    }

    locator.beaconLocatorUsed = true;
    const activeBeacon = this.getBeaconTarget(locator.activeBeaconId);
    this.audio?.playScanner();
    this.state.ledger.recordEvent(
      "beaconLocator.used",
      {
        beaconId: activeBeacon?.beaconId ?? locator.activeBeaconId,
        siteId: activeBeacon?.siteId ?? activeBeacon?.id ?? locator.activeBeaconId,
        siteName: activeBeacon?.name ?? "Unknown beacon",
        x: Math.round(this.ship.position.x),
        y: Math.round(this.ship.position.y),
      },
      { visible: false },
    );
    this.onHudChange(this.state);
  }

  getBeaconTargets() {
    const locator = this.state.components.beaconLocator;
    const rememberedHubs = (locator.beaconMemoryIds ?? [])
      .map((siteId) => this.worldSites.find((site) => site.id === siteId && site.type === "hub"))
      .filter(Boolean)
      .map((site) => ({
        id: site.id,
        beaconId: site.beaconId ?? site.id,
        siteId: site.id,
        name: site.name,
        position: site.position,
        type: "hub",
      }));
    const personalBeacons = this.getDeployedPersonalBeacons();
    const contractBeacons = this.getContractClaimTargets()
      .map((target) => ({
        id: target.beaconId,
        beaconId: target.beaconId,
        name: target.name,
        position: target.position,
        type: "contract-claim",
        contractId: target.contractId,
        claimId: target.claimId,
        claimIds: target.claimIds,
      }));
    const ecologyBeacons = (locator.ecologyBeacons ?? [])
      .filter((target) => target?.position)
      .map((target) => ({
        id: target.id,
        beaconId: target.beaconId ?? target.id,
        name: target.name,
        position: target.position,
        type: "ecology",
        ecologyType: target.ecologyType,
      }));

    return [...rememberedHubs, ...personalBeacons, ...contractBeacons, ...ecologyBeacons];
  }

  getBeaconTarget(beaconId) {
    return this.getBeaconTargets().find((target) => target.id === beaconId) ?? null;
  }

  getDeployedPersonalBeacons() {
    return (this.state.components.beaconBay?.bays ?? [])
      .filter((bay) => bay.status === "deployed" && bay.position)
      .map((bay, index) => ({
        id: bay.beaconId ?? `personal-beacon-${index + 1}`,
        beaconId: bay.beaconId ?? `personal-beacon-${index + 1}`,
        name: bay.name ?? `Drop Beacon ${index + 1}`,
        position: bay.position,
        type: "personal",
        bayIndex: index,
      }));
  }

  createEcologyBeaconTargets() {
    const targets = [];
    const addTarget = (id, name, ecologyType, position) => {
      if (!position) {
        return;
      }

      targets.push({
        id,
        beaconId: id,
        name,
        ecologyType,
        position: {
          x: Math.round(position.x),
          y: Math.round(position.y),
        },
      });
    };

    const rockmossAsteroid = this.asteroids.find((asteroid) => asteroid.rockmoss);
    const lantern = this.lifeforms.find((lifeform) => lifeform.type === "lantern");
    const skitter = this.lifeforms.find((lifeform) => lifeform.type === "skitter");
    const threadwyrm = this.threadwyrms[0];
    const driftMouth = this.driftMouths[0];

    addTarget("ecology-rockmoss", "Rockmoss Colony", "rockmoss", rockmossAsteroid?.position);
    addTarget("ecology-lanterns", "Lantern Drift", "lantern", lantern?.position);
    addTarget("ecology-skitterweb", "Skitterweb Run", "skitter", skitter?.position);
    addTarget("ecology-threadwyrm", "Threadwyrm Track", "threadwyrm", threadwyrm?.position);
    addTarget("ecology-drift-mouth", "Drift Mouth", "drift-mouth", driftMouth?.position);

    return targets;
  }

  getContractClaimTargets() {
    const records = Object.values(this.state.contracts?.records ?? {});
    const targets = [];

    records
      .filter((contract) => contract.status === "active" && contract.terms?.sourceClaimIds?.length)
      .forEach((contract) => {
        const claims = contract.terms.sourceClaimIds
          .map((claimId) => this.claimField.getClaimOrPlotById(claimId))
          .filter(Boolean);
        const claimGroups = groupNearbyClaims(claims);

        claimGroups.forEach((group, index) => {
          const groupLabel = contract.terms.sourceClaimLabel ?? contract.title;
          const name = claimGroups.length > 1 ? `${groupLabel} ${index + 1}` : groupLabel;

          targets.push({
            contractId: contract.id,
            claimId: group[0]?.id,
            claimIds: group.map((claim) => claim.id),
            beaconId: `contract-${contract.id}-claim-group-${index + 1}`,
            name,
            position: getClaimsCenter(group),
            claims: group,
            claim: group[0],
          });
        });
      });

    return targets;
  }

  syncContractBeaconTarget(contract) {
    if (!this.state.components.beaconLocator?.installed || contract?.status !== "active") {
      return;
    }

    const targets = this.getContractClaimTargets().filter((candidate) => candidate.contractId === contract.id);
    if (targets.length === 0) {
      return;
    }

    const locator = this.state.components.beaconLocator;
    locator.syncedContractIds ??= [];
    if (locator.syncedContractIds.includes(contract.id)) {
      return;
    }

    const activeBeaconId = this.state.components.beaconLocator.activeBeaconId;
    if (targets.some((target) => target.beaconId === activeBeaconId)) {
      locator.syncedContractIds.push(contract.id);
      return;
    }

    locator.activeBeaconId = targets[0].beaconId;
    locator.syncedContractIds.push(contract.id);
  }

  rememberHubBeacon(siteId) {
    const locator = this.state.components.beaconLocator;
    const site = this.worldSites.find((candidate) => candidate.id === siteId && candidate.type === "hub");

    if (!locator?.installed || !site) {
      return false;
    }

    locator.beaconMemoryIds ??= [];
    if (!locator.beaconMemoryIds.includes(site.id)) {
      locator.beaconMemoryIds.push(site.id);
    }

    if (!this.getBeaconTarget(locator.activeBeaconId)) {
      locator.activeBeaconId = site.id;
    }

    this.state.ledger.recordEvent("beaconLocator.hubRemembered", {
      siteId: site.id,
      siteName: site.name,
      beaconId: site.beaconId ?? site.id,
    });
    this.onHudChange(this.state);
    return true;
  }

  deployBeaconFromBay(bayIndex) {
    const bayState = this.state.components.beaconBay;
    const bay = bayState?.bays?.[bayIndex];

    if (this.shipDestroyed || !bayState?.installed || !bay || bay.status !== "stored") {
      return false;
    }

    bay.status = "deployed";
    bay.position = {
      x: Math.round(this.ship.position.x),
      y: Math.round(this.ship.position.y),
    };
    bay.name = `Drop Beacon ${bayIndex + 1}`;
    bayState.recovery = null;
    this.state.components.beaconLocator.activeBeaconId = bay.beaconId;
    this.audio?.playPanelReveal();
    this.state.ledger.recordEvent(
      "beacon.deployed",
      {
        beaconId: bay.beaconId,
        bayIndex,
        x: bay.position.x,
        y: bay.position.y,
      },
      { visible: true },
    );
    this.onHudChange(this.state);
    return true;
  }

  triggerResourceScan() {
    const scannerState = this.state.components.scanner;
    const SCAN_COST = 50;

    if (this.shipDestroyed || !scannerState.installed || scannerState.scanergy < SCAN_COST) {
      return;
    }

    scannerState.scanergy = Math.max(0, scannerState.scanergy - SCAN_COST);
    this.scanner.scan(this.ship, this.asteroids, this.worldSites, { targets: scannerState.targets ?? ["resources"] });
    this.addLifeDisturbance("scanner", this.ship.position, LIFE_DISTURBANCE_SCAN_RADIUS, 0.72);
    this.onHudChange(this.state);
  }

  frame(time) {
    const deltaSeconds = Math.min((time - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = time;

    this.logicAccumulator += deltaSeconds;

    try {
      this.update(deltaSeconds);
      if (this.logicAccumulator >= 0.05) {
        this.onLogicUpdate(this.state);
        this.logicAccumulator = 0;
      }
      this.frameErrorLog.update = false;
    } catch (error) {
      this.reportFrameError("update", error);
    }

    try {
      this.draw();
      this.frameErrorLog.draw = false;
    } catch (error) {
      this.reportFrameError("draw", error);
    }

    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  reportFrameError(phase, error) {
    if (this.frameErrorLog[phase]) {
      return;
    }

    this.frameErrorLog[phase] = true;
    console.error(`Game ${phase} failed; keeping animation loop alive.`, error);
  }

  update(deltaSeconds) {
    const directInputSuspended = this.isDirectShipInputSuspended();
    this.input.setGameInputSuspended(directInputSuspended);

    if (directInputSuspended || !this.state.components.engine.powered || this.shipDestroyed) {
      this.input.clearGameKeys({ includeDock: directInputSuspended });
      this.ship.stopThrusting();
    }
    this.updatePilotDebugMarker(directInputSuspended);

    this.fireCooldown = Math.max(0, this.fireCooldown - deltaSeconds);
    this.shipHitCooldown = Math.max(0, this.shipHitCooldown - deltaSeconds);
    this.viewportTitleTimer = Math.max(0, this.viewportTitleTimer - deltaSeconds);
    this.updateImpactFeedback(deltaSeconds);
    this.tetherStrainCooldown = Math.max(0, this.tetherStrainCooldown - deltaSeconds);
    const previousFuel = this.state.components.engine.fuel;
    const previousScanergy = this.state.components.scanner.scanergy;
    // Order matters: ship/world state is advanced first, then collisions and UI
    // readouts are derived from the updated world.
    this.ship.update(deltaSeconds, this.input);
    if (previousFuel > 0 && this.state.components.engine.fuel <= 0 && this.state.components.engine.powered) {
      this.setShipPowered(false);
    }
    this.updateBeaconRecovery(deltaSeconds);
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
    this.updateAsteroidChunks();
    this.asteroids.forEach((asteroid) => asteroid.update(deltaSeconds));
    this.updateTowCable(deltaSeconds);
    this.updateRockmossLifecycle(deltaSeconds);
    this.updateMossHarvester(deltaSeconds);
    this.updateHubDefenses(deltaSeconds);
    this.updateLifeDisturbances(deltaSeconds);
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
        disturbances: this.lifeDisturbances,
      });
    });
    this.activeLifeformCount = activeLifeforms.length;
    this.activeHunterCount = activeLifeforms.filter((lifeform) => lifeform.type === "hunter").length;
    this.updateSkitterWebHazards(activeLifeforms, deltaSeconds);
    this.updateHunterEnvironmentalHits(activeLifeforms, activeAsteroids, deltaSeconds);
    this.updateHunterHits();
    this.updateThreadwyrms(deltaSeconds);
    this.updateDriftMouths(deltaSeconds, activeLifeforms);
    this.updateLifeformContacts(activeLifeforms);
    this.updateNpcShips(activeAsteroids, deltaSeconds);
    this.updatePatrolIntercept(deltaSeconds);
    this.updateScanRings(deltaSeconds);
    this.updateEmergencyTow(deltaSeconds);
    this.updateNpcBulletHits();
    this.bullets = this.bullets.filter((bullet) => bullet.isAlive);
    this.lifeforms = this.lifeforms.filter((lifeform) => lifeform.isAlive);
    this.npcShips = this.npcShips.filter((ship) => ship.isAlive);
    this.pickups.forEach((pickup) => pickup.update(deltaSeconds));
    this.updateRockmossSpores();
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

  isDirectShipInputSuspended() {
    if (this.state.ledger.getSignal("actor.controlLocked") || this.state.ledger.getSignal("controlledShip.controlLocked")) {
      return true;
    }

    const patrolPhase = this.activePatrolIntercept?.phase;
    return patrolPhase === "standoff" || patrolPhase === "hold";
  }

  updatePilotDebugMarker(directInputSuspended) {
    const markerKey = this.input.wasPressed("KeyR")
      ? "R"
      : this.input.wasPressed("KeyT")
        ? "T"
        : null;

    if (!markerKey) {
      return;
    }

    const activeElement = document.activeElement;
    const inputSnapshot = this.input.getDebugSnapshot();
    const patrol = this.activePatrolIntercept;
    const tow = this.activeTow;

    this.state.ledger.recordEvent(
      "pilot.debugMarker",
      {
        markerKey,
        note: markerKey === "T" ? "tow/patrol/control anomaly" : "rogue input anomaly",
        activeElement: describeDebugElement(activeElement),
        documentHasFocus: document.hasFocus(),
        directInputSuspended,
        input: inputSnapshot,
        ship: {
          x: Math.round(this.ship.position.x),
          y: Math.round(this.ship.position.y),
          vx: Math.round(this.ship.velocity.x),
          vy: Math.round(this.ship.velocity.y),
          angle: Number(this.ship.angle.toFixed(3)),
          thrusting: this.ship.isThrusting,
          destroyed: this.shipDestroyed,
        },
        engine: {
          powered: this.state.components.engine.powered,
          fuel: Math.round(this.state.components.engine.fuel),
          powerLocked: Boolean(this.state.components.engine.powerLocked),
        },
        collector: {
          installed: Boolean(this.state.components.collector.installed),
          active: Boolean(this.state.components.collector.isActive),
        },
        controlSignals: {
          actorLocked: this.state.ledger.getSignal("actor.controlLocked"),
          shipLocked: this.state.ledger.getSignal("controlledShip.controlLocked"),
        },
        patrol: patrol
          ? {
              id: patrol.id,
              siteId: patrol.site?.id ?? null,
              phase: patrol.phase,
              hasScanned: Boolean(patrol.hasScanned),
            }
          : null,
        tow: tow
          ? {
              siteId: tow.site?.id ?? null,
              phase: tow.phase,
              cost: tow.cost,
            }
          : null,
        dockedSiteId: this.dockedSite?.id ?? null,
        nearbySiteId: this.nearbySite?.id ?? null,
      },
      { visible: true },
    );
  }

  updateBeaconRecovery(deltaSeconds) {
    const bayState = this.state.components.beaconBay;

    if (!bayState?.installed) {
      return;
    }

    const recoverable = this.getDeployedPersonalBeacons()
      .map((beacon) => ({
        ...beacon,
        distance: distance(this.ship.position, beacon.position),
      }))
      .filter((beacon) => beacon.distance <= 34)
      .sort((a, b) => a.distance - b.distance)[0];

    if (!recoverable) {
      if (bayState.recovery) {
        bayState.recovery = null;
        this.onHudChange(this.state);
      }
      return;
    }

    const recoverySeconds = bayState.recoverySeconds ?? 2.4;
    const currentRecovery = bayState.recovery?.bayIndex === recoverable.bayIndex
      ? bayState.recovery.elapsed ?? 0
      : 0;
    const elapsed = Math.min(recoverySeconds, currentRecovery + deltaSeconds);
    bayState.recovery = {
      bayIndex: recoverable.bayIndex,
      elapsed,
      progress: recoverySeconds > 0 ? elapsed / recoverySeconds : 1,
    };

    if (elapsed < recoverySeconds) {
      this.onHudChange(this.state);
      return;
    }

    const bay = bayState.bays[recoverable.bayIndex];
    bay.status = "stored";
    bay.position = null;
    bay.name = null;
    bayState.recovery = null;

    if (this.state.components.beaconLocator.activeBeaconId === bay.beaconId) {
      this.state.components.beaconLocator.activeBeaconId = this.getBeaconTargets()[0]?.id ?? null;
    }

    this.audio?.playPickup("beacon");
    this.state.ledger.recordEvent(
      "beacon.recovered",
      {
        beaconId: bay.beaconId,
        bayIndex: recoverable.bayIndex,
        x: Math.round(this.ship.position.x),
        y: Math.round(this.ship.position.y),
      },
      { visible: true },
    );
    this.onHudChange(this.state);
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
    if (this.ship.isThrusting && this.dockedSite && this.tetherStrainCooldown <= 0) {
      this.tetherStrainCooldown = 2.5;
      this.state.ledger.recordEvent(
        "site.tetherStrained",
        {
          siteId: this.dockedSite.id,
          siteName: this.dockedSite.name,
          siteType: this.dockedSite.type,
          x: Math.round(this.ship.position.x),
          y: Math.round(this.ship.position.y),
          speed: Math.round(Math.hypot(this.ship.velocity.x, this.ship.velocity.y)),
        },
        { visible: false },
      );
    }

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
          targetType: getHostileEnemyType(lifeform),
          targetName: lifeform.name ?? getHostileEnemyType(lifeform),
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
    if (site && this.activeTow?.site?.id === site.id) {
      this.completeEmergencyTow();
      return;
    }

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

  reviewShipRegistryAtHub(site, options = {}) {
    if (site.type !== "hub") {
      return;
    }

    const identity = options.identity ?? createControlledShipPublicIdentity(this.state);
    const result = this.inspectPublicTrafficIdentity(identity, site, options.inspector ?? {
      type: "hub",
      id: site.id,
      name: site.name,
    }, {
      completeFirstContact: true,
    });
    const report = result.paperworkReport ?? result;

    this.state.ledger.recordEvent(
      "ship.registryReviewed",
      report,
      { visible: false },
    );

    if ((report.unauthorizedZones ?? []).length > 0) {
      this.state.ledger.recordEvent(
        "legal.zoneFlag",
        {
          siteId: site.id,
          siteName: site.name,
          unauthorizedZones: report.unauthorizedZones,
          pilotLicenseId: report.pilotLicenseId,
        },
        { visible: true },
      );
    }
  }

  inspectPublicTrafficIdentity(identity, site, inspector, options = {}) {
    const registryEntityId = site ? getRegistryEntityIdForSite(site) : null;
    const wasKnownToRegistry = Boolean(
      registryEntityId && identity?.entityId && getRegistrySubject(this.state, {
        registryEntityId,
        subjectEntityId: identity.entityId,
      }),
    );
    const result = inspectPublicIdentity(this.state, { identity, site, inspector });
    const finalStatus = options.completeFirstContact && result.status === "needs-presentation"
      ? "cleared"
      : result.status;

    if (site && identity) {
      this.hubInspectionCache.add(getInspectionCacheKey(site, identity));
    }

    if (site && result.entityId && finalStatus !== "needs-presentation") {
      rememberRegistrySubject(this.state, {
        registryEntityId,
        subjectEntityId: result.entityId,
        status: finalStatus,
        disposition: finalStatus === "cleared" ? "cleared" : "flagged",
        source: inspector?.type ?? "inspection",
        data: {
          siteId: site.id,
          siteName: site.name,
          identityKind: result.identityKind,
          pilotEntityId: result.pilotEntityId,
          pilotLicenseId: result.pilotLicenseId,
          pilotName: result.pilotName,
          shipVin: result.shipVin,
          transponderStatus: result.transponderStatus,
          reasons: result.reasons,
        },
      });
    }

    this.state.ledger.recordEvent(
      "authority.inspectionCompleted",
      {
        status: finalStatus,
        reasons: result.reasons,
        inspector,
        siteId: site?.id ?? null,
        siteName: site?.name ?? null,
        wasKnownToRegistry,
        requiresPresentation: result.status === "needs-presentation" && !options.completeFirstContact,
        entityId: result.entityId,
        identityKind: result.identityKind,
        pilotEntityId: result.pilotEntityId,
        pilotLicenseId: result.pilotLicenseId,
        pilotName: result.pilotName,
        shipVin: result.shipVin,
        transponderStatus: result.transponderStatus,
      },
      { visible: false },
    );

    if (result.status === "needs-presentation" && !options.completeFirstContact) {
      this.state.ledger.recordEvent(
        "authority.identityRequested",
        {
          status: result.status,
          reasons: result.reasons,
          siteId: site?.id ?? null,
          siteName: site?.name ?? null,
          entityId: result.entityId,
          identityKind: result.identityKind,
          pilotLicenseId: result.pilotLicenseId,
          shipVin: result.shipVin,
          requiredDocuments: ["ship-vin", "pilot-license"],
        },
        { visible: false },
      );
    }

    if (finalStatus === "flagged" || finalStatus === "failed") {
      this.state.ledger.recordEvent(
        "authority.inspectionFlagged",
        {
          status: finalStatus,
          reasons: result.reasons,
          siteId: site?.id ?? null,
          siteName: site?.name ?? null,
          entityId: result.entityId,
          identityKind: result.identityKind,
          pilotLicenseId: result.pilotLicenseId,
          shipVin: result.shipVin,
        },
        { visible: true },
      );
    }

    return {
      ...result,
      status: finalStatus,
      wasKnownToRegistry,
      requiresPresentation: result.status === "needs-presentation" && !options.completeFirstContact,
    };
  }

  enableHubPatrol() {
    this.hubPatrolEnabled = true;
  }

  generatePatrolWaypoints(site) {
    const seed = site.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const count = PATROL_WAYPOINT_COUNT;
    const baseRadius = site.interactionRadius * PATROL_WAYPOINT_RADIUS_FACTOR;
    const waypoints = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + seed * 0.017;
      const r = baseRadius * (0.88 + ((seed + i * 37) % 12) * 0.018);
      waypoints.push({
        x: site.position.x + Math.cos(angle) * r,
        y: site.position.y + Math.sin(angle) * r,
      });
    }

    return waypoints;
  }

  nearestWaypointIndex(patrol) {
    let minDist = Infinity;
    let idx = 0;

    patrol.waypoints.forEach((wp, i) => {
      const d = distance(patrol.position, wp);
      if (d < minDist) {
        minDist = d;
        idx = i;
      }
    });

    return idx;
  }

  createHubPatrol(siteId) {
    const site = this.worldSites.find((worldSite) => worldSite.id === siteId);

    if (!site || this.activePatrolIntercept) {
      return false;
    }

    const waypoints = this.generatePatrolWaypoints(site);
    const seed = site.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const startIdx = seed % waypoints.length;
    const startWp = waypoints[startIdx];

    this.activePatrolIntercept = {
      id: `patrol-${site.id}`,
      name: `${site.name} Patrol`,
      site,
      reason: "ambient",
      phase: "drift",
      position: { x: startWp.x, y: startWp.y },
      velocity: { x: 0, y: 0 },
      heading: 0,
      pulse: 0,
      hasArrived: false,
      scanTimer: 0,
      hasScanned: false,
      orbitAngle: null,
      requiresManualClearance: false,
      departTarget: null,
      waypoints,
      waypointIndex: startIdx,
      waypointDwellTimer: 0,
      passiveScanTimer: 0,
      flaggedDismissTimer: 0,
      flybyTarget: null,
      flybyCheckTimer: 0,
      flybyHasScanned: false,
    };

    this.state.ledger.recordEvent(
      "patrol.dispatched",
      {
        patrolId: this.activePatrolIntercept.id,
        patrolName: this.activePatrolIntercept.name,
        siteId: site.id,
        siteName: site.name,
        reason: "ambient",
      },
      { visible: false },
    );

    return true;
  }

  spawnPatrolIntercept(siteId, reason = "arrival-clearance") {
    const site = this.worldSites.find((worldSite) => worldSite.id === siteId);

    if (!site) {
      return false;
    }

    // If patrol already exists for this hub, force it into intercept mode.
    if (this.activePatrolIntercept?.site?.id === site.id) {
      const patrol = this.activePatrolIntercept;

      if (patrol.phase === "drift" || patrol.phase === "return") {
        patrol.phase = "transit";
        patrol.reason = reason;
        patrol.requiresManualClearance = reason === "arrival-clearance";
        patrol.hasArrived = false;
        patrol.scanTimer = 0;
        patrol.hasScanned = false;
        patrol.orbitAngle = null;
      }

      return true;
    }

    if (this.activePatrolIntercept) {
      return false;
    }

    // No patrol yet — create one directly in transit mode.
    const waypoints = this.generatePatrolWaypoints(site);
    const directionToShip = normalizeVector(this.ship.position.x - site.position.x, this.ship.position.y - site.position.y);
    const side = { x: -directionToShip.y, y: directionToShip.x };
    const startDistance = Math.max(site.interactionRadius + 260, 500);
    const position = {
      x: site.position.x + directionToShip.x * startDistance + side.x * 160,
      y: site.position.y + directionToShip.y * startDistance + side.y * 160,
    };

    this.activePatrolIntercept = {
      id: `patrol-${site.id}`,
      name: `${site.name} Patrol`,
      site,
      reason,
      phase: "transit",
      position,
      velocity: {
        x: directionToShip.x * PATROL_APPROACH_SPEED,
        y: directionToShip.y * PATROL_APPROACH_SPEED,
      },
      heading: Math.atan2(directionToShip.y, directionToShip.x),
      pulse: 0,
      hasArrived: false,
      scanTimer: 0,
      hasScanned: false,
      orbitAngle: null,
      requiresManualClearance: reason === "arrival-clearance",
      departTarget: null,
      waypoints,
      waypointIndex: 0,
      waypointDwellTimer: 0,
      passiveScanTimer: 0,
      flaggedDismissTimer: 0,
      flybyTarget: null,
      flybyCheckTimer: 0,
      flybyHasScanned: false,
    };

    this.state.ledger.recordEvent(
      "patrol.dispatched",
      {
        patrolId: this.activePatrolIntercept.id,
        patrolName: this.activePatrolIntercept.name,
        siteId: site.id,
        siteName: site.name,
        reason,
      },
      { visible: false },
    );

    return true;
  }

  dismissPatrolIntercept(siteId = null) {
    const patrol = this.activePatrolIntercept;

    if (!patrol || (siteId && patrol.site.id !== siteId) || patrol.phase === "depart" || patrol.phase === "return") {
      return false;
    }

    // Return to drift rather than departing — patrol belongs to the hub.
    patrol.phase = "return";
    patrol.waypointIndex = this.nearestWaypointIndex(patrol);
    patrol.hasScanned = false;
    patrol.scanTimer = 0;
    patrol.flaggedDismissTimer = 0;
    patrol.hasArrived = false;
    patrol.orbitAngle = null;

    this.state.ledger.recordEvent(
      "patrol.dismissed",
      {
        patrolId: patrol.id,
        patrolName: patrol.name,
        siteId: patrol.site.id,
        siteName: patrol.site.name,
      },
      { visible: false },
    );

    return true;
  }

  departHubPatrol(siteId) {
    const patrol = this.activePatrolIntercept;

    if (!patrol || patrol.site.id !== siteId || patrol.phase === "depart") {
      return false;
    }

    const awayFromShip = normalizeVector(patrol.position.x - this.ship.position.x, patrol.position.y - this.ship.position.y);
    patrol.phase = "depart";
    patrol.departTarget = {
      x: patrol.position.x + awayFromShip.x * PATROL_DEPART_DISTANCE,
      y: patrol.position.y + awayFromShip.y * PATROL_DEPART_DISTANCE,
    };

    return true;
  }

  fireScanPulse() {
    this.scanRings.push({
      x: this.ship.position.x,
      y: this.ship.position.y,
      timer: 0,
    });

    if (this.scanRings.length > 4) {
      this.scanRings.shift();
    }
  }

  updateScanRings(deltaSeconds) {
    this.scanRings = this.scanRings.filter((ring) => {
      ring.timer += deltaSeconds;
      return ring.timer < SCAN_RING_DURATION;
    });
  }

  updatePatrolIntercept(deltaSeconds) {
    const patrol = this.activePatrolIntercept;

    if (!patrol) {
      return;
    }

    patrol.pulse += deltaSeconds;

    // â"€â"€ DEPART â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    if (patrol.phase === "depart") {
      const target = patrol.departTarget ?? { x: patrol.site.position.x, y: patrol.site.position.y };
      this.steerPatrolIntercept(patrol, target, PATROL_DEPART_SPEED, deltaSeconds);

      if (distance(patrol.position, this.ship.position) > PATROL_DEPART_DISTANCE * 0.8) {
        this.activePatrolIntercept = null;
      }

      return;
    }

    // â"€â"€ RETURN TO DRIFT â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    if (patrol.phase === "return") {
      const wp = patrol.waypoints[patrol.waypointIndex];
      this.steerPatrolIntercept(patrol, wp, PATROL_RETURN_SPEED, deltaSeconds);

      if (distance(patrol.position, wp) < PATROL_WAYPOINT_REACH_DIST) {
        patrol.phase = "drift";
        patrol.waypointDwellTimer = 0;
      }

      return;
    }

    // â"€â"€ DRIFT â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    if (patrol.phase === "drift") {
      // Passive scan ping when patrol passes near player.
      patrol.passiveScanTimer += deltaSeconds;
      if (patrol.passiveScanTimer >= PATROL_PASSIVE_SCAN_INTERVAL) {
        patrol.passiveScanTimer = 0;

        if (distance(patrol.position, this.ship.position) < PATROL_PASSIVE_SCAN_RANGE) {
          this.fireScanPulse();
        }
      }

      // Check if player has entered patrol territory and is not yet cleared.
      if (!this.dockedSite) {
        const playerDistFromHub = distance(this.ship.position, patrol.site.position);
        const patrolRadius = patrol.site.interactionRadius * PATROL_WAYPOINT_RADIUS_FACTOR;

        if (playerDistFromHub <= patrolRadius) {
          const identity = createControlledShipPublicIdentity(this.state);
          const cacheKey = getInspectionCacheKey(patrol.site, identity);

          const exemptSiteIds = this.state.journey?.mission?.patrolExemptSiteIds ?? [];
          if (!this.hubInspectionCache.has(cacheKey) && !exemptSiteIds.includes(patrol.site.id)) {
            // Jump directly to orbiting distance — patrol has short-range intercept capability.
            this.jumpPatrolToInterceptPosition(patrol);
            patrol.flybyTarget = null;
            patrol.requiresManualClearance = false;
            patrol.hasArrived = false;
            patrol.scanTimer = 0;
            patrol.hasScanned = false;
            return;
          }
        }
      }

      // Fly-by: periodically look for a nearby NPC hauler or asteroid to check out.
      patrol.flybyCheckTimer += deltaSeconds;
      if (patrol.flybyCheckTimer >= PATROL_FLYBY_CHECK_INTERVAL) {
        patrol.flybyCheckTimer = 0;
        const flybyTarget = this.findPatrolFlybyTarget(patrol);

        if (flybyTarget) {
          patrol.flybyTarget = flybyTarget;
          patrol.flybyHasScanned = false;
          patrol.phase = "flyby";
          return;
        }
      }

      // Steer toward current waypoint.
      const wp = patrol.waypoints[patrol.waypointIndex];
      this.steerPatrolIntercept(patrol, wp, PATROL_DRIFT_SPEED, deltaSeconds);

      // Advance to next waypoint.
      if (distance(patrol.position, wp) < PATROL_WAYPOINT_REACH_DIST) {
        patrol.waypointDwellTimer += deltaSeconds;

        if (patrol.waypointDwellTimer >= PATROL_WAYPOINT_DWELL_SECONDS) {
          patrol.waypointIndex = (patrol.waypointIndex + 1) % patrol.waypoints.length;
          patrol.waypointDwellTimer = 0;
        }
      }

      return;
    }

    // â"€â"€ FLY-BY â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    if (patrol.phase === "flyby") {
      const target = patrol.flybyTarget;

      if (!target) {
        patrol.phase = "return";
        patrol.waypointIndex = this.nearestWaypointIndex(patrol);
        return;
      }

      // Always steer toward the snapshot position — never chase a live ship.
      const targetPos = target.position;
      this.steerPatrolIntercept(patrol, targetPos, PATROL_DRIFT_SPEED * 1.8, deltaSeconds);

      if (!patrol.flybyHasScanned && distance(patrol.position, targetPos) < PATROL_FLYBY_SCAN_DIST) {
        patrol.flybyHasScanned = true;
        this.fireScanPulse();

        if (target.ship?.isAlive) {
          const identity = createNpcShipPublicIdentity(target.ship);
          const cacheKey = getInspectionCacheKey(patrol.site, identity);

          if (!this.hubInspectionCache.has(cacheKey)) {
            this.hubInspectionCache.add(cacheKey);
            this.inspectPublicTrafficIdentity(identity, patrol.site, {
              type: "patrol",
              id: patrol.id,
              name: patrol.name,
            });
          }
        }
      }

      // Leave immediately after scanning — don't linger on the target.
      if (patrol.flybyHasScanned) {
        patrol.flybyTarget = null;
        patrol.phase = "return";
        patrol.waypointIndex = this.nearestWaypointIndex(patrol);
      }

      return;
    }

    // â"€â"€ STANDOFF â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    // Patrol holds the approach line aimed at the player. Tether is active.
    // After a short dwell the patrol begins orbiting (approach phase).
    if (patrol.phase === "standoff") {
      // Tether player immediately — they cannot flee during standoff.
      this.ship.velocity.x *= PATROL_TETHER_DAMPING;
      this.ship.velocity.y *= PATROL_TETHER_DAMPING;

      // Hold fixed position on the standoff angle — aimed straight at player.
      const holdTarget = {
        x: this.ship.position.x + Math.cos(patrol.standoffOrbitAngle) * PATROL_ORBIT_RADIUS * 1.8,
        y: this.ship.position.y + Math.sin(patrol.standoffOrbitAngle) * PATROL_ORBIT_RADIUS * 1.8,
      };
      this.steerPatrolIntercept(patrol, holdTarget, PATROL_APPROACH_SPEED, deltaSeconds);

      patrol.standoffTimer += deltaSeconds;
      // After 1.8 seconds, start orbiting.
      if (patrol.standoffTimer >= 1.8) {
        patrol.phase = "approach";
        patrol.orbitAngle = patrol.standoffOrbitAngle;
        patrol.hasArrived = false;
      }

      return;
    }

    // â"€â"€ TRANSIT â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    // Transit is only used for mission-scripted intercepts (spawnPatrolIntercept
    // from a beat). Hub-triggered intercepts use jumpPatrolToInterceptPosition
    // instead and skip transit entirely, going straight to standoff.
    if (patrol.phase === "transit") {
      const transitTarget = this.getPatrolTransitTarget(patrol);
      this.steerPatrolIntercept(patrol, transitTarget, PATROL_APPROACH_SPEED, deltaSeconds);

      if (distance(this.ship.position, patrol.site.position) <= patrol.site.interactionRadius * PATROL_TRANSIT_RADIUS_FACTOR) {
        patrol.phase = "approach";
        patrol.orbitAngle = Math.atan2(patrol.position.y - this.ship.position.y, patrol.position.x - this.ship.position.x);
      }

      return;
    }

    // â"€â"€ APPROACH / HOLD (intercept) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    if (patrol.orbitAngle === null) {
      patrol.orbitAngle = Math.atan2(patrol.position.y - this.ship.position.y, patrol.position.x - this.ship.position.x);
    }

    patrol.orbitAngle += PATROL_ORBIT_SPEED * deltaSeconds;
    const holdTarget = {
      x: this.ship.position.x + Math.cos(patrol.orbitAngle) * PATROL_ORBIT_RADIUS,
      y: this.ship.position.y + Math.sin(patrol.orbitAngle) * PATROL_ORBIT_RADIUS,
    };

    this.steerPatrolIntercept(patrol, holdTarget, PATROL_APPROACH_SPEED, deltaSeconds);

    if (distance(patrol.position, holdTarget) > PATROL_HOLD_DISTANCE) {
      return;
    }

    if (!patrol.hasArrived) {
      patrol.hasArrived = true;
      patrol.phase = "hold";
      this.state.ledger.recordEvent(
        "patrol.arrived",
        {
          patrolId: patrol.id,
          patrolName: patrol.name,
          siteId: patrol.site.id,
          siteName: patrol.site.name,
          reason: patrol.reason,
        },
        { visible: false },
      );
    }

    // Tether damping during hold.
    this.ship.velocity.x *= PATROL_TETHER_DAMPING;
    this.ship.velocity.y *= PATROL_TETHER_DAMPING;

    // Count down flagged dismiss timer.
    if (patrol.hasScanned && patrol.flaggedDismissTimer > 0) {
      patrol.flaggedDismissTimer -= deltaSeconds;

      if (patrol.flaggedDismissTimer <= 0) {
        patrol.phase = "return";
        patrol.waypointIndex = this.nearestWaypointIndex(patrol);
        patrol.hasScanned = false;
        patrol.scanTimer = 0;
        patrol.hasArrived = false;
        patrol.orbitAngle = null;
      }

      return;
    }

    if (patrol.hasScanned) {
      return;
    }

    patrol.scanTimer += deltaSeconds;

    if (patrol.scanTimer < PATROL_SCAN_SECONDS) {
      return;
    }

    patrol.hasScanned = true;
    this.fireScanPulse();

    const result = this.inspectPublicTrafficIdentity(createControlledShipPublicIdentity(this.state), patrol.site, {
      type: "patrol",
      id: patrol.id,
      name: patrol.name,
    });

    if (result.status === "cleared" && !patrol.requiresManualClearance) {
      this.state.ledger.recordEvent(
        "patrol.cleared",
        { patrolId: patrol.id, patrolName: patrol.name, siteId: patrol.site.id, siteName: patrol.site.name },
        { visible: false },
      );
      patrol.phase = "return";
      patrol.waypointIndex = this.nearestWaypointIndex(patrol);
      patrol.hasScanned = false;
      patrol.scanTimer = 0;
      patrol.hasArrived = false;
      patrol.orbitAngle = null;
    } else if (result.status === "flagged" || result.status === "failed") {
      patrol.flaggedReasons = result.reasons ?? [];
      patrol.flaggedDismissTimer = PATROL_FLAGGED_DISMISS_SECONDS;
    }
    // needs-presentation: stay in hold, wait for manual clearance via dismissPatrolIntercept.
  }

  jumpPatrolToInterceptPosition(patrol) {
    // Jump to the approach trajectory — directly on the line from hub to player,
    // at orbit radius distance, aimed straight at the ship. Tether applies immediately.
    const dx = this.ship.position.x - patrol.site.position.x;
    const dy = this.ship.position.y - patrol.site.position.y;
    const len = Math.hypot(dx, dy) || 1;
    const toShip = { x: dx / len, y: dy / len };
    const jumpDist = PATROL_ORBIT_RADIUS * 2.0;

    patrol.position.x = this.ship.position.x + toShip.x * jumpDist;
    patrol.position.y = this.ship.position.y + toShip.y * jumpDist;
    patrol.velocity.x = -toShip.x * 20;
    patrol.velocity.y = -toShip.y * 20;
    patrol.heading = Math.atan2(-toShip.y, -toShip.x);
    // Lock the orbit angle on the approach trajectory — patrol holds this line in standoff.
    patrol.orbitAngle = Math.atan2(patrol.position.y - this.ship.position.y, patrol.position.x - this.ship.position.x);
    patrol.standoffOrbitAngle = patrol.orbitAngle;
    patrol.standoffTimer = 0;
    patrol.phase = "standoff";

    // Flash ring at jump-in point.
    this.scanRings.push({ x: patrol.position.x, y: patrol.position.y, timer: 0 });

    // Fire "stand by" comms immediately.
    this.state.ledger.recordEvent(
      "patrol.standoff",
      { patrolId: patrol.id, patrolName: patrol.name, siteId: patrol.site.id, siteName: patrol.site.name },
      { visible: false },
    );
  }

  findPatrolFlybyTarget(patrol) {
    const patrolRadius = patrol.site.interactionRadius * PATROL_WAYPOINT_RADIUS_FACTOR;

    // Prefer nearby NPC ships — haulers passing through the patrol zone.
    const nearbyShip = this.npcShips.find((ship) => {
      if (!ship.isAlive) return false;
      const distFromHub = distance(ship.position, patrol.site.position);
      return distFromHub < patrolRadius && distance(patrol.position, ship.position) < PATROL_FLYBY_RANGE;
    });

    if (nearbyShip) {
      return { ship: nearbyShip, position: { ...nearbyShip.position } };
    }

    // Fall back to a nearby asteroid inside or near the patrol zone.
    const nearbyAsteroid = this.asteroids.find((asteroid) => {
      const distFromHub = distance(asteroid.position, patrol.site.position);
      return distFromHub < patrolRadius * 0.9 && distance(patrol.position, asteroid.position) < PATROL_FLYBY_RANGE;
    });

    if (nearbyAsteroid) {
      return { position: { ...nearbyAsteroid.position } };
    }

    return null;
  }

  getPatrolTransitTarget(patrol) {
    const directionToShip = normalizeVector(
      this.ship.position.x - patrol.site.position.x,
      this.ship.position.y - patrol.site.position.y,
    );

    return {
      x: patrol.site.position.x + directionToShip.x * patrol.site.interactionRadius * 1.15,
      y: patrol.site.position.y + directionToShip.y * patrol.site.interactionRadius * 1.15,
    };
  }

  steerPatrolIntercept(patrol, target, maxSpeed, deltaSeconds) {
    const targetDirection = normalizeVector(target.x - patrol.position.x, target.y - patrol.position.y);
    const desiredVelocity = {
      x: targetDirection.x * maxSpeed,
      y: targetDirection.y * maxSpeed,
    };
    const turn = Math.min(1, deltaSeconds * 2.4);

    patrol.velocity.x += (desiredVelocity.x - patrol.velocity.x) * turn;
    patrol.velocity.y += (desiredVelocity.y - patrol.velocity.y) * turn;
    patrol.position.x += patrol.velocity.x * deltaSeconds;
    patrol.position.y += patrol.velocity.y * deltaSeconds;
    patrol.heading = lerpAngle(patrol.heading, Math.atan2(patrol.velocity.y, patrol.velocity.x), Math.min(1, deltaSeconds * 4.6));
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

    recordVisitedZone(this.state, zoneId);

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

    // Block docking at a hub while its patrol has an active intercept in progress.
    if (!this.dockedSite && this.nearbySite) {
      const patrol = this.activePatrolIntercept;
      const intercepting = patrol?.site?.id === this.nearbySite.id &&
        (patrol.phase === "standoff" || patrol.phase === "approach" || patrol.phase === "hold");

      if (intercepting) {
        this.state.ledger.recordEvent(
          "patrol.dockingBlocked",
          { siteId: this.nearbySite.id, siteName: this.nearbySite.name },
          { visible: false },
        );
        return;
      }
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

    if (repairCost <= 0 || !canSpendCredits(this.state, repairCost)) {
      return;
    }

    spendCredits(this.state, repairCost);
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
    const color = CARGO_TRAIL_COLOR[resourceType] ?? "#ff7452";
    const distanceX = site.position.x - this.ship.position.x;
    const distanceY = site.position.y - this.ship.position.y;
    const transferDistance = distance(this.ship.position, site.position) || 1;
    const normalX = distanceX / transferDistance;
    const normalY = distanceY / transferDistance;

    const travelTime = Math.max(0.4, transferDistance / 235);

    this.particles.push({
      type: "cargo-packet",
      position: {
        x: this.ship.position.x,
        y: this.ship.position.y,
      },
      velocity: {
        x: normalX * 235,
        y: normalY * 235,
      },
      color,
      size: 6,
      drag: 0.995,
      life: travelTime,
      maxLife: travelTime,
    });
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
      credits: getCredits(this.state),
      hullIntegrity: this.state.components.hull.integrity,
      hullMaxIntegrity: this.state.components.hull.maxIntegrity,
    });
  }

  fireTowCable() {
    const cableState = this.state.components.towCable;

    if (!cableState?.installed || this.shipDestroyed || this.activeTow || this.towCable.phase !== "idle") {
      return false;
    }

    const rearAngle = this.ship.angle + Math.PI;
    const rearDirection = {
      x: Math.cos(rearAngle),
      y: Math.sin(rearAngle),
    };
    const startPosition = {
      x: this.ship.position.x + rearDirection.x * 26,
      y: this.ship.position.y + rearDirection.y * 26,
    };

    this.towCable = {
      phase: "fired",
      hookPosition: startPosition,
      hookVelocity: {
        x: this.ship.velocity.x + rearDirection.x * TOW_CABLE_HOOK_SPEED,
        y: this.ship.velocity.y + rearDirection.y * TOW_CABLE_HOOK_SPEED,
      },
      anchor: null,
      lineLength: 0,
      control: "hold",
      pulse: 0,
    };
    this.syncTowCableState("Fired");
    this.state.ledger.recordEvent(
      "towCable.fired",
      {
        x: Math.round(startPosition.x),
        y: Math.round(startPosition.y),
      },
      { visible: false },
    );
    this.onHudChange(this.state);
    return true;
  }

  setTowCableControl(control = "hold") {
    if (!["hold", "reel", "payout"].includes(control)) {
      return;
    }

    this.towCable.control = control;
    this.syncTowCableState();
  }

  releaseTowCable() {
    if (this.towCable.phase === "idle") {
      return;
    }

    this.towCable = {
      phase: "idle",
      hookPosition: null,
      hookVelocity: { x: 0, y: 0 },
      anchor: null,
      lineLength: 0,
      control: "hold",
      pulse: 0,
    };
    this.syncTowCableState("Idle");
    this.state.ledger.recordEvent("towCable.released", {}, { visible: false });
    this.onHudChange(this.state);
  }

  getTowCableDisplay() {
    const cableState = this.state.components.towCable ?? {};
    return {
      status: cableState.status ?? "Idle",
      lineLength: Math.round(cableState.lineLength ?? 0),
      maxLength: Math.round(cableState.maxLength ?? TOW_CABLE_MAX_LENGTH),
      control: this.towCable.control,
    };
  }

  deployMossHarvester() {
    const harvester = this.state.components.mossHarvester;

    if (!harvester?.installed || harvester.deployed) {
      return false;
    }

    harvester.deployed = true;
    harvester.status = "Deployed";
    harvester.position = {
      x: this.ship.position.x,
      y: this.ship.position.y,
    };
    harvester.intakeProgress = 0;
    harvester.intakeRadius = MOSS_HARVESTER_INTAKE_RADIUS;

    this.createTowCableSparks(harvester.position, "#8dff9e");
    this.state.ledger.recordEvent(
      "mossHarvester.deployed",
      {
        x: Math.round(harvester.position.x),
        y: Math.round(harvester.position.y),
      },
      { visible: true },
    );
    this.onHudChange(this.state);
    return true;
  }

  recallMossHarvester() {
    const harvester = this.state.components.mossHarvester;

    if (!harvester?.installed || !harvester.deployed || !harvester.position) {
      return false;
    }

    if (distance(this.ship.position, harvester.position) > 120) {
      harvester.status = "Too far";
      this.onHudChange(this.state);
      return false;
    }

    this.createTowCableSparks(harvester.position, "#9ee8ff");
    harvester.deployed = false;
    harvester.status = "Stored";
    harvester.position = null;
    harvester.intakeProgress = 0;
    this.state.ledger.recordEvent("mossHarvester.recalled", {}, { visible: true });
    this.onHudChange(this.state);
    return true;
  }

  getMossHarvesterDisplay() {
    const harvester = this.state.components.mossHarvester ?? {};
    return {
      status: harvester.status ?? "Stored",
      food: Math.floor(harvester.food ?? 0),
      deployed: Boolean(harvester.deployed),
      progress: harvester.intakeProgress ?? 0,
    };
  }

  updateMossHarvester(deltaSeconds) {
    const harvester = this.state.components.mossHarvester;

    if (!harvester?.installed || !harvester.deployed || !harvester.position) {
      return;
    }

    const intakeRadius = harvester.intakeRadius ?? MOSS_HARVESTER_INTAKE_RADIUS;
    const targetAsteroid = this.asteroids.find((asteroid) =>
      asteroid.rockmoss && distance(harvester.position, asteroid.position) <= intakeRadius + asteroid.radius,
    );

    if (!targetAsteroid) {
      harvester.status = "Waiting";
      harvester.intakeProgress = Math.max(0, (harvester.intakeProgress ?? 0) - deltaSeconds * 0.2);
      return;
    }

    const moss = this.normalizeRockmossState(targetAsteroid);
    harvester.status = "Feeding";
    harvester.intakeProgress = Math.min(1, (harvester.intakeProgress ?? 0) + deltaSeconds / MOSS_HARVESTER_PROCESS_SECONDS);

    if (harvester.intakeProgress < 1) {
      return;
    }

    harvester.intakeProgress = 0;
    harvester.food = Math.floor(harvester.food ?? 0) + 1;
    moss.patches = Math.max(0, moss.patches - 1);
    moss.crawlers = Math.max(0, Math.min(moss.crawlers, moss.patches));
    moss.coverage = moss.patches <= 0 ? 0 : moss.patches / Math.max(1, this.getRockmossPatchCap(targetAsteroid));
    moss.glow = Math.max(0.12, moss.glow - 0.08);

    if (moss.patches <= 0) {
      delete targetAsteroid.rockmoss;
      harvester.status = "Cleared moss";
    }

    this.createRockmossBurst(targetAsteroid, { x: 0, y: 0 }, 10);
    this.state.ledger.recordEvent(
      "mossHarvester.foodProduced",
      {
        totalFood: harvester.food,
        x: Math.round(targetAsteroid.position.x),
        y: Math.round(targetAsteroid.position.y),
      },
      { visible: true },
    );
    this.onHudChange(this.state);
  }

  updateTowCable(deltaSeconds) {
    if (!this.state.components.towCable?.installed || this.towCable.phase === "idle") {
      return;
    }

    this.towCable.pulse += deltaSeconds;

    if (this.towCable.phase === "fired") {
      this.updateFlyingTowCable(deltaSeconds);
    } else if (this.towCable.phase === "attached") {
      this.updateAttachedTowCable(deltaSeconds);
    }

    this.syncTowCableState();
  }

  updateFlyingTowCable(deltaSeconds) {
    const cable = this.towCable;
    if (cable.control === "reel") {
      const towardShip = normalizeVector(this.ship.position.x - cable.hookPosition.x, this.ship.position.y - cable.hookPosition.y);
      cable.hookVelocity.x = this.ship.velocity.x + towardShip.x * TOW_CABLE_HOOK_SPEED * 0.74;
      cable.hookVelocity.y = this.ship.velocity.y + towardShip.y * TOW_CABLE_HOOK_SPEED * 0.74;
    }

    cable.hookPosition.x += cable.hookVelocity.x * deltaSeconds;
    cable.hookPosition.y += cable.hookVelocity.y * deltaSeconds;

    const lineDistance = distance(this.ship.position, cable.hookPosition);
    cable.lineLength = Math.min(lineDistance, TOW_CABLE_MAX_LENGTH);

    const hitAsteroid = this.asteroids.find((asteroid) =>
      circlesOverlap(cable.hookPosition, TOW_CABLE_HOOK_RADIUS, asteroid.position, asteroid.radius),
    );

    if (hitAsteroid) {
      cable.phase = "attached";
      cable.anchor = hitAsteroid;
      cable.hookPosition = hitAsteroid.position;
      cable.hookVelocity = { x: 0, y: 0 };
      cable.lineLength = Math.min(TOW_CABLE_MAX_LENGTH, Math.max(TOW_CABLE_MIN_LENGTH, distance(this.ship.position, hitAsteroid.position)));
      this.createTowCableSparks(hitAsteroid.position, "#ffd36b");
      this.state.ledger.recordEvent(
        "towCable.attached",
        {
          targetType: "asteroid",
          lineLength: Math.round(cable.lineLength),
        },
        { visible: false },
      );
      return;
    }

    if (lineDistance > TOW_CABLE_MAX_LENGTH) {
      const rearAngle = this.ship.angle + Math.PI;
      cable.hookPosition = {
        x: this.ship.position.x + Math.cos(rearAngle) * TOW_CABLE_MAX_LENGTH,
        y: this.ship.position.y + Math.sin(rearAngle) * TOW_CABLE_MAX_LENGTH,
      };
      cable.hookVelocity.x *= 0.15;
      cable.hookVelocity.y *= 0.15;
    }

    if (cable.control === "reel" && lineDistance < 42) {
      this.releaseTowCable();
    }
  }

  updateAttachedTowCable(deltaSeconds) {
    const cable = this.towCable;
    const anchor = cable.anchor;

    if (!anchor || !this.asteroids.includes(anchor)) {
      this.releaseTowCable();
      return;
    }

    if (cable.control === "reel") {
      cable.lineLength = Math.max(TOW_CABLE_MIN_LENGTH, cable.lineLength - TOW_CABLE_REEL_SPEED * deltaSeconds);
    } else if (cable.control === "payout") {
      cable.lineLength = Math.min(TOW_CABLE_MAX_LENGTH, cable.lineLength + TOW_CABLE_REEL_SPEED * deltaSeconds);
    }

    const offsetX = anchor.position.x - this.ship.position.x;
    const offsetY = anchor.position.y - this.ship.position.y;
    const currentDistance = Math.hypot(offsetX, offsetY) || 1;
    const excess = currentDistance - cable.lineLength;

    if (excess <= 0) {
      return;
    }

    const normal = {
      x: offsetX / currentDistance,
      y: offsetY / currentDistance,
    };
    const force = Math.min(520, excess * TOW_CABLE_STIFFNESS);
    const asteroidMass = Math.max(1.2, anchor.radius / 22);

    this.ship.velocity.x += normal.x * force * deltaSeconds;
    this.ship.velocity.y += normal.y * force * deltaSeconds;
    anchor.velocity.x -= normal.x * force * TOW_CABLE_ASTEROID_PULL * deltaSeconds / asteroidMass;
    anchor.velocity.y -= normal.y * force * TOW_CABLE_ASTEROID_PULL * deltaSeconds / asteroidMass;
  }

  syncTowCableState(statusOverride = null) {
    const cableState = this.state.components.towCable;

    if (!cableState) {
      return;
    }

    const statusByPhase = {
      idle: "Idle",
      fired: "Line out",
      attached: this.towCable.control === "reel" ? "Reeling" : this.towCable.control === "payout" ? "Paying out" : "Attached",
    };

    cableState.status = statusOverride ?? statusByPhase[this.towCable.phase] ?? "Idle";
    cableState.lineLength = Math.round(this.towCable.phase === "idle" ? 0 : this.towCable.lineLength);
    cableState.maxLength = TOW_CABLE_MAX_LENGTH;
  }

  createTowCableSparks(position, color = "#ffd36b") {
    for (let index = 0; index < 12; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 110;
      this.particles.push({
        position: { x: position.x, y: position.y },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        color,
        size: 1.2 + Math.random() * 2.4,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
      });
    }
  }

  emergencyTow(towCost = null) {
    if (this.activeTow || this.dockedSite) {
      return false;
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
    return true;
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
    debitCredits(this.state, tow.cost);
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
    this.addLifeDisturbance("weapon", this.ship.position, LIFE_DISTURBANCE_WEAPON_RADIUS, 1);
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
      this.recordEnemyDestroyed(getHostileEnemyType(hitHunter), "weapon");
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
    this.recordShipCollision(getHostileEnemyType(rammingHunter), rammingHunter, hullDamage);
    this.damageHull(hullDamage);
    this.triggerImpactFeedback(hullDamage);
    this.createShipSparks(rammingHunter);
    rammingHunter.damage(impactDamage * 0.85);

    if (rammingHunter.isAlive) {
      this.createHunterImpactSparks(rammingHunter);
    } else {
      this.recordEnemyDestroyed(getHostileEnemyType(rammingHunter), "ramming-ship");
      this.createHunterBurst(rammingHunter, this.ship.velocity);
      this.createHunterDrops(rammingHunter, this.ship.velocity);
      this.respawnHunter();
    }
  }

  addLifeDisturbance(type, position, radius, intensity = 1) {
    this.lifeDisturbances.push({
      type,
      position: {
        x: position.x,
        y: position.y,
      },
      radius,
      intensity,
      age: 0,
      duration: LIFE_DISTURBANCE_SECONDS,
    });
  }

  updateLifeDisturbances(deltaSeconds) {
    this.lifeDisturbances.forEach((disturbance) => {
      disturbance.age += deltaSeconds;
    });
    this.lifeDisturbances = this.lifeDisturbances.filter((disturbance) => disturbance.age < disturbance.duration);
  }

  updateThreadwyrms(deltaSeconds) {
    this.threadwyrms.forEach((threadwyrm) => {
      threadwyrm.update(deltaSeconds, {
        ship: this.ship,
        shipPowered: this.state.components.engine.powered,
        disturbances: this.lifeDisturbances,
      });

      const hit = threadwyrm.consumeHit();

      if (!hit || this.shipHitCooldown > 0) {
        return;
      }

      this.shipHitCooldown = SHIP_HIT_COOLDOWN_SECONDS;
      this.state.ledger.recordEvent(
        "lifeform.threadwyrmStrike",
        {
          lifeformId: threadwyrm.id,
          damage: hit.damage,
          distance: hit.distance,
          x: Math.round(this.ship.position.x),
          y: Math.round(this.ship.position.y),
        },
        { visible: false },
      );
      this.damageHull(hit.damage);
      this.triggerImpactFeedback(hit.damage);
      this.createShipSparks(threadwyrm);
    });
  }

  updateDriftMouths(deltaSeconds, activeLifeforms) {
    this.driftMouths.forEach((mouth) => {
      mouth.update(deltaSeconds, {
        ship: this.ship,
        pickups: this.pickups,
        lifeforms: activeLifeforms,
      });

      if (!mouth.consumeReveal()) {
        return;
      }

      this.state.ledger.recordEvent(
        "lifeform.driftMouthRevealed",
        {
          lifeformId: mouth.id,
          x: Math.round(mouth.position.x),
          y: Math.round(mouth.position.y),
        },
        { visible: false },
      );
    });
  }

  updateLifeformContacts(activeLifeforms) {
    const shipPosition = this.ship.position;
    const contactChecks = [
      {
        type: "rockmoss",
        target: this.asteroids.find((asteroid) =>
          asteroid.rockmoss && distance(shipPosition, asteroid.position) <= asteroid.radius + LIFEFORM_CONTACT_RANGES.rockmoss,
        ),
      },
      {
        type: "lantern",
        target: activeLifeforms.find((lifeform) =>
          lifeform.type === "lantern" && distance(shipPosition, lifeform.position) <= LIFEFORM_CONTACT_RANGES.lantern,
        ),
      },
      {
        type: "skitter",
        target: activeLifeforms.find((lifeform) =>
          lifeform.type === "skitter" && distance(shipPosition, lifeform.position) <= LIFEFORM_CONTACT_RANGES.skitter,
        ),
      },
      {
        type: "threadwyrm",
        target: this.threadwyrms.find((threadwyrm) =>
          threadwyrm.getDistanceTo(shipPosition) <= LIFEFORM_CONTACT_RANGES.threadwyrm,
        ),
      },
      {
        type: "drift-mouth",
        target: this.driftMouths.find((mouth) =>
          (mouth.hasRevealed || mouth.reveal > 0.1) && distance(shipPosition, mouth.position) <= LIFEFORM_CONTACT_RANGES["drift-mouth"],
        ),
      },
    ];

    contactChecks.forEach(({ type, target }) => {
      if (!target || this.lifeformContacts.has(type)) {
        return;
      }

      this.lifeformContacts.add(type);
      this.state.ledger.recordEvent(
        "lifeform.contacted",
        {
          ecologyType: type,
          lifeformId: target.id ?? null,
          x: Math.round(target.position.x),
          y: Math.round(target.position.y),
        },
        {
          visible: false,
          message: `Contacted ${getLifeformLabel(type)}`,
        },
      );
    });
  }

  updateSkitterWebHazards(activeLifeforms, deltaSeconds) {
    if (this.skitterWebCooldown > 0) {
      this.skitterWebCooldown = Math.max(0, this.skitterWebCooldown - deltaSeconds);
    }

    if (!this.state.components.engine.powered || this.skitterWebCooldown > 0) {
      return;
    }

    const skitter = activeLifeforms.find((lifeform) => {
      if (lifeform.type !== "skitter" || lifeform.webTrail.length < 2) {
        return false;
      }

      return lifeform.webTrail.some((point, index) => {
        if (index === 0) {
          return false;
        }

        const previous = lifeform.webTrail[index - 1];
        const nearest = closestPointOnSegment(this.ship.position, previous, point);
        return distance(this.ship.position, nearest) <= SKITTER_WEB_TUG_RADIUS;
      });
    });

    if (!skitter) {
      return;
    }

    let nearestPoint = null;
    let nearestDistance = Infinity;
    skitter.webTrail.forEach((point, index) => {
      if (index === 0) {
        return;
      }

      const candidate = closestPointOnSegment(this.ship.position, skitter.webTrail[index - 1], point);
      const candidateDistance = distance(this.ship.position, candidate);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearestPoint = candidate;
      }
    });

    if (!nearestPoint || nearestDistance > SKITTER_WEB_TUG_RADIUS) {
      return;
    }

    const pull = normalizeVector(nearestPoint.x - this.ship.position.x, nearestPoint.y - this.ship.position.y);
    this.ship.velocity.x = this.ship.velocity.x * SKITTER_WEB_DAMPING + pull.x * SKITTER_WEB_PULL * deltaSeconds;
    this.ship.velocity.y = this.ship.velocity.y * SKITTER_WEB_DAMPING + pull.y * SKITTER_WEB_PULL * deltaSeconds;
    this.skitterWebCooldown = SKITTER_WEB_COOLDOWN_SECONDS;
    this.state.ledger.recordEvent(
      "lifeform.skitterWebSnared",
      {
        lifeformId: skitter.id,
        x: Math.round(this.ship.position.x),
        y: Math.round(this.ship.position.y),
      },
      { visible: false },
    );
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

  spawnPirateNearShip(reason = "contract") {
    this.hunterRespawnSeed += 1;
    const pirate = createHunterNearShip(this.ship, this.hunterRespawnSeed);

    pirate.role = "pirate";
    pirate.name = "claim raider";
    pirate.health = Math.max(pirate.health, 120);
    this.lifeforms.push(pirate);
    this.state.ledger.recordEvent(
      "enemy.spawned",
      {
        enemyType: "pirate",
        enemyName: pirate.name,
        reason,
        x: Math.round(pirate.position.x),
        y: Math.round(pirate.position.y),
      },
      { visible: true },
    );
  }

  updateAsteroidChunks() {
    const { added, removedSet } = this.chunkManager.update(this.ship.position.x, this.ship.position.y);

    if (added.length > 0 || removedSet.size > 0) {
      this.asteroids = [...this.asteroids.filter((a) => !removedSet.has(a)), ...added];
    }
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

    this.updateHubTrafficSensors(activeNpcShips);
  }

  updateHubTrafficSensors(activeNpcShips) {
    this.worldSites
      .filter((site) => site.type === "hub")
      .forEach((site) => {
        const sensorRadius = getHubSensorRadius(site);
        const playerDist = distance(this.ship.position, site.position);
        const playerInRange = playerDist <= sensorRadius;

        // Inspect NPC ships passing through hub sensor range.
        activeNpcShips.forEach((ship) => {
          if (distance(ship.position, site.position) > sensorRadius) {
            return;
          }

          const identity = createNpcShipPublicIdentity(ship);
          const cacheKey = getInspectionCacheKey(site, identity);

          if (this.hubInspectionCache.has(cacheKey)) {
            return;
          }

          this.hubInspectionCache.add(cacheKey);
          this.inspectPublicTrafficIdentity(identity, site, {
            type: "patrol",
            id: `${site.id}-traffic-patrol`,
            name: `${site.name} Traffic Patrol`,
          });
        });

        const patrolCreateRadius = site.interactionRadius * PATROL_CREATE_RANGE_FACTOR;
        const isPatrolForThisHub = this.activePatrolIntercept?.site?.id === site.id;
        const playerInPatrolRange = distance(this.ship.position, site.position) <= patrolCreateRadius;

        if (!playerInPatrolRange) {
          // Player left patrol territory — depart any patrol belonging to this hub.
          if (isPatrolForThisHub) {
            this.departHubPatrol(site.id);
          }
          return;
        }

        if (!this.hubPatrolEnabled || !this.state.ui?.panels?.viewport?.available || this.dockedSite) {
          return;
        }

        // Create hub patrol if none exists.
        if (!this.activePatrolIntercept) {
          this.createHubPatrol(site.id);
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

    this.recordEnemyDestroyed(getHostileEnemyType(hunter), cause);
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
    const sourceClaim = this.getAsteroidSourceClaim(asteroid);
    asteroid.sourceClaimId = sourceClaim?.id ?? asteroid.sourceClaimId ?? null;
    asteroid.sourceClaimName = sourceClaim?.strongestZoneName ?? asteroid.sourceClaimName ?? null;
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
      const minedPickups = createResourcePickupsFromAsteroid(asteroid, this.impactSeed + 50000, impactVelocity, {
        sourceClaimId: asteroid.sourceClaimId,
        sourceClaimName: asteroid.sourceClaimName,
      });

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
            sourceClaimId: asteroid.sourceClaimId,
            sourceClaimName: asteroid.sourceClaimName,
          },
          { visible: false },
        );
      }

      this.pickups.push(...minedPickups);
      if (asteroid.rockmoss) {
        this.createRockmossBurst(asteroid, impactVelocity);
        this.emitRockmossCrawlerSpores(asteroid, impactVelocity);
      }
      if (asteroid.color === WHITE_ASTEROID_COLOR) {
        this.createStoneBurst(asteroid, impactVelocity);
      }
    }

    const fragments = breakAsteroid(asteroid, this.impactSeed, impactVelocity);
    fragments.forEach((fragment) => {
      fragment.sourceClaimId = asteroid.sourceClaimId;
      fragment.sourceClaimName = asteroid.sourceClaimName;
    });
    if (asteroid.rockmoss && fragments.length > 0) {
      const parentMoss = this.normalizeRockmossState(asteroid);

      fragments.forEach((fragment, index) => {
        const patchCap = this.getRockmossPatchCap(fragment);
        const inheritedPatches = Math.max(1, Math.min(patchCap, Math.ceil(parentMoss.patches / fragments.length)));
        fragment.rockmoss = {
          seed: (parentMoss.seed ?? this.impactSeed) + index * 811,
          coverage: inheritedPatches / Math.max(1, patchCap),
          glow: Math.max(0.18, parentMoss.glow * 0.82),
          patches: inheritedPatches,
          crawlers: inheritedPatches,
          work: parentMoss.work * 0.35,
        };
      });
    }

    return fragments;
  }

  getAsteroidSourceClaim(asteroid) {
    if (asteroid.sourceClaimId) {
      return this.claimField.getClaimOrPlotById(asteroid.sourceClaimId);
    }

    const origin = asteroid.origin ?? asteroid.position;
    return this.claimField.getPlotAt(origin.x, origin.y);
  }

  updateRockmossLifecycle(deltaSeconds) {
    this.asteroids.forEach((asteroid) => {
      if (!asteroid.rockmoss) {
        return;
      }

      const moss = this.normalizeRockmossState(asteroid);
      const patchCap = this.getRockmossPatchCap(asteroid);

      if (moss.patches >= patchCap) {
        moss.patches = patchCap;
        moss.crawlers = patchCap;
        moss.work = 0;
        moss.coverage = Math.max(moss.coverage, moss.patches / Math.max(1, patchCap));
        return;
      }

      const crawlerTravel = moss.crawlers * (16 + asteroid.radius * 0.08) * deltaSeconds;
      moss.work += crawlerTravel;

      while (moss.work >= ROCKMOSS_WORK_DISTANCE_PER_PATCH && moss.patches < patchCap) {
        moss.work -= ROCKMOSS_WORK_DISTANCE_PER_PATCH;
        moss.patches += 1;
        moss.crawlers = moss.patches;
        moss.coverage = Math.max(moss.coverage, moss.patches / Math.max(1, patchCap));
        moss.glow = Math.min(1, moss.glow + 0.035);
      }
    });
  }

  updateRockmossSpores() {
    const colonizedSpores = new Set();

    this.pickups.forEach((pickup) => {
      if (pickup.type !== ROCKMOSS_CRAWLER_TYPE) {
        return;
      }

      const targetAsteroid = this.asteroids.find((asteroid) =>
        circlesOverlap(pickup.position, pickup.radius, asteroid.position, asteroid.radius),
      );

      if (!targetAsteroid) {
        return;
      }

      this.colonizeRockWithMoss(targetAsteroid, pickup);
      colonizedSpores.add(pickup);
    });

    if (colonizedSpores.size > 0) {
      this.pickups = this.pickups.filter((pickup) => !colonizedSpores.has(pickup));
    }
  }

  normalizeRockmossState(asteroid) {
    const moss = asteroid.rockmoss;
    const patchCap = this.getRockmossPatchCap(asteroid);
    const existingPatches = moss.patches ?? Math.max(ROCKMOSS_MIN_PATCHES, Math.round(patchCap * (moss.coverage ?? 0.24)));

    moss.patches = Math.max(ROCKMOSS_MIN_PATCHES, Math.min(patchCap, existingPatches));
    moss.crawlers = Math.max(ROCKMOSS_MIN_PATCHES, Math.min(patchCap, moss.crawlers ?? moss.patches));
    moss.work = moss.work ?? 0;
    moss.coverage = Math.max(moss.coverage ?? 0.24, moss.patches / Math.max(1, patchCap));
    moss.glow = moss.glow ?? 0.4;

    return moss;
  }

  getRockmossPatchCap(asteroid) {
    return Math.max(ROCKMOSS_MIN_PATCHES, Math.min(10, Math.floor(asteroid.radius / 7)));
  }

  colonizeRockWithMoss(asteroid, pickup) {
    const patchCap = this.getRockmossPatchCap(asteroid);

    if (asteroid.rockmoss) {
      const moss = this.normalizeRockmossState(asteroid);
      moss.work = Math.min(ROCKMOSS_WORK_DISTANCE_PER_PATCH * 0.75, moss.work + ROCKMOSS_WORK_DISTANCE_PER_PATCH * 0.35);
      moss.glow = Math.min(1, moss.glow + 0.08);
      return;
    }

    asteroid.rockmoss = {
      seed: Math.round((pickup.position.x + 30000) * 17 + (pickup.position.y + 30000) * 31),
      coverage: 1 / Math.max(1, patchCap),
      glow: 0.42,
      patches: 1,
      crawlers: 1,
      work: 0,
    };

    this.createRockmossBurst(asteroid, { x: pickup.velocity.x * 0.2, y: pickup.velocity.y * 0.2 }, 8);
    this.state.ledger.recordEvent(
      "lifeform.rockmossColonized",
      {
        x: Math.round(asteroid.position.x),
        y: Math.round(asteroid.position.y),
      },
      { visible: false },
    );
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

  createRockmossBurst(asteroid, impactVelocity, countOverride = null) {
    const moss = asteroid.rockmoss;
    const count = countOverride ?? 14 + Math.floor((moss?.coverage ?? 0.5) * 16);

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 115;
      const edgeDistance = asteroid.radius * (0.25 + Math.random() * 0.55);
      const color = index % 4 === 0 ? "#d9ffb8" : index % 3 === 0 ? "#72ffc9" : "#4dff94";

      this.particles.push({
        type: "spark",
        position: {
          x: asteroid.position.x + Math.cos(angle) * edgeDistance,
          y: asteroid.position.y + Math.sin(angle) * edgeDistance,
        },
        velocity: {
          x: asteroid.velocity.x * 0.3 + Math.cos(angle) * speed + impactVelocity.x * 0.018,
          y: asteroid.velocity.y * 0.3 + Math.sin(angle) * speed + impactVelocity.y * 0.018,
        },
        color,
        size: 1.4 + Math.random() * 2.4,
        drag: 0.965,
        life: 0.45 + Math.random() * 0.55,
        maxLife: 1,
      });
    }
  }

  emitRockmossCrawlerSpores(asteroid, impactVelocity) {
    const moss = this.normalizeRockmossState(asteroid);
    const sporeCount = Math.max(1, Math.min(4, Math.ceil(moss.crawlers / 3)));

    for (let index = 0; index < sporeCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 95 + Math.random() * 145;

      this.pickups.push(
        new ResourcePickup({
          x: asteroid.position.x + Math.cos(angle) * asteroid.radius * 0.55,
          y: asteroid.position.y + Math.sin(angle) * asteroid.radius * 0.55,
          type: ROCKMOSS_CRAWLER_TYPE,
          velocity: {
            x: asteroid.velocity.x * 0.2 + Math.cos(angle) * speed + impactVelocity.x * 0.02,
            y: asteroid.velocity.y * 0.2 + Math.sin(angle) * speed + impactVelocity.y * 0.02,
          },
        }),
      );
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
      const type = Math.random() < 0.18 ? "crystal-matrix" : "iron-nickel";

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
          sourceClaimId: pickup.sourceClaimId ?? null,
          sourceClaimName: pickup.sourceClaimName ?? null,
        },
        { visible: false },
      );
      this.onResourceCollected({
        type: pickup.type,
        sourceClaimId: pickup.sourceClaimId ?? null,
        sourceClaimName: pickup.sourceClaimName ?? null,
      });
      this.audio?.playPickup(pickup.type);
    });

    if (collectedPickups.size === 0) {
      return;
    }

    this.pickups = this.pickups.filter((pickup) => !collectedPickups.has(pickup));
  }

  draw() {
    const drawScale = this.getViewportDrawScale();
    const drawCamera = this.getDrawCamera(this.getShakenCamera(), drawScale);
    const drawCanvas = this.getDrawCanvas(drawScale);

    clearScreen(this.context, this.canvas);
    this.drawClaimField(drawCamera, drawScale);

    this.context.save();
    this.context.scale(drawScale, drawScale);
    drawGrid(this.context, drawCanvas, drawCamera);
    this.drawWorldSites(drawCamera, drawCanvas);
    this.drawDeployedBeacons(drawCamera, drawCanvas);
    this.drawContractClaimTargets(drawCamera, drawCanvas);
    this.drawSiteDefenseBeams(drawCamera);
    this.drawTowCable(drawCamera);
    this.drawMossHarvester(drawCamera, drawCanvas);
    this.asteroids.forEach((asteroid) => {
      if (isVisible(asteroid, drawCanvas, drawCamera)) {
        asteroid.draw(this.context, drawCamera);
        this.drawRockmoss(asteroid, drawCamera);
        this.drawContractAsteroidMarker(asteroid, drawCamera);
      }
    });
    this.threadwyrms.forEach((threadwyrm) => {
      threadwyrm.draw(this.context, drawCamera);
    });
    this.driftMouths.forEach((mouth) => {
      mouth.draw(this.context, drawCamera);
    });
    this.lifeforms.forEach((lifeform) => {
      if (isVisible(lifeform, drawCanvas, drawCamera)) {
        lifeform.draw(this.context, drawCamera);
      }
    });
    this.npcShips.forEach((ship) => {
      if (isVisible(ship, drawCanvas, drawCamera)) {
        ship.draw(this.context, drawCamera);
      }
    });
    this.drawPatrolIntercept(drawCamera);
    this.drawScanRings(drawCamera);
    this.drawEmergencyTow(drawCamera);
    this.pickups.forEach((pickup) => {
      if (isVisible(pickup, drawCanvas, drawCamera)) {
        pickup.draw(this.context, drawCamera);
      }
    });
    this.drawParticles(drawCamera);
    this.drawCollectorField(drawCamera);
    this.bullets.forEach((bullet) => bullet.draw(this.context, drawCamera));
    drawVector(this.context, this.ship.position, this.ship.velocity, drawCamera);
    this.scanner.draw(this.context, drawCamera, this.ship);
    this.ship.draw(this.context, drawCamera);
    this.context.restore();

    this.drawDamageFlash();
    this.drawViewportTitle();
  }

  drawMossHarvester(camera = this.camera, canvas = this.canvas) {
    const harvester = this.state.components.mossHarvester;

    if (!harvester?.installed || !harvester.deployed || !harvester.position) {
      return;
    }

    if (!isVisible({ position: harvester.position, radius: MOSS_HARVESTER_INTAKE_RADIUS }, canvas, camera)) {
      return;
    }

    const x = harvester.position.x - camera.x;
    const y = harvester.position.y - camera.y;
    const pulse = 0.55 + Math.sin(performance.now() / 260) * 0.18;
    const progress = harvester.intakeProgress ?? 0;

    this.context.save();
    this.context.translate(x, y);

    this.context.strokeStyle = `rgba(141, 255, 158, ${0.18 + pulse * 0.18})`;
    this.context.lineWidth = 1.2;
    this.context.setLineDash([7, 8]);
    this.context.beginPath();
    this.context.arc(0, 0, harvester.intakeRadius ?? MOSS_HARVESTER_INTAKE_RADIUS, 0, Math.PI * 2);
    this.context.stroke();
    this.context.setLineDash([]);

    this.context.fillStyle = "rgba(19, 40, 28, 0.82)";
    this.context.strokeStyle = "#8dff9e";
    this.context.lineWidth = 1.8;
    this.context.beginPath();
    this.context.moveTo(0, -18);
    this.context.lineTo(18, -5);
    this.context.lineTo(12, 16);
    this.context.lineTo(-14, 16);
    this.context.lineTo(-19, -4);
    this.context.closePath();
    this.context.fill();
    this.context.stroke();

    this.context.strokeStyle = "#ffd36b";
    this.context.lineWidth = 2.4;
    this.context.beginPath();
    this.context.arc(0, 0, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    this.context.stroke();

    this.context.fillStyle = "#8dff9e";
    this.context.beginPath();
    this.context.arc(0, 0, 3.5 + progress * 2, 0, Math.PI * 2);
    this.context.fill();

    this.context.restore();
  }

  drawDeployedBeacons(camera = this.camera, canvas = this.canvas) {
    const beacons = this.getDeployedPersonalBeacons();

    beacons.forEach((beacon) => {
      if (!isVisible({ position: beacon.position, radius: 28 }, canvas, camera)) {
        return;
      }

      const x = beacon.position.x - camera.x;
      const y = beacon.position.y - camera.y;
      const pulse = 0.55 + Math.sin(performance.now() / 240 + beacon.bayIndex) * 0.22;

      this.context.save();
      this.context.translate(x, y);
      this.context.strokeStyle = "#ffd36b";
      this.context.fillStyle = "rgba(255, 211, 107, 0.08)";
      this.context.lineWidth = 2;
      this.context.globalAlpha = 0.75 + pulse * 0.25;
      this.context.beginPath();
      this.context.moveTo(0, -13);
      this.context.lineTo(11, 0);
      this.context.lineTo(0, 13);
      this.context.lineTo(-11, 0);
      this.context.closePath();
      this.context.fill();
      this.context.stroke();
      this.context.globalAlpha = 0.38 + pulse * 0.25;
      this.context.beginPath();
      this.context.arc(0, 0, 22 + pulse * 5, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    });
  }

  drawRockmoss(asteroid, camera = this.camera) {
    if (!asteroid.rockmoss || !asteroid.points?.length) {
      return;
    }

    const moss = asteroid.rockmoss;
    const screenX = asteroid.position.x - camera.x;
    const screenY = asteroid.position.y - camera.y;
    const patchCount = Math.max(ROCKMOSS_MIN_PATCHES, Math.min(asteroid.points.length, moss.patches ?? Math.round(asteroid.points.length * moss.coverage)));
    const pulse = 0.6 + Math.sin(performance.now() / 900 + moss.seed * 0.001) * 0.18;

    this.context.save();
    this.context.translate(screenX, screenY);
    this.context.rotate(asteroid.rotation);
    this.context.lineWidth = 1.5;

    for (let index = 0; index < patchCount; index += 1) {
      const pointIndex = Math.floor(pseudoRandom(moss.seed, index) * asteroid.points.length) % asteroid.points.length;
      const point = asteroid.points[pointIndex];
      const spread = 0.16 + pseudoRandom(moss.seed + 33, index) * 0.12;
      const baseDistance = point.distance * (0.86 + pseudoRandom(moss.seed + 71, index) * 0.16);
      const angle = point.angle + (pseudoRandom(moss.seed + 99, index) - 0.5) * spread;
      const x = Math.cos(angle) * baseDistance;
      const y = Math.sin(angle) * baseDistance;
      const size = 4 + asteroid.radius * 0.035 + pseudoRandom(moss.seed + 123, index) * 5;
      const glow = moss.glow * (0.55 + pseudoRandom(moss.seed + 171, index) * 0.45) * pulse;

      this.context.fillStyle = `rgba(107, 255, 178, ${0.08 + glow * 0.18})`;
      this.context.strokeStyle = `rgba(152, 255, 205, ${0.25 + glow * 0.35})`;
      this.context.beginPath();
      this.context.ellipse(x, y, size * 1.45, size * 0.75, angle + Math.PI / 2, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();

      if (index % 3 === 0) {
        this.context.fillStyle = `rgba(213, 255, 188, ${0.3 + glow * 0.45})`;
        this.context.beginPath();
        this.context.arc(x + Math.cos(angle) * size, y + Math.sin(angle) * size, 1.8, 0, Math.PI * 2);
        this.context.fill();
      }
    }

    this.drawRockmossCrawlers(asteroid, moss);
    this.context.restore();
  }

  drawRockmossCrawlers(asteroid, moss) {
    const crawlerCount = Math.max(ROCKMOSS_MIN_PATCHES, Math.min(5, moss.crawlers ?? Math.floor(moss.coverage * 7)));
    const now = performance.now();

    for (let index = 0; index < crawlerCount; index += 1) {
      const direction = pseudoRandom(moss.seed + 463, index) > 0.46 ? 1 : -1;
      const cycleMs = 5200 + index * 720 + pseudoRandom(moss.seed + 487, index) * 2600;
      const pauseStart = 0.22 + pseudoRandom(moss.seed + 509, index) * 0.56;
      const pauseDuration = 0.12 + pseudoRandom(moss.seed + 541, index) * 0.18;
      const rawProgress = (now / cycleMs + pseudoRandom(moss.seed + 401, index)) % 1;
      let travelProgress = rawProgress;

      if (rawProgress >= pauseStart && rawProgress <= pauseStart + pauseDuration) {
        travelProgress = pauseStart;
      } else if (rawProgress > pauseStart + pauseDuration) {
        travelProgress = rawProgress - pauseDuration;
      }

      const movingSpan = 1 - pauseDuration;
      let progress = (travelProgress / movingSpan) % 1;
      if (direction < 0) {
        progress = 1 - progress;
      }

      const pathPosition = progress * asteroid.points.length;
      const pointIndex = Math.floor(pathPosition) % asteroid.points.length;
      const nextPointIndex = (pointIndex + 1) % asteroid.points.length;
      const blend = pathPosition - Math.floor(pathPosition);
      const point = asteroid.points[pointIndex];
      const nextPoint = asteroid.points[nextPointIndex];
      const angle = lerpAngle(point.angle, nextPoint.angle, blend);
      const distance = point.distance * (1 - blend) + nextPoint.distance * blend;
      const wobble = Math.sin(now / 380 + index * 1.7 + moss.seed) * 2.2;
      const crawlDistance = distance + 4 + wobble;
      const x = Math.cos(angle) * crawlDistance;
      const y = Math.sin(angle) * crawlDistance;
      const heading = angle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
      const scale = 0.75 + pseudoRandom(moss.seed + 499, index) * 0.55;

      this.context.save();
      this.context.translate(x, y);
      this.context.rotate(heading);
      this.context.scale(scale, scale);
      this.context.fillStyle = "rgba(197, 255, 175, 0.72)";
      this.context.strokeStyle = "rgba(96, 255, 170, 0.82)";
      this.context.lineWidth = 1.25;
      this.context.beginPath();
      this.context.ellipse(0, 0, 4.4, 2.5, 0, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.context.strokeStyle = "rgba(198, 255, 220, 0.52)";
      this.context.beginPath();
      this.context.moveTo(-3.4, -2.2);
      this.context.lineTo(-6.2, -4.2);
      this.context.moveTo(-3.4, 2.2);
      this.context.lineTo(-6.2, 4.2);
      this.context.moveTo(2.8, -2.0);
      this.context.lineTo(5.5, -3.5);
      this.context.moveTo(2.8, 2.0);
      this.context.lineTo(5.5, 3.5);
      this.context.stroke();
      this.context.restore();
    }
  }

  drawContractClaimTargets(camera = this.camera, canvas = this.canvas) {
    const targets = this.getContractClaimTargets();

    targets.forEach((target, index) => {
      if (!isVisible({ position: target.position, radius: target.claims?.length ? 900 : 260 }, canvas, camera)) {
        return;
      }

      const x = target.position.x - camera.x;
      const y = target.position.y - camera.y;
      const pulse = 0.6 + Math.sin(performance.now() / 360 + index) * 0.18;

      this.context.save();
      this.context.strokeStyle = "rgba(255, 58, 102, 0.82)";
      this.context.fillStyle = "rgba(255, 58, 102, 0.08)";
      this.context.lineWidth = 2;
      this.context.setLineDash([12, 8]);
      if (target.claims?.length) {
        target.claims.forEach((claim) => {
          if (!claim.vertices?.length) {
            return;
          }
          this.context.beginPath();
          claim.vertices.forEach((vertex, vertexIndex) => {
            const vx = vertex.x - camera.x;
            const vy = vertex.y - camera.y;
            if (vertexIndex === 0) {
              this.context.moveTo(vx, vy);
            } else {
              this.context.lineTo(vx, vy);
            }
          });
          this.context.closePath();
          this.context.fill();
          this.context.stroke();
        });
      } else if (target.claim?.vertices?.length) {
        this.context.beginPath();
        target.claim.vertices.forEach((vertex, vertexIndex) => {
          const vx = vertex.x - camera.x;
          const vy = vertex.y - camera.y;
          if (vertexIndex === 0) {
            this.context.moveTo(vx, vy);
          } else {
            this.context.lineTo(vx, vy);
          }
        });
        this.context.closePath();
        this.context.fill();
        this.context.stroke();
      } else {
        this.context.translate(x, y);
        this.context.beginPath();
        this.context.arc(0, 0, 190 + pulse * 10, 0, Math.PI * 2);
        this.context.fill();
        this.context.stroke();
        this.context.translate(-x, -y);
      }
      this.context.setLineDash([]);
      this.context.strokeStyle = "rgba(255, 232, 170, 0.9)";
      this.context.translate(x, y);
      this.context.beginPath();
      this.context.moveTo(0, -15);
      this.context.lineTo(13, 0);
      this.context.lineTo(0, 15);
      this.context.lineTo(-13, 0);
      this.context.closePath();
      this.context.stroke();
      this.context.fillStyle = "rgba(255, 232, 170, 0.92)";
      this.context.font = "12px system-ui, sans-serif";
      this.context.fillText(`PLOT ${index + 1}`, 18, 4);
      this.context.restore();
    });
  }

  drawContractAsteroidMarker(asteroid, camera = this.camera) {
    if (!this.isAsteroidLegalForActiveSourceContract(asteroid)) {
      return;
    }

    const x = asteroid.position.x - camera.x;
    const y = asteroid.position.y - camera.y;
    const pulse = 0.45 + Math.sin(performance.now() / 180 + asteroid.radius) * 0.2;

    this.context.save();
    this.context.translate(x, y);
    this.context.rotate(asteroid.rotation);
    this.context.strokeStyle = "rgba(255, 232, 170, 0.92)";
    this.context.lineWidth = 2;
    this.context.setLineDash([8, 6]);
    this.context.lineDashOffset = -performance.now() / 70;
    this.context.globalAlpha = 0.76 + pulse * 0.24;
    this.context.beginPath();
    if (asteroid.points?.length) {
      asteroid.points.forEach((point, index) => {
        const distance = point.distance + 7 + pulse * 3;
        const px = Math.cos(point.angle) * distance;
        const py = Math.sin(point.angle) * distance;

        if (index === 0) {
          this.context.moveTo(px, py);
        } else {
          this.context.lineTo(px, py);
        }
      });
      this.context.closePath();
    } else {
      this.context.arc(0, 0, asteroid.radius + 7 + pulse * 3, 0, Math.PI * 2);
    }
    this.context.stroke();
    this.context.restore();
  }

  isAsteroidLegalForActiveSourceContract(asteroid) {
    const contract = this.getActiveSourceLimitedContractForAsteroid(asteroid);
    if (!contract) {
      return false;
    }

    const sourceClaim = this.getAsteroidSourceClaim(asteroid);
    return contract.terms.sourceClaimIds.includes(sourceClaim?.id);
  }

  getActiveSourceLimitedContractForAsteroid(asteroid) {
    const dominantResource = getAsteroidDominantResource(asteroid);

    return Object.values(this.state.contracts?.records ?? {}).find((contract) => (
      contract.type === "resource-delivery" &&
      contract.status === "active" &&
      contract.terms?.sourceClaimIds?.length &&
      contract.terms.resourceType === dominantResource
    )) ?? null;
  }

  drawClaimField(camera, drawScale) {
    if (this.state.ui?.viewportLayout !== "fullscreen-background") {
      return;
    }

    const ctx = this.context;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const bounds = {
      minX: camera.x,
      minY: camera.y,
      maxX: camera.x + cw / drawScale,
      maxY: camera.y + ch / drawScale,
    };
    const network = this.claimField.getPlotNetwork(bounds);

    ctx.save();

    // â"€â"€ Hex fills: ore density drives brightness, zone color drives hue â"€â"€â"€â"€â"€â"€
    // Dark empty space stays near-invisible; rich ore pockets glow neon.
    network.plots.forEach((plot) => {
      const claim = this.claimField.getClaimAt(plot.center.x, plot.center.y);
      const intensity = claim.resourceIntensity;
      if (intensity < 0.06) return;

      const oreGlow = this.state.ui?.mapGlow ?? 0.20;
      const exponent = 0.3 + oreGlow * 1.2; // 0.3 flat â†’ 1.5 high-contrast
      const glow = Math.pow(intensity, exponent);
      const [cr, cg, cb] = claim.color;

      // Very dense patches push toward white-hot.
      const heat = Math.max(0, (intensity - 0.72) / 0.28);
      const r = Math.min(255, Math.round(cr * glow + 255 * heat * 0.4));
      const g = Math.min(255, Math.round(cg * glow + 255 * heat * 0.4));
      const b = Math.min(255, Math.round(cb * glow + 255 * heat * 0.4));
      const tileAlpha = this.state.ui?.mapAlpha ?? 0.40;
      const a = Math.min(1, (0.07 + glow * 0.33) * tileAlpha * 2.5).toFixed(2);

      ctx.beginPath();
      ctx.moveTo(
        (plot.vertices[0].x - camera.x) * drawScale,
        (plot.vertices[0].y - camera.y) * drawScale,
      );
      for (let i = 1; i < plot.vertices.length; i++) {
        ctx.lineTo(
          (plot.vertices[i].x - camera.x) * drawScale,
          (plot.vertices[i].y - camera.y) * drawScale,
        );
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.fill();
    });

    // â"€â"€ Dashed edges and vertex dots (unchanged from Codex) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    ctx.globalAlpha = 0.58;
    ctx.strokeStyle = "rgba(126, 162, 178, 0.72)";
    ctx.lineWidth = 1.1;
    ctx.setLineDash([16, 10]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    network.edges.forEach((edge) => {
      ctx.beginPath();
      ctx.moveTo((edge.a.x - camera.x) * drawScale, (edge.a.y - camera.y) * drawScale);
      ctx.lineTo((edge.b.x - camera.x) * drawScale, (edge.b.y - camera.y) * drawScale);
      ctx.stroke();
    });

    ctx.setLineDash([]);
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = "rgba(130, 184, 204, 0.82)";
    network.vertices.forEach((vertex) => {
      const x = (vertex.x - camera.x) * drawScale;
      const y = (vertex.y - camera.y) * drawScale;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  getViewportDrawScale() {
    return this.state.ui?.viewportLayout === "fullscreen-background"
      ? (this.state.ui?.viewportZoom ?? 1.0)
      : 1;
  }

  getDrawCamera(camera, scale) {
    if (scale === 1) {
      return camera;
    }

    const baseCameraX = camera.centerX - this.canvas.width / 2;
    const baseCameraY = camera.centerY - this.canvas.height / 2;
    const shakeX = camera.x - baseCameraX;
    const shakeY = camera.y - baseCameraY;
    const targetScreenX = this.canvas.width * 0.5;
    const targetScreenY = this.canvas.height * 0.5;

    return {
      ...camera,
      x: camera.centerX - targetScreenX / scale + shakeX,
      y: camera.centerY - targetScreenY / scale + shakeY,
    };
  }

  getDrawCanvas(scale) {
    if (scale === 1) {
      return this.canvas;
    }

    return {
      width: this.canvas.width / scale,
      height: this.canvas.height / scale,
    };
  }

  drawScanRings(camera = this.camera) {
    this.scanRings.forEach((ring) => {
      const t = ring.timer / SCAN_RING_DURATION;
      const radius = t * SCAN_RING_MAX_RADIUS;
      const alpha = (1 - t) * 0.65;
      const screenX = ring.x - camera.x;
      const screenY = ring.y - camera.y;

      this.context.save();
      this.context.strokeStyle = `rgba(126, 231, 255, ${alpha})`;
      this.context.lineWidth = 1.5;
      this.context.beginPath();
      this.context.arc(screenX, screenY, Math.max(1, radius), 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    });
  }

  drawPatrolIntercept(camera = this.camera) {
    if (!this.activePatrolIntercept) {
      return;
    }

    const patrol = this.activePatrolIntercept;
    const screenX = patrol.position.x - camera.x;
    const screenY = patrol.position.y - camera.y;
    const pulse = 0.45 + Math.sin(patrol.pulse * 7.2) * 0.18;
    const isIntercepting = patrol.phase === "standoff" || patrol.phase === "transit" || patrol.phase === "approach" || patrol.phase === "hold";

    this.context.save();

    // Dashed line to player only while actively intercepting.
    if (isIntercepting) {
      const shipX = this.ship.position.x - camera.x;
      const shipY = this.ship.position.y - camera.y;

      this.context.strokeStyle = `rgba(126, 231, 255, ${pulse})`;
      this.context.lineWidth = 1.5;
      this.context.setLineDash([4, 8]);
      this.context.beginPath();
      this.context.moveTo(screenX, screenY);
      this.context.lineTo(shipX, shipY);
      this.context.stroke();
      this.context.setLineDash([]);
    }

    this.context.translate(screenX, screenY);
    this.context.rotate(patrol.heading);

    // Swept wings behind the main body
    this.context.strokeStyle = "#7ee7ff";
    this.context.fillStyle = "rgba(126, 231, 255, 0.07)";
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.moveTo(-6, -13);
    this.context.lineTo(-22, -26);
    this.context.lineTo(-28, -18);
    this.context.lineTo(-15, -13);
    this.context.closePath();
    this.context.fill();
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(-6, 13);
    this.context.lineTo(-22, 26);
    this.context.lineTo(-28, 18);
    this.context.lineTo(-15, 13);
    this.context.closePath();
    this.context.fill();
    this.context.stroke();

    // Main hull
    this.context.fillStyle = "rgba(126, 231, 255, 0.12)";
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.moveTo(24, 0);
    this.context.lineTo(-10, -13);
    this.context.lineTo(-18, 0);
    this.context.lineTo(-10, 13);
    this.context.closePath();
    this.context.fill();
    this.context.stroke();

    // Inner V cockpit detail
    this.context.strokeStyle = "rgba(255, 255, 255, 0.72)";
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.moveTo(-2, -8);
    this.context.lineTo(11, 0);
    this.context.lineTo(-2, 8);
    this.context.stroke();

    // Engine glow dots at wing tips
    this.context.fillStyle = `rgba(126, 231, 255, ${0.5 + Math.sin(patrol.pulse * 6) * 0.2})`;
    this.context.beginPath();
    this.context.arc(-25, -21, 2.5, 0, Math.PI * 2);
    this.context.fill();
    this.context.beginPath();
    this.context.arc(-25, 21, 2.5, 0, Math.PI * 2);
    this.context.fill();

    this.context.restore();
  }

  drawTowCable(camera = this.camera) {
    if (this.towCable.phase === "idle") {
      return;
    }

    const cable = this.towCable;
    const anchorPosition = cable.phase === "attached" && cable.anchor ? cable.anchor.position : cable.hookPosition;

    if (!anchorPosition) {
      return;
    }

    const shipRearAngle = this.ship.angle + Math.PI;
    const shipRear = {
      x: this.ship.position.x + Math.cos(shipRearAngle) * 24,
      y: this.ship.position.y + Math.sin(shipRearAngle) * 24,
    };
    const shipX = shipRear.x - camera.x;
    const shipY = shipRear.y - camera.y;
    const hookX = anchorPosition.x - camera.x;
    const hookY = anchorPosition.y - camera.y;
    const pulse = 0.55 + Math.sin(cable.pulse * 9) * 0.2;

    this.context.save();
    this.context.strokeStyle = `rgba(255, 211, 107, ${0.58 + pulse * 0.22})`;
    this.context.lineWidth = cable.phase === "attached" ? 2.2 : 1.6;
    this.context.setLineDash(cable.phase === "attached" ? [10, 5] : [5, 8]);
    this.context.beginPath();
    this.context.moveTo(shipX, shipY);
    this.context.lineTo(hookX, hookY);
    this.context.stroke();
    this.context.setLineDash([]);

    this.context.translate(hookX, hookY);
    this.context.strokeStyle = cable.phase === "attached" ? "#ffd36b" : "#9ee8ff";
    this.context.fillStyle = cable.phase === "attached" ? "rgba(255, 211, 107, 0.18)" : "rgba(158, 232, 255, 0.12)";
    this.context.lineWidth = 1.7;
    this.context.beginPath();
    this.context.moveTo(9, 0);
    this.context.lineTo(-4, -7);
    this.context.lineTo(-2, 0);
    this.context.lineTo(-4, 7);
    this.context.closePath();
    this.context.fill();
    this.context.stroke();
    this.context.restore();
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

  drawWorldSites(camera = this.camera, canvas = this.canvas) {
    this.worldSites.forEach((site) => {
      const screenX = site.position.x - camera.x;
      const screenY = site.position.y - camera.y;
      const isNearby = this.nearbySite?.id === site.id;
      const isDocked = this.dockedSite?.id === site.id;

      if (
        screenX < -site.interactionRadius ||
        screenX > canvas.width + site.interactionRadius ||
        screenY < -site.interactionRadius ||
        screenY > canvas.height + site.interactionRadius
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

      if (isDocked) {
        const shipX = this.ship.position.x - camera.x;
        const shipY = this.ship.position.y - camera.y;
        this.context.strokeStyle = "rgba(255, 255, 255, 0.78)";
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

function closestPointOnSegment(point, start, end) {
  const segment = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  const segmentLengthSquared = segment.x * segment.x + segment.y * segment.y || 1;
  const amount = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * segment.x + (point.y - start.y) * segment.y) / segmentLengthSquared,
    ),
  );

  return {
    x: start.x + segment.x * amount,
    y: start.y + segment.y * amount,
  };
}

function getClaimsCenter(claims) {
  if (!claims.length) {
    return { x: 0, y: 0 };
  }

  const total = claims.reduce(
    (sum, claim) => ({
      x: sum.x + claim.center.x,
      y: sum.y + claim.center.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / claims.length,
    y: total.y / claims.length,
  };
}

function groupNearbyClaims(claims) {
  const remaining = [...claims];
  const groups = [];
  const adjacencyDistance = 780;

  while (remaining.length) {
    const group = [remaining.shift()];

    for (let index = 0; index < group.length; index += 1) {
      const claim = group[index];

      for (let remainingIndex = remaining.length - 1; remainingIndex >= 0; remainingIndex -= 1) {
        if (distance(claim.center, remaining[remainingIndex].center) <= adjacencyDistance) {
          group.push(remaining.splice(remainingIndex, 1)[0]);
        }
      }
    }

    groups.push(group);
  }

  return groups;
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

function getHubSensorRadius(site) {
  return site.interactionRadius * HUB_SENSOR_RADIUS_MULTIPLIER;
}

function describeDebugElement(element) {
  if (!element) {
    return "none";
  }

  const parts = [element.tagName?.toLowerCase?.() ?? "unknown"];

  if (element.id) {
    parts.push(`#${element.id}`);
  }

  if (element.classList?.length) {
    parts.push(`.${[...element.classList].slice(0, 3).join(".")}`);
  }

  const panel = element.closest?.("[data-panel-id], .panel, .journey-panel, .hub-service-window, .contract-card");
  if (panel?.dataset?.panelId) {
    parts.push(`panel:${panel.dataset.panelId}`);
  } else if (panel?.classList?.length) {
    parts.push(`inside:${[...panel.classList].slice(0, 2).join(".")}`);
  }

  return parts.join("");
}

function getInspectionCacheKey(site, identity) {
  return `${site.id}:${identity.entityId ?? identity.shipVin ?? "unknown"}`;
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

function getAsteroidDominantResource(asteroid) {
  if (asteroid.color === WHITE_ASTEROID_COLOR || !asteroid.resources) {
    return null;
  }

  return Object.entries(asteroid.resources)
    .filter(([resource]) => resource !== "stone")
    .reduce((best, [resource, amount]) => (amount > best.amount ? { resource, amount } : best), {
      resource: null,
      amount: 0,
    }).resource;
}

function getHostileEnemyType(lifeform) {
  return lifeform.role ?? lifeform.type ?? "hostile";
}

function getLifeformLabel(type) {
  return (
    {
      rockmoss: "Rockmoss Colony",
      lantern: "Lantern Drift",
      skitter: "Skitterweb Run",
      threadwyrm: "Threadwyrm Track",
      "drift-mouth": "Drift Mouth",
    }[type] ?? "unknown lifeform"
  );
}

function pseudoRandom(seed, index) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;

  return value - Math.floor(value);
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

  // Map to "fuel" or "crystal" for the two audio/visual states. Volatile and
  // strange resources use "crystal" (higher-pitched sound); everything else "fuel".
  const CRYSTAL_AUDIO_RESOURCES = new Set(["water-ice", "methane-ice", "hydrogen", "crystal-matrix", "anomaly-shard"]);
  return CRYSTAL_AUDIO_RESOURCES.has(dominantResource) ? "crystal" : "fuel";
}
