import { InvaderPortal } from "../entities/InvaderPortal.js?v=fresh-20260716-2155-47b6461";
import { Lifeform } from "../entities/Lifeform.js?v=fresh-20260716-2155-47b6461";
import { hashNumbers } from "./random.js";

const PORTAL_WAVE_SIZES = [5, 10, 30];
const BASE_WAVE_SECONDS = 70;
const WAVE_SECONDS_STEP = 12;
const MAX_WAVE_SECONDS = 105;
const PORTAL_HUNTER_ORBIT_RADIUS = 150;
const PORTAL_SHIELD_GUARD_RADIUS = 950;

export function createIncursionField() {
  return {
    portals: [],
    nextPortalIndex: 1,

    spawnPortal({ x, y, factionId = "rift-callers", seed = 1 } = {}) {
      const portal = new InvaderPortal({
        id: `invader-portal-${this.nextPortalIndex}`,
        x,
        y,
        factionId,
        seed: hashNumbers(x, y, seed, this.nextPortalIndex),
      });
      this.nextPortalIndex += 1;
      this.portals.push(portal);
      const spawned = spawnPortalWave(portal, getPortalWaveSize(0), 0);
      portal.waveCount = 1;
      portal.nextWaveIn = getNextWaveSeconds(portal);
      return { portal, spawned };
    },

    update(deltaSeconds, lifeforms) {
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

        const waveSize = getPortalWaveSize(portal.waveCount);
        const wave = spawnPortalWave(portal, waveSize, portal.waveCount);
        spawned.push(...wave);
        portal.waveCount += 1;
        portal.nextWaveIn = getNextWaveSeconds(portal);
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

function spawnPortalWave(portal, count, waveIndex) {
  const spawned = [];

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + waveIndex * 0.47;
    const distance = PORTAL_HUNTER_ORBIT_RADIUS + (index % 3) * 24;
    const x = portal.position.x + Math.cos(angle) * distance;
    const y = portal.position.y + Math.sin(angle) * distance;
    const hunter = new Lifeform({
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

    hunter.id = `${portal.id}-hunter-${waveIndex + 1}-${index + 1}`;
    hunter.sourcePortalId = portal.id;
    hunter.health = 72 + Math.min(24, waveIndex * 5);
    portal.guardIds.add(hunter.id);
    spawned.push(hunter);
  }

  return spawned;
}

function getNextWaveSeconds(portal) {
  return Math.min(MAX_WAVE_SECONDS, BASE_WAVE_SECONDS + portal.waveCount * WAVE_SECONDS_STEP);
}

function getPortalWaveSize(waveIndex) {
  return PORTAL_WAVE_SIZES[Math.min(waveIndex, PORTAL_WAVE_SIZES.length - 1)];
}

function getDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
