import { Bullet } from "./entities/Bullet.js?v=fresh-20260822-1210-0987ae13";
import { steerAroundObstacles } from "./systems/obstacleNavigation.js?v=fresh-20260822-1210-0987ae13";
import { breakAsteroid, WHITE_ASTEROID_COLOR } from "./entities/Asteroid.js?v=fresh-20260822-1210-0987ae13";
import { createResourcePickupsFromAsteroid, ResourcePickup } from "./entities/ResourcePickup.js?v=fresh-20260822-1210-0987ae13";
import { drawResourceShape } from "./entities/ResourcePickup.js?v=fresh-20260822-1210-0987ae13";
import { Ship } from "./entities/Ship.js?v=fresh-20260822-1210-0987ae13";
import { ShipWreck } from "./entities/ShipWreck.js?v=fresh-20260822-1210-0987ae13";
import { completeWreckSalvage, registerOwnedWreck } from "./systems/wreckRegistry.js?v=fresh-20260822-1210-0987ae13";
import { createAsteroidChunks } from "./systems/asteroidField.js?v=fresh-20260822-1210-0987ae13";
import { applyPanelPatch, getHullRepairRateMultiplier, HULL_REPAIR_DELAY_SECONDS, HULL_REPAIR_RATE, accumulatePanelWear, ensurePanelCondition, panelStageIndex, repairPanelCondition } from "./systems/panelMaintenance.js?v=fresh-20260822-1210-0987ae13";
import { ENGINE_CONDITION_CONFIG, computeEngineWearDelta, getEngineStageEffects } from "./systems/engineCondition.js?v=fresh-20260822-1210-0987ae13";
import { MINER_CONDITION_CONFIG, computeMinerWearPerShot, getMinerStageEffects } from "./systems/minerCondition.js?v=fresh-20260822-1210-0987ae13";
import { COLLECTOR_CONDITION_CONFIG, computeCollectorWearPerSecond, getCollectorStageEffects } from "./systems/collectorCondition.js?v=fresh-20260822-1210-0987ae13";
import { createCamera } from "./systems/camera.js?v=fresh-20260822-1210-0987ae13";
import { createInput } from "./systems/input.js?v=fresh-20260822-1210-0987ae13";
import { createAmbientLifeBatch, createGrazerAtFeast, createHunterNearShip, createHunterRespawn, createLifeField, seedChunkRockmoss } from "./systems/lifeField.js?v=fresh-20260822-1210-0987ae13";
import { ROCKMOSS_CRAWLER_TYPE, ROCKMOSS_STRAINS, pickRockmossStrain } from "./systems/rockmossStrains.js?v=fresh-20260822-1210-0987ae13";
import { GRAZING_DEFAULTS, advanceGrazing, findGrazingClusters, getGrazerSporeYield, isRipe } from "./systems/grazing.js?v=fresh-20260822-1210-0987ae13";
import { createRandom, hashNumbers } from "./systems/random.js?v=fresh-20260822-1210-0987ae13";
import { HAULER_PALETTES, RELIEF_HAULER_PALETTE, createNpcRouteShips, createRouteShip } from "./systems/npcRoutes.js?v=fresh-20260822-1210-0987ae13";
import { clearScreen, drawGrid, drawVector, isVisible } from "./systems/rendering.js?v=fresh-20260822-1210-0987ae13";
import { createResourceField } from "./systems/resourceField.js?v=fresh-20260822-1210-0987ae13";
import { createScanner } from "./systems/scanner.js?v=fresh-20260822-1210-0987ae13";
import { createDriftMouthField } from "./systems/driftMouthField.js?v=fresh-20260822-1210-0987ae13";
import { createIncursionField } from "./systems/incursionField.js?v=fresh-20260822-1210-0987ae13";
import { completeInternalProtectionResponse, ensurePatrolOperations, failInternalProtectionResponse, finishInternalProtectionReturn, getAvailablePatrolCraft, markPatrolCraftStatus, servicePatrolCraft, startInternalProtectionResponse } from "./systems/patrolOperations.js?v=fresh-20260822-1210-0987ae13";
import { createPatrolRuntimeActor } from "./systems/patrolRuntime.js?v=fresh-20260822-1210-0987ae13";
import { listPendingPatrolResponses } from "./systems/patrolDispatch.js?v=fresh-20260822-1210-0987ae13";
import { closeProtectionRequestsForThreat, evaluateProtectionThreat, getPlayerProtectionJobsForSite, reviewProtectionRequests } from "./systems/protectionPlanning.js?v=fresh-20260822-1210-0987ae13";
import { completePlayerProtectionRequest, completeProtectionContract, ensureProtectionProviders, failProtectionContract, finishProtectionReturn, serviceProtectionProviders, startProtectionContract } from "./systems/protectionProviders.js?v=fresh-20260822-1210-0987ae13";
import { fileAttackReport, nearestActiveReport, resolveAttackReport } from "./systems/securityReports.js?v=fresh-20260822-1210-0987ae13";
import { injectBountyJobs } from "./systems/bountyContracts.js?v=fresh-20260822-1210-0987ae13";
import { injectCargoRuns } from "./systems/cargoContracts.js?v=fresh-20260822-1210-0987ae13";
import { getStandingFreightJobsForSite } from "./systems/logistics.js?v=fresh-20260822-1210-0987ae13";
import { FIRST_REACH_TRANSPORT_CONNECTIONS } from "./content/transportation/firstReachNetwork.js?v=fresh-20260822-1210-0987ae13";
import { applyCorridorMaintenance, createTransportCorridors, getCorridorClearance } from "./systems/transportCorridors.js?v=fresh-20260822-1210-0987ae13";
import { getStandingMiningJobsForSite } from "./systems/miningOperation.js?v=fresh-20260822-1210-0987ae13";
import { generateSurveyContractDefinition, generateSurveyJobBoardDefinitions } from "./systems/surveyContracts.js?v=fresh-20260822-1210-0987ae13";
import { createEncounterDirector } from "./systems/encounterDirector.js?v=fresh-20260822-1210-0987ae13";
import { createPortalTrophy, getHostileLootCount, rollHostileLoot } from "./systems/hostileLoot.js?v=fresh-20260822-1210-0987ae13";
import { createThreadwyrmField } from "./systems/threadwyrmField.js?v=fresh-20260822-1210-0987ae13";
import { recordVisitedZone } from "./systems/legalRecords.js?v=fresh-20260822-1210-0987ae13";
import { getSectorDesignation } from "./systems/sectorCodes.js?v=fresh-20260822-1210-0987ae13";
import { sampleEnvironment, getFlowAngle } from "./systems/worldHazards.js?v=fresh-20260822-1210-0987ae13";
import { inspectPublicIdentity } from "./systems/authorityInspections.js?v=fresh-20260822-1210-0987ae13";
import { getRegistryEntityIdForSite, getRegistrySubject, rememberRegistrySubject } from "./systems/entityRegistry.js?v=fresh-20260822-1210-0987ae13";
import { createCommercialCraftPublicIdentity, createControlledShipPublicIdentity, createNpcShipPublicIdentity } from "./systems/publicIdentity.js?v=fresh-20260822-1210-0987ae13";
import { getZoneProfile, WORLD_ZONES, getZoneInfluence } from "./systems/worldZones.js?v=fresh-20260822-1210-0987ae13";
import { getRegionProfile } from "./systems/worldRegions.js?v=fresh-20260822-1210-0987ae13";
import { createClaimField } from "./systems/claimField.js?v=fresh-20260822-1210-0987ae13";
import { getContractGrantedClaimIds, getPlotRestriction } from "./systems/operatingRights.js?v=fresh-20260822-1210-0987ae13";
import { getNearbyWorldSite, getNearestWorldSite, getWorldSites, isInSiteRange } from "./systems/worldSites.js?v=fresh-20260822-1210-0987ae13";
import { createGameState } from "./state/gameState.js?v=fresh-20260822-1210-0987ae13";
import { canSpendCredits, debitCredits, depositCredits, getCredits, spendCredits } from "./systems/accounts.js?v=fresh-20260822-1210-0987ae13";
import { getResourceColor, getResourceShape } from "./systems/resourceDefinitions.js?v=fresh-20260822-1210-0987ae13";
import { terminateDestroyedActor } from "./systems/actorLifecycle.js?v=fresh-20260822-1210-0987ae13";

