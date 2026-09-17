import { InvaderPortal } from "../entities/InvaderPortal.js?v=fresh-20260916-1920-a4ac4329";
import { FlightFighter } from "../entities/FlightFighter.js?v=fresh-20260916-1920-a4ac4329";
import { RiftSeeder } from "../entities/RiftSeeder.js?v=fresh-20260916-1920-a4ac4329";
import { Lifeform } from "../entities/Lifeform.js?v=fresh-20260916-1920-a4ac4329";
import { hashNumbers } from "./random.js?v=fresh-20260916-1920-a4ac4329";

const PORTAL_WAVE_SIZES = [5, 10, 30];
const BASE_WAVE_SECONDS = 70;
const WAVE_SECONDS_STEP = 12;
const MAX_WAVE_SECONDS = 105;
const PORTAL_HUNTER_ORBIT_RADIUS = 150;
const PORTAL_SHIELD_GUARD_RADIUS = 950;
const PORTAL_DEVICE_TYPES = ["rift-sentry", "drag-bloom", "rift-mine"];
export const RIFT_BLOOM_TYPES = ["drag-bloom", "slip-bloom", "gust-bloom", "venom-bloom", "static-bloom", "thrust-bloom", "brake-bloom", "spiral-bloom", "pulse-bloom"];
// A wave timer that fires while most of the previous wave is still alive is
// what let portals spiral out of reach. Waves now hold until the living guard
// count drops below a fraction of the last wave, rechecking on a short timer.
const WAVE_HOLD_GUARD_FRACTION = 0.4;
const WAVE_HOLD_MIN_GUARDS = 2;
const WAVE_HOLD_RECHECK_SECONDS = 10;
const MIN_PACED_WAVE_SIZE = 2;

