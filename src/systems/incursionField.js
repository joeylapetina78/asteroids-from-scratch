import { InvaderPortal } from "../entities/InvaderPortal.js?v=fresh-20260719-2129-6f18a9a";
import { FlightFighter } from "../entities/FlightFighter.js?v=fresh-20260719-2129-6f18a9a";
import { Lifeform } from "../entities/Lifeform.js?v=fresh-20260719-2129-6f18a9a";
import { hashNumbers } from "./random.js";

const PORTAL_WAVE_SIZES = [5, 10, 30];
const BASE_WAVE_SECONDS = 70;
const WAVE_SECONDS_STEP = 12;
const MAX_WAVE_SECONDS = 105;
const PORTAL_HUNTER_ORBIT_RADIUS = 150;
const PORTAL_SHIELD_GUARD_RADIUS = 950;
const PORTAL_DEVICE_TYPES = ["rift-sentry", "drag-bloom", "rift-mine"];
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
      const spawned = spawnPortalWave(portal, getPacedWaveSize(0, portalPacing), 0);
      portal.waveCount = 1;
      portal.nextWaveIn = getNextWaveSeconds(portal, portalPacing);
      portal.isWaveHeld = false;
      return { portal, spawned };
    },

    update(deltaSeconds, lifeforms, pacing = {}) {
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

        portal.update(deltaSeconds, livingGuardIds);
        if (portal.nextWaveIn > 0) {
          return;
        }

        // Hard safety floor: the next wave waits until the previous one is
        // mostly cleared, so a portal can never outrun a struggling player.
        const previousWaveSize = getPortalWaveSize(Math.max(0, portal.waveCount - 1));
        const holdThreshold = Math.max(WAVE_HOLD_MIN_GUARDS, Math.round(previousWaveSize * WAVE_HOLD_GUARD_FRACTION));

        if (portal.guardIds.size > holdThreshold) {
          portal.nextWaveIn = WAVE_HOLD_RECHECK_SECONDS;
          portal.isWaveHeld = true;
          events.push({
            type: "incursion.waveHeld",
            payload: {
              portalId: portal.id,
              guardCount: portal.guardIds.size,
              holdThreshold,
            },
            options: { visible: false },
          });
          return;
        }

        const portalPacing = getPortalPacing(portal, pacing);
        const waveSize = getPacedWaveSize(portal.waveCount, portalPacing);
        const wave = spawnPortalWave(portal, waveSize, portal.waveCount);
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
