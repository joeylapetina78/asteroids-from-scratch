import { DriftMouth } from "../entities/DriftMouth.js?v=fresh-20260716-2155-47b6461";
import { createRandom, hashNumbers, randomRange } from "./random.js";
import { WORLD_ZONES } from "./worldZones.js?v=fresh-20260716-2155-47b6461";

const MAX_MOUTHS = 2;

export function createDriftMouthField() {
  const random = createRandom(44109);
  const zones = WORLD_ZONES
    .map((zone) => ({ zone, weight: getMouthZoneWeight(zone) }))
    .filter(({ weight }) => weight > 0.3)
    .sort((first, second) => second.weight - first.weight);
  const mouths = [];

  for (let index = 0; index < MAX_MOUTHS; index += 1) {
    const zone = pickWeightedZone(zones, random);

    if (!zone) {
      break;
    }

    const angle = random() * Math.PI * 2;
    const distance = randomRange(random, zone.radius * 0.15, zone.radius * 0.72);
    const x = zone.center.x + Math.cos(angle) * distance;
    const y = zone.center.y + Math.sin(angle) * distance;

    mouths.push(
      new DriftMouth({
        id: `drift-mouth-${index + 1}`,
        x,
        y,
        seed: hashNumbers(x, y, 4400 + index),
      }),
    );
  }

  return mouths;
}

function getMouthZoneWeight(zone) {
  const strangeWeight = zone.profile.strangeBias ?? 0;
  const dangerWeight = zone.profile.danger ?? 0;
  const anomalyBonus = zone.tags.includes("anomaly") || zone.tags.includes("strange") ? 1.8 : 1;
  const starterPenalty = zone.tags.includes("starter") || zone.tags.includes("safe") ? 0 : 1;

  return starterPenalty * anomalyBonus * (strangeWeight * 0.9 + dangerWeight * 1.1);
}

function pickWeightedZone(zones, random) {
  const totalWeight = zones.reduce((sum, candidate) => sum + candidate.weight, 0);

  if (totalWeight <= 0) {
    return null;
  }

  let roll = random() * totalWeight;

  for (const candidate of zones) {
    roll -= candidate.weight;

    if (roll <= 0) {
      return candidate.zone;
    }
  }

  return zones[zones.length - 1]?.zone ?? null;
}