// Game is the main simulation coordinator for the viewport canvas. It owns world
// objects, advances gameplay rules, then reports display-ready state back to
// main.js so the page panels can stay dumb and component-like.
// Cargo transfer trail color per resource family (volatile = blue, strange = purple, else orange).
const CARGO_TRAIL_COLOR = {
  "water-ice":      "#b8eaff",
  "methane-ice":    "#7cd9e8",
  "hydrogen":       "#6fb5ff",
  "crystal-matrix": "#ff6fd8",
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
// Credits to service an engine fault at dock, by stage. Early service is
// cheaper — the incentive to fix it before it worsens. Interim pricing; the
// next slice moves this to material-conserving SPRC service via the same seam.
const ENGINE_CONDITION_REPAIR_COST = { healthy: 0, degraded: 45, emergency: 110, failed: 200 };
const MINER_CONDITION_REPAIR_COST = { healthy: 0, degraded: 40, emergency: 95, failed: 170 };
const COLLECTOR_CONDITION_REPAIR_COST = { healthy: 0, degraded: 35, emergency: 85, failed: 150 };
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
const PATROL_OBSTACLE_DEFLECTION = 2.6;
const TOW_APPROACH_SPEED = 108;
// The haul home runs under.
//
// A recovery tug carries a subspace drive and pulls its client down with it,
// which is why a towed ship passes through rocks instead of grinding along them.
// That exemption already existed with no reason attached; naming it makes the
// world consistent — the tug and its client are BOTH under, so neither the hull
// nor the cable is fighting the field on the way back.
//
// Deliberately a multiplier and not a jump. The distance is still crossed and
// the pilot still waits; being recovered from the far frontier should feel like
// a long ride home, just not a punishing one.
const TOW_SUBSPACE_MULTIPLIER = 2.5;
const TOW_RETURN_SPEED = 88 * TOW_SUBSPACE_MULTIPLIER;
const TOW_ATTACH_DISTANCE = 84;
const TOW_DELIVERY_DISTANCE = 48;
const TOW_LINE_LENGTH = 120;
const TOW_LINE_STIFFNESS = 2.8;
const TOW_LINE_DAMPING = 0.965;
// How close to its station the tug starts slowing down. Without this it steers
// at full speed right up to the target, overshoots, and oscillates forever.
const TOW_ARRIVE_RADIUS = 150;
// On station, and long enough to count as parked rather than passing through.
const TOW_STATION_DISTANCE = 60;
const TOW_STATION_SETTLE_SECONDS = 1.2;
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
const MOSS_SEEDER_LAUNCH_SPEED = 245;
const MOSS_SEEDER_REAR_OFFSET = 34;
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
const PATROL_WEAPON_RANGE = 780;
const PATROL_WEAPON_COOLDOWN_SECONDS = 0.34;
const PATROL_WEAPON_DAMAGE = 48;
const PATROL_PORTAL_WEAPON_DAMAGE = 32;
const PATROL_COMBAT_SPEED = 172;
const PATROL_COMBAT_STANDOFF_DISTANCE = 300;
// A gate is a gate: any patrol engages an open rift within sight of where it
// currently is, whatever its errand, rather than flying past one because it
// "belongs" to another hub's jurisdiction. Beyond weapon range so the patrol
// closes to fight rather than only shooting what is already in its lap.
const PATROL_GATE_SIGHT_RANGE = 1900;
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
// Streaming ambient-life director. Keeps a target population of creatures near
// the ship wherever it flies (target scales with the local zone's life bias),
// and despawns procedural creatures the ship has left far behind so the array
// stays bounded over a long session.
const AMBIENT_LIFE_INTERVAL_SECONDS = 1.2;
const AMBIENT_LIFE_BASE = 8;
const AMBIENT_LIFE_SCALE = 14; // target ≈ 16 in default space, ≈ 28 in lively zones
const AMBIENT_LIFE_FLOCKS_PER_TICK = 2;
const AMBIENT_LIFE_KEEP_RADIUS = 1500; // tighter, so flocks read as dense on-screen
const AMBIENT_LIFE_DESPAWN_RADIUS = 3600;
// Flocking and separation are neighbour-based, so cost rises much faster than
// population. This ceiling is deliberately above every natural zone target:
// it only catches overshoot and old-run accumulation, not ordinary ecology.
const AMBIENT_LIFE_LOCAL_HARD_CAP = 40;
const AMBIENT_LIFE_TYPES = new Set(["grazer", "skitter", "threadling", "lantern", "hunter", "bloom", "filament"]);
// Rock-life surfaces at a feast, but a spill should never become a swarm: one
// at a time, with a breath between, up to a ceiling.
const GRAZER_EMERGENCE_CAP = 26;
const GRAZER_EMERGE_INTERVAL_SECONDS = 1.6;
// Rocks drift, but not fast enough to justify recomputing reach every frame.
const GRAZE_REACH_REFRESH_SECONDS = 0.25;
const GRAZE_REACH_REFRESH_BUDGET = 24;
const GRAZE_PLAN_REFRESH_SECONDS = 0.2;
// Re-exported from the strain table rather than re-declared, so the spore's id
// and its appearance cannot drift apart.
const ROCKMOSS_WORK_DISTANCE_PER_PATCH = 170;
const ROCKMOSS_MIN_PATCHES = 1;
// Pod-strain self-spread guardrails: a mature pod seeds one nearby bare rock at
// most this often, within this range, and only until the neighbourhood hits the
// density cap — so it colonizes gradually instead of blanketing the field.
const ROCKMOSS_SPREAD_INTERVAL = 28;
const ROCKMOSS_SPREAD_RANGE = 720;
const ROCKMOSS_SPREAD_DENSITY_CAP = 6;
const INCURSION_PORTAL_BULLET_DAMAGE = 38;
const INCURSION_PORTAL_BASE_REWARD = 180;
const INCURSION_HUB_EXCLUSION_BUFFER = 180;
const INCURSION_OBJECTIVE_SPAWN_CHANCE = 0.32;
const INCURSION_OBJECTIVE_MIN_OFFSET = 560;
const INCURSION_OBJECTIVE_MAX_OFFSET = 920;
const INCURSION_AMBIENT_FIRST_SECONDS = 45;
const INCURSION_AMBIENT_REPEAT_MIN_SECONDS = 90;
const INCURSION_AMBIENT_REPEAT_MAX_SECONDS = 130;
const INCURSION_MAX_ACTIVE_PORTALS = 2;
// Defense jurisdiction is wider than patrol-creation range on purpose: ambient
// portals spawn relative to the ship (1050-1700 out), so a patrol judging
// threats by the old 4.2x creation radius ignored portals sitting just past
// its idle loop. See docs/encounter-director-roadmap.md, Stage 2.
const INCURSION_DEFENSE_JURISDICTION_FACTOR = 8;
const PROTECTION_REVIEW_INTERVAL_MS = 5000;
const INCURSION_SENTINEL_RANGE = 700;
const INCURSION_SENTINEL_SHOT_SPEED = 245;
const INCURSION_SENTINEL_SHOT_SECONDS = 3.2;
const INCURSION_SENTINEL_DAMAGE = 9;
const INCURSION_DRAG_BLOOM_DAMPING = 0.34;
const INCURSION_RIFT_MINE_RANGE = 250;
const INCURSION_RIFT_MINE_SHOT_SPEED = 155;
const INCURSION_RIFT_MINE_SHOT_SECONDS = 2.8;
const INCURSION_RIFT_MINE_SHOT_DAMAGE = 6;
const INCURSION_RIFT_MINE_COOLDOWN_SECONDS = 4.8;

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
    if (!this.state.components.mossSeeder) {
      this.state.components.mossSeeder = {
        installed: false,
        status: "No crawler cargo",
        shotsFired: 0,
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
    this.patrolOperations = ensurePatrolOperations(this.state);
    this.transportCorridors = createTransportCorridors({ destinations: this.worldSites, connections: FIRST_REACH_TRANSPORT_CONNECTIONS });
    this.corridorBoostCooldowns = new Map();
    this.chunkManager = createAsteroidChunks(canvas, this.resourceField, this.transportCorridors);
    const { added: initialAsteroids } = this.chunkManager.update(0, 0);
    this.asteroids = initialAsteroids;
    this.lifeforms = createLifeField(this.asteroids);
    this.ambientLifeTimer = 0;
    this.ambientLifeSeed = 4200;
    this.threadwyrms = createThreadwyrmField(this.asteroids);
    this.driftMouths = createDriftMouthField();
    this.incursionField = createIncursionField();
    this.incursionShots = [];
    this.incursionDirector = {
      nextSpawnIn: INCURSION_AMBIENT_FIRST_SECONDS,
    };
    this.encounterDirector = createEncounterDirector({
      getStat: (key, fallback) => this.state.ledger.getStat(key, fallback),
    });
    this.lifeDisturbances = [];
    this.lifeformContacts = new Set();
    this.npcShips = createNpcRouteShips(this.worldSites);
    // Logistics can commission a hauler when a carrier is turning freight away.
    // The world owns the physical ship, so it builds it and hands it back.
    this.commissionHauler = ({ id, name, homeSiteId, seed, carrierInstitutionId }) => {
      const hubs = this.worldSites.filter((site) => site.type === "hub");
      const home = hubs.find((site) => site.id === homeSiteId) ?? hubs[0];
      const other = hubs.find((site) => site.id !== home?.id);
      if (!home || !other) return null;
      const palette = HAULER_PALETTES[carrierInstitutionId] ?? RELIEF_HAULER_PALETTE;
      const owner = this.state.logistics?.institutions?.[carrierInstitutionId] ?? { id: carrierInstitutionId };
      const operator = this.state.logistics?.institutions?.[owner.controllerInstitutionId] ?? {
        id: `${carrierInstitutionId}:relief-operator`, name: `${name} Operator`,
        license: { id: `HLC-${id.toUpperCase()}`, class: "commercial-hauler", status: "active" },
      };
      const shipRecord = { id: `ship:${id}`, name, referenceId: `HAUL-${id.toUpperCase()}` };
      const publicIdentity = createCommercialCraftPublicIdentity({
        ship: shipRecord, owner, operator,
        registeredHubIds: hubs.map((site) => site.id), authorizedActivities: ["transport-freight"],
      });
      // Give each commissioned craft its own berth lane. Multiple sponsored
      // haulers used to be born and later dock on the exact same -140 lane,
      // which turned busy hubs into a knot of overlapping cargo trains.
      //
      // Every band stays inside MAX_BERTH_LANE_OFFSET. The original set reached
      // ±225 against a 150-unit arrival radius, and the craft that drew ±225
      // could settle just outside the radius of a waypoint on a corridor bend
      // and stop advancing for good. Spreading berths must not cost a craft the
      // ability to arrive anywhere.
      const berthBands = [-140, 140, -105, 105, -70, 70];
      const laneOffset = berthBands[Math.abs(seed ?? 9) % berthBands.length];
      const ship = createRouteShip(id, name, [home, other], seed ?? 9, laneOffset, operator.name, other.id, palette, publicIdentity);
      this.npcShips.push(ship);
      return ship;
    };
    this.workerShips = [];
    this.wrecks = [];
    this.workerShots = [];
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
    // Engine-condition runtime state (persistent wear lives in state.components).
    this.conditionDebugScale = 1; // dev accelerator; see setConditionDebugScale
    this.engineMisfireRemaining = 0;
    this.engineSteerBias = 0;
    this.minerAimBias = 0; // slow-wandering aim offset from mining-laser wear
    this.collectorDropoutRemaining = 0; // tractor-field grip flicker window
    this.collectorPushRemaining = 0; // malfunctioning field shove-away pulse window
    this.viewportTitle = null;
    this.viewportTitleTimer = 0;
    this.discoveredSiteIds = new Set();
    this.currentZoneId = null;
    this.currentSectorId = null;
    this.environmentSample = null;
    this.environmentFeedbackTimer = 0;
    this.inEnvironmentFieldId = null;
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
    this.activePatrolIntercepts = [];
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
      this.setCloakActive(false);
      this.input.clearGameKeys();
      this.ship.stopBoosting();
      this.fireCooldown = 0;
      this.state.components.collector.isActive = false;
      this.ship.stopThrusting();
    }
  }

  setCloakActive(isActive) {
    const cloak = this.state.components.cloak;
    const canCloak = cloak.installed && this.state.components.engine.powered && !this.shipDestroyed;
    const nextState = Boolean(isActive && canCloak);

    if (cloak.isActive === nextState) {
      return;
    }

    cloak.isActive = nextState;
    this.ship.isCloaked = nextState;
    this.state.ledger.recordEvent(
      nextState ? "cloak.engaged" : "cloak.disengaged",
      { x: Math.round(this.ship.position.x), y: Math.round(this.ship.position.y) },
      { visible: false },
    );
    this.onHudChange(this.state);
  }

  isShieldActive() {
    const shield = this.state.components.shield;
    return Boolean(
      shield.installed &&
        shield.isActive &&
        this.state.components.engine.powered &&
        !this.shipDestroyed &&
        this.state.components.miner.ammo > 0,
    );
  }

  isShipDetectable() {
    return this.state.components.engine.powered && !this.state.components.cloak.isActive && !this.shipDestroyed;
  }

  getShipCollisionRadius() {
    return this.isShieldActive() ? this.state.components.shield.radius : SHIP_COLLISION_RADIUS;
  }

  updateShield(deltaSeconds) {
    const shield = this.state.components.shield;
    const miner = this.state.components.miner;

    if (!this.isShieldActive()) {
      shield.isActive = false;
      return;
    }

    miner.ammo = Math.max(0, miner.ammo - shield.chargeBurnRate * deltaSeconds);
    if (miner.ammo === 0) {
      shield.isActive = false;
    }
  }

  absorbShieldImpact(impactBody, type) {
    if (!this.isShieldActive()) {
      return false;
    }

    this.createShieldSparks(impactBody);
    this.state.ledger.recordEvent(
      "shield.absorbedImpact",
      { type, x: Math.round(this.ship.position.x), y: Math.round(this.ship.position.y) },
      { visible: false },
    );
    return true;
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
    const incursionBeacons = this.incursionField.getActivePortals().map((portal) => ({
      id: `incursion-${portal.id}`,
      beaconId: `incursion-${portal.id}`,
      name: `Rift Incursion ${portal.waveCount}`,
      position: portal.position,
      type: "incursion",
      portalId: portal.id,
    }));

    return [...rememberedHubs, ...personalBeacons, ...contractBeacons, ...ecologyBeacons, ...incursionBeacons];
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

  // Contract-reads-world: a hub service asks for a survey contract and gets
  // one written from the ore clusters that actually exist around the site.
  generateSurveyContract(site, issuer = null) {
    return generateSurveyContractDefinition({
      site,
      issuer,
      resourceField: this.resourceField,
      chunkSize: this.canvas.width,
    });
  }

  generateSurveyJobBoard(site, issuer = null) {
    const surveyJobs = generateSurveyJobBoardDefinitions({
      site,
      issuer,
      resourceField: this.resourceField,
      chunkSize: this.canvas.width,
    });

    // Combat sibling of the survey board: qualifying tiers with a real danger
    // pocket nearby swap their ore brief for a proof-of-kill bounty. Cargo runs
    // then take some of the tiers bounty left alone, routing freight to a real
    // hub. Order matters - cargo only swaps jobs still typed resource-delivery.
    const withBounties = injectBountyJobs({ site, issuer, jobs: surveyJobs });
    const jobs = injectCargoRuns({ site, issuer, jobs: withBounties, sites: this.worldSites });

    // A board that came out all-mining reads as three near-identical "get ore,
    // sell here" briefs. Force one tier into a freight run (which routes to
    // ANOTHER hub) so every board offers more than digging when a hub is
    // reachable. random: () => 0 forces the swap past the usual chance gate.
    if (jobs.length > 0 && jobs.every((job) => job.type === "resource-delivery")) {
      for (const index of [1, 2, 0]) {
        if (!jobs[index]) {
          continue;
        }
        const [forced] = injectCargoRuns({ site, issuer, jobs: [jobs[index]], sites: this.worldSites, random: () => 0 });
        if (forced.type === "cargo-run") {
          jobs[index] = forced;
          break;
        }
      }
    }

    // Pass state so the player sees the same live board the NPC miners do:
    // real quantities at the price the hub is currently posting, and nothing at
    // all where a hub has no gap to fill.
    //
    // Provenance is marked on every entry. Authored work is scripted story
    // content that exists whether or not anyone needs it; generated work exists
    // only because an institution has a real, current need, and its terms move
    // with that need. They read very differently and should not be confused.
    const authored = jobs.map((job) => ({ ...job, provenance: "authored", provenanceLabel: "Scripted" }));
    const generated = [
      ...getStandingMiningJobsForSite(site.id, issuer, this.state),
      ...getStandingFreightJobsForSite(site.id, issuer, this.state),
      ...getPlayerProtectionJobsForSite(this.state, site.id, issuer),
    ].map((job) => ({ ...job, provenance: "generated", provenanceLabel: "Live demand" }));
    return [...authored, ...generated];
  }

  spawnIncursionPortal(position = null) {
    const objectivePosition = position ? null : this.getIncursionObjectiveSpawnPosition();
    const requestedPosition = position ?? objectivePosition ?? this.getAmbientIncursionSpawnPosition();
    const safePosition = getIncursionSafePosition(requestedPosition, this.worldSites, this.ship.position);
    const spawnPosition = position ? safePosition : this.clampIncursionIntoHubJurisdiction(safePosition);
    const encounterContext = getIncursionWorldContext(spawnPosition);
    const { portal, spawned } = this.incursionField.spawnPortal({
      x: spawnPosition.x,
      y: spawnPosition.y,
      seed: this.state.ledger.eventCount + 1200,
      pacing: this.encounterDirector.getIncursionPacing(),
      encounterContext,
    });

    this.lifeforms.push(...spawned);
    this.state.ledger.recordEvent("incursion.portalOpened", {
      portalId: portal.id,
      factionId: portal.factionId,
      waveCount: portal.waveCount,
      enemyCount: spawned.length,
      zoneId: encounterContext.zoneId,
      regionId: encounterContext.regionId,
      zoneTags: encounterContext.tags,
      x: Math.round(portal.position.x),
      y: Math.round(portal.position.y),
    });
    evaluateProtectionThreat(this.state, this.worldSites, {
      id: portal.id,
      type: "incursion portal",
      position: portal.position,
      waveCount: portal.waveCount,
      enemyCount: spawned.length,
    });
    // A gate opening is an attack on the region. It goes on the distress channel
    // so patrols steer toward it and the observatory can see who is calling for
    // help — severity scales with the gate's wave strength.
    fileAttackReport(this.state, {
      threatId: portal.id, position: portal.position, kind: "gate",
      severity: Math.min(1, 0.5 + portal.waveCount * 0.02),
      siteId: this.nearestSiteId(portal.position),
    });
    this.onHudChange(this.state);
    return portal;
  }

  getAmbientIncursionSpawnPosition() {
    const angle = Math.random() * Math.PI * 2;
    const distanceFromShip = 1050 + Math.random() * 650;

    return {
      x: this.ship.position.x + Math.cos(angle) * distanceFromShip,
      y: this.ship.position.y + Math.sin(angle) * distanceFromShip,
    };
  }

  // When the player is inside a hub's patrol territory, a portal opening near
  // them should be that hub's problem  pull it inside defense jurisdiction so
  // the patrol actually engages instead of circling its idle loop beside it.
  clampIncursionIntoHubJurisdiction(portalPosition) {
    const homeHub = this.worldSites.find((site) =>
      site.type === "hub" &&
      distance(this.ship.position, site.position) <= site.interactionRadius * PATROL_CREATE_RANGE_FACTOR,
    );

    if (!homeHub) {
      return portalPosition;
    }

    const jurisdictionRadius = homeHub.interactionRadius * INCURSION_DEFENSE_JURISDICTION_FACTOR;
    const distanceToHub = distance(portalPosition, homeHub.position);

    if (distanceToHub <= jurisdictionRadius) {
      return portalPosition;
    }

    const towardPortal = normalizeVector(portalPosition.x - homeHub.position.x, portalPosition.y - homeHub.position.y);
    return {
      x: homeHub.position.x + towardPortal.x * jurisdictionRadius,
      y: homeHub.position.y + towardPortal.y * jurisdictionRadius,
    };
  }

  getIncursionObjectiveSpawnPosition() {
    if (Math.random() > INCURSION_OBJECTIVE_SPAWN_CHANCE) {
      return null;
    }

    const targets = this.getContractClaimTargets()
      .filter((target) => target.position)
      .filter((target) => distance(this.ship.position, target.position) > 900);

    if (!targets.length) {
      return null;
    }

    const target = targets[Math.floor(Math.random() * targets.length)];
    const angle = Math.random() * Math.PI * 2;
    const offset = INCURSION_OBJECTIVE_MIN_OFFSET + Math.random() * (INCURSION_OBJECTIVE_MAX_OFFSET - INCURSION_OBJECTIVE_MIN_OFFSET);

    return {
      x: target.position.x + Math.cos(angle) * offset,
      y: target.position.y + Math.sin(angle) * offset,
    };
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
    this.recordScan({ type: "ship", id: this.state.ship?.vin ?? "controlled-ship", name: this.state.ship?.name ?? "Explorer One" }, { name: "nearby resources and sites", entityId: "local-survey-area" }, "resource-survey");
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

  // Advance only the physical actors that can move material through the
  // economy. This is intentionally a Game method rather than a probe-side
  // imitation: workers still use their real flight, targeting, tractor,
  // collection and shot/asteroid collision path, while freight ships still
  // complete the routes represented by institutional shipments.
  //
  // Asteroids themselves do not need update() here. Their update is cosmetic
  // drift around a fixed origin; keeping the complete array available to
  // workers is the economically significant part. Passing no collision rocks
  // to freight avoids the all-ships-by-all-rocks navigation cost without
  // changing route progress or arrivals.
  updateEconomy(deltaSeconds) {
    this.updateNpcShips([], deltaSeconds);
    this.updateWorkerShips(deltaSeconds);
    this.npcShips = this.npcShips.filter((ship) => ship.isAlive);
    this.workerShips = this.workerShips.filter((ship) => ship.isAlive);
    this.pickups.forEach((pickup) => pickup.update(deltaSeconds));
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
    const previousAmmo = this.state.components.miner.ammo;
    this.tryForwardBoost(directInputSuspended);
    // Order matters: ship/world state is advanced first, then collisions and UI
    // readouts are derived from the updated world.
    this.ship.cloakConfig = this.state.components.cloak;
    this.ship.isCloaked = Boolean(this.state.components.cloak.isActive);
    this.updateCorridorTravelEffects(deltaSeconds);
    // Set this frame's engine-condition modifiers (thrust scale, misfire block,
    // steering pull) BEFORE the ship consumes them.
    this.applyEngineConditionEffects(deltaSeconds);
    // Slowly wander the mining laser's aim bias so a worn emitter drifts off the
    // reticle (the player compensates); firing reads this bias.
    this.applyMinerConditionEffects(deltaSeconds);
    this.ship.update(deltaSeconds, this.input);
    // Accrue wear from what the ship actually did this frame, then react to any
    // stage change.
    this.updateEngineCondition(deltaSeconds);
    if (previousFuel > 0 && this.state.components.engine.fuel <= 0 && this.state.components.engine.powered) {
      this.setShipPowered(false);
    }
    this.updateBeaconRecovery(deltaSeconds);
    this.updateShield(deltaSeconds);
    this.audio?.updateEngine({
      powered: this.state.components.engine.powered && !this.shipDestroyed,
      thrusting: this.ship.isThrusting && !this.shipDestroyed,
    });
    this.updatePlayerThrustEvent();
    this.updateMovementEvent();
    this.updateWorldSiteInteraction();
    this.updateZoneTitle();
    this.updateSectorTitle();
    this.updateEnvironmentalHazards(deltaSeconds);
    if (this.state.components.engine.fuel !== previousFuel || this.state.components.miner.ammo !== previousAmmo) {
      this.onHudChange(this.state);
    }
    this.updateLowFuelEvent(previousFuel);
    this.updateStrandedEvent(previousFuel);
    this.updateShooting();
    this.bullets.forEach((bullet) => bullet.update(deltaSeconds));
    this.updateAsteroidHits();
    this.bullets = this.bullets.filter((bullet) => bullet.isAlive);
    this.updateAsteroidChunks();
    // Only asteroids near the player are simulated, the same way lifeforms are
    // (see below). Asteroid.update is cosmetic drift that springs back to
    // origin, and corridor maintenance only matters where ships actually fly,
    // so neither is visible or load-bearing for an off-screen rock. The field
    // streams a full chunk around every worker ship, and once the miners fan
    // out across the map that is thousands of rocks — paying update() for all
    // of them every frame was the whole frame budget. Mining harvests from the
    // resource field, not these objects, so freezing distant ones is invisible.
    const simulatedAsteroids = this.asteroids.filter((asteroid) =>
      isNearSimulationArea(asteroid, this.canvas, this.camera, this.ship, LIFE_SIMULATION_MARGIN),
    );
    simulatedAsteroids.forEach((asteroid) => asteroid.update(deltaSeconds));
    simulatedAsteroids.forEach((asteroid) => applyCorridorMaintenance(asteroid, this.transportCorridors, deltaSeconds));
    this.updateTowCable(deltaSeconds);
    this.updateRockmossLifecycle(deltaSeconds);
    this.updateMossHarvester(deltaSeconds);
    this.updateHubDefenses(deltaSeconds);
    this.updateLifeDisturbances(deltaSeconds);
    // activeHunterCount is last frame's value here; one frame of staleness is
    // fine for a pressure signal sampled every couple of seconds.
    this.encounterDirector.update(deltaSeconds, {
      hullIntegrity: this.state.components.hull.integrity,
      hullMaxIntegrity: this.state.components.hull.maxIntegrity,
      nearbyHostileCount: this.activeHunterCount,
      economy: this.getEncounterEconomyStress(),
    });
    this.updateIncursions(deltaSeconds);
    this.updateIncursionShots(deltaSeconds);
    // Runs after every damage source this frame so fresh hits reset the settle
    // timer before any patching resumes.
    this.updateHullRepair(deltaSeconds);
    this.updateAmbientLife(deltaSeconds);
    // Lifeforms are preserved off-screen, but only nearby ones are simulated.
    // That keeps the field feeling persistent without paying every steering
    // cost for every distant creature each frame.
    const incursionTargets = this.getIncursionAttackableTargets();
    const activeLifeforms = this.lifeforms.filter((lifeform) =>
      isNearSimulationArea(lifeform, this.canvas, this.camera, this.ship, LIFE_SIMULATION_MARGIN)
      || (lifeform.sourcePortalId && incursionTargets.some((target) => distance(lifeform.position, target.position) <= LIFE_SIMULATION_MARGIN * 1.8)),
    );
    const activeAsteroids = this.asteroids.filter((asteroid) =>
      isNearSimulationArea(asteroid, this.canvas, this.camera, this.ship, LIFE_SIMULATION_MARGIN),
    );
    activeLifeforms.forEach((lifeform) => {
      lifeform.update(deltaSeconds, {
        asteroids: activeAsteroids,
        lifeforms: activeLifeforms,
        ship: this.ship,
        shipPowered: this.isShipDetectable(),
        attackableTargets: incursionTargets,
        disturbances: this.lifeDisturbances,
        portalPosition: lifeform.sourcePortalId
          ? this.incursionField.getActivePortals().find((portal) => portal.id === lifeform.sourcePortalId)?.position
          : null,
      });
      if (lifeform.type === "fighter") {
        this.incursionShots.push(...lifeform.consumeShots());
      }
    });
    this.activeLifeformCount = activeLifeforms.length;
    this.activeHunterCount = activeLifeforms.filter((lifeform) => lifeform.type === "hunter").length;
    this.updateSkitterWebHazards(activeLifeforms, deltaSeconds);
    this.updateHunterEnvironmentalHits(activeLifeforms, activeAsteroids, deltaSeconds);
    this.updateFlightFighterEnvironmentalHits(activeLifeforms, activeAsteroids, deltaSeconds);
    this.updateHostileHits();
    this.updateIncursionPortalHits();
    this.updateThreadwyrms(deltaSeconds);
    this.updateDriftMouths(deltaSeconds, activeLifeforms);
    this.updateLifeformContacts(activeLifeforms);
    this.updateNpcShips(activeAsteroids, deltaSeconds);
    this.updateWorkerShips(deltaSeconds);
    this.reviewProtectionMarket();
    this.dispatchPendingProtectionPatrol();
    this.updatePatrolIntercepts(deltaSeconds);
    this.updateScanRings(deltaSeconds);
    this.updateEmergencyTow(deltaSeconds);
    this.updateNpcBulletHits();
    this.bullets = this.bullets.filter((bullet) => bullet.isAlive);
    this.lifeforms = this.lifeforms.filter((lifeform) => lifeform.isAlive && !this.shouldDespawnAmbientLife(lifeform));
    this.npcShips = this.npcShips.filter((ship) => ship.isAlive);
    this.workerShips = this.workerShips.filter((ship) => ship.isAlive);
    this.wrecks.forEach((wreck) => wreck.update(deltaSeconds));
    this.pickups.forEach((pickup) => pickup.update(deltaSeconds));
    this.updateGrazing(deltaSeconds, activeLifeforms, activeAsteroids);
    this.updateRockmossSpores();
    this.updateParticles(deltaSeconds);
    this.updateSiteDefenseBeams(deltaSeconds);
    this.updateCollector(deltaSeconds);
    this.collectPickups();
    this.scanner.update(deltaSeconds);
    // Developer camera focus: follow an inspected actor instead of the ship.
    // Any flight input hands the camera straight back, so this can never trap
    // the player. Reads the input keys rather than the derived isThrusting flag,
    // which is recomputed every frame and easy to miss.
    if (this.cameraFocusTarget) {
      const flyingKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"];
      const flying = this.ship.isThrusting || flyingKeys.some((key) => this.input.isDown(key));
      // Note: while ship input is suspended (docked, story beats) neither signal
      // fires — but the player cannot fly then either, and the panel's explicit
      // "Release camera" button always works.
      if (this.cameraFocusTarget.isAlive === false || flying) {
        this.cameraFocusTarget = null;
      }
    }
    this.camera.follow(this.cameraFocusTarget ?? this.ship, deltaSeconds);
    this.updateStoryEventSensors(activeAsteroids, activeLifeforms, deltaSeconds);
    if (this.state.components.scanner.scanergy !== previousScanergy) {
      this.onHudChange(this.state);
    }
    this.updateDebugReadout();
    this.updateSiteReadout();
    this.input.finishFrame();
  }

  getIncursionAttackableTargets() {
    const targets = [];
    if (!this.shipDestroyed && this.isShipDetectable()) {
      targets.push({
        id: "player-ship", kind: "player-ship", body: this.ship,
        position: this.ship.position, velocity: this.ship.velocity,
        radius: this.getShipCollisionRadius(), detectable: true,
        strategicValue: 1.15, vulnerability: 1,
      });
    }
    this.npcShips.filter((ship) => ship.isAlive).forEach((ship) => targets.push({
      id: ship.id, kind: "freight-ship", body: ship,
      position: ship.position, velocity: ship.velocity, radius: ship.radius,
      // A wounded civilian broadcasts distress and runs dark instead of becoming
      // progressively MORE attractive to every fighter. Cargo still makes a
      // healthy freighter valuable, while a retreating hull can disengage.
      detectable: ship.operationalStatus !== "maintenance" && ship.hull / 180 > 0.35,
      strategicValue: ship.activeShipmentId ? 1.2 : 0.65,
      vulnerability: 0.45 + 0.55 * Math.max(0, ship.hull / 180),
    }));
    this.workerShips.filter((ship) => ship.isAlive).forEach((ship) => targets.push({
      id: ship.id, kind: "mining-ship", body: ship,
      position: ship.position, velocity: ship.velocity, radius: ship.radius,
      detectable: true, strategicValue: ship.assignment ? 1.35 : 0.8,
      vulnerability: Math.max(0.4, 1.4 - ship.hull / ship.maxHull),
    }));
    this.activePatrolIntercepts.filter((patrol) => patrol.isAlive).forEach((patrol) => targets.push({
      id: patrol.id, kind: "patrol-ship", body: patrol,
      position: patrol.position, velocity: patrol.velocity, radius: patrol.radius,
      detectable: true, strategicValue: 1.7,
      vulnerability: Math.max(0.4, 1.4 - patrol.hull / patrol.maxHull),
    }));
    return targets;
  }

  getEncounterEconomyStress() {
    const productiveCraft = [
      ...this.npcShips.map((ship) => ({ hull: ship.hull, maxHull: 180 })),
      ...this.workerShips.map((ship) => ({ hull: ship.hull, maxHull: ship.maxHull ?? 120 })),
    ];
    const criticalCraftCount = productiveCraft.filter((craft) =>
      craft.hull > 0 && craft.maxHull > 0 && craft.hull / craft.maxHull <= 0.5,
    ).length;
    const openRepairCount = Object.values(this.state.sprc?.repairOrders ?? {})
      .filter((order) => !["completed", "canceled"].includes(order.status)).length;
    const wreckRecords = this.state.wrecks?.records ?? {};
    const openSalvageCount = Object.values(wreckRecords)
      .filter((wreck) => !["salvaged", "recovered", "closed"].includes(wreck.status)).length;
    const unfilledProtectionCount = Object.values(this.state.protectionPlanning?.requests ?? {})
      .filter((request) => ["offered", "withheld"].includes(request.status)).length;
    return { criticalCraftCount, openRepairCount, openSalvageCount, unfilledProtectionCount };
  }

  isDirectShipInputSuspended() {
    if (this.state.ledger.getSignal("actor.controlLocked") || this.state.ledger.getSignal("controlledShip.controlLocked")) {
      return true;
    }

    return this.activePatrolIntercepts.some((patrol) => patrol.phase === "standoff" || patrol.phase === "hold");
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
    const patrol = this.playerFacingPatrol();
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

    const hasLateralThrusters = this.state.components.engine.upgrades?.includes("lateral-thrusters-mk1");
    if (this.input.wasPressed("KeyE") && !hasLateralThrusters && this.nearbySite && this.state.components.docking.installed) {
      this.setDockedSite(this.dockedSite ? null : this.nearbySite);
    }
  }

  tryForwardBoost(directInputSuspended) {
    const wantsBoost = this.input.wasPressed("ShiftLeft") || this.input.wasPressed("ShiftRight");

    if (!wantsBoost || directInputSuspended || this.dockedSite || this.shipDestroyed) {
      return;
    }

    if (!this.ship.startForwardBoost()) {
      return;
    }

    this.state.ledger.recordEvent(
      "engine.boosted",
      {
        durationSeconds: this.ship.getBoostDurationSeconds(),
        thrustMultiplier: this.ship.getBoostThrustMultiplier(),
        fuelCost: this.ship.getBoostFuelCost(),
      },
      { visible: false },
    );
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
    this.recordScan(inspector, identity, "identity-inspection", site);
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
          ownerInstitutionId: result.ownerInstitutionId,
          titleId: result.titleId,
          registrationId: result.registrationId,
          authorizedActivities: result.authorizedActivities,
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
        ownerInstitutionId: result.ownerInstitutionId,
        titleId: result.titleId,
        registrationId: result.registrationId,
        authorizedActivities: result.authorizedActivities,
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

  recordScan(scanner, subject, scanType, site = null) {
    const subjectName = subject?.pilotName
      ? `${subject.pilotName}${subject.shipName ? ` aboard ${subject.shipName}` : ""}`
      : subject?.shipName ?? subject?.name ?? subject?.entityId ?? "an unknown subject";
    this.state.ledger.recordEvent("scan.performed", {
      scannerType: scanner?.type ?? "unknown",
      scannerId: scanner?.id ?? "unknown",
      scannerName: scanner?.name ?? scanner?.id ?? "Unknown scanner",
      subjectId: subject?.entityId ?? subject?.shipVin ?? subject?.id ?? null,
      subjectName,
      scanType,
      siteId: site?.id ?? null,
      siteName: site?.name ?? null,
    }, { visible: true });
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

    const craft = getAvailablePatrolCraft(this.state, siteId);
    if (!site || !craft || this.ambientPatrolForHub(siteId)) {
      return false;
    }

    const waypoints = this.generatePatrolWaypoints(site);
    const seed = site.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const startIdx = seed % waypoints.length;
    const startWp = waypoints[startIdx];

    const patrol = createPatrolRuntimeActor({
      craft, site,
      reason: "ambient",
      phase: "drift",
      position: { x: startWp.x, y: startWp.y },
      waypoints,
      waypointIndex: startIdx,
    });
    this.activePatrolIntercepts.push(patrol);
    markPatrolCraftStatus(this.state, siteId, "deployed");

    this.state.ledger.recordEvent(
      "patrol.dispatched",
      {
        patrolId: patrol.id,
        patrolName: patrol.name,
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

    // If this hub's ambient patrol already exists, force it into intercept mode.
    const existing = this.ambientPatrolForHub(site.id);
    if (existing) {
      if (existing.phase === "drift" || existing.phase === "return") {
        existing.phase = "transit";
        existing.reason = reason;
        existing.requiresManualClearance = reason === "arrival-clearance";
        existing.hasArrived = false;
        existing.scanTimer = 0;
        existing.hasScanned = false;
        existing.orbitAngle = null;
      }

      return true;
    }

    // Only one craft interacts with the player at a time.
    if (this.playerFacingPatrol()) {
      return false;
    }

    const craft = getAvailablePatrolCraft(this.state, siteId);
    if (!craft) return false;
    // No patrol yet: deploy the owned craft and make it fly the intercept.
    const waypoints = this.generatePatrolWaypoints(site);
    const directionToShip = normalizeVector(this.ship.position.x - site.position.x, this.ship.position.y - site.position.y);
    const side = { x: -directionToShip.y, y: directionToShip.x };
    const startDistance = Math.max(site.interactionRadius + 260, 500);
    const position = {
      x: site.position.x + directionToShip.x * startDistance + side.x * 160,
      y: site.position.y + directionToShip.y * startDistance + side.y * 160,
    };

    const patrol = createPatrolRuntimeActor({
      craft, site,
      reason,
      phase: "transit",
      position,
      velocity: {
        x: directionToShip.x * PATROL_APPROACH_SPEED,
        y: directionToShip.y * PATROL_APPROACH_SPEED,
      },
      heading: Math.atan2(directionToShip.y, directionToShip.x),
      requiresManualClearance: reason === "arrival-clearance",
      waypoints,
    });
    this.activePatrolIntercepts.push(patrol);
    markPatrolCraftStatus(this.state, siteId, "deployed");

    this.state.ledger.recordEvent(
      "patrol.dispatched",
      {
        patrolId: patrol.id,
        patrolName: patrol.name,
        siteId: site.id,
        siteName: site.name,
        reason,
      },
      { visible: false },
    );

    return true;
  }

  dismissPatrolIntercept(siteId = null) {
    const patrol = this.playerFacingPatrol();

    if (!patrol || (siteId && patrol.site.id !== siteId) || patrol.phase === "depart" || patrol.phase === "return") {
      return false;
    }

    // Return to drift rather than departing  patrol belongs to the hub.
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
    const patrol = this.ambientPatrolForHub(siteId);

    if (!patrol || patrol.phase === "depart") {
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

  // Housekeeping for the protection market: re-offer work nobody took, release
  // coverage a settlement claimed but never launched, and put replacement hulls
  // back in service. Once every few seconds — none of it is frame-sensitive,
  // and all three used to be things that simply never happened.
  reviewProtectionMarket() {
    const now = Date.now();
    this.nextProtectionReviewAt ??= now + PROTECTION_REVIEW_INTERVAL_MS;
    if (now < this.nextProtectionReviewAt) return;
    this.nextProtectionReviewAt = now + PROTECTION_REVIEW_INTERVAL_MS;
    const activeThreatIds = new Set(this.incursionField.getActivePortals().map((portal) => portal.id));
    reviewProtectionRequests(this.state, this.worldSites, activeThreatIds, now);
    serviceProtectionProviders(this.state, now);
    servicePatrolCraft(this.state, now);
  }

  dispatchPendingProtectionPatrol() {
    // Every pending threat response gets its own craft, up to the streamed-patrol
    // cap — several simultaneous gates are answered by several patrols, not one
    // that can only be in one place. A hub covering a threat with its own watch
    // craft ("covered-internally") and a contracted security firm both launch
    // through here.
    const pending = listPendingPatrolResponses(
      this.state.protectionPlanning?.requests,
      this.activePatrolIntercepts,
    );
    if (pending.length === 0) return false;

    let launched = false;
    for (const request of pending) {
      if (this.launchProtectionResponse(request)) launched = true;
    }
    return launched;
  }

  launchProtectionResponse(request) {
    const portal = this.incursionField.getActivePortals().find((candidate) => candidate.id === request.threatId);
    const site = this.worldSites.find((candidate) => candidate.id === request.siteId);
    if (!portal || !site) return false;

    const internal = request.status === "covered-internally";
    const provider = internal ? null : ensureProtectionProviders(this.state)[request.providerInstitutionId];
    const craft = internal ? this.patrolOperations[request.siteId]?.craft : provider?.craft;
    // An internally-covered threat is answered from the hub itself; a contracted
    // one is answered from wherever the security firm keeps its craft.
    const homeSite = this.worldSites.find((candidate) => candidate.id === (internal ? request.siteId : provider?.craft?.siteId));
    if (!craft || !homeSite) return false;
    if (internal) {
      if (!startInternalProtectionResponse(this.state, request)) return false;
    } else {
      if (!provider || provider.craft.status !== "committed") return false;
      if (!startProtectionContract(this.state, request.id)) return false;
    }
    this.activePatrolIntercepts.push(createPatrolRuntimeActor({
      craft, site, homeSite, protectionRequestId: request.id, contractedThreatId: request.threatId,
      protectionInternal: internal,
      reason: internal ? "internal-threat-response" : "contract-threat-response", phase: "contract-transit",
      position: { x: homeSite.position.x, y: homeSite.position.y }, velocity: { x: 0, y: 0 },
      heading: Math.atan2(portal.position.y - homeSite.position.y, portal.position.x - homeSite.position.x),
      waypoints: this.generatePatrolWaypoints(site), waypointIndex: 0,
    }));
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

  // The one patrol currently dealing with the PLAYER — inspecting traffic,
  // holding a standoff, awaiting manual clearance. Only an ambient hub craft
  // ever does this (a threat responder is committed elsewhere), and only one at
  // a time, so the HUD, the input lock and the clearance objectives have a
  // single subject even though several craft may be in the air.
  playerFacingPatrol() {
    return this.activePatrolIntercepts.find((patrol) =>
      !patrol.protectionRequestId
      && (patrol.phase === "standoff" || patrol.phase === "approach" || patrol.phase === "hold" || patrol.requiresManualClearance),
    ) ?? null;
  }

  // The ambient (non-responder) patrol belonging to a hub, if one is out.
  ambientPatrolForHub(siteId) {
    return this.activePatrolIntercepts.find((patrol) => !patrol.protectionRequestId && patrol.site?.id === siteId) ?? null;
  }

  // Advance every streamed patrol, then drop the ones that have retired (flown
  // home, departed the player's view, or been destroyed) in one pass.
  updatePatrolIntercepts(deltaSeconds) {
    this.activePatrolIntercepts.forEach((patrol) => this.updatePatrolIntercept(patrol, deltaSeconds));
    this.activePatrolIntercepts = this.activePatrolIntercepts.filter((patrol) => patrol.isAlive && !patrol.retired);
  }

  updatePatrolIntercept(patrol, deltaSeconds) {
    if (!patrol) {
      return;
    }

    patrol.pulse += deltaSeconds;
    patrol.weaponCooldown = Math.max(0, (patrol.weaponCooldown ?? 0) - deltaSeconds);

    if (patrol.phase === "contract-return") {
      this.steerPatrolIntercept(patrol, patrol.homeSite.position, PATROL_RETURN_SPEED, deltaSeconds);
      if (distance(patrol.position, patrol.homeSite.position) < PATROL_WAYPOINT_REACH_DIST) {
        const request = this.state.protectionPlanning?.requests?.[patrol.protectionRequestId];
        if (patrol.protectionInternal) finishInternalProtectionReturn(this.state, request, patrol.hull);
        else finishProtectionReturn(this.state, patrol.protectionRequestId, patrol.hull);
        patrol.retired = true;
      }
      return;
    }

    // "" DEPART """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    if (patrol.phase === "depart") {
      const target = patrol.departTarget ?? { x: patrol.site.position.x, y: patrol.site.position.y };
      this.steerPatrolIntercept(patrol, target, PATROL_DEPART_SPEED, deltaSeconds);

      if (distance(patrol.position, this.ship.position) > PATROL_DEPART_DISTANCE * 0.8) {
        const craft = this.patrolOperations[patrol.site.id]?.craft;
        if (craft && craft.status !== "destroyed") {
          craft.hull = patrol.hull;
          markPatrolCraftStatus(this.state, patrol.site.id, "available");
        }
        patrol.retired = true;
      }

      return;
    }

    // "" RETURN TO DRIFT """""""""""""""""""""""""""""""""""""""""""""""""""""
    if (this.updatePatrolIncursionDefense(patrol, deltaSeconds)) {
      return;
    }

    if (patrol.phase === "return") {
      const wp = patrol.waypoints[patrol.waypointIndex];
      this.steerPatrolIntercept(patrol, wp, PATROL_RETURN_SPEED, deltaSeconds);

      if (distance(patrol.position, wp) < PATROL_WAYPOINT_REACH_DIST) {
        patrol.phase = "drift";
        patrol.waypointDwellTimer = 0;
      }

      return;
    }

    // "" DRIFT """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    if (patrol.phase === "drift") {
      // Passive scan ping when patrol passes near player.
      patrol.passiveScanTimer += deltaSeconds;
      if (patrol.passiveScanTimer >= PATROL_PASSIVE_SCAN_INTERVAL) {
        patrol.passiveScanTimer = 0;

        if (distance(patrol.position, this.ship.position) < PATROL_PASSIVE_SCAN_RANGE) {
          this.fireScanPulse();
        }
      }

      // Answer the economy's distress calls FIRST. If something inside this
      // patrol's range is reporting an attack, break off the idle loop and run
      // toward it — a gate shelling the region outranks a routine papers check.
      // The incursion-defense pass at the top of this update takes over the
      // moment a gate or hostile comes within sight, so this only has to close
      // the distance to the reported position.
      const responseRange = patrol.site.interactionRadius * INCURSION_DEFENSE_JURISDICTION_FACTOR * 1.25;
      const call = nearestActiveReport(this.state, patrol.site.position, responseRange);
      if (call) {
        patrol.respondingReportId = call.report.id;
        this.steerPatrolIntercept(patrol, call.report.position, PATROL_APPROACH_SPEED, deltaSeconds);
        patrol.heading = lerpAngle(patrol.heading, Math.atan2(call.report.position.y - patrol.position.y, call.report.position.x - patrol.position.x), Math.min(1, deltaSeconds * 4));
        return;
      }
      patrol.respondingReportId = null;

      // Check if player has entered patrol territory and is not yet cleared.
      if (!this.dockedSite) {
        const playerDistFromHub = distance(this.ship.position, patrol.site.position);
        const patrolRadius = patrol.site.interactionRadius * PATROL_WAYPOINT_RADIUS_FACTOR;

        if (playerDistFromHub <= patrolRadius) {
          const identity = createControlledShipPublicIdentity(this.state);
          const cacheKey = getInspectionCacheKey(patrol.site, identity);

          const exemptSiteIds = this.state.journey?.mission?.patrolExemptSiteIds ?? [];
          if (!this.hubInspectionCache.has(cacheKey) && !exemptSiteIds.includes(patrol.site.id)) {
            patrol.phase = "transit";
            patrol.reason = "traffic-inspection";
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

    // "" FLY-BY """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    if (patrol.phase === "flyby") {
      const target = patrol.flybyTarget;

      if (!target) {
        patrol.phase = "return";
        patrol.waypointIndex = this.nearestWaypointIndex(patrol);
        return;
      }

      // Always steer toward the snapshot position  never chase a live ship.
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
          } else {
            this.recordScan({ type: "patrol", id: patrol.id, name: patrol.name }, identity, "identity-flyby", patrol.site);
          }
        } else {
          this.recordScan({ type: "patrol", id: patrol.id, name: patrol.name }, { name: target.name ?? target.type ?? "flyby target", entityId: target.id }, "flyby", patrol.site);
        }
      }

      // Leave immediately after scanning  don't linger on the target.
      if (patrol.flybyHasScanned) {
        patrol.flybyTarget = null;
        patrol.phase = "return";
        patrol.waypointIndex = this.nearestWaypointIndex(patrol);
      }

      return;
    }

    // "" STANDOFF """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    // Patrol holds the approach line aimed at the player. Tether is active.
    // After a short dwell the patrol begins orbiting (approach phase).
    if (patrol.phase === "standoff") {
      // Tether player immediately  they cannot flee during standoff.
      this.ship.velocity.x *= PATROL_TETHER_DAMPING;
      this.ship.velocity.y *= PATROL_TETHER_DAMPING;

      // Hold fixed position on the standoff angle  aimed straight at player.
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

    // "" TRANSIT """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
    // Every intercept now flies from the patrol's real position. Mission and
    // ambient dispatches use the same transit phase.
    if (patrol.phase === "transit") {
      const transitTarget = this.getPatrolTransitTarget(patrol);
      this.steerPatrolIntercept(patrol, transitTarget, PATROL_APPROACH_SPEED, deltaSeconds);

      if (distance(patrol.position, this.ship.position) <= PATROL_ORBIT_RADIUS * 2.4) {
        patrol.phase = "approach";
        patrol.orbitAngle = Math.atan2(patrol.position.y - this.ship.position.y, patrol.position.x - this.ship.position.x);
      }

      return;
    }

    // "" APPROACH / HOLD (intercept) """""""""""""""""""""""""""""""""""""""""
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

  findPatrolFlybyTarget(patrol) {
    const patrolRadius = patrol.site.interactionRadius * PATROL_WAYPOINT_RADIUS_FACTOR;

    // Prefer nearby NPC ships  haulers passing through the patrol zone.
    const nearbyShip = [...this.npcShips, ...this.workerShips].find((ship) => {
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

  updatePatrolIncursionDefense(patrol, deltaSeconds) {
    const target = this.findPatrolIncursionTarget(patrol);

    if (!target) {
      if (patrol.protectionRequestId) {
        patrol.phase = "contract-return";
      } else if (patrol.phase === "combat") {
          patrol.phase = "return";
          patrol.waypointIndex = this.nearestWaypointIndex(patrol);
      }
      return false;
    }

    const targetPosition = target.body.position;
    const targetDistance = distance(patrol.position, targetPosition);
    const intercepting = patrol.phase === "standoff" || patrol.phase === "transit" || patrol.phase === "approach" || patrol.phase === "hold";

    this.firePatrolWeapon(patrol, target, targetDistance);

    if (intercepting) {
      return false;
    }

    patrol.phase = "combat";
    patrol.flybyTarget = null;
    patrol.flybyHasScanned = false;

    const awayFromTarget = normalizeVector(patrol.position.x - targetPosition.x, patrol.position.y - targetPosition.y);
    const desiredPosition = {
      x: targetPosition.x + awayFromTarget.x * PATROL_COMBAT_STANDOFF_DISTANCE,
      y: targetPosition.y + awayFromTarget.y * PATROL_COMBAT_STANDOFF_DISTANCE,
    };

    if (targetDistance > PATROL_WEAPON_RANGE * 0.62) {
      this.steerPatrolIntercept(patrol, desiredPosition, PATROL_COMBAT_SPEED, deltaSeconds);
    } else {
      const orbit = {
        x: -awayFromTarget.y,
        y: awayFromTarget.x,
      };
      this.steerPatrolIntercept(
        patrol,
        {
          x: patrol.position.x + orbit.x * 120 + awayFromTarget.x * 36,
          y: patrol.position.y + orbit.y * 120 + awayFromTarget.y * 36,
        },
        PATROL_DRIFT_SPEED * 1.25,
        deltaSeconds,
      );
    }

    patrol.heading = lerpAngle(patrol.heading, Math.atan2(targetPosition.y - patrol.position.y, targetPosition.x - patrol.position.x), Math.min(1, deltaSeconds * 5.2));
    return true;
  }

  findPatrolIncursionTarget(patrol) {
    const jurisdictionRadius = patrol.site.interactionRadius * INCURSION_DEFENSE_JURISDICTION_FACTOR;
    // A craft answering a specific threat engages THAT threat wherever it is.
    // The ambient radius is a patrol range, not a mandate: a settlement's
    // protection policy reaches further than its idle loop does (Yard Exchange
    // accepts responsibility to 1900u and drifts to 1840; The Ledge accepts
    // 2200 and drifts to 1440), so applying it to accepted work sent responders
    // out to stare at a portal they had already been committed against.
    const inRemit = (portal) => (patrol.contractedThreatId
      ? portal.id === patrol.contractedThreatId
      : distance(portal.position, patrol.site.position) <= jurisdictionRadius);
    // ...but any patrol also clears a gate it can see, wherever it is.
    const inSight = (portal) => distance(portal.position, patrol.position) <= PATROL_GATE_SIGHT_RANGE;
    const engageable = (portal) => inRemit(portal) || inSight(portal);
    const activePortals = this.incursionField.getActivePortals();
    const portalIdsInJurisdiction = new Set(activePortals.filter(engageable).map((portal) => portal.id));

    // A contracted patrol is LEASHED to its objective. Its gate's hunters roam,
    // and chasing them wherever they wander was dragging the patrol thousands of
    // units off its own gate — which then never got cleared, so the hunters
    // never stopped coming. It now only engages hostiles near the contracted
    // gate (or right on top of itself, in self-defence) and otherwise drives at
    // the gate, because killing the gate is what ends the hunters.
    const contractedGate = patrol.contractedThreatId
      ? activePortals.find((portal) => portal.id === patrol.contractedThreatId)
      : null;
    const withinLeash = (lifeform) => !contractedGate
      || distance(lifeform.position, contractedGate.position) <= PATROL_GATE_SIGHT_RANGE
      || distance(lifeform.position, patrol.position) <= PATROL_WEAPON_RANGE;

    const hunterTarget = this.lifeforms
      .filter((lifeform) => {
        if (!isCombatHostile(lifeform) || !lifeform.isAlive) {
          return false;
        }
        if (!withinLeash(lifeform)) {
          return false;
        }
        const belongsToNearbyPortal = lifeform.sourcePortalId && portalIdsInJurisdiction.has(lifeform.sourcePortalId);
        const isNearPatrol = distance(lifeform.position, patrol.position) <= PATROL_WEAPON_RANGE * 1.45;
        const isNearHub = distance(lifeform.position, patrol.site.position) <= jurisdictionRadius;
        return belongsToNearbyPortal || (isNearPatrol && isNearHub);
      })
      .map((hostile) => ({
        kind: "hostile",
        body: hostile,
        distanceToPatrol: distance(hostile.position, patrol.position),
      }))
      .sort((first, second) => first.distanceToPatrol - second.distanceToPatrol)[0];

    if (hunterTarget) {
      return hunterTarget;
    }

    return this.incursionField.getActivePortals()
      .filter(engageable)
      .map((portal) => ({
        kind: "portal",
        body: portal,
        distanceToPatrol: distance(portal.position, patrol.position),
      }))
      .sort((first, second) => first.distanceToPatrol - second.distanceToPatrol)[0] ?? null;
  }

  firePatrolWeapon(patrol, target, targetDistance) {
    if (targetDistance > PATROL_WEAPON_RANGE || patrol.weaponCooldown > 0) {
      return;
    }

    patrol.weaponCooldown = PATROL_WEAPON_COOLDOWN_SECONDS;
    const aimPoint = getLeadPoint(patrol, target.body, 780);
    this.createPatrolDefenseBeam(patrol, aimPoint);

    if (target.kind === "hostile") {
      target.body.damage(PATROL_WEAPON_DAMAGE);
      this.createPatrolDefenseBurst(patrol, target.body);
      if (!target.body.isAlive) {
        this.destroyHunterIfNeeded(target.body, "patrol-defense");
      }
      return;
    }

    const damaged = target.body.damage(PATROL_PORTAL_WEAPON_DAMAGE);
    this.createIncursionPortalSparks(target.body, damaged ? "#bdefff" : "#ff74ae");
    this.state.ledger.recordEvent(
      damaged ? "incursion.portalDamaged" : "incursion.portalShielded",
      {
        portalId: target.body.id,
        waveCount: target.body.waveCount,
        guardCount: target.body.guardIds.size,
        health: Math.round(target.body.health),
        cause: "patrol-defense",
      },
      { visible: false },
    );

    if (!target.body.isAlive) {
      // Only the CONTRACTED gate settles the contract. A gate the patrol cleared
      // in passing is an incidental kill — attributing it to the request would
      // pay out (or complete) the wrong threat.
      const settlesContract = patrol.protectionRequestId && target.body.id === patrol.contractedThreatId;
      this.clearIncursionPortal(target.body, {
        rewardCredits: false,
        cause: settlesContract
          ? (patrol.protectionInternal ? "internal-patrol-defense" : "contract-patrol-defense")
          : "patrol-defense",
        site: patrol.site,
        protectionRequestId: settlesContract ? patrol.protectionRequestId : null,
        // Whichever craft made the kill carries its surviving hull into the
        // contract settlement — not "the patrol", of which there are now several.
        patrolHull: patrol.hull,
      });
    }
  }

  // A patrol craft is in normal space and works around the field like anything
  // else there. It used to neither avoid rocks nor collide with them, so it flew
  // straight through — the same ghosting the miners did, and the reason the
  // world's collision behaviour looked arbitrary from outside.
  steerPatrolIntercept(patrol, target, maxSpeed, deltaSeconds) {
    const targetDirection = normalizeVector(target.x - patrol.position.x, target.y - patrol.position.y);
    const avoid = steerAroundObstacles(
      { position: patrol.position, velocity: patrol.velocity, heading: patrol.heading, radius: patrol.radius ?? 22 },
      this.asteroids ?? [],
      { side: patrol.avoidanceSide ??= (String(patrol.id ?? "").length % 2) === 0 ? 1 : -1 },
    );
    const steered = normalizeVector(
      targetDirection.x + avoid.x * PATROL_OBSTACLE_DEFLECTION,
      targetDirection.y + avoid.y * PATROL_OBSTACLE_DEFLECTION,
    );
    const desiredVelocity = {
      x: steered.x * maxSpeed,
      y: steered.y * maxSpeed,
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

  // Procedural area-entry banner for everywhere the authored zones don't cover.
  // Purely cosmetic: it never touches the legal/visited-zone machinery, so
  // crossing open space can't be mistaken for entering a licensable zone.
  updateSectorTitle() {
    const designation = getSectorDesignation(this.ship.position.x, this.ship.position.y);

    if (designation.id === this.currentSectorId) {
      return;
    }

    const isFirstPlacement = this.currentSectorId === null;
    this.currentSectorId = designation.id;

    // A strongly-authored zone already announced itself by name; and the first
    // placement at spawn should not race the mission intro with a code banner.
    const zoneProfile = getZoneProfile(this.ship.position.x, this.ship.position.y);
    if (isFirstPlacement || zoneProfile.influence >= 0.55) {
      return;
    }

    this.showViewportTitle(designation.code, designation.feature, "zone", VIEWPORT_TITLE_SECONDS, "left");
  }

  // Environment fields: colored regions of space (corrosive/mending/wind/slick)
  // that act on the ship each frame. Only the strongest field at the ship's
  // position applies. Effects are gentle and telegraphed (fog is always drawn,
  // plus an entry banner); a harmful field's worst case routes through the
  // existing destroyShip → stranded/tow flow, adding no new soft-lock.
  // Suppressed while docked, towed, or already destroyed.
  updateEnvironmentalHazards(deltaSeconds) {
    if (this.shipDestroyed || this.dockedSite || this.activeTow) {
      this.environmentSample = null;
      this.inEnvironmentFieldId = null;
      return;
    }

    const sample = sampleEnvironment(this.ship.position.x, this.ship.position.y);
    this.environmentSample = sample;

    if (!sample) {
      this.inEnvironmentFieldId = null;
      return;
    }

    const { field, intensity } = sample;

    // Hysteresis so the entry banner doesn't flicker at a field's edge.
    if (this.inEnvironmentFieldId !== field.id && intensity > 0.1) {
      this.inEnvironmentFieldId = field.id;
      this.showViewportTitle(field.label, field.hint, "hazard", VIEWPORT_TITLE_SECONDS, "left");
    }

    const hull = this.state.components.hull;
    if (!hull.installed) {
      return;
    }

    const hullBefore = hull.integrity;
    field.effect({
      ship: this.ship,
      hull,
      intensity,
      deltaSeconds,
      flowAngle: field.flow ? getFlowAngle(this.ship.position.x, this.ship.position.y) : 0,
      maxSpeed: this.ship.getMaxSpeed(),
    });

    // Only refresh the HUD (and, for a harmful field, hiss) when hull moved.
    if (hull.integrity !== hullBefore) {
      this.environmentFeedbackTimer -= deltaSeconds;
      if (this.environmentFeedbackTimer <= 0) {
        this.environmentFeedbackTimer = 0.45;
        this.onHudChange(this.state);
        if (field.harmful) {
          this.audio?.playHullHit(1.5);
        }
      }
    }

    if (hull.integrity === 0 && !this.shipDestroyed) {
      this.destroyShip();
    }
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
      const patrol = this.playerFacingPatrol();
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
    const engineConditionBefore = this.state.components.engine?.condition?.stage ?? "healthy";

    if (repairCost <= 0 || !canSpendCredits(this.state, repairCost)) {
      return;
    }

    spendCredits(this.state, repairCost);
    this.state.components.hull.integrity = this.state.components.hull.maxIntegrity;
    // Dock is the interim service provider: it clears panel conditions through
    // the same shared repair seam SPRC will use next slice — not a second
    // repair architecture. Onboard hull reserve stays integrity-only.
    this.serviceEnginePanel();
    this.serviceMinerPanel();
    this.serviceCollectorPanel();
    this.state.ledger.recordEvent("ship.repaired", {
      siteId: site.id,
      siteName: site.name,
      creditsSpent: repairCost,
      hullBefore: hullBeforeRepair,
      hullAfter: this.state.components.hull.integrity,
      hullRestored: this.state.components.hull.integrity - hullBeforeRepair,
      engineConditionBefore,
      engineConditionAfter: "healthy",
    });
    this.shipDestroyed = false;
    this.onHudChange(this.state);
    this.setDockedSite(site);
  }

  // Restore the engine panel to healthy via the shared service seam and clear
  // the runtime fault state a failure left behind (stranded latch, misfire).
  serviceEnginePanel() {
    const engine = this.state.components.engine;
    if (!engine?.installed) {
      return "healthy";
    }

    const condition = ensurePanelCondition(engine);
    const previousStage = repairPanelCondition(condition);
    this.engineMisfireRemaining = 0;
    this.engineSteerBias = 0;
    this.ship.conditionThrustBlocked = false;
    this.ship.conditionThrustMultiplier = 1;
    this.ship.conditionMaxSpeedMultiplier = 1;
    if (previousStage === "failed") {
      this.hasRecordedStrandedEvent = false;
    }
    if (previousStage !== "healthy") {
      this.onHudChange(this.state);
    }
    return previousStage;
  }

  getRepairCost() {
    const hull = this.state.components.hull;
    const missingHull = Math.max(0, hull.maxIntegrity - hull.integrity);
    const hullCost = Math.ceil(missingHull * REPAIR_CREDITS_PER_HULL);
    const engineStage = this.state.components.engine?.condition?.stage ?? "healthy";
    const engineCost = ENGINE_CONDITION_REPAIR_COST[engineStage] ?? 0;
    const minerStage = this.state.components.miner?.installed
      ? (this.state.components.miner?.condition?.stage ?? "healthy") : "healthy";
    const minerCost = MINER_CONDITION_REPAIR_COST[minerStage] ?? 0;
    const collectorStage = this.state.components.collector?.installed
      ? (this.state.components.collector?.condition?.stage ?? "healthy") : "healthy";
    const collectorCost = COLLECTOR_CONDITION_REPAIR_COST[collectorStage] ?? 0;

    return hullCost + engineCost + minerCost + collectorCost;
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

  nearestSiteId(position) {
    return getNearestWorldSite(position, this.worldSites)?.site?.id ?? null;
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

  createCargoTransferTrail(resource = "fuel", direction = "to-hub") {
    const site = this.dockedSite;

    if (!site) {
      return;
    }

    const resourceType = typeof resource === "string" ? resource : resource.type;
    this.audio?.playCargoTransfer(resourceType);
    const color = resource.color ?? getResourceColor(resourceType) ?? CARGO_TRAIL_COLOR[resourceType] ?? "#ff7452";
    const shape = resource.shape ?? getResourceShape(resourceType);
    const distanceX = site.position.x - this.ship.position.x;
    const distanceY = site.position.y - this.ship.position.y;
    const transferDistance = distance(this.ship.position, site.position) || 1;
    const normalX = distanceX / transferDistance * (direction === "from-hub" ? -1 : 1);
    const normalY = distanceY / transferDistance * (direction === "from-hub" ? -1 : 1);

    const travelTime = Math.max(0.4, transferDistance / 235);

    this.particles.push({
      type: "cargo-packet",
      position: {
        x: direction === "from-hub" ? site.position.x : this.ship.position.x,
        y: direction === "from-hub" ? site.position.y : this.ship.position.y,
      },
      velocity: {
        x: normalX * 235,
        y: normalY * 235,
      },
      color,
      shape,
      size: resource.size ?? 8,
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

  fireMossSeeder(unitMetadata = {}) {
    const seeder = this.state.components.mossSeeder;

    if (!seeder?.installed) {
      return false;
    }

    const rearAngle = this.ship.angle + Math.PI;
    const rearVector = {
      x: Math.cos(rearAngle),
      y: Math.sin(rearAngle),
    };
    const launchPosition = {
      x: this.ship.position.x + rearVector.x * MOSS_SEEDER_REAR_OFFSET,
      y: this.ship.position.y + rearVector.y * MOSS_SEEDER_REAR_OFFSET,
    };

    this.pickups.push(
      new ResourcePickup({
        x: launchPosition.x,
        y: launchPosition.y,
        type: ROCKMOSS_CRAWLER_TYPE,
        strain: unitMetadata.strain ?? "moss",
        sourceClaimId: unitMetadata.sourceClaimId ?? null,
        sourceClaimName: unitMetadata.sourceClaimName ?? null,
        velocity: {
          x: this.ship.velocity.x * 0.35 + rearVector.x * MOSS_SEEDER_LAUNCH_SPEED,
          y: this.ship.velocity.y * 0.35 + rearVector.y * MOSS_SEEDER_LAUNCH_SPEED,
        },
      }),
    );

    seeder.status = "Crawler fired";
    seeder.shotsFired = Math.floor(seeder.shotsFired ?? 0) + 1;
    this.createTowCableSparks(launchPosition, "#72ffc9");
    this.state.ledger.recordEvent(
      "mossSeeder.fired",
      {
        shotsFired: seeder.shotsFired,
        sourceClaimId: unitMetadata.sourceClaimId ?? null,
        sourceClaimName: unitMetadata.sourceClaimName ?? null,
      },
      { visible: true },
    );
    this.onHudChange(this.state);
    return true;
  }

  setMossSeederStatus(status) {
    const seeder = this.state.components.mossSeeder;

    if (!seeder) {
      return;
    }

    seeder.status = status;
    this.onHudChange(this.state);
  }

  getMossSeederDisplay(crawlerCargoCount = 0) {
    const seeder = this.state.components.mossSeeder ?? {};
    const installed = Boolean(seeder.installed);

    return {
      installed,
      canFire: installed && crawlerCargoCount > 0,
      crawlerCargoCount,
      status: installed && crawlerCargoCount > 0 ? (seeder.status ?? "Ready") : "No crawler cargo",
      shotsFired: Math.floor(seeder.shotsFired ?? 0),
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

    const hitWreck = this.wrecks.find((wreck) =>
      circlesOverlap(cable.hookPosition, TOW_CABLE_HOOK_RADIUS, wreck.position, wreck.radius),
    );
    const hitAsteroid = this.asteroids.find((asteroid) =>
      circlesOverlap(cable.hookPosition, TOW_CABLE_HOOK_RADIUS, asteroid.position, asteroid.radius),
    );
    const towTarget = hitWreck ?? hitAsteroid;

    if (towTarget) {
      cable.phase = "attached";
      cable.anchor = towTarget;
      cable.hookPosition = towTarget.position;
      cable.hookVelocity = { x: 0, y: 0 };
      cable.lineLength = Math.min(TOW_CABLE_MAX_LENGTH, Math.max(TOW_CABLE_MIN_LENGTH, distance(this.ship.position, towTarget.position)));
      this.createTowCableSparks(towTarget.position, "#ffd36b");
      this.state.ledger.recordEvent(
        "towCable.attached",
        {
          targetType: hitWreck ? "ship-wreck" : "asteroid",
          targetId: hitWreck?.id ?? null,
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

    if (!anchor || (!this.asteroids.includes(anchor) && !this.wrecks.includes(anchor))) {
      this.releaseTowCable();
      return;
    }

    if (anchor.type === "ship-wreck" && this.dockedSite) {
      const completed = completeWreckSalvage(this.state, {
        wreckId: anchor.recordId,
        salvagerId: "player",
        destinationSiteId: this.dockedSite.id,
      });
      if (completed) {
        this.wrecks = this.wrecks.filter((wreck) => wreck !== anchor);
        this.releaseTowCable();
        this.state.ledger.recordEvent("wreck.salvageDelivered", {
          wreckId: completed.id,
          shipId: completed.shipId,
          shipName: completed.shipName,
          ownerInstitutionId: completed.ownerInstitutionId,
          previousOwnerInstitutionId: completed.previousOwnerInstitutionId,
          destinationSiteId: this.dockedSite.id,
          salvagerId: "player",
          plannedSalvageYield: completed.plannedSalvageYield,
        }, { visible: true, message: `${completed.shipName} was delivered under salvage authority; The Maw can now begin dismantling.` });
        return;
      }
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

    const towing = this.state.towing;
    const serviceRequestId = towing ? `TOW-REQ-${String(++towing.counters.request).padStart(4, "0")}` : null;
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
      // How long the tug has held its drop-off station. The handoff waits on the
      // tug being parked, not on the towed ship drifting into a small window.
      stationSeconds: 0,
      dropoffPosition: null,
      serviceRequestId,
    };

    if (towing && serviceRequestId) {
      towing.requests[serviceRequestId] = { id: serviceRequestId, clientType: "player", playerEntityId: this.state.character?.controlledPersonEntityId, destinationSiteId: site.id, fee: this.activeTow.cost, status: "dispatched", createdAt: Date.now() };
      towing.vehicle.status = "dispatched";
    }

    this.setShipPowered(false);
    this.state.ledger.recordEvent(
      "tow.dispatched",
      {
        siteId: site.id,
        siteName: site.name,
        cost: this.activeTow.cost,
        distance: this.activeTow.quotedDistance,
        institutionId: towing?.institution?.id,
        institutionName: towing?.institution?.name,
        actorInstitutionId: towing?.controller?.id,
        actorName: towing?.controller?.name,
        vehicleId: towing?.vehicle?.id,
        vehicleName: towing?.vehicle?.name,
        requestId: serviceRequestId,
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

    // Docking yourself mid-tow is a legitimate way to end the job — the tug got
    // you close enough to reach the pad under your own power, which is the whole
    // service. It used to just discard the tow, so the run was free and the
    // operator that flew it was never paid. Settle the bill; do not reposition a
    // ship that has already parked itself.
    if (this.dockedSite) {
      this.completeEmergencyTow({ reposition: false });
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

    this.steerTowRunner(tow, runnerTarget, TOW_RETURN_SPEED, deltaSeconds, TOW_ARRIVE_RADIUS);
    this.applyTowLine(tow, deltaSeconds);
    tow.towedDistance += Math.max(0, dotProduct(this.ship.velocity, directionToHub) * deltaSeconds);

    // THE HANDOFF IS THE TUG'S JOB, NOT THE CARGO'S.
    //
    // Delivery used to depend solely on the towed ship drifting inside a 48-unit
    // window around the drop-off. The ship is on the end of a rope: when the line
    // goes slack it is pushed by nothing at all, so it can easily come to rest
    // just outside that window and sit there forever with the tug station-keeping
    // beside it. Arrival damping stops the thrashing, but it cannot promise the
    // cargo lands on a specific spot.
    //
    // So once the tug has held its station for a moment, the tow is done and the
    // ship is set down where it was always going to be put. This is what makes a
    // stuck tow impossible rather than merely unlikely.
    tow.stationSeconds = distance(tow.position, runnerTarget) <= TOW_STATION_DISTANCE
      ? tow.stationSeconds + deltaSeconds
      : 0;

    if (distanceToTarget > TOW_DELIVERY_DISTANCE && tow.stationSeconds < TOW_STATION_SETTLE_SECONDS) {
      return;
    }

    this.completeEmergencyTow();
  }

  // `arriveRadius` is what lets the tug STOP. Without it the desired velocity is
  // full speed toward the target no matter how close the tug already is, so it
  // overshoots its station, turns around, overshoots again, and settles into a
  // permanent oscillation — with the player's ship swinging on the far end of a
  // spring line, never holding still long enough to be handed over. That is the
  // shaking. A tug that cannot slow down cannot park.
  steerTowRunner(tow, target, maxSpeed, deltaSeconds, arriveRadius = 0) {
    const targetDirection = normalizeVector(target.x - tow.position.x, target.y - tow.position.y);
    const avoidance = getTowAvoidance(tow, this.asteroids);
    const steerDirection = normalizeVector(
      targetDirection.x + avoidance.x * 0.45,
      targetDirection.y + avoidance.y * 0.45,
    );
    const separation = distance(tow.position, target);
    const speed = arriveRadius > 0 ? maxSpeed * Math.min(1, separation / arriveRadius) : maxSpeed;
    const desiredVelocity = {
      x: steerDirection.x * speed,
      y: steerDirection.y * speed,
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

  completeEmergencyTow({ reposition = true } = {}) {
    const tow = this.activeTow;

    if (!tow) {
      return;
    }

    const towTarget = tow.dropoffPosition ?? getTowDropoffPosition(tow.site, this.ship.position);

    this.activeTow = null;
    debitCredits(this.state, tow.cost);
    const towing = this.state.towing;
    const request = tow.serviceRequestId ? towing?.requests?.[tow.serviceRequestId] : null;
    if (towing) {
      const account = towing.institution.accounts.operating;
      account.balance += tow.cost;
      account.transactions ??= [];
      const transaction = { id: `TOW-TX-${String(++towing.counters.transaction).padStart(5, "0")}`, at: Date.now(), accountId: account.id, institutionId: towing.institution.id, amount: tow.cost, type: "player-recovery-income", referenceId: tow.serviceRequestId, balance: account.balance };
      account.transactions.push(transaction);
      towing.vehicle.status = "available";
      if (request) { request.status = "completed"; request.completedAt = Date.now(); request.providerTransactionId = transaction.id; }
    }
    this.state.components.hull.integrity = Math.max(this.state.components.hull.integrity, 10);
    this.shipDestroyed = false;
    this.hasRecordedStrandedEvent = false;
    this.hasRecordedLowFuelEvent = false;
    if (reposition) {
      this.ship.position.x = towTarget.x;
      this.ship.position.y = towTarget.y;
      this.ship.velocity.x = 0;
      this.ship.velocity.y = 0;
      this.setDockedSite(tow.site);
    }
    this.state.ledger.recordEvent(
      "ship.towed",
      {
        siteId: tow.site.id,
        siteName: tow.site.name,
        cost: tow.cost,
        distance: Math.round(tow.towedDistance),
        fuelAfter: this.state.components.engine.fuel,
        hullAfter: this.state.components.hull.integrity,
        institutionId: towing?.institution?.id,
        institutionName: towing?.institution?.name,
        actorInstitutionId: towing?.controller?.id,
        actorName: towing?.controller?.name,
        vehicleId: towing?.vehicle?.id,
        vehicleName: towing?.vehicle?.name,
        requestId: tow.serviceRequestId,
      },
      { visible: true },
    );
    this.onHudChange(this.state);
  }

  updateDebugReadout() {
    const activePortals = this.incursionField.getActivePortals();
    const lifeformCounts = getEntityTypeCounts(this.lifeforms.filter((lifeform) => lifeform.isAlive));

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
      population: {
        lifeformTotal: this.lifeforms.filter((lifeform) => lifeform.isAlive).length,
        lifeforms: lifeformCounts,
        npcShips: this.npcShips.filter((ship) => ship.isAlive).length,
        gateShots: this.incursionShots.length,
        gates: activePortals.map((portal) => {
          const guards = this.lifeforms.filter((lifeform) => lifeform.isAlive && lifeform.sourcePortalId === portal.id);
          const devices = portal.devices?.filter((device) => device.isAlive) ?? [];
          return {
            guards: guards.length,
            hunters: guards.filter((guard) => guard.type === "hunter").length,
            fighters: guards.filter((guard) => guard.type === "fighter").length,
            sentries: devices.filter((device) => device.type === "rift-sentry").length,
            dragBlooms: devices.filter((device) => device.type === "drag-bloom").length,
            mines: devices.filter((device) => device.type === "rift-mine").length,
            waves: portal.waveCount,
            state: portal.getEncounterState().id,
          };
        }),
      },
      currentSite: this.dockedSite ?? this.nearbySite,
      nearestSite: getNearestWorldSite(this.ship.position, this.worldSites)?.site ?? null,
      encounter: this.encounterDirector.getDebugSnapshot(),
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

  updateFlightFighterEnvironmentalHits(activeLifeforms, activeAsteroids, deltaSeconds) {
    const fighters = activeLifeforms.filter((lifeform) => lifeform.type === "fighter" && lifeform.isAlive);

    fighters.forEach((fighter) => {
      fighter.environmentHitCooldown = Math.max(0, (fighter.environmentHitCooldown ?? 0) - deltaSeconds);
      if (fighter.environmentHitCooldown > 0) {
        return;
      }

      const hitAsteroid = activeAsteroids.find((asteroid) =>
        circlesOverlap(fighter.position, fighter.radius, asteroid.position, asteroid.radius),
      );
      if (!hitAsteroid) {
        return;
      }

      this.bumpBodyFromBody(fighter, hitAsteroid, 0.72, { baseImpulse: 52, overlapImpulse: 2.1 });
      fighter.damage(this.getHunterEnvironmentDamage(fighter, hitAsteroid) * 0.72);
      fighter.environmentHitCooldown = HUNTER_ENVIRONMENT_HIT_COOLDOWN_SECONDS;
      this.createHunterImpactSparks(fighter);
      this.destroyHunterIfNeeded(fighter, "asteroid-collision");
    });
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

    // Wear symptoms: a worn laser charges slower, spends more per shot, sputters,
    // and drifts off the reticle. All read from the shared condition machine.
    const condition = ensurePanelCondition(miner);
    const effects = getMinerStageEffects(condition.stage);
    const shotAmmo = Math.max(1, Math.ceil(AMMO_PER_SHOT * effects.ammoScale));

    if (this.shipDestroyed || !this.state.components.engine.powered || !miner.installed || !miner.armed || !wantsToFire || this.fireCooldown > 0 || miner.ammo < shotAmmo) {
      return;
    }

    this.unarmedFireAttempts = 0;
    this.setCloakActive(false);

    // Misfire: the charge sputters and no bolt leaves the emitter. It costs a beat
    // of cooldown but no charge, so a worn laser fires erratically rather than
    // silently doing nothing.
    if (effects.misfireChance > 0 && Math.random() < effects.misfireChance) {
      this.fireCooldown = FIRE_COOLDOWN_SECONDS * effects.cooldownScale * 0.6;
      this.audio?.playMinerFault(condition.stage);
      this.state.ledger.recordEvent("weapon.misfired", { weaponType: "miner", stage: condition.stage }, { visible: false });
      return;
    }

    miner.ammo -= shotAmmo;
    this.state.ledger.recordEvent(
      "weapon.fired",
      {
        weaponType: "miner",
        ammoSpent: shotAmmo,
      },
      { visible: false },
    );
    this.onHudChange(this.state);
    this.bullets.push(new Bullet(this.ship, this.ship.angle + this.minerAimBias));
    this.addLifeDisturbance("weapon", this.ship.position, LIFE_DISTURBANCE_WEAPON_RADIUS, 1);
    this.audio?.playMiningShot();
    this.fireCooldown = FIRE_COOLDOWN_SECONDS * effects.cooldownScale;
    this.accrueMinerWear();
  }

  // Slowly wander the aim bias within the current stage's drift envelope so the
  // emitter reads as consistently-off-then-slowly-changing (learnable "Kentucky
  // windage") rather than random jitter. Relaxes toward centre when not firing.
  applyMinerConditionEffects(deltaSeconds) {
    const miner = this.state.components.miner;
    if (!miner?.installed) {
      this.minerAimBias = 0;
      return;
    }
    const effects = getMinerStageEffects(ensurePanelCondition(miner).stage);
    if (effects.aimDrift > 0 && miner.armed && this.state.components.engine.powered && !this.shipDestroyed) {
      // A slow swing across the drift envelope (~40s period) rather than fast
      // random jitter: at any moment the aim is off by a consistent, learnable
      // amount the player compensates for, and it wanders gradually.
      this.minerAimPhase = (this.minerAimPhase ?? 0) + deltaSeconds * 0.16;
      this.minerAimBias = effects.aimDrift * Math.sin(this.minerAimPhase);
    } else {
      this.minerAimBias *= Math.max(0, 1 - deltaSeconds * 3);
    }
  }

  accrueMinerWear() {
    const miner = this.state.components.miner;
    const condition = ensurePanelCondition(miner);
    const wearDelta = computeMinerWearPerShot() * this.conditionDebugScale;
    const { changed, previousStage, stage } = accumulatePanelWear(condition, wearDelta, MINER_CONDITION_CONFIG.thresholds);
    if (changed) {
      this.onMinerPanelStageChanged(previousStage, stage);
    }
  }

  onMinerPanelStageChanged(previousStage, stage) {
    const worsening = panelStageIndex(stage) > panelStageIndex(previousStage);

    this.state.ledger.recordEvent("ship.panelConditionChanged", {
      panel: "miner",
      from: previousStage,
      to: stage,
      worsening,
    });

    if (worsening) {
      this.audio?.playMinerFault(stage);
      const messages = {
        degraded: { title: "Mining Laser Strain", hint: "Emitter is drifting and sputtering — schedule service soon." },
        emergency: { title: "Mining Laser Fault", hint: "Aim is off and the charge is unreliable — reach a repair facility." },
        failed: { title: "Mining Laser Failing", hint: "Badly misaligned and misfiring; it barely cuts rock." },
      };
      const message = messages[stage];
      if (message) {
        this.showViewportTitle(message.title, message.hint, "hazard", VIEWPORT_TITLE_SECONDS, "left");
      }
    }

    this.onHudChange(this.state);
  }

  // Restore the mining laser to healthy via the shared service seam and clear the
  // runtime aim drift the wear left behind.
  serviceMinerPanel() {
    const miner = this.state.components.miner;
    if (!miner?.installed) {
      return "healthy";
    }
    const condition = ensurePanelCondition(miner);
    const previousStage = repairPanelCondition(condition);
    this.minerAimBias = 0;
    if (previousStage !== "healthy") {
      this.onHudChange(this.state);
    }
    return previousStage;
  }

  debugSetMinerPanelStage(stage) {
    const miner = this.state.components.miner;
    const condition = ensurePanelCondition(miner);
    const thresholds = MINER_CONDITION_CONFIG.thresholds;
    const wearForStage = { healthy: 0, degraded: thresholds.degraded, emergency: thresholds.emergency, failed: thresholds.failed };
    const previousStage = condition.stage;

    condition.wear = wearForStage[stage] ?? 0;
    condition.stage = stage in wearForStage ? stage : "healthy";
    condition.currentCondition = Math.max(0,
      condition.maxRecoverableCondition * (1 - condition.wear / thresholds.failed));
    if (condition.stage !== previousStage) {
      this.onMinerPanelStageChanged(previousStage, condition.stage);
    }
    this.onHudChange(this.state);
    return condition;
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

    // The field is genuinely running now, so it earns wear.
    this.accrueCollectorWear(deltaSeconds);

    const condition = ensurePanelCondition(collector);
    const effects = getCollectorStageEffects(condition.stage);

    // Grip flicker: the field cuts out for a beat, gripping nothing that frame.
    this.collectorDropoutRemaining = Math.max(0, this.collectorDropoutRemaining - deltaSeconds);
    if (this.collectorDropoutRemaining <= 0 && effects.dropoutChance > 0 && Math.random() < effects.dropoutChance * deltaSeconds) {
      this.collectorDropoutRemaining = effects.dropoutDuration;
      this.audio?.playCollectorFault(condition.stage);
    }
    if (this.collectorDropoutRemaining > 0) {
      return;
    }

    // Shove pulse: a malfunctioning field briefly reverses, pushing objects away.
    this.collectorPushRemaining = Math.max(0, this.collectorPushRemaining - deltaSeconds);
    if (this.collectorPushRemaining <= 0 && effects.pushChance > 0 && Math.random() < effects.pushChance * deltaSeconds) {
      this.collectorPushRemaining = 0.5;
      this.audio?.playCollectorFault(condition.stage);
    }
    const radialSign = this.collectorPushRemaining > 0 ? -1 : 1;

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
      const pullStrength = Math.max(0.45, 1 - distance / radius) * 1.35 * effects.strengthScale;
      const force = COLLECTOR_PULL_FORCE * pullStrength * deltaSeconds;
      const nx = distanceX / distance;
      const ny = distanceY / distance;

      // Radial component (inward, or outward during a shove pulse).
      pickup.velocity.x += nx * force * radialSign;
      pickup.velocity.y += ny * force * radialSign;

      // Swirl: a tangential nudge so a worn field makes objects orbit and wobble
      // instead of coming straight in.
      if (effects.swirl > 0) {
        pickup.velocity.x += -ny * force * effects.swirl;
        pickup.velocity.y += nx * force * effects.swirl;
      }
    });
  }

  accrueCollectorWear(deltaSeconds) {
    const collector = this.state.components.collector;
    const condition = ensurePanelCondition(collector);
    const wearDelta = computeCollectorWearPerSecond() * deltaSeconds * this.conditionDebugScale;
    const { changed, previousStage, stage } = accumulatePanelWear(condition, wearDelta, COLLECTOR_CONDITION_CONFIG.thresholds);
    if (changed) {
      this.onCollectorPanelStageChanged(previousStage, stage);
    }
  }

  onCollectorPanelStageChanged(previousStage, stage) {
    const worsening = panelStageIndex(stage) > panelStageIndex(previousStage);

    this.state.ledger.recordEvent("ship.panelConditionChanged", {
      panel: "collector",
      from: previousStage,
      to: stage,
      worsening,
    });

    if (worsening) {
      this.audio?.playCollectorFault(stage);
      const messages = {
        degraded: { title: "Tractor Field Strain", hint: "Grip is weakening and flickering — schedule service soon." },
        emergency: { title: "Tractor Field Fault", hint: "Short reach, weak pull, and objects swirl instead of coming in." },
        failed: { title: "Tractor Field Failing", hint: "Barely grips; it flickers out and sometimes shoves cargo away." },
      };
      const message = messages[stage];
      if (message) {
        this.showViewportTitle(message.title, message.hint, "hazard", VIEWPORT_TITLE_SECONDS, "left");
      }
    }

    this.onHudChange(this.state);
  }

  serviceCollectorPanel() {
    const collector = this.state.components.collector;
    if (!collector?.installed) {
      return "healthy";
    }
    const condition = ensurePanelCondition(collector);
    const previousStage = repairPanelCondition(condition);
    this.collectorDropoutRemaining = 0;
    this.collectorPushRemaining = 0;
    if (previousStage !== "healthy") {
      this.onHudChange(this.state);
    }
    return previousStage;
  }

  debugSetCollectorPanelStage(stage) {
    const collector = this.state.components.collector;
    const condition = ensurePanelCondition(collector);
    const thresholds = COLLECTOR_CONDITION_CONFIG.thresholds;
    const wearForStage = { healthy: 0, degraded: thresholds.degraded, emergency: thresholds.emergency, failed: thresholds.failed };
    const previousStage = condition.stage;

    condition.wear = wearForStage[stage] ?? 0;
    condition.stage = stage in wearForStage ? stage : "healthy";
    condition.currentCondition = Math.max(0,
      condition.maxRecoverableCondition * (1 - condition.wear / thresholds.failed));
    if (condition.stage !== previousStage) {
      this.onCollectorPanelStageChanged(previousStage, condition.stage);
    }
    this.onHudChange(this.state);
    return condition;
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
      newAsteroids.push(...this.breakAsteroid(hitAsteroid, bullet.velocity, { localPlayer: true }));
    });

    if (this.shipHitCooldown === 0 && !this.activeTow) {
      const shipHitAsteroid = this.asteroids.find(
        (asteroid) =>
          !hitAsteroids.has(asteroid) &&
          circlesOverlap(this.ship.position, this.getShipCollisionRadius(), asteroid.position, asteroid.radius),
      );

      if (shipHitAsteroid) {
        const impactDamage = this.getImpactDamage(shipHitAsteroid);

        this.shipHitCooldown = SHIP_HIT_COOLDOWN_SECONDS;
        if (this.absorbShieldImpact(shipHitAsteroid, "asteroid")) {
          this.recordShipCollision("shielded-asteroid", shipHitAsteroid, 0);
        } else {
          this.recordShipCollision("asteroid", shipHitAsteroid, impactDamage);
          this.damageHull(impactDamage);
          this.triggerImpactFeedback(impactDamage);
          this.createShipSparks(shipHitAsteroid);
        }
        hitAsteroids.add(shipHitAsteroid);
        newAsteroids.push(...this.breakAsteroid(shipHitAsteroid, this.ship.velocity, { localPlayer: true }));
      }
    }

    if (hitAsteroids.size === 0) {
      return;
    }

    this.asteroids = this.asteroids.filter((asteroid) => !hitAsteroids.has(asteroid));
    this.asteroids.push(...newAsteroids);
  }

  updateHostileHits() {
    const hitHostiles = new Set();

    this.bullets.forEach((bullet) => {
      if (!bullet.isAlive) {
        return;
      }

      // A ripe grazer is the one piece of ambient life worth shooting: it has
      // been fattening on abandoned ore and is carrying spores. Deliberately
      // checked before hostiles so a fat one floating among a fight is still
      // harvestable, and deliberately NOT extended to lean ones — shooting the
      // wildlife at random should stay pointless.
      const ripeGrazer = this.lifeforms.find(
        (lifeform) =>
          lifeform.type === "grazer" &&
          lifeform.isAlive &&
          isRipe(lifeform) &&
          !hitHostiles.has(lifeform) &&
          circlesOverlap(bullet.position, bullet.radius, lifeform.position, lifeform.radius),
      );

      if (ripeGrazer) {
        bullet.destroy();
        hitHostiles.add(ripeGrazer);
        this.harvestGrazer(ripeGrazer, bullet.velocity);
        return;
      }

      const hitHostile = this.lifeforms.find(
        (lifeform) =>
          isCombatHostile(lifeform) &&
          lifeform.isAlive &&
          !hitHostiles.has(lifeform) &&
          circlesOverlap(bullet.position, bullet.radius, lifeform.position, lifeform.radius),
      );

      if (!hitHostile) {
        return;
      }

      bullet.destroy();
      hitHostile.damage(100);
      hitHostiles.add(hitHostile);
      if (hitHostile.isAlive) {
        this.createHunterImpactSparks(hitHostile);
        return;
      }

      this.recordEnemyDestroyed(getHostileEnemyType(hitHostile), "weapon");
      this.createHunterBurst(hitHostile, bullet.velocity);
      this.createHostileDrops(hitHostile, bullet.velocity);
      if (!hitHostile.sourcePortalId) {
        this.respawnHunter();
      }
    });

    if (this.shipHitCooldown > 0) {
      return;
    }

    const rammingHunter = this.lifeforms.find(
      (lifeform) =>
        lifeform.type === "hunter" &&
        lifeform.isAlive &&
        !hitHostiles.has(lifeform) &&
        circlesOverlap(this.ship.position, this.getShipCollisionRadius(), lifeform.position, lifeform.radius),
    );

    if (!rammingHunter) {
      return;
    }

    const impactDamage = this.getImpactDamage(rammingHunter);
    const hullDamage = Math.min(16, Math.max(6, impactDamage * 0.38));

    this.shipHitCooldown = SHIP_HIT_COOLDOWN_SECONDS;
    if (this.absorbShieldImpact(rammingHunter, getHostileEnemyType(rammingHunter))) {
      this.recordShipCollision(`shielded-${getHostileEnemyType(rammingHunter)}`, rammingHunter, 0);
    } else {
      this.recordShipCollision(getHostileEnemyType(rammingHunter), rammingHunter, hullDamage);
      this.damageHull(hullDamage);
      this.triggerImpactFeedback(hullDamage);
      this.createShipSparks(rammingHunter);
    }
    rammingHunter.damage(rammingHunter.health);
    this.recordEnemyDestroyed(getHostileEnemyType(rammingHunter), "ramming-ship");
    this.createHunterBurst(rammingHunter, this.ship.velocity, { count: 34, sparkEvery: 2 });
    this.createHostileDrops(rammingHunter, this.ship.velocity);
    if (!rammingHunter.sourcePortalId) {
      this.respawnHunter();
    }
  }

  updateIncursions(deltaSeconds) {
    this.suppressPersistentIncursionForEconomicRecovery();
    this.updateAmbientIncursionDirector(deltaSeconds);
    const result = this.incursionField.update(deltaSeconds, this.lifeforms, this.encounterDirector.getIncursionPacing());

    if (result.spawned.length > 0) {
      this.lifeforms.push(...result.spawned);
      this.addLifeDisturbance("incursion", result.spawned[0].position, LIFE_DISTURBANCE_WEAPON_RADIUS * 0.7, 0.92);
    }

    result.events.forEach((event) => {
      this.state.ledger.recordEvent(event.type, event.payload, event.options ?? {});
    });

    // Keep every open gate on the distress channel for as long as it is open.
    // The spawn-time report otherwise lapses after its TTL if no ship flies
    // near to get shot and refresh it — leaving a live gate unreported and
    // patrols with nothing to answer. This heartbeat does not count as a fresh
    // hit, so it keeps the report alive without inflating its severity.
    this.incursionField.getActivePortals().forEach((portal) => {
      fileAttackReport(this.state, {
        threatId: portal.id, position: portal.position, kind: "gate",
        severity: Math.min(1, 0.5 + portal.waveCount * 0.02),
        siteId: this.nearestSiteId(portal.position), heartbeat: true,
      });
    });

    this.updateIncursionDevices(deltaSeconds);
  }

  suppressPersistentIncursionForEconomicRecovery() {
    if (!this.encounterDirector.consumePortalSuppressionRequest()) return;
    const portal = this.incursionField.getActivePortals()
      .filter((candidate) => candidate.age >= 300 || candidate.waveCount >= 6)
      .sort((a, b) => b.waveCount - a.waveCount || b.age - a.age)[0];
    if (!portal) return;
    const retreating = this.lifeforms.filter((lifeform) => lifeform.sourcePortalId === portal.id).length;
    this.lifeforms = this.lifeforms.filter((lifeform) => lifeform.sourcePortalId !== portal.id);
    this.clearIncursionPortal(portal, { rewardCredits: false, cause: "economic-recovery-relief" });
    // Suppression is a recovery interval, not an invitation for the ambient
    // clock to replace the same portal on the following frame.
    this.incursionDirector.nextSpawnIn = Math.max(this.incursionDirector.nextSpawnIn, 120);
    this.state.ledger.recordEvent("incursion.economicRelief", {
      portalId: portal.id, waveCount: portal.waveCount, retreatingHostiles: retreating,
    }, { visible: true, message: `The exhausted incursion at ${portal.id} destabilized and withdrew after sustained regional losses.` });
  }

  updateAmbientIncursionDirector(deltaSeconds) {
    const activePortals = this.incursionField.getActivePortals();

    if (activePortals.length >= INCURSION_MAX_ACTIVE_PORTALS || this.dockedSite || this.activeTow || this.shipDestroyed) {
      return;
    }

    this.incursionDirector.nextSpawnIn -= deltaSeconds;
    if (this.incursionDirector.nextSpawnIn > 0) {
      return;
    }

    const worldContext = getIncursionWorldContext(this.ship.position);
    const portal = this.spawnIncursionPortal();
    const baseGapSeconds = INCURSION_AMBIENT_REPEAT_MIN_SECONDS
      + Math.random() * (INCURSION_AMBIENT_REPEAT_MAX_SECONDS - INCURSION_AMBIENT_REPEAT_MIN_SECONDS);
    this.incursionDirector.nextSpawnIn = baseGapSeconds
      * this.encounterDirector.getIncursionPacing().portalGapMultiplier
      * worldContext.pacing.portalGapMultiplier;

    this.state.ledger.recordEvent(
      "incursion.signalDetected",
      {
        portalId: portal.id,
        x: Math.round(portal.position.x),
        y: Math.round(portal.position.y),
      },
      { visible: true },
    );
  }

  updateIncursionDevices(deltaSeconds) {
    const portals = this.incursionField.getActivePortals();

    portals.forEach((portal) => {
      portal.devices?.filter((device) => device.isAlive).forEach((device) => {
        if (device.type === "drag-bloom") {
          if (distance(this.ship.position, device.position) <= device.radius && !this.shipDestroyed) {
            const damping = Math.max(0, 1 - INCURSION_DRAG_BLOOM_DAMPING * deltaSeconds);
            this.ship.velocity.x *= damping;
            this.ship.velocity.y *= damping;
          }
          return;
        }

        device.cooldown = Math.max(0, (device.cooldown ?? 0) - deltaSeconds);
        if (
          device.cooldown > 0
          || this.shipDestroyed
          || !this.isShipDetectable()
          || distance(this.ship.position, device.position) > INCURSION_SENTINEL_RANGE
        ) {
          return;
        }

        if (device.type === "rift-mine") {
          if (distance(this.ship.position, device.position) <= INCURSION_RIFT_MINE_RANGE) {
            this.fireIncursionMineBurst(device, portal);
          }
          return;
        }

        this.fireIncursionSentry(device, portal);
      });
    });
  }

  fireIncursionSentry(device, portal) {
    const targetDistance = distance(device.position, this.ship.position);
    const leadSeconds = Math.min(0.8, targetDistance / INCURSION_SENTINEL_SHOT_SPEED);
    const target = {
      x: this.ship.position.x + this.ship.velocity.x * leadSeconds,
      y: this.ship.position.y + this.ship.velocity.y * leadSeconds,
    };
    const direction = normalizeVector(target.x - device.position.x, target.y - device.position.y);

    this.incursionShots.push({
      portalId: portal.id,
      sourceType: "rift-sentry",
      position: { ...device.position },
      velocity: {
        x: direction.x * INCURSION_SENTINEL_SHOT_SPEED,
        y: direction.y * INCURSION_SENTINEL_SHOT_SPEED,
      },
      radius: 4.5,
      age: 0,
      maxAge: INCURSION_SENTINEL_SHOT_SECONDS,
      damage: INCURSION_SENTINEL_DAMAGE,
    });
    device.cooldown = 2.05;
  }

  fireIncursionMineBurst(device, portal) {
    const shotCount = 6;

    for (let index = 0; index < shotCount; index += 1) {
      const angle = (Math.PI * 2 * index) / shotCount + (device.pulse ?? 0) * 0.25;
      this.incursionShots.push({
        portalId: portal.id,
        sourceType: "rift-mine",
        position: { ...device.position },
        velocity: {
          x: Math.cos(angle) * INCURSION_RIFT_MINE_SHOT_SPEED,
          y: Math.sin(angle) * INCURSION_RIFT_MINE_SHOT_SPEED,
        },
        radius: 3.5,
        age: 0,
        maxAge: INCURSION_RIFT_MINE_SHOT_SECONDS,
        damage: INCURSION_RIFT_MINE_SHOT_DAMAGE,
        color: "#7ce8ff",
      });
    }

    device.cooldown = INCURSION_RIFT_MINE_COOLDOWN_SECONDS;
  }

  updateIncursionShots(deltaSeconds) {
    const destroyedAsteroids = new Set();
    const asteroidFragments = [];

    this.incursionShots.forEach((shot) => {
      shot.age += deltaSeconds;
      shot.position.x += shot.velocity.x * deltaSeconds;
      shot.position.y += shot.velocity.y * deltaSeconds;

      if (shot.age >= shot.maxAge) {
        return;
      }

      const hitAsteroid = this.asteroids.find((asteroid) =>
        circlesOverlap(shot.position, shot.radius, asteroid.position, asteroid.radius),
      );

      if (hitAsteroid) {
        shot.age = shot.maxAge;

        if (shot.sourceType === "fighter") {
          if (!destroyedAsteroids.has(hitAsteroid)) {
            destroyedAsteroids.add(hitAsteroid);
            asteroidFragments.push(...this.breakAsteroid(hitAsteroid, shot.velocity));
          }
        } else {
          this.createIncursionShotImpactSparks(shot);
        }
        return;
      }

      const patrolTargets = this.activePatrolIntercepts.filter((patrol) => patrol.isAlive);
      const npcTarget = [...this.npcShips, ...this.workerShips, ...patrolTargets]
        .filter((ship) => ship.isAlive)
        .filter((ship) => !shot.targetId || ship.id === shot.targetId)
        .find((ship) => circlesOverlap(shot.position, shot.radius, ship.position, ship.radius));

      if (npcTarget) {
        shot.age = shot.maxAge;
        const isPatrol = this.activePatrolIntercepts.includes(npcTarget);
        const civilianDamageMultiplier = shot.sourceType === "fighter" && !isPatrol ? 0.55 : 1;
        const appliedDamage = shot.damage * civilianDamageMultiplier;
        npcTarget.damage(appliedDamage);
        this.createNpcImpactSparks(npcTarget);
        this.state.ledger.recordEvent("incursion.npcHit", {
          portalId: shot.portalId, npcId: npcTarget.id, npcName: npcTarget.name,
          npcType: npcTarget.type ?? "route-hauler", damage: appliedDamage,
          hullAfter: Math.max(0, Math.round(npcTarget.hull ?? 0)),
        }, { visible: isVisible(npcTarget, this.canvas, this.camera) });
        // A working ship taking fire is the economy calling for help. File it
        // against the gate that is shooting it, so the report coalesces with the
        // gate's own and points patrols at the source rather than the victim.
        if (!this.activePatrolIntercepts.includes(npcTarget)) {
          fileAttackReport(this.state, {
            threatId: shot.portalId ?? `raid:${npcTarget.id}`,
            position: { x: npcTarget.position.x, y: npcTarget.position.y },
            kind: "raid", reporterId: npcTarget.id, siteId: this.nearestSiteId(npcTarget.position),
          });
        }
        if (!npcTarget.isAlive) {
          this.reconcileIncursionDestroyedShip(npcTarget);
          this.recordNpcDestroyed(npcTarget, "incursion");
          this.createNpcBurst(npcTarget, shot.velocity);
          this.activePatrolIntercepts = this.activePatrolIntercepts.filter((patrol) => patrol !== npcTarget);
        }
        return;
      }

      if (this.shipDestroyed || !circlesOverlap(shot.position, shot.radius, this.ship.position, this.getShipCollisionRadius())) {
        return;
      }

      shot.age = shot.maxAge;
      if (this.shipHitCooldown > 0) {
        return;
      }

      this.shipHitCooldown = SHIP_HIT_COOLDOWN_SECONDS;
      if (!this.absorbShieldImpact({ position: shot.position, velocity: shot.velocity }, "incursion-shot")) {
        this.damageHull(shot.damage);
        this.triggerImpactFeedback(shot.damage);
        this.createShipSparks({ position: shot.position, velocity: shot.velocity });
      }
      this.state.ledger.recordEvent(
        "incursion.sentryHit",
        {
          portalId: shot.portalId,
          damage: shot.damage,
        },
        { visible: false },
      );
    });

    if (destroyedAsteroids.size > 0) {
      this.asteroids = this.asteroids.filter((asteroid) => !destroyedAsteroids.has(asteroid));
      this.asteroids.push(...asteroidFragments);
    }

    this.incursionShots = this.incursionShots.filter((shot) => shot.age < shot.maxAge);
  }

  reconcileIncursionDestroyedShip(ship) {
    const identity = createNpcShipPublicIdentity(ship);
    const wreckRecord = registerOwnedWreck(this.state, {
      shipId: ship.id, shipName: ship.name, identity, position: ship.position, cause: "incursion",
    });
    this.wrecks.push(new ShipWreck({
      id: wreckRecord.id, recordId: wreckRecord.id, name: `${ship.name} Wreck`,
      position: ship.position, velocity: ship.velocity, radius: Math.max(20, ship.radius),
    }));
    this.state.ledger.recordEvent("wreck.created", {
      wreckId: wreckRecord.id, shipId: ship.id, shipName: ship.name,
      shipVin: wreckRecord.shipVin, ownerInstitutionId: wreckRecord.ownerInstitutionId,
      titleId: wreckRecord.titleId, cause: wreckRecord.cause,
    }, { visible: isVisible(ship, this.canvas, this.camera) });
    const cargo = ship.cargo ?? {};
    Object.entries(cargo).forEach(([resourceId, units]) => {
      for (let index = 0; index < units; index += 1) {
        this.pickups.push(new ResourcePickup({
          type: resourceId,
          x: ship.position.x + (index % 3) * 8,
          y: ship.position.y + Math.floor(index / 3) * 8,
          velocity: { x: ship.velocity.x * 0.35, y: ship.velocity.y * 0.35 },
        }));
      }
    });
    const miningOperations = Object.values(this.state.miningOperations ?? {});
    miningOperations.forEach((operation) => {
      const record = operation.ships?.[ship.id];
      if (!record) return;
      record.status = "destroyed";
      record.maintenanceStatus = "destroyed";
      record.destroyedAt = Date.now();
      Object.values(operation.allocations ?? {}).forEach((allocation) => {
        if (allocation.workerShipId !== ship.id || allocation.status !== "active") return;
        allocation.status = "released";
        allocation.outcomeReason = "ship-destroyed";
      });
    });
    const logistics = this.state.logistics;
    const patrolOperation = Object.values(this.state.patrolOperations ?? {}).find((operation) => operation.craft.id === ship.id);
    if (patrolOperation) {
      patrolOperation.craft.hull = 0;
      patrolOperation.craft.status = "destroyed";
      patrolOperation.craft.destroyedAt = Date.now();
      // A watch craft lost on a threat response has to fail its request too,
      // or the settlement stays "covered" by a wreck and cannot ask anyone else.
      const destroyedResponder = this.activePatrolIntercepts.find((patrol) => patrol.id === ship.id && patrol.protectionInternal);
      if (destroyedResponder?.protectionRequestId) {
        failInternalProtectionResponse(this.state, this.state.protectionPlanning?.requests?.[destroyedResponder.protectionRequestId], { hull: 0, reason: "craft-destroyed" });
      }
      this.state.ledger.recordEvent("patrol.craftDestroyed", {
        patrolId: ship.id, patrolName: ship.name, institutionId: patrolOperation.institution.id,
        siteId: patrolOperation.institution.siteId, cause: "incursion",
      }, { visible: true, message: `${ship.name} was destroyed; ${patrolOperation.institution.name} has no available patrol craft.` });
    }
    const protectionProvider = Object.values(this.state.protectionProviders ?? {})
      .find((provider) => provider.craft.id === ship.id);
    if (protectionProvider) {
      protectionProvider.craft.hull = 0;
      protectionProvider.craft.status = "destroyed";
      protectionProvider.craft.destroyedAt = Date.now();
      const requestId = protectionProvider.craft.activeRequestId ?? ship.protectionRequestId;
      if (requestId) failProtectionContract(this.state, requestId, { hull: 0, reason: "craft-destroyed" });
    }
    const hauler = logistics?.haulers?.[ship.id];
    if (hauler) {
      const shipment = logistics.shipments?.[hauler.activeShipmentId];
      if (shipment && ["assigned", "loaded"].includes(shipment.status)) {
        if (shipment.status === "loaded") {
          for (let index = 0; index < (shipment.quantity ?? 0); index += 1) {
            this.pickups.push(new ResourcePickup({
              type: shipment.commodity,
              x: ship.position.x + (index % 3) * 8,
              y: ship.position.y + Math.floor(index / 3) * 8,
              velocity: { x: ship.velocity.x * 0.35, y: ship.velocity.y * 0.35 },
            }));
          }
        }
        shipment.status = "lost";
        shipment.lostAt = Date.now();
        shipment.lossCause = "incursion";
        const issuerAccount = logistics.institutions?.[shipment.issuerInstitutionId]?.accounts?.operating;
        if (issuerAccount) issuerAccount.committed = Math.max(0, issuerAccount.committed - (shipment.committedPayment ?? 0));
        shipment.committedPayment = 0;
        const container = logistics.containers?.[shipment.containerId];
        if (container) {
          container.status = "lost";
          container.custodianInstitutionId = null;
          container.custody ??= [];
          container.custody.push({ institutionId: null, action: "lost-to-incursion", at: Date.now() });
        }
        const procurementOrder = this.state.hubProcurement?.orders?.[shipment.procurementOrderId];
        if (procurementOrder && procurementOrder.status === "shipped") {
          procurementOrder.status = "failed";
          procurementOrder.failureReason = "shipment-lost";
        }
      }
    }

    terminateDestroyedActor(this.state, ship);

  }

  updateIncursionPortalHits() {
    const activePortals = this.incursionField.getActivePortals();

    if (activePortals.length === 0) {
      return;
    }

    this.bullets.forEach((bullet) => {
      if (!bullet.isAlive) {
        return;
      }

      const hitDevice = activePortals
        .flatMap((portal) => portal.devices ?? [])
        .find((device) => device.isAlive && circlesOverlap(bullet.position, bullet.radius, device.position, device.hitRadius ?? device.radius));

      if (hitDevice) {
        bullet.destroy();
        hitDevice.health = Math.max(0, hitDevice.health - INCURSION_PORTAL_BULLET_DAMAGE);
        this.createIncursionDeviceSparks(hitDevice);
        if (hitDevice.health === 0) {
          hitDevice.isAlive = false;
          this.state.ledger.recordEvent("incursion.deviceDestroyed", { deviceType: hitDevice.type }, { visible: true });
        }
        return;
      }

      const hitPortal = activePortals.find((portal) =>
        circlesOverlap(bullet.position, bullet.radius, portal.position, portal.radius),
      );

      if (!hitPortal) {
        return;
      }

      bullet.destroy();
      const damaged = hitPortal.damage(INCURSION_PORTAL_BULLET_DAMAGE);
      this.createIncursionPortalSparks(hitPortal, damaged ? "#d9a7ff" : "#ff74ae");
      this.state.ledger.recordEvent(
        damaged ? "incursion.portalDamaged" : "incursion.portalShielded",
        {
          portalId: hitPortal.id,
          waveCount: hitPortal.waveCount,
          guardCount: hitPortal.guardIds.size,
          health: Math.round(hitPortal.health),
        },
        { visible: false },
      );

      if (!hitPortal.isAlive) {
        this.clearIncursionPortal(hitPortal);
      }
    });
  }

  clearIncursionPortal(portal, { rewardCredits = true, cause = "weapon", site = null, protectionRequestId = null, patrolHull = null } = {}) {
    const reward = getIncursionPortalReward(portal.waveCount);

    this.incursionField.portals = this.incursionField.portals.filter((candidate) => candidate !== portal);
    if (protectionRequestId && cause === "contract-patrol-defense") {
      completeProtectionContract(this.state, protectionRequestId, { hull: patrolHull });
    }
    if (protectionRequestId && cause === "internal-patrol-defense") {
      completeInternalProtectionResponse(this.state, this.state.protectionPlanning?.requests?.[protectionRequestId], { hull: patrolHull });
    }
    if (cause === "weapon") completePlayerProtectionRequest(this.state, portal.id);
    closeProtectionRequestsForThreat(this.state, portal.id);
    resolveAttackReport(this.state, portal.id);
    this.incursionShots = this.incursionShots.filter((shot) => shot.portalId !== portal.id);
    this.createIncursionPortalBurst(portal);
    // Every gate drops a bearer token, whoever cleared it — patrol, NPC, or the
    // player. Its value is fixed here by the gate's level and is redeemed at the
    // authority office for the evergreen bounty; a token left where a patrol
    // cleared a distant rift is loot anyone can come collect.
    if (reward > 0) {
      const trophy = createPortalTrophy({ waveCount: portal.waveCount, tradeValue: reward });
      this.pickups.push(new ResourcePickup({
        x: portal.position.x,
        y: portal.position.y,
        type: trophy.type,
        label: trophy.label,
        tradeValue: trophy.tradeValue,
        velocity: { x: 0, y: 0 },
      }));
    }
    this.state.ledger.recordEvent("incursion.portalDestroyed", {
      portalId: portal.id,
      factionId: portal.factionId,
      waveCount: portal.waveCount,
      reward: 0,
      trophyValue: reward,
      cause,
      siteId: site?.id ?? null,
      siteName: site?.name ?? null,
      x: Math.round(portal.position.x),
      y: Math.round(portal.position.y),
    });
    this.onHudChange(this.state);
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
        shipPowered: this.isShipDetectable(),
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
      if (!this.absorbShieldImpact(threadwyrm, "threadwyrm")) {
        this.damageHull(hit.damage);
        this.triggerImpactFeedback(hit.damage);
        this.createShipSparks(threadwyrm);
      }
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

  // Keep space alive everywhere: top the local area up to a life target that
  // scales with the zone's ambient-life bias, spawning off-screen around the
  // ship. Throttled, and it stops once the target is met, so it never floods.
  updateAmbientLife(deltaSeconds) {
    this.ambientLifeTimer -= deltaSeconds;

    if (this.ambientLifeTimer > 0) {
      return;
    }

    this.ambientLifeTimer = AMBIENT_LIFE_INTERVAL_SECONDS;

    const zone = getZoneProfile(this.ship.position.x, this.ship.position.y);
    const target = Math.round(AMBIENT_LIFE_BASE + (zone.ambientLifeBias ?? 0.6) * AMBIENT_LIFE_SCALE);
    const shipX = this.ship.position.x;
    const shipY = this.ship.position.y;

    const nearbyLife = [];
    this.lifeforms.forEach((lifeform) => {
      if (!lifeform.isAlive || lifeform.sourcePortalId || !AMBIENT_LIFE_TYPES.has(lifeform.type)) {
        return;
      }
      if (Math.hypot(lifeform.position.x - shipX, lifeform.position.y - shipY) <= AMBIENT_LIFE_KEEP_RADIUS) {
        nearbyLife.push(lifeform);
      }
    });

    // Older builds could add several whole flocks while only a handful of
    // individuals were missing. Shed that accidental excess from the outside
    // edge first, while preserving ripe grazers carrying a player reward.
    let nearbyCount = nearbyLife.length;
    if (nearbyCount > AMBIENT_LIFE_LOCAL_HARD_CAP) {
      const removable = nearbyLife
        .filter((lifeform) => lifeform.type !== "grazer" || !isRipe(lifeform))
        .sort((first, second) =>
          Math.hypot(second.position.x - shipX, second.position.y - shipY)
          - Math.hypot(first.position.x - shipX, first.position.y - shipY));
      const excess = nearbyCount - AMBIENT_LIFE_LOCAL_HARD_CAP;
      const culled = removable.slice(0, excess);
      culled.forEach((lifeform) => { lifeform.isAlive = false; });
      nearbyCount -= culled.length;
    }

    if (nearbyCount >= target) {
      return;
    }

    this.ambientLifeSeed += 1;
    const spawned = createAmbientLifeBatch({
      ship: this.ship,
      asteroids: this.asteroids,
      count: AMBIENT_LIFE_FLOCKS_PER_TICK,
      seed: this.ambientLifeSeed,
    });

    // `count` asks the generator for flocks, whose sizes vary. Admit only the
    // number of individuals actually missing so a flock cannot overshoot the
    // carrying target by twenty or thirty creatures in one tick.
    const deficit = Math.min(target - nearbyCount, AMBIENT_LIFE_LOCAL_HARD_CAP - nearbyCount);
    this.lifeforms.push(...spawned.slice(0, Math.max(0, deficit)));
  }

  // Procedural creatures the ship has left far behind are recycled; streaming
  // re-seeds fresh life if the ship returns. Portal guards and non-ambient
  // types (fighters) are never despawned this way.
  shouldDespawnAmbientLife(lifeform) {
    if (lifeform.sourcePortalId || !AMBIENT_LIFE_TYPES.has(lifeform.type)) {
      return false;
    }

    // A grazer that has fed is not interchangeable background life any more —
    // it is carrying a harvest, and culling it for being far away would delete
    // the reward for leaving a field alone long enough to grow one.
    if (lifeform.type === "grazer" && isRipe(lifeform)) {
      return false;
    }

    const dist = Math.hypot(lifeform.position.x - this.ship.position.x, lifeform.position.y - this.ship.position.y);
    return dist > AMBIENT_LIFE_DESPAWN_RADIUS;
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
    const { added, removedSet } = this.chunkManager.update(
      this.ship.position.x,
      this.ship.position.y,
      this.workerShips.filter((worker) => worker.isAlive).map((worker) => worker.position),
    );

    if (added.length > 0 || removedSet.size > 0) {
      this.asteroids = [...this.asteroids.filter((a) => !removedSet.has(a)), ...added];
    }

    if (added.length > 0) {
      // Grow zone-appropriate rock-life on newly streamed rocks so varieties
      // appear as the ship explores, not just in the start field.
      seedChunkRockmoss(added);
    }
  }

  updateHubDefenses(deltaSeconds) {
    this.hubDefenseCooldown = Math.max(0, this.hubDefenseCooldown - deltaSeconds);

    if (this.hubDefenseCooldown > 0) {
      return;
    }

    const hitAsteroids = new Set();
    const hitHunters = new Set();
    const hitPortals = new Set();

    this.worldSites
      .filter((site) => site.type === "hub")
      .forEach((site) => {
        if (hitAsteroids.size + hitHunters.size + hitPortals.size >= MAX_HUB_DEFENSE_HITS_PER_FRAME) {
          return;
        }

        const clearanceRadius = site.interactionRadius + HUB_DEFENSE_RADIUS_PADDING;
        const hunterTarget = this.lifeforms
          .filter((lifeform) => isCombatHostile(lifeform) && lifeform.isAlive && !hitHunters.has(lifeform))
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

        const portalTarget = this.incursionField.getActivePortals()
          .filter((portal) => !hitPortals.has(portal))
          .map((portal) => ({
            portal,
            distance: distance(portal.position, site.position),
          }))
          .filter(({ portal, distance }) => distance - portal.radius <= clearanceRadius)
          .sort((first, second) => first.distance - second.distance)[0]?.portal;

        if (portalTarget) {
          hitPortals.add(portalTarget);
          this.createHubDefenseBeam(site, portalTarget);
          portalTarget.isAlive = false;
          portalTarget.health = 0;
          this.createHubDefenseBurst(site, portalTarget);
          this.clearIncursionPortal(portalTarget, { rewardCredits: false, cause: "hub-defense", site });
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

    if (hitAsteroids.size + hitHunters.size + hitPortals.size === 0) {
      return;
    }

    this.asteroids = this.asteroids.filter((asteroid) => !hitAsteroids.has(asteroid));
    this.hubDefenseCooldown = HUB_DEFENSE_COOLDOWN_SECONDS;
  }

  updateNpcShips(activeAsteroids, deltaSeconds) {
    this.npcShips.forEach((ship) => {
      const operationalRecord = this.state.sprc?.haulers?.[ship.id];
      if (operationalRecord) {
        if (!operationalRecord.availableForWork) ship.operationalStatus = "maintenance";
      }
    });
    const localNpcShips = this.npcShips.filter((ship) =>
      isNearSimulationArea(ship, this.canvas, this.camera, this.ship, NPC_SIMULATION_MARGIN),
    );

    this.npcShips.forEach((ship) => {
      ship.environmentHitCooldown = Math.max(0, (ship.environmentHitCooldown ?? 0) - deltaSeconds);
      ship.update(deltaSeconds, {
        asteroids: localNpcShips.includes(ship) ? activeAsteroids : [],
        npcShips: this.npcShips,
        sites: this.worldSites,
      });
      ship.consumeEvents().forEach((event) => {
        const hauler = this.state.logistics?.haulers?.[ship.id];
        const carrier = hauler ? this.state.logistics?.institutions?.[hauler.carrierInstitutionId] : null;
        const payload = carrier
          ? { ...event.payload, institutionId: carrier.id, institutionName: carrier.name, carrierInstitutionId: carrier.id, carrierName: carrier.name }
          : event.payload;
        const navigationMessages = {
          "npc.corridorEntered": `${ship.name} entered the First Reach Freight Corridor.`,
          "npc.corridorExited": `${ship.name} cleared the freight corridor at ${event.payload.siteName ?? "its destination"}.`,
          "npc.navigationReplanned": `${ship.name} replanned around an obstructed route.`,
        };
        const message = navigationMessages[event.type];
        this.state.ledger.recordEvent(event.type, payload, { visible: Boolean(message), message });
      });

      if (ship.environmentHitCooldown > 0) {
        return;
      }

      const hitAsteroid = localNpcShips.includes(ship) && activeAsteroids.find((asteroid) =>
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

    this.updateHubTrafficSensors(localNpcShips);
  }

  updateHubTrafficSensors(activeNpcShips) {
    this.worldSites
      .filter((site) => site.type === "hub")
      .forEach((site) => {
        // Hub sensors detect traffic; inspection requires the physical patrol
        // craft to approach and perform its existing flyby scan.

        const patrolCreateRadius = site.interactionRadius * PATROL_CREATE_RANGE_FACTOR;
        const ambientForHub = this.ambientPatrolForHub(site.id);
        const playerInPatrolRange = distance(this.ship.position, site.position) <= patrolCreateRadius;

        if (!playerInPatrolRange) {
          // Player left patrol territory  send this hub's ambient patrol home.
          // Threat responders answer the threat, not the player's viewport
          // location, and stay simulated outside local range.
          if (ambientForHub) {
            this.departHubPatrol(site.id);
          }
          return;
        }

        if (!this.hubPatrolEnabled || !this.state.ui?.panels?.viewport?.available || this.dockedSite) {
          return;
        }

        if (!ambientForHub) {
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
    if (!((cause === "hub-defense" || cause === "patrol-defense") && hunter.sourcePortalId)) {
      this.createHostileDrops(hunter, hunter.velocity);
    }
    if (!hunter.sourcePortalId) {
      this.respawnHunter();
    }
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
        npcType: ship.type ?? (this.activePatrolIntercepts.includes(ship) ? "patrol-ship" : "route-hauler"),
        cause,
      },
      { visible: isVisible(ship, this.canvas, this.camera) },
    );
  }

  // Onboard hull patching: once the hull has gone HULL_REPAIR_DELAY_SECONDS
  // without fresh damage, stored repair reserve flows back into missing
  // integrity at HULL_REPAIR_RATE, 1:1. Damage detection is a frame-over-frame
  // integrity watch, so it uniformly catches weapons, collisions, and hazards
  // (which lower integrity directly, not through damageHull).
  updateHullRepair(deltaSeconds) {
    const hull = this.state.components.hull;

    if (!hull?.installed) {
      this._hullIntegrityWatch = hull?.integrity;
      return;
    }

    const watch = this._hullIntegrityWatch ?? hull.integrity;
    let delay = this.hullRepairDelay ?? 0;

    if (hull.integrity < watch) {
      delay = HULL_REPAIR_DELAY_SECONDS;
      this._hullRepairStartIntegrity = null;
      this._hullRepairTargetIntegrity = null;
    }

    if (delay > 0) {
      this.hullRepairDelay = Math.max(0, delay - deltaSeconds);
      this._hullIntegrityWatch = hull.integrity;
      return;
    }

    this.hullRepairDelay = 0;
    const reserveBefore = hull.repairReserve ?? 0;
    if (!Number.isFinite(this._hullRepairStartIntegrity)) {
      this._hullRepairStartIntegrity = hull.integrity;
      this._hullRepairTargetIntegrity = Math.min(hull.maxIntegrity, hull.integrity + reserveBefore);
    }
    const rateMultiplier = getHullRepairRateMultiplier(
      hull.integrity,
      this._hullRepairStartIntegrity,
      this._hullRepairTargetIntegrity,
    );
    const patched = applyPanelPatch(hull, hull, HULL_REPAIR_RATE * rateMultiplier * deltaSeconds);

    if (patched > 0) {
      // Zero integrity strands and powers down the ship, but it does not make
      // stored onboard patch material inert. The first successful patch
      // releases the destroyed latch; the engine deliberately remains off so
      // recovery cannot unexpectedly apply thrust or resume powered systems.
      if (this.shipDestroyed && hull.integrity > 0) {
        this.shipDestroyed = false;
        this.hasRecordedStrandedEvent = false;
      }
      this.onHudChange(this.state);

      // Ran the tank dry with damage still outstanding — surface it once so the
      // player knows to convert more patch material.
      if ((hull.repairReserve ?? 0) <= 0 && reserveBefore > 0 && hull.integrity < hull.maxIntegrity) {
        this.state.ledger.recordEvent("ship.repairReserveEmpty", {
          hullIntegrity: Math.round(hull.integrity),
          hullMaxIntegrity: hull.maxIntegrity,
        });
      }
    }

    if (hull.integrity >= hull.maxIntegrity || (hull.repairReserve ?? 0) <= 0) {
      this._hullRepairStartIntegrity = null;
      this._hullRepairTargetIntegrity = null;
    }

    this._hullIntegrityWatch = hull.integrity;
  }

  isHullRepairing() {
    const hull = this.state.components.hull;

    return Boolean(
      hull?.installed &&
        (this.hullRepairDelay ?? 0) <= 0 &&
        (hull.repairReserve ?? 0) > 0 &&
        hull.integrity < hull.maxIntegrity,
    );
  }

  // ── Engine condition (first panel on the shared panel-condition system) ────
  // Applies this frame's symptoms from the current stage. Runs before the ship
  // consumes thrust so the modifiers/misfire block take effect this frame.
  applyEngineConditionEffects(deltaSeconds) {
    const engine = this.state.components.engine;
    const ship = this.ship;

    if (!engine?.installed) {
      ship.conditionThrustMultiplier = 1;
      ship.conditionMaxSpeedMultiplier = 1;
      ship.conditionThrustBlocked = false;
      return;
    }

    const condition = ensurePanelCondition(engine);
    const effects = getEngineStageEffects(condition.stage);

    ship.conditionThrustMultiplier = effects.thrustScale;
    ship.conditionMaxSpeedMultiplier = effects.maxSpeedScale;

    // Misfire: a brief thrust dropout that auto-recovers. It only rolls while
    // the player is actually calling for thrust, so it reads as the drive
    // coughing under load rather than a random input stall.
    this.engineMisfireRemaining = Math.max(0, this.engineMisfireRemaining - deltaSeconds);
    if (
      this.engineMisfireRemaining <= 0 &&
      effects.misfireChance > 0 &&
      engine.powered &&
      engine.fuel > 0 &&
      !this.shipDestroyed &&
      this.input.isDown("KeyW") &&
      Math.random() < effects.misfireChance * deltaSeconds
    ) {
      this.engineMisfireRemaining = effects.misfireDuration;
      this.audio?.playEngineFault(condition.stage);
    }
    ship.conditionThrustBlocked = this.engineMisfireRemaining > 0;

    // Steering pull: a gentle wandering drift at Emergency+, so control feels
    // untrustworthy without yanking the ship around.
    if (effects.steerPull > 0 && engine.powered && !this.shipDestroyed) {
      this.engineSteerBias += (Math.random() - 0.5) * effects.steerPull * 4 * deltaSeconds;
      this.engineSteerBias = Math.max(-effects.steerPull, Math.min(effects.steerPull, this.engineSteerBias));
      this.ship.angle += this.engineSteerBias * deltaSeconds;
    } else {
      this.engineSteerBias = 0;
    }
  }

  // Accrues use-driven wear and reacts to any stage change. Runs after the ship
  // moves so wear reflects what actually happened this frame.
  updateEngineCondition(deltaSeconds) {
    const engine = this.state.components.engine;
    if (!engine?.installed || this.shipDestroyed) {
      return;
    }

    const condition = ensurePanelCondition(engine);
    const speed = Math.hypot(this.ship.velocity.x, this.ship.velocity.y);
    const wearDelta =
      computeEngineWearDelta({
        thrusting: this.ship.isThrusting,
        speed,
        boosting: this.ship.boostDurationRemaining > 0,
        deltaSeconds,
      }) * this.conditionDebugScale;

    if (wearDelta <= 0) {
      return;
    }

    const { changed, previousStage, stage } = accumulatePanelWear(condition, wearDelta, ENGINE_CONDITION_CONFIG.thresholds);
    if (changed) {
      this.onEnginePanelStageChanged(previousStage, stage);
    }
  }

  onEnginePanelStageChanged(previousStage, stage) {
    const worsening = panelStageIndex(stage) > panelStageIndex(previousStage);

    this.state.ledger.recordEvent("ship.panelConditionChanged", {
      panel: "engine",
      from: previousStage,
      to: stage,
      worsening,
    });

    if (worsening) {
      this.audio?.playEngineFault(stage);
      const messages = {
        degraded: { title: "Engine Strain", hint: "Drive is misfiring under load — schedule service soon." },
        emergency: { title: "Engine Fault", hint: "Thrust failing and pulling — reach a repair facility." },
        failed: { title: "Engine Failure", hint: "Primary thrust is dead. Signal for a tow." },
      };
      const message = messages[stage];
      if (message) {
        this.showViewportTitle(message.title, message.hint, "hazard", VIEWPORT_TITLE_SECONDS, "left");
      }
      if (stage === "failed") {
        this.ship.stopThrusting();
        this.ship.conditionThrustBlocked = true;
        this.recordStrandedEvent("engine-failed");
      }
    }

    this.onHudChange(this.state);
  }

  // Point the camera at any actor with a position (NPC carrier, mining worker).
  // Pass null to hand control back to the ship. Purely a viewing aid — it
  // changes nothing about simulation or input.
  setCameraFocus(target) {
    this.cameraFocusTarget = target ?? null;
    return this.cameraFocusTarget;
  }

  focusCameraOnActorId(actorId) {
    const actor = [...(this.npcShips ?? []), ...(this.workerShips ?? [])].find((entry) => entry.id === actorId);
    return this.setCameraFocus(actor ?? null);
  }

  getCameraFocusId() {
    return this.cameraFocusTarget?.id ?? null;
  }

  isEngineFailed() {
    return this.state.components.engine?.condition?.stage === "failed";
  }

  // Dev accelerator so the whole ~40-60 min chain can be exercised in a couple
  // of minutes. window.__asteroids.game.setConditionDebugScale(60), etc.
  setConditionDebugScale(scale) {
    this.conditionDebugScale = Math.max(0, Number(scale) || 0);
    return this.conditionDebugScale;
  }

  debugSetEnginePanelStage(stage) {
    const engine = this.state.components.engine;
    const condition = ensurePanelCondition(engine);
    const thresholds = ENGINE_CONDITION_CONFIG.thresholds;
    const wearForStage = { healthy: 0, degraded: thresholds.degraded, emergency: thresholds.emergency, failed: thresholds.failed };
    const previousStage = condition.stage;

    condition.wear = wearForStage[stage] ?? 0;
    condition.stage = stage in wearForStage ? stage : "healthy";
    condition.currentCondition = Math.max(0,
      condition.maxRecoverableCondition * (1 - condition.wear / thresholds.failed));
    if (condition.stage !== previousStage) {
      this.onEnginePanelStageChanged(previousStage, condition.stage);
    }
    this.onHudChange(this.state);
    return condition;
  }

  debugAddEngineWear(points) {
    const engine = this.state.components.engine;
    const condition = ensurePanelCondition(engine);
    const { changed, previousStage, stage } = accumulatePanelWear(condition, Number(points) || 0, ENGINE_CONDITION_CONFIG.thresholds);
    if (changed) {
      this.onEnginePanelStageChanged(previousStage, stage);
    }
    return condition;
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

  // World effects should sound local only when they are local. Retain a faint
  // floor for distant activity so the terrarium still feels alive without an
  // offscreen mining operation sounding as though it is beside the cockpit.
  getWorldAudioProfile(position) {
    if (!position || !this.ship?.position) {
      return { volumeScale: 1, pitchScale: 1 };
    }

    const screenDistance = Math.hypot(
      position.x - this.ship.position.x,
      position.y - this.ship.position.y,
    ) * (this.camera?.zoom ?? 1);
    const screenSpan = Math.max(1, Math.hypot(this.canvas.width, this.canvas.height));
    const fullVolumeRadius = screenSpan * 0.45;
    const quietRadius = screenSpan * 1.75;

    if (screenDistance <= fullVolumeRadius) {
      return { volumeScale: 1, pitchScale: 1 };
    }

    const falloff = Math.min(1, (screenDistance - fullVolumeRadius) / (quietRadius - fullVolumeRadius));
    return {
      volumeScale: 1 - falloff * 0.92,
      // A restrained redshift: distant impacts become lower and less insistent,
      // but remain recognisably the same event rather than a new sound effect.
      pitchScale: 1 - falloff * 0.28,
    };
  }

  breakAsteroid(asteroid, impactVelocity, audioContext = {}) {
    this.impactSeed += 1;
    const resourceType = getAsteroidResourceType(asteroid);
    const sourceClaim = this.getAsteroidSourceClaim(asteroid);
    asteroid.sourceClaimId = sourceClaim?.id ?? asteroid.sourceClaimId ?? null;
    asteroid.sourceClaimName = sourceClaim?.strongestZoneName ?? asteroid.sourceClaimName ?? null;
    const audioProfile = audioContext.localPlayer
      ? { volumeScale: 1, pitchScale: 1 }
      : this.getWorldAudioProfile(asteroid.position);
    this.audio?.playRockBreak(asteroid.tier, {
      ...audioProfile,
      isNpcMining: Boolean(audioContext.npcMining),
    });

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
          strain: parentMoss.strain ?? "moss",
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
        this.updateRockmossSpread(asteroid, moss, deltaSeconds);
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

  // Only the pod strain self-spreads: a pod that has fully covered its rock ticks
  // a timer and, when it fires, seeds one nearby BARE rock with a fresh pod. The
  // timer's lazy seed-based offset staggers pods so they don't all fire at once.
  updateRockmossSpread(asteroid, moss, deltaSeconds) {
    if (moss.strain !== "pod") {
      return;
    }

    moss.spreadTimer = (moss.spreadTimer ?? pseudoRandom(moss.seed, 7) * ROCKMOSS_SPREAD_INTERVAL) + deltaSeconds;

    if (moss.spreadTimer < ROCKMOSS_SPREAD_INTERVAL) {
      return;
    }

    moss.spreadTimer = 0;
    this.trySpreadPod(asteroid);
  }

  trySpreadPod(sourceAsteroid) {
    let nearbyMoss = 0;
    const candidates = [];

    for (const rock of this.asteroids) {
      if (rock === sourceAsteroid || !rock.points?.length) {
        continue;
      }

      const gap = distance(rock.position, sourceAsteroid.position);
      if (gap > ROCKMOSS_SPREAD_RANGE) {
        continue;
      }

      if (rock.rockmoss) {
        nearbyMoss += 1;
        continue;
      }

      candidates.push(rock);
    }

    // Density guardrail: stop seeding an already-mossy neighbourhood.
    if (nearbyMoss >= ROCKMOSS_SPREAD_DENSITY_CAP || candidates.length === 0) {
      return;
    }

    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const patchCap = this.getRockmossPatchCap(target);
    target.rockmoss = {
      seed: Math.round((target.position.x + 30000) * 17 + (target.position.y + 30000) * 31),
      coverage: 1 / Math.max(1, patchCap),
      glow: 0.42,
      patches: 1,
      crawlers: 1,
      work: 0,
      strain: "pod",
    };
    this.createRockmossBurst(target, { x: 0, y: 0 }, 8);
    this.state.ledger.recordEvent(
      "lifeform.rockmossColonized",
      { x: Math.round(target.position.x), y: Math.round(target.position.y), spread: true },
      { visible: false },
    );
  }

  // Rock-life browses what nobody came back for. See `systems/grazing.js` for
  // why abandoned material has to leave the world by being eaten rather than by
  // quietly expiring on a timer.
  updateGrazing(deltaSeconds, activeLifeforms = this.lifeforms, activeAsteroids = this.asteroids) {
    if (this.pickups.length === 0) return;

    const grazers = activeLifeforms.filter((lifeform) => lifeform.type === "grazer" && lifeform.isAlive);
    const localMargin = LIFE_SIMULATION_MARGIN + GRAZING_DEFAULTS.senseRadius;
    const localPickups = this.pickups.filter((pickup) =>
      isNearSimulationArea(pickup, this.canvas, this.camera, this.ship, localMargin));

    this.updateGrazerEmergence(deltaSeconds, grazers, localPickups, activeAsteroids);
    if (grazers.length === 0) return;

    this.refreshGrazeReach(deltaSeconds, localPickups, activeAsteroids);

    this.grazePlanCooldown = Math.max(0, (this.grazePlanCooldown ?? 0) - deltaSeconds);
    const assignNew = this.grazePlanCooldown <= 0;
    if (assignNew) this.grazePlanCooldown = GRAZE_PLAN_REFRESH_SECONDS;

    const { eaten } = advanceGrazing(grazers, localPickups, {
      deltaSeconds,
      shipPosition: this.ship?.position ?? null,
      assignNew,
    });

    if (eaten.length === 0) return;

    const consumed = new Set(eaten);
    eaten.forEach((pickup) => {
      this.state.ledger.recordEvent(
        "life.grazed",
        {
          resourceType: pickup.type,
          amount: pickup.quantity ?? 1,
          x: Math.round(pickup.position.x),
          y: Math.round(pickup.position.y),
        },
        { visible: false },
      );
    });
    this.pickups = this.pickups.filter((pickup) => !consumed.has(pickup));
  }

  // How close anything can actually get to each drop.
  //
  // Ore settles inside and against rocks — measured on a real field, the units
  // that survived a grazed spill were the ones sitting up to sixty units INSIDE
  // a boulder. Nothing was ever going to reach those, so they sat forever while
  // creatures queued at the rock face. A drop swallowed by a rock is browsed off
  // the rock's surface instead.
  //
  // Recomputed on a slow cadence rather than every frame: rocks drift, but not
  // fast enough to matter, and this is the one part of grazing that scales with
  // asteroid count.
  refreshGrazeReach(deltaSeconds, pickups = this.pickups, asteroids = this.asteroids) {
    this.grazeReachCooldown = (this.grazeReachCooldown ?? 0) - deltaSeconds;
    if (this.grazeReachCooldown > 0) return;
    this.grazeReachCooldown = GRAZE_REACH_REFRESH_SECONDS;

    if (pickups.length === 0) return;
    const start = (this.grazeReachCursor ?? 0) % pickups.length;
    const count = Math.min(GRAZE_REACH_REFRESH_BUDGET, pickups.length);
    for (let offset = 0; offset < count; offset += 1) {
      const pickup = pickups[(start + offset) % pickups.length];
      let buried = 0;
      asteroids.forEach((asteroid) => {
        const gap = Math.hypot(asteroid.position.x - pickup.position.x, asteroid.position.y - pickup.position.y) - asteroid.radius;
        if (gap < 0) buried = Math.max(buried, -gap);
      });
      pickup.grazeReach = GRAZING_DEFAULTS.nibbleRange + buried;
    }
    this.grazeReachCursor = (start + count) % pickups.length;
  }

  // A feast should draw a crowd rather than politely wait for whichever creature
  // happened to spawn nearby. Where a spill has been sitting long enough to be
  // food and nothing is working it, rock-life surfaces — out from behind a rock
  // if there is one, otherwise straight up out of the dark. They use the same
  // emerge animation ambient life already uses, so they scale and fade in
  // instead of snapping into existence.
  updateGrazerEmergence(deltaSeconds, grazers, pickups = this.pickups, asteroids = this.asteroids) {
    this.grazerEmergeCooldown = Math.max(0, (this.grazerEmergeCooldown ?? 0) - deltaSeconds);
    if (this.grazerEmergeCooldown > 0) return;
    if (grazers.length >= GRAZER_EMERGENCE_CAP) return;

    const clusters = findGrazingClusters(pickups, grazers, {
      shipPosition: this.ship?.position ?? null,
    });
    if (clusters.length === 0) return;

    // The hungriest-looking pile first: most food, fewest mouths.
    const cluster = clusters.sort((first, second) => second.missing - first.missing
      || second.units - first.units)[0];

    const random = createRandom(hashNumbers(
      Math.round(cluster.centre.x),
      Math.round(cluster.centre.y),
      Math.round(this.grazerEmergeCount ?? 0),
    ));
    const born = createGrazerAtFeast(cluster.centre, asteroids, random);
    this.lifeforms.push(born);
    this.grazerEmergeCount = (this.grazerEmergeCount ?? 0) + 1;
    this.grazerEmergeCooldown = GRAZER_EMERGE_INTERVAL_SECONDS;

    this.state.ledger.recordEvent(
      "life.surfaced",
      {
        type: "grazer",
        units: cluster.units,
        x: Math.round(cluster.centre.x),
        y: Math.round(cluster.centre.y),
      },
      { visible: false },
    );
  }

  // Shooting a ripe grazer. It is carrying spores rather than the ore it ate —
  // the material is genuinely gone, and what comes back is a farming input, so
  // clearing a field never just hands the ore back.
  harvestGrazer(grazer, impactVelocity) {
    const spores = getGrazerSporeYield(grazer);
    const zone = getZoneProfile?.(grazer.position) ?? null;
    const random = createRandom(hashNumbers(
      Math.round(grazer.position.x),
      Math.round(grazer.position.y),
      4711,
    ));

    for (let index = 0; index < spores; index += 1) {
      const angle = random() * Math.PI * 2;
      const speed = 70 + random() * 130;
      this.pickups.push(new ResourcePickup({
        x: grazer.position.x + Math.cos(angle) * 8,
        y: grazer.position.y + Math.sin(angle) * 8,
        type: ROCKMOSS_CRAWLER_TYPE,
        strain: pickRockmossStrain(zone, random),
        velocity: {
          x: grazer.velocity.x * 0.2 + Math.cos(angle) * speed + (impactVelocity?.x ?? 0) * 0.01,
          y: grazer.velocity.y * 0.2 + Math.sin(angle) * speed + (impactVelocity?.y ?? 0) * 0.01,
        },
      }));
    }

    grazer.isAlive = false;
    this.createHunterBurst(grazer, impactVelocity ?? { x: 0, y: 0 }, { count: 18, color: "#c6ff96" });
    this.state.ledger.recordEvent(
      "life.harvested",
      { type: "grazer", fullness: grazer.fullness ?? 0, spores },
      { visible: true, message: `Rock-grazer harvested — ${spores} rockmoss spores recovered.` },
    );
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
      strain: pickup.strain ?? "moss",
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
          strain: moss.strain ?? "moss",
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
      color: "#9ee8ff",
    });
  }

  createPatrolDefenseBeam(patrol, aimPoint) {
    this.siteDefenseBeams.push({
      start: { x: patrol.position.x, y: patrol.position.y },
      end: { x: aimPoint.x, y: aimPoint.y },
      life: 0.12,
      maxLife: 0.12,
      color: "#7ee7ff",
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

  createPatrolDefenseBurst(patrol, target) {
    const count = 7 + Math.floor(target.radius / 9);
    const beamAngle = Math.atan2(target.position.y - patrol.position.y, target.position.x - patrol.position.x);

    for (let index = 0; index < count; index += 1) {
      const angle = beamAngle + Math.PI + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = 50 + Math.random() * 115;

      this.particles.push({
        type: "spark",
        position: {
          x: target.position.x + (Math.random() - 0.5) * target.radius,
          y: target.position.y + (Math.random() - 0.5) * target.radius,
        },
        velocity: {
          x: target.velocity.x * 0.18 + Math.cos(angle) * speed,
          y: target.velocity.y * 0.18 + Math.sin(angle) * speed,
        },
        color: index % 4 === 0 ? "#ffffff" : "#7ee7ff",
        size: 1.2 + Math.random() * 2.4,
        life: 0.2 + Math.random() * 0.22,
        maxLife: 0.46,
      });
    }
  }

  createIncursionPortalSparks(portal, color = "#d9a7ff") {
    const count = portal.isShielded ? 10 : 7;

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 115;

      this.particles.push({
        type: "spark",
        position: {
          x: portal.position.x + Math.cos(angle) * portal.radius * (0.55 + Math.random() * 0.35),
          y: portal.position.y + Math.sin(angle) * portal.radius * (0.55 + Math.random() * 0.35),
        },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        color,
        size: 1.3 + Math.random() * 2.7,
        drag: 0.952,
        life: 0.22 + Math.random() * 0.28,
        maxLife: 0.5,
      });
    }
  }

  createIncursionDeviceSparks(device) {
    const color = device.type === "drag-bloom" ? "#bca7ff" : "#ff74ae";
    const count = device.isAlive ? 6 : 24;

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * (device.isAlive ? 95 : 180);

      this.particles.push({
        type: index % 3 === 0 ? "square" : "spark",
        position: {
          x: device.position.x + Math.cos(angle) * (device.hitRadius ?? 20) * 0.4,
          y: device.position.y + Math.sin(angle) * (device.hitRadius ?? 20) * 0.4,
        },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        color,
        size: 1.1 + Math.random() * 2.8,
        drag: 0.95,
        life: 0.2 + Math.random() * 0.34,
        maxLife: 0.54,
      });
    }
  }

  createIncursionShotImpactSparks(shot) {
    const heading = Math.atan2(shot.velocity.y, shot.velocity.x);
    const color = shot.color ?? "#ff74ae";

    for (let index = 0; index < 9; index += 1) {
      const angle = heading + Math.PI + (Math.random() - 0.5) * 1.45;
      const speed = 40 + Math.random() * 130;

      this.particles.push({
        type: "spark",
        position: { ...shot.position },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        color,
        size: 1 + Math.random() * 2.1,
        drag: 0.95,
        life: 0.16 + Math.random() * 0.2,
        maxLife: 0.36,
      });
    }
  }

  createIncursionPortalBurst(portal) {
    const count = 38;

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.3;
      const speed = 75 + Math.random() * 230;

      this.particles.push({
        type: index % 4 === 0 ? "square" : "spark",
        position: {
          x: portal.position.x + Math.cos(angle) * portal.radius * 0.35,
          y: portal.position.y + Math.sin(angle) * portal.radius * 0.35,
        },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        color: index % 5 === 0 ? "#ffffff" : index % 2 === 0 ? "#ff74ae" : "#b166ff",
        size: 1.6 + Math.random() * 3.5,
        drag: 0.94,
        life: 0.45 + Math.random() * 0.48,
        maxLife: 0.93,
      });
    }
  }

  createHunterBurst(hunter, impactVelocity, { count = 22, sparkEvery = 3, color = "#ff5d6c" } = {}) {

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.55;
      const speed = 80 + Math.random() * 230;

      this.particles.push({
        type: index % sparkEvery === 0 ? "spark" : "square",
        position: {
          x: hunter.position.x + Math.cos(angle) * hunter.radius * 0.22,
          y: hunter.position.y + Math.sin(angle) * hunter.radius * 0.22,
        },
        velocity: {
          x: hunter.velocity.x * 0.35 + Math.cos(angle) * speed + impactVelocity.x * 0.025,
          y: hunter.velocity.y * 0.35 + Math.sin(angle) * speed + impactVelocity.y * 0.025,
        },
        color: index % 4 === 0 ? "#ffffff" : color,
        size: 1.5 + Math.random() * 3,
        life: 0.28 + Math.random() * 0.38,
        maxLife: 0.66,
      });
    }
  }

  createHostileDrops(hunter, impactVelocity) {
    const enemyType = getHostileEnemyType(hunter);
    const count = getHostileLootCount(enemyType);

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 55 + Math.random() * 125;
      const type = rollHostileLoot(enemyType);

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

  addWorkerShip(ship) {
    if (!this.workerShips.some((candidate) => candidate.id === ship.id)) this.workerShips.push(ship);
    return ship;
  }

  updateWorkerShips(deltaSeconds) {
    const collected = new Set();
    const collectPickup = (pickup) => {
      if (!this.pickups.includes(pickup) || collected.has(pickup)) return null;
      collected.add(pickup);
      return { type: pickup.type, quantity: pickup.quantity ?? 1, sourceClaimId: pickup.sourceClaimId ?? null, producedByWorkerShipId: pickup.producedByWorkerShipId ?? null };
    };
    const pullPickup = (pickup, ship, step, force) => {
      const dx = ship.position.x - pickup.position.x;
      const dy = ship.position.y - pickup.position.y;
      const range = Math.max(1, Math.hypot(dx, dy));
      const acceleration = force / Math.max(90, range);
      pickup.velocity.x += (dx / range) * acceleration * step * 60;
      pickup.velocity.y += (dy / range) * acceleration * step * 60;
    };
    this.workerShips.forEach((ship) => {
      ship.update(deltaSeconds, { asteroids: this.asteroids, pickups: this.pickups.filter((pickup) => !collected.has(pickup)), collectPickup, pullPickup });
      this.workerShots.push(...ship.consumeShots());
    });
    if (collected.size) this.pickups = this.pickups.filter((pickup) => !collected.has(pickup));

    const hitAsteroids = new Set();
    const fragments = [];
    this.workerShots.forEach((shot) => {
      shot.update(deltaSeconds);
      if (shot.age >= shot.maxAge) return;
      const hit = this.asteroids.find((asteroid) => !hitAsteroids.has(asteroid) && circlesOverlap(shot.position, shot.radius, asteroid.position, asteroid.radius));
      if (!hit) return;
      shot.age = shot.maxAge;
      hitAsteroids.add(hit);
      const pickupStart = this.pickups.length;
      fragments.push(...this.breakAsteroid(hit, shot.velocity, { npcMining: true }));
      this.pickups.slice(pickupStart).forEach((pickup) => { pickup.producedByWorkerShipId = shot.sourceShipId; });
    });
    if (hitAsteroids.size) {
      this.asteroids = this.asteroids.filter((asteroid) => !hitAsteroids.has(asteroid));
      this.asteroids.push(...fragments);
    }
    this.workerShots = this.workerShots.filter((shot) => shot.age < shot.maxAge);
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
          amount: pickup.quantity ?? 1,
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
        tradeValue: pickup.tradeValue ?? null,
        label: pickup.label ?? null,
        quantity: pickup.quantity ?? 1,
        strain: pickup.strain ?? null,
      });
      this.audio?.playPickup(pickup.type);
    });

    if (collectedPickups.size === 0) {
      return;
    }

    this.pickups = this.pickups.filter((pickup) => !collectedPickups.has(pickup));
  }

  updateCorridorTravelEffects(deltaSeconds) {
    this.corridorBoostCooldowns.forEach((remaining, id) => {
      const next = remaining - deltaSeconds;
      if (next <= 0) this.corridorBoostCooldowns.delete(id); else this.corridorBoostCooldowns.set(id, next);
    });
    const clearance = getCorridorClearance(this.ship.position, this.getShipCollisionRadius(), this.transportCorridors);
    this.ship.environmentMaxSpeedMultiplier = clearance?.corridor.slipstreamSpeedMultiplier ?? 1;
    this.ship.environmentThrustMultiplier = clearance?.corridor.slipstreamThrustMultiplier ?? 1;
    if (!clearance) return;
    const patch = clearance.corridor.boostPatches.find((candidate) => distance(this.ship.position, candidate.position) <= candidate.radius);
    if (!patch || this.corridorBoostCooldowns.has(patch.id)) return;
    this.corridorBoostCooldowns.set(patch.id, 4);
    this.ship.applyKineticVelocityMultiplier(2);
    this.state.ledger.recordEvent("corridor.boostPatchTriggered", { institutionId: "player", institutionName: this.state.character?.name ?? "Player", corridorId: clearance.corridor.id, patchId: patch.id }, { visible: true, message: `Slipstream patch engaged: velocity doubled.` });
  }

  drawTransportCorridors(camera) {
    this.transportCorridors.forEach((corridor) => {
      this.context.save();
      // Round ends and bends, on both the roadbed and the centreline.
      //
      // A default `butt` cap leaves the roadbed stopping dead in a flat edge
      // short of the hub it serves, which reads as unfinished — the road just
      // gives up. A round cap closes it with a half-disc of half the road's
      // width, so a corridor arriving at a hub wraps around the hub point
      // instead of stopping beside it.
      //
      // `lineJoin` matters as much and is easier to miss: a corridor is stroked
      // through many sampled points, and the default `miter` throws a spike off
      // the outside of every bend where two wide segments meet at an angle.
      //
      // Set once for the whole corridor, so the dashed centreline and the
      // slipstream bars below inherit it rather than each needing to remember.
      // That is deliberate: the dashes become lozenges and the bars become
      // pills, which is the same finished edge the roadbed now has.
      this.context.lineCap = "round";
      this.context.lineJoin = "round";
      this.context.strokeStyle = "rgba(104, 199, 225, 0.045)";
      this.context.lineWidth = corridor.width;
      this.context.beginPath();
      corridor.samples.forEach((point, index) => {
        const x = point.x - camera.x;
        const y = point.y - camera.y;
        if (index === 0) this.context.moveTo(x, y); else this.context.lineTo(x, y);
      });
      this.context.stroke();
      this.context.strokeStyle = "rgba(150, 231, 255, 0.16)";
      this.context.lineWidth = 2;
      this.context.setLineDash([18, 28]);
      this.context.stroke();
      this.context.setLineDash([]);
      corridor.waypoints.forEach((point) => {
        this.context.beginPath();
        this.context.arc(point.x - camera.x, point.y - camera.y, 5, 0, Math.PI * 2);
        this.context.stroke();
      });
      corridor.boostPatches.forEach((patch) => {
        const angle = Math.atan2(patch.tangent.y, patch.tangent.x);
        this.context.save();
        this.context.translate(patch.position.x - camera.x, patch.position.y - camera.y);
        this.context.rotate(angle);
        this.context.strokeStyle = "rgba(255, 220, 92, 0.82)";
        this.context.lineWidth = 6;
        [-22, 0, 22].forEach((offset) => {
          this.context.beginPath();
          this.context.moveTo(offset, -42);
          this.context.lineTo(offset, 42);
          this.context.stroke();
        });
        this.context.restore();
      });
      this.context.restore();
    });
  }

  draw() {
    const drawScale = this.getViewportDrawScale();
    const drawCamera = this.getDrawCamera(this.getShakenCamera(), drawScale);
    const drawCanvas = this.getDrawCanvas(drawScale);

    clearScreen(this.context, this.canvas);
    this.drawClaimField(drawCamera, drawScale);
    this.drawRestrictedRightsOverlay(drawCamera, drawScale);

    this.context.save();
    this.context.scale(drawScale, drawScale);
    drawGrid(this.context, drawCanvas, drawCamera);
    this.drawHazardClouds(drawCamera, drawCanvas);
    this.drawWorldSites(drawCamera, drawCanvas);
    this.drawTransportCorridors(drawCamera);
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
    this.drawIncursionPortals(drawCamera, drawCanvas);
    this.drawIncursionShots(drawCamera, drawCanvas);
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
    this.workerShips.forEach((ship) => {
      if (isVisible(ship, drawCanvas, drawCamera)) ship.draw(this.context, drawCamera);
    });
    this.wrecks.forEach((wreck) => {
      if (isVisible(wreck, drawCanvas, drawCamera)) wreck.draw(this.context, drawCamera);
    });
    this.activePatrolIntercepts.forEach((patrol) => this.drawPatrolIntercept(patrol, drawCamera));
    this.drawScanRings(drawCamera);
    this.drawEmergencyTow(drawCamera);
    this.pickups.forEach((pickup) => {
      if (isVisible(pickup, drawCanvas, drawCamera)) {
        pickup.draw(this.context, drawCamera);
      }
    });
    this.context.fillStyle = "#ffd07a";
    this.workerShots.forEach((shot) => {
      this.context.beginPath();
      this.context.arc(shot.position.x - drawCamera.x, shot.position.y - drawCamera.y, shot.radius, 0, Math.PI * 2);
      this.context.fill();
    });
    this.drawParticles(drawCamera);
    this.drawCollectorField(drawCamera);
    this.bullets.forEach((bullet) => bullet.draw(this.context, drawCamera));
    drawVector(this.context, this.ship.position, this.ship.velocity, drawCamera);
    this.scanner.draw(this.context, drawCamera, this.ship);
    this.drawShield(drawCamera);
    this.ship.draw(this.context, drawCamera);
    this.context.restore();

    this.drawDamageFlash();
    this.drawViewportTitle();
  }

  createShieldSparks(impactBody) {
    const angleToImpact = Math.atan2(impactBody.position.y - this.ship.position.y, impactBody.position.x - this.ship.position.x);
    const radius = this.getShipCollisionRadius();

    for (let index = 0; index < 18; index += 1) {
      const angle = angleToImpact + (Math.random() - 0.5) * 1.15;
      const speed = 85 + Math.random() * 185;
      this.particles.push({
        type: "spark",
        position: {
          x: this.ship.position.x + Math.cos(angleToImpact) * radius,
          y: this.ship.position.y + Math.sin(angleToImpact) * radius,
        },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        color: index % 3 === 0 ? "#ffffff" : "#73d2ff",
        size: 1 + Math.random() * 2.4,
        life: 0.22 + Math.random() * 0.35,
        maxLife: 0.6,
      });
    }
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

  drawIncursionPortals(camera = this.camera, canvas = this.canvas) {
    this.incursionField.getActivePortals().forEach((portal) => {
      if (isVisible(portal, canvas, camera)) {
        portal.draw(this.context, camera);
      }
    });
  }

  drawIncursionShots(camera = this.camera, canvas = this.canvas) {
    this.incursionShots.forEach((shot) => {
      if (!isVisible({ position: shot.position, radius: shot.radius }, canvas, camera)) {
        return;
      }

      const x = shot.position.x - camera.x;
      const y = shot.position.y - camera.y;
      const tail = normalizeVector(-shot.velocity.x, -shot.velocity.y, 12);
      this.context.save();
      this.context.strokeStyle = shot.color ?? "rgba(255, 116, 174, 0.88)";
      this.context.fillStyle = shot.color ?? "#ffd4eb";
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.moveTo(x + tail.x, y + tail.y);
      this.context.lineTo(x, y);
      this.context.stroke();
      this.context.beginPath();
      this.context.arc(x, y, shot.radius, 0, Math.PI * 2);
      this.context.fill();
      this.context.restore();
    });
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
    const style = ROCKMOSS_STRAINS[moss.strain] ?? ROCKMOSS_STRAINS.moss;
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

      this.drawRockmossPatch(style, x, y, size, angle, glow, index, moss.seed);
    }

    this.drawRockmossCrawlers(asteroid, moss, style);
    this.context.restore();
  }

  // One rock-life patch, drawn in the strain's growth-shape at (x,y) with `angle`
  // pointing outward from the rock. Colours come from the strain style.
  drawRockmossPatch(style, x, y, size, angle, glow, index, seed) {
    const ctx = this.context;
    const { color, accent } = style;

    if (style.shape === "crystal") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = mossRgba(color, 0.14 + glow * 0.22);
      ctx.strokeStyle = mossRgba(accent, 0.4 + glow * 0.4);
      const spikeLength = size * 1.9;
      const spikeWidth = size * 0.7;
      ctx.beginPath();
      ctx.moveTo(spikeLength, 0);
      ctx.lineTo(spikeWidth * 0.4, -spikeWidth);
      ctx.lineTo(-spikeWidth * 0.4, 0);
      ctx.lineTo(spikeWidth * 0.4, spikeWidth);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (style.shape === "tube") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = mossRgba(color, 0.42 + glow * 0.4);
      ctx.lineWidth = 2;
      const length = size * 2.3;
      const time = performance.now() / 320 + index + seed * 0.01;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let segment = 1; segment <= 3; segment += 1) {
        const fraction = segment / 3;
        const wobble = Math.sin(time + fraction * 3) * size * 0.55;
        ctx.lineTo(length * fraction, wobble);
      }
      ctx.stroke();
      ctx.fillStyle = mossRgba(accent, 0.55 + glow * 0.3);
      ctx.beginPath();
      ctx.arc(length, Math.sin(time + 3) * size * 0.55, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (style.shape === "crust") {
      ctx.fillStyle = mossRgba(color, 0.1 + glow * 0.12);
      ctx.strokeStyle = mossRgba(accent, 0.14 + glow * 0.18);
      ctx.beginPath();
      ctx.ellipse(x, y, size * 1.95, size * 0.5, angle + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }

    if (style.shape === "glow") {
      ctx.fillStyle = mossRgba(color, 0.06 + glow * 0.16);
      ctx.beginPath();
      ctx.arc(x, y, size * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mossRgba(accent, 0.35 + glow * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (style.shape === "pod") {
      const breathe = 0.82 + Math.sin(performance.now() / 620 + index + seed * 0.01) * 0.18;
      ctx.fillStyle = mossRgba(color, 0.14 + glow * 0.2);
      ctx.strokeStyle = mossRgba(accent, 0.32 + glow * 0.35);
      ctx.beginPath();
      ctx.arc(x, y, size * breathe, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = mossRgba(accent, 0.5);
      ctx.beginPath();
      ctx.arc(x - size * 0.28, y - size * 0.28, size * 0.24, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // default: the original soft moss blob
    ctx.fillStyle = mossRgba(color, 0.08 + glow * 0.18);
    ctx.strokeStyle = mossRgba(accent, 0.25 + glow * 0.35);
    ctx.beginPath();
    ctx.ellipse(x, y, size * 1.45, size * 0.75, angle + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (index % 3 === 0) {
      ctx.fillStyle = mossRgba(accent, 0.3 + glow * 0.45);
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * size, y + Math.sin(angle) * size, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRockmossCrawlers(asteroid, moss, style = ROCKMOSS_STRAINS.moss) {
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
      this.context.fillStyle = mossRgba(style.accent, 0.72);
      this.context.strokeStyle = mossRgba(style.color, 0.82);
      this.context.lineWidth = 1.25;
      this.context.beginPath();
      this.context.ellipse(0, 0, 4.4, 2.5, 0, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.context.strokeStyle = mossRgba(style.accent, 0.52);
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

  // The rights overlay: outline and shade the controlled plots the pilot may not
  // legally work, so they can see where the lines are and where to buy in. Reuses
  // the same claim-field geometry and dashed treatment as the contract plots, but
  // driven by the pilot's own mining rights rather than a job. Clusters of
  // adjacent restricted plots read as one shape: only the outer boundary is drawn.
  drawRestrictedRightsOverlay(camera, drawScale) {
    if (!this.state.ui?.rightsOverlayEnabled) {
      return;
    }
    const ctx = this.context;
    const bounds = {
      minX: camera.x,
      minY: camera.y,
      maxX: camera.x + this.canvas.width / drawScale,
      maxY: camera.y + this.canvas.height / drawScale,
    };
    const network = this.claimField.getPlotNetwork(bounds);
    const grantedClaimIds = getContractGrantedClaimIds(this.state);

    // getPlotNetwork returns bare hex geometry (id/center/vertices). Mining right
    // lives on the claim beneath each plot; flight clearance is decided by the
    // zone at the plot — enrich with both before asking.
    const plotsById = new Map();
    const restricted = new Set();
    const restrictionById = new Map();
    network.plots.forEach((plot) => {
      const claim = this.claimField.getClaimAt(plot.center.x, plot.center.y);
      const zone = getZoneProfile(plot.center.x, plot.center.y);
      const enriched = {
        ...plot,
        rights: claim.rights,
        sourceClaimId: claim.id,
        strongestZoneId: zone.strongestZoneId,
        strongestZoneName: zone.strongestZoneName,
        zoneInfluence: zone.influence,
      };
      plotsById.set(plot.id, enriched);
      const restriction = getPlotRestriction(this.state, enriched, grantedClaimIds);
      if (restriction) {
        restricted.add(plot.id);
        restrictionById.set(plot.id, restriction);
      }
    });
    if (restricted.size === 0) {
      return;
    }

    const project = (point) => [(point.x - camera.x) * drawScale, (point.y - camera.y) * drawScale];
    const pulse = 0.5 + Math.sin(performance.now() / 520) * 0.12;
    const rgba = (color, alpha) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha.toFixed(3)})`;

    ctx.save();

    // Shade each off-limits plot. No-entry (flight-restricted) ground shades
    // harder than fly-through-but-do-not-dig ground.
    restricted.forEach((plotId) => {
      const plot = plotsById.get(plotId);
      if (!plot?.vertices?.length) return;
      const restriction = restrictionById.get(plotId);
      ctx.fillStyle = rgba(restriction?.color ?? [255, 74, 90], restriction?.noFly ? 0.17 + pulse * 0.06 : 0.10 + pulse * 0.05);
      ctx.beginPath();
      plot.vertices.forEach((vertex, index) => {
        const [vx, vy] = project(vertex);
        if (index === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      });
      ctx.closePath();
      ctx.fill();
    });

    // Outline only the outer boundary of restricted clusters: an edge that borders
    // a restricted plot on exactly one side. Interior edges (restricted on both
    // sides) are skipped, so a cluster reads as one region rather than a hex grid.
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -performance.now() / 90;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    network.edges.forEach((edge) => {
      const restrictedIds = edge.plotIds.filter((id) => restricted.has(id));
      if (restrictedIds.length === 0) return;
      const restrictions = restrictedIds.map((id) => restrictionById.get(id));
      if (restrictions.length === 2 && restrictions[0]?.territoryId === restrictions[1]?.territoryId) return;
      const [ax, ay] = project(edge.a);
      const [bx, by] = project(edge.b);
      if (restrictions.length === 2) {
        const gradient = ctx.createLinearGradient(ax, ay, bx, by);
        gradient.addColorStop(0, rgba(restrictions[0]?.color ?? [255, 92, 108], 0.72 + pulse * 0.28));
        gradient.addColorStop(1, rgba(restrictions[1]?.color ?? [255, 92, 108], 0.72 + pulse * 0.28));
        ctx.strokeStyle = gradient;
      } else {
        ctx.strokeStyle = rgba(restrictions[0]?.color ?? [255, 92, 108], 0.72 + pulse * 0.28);
      }
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // One label per contiguous cluster, at its centroid, naming why it is off
    // limits. Clusters come from a flood fill over restricted-plot adjacency.
    this.forEachRestrictedCluster(network, restricted, plotsById, restrictionById, (cluster) => {
      const center = cluster.reduce((sum, plot) => ({ x: sum.x + plot.center.x, y: sum.y + plot.center.y }), { x: 0, y: 0 });
      const [lx, ly] = project({ x: center.x / cluster.length, y: center.y / cluster.length });
      // Flight restriction dominates the label: if any plot in the cluster is
      // no-entry, the whole area reads as no-fly rather than merely no-mine.
      const restriction = cluster.map((plot) => restrictionById.get(plot.id)).find((entry) => entry?.noFly)
        ?? restrictionById.get(cluster[0].id);
      const color = restriction?.color ?? [255, 214, 150];
      ctx.fillStyle = rgba(color, 0.82 + pulse * 0.18);
      ctx.textAlign = "center";
      ctx.font = "600 13px system-ui, sans-serif";
      const detailLines = restriction?.detailLines ?? [restriction?.sublabel].filter(Boolean);
      ctx.fillText(restriction?.label ?? "RESTRICTED", lx, ly - (detailLines.length ? 12 : 0));
      detailLines.forEach((line, index) => {
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillStyle = rgba(color, 0.62 + pulse * 0.14);
        ctx.fillText(line, lx, ly + 4 + index * 14);
      });
    });

    ctx.restore();
  }

  // Group adjacent restricted plots into clusters (flood fill over shared edges)
  // and hand each connected component to the callback.
  forEachRestrictedCluster(network, restricted, plotsById, restrictionById, callback) {
    const neighbors = new Map();
    network.edges.forEach((edge) => {
      const [a, b] = edge.plotIds;
      if (!a || !b) return;
      if (!(restricted.has(a) && restricted.has(b))) return;
      if (restrictionById.get(a)?.territoryId !== restrictionById.get(b)?.territoryId) return;
      if (!neighbors.has(a)) neighbors.set(a, []);
      if (!neighbors.has(b)) neighbors.set(b, []);
      neighbors.get(a).push(b);
      neighbors.get(b).push(a);
    });
    const seen = new Set();
    restricted.forEach((plotId) => {
      if (seen.has(plotId)) return;
      const cluster = [];
      const queue = [plotId];
      seen.add(plotId);
      while (queue.length > 0) {
        const current = queue.pop();
        const plot = plotsById.get(current);
        if (plot) cluster.push(plot);
        (neighbors.get(current) ?? []).forEach((next) => {
          if (seen.has(next)) return;
          seen.add(next);
          queue.push(next);
        });
      }
      if (cluster.length > 0) callback(cluster);
    });
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

    // "" Hex fills: ore density drives brightness, zone color drives hue """"""
    // Dark empty space stays near-invisible; rich ore pockets glow neon.
    network.plots.forEach((plot) => {
      const claim = this.claimField.getClaimAt(plot.center.x, plot.center.y);
      const intensity = claim.resourceIntensity;
      if (intensity < 0.06) return;

      const oreGlow = this.state.ui?.mapGlow ?? 0.20;
      const exponent = 0.3 + oreGlow * 1.2; // 0.3 flat  1.5 high-contrast
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

    // "" Dashed edges and vertex dots (unchanged from Codex) """"""""""""""""""
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

  // Environment fields as world-anchored fog, each in its own color. Sample
  // points align to a world grid (like drawGrid) so fog scrolls with space, not
  // the screen. Most of space is field-free, so nearly every cell exits early.
  // Each cell also emits a drifting mote so a field reads as alive and obvious;
  // wind motes stream along the field's flow direction, showing which way it
  // carries you.
  drawHazardClouds(camera, canvas) {
    const STEP = 165;
    const startX = Math.floor(camera.x / STEP) * STEP;
    const startY = Math.floor(camera.y / STEP) * STEP;
    const context = this.context;
    const time = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;

    context.save();
    for (let wx = startX; wx <= camera.x + canvas.width + STEP; wx += STEP) {
      for (let wy = startY; wy <= camera.y + canvas.height + STEP; wy += STEP) {
        const sample = sampleEnvironment(wx, wy);

        if (!sample || sample.intensity <= 0.04) {
          continue;
        }

        const [r, g, b] = sample.field.color;
        const sx = wx - camera.x;
        const sy = wy - camera.y;
        const radius = STEP * 1.55;
        // Overlapping soft cells compound, so per-cell alpha stays modest — a
        // haze you can fly and see rocks through, not an opaque wall — but high
        // enough to read at zoomed-out panorama scale. A brighter core makes
        // the field obvious without turning the edges into a wall.
        const alpha = Math.min(0.42, sample.intensity * 0.46);
        const gradient = context.createRadialGradient(sx, sy, 0, sx, sy, radius);

        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        context.fillStyle = gradient;
        context.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);

        // Drifting mote: appears, travels along the field's drift direction,
        // and fades out (alpha 0 at the ends, so no teleport when it recycles).
        const hx = pseudoHash(wx, wy, 1.7);
        const hy = pseudoHash(wx, wy, 9.1);
        const angle = sample.field.flow ? getFlowAngle(wx, wy) : hx * Math.PI * 2;
        const speed = sample.field.flow ? 0.4 : 0.16;
        const progress = (time * speed + hx) % 1;
        const travel = STEP * 2.4;
        const baseX = sx + (hx - 0.5) * STEP;
        const baseY = sy + (hy - 0.5) * STEP;
        const moteAlpha = Math.min(0.75, sample.intensity * 0.85) * Math.sin(progress * Math.PI);

        if (moteAlpha > 0.03) {
          context.fillStyle = `rgba(${Math.min(255, r + 45)}, ${Math.min(255, g + 45)}, ${Math.min(255, b + 45)}, ${moteAlpha})`;
          context.beginPath();
          context.arc(
            baseX + Math.cos(angle) * (progress - 0.5) * travel,
            baseY + Math.sin(angle) * (progress - 0.5) * travel,
            1.9,
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }
    }
    context.restore();
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

  drawPatrolIntercept(patrol, camera = this.camera) {
    if (!patrol) {
      return;
    }

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

      if (site.id === "scrap-porch") {
        this.drawSprcFixtures(screenX, screenY);
      }
    });
  }

  drawSprcFixtures(siteScreenX, siteScreenY) {
    const sprc = this.state.sprc;
    if (!sprc) return;
    const mawRunning = Boolean(sprc.facilities?.maw?.activeProductionOrderId);
    const berthOccupied = Boolean(sprc.facilities?.berthTwo?.activeRepairOrderId);
    const pulse = (Date.now() % 1200) / 1200;

    this.context.save();
    this.context.translate(siteScreenX, siteScreenY);
    this.context.font = "10px ui-monospace, monospace";
    this.context.textAlign = "center";

    this.context.strokeStyle = mawRunning ? "#ffb85c" : "rgba(255, 184, 92, 0.55)";
    this.context.fillStyle = mawRunning ? `rgba(255, 184, 92, ${0.12 + pulse * 0.12})` : "rgba(255, 184, 92, 0.06)";
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(-72, 28, 20, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.context.beginPath();
    this.context.arc(-72, 28, 8 + (mawRunning ? pulse * 5 : 0), 0, Math.PI * 2);
    this.context.stroke();
    this.context.fillStyle = "rgba(255, 230, 166, 0.8)";
    this.context.fillText("THE MAW", -72, 62);

    this.context.strokeStyle = berthOccupied ? "#9ee8ff" : "rgba(158, 232, 255, 0.48)";
    this.context.fillStyle = berthOccupied ? "rgba(158, 232, 255, 0.12)" : "rgba(158, 232, 255, 0.04)";
    this.context.strokeRect(45, 9, 54, 38);
    this.context.fillRect(45, 9, 54, 38);
    this.context.fillStyle = "rgba(205, 240, 255, 0.82)";
    this.context.fillText("BERTH TWO", 72, 62);
    this.context.restore();
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
      this.context.strokeStyle = beam.color ?? "#9ee8ff";
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
        this.context.strokeStyle = "rgba(255, 255, 255, 0.82)";
        this.context.lineWidth = 1;
        drawResourceShape(this.context, particle.shape ?? "square", particle.size);
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

  drawShield(camera = this.camera) {
    if (!this.isShieldActive()) {
      return;
    }

    const screenX = this.ship.position.x - camera.x;
    const screenY = this.ship.position.y - camera.y;
    this.context.save();
    this.context.strokeStyle = "rgba(115, 210, 255, 0.82)";
    this.context.fillStyle = "rgba(115, 210, 255, 0.08)";
    this.context.lineWidth = 2;
    this.context.setLineDash([6, 6]);
    this.context.lineDashOffset = -performance.now() * 0.035;
    this.context.beginPath();
    this.context.arc(screenX, screenY, this.getShipCollisionRadius(), 0, Math.PI * 2);
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
    const base = Math.min(this.canvas.width, this.canvas.height) * 0.48;
    const collector = this.state.components.collector;
    if (!collector?.installed) {
      return base;
    }
    // Wear shrinks the field's reach — the drawn ring uses this same value, so
    // the smaller grab radius is visible, not just felt.
    return base * getCollectorStageEffects(ensurePanelCondition(collector).stage).radiusScale;
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

// Cheap deterministic 0..1 hash from world coordinates, for scattering
// environment-field motes without per-particle state. `salt` picks a channel.
function pseudoHash(x, y, salt) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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

function getLeadPoint(source, target, projectileSpeed) {
  const targetVelocity = target.velocity ?? { x: 0, y: 0 };
  const travelSeconds = Math.min(1.1, distance(source.position, target.position) / Math.max(1, projectileSpeed));

  return {
    x: target.position.x + targetVelocity.x * travelSeconds,
    y: target.position.y + targetVelocity.y * travelSeconds,
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
  if (lifeform.type === "fighter") {
    return "rift-fighter";
  }

  return lifeform.role ?? lifeform.type ?? "hostile";
}

function getEntityTypeCounts(entities) {
  return [...entities.reduce((counts, entity) => {
    const type = entity.type ?? "unknown";
    counts.set(type, (counts.get(type) ?? 0) + 1);
    return counts;
  }, new Map()).entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => left.type.localeCompare(right.type));
}

function isCombatHostile(lifeform) {
  return lifeform?.type === "hunter" || lifeform?.type === "fighter";
}

function getIncursionPortalReward(waveCount) {
  return Math.round(INCURSION_PORTAL_BASE_REWARD * Math.pow(1.75, Math.max(0, waveCount - 1)));
}

// Incursions consume the same authored place tags as terrain and resources.
// This remains a small local modifier layered on top of the encounter
// director, so authored danger changes the character of a place without
// bypassing the session-pressure safety system.
function getIncursionWorldContext(position) {
  const zone = getZoneProfile(position.x, position.y);
  const region = getRegionProfile(position.x, position.y);
  const tags = [...new Set([...zone.tags, ...region.tags])];
  let waveSizeMultiplier = 1;
  let waveDelayMultiplier = 1;
  let portalGapMultiplier = 1;

  if (tags.includes("starter")) {
    waveSizeMultiplier *= 0.8;
    waveDelayMultiplier *= 1.2;
    portalGapMultiplier *= 1.35;
  }
  if (tags.includes("safe")) {
    waveSizeMultiplier *= 0.75;
    waveDelayMultiplier *= 1.2;
    portalGapMultiplier *= 1.4;
  }
  if (tags.includes("dangerous")) {
    waveSizeMultiplier *= 1.15;
    waveDelayMultiplier *= 0.9;
    portalGapMultiplier *= 0.8;
  }
  if (tags.includes("hunters")) {
    waveSizeMultiplier *= 1.15;
    waveDelayMultiplier *= 0.9;
    portalGapMultiplier *= 0.85;
  }

  return {
    zoneId: zone.strongestZoneId,
    regionId: region.strongestRegionId,
    tags,
    pacing: {
      waveSizeMultiplier: clamp(waveSizeMultiplier, 0.55, 1.45),
      waveDelayMultiplier: clamp(waveDelayMultiplier, 0.7, 1.6),
      portalGapMultiplier: clamp(portalGapMultiplier, 0.6, 2),
    },
  };
}

function getIncursionSafePosition(requestedPosition, worldSites, fallbackPosition) {
  let position = { x: requestedPosition.x, y: requestedPosition.y };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const protectedSite = worldSites.find((site) => {
      if (site.type !== "hub") {
        return false;
      }

      const protectedRadius = getHubSensorRadius(site) + INCURSION_HUB_EXCLUSION_BUFFER;
      return distance(position, site.position) < protectedRadius;
    });

    if (!protectedSite) {
      return position;
    }

    const protectedRadius = getHubSensorRadius(protectedSite) + INCURSION_HUB_EXCLUSION_BUFFER;
    let directionX = position.x - protectedSite.position.x;
    let directionY = position.y - protectedSite.position.y;
    let length = Math.hypot(directionX, directionY);

    if (length < 0.001) {
      directionX = fallbackPosition.x - protectedSite.position.x;
      directionY = fallbackPosition.y - protectedSite.position.y;
      length = Math.hypot(directionX, directionY);
    }

    if (length < 0.001) {
      const angle = (protectedSite.id.length % 12) * ((Math.PI * 2) / 12);
      directionX = Math.cos(angle);
      directionY = Math.sin(angle);
      length = 1;
    }

    position = {
      x: protectedSite.position.x + (directionX / length) * protectedRadius,
      y: protectedSite.position.y + (directionY / length) * protectedRadius,
    };
  }

  return position;
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

function mossRgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
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