export function createIncursionField() {
  return {
    portals: [],
    nextPortalIndex: 1,

    spawnPortal({ x, y, factionId = "rift-callers", seed = 1, pacing = {}, encounterContext = null } = {}) {
      const portal = new InvaderPortal({
        id: `invader-portal-${this.nextPortalIndex}`,
        x,
        y,
        factionId,
        seed: hashNumbers(x, y, seed, this.nextPortalIndex),
      });
      this.nextPortalIndex += 1;
      portal.encounterContext = encounterContext;
      portal.devices = createPortalDevices(portal);
      this.portals.push(portal);
      const portalPacing = getPortalPacing(portal, pacing);
      const seeder = new RiftSeeder({ id: `${portal.id}-seeder`, x, y, angle: (portal.seed % 628) / 100, seed: portal.seed, sourcePortalId: portal.id });
      portal.seederId = seeder.id;
      portal.scoutingComplete = false;
      // The Seeder is a parallel expedition, not part of the combat budget.
      // Wave pressure begins at once and only combat units govern wave hold.
      const wave = spawnPortalWave(portal, getPacedWaveSize(0, portalPacing), 0);
      const spawned = [seeder, ...wave];
      portal.recordWaveFabrication(wave.length);
      portal.lastWaveSize = wave.length;
      portal.waveCount = 1;
      portal.nextWaveIn = getNextWaveSeconds(portal, portalPacing);
      portal.isWaveHeld = false;
      return { portal, spawned };
    },

    update(deltaSeconds, lifeforms, pacing = {}) {
      const livingUnitIds = new Set(
        lifeforms.filter((lifeform) => lifeform.isAlive && lifeform.sourcePortalId).map((lifeform) => lifeform.id),
      );
      const livingGuardIds = new Set(
        lifeforms
          .filter((lifeform) => {
            if (!lifeform.isAlive || !lifeform.sourcePortalId) {
              return false;
            }

            const portal = this.portals.find((candidate) => candidate.id === lifeform.sourcePortalId);
            return portal && getDistance(lifeform.position, portal.position) <= PORTAL_SHIELD_GUARD_RADIUS;
          })
          .map((lifeform) => lifeform.id),
      );
      const events = [];
      const spawned = [];

      this.portals.forEach((portal) => {
        if (!portal.isAlive) {
          return;
        }

        portal.update(deltaSeconds, livingGuardIds, livingUnitIds);
        if (!portal.scoutingComplete && !lifeforms.some((lifeform) => lifeform.id === portal.seederId && lifeform.isAlive)) {
          portal.scoutingComplete = true;
          events.push({ type: "incursion.scoutingComplete", payload: { portalId: portal.id } });
        }
        if (portal.nextWaveIn > 0) {
          return;
        }

        // Hard safety floor: the next wave waits until the previous one is
        // mostly cleared, so a portal can never outrun a struggling player.
        const previousWaveSize = portal.lastWaveSize ?? getPortalWaveSize(Math.max(0, portal.waveCount - 1));
        const holdThreshold = Math.max(WAVE_HOLD_MIN_GUARDS, Math.round(previousWaveSize * WAVE_HOLD_GUARD_FRACTION));

        // Raiders do not stop costing their gate merely because they crossed
        // the close shield orbit. Counting only `guardIds` made every roaming
        // wave look dead and let a single gate accumulate hundreds of units.
        if (portal.unitIds.size > holdThreshold) {
          portal.nextWaveIn = WAVE_HOLD_RECHECK_SECONDS;
          portal.isWaveHeld = true;
          events.push({
            type: "incursion.waveHeld",
            payload: {
              portalId: portal.id,
              guardCount: portal.unitIds.size,
              holdThreshold,
            },
            options: { visible: false },
          });
          return;
        }

        const portalPacing = getPortalPacing(portal, pacing);
        const waveSize = getPacedWaveSize(portal.waveCount, portalPacing);
        const wave = spawnPortalWave(portal, waveSize, portal.waveCount);
        portal.recordWaveFabrication(wave.length);
        portal.lastWaveSize = wave.length;
        portal.isWaveHeld = false;
        spawned.push(...wave);
        portal.waveCount += 1;
        portal.nextWaveIn = getNextWaveSeconds(portal, portalPacing);
        events.push({
          type: "incursion.waveSpawned",
          payload: {
            portalId: portal.id,
            factionId: portal.factionId,
            waveCount: portal.waveCount,
            enemyCount: wave.length,
            x: Math.round(portal.position.x),
            y: Math.round(portal.position.y),
          },
        });
      });

      this.portals = this.portals.filter((portal) => portal.isAlive);
      return { events, spawned };
    },

    getActivePortals() {
      return this.portals.filter((portal) => portal.isAlive);
    },
  };
}

function getPortalPacing(portal, pacing = {}) {
  const local = portal.encounterContext?.pacing ?? {};

  return {
    waveSizeMultiplier: (pacing.waveSizeMultiplier ?? 1) * (local.waveSizeMultiplier ?? 1),
    waveDelayMultiplier: (pacing.waveDelayMultiplier ?? 1) * (local.waveDelayMultiplier ?? 1),
  };
}

function createPortalDevices(portal) {
  const devices = [];

  PORTAL_DEVICE_TYPES.forEach((type, index) => {
    const angle = ((portal.seed % 360) * Math.PI) / 180 + index * ((Math.PI * 2) / PORTAL_DEVICE_TYPES.length);
    const distance = type === "rift-sentry" ? 132 : type === "drag-bloom" ? 190 : 242;
    const maxHealth = type === "rift-sentry" ? 76 : type === "drag-bloom" ? 94 : 62;

    devices.push({
      id: `${portal.id}-${type}`,
      type,
      position: {
        x: portal.position.x + Math.cos(angle) * distance,
        y: portal.position.y + Math.sin(angle) * distance,
      },
      radius: type === "rift-sentry" ? 20 : type === "drag-bloom" ? 150 : 22,
      hitRadius: type === "drag-bloom" ? 20 : 22,
      maxHealth,
      health: maxHealth,
      isAlive: true,
      cooldown: type === "rift-sentry" ? 1.8 + ((portal.seed >>> 4) % 10) * 0.08 : type === "rift-mine" ? 2.8 : 0,
      pulse: (portal.seed % 1000) * 0.01 + index,
    });
  });

  return devices;
}

