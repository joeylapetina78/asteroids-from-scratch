import { createValueNoise } from "./valueNoise.js";
import { getZoneProfile } from "./worldZones.js?v=expanded-world-v1";

// The resource field is the invisible geology layer. It combines deterministic
// noise with the zone profile at a coordinate, then asteroidField turns those
// profiles into actual rocks.
const RESOURCE_COLORS = {
  stone: [170, 185, 210],
  iron: [255, 116, 82],
  copper: [73, 225, 184],
  ice: [115, 210, 255],
  crystal: [222, 111, 255],
};

export function createResourceField(seed = 1337) {
  const noise = createValueNoise(seed);

  return {
    getProfile(x, y) {
      const zoneProfile = getZoneProfile(x, y);
      // Zones multiply/bias the old noise system; they do not replace it. That
      // is why zones have personality while still producing lumpy natural fields.
      const densityNoise = Math.pow(layeredNoise(noise, x + 1000, y - 1000, 1800, 0.18, 1), 1.15);
      const density = clamp(densityNoise * zoneProfile.asteroidDensityMultiplier, 0, 1.35);
      const iron = Math.pow(layeredNoise(noise, x + 9000, y + 1200, 2600, 0, 1), 1.6) * 1.5 * zoneProfile.redOreBias;
      const copper = Math.pow(layeredNoise(noise, x - 7000, y + 5400, 3200, 0, 1), 2.1) * 1.35 * zoneProfile.copperBias;
      const ice = Math.pow(layeredNoise(noise, x + 2400, y - 8100, 3800, 0, 1), 1.8) * 1.35 * zoneProfile.iceBias;
      const crystal = Math.pow(layeredNoise(noise, x - 12000, y - 6000, 5200, 0, 1), 3.0) * 2.8 * zoneProfile.blueOreBias;
      const stone = (0.9 + layeredNoise(noise, x, y, 1400, 0, 0.25)) * zoneProfile.commonRockBias;
      const resources = normalizeResources({ stone, iron, copper, ice, crystal });

      return {
        density,
        resources,
        color: mixResourceColor(resources),
        richness: Math.max(iron, copper, ice, crystal),
        commonRockBias: zoneProfile.commonRockBias,
        // TODO: Use scrapBias when white/common rocks can drop trace salvage.
        scrapBias: zoneProfile.scrapBias,
        zoneProfile,
      };
    },
  };
}

function layeredNoise(noise, x, y, scale, min, max) {
  const value =
    noise(x, y, scale) * 0.6 +
    noise(x + 300, y - 900, scale * 0.5) * 0.3 +
    noise(x - 1200, y + 500, scale * 0.25) * 0.1;

  return min + value * (max - min);
}

function normalizeResources(resources) {
  const total = Object.values(resources).reduce((sum, value) => sum + value, 0);

  return Object.fromEntries(
    Object.entries(resources).map(([resource, value]) => [resource, value / total]),
  );
}

function mixResourceColor(resources) {
  const mixed = [0, 0, 0];
  const sharpened = sharpenResources(resources);
  const dominant = getDominantNonStoneResource(resources);

  Object.entries(sharpened).forEach(([resource, amount]) => {
    const color = RESOURCE_COLORS[resource];
    mixed[0] += color[0] * amount;
    mixed[1] += color[1] * amount;
    mixed[2] += color[2] * amount;
  });

  if (dominant.amount > 0.16) {
    const dominantColor = RESOURCE_COLORS[dominant.resource];
    mixed[0] = mixed[0] * 0.65 + dominantColor[0] * 0.35;
    mixed[1] = mixed[1] * 0.65 + dominantColor[1] * 0.35;
    mixed[2] = mixed[2] * 0.65 + dominantColor[2] * 0.35;
  }

  return `rgb(${Math.round(mixed[0])}, ${Math.round(mixed[1])}, ${Math.round(mixed[2])})`;
}

function sharpenResources(resources) {
  const sharpened = Object.fromEntries(
    Object.entries(resources).map(([resource, value]) => [resource, Math.pow(value, 1.8)]),
  );

  return normalizeResources(sharpened);
}

function getDominantNonStoneResource(resources) {
  return Object.entries(resources).filter(([resource]) => resource !== "stone").reduce(
    (best, [resource, amount]) => (amount > best.amount ? { resource, amount } : best),
    { resource: "iron", amount: 0 },
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
