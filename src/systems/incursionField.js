import { InvaderPortal } from "../entities/InvaderPortal.js?v=fresh-20260716-1720-a6efb5a";
import { Lifeform } from "../entities/Lifeform.js?v=fresh-20260716-1720-a6efb5a";
import { hashNumbers } from "./random.js";

const FIRST_WAVE_COUNT = 3;
const BASE_WAVE_SECONDS = 26;
const MIN_WAVE_SECONDS = 14;
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
      const spawned = spawnPortalWave(portal, FIRST_WAVE_COUNT, 0);
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

        const waveSize = FIRST_WAVE_COUNT + portal.waveCount;
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
        x: Math.cos(angle + Math.PI / 2) * (55 + waveIndex * 7),
        y: Math.sin(angle + Math.PI / 2) * (55 + waveIndex * 7),
      },
      seed: hashNumbers(portal.seed, waveIndex, index),
    });

    hunter.id = `${portal.id}-hunter-${waveIndex + 1}-${index + 1}`;
    hunter.sourcePortalId = portal.id;
    hunter.health = 85 + Math.min(45, waveIndex * 8);
    portal.guardIds.add(hunter.id);
    spawned.push(hunter);
  }

  return spawned;
}

function getNextWaveSeconds(portal) {
  return Math.max(MIN_WAVE_SECONDS, BASE_WAVE_SECONDS - portal.waveCount * 2.5);
}

function getDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