export function createSeededDevice(portal, deployment, index) {
  const roll = Math.abs(hashNumbers(portal.seed, deployment.sequence, index));
  const isWeapon = roll % 4 < 2;
  const type = isWeapon ? (roll % 2 ? "rift-sentry" : "rift-mine") : RIFT_BLOOM_TYPES[roll % RIFT_BLOOM_TYPES.length];
  const large = !isWeapon && roll % 5 === 0;
  const mobile = isWeapon && roll % 3 !== 0;
  const radius = large ? 260 : type.endsWith("bloom") ? 130 + (roll % 55) : 22;
  const maxHealth = type === "rift-sentry" ? 76 : type === "rift-mine" ? 62 : large ? 150 : 94;
  const across = deployment.heading + Math.PI / 2;
  return {
    id: `${portal.id}-seeded-${deployment.sequence}-${index}`,
    type, position: { ...deployment.position }, radius, hitRadius: type.endsWith("bloom") ? 22 : 22,
    maxHealth, health: maxHealth, isAlive: true, cooldown: type === "rift-sentry" ? 1.7 : type === "rift-mine" ? 2.5 : 0,
    pulse: roll * 0.001, large, mobile,
    motion: mobile ? { origin: { ...deployment.position }, axis: { x: Math.cos(across), y: Math.sin(across) }, distance: 90 + roll % 150, speed: 0.65 + (roll % 60) / 100, phase: (roll % 628) / 100 } : null,
  };
}

function spawnPortalWave(portal, count, waveIndex) {
  const spawned = [];

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + waveIndex * 0.47;
    const distance = PORTAL_HUNTER_ORBIT_RADIUS + (index % 3) * 24;
    const x = portal.position.x + Math.cos(angle) * distance;
    const y = portal.position.y + Math.sin(angle) * distance;
    // One fighter leads each wave. It makes the new flight combat readable
    // without replacing the hunter swarm that gives portals their pressure.
    const shouldSpawnFighter = index === 0;
    const enemy = shouldSpawnFighter
      ? new FlightFighter({
        id: `${portal.id}-fighter-${waveIndex + 1}-${index + 1}`,
        x,
        y,
        angle: angle + Math.PI / 2,
        seed: hashNumbers(portal.seed, waveIndex, index),
        sourcePortalId: portal.id,
      })
      : new Lifeform({
      type: "hunter",
      role: "invader",
      name: `Rift Hunter ${waveIndex + 1}-${index + 1}`,
      x,
      y,
      velocity: {
        x: Math.cos(angle + Math.PI / 2) * (42 + Math.min(18, waveIndex * 3)),
        y: Math.sin(angle + Math.PI / 2) * (42 + Math.min(18, waveIndex * 3)),
      },
      seed: hashNumbers(portal.seed, waveIndex, index),
    });

    if (!shouldSpawnFighter) {
      enemy.id = `${portal.id}-hunter-${waveIndex + 1}-${index + 1}`;
      enemy.sourcePortalId = portal.id;
      enemy.health = 72 + Math.min(24, waveIndex * 5);
    }
    portal.guardIds.add(enemy.id);
    portal.unitIds.add(enemy.id);
    spawned.push(enemy);
  }

  return spawned;
}

// pacing comes from the encounter director: multipliers around the authored
// baseline, never a replacement for it. Missing fields mean "no adjustment".
function getNextWaveSeconds(portal, pacing = {}) {
  const baseSeconds = Math.min(MAX_WAVE_SECONDS, BASE_WAVE_SECONDS + portal.waveCount * WAVE_SECONDS_STEP);
  return baseSeconds * (pacing.waveDelayMultiplier ?? 1);
}

function getPortalWaveSize(waveIndex) {
  return PORTAL_WAVE_SIZES[Math.min(waveIndex, PORTAL_WAVE_SIZES.length - 1)];
}

function getPacedWaveSize(waveIndex, pacing = {}) {
  return Math.max(MIN_PACED_WAVE_SIZE, Math.round(getPortalWaveSize(waveIndex) * (pacing.waveSizeMultiplier ?? 1)));
}

function getDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
