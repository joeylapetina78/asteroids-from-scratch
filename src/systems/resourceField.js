import { createValueNoise } from "./valueNoise.js";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260717-2003-fcd6b0d";
import { RESOURCE_COLOR_RGB, pickFamilyMember } from "./resourceDefinitions.js?v=fresh-20260717-2003-fcd6b0d";

export function createResourceField(seed = 1337) {
  const noise = createValueNoise(seed);

  return {
    getProfile(x, y) {
      const zoneProfile = getZoneProfile(x, y);
      const densityNoise = Math.pow(layeredNoise(noise, x + 1000, y - 1000, 1800, 0.18, 1), 1.15);
      const density = clamp(densityNoise * zoneProfile.asteroidDensityMultiplier, 0, 1.35);

      // One noise channel per family. Exponent controls rarity — higher = rarer.
      const volatileRaw   = Math.pow(layeredNoise(noise, x + 2400,   y - 8100,  3800, 0, 1), 1.8) * zoneProfile.volatileBias;
      const structuralRaw = Math.pow(layeredNoise(noise, x + 9000,   y + 1200,  2600, 0, 1), 1.6) * zoneProfile.structuralBias;
      const industrialRaw = Math.pow(layeredNoise(noise, x + 1500,   y + 3000,  1800, 0, 1), 1.2) * zoneProfile.industrialBias;
      const conductorRaw  = Math.pow(layeredNoise(noise, x - 7000,   y + 5400,  3200, 0, 1), 2.1) * zoneProfile.conductorBias;
      const energyRaw     = Math.pow(layeredNoise(noise, x + 5000,   y - 12000, 4200, 0, 1), 3.5) * zoneProfile.energyBias;
      const advancedRaw   = Math.pow(layeredNoise(noise, x - 12000,  y - 6000,  4500, 0, 1), 2.8) * zoneProfile.advancedBias;
      const strangeRaw    = Math.pow(layeredNoise(noise, x - 15000,  y + 8000,  5500, 0, 1), 4.5) * zoneProfile.strangeBias;
      const stoneRaw      = (0.9 + layeredNoise(noise, x, y, 1400, 0, 0.25)) * zoneProfile.commonRockBias;

      // Pick the specific member for each family using independent selector noise.
      const volatile   = pickFamilyMember("volatile",   noise(x + 33100, y - 27000, 900));
      const structural = pickFamilyMember("structural",  noise(x - 28000, y + 41000, 900));
      const industrial = pickFamilyMember("industrial",  noise(x + 17500, y + 23000, 700));
      const conductor  = zoneProfile.conductorMember ?? pickFamilyMember("conductor",   noise(x - 44000, y - 18000, 850));
      const energy     = pickFamilyMember("energy",      noise(x + 52000, y - 31000, 600));
      const advanced   = pickFamilyMember("advanced",    noise(x - 61000, y + 14000, 750));
      const strange    = pickFamilyMember("strange",     noise(x + 38000, y + 67000, 500));

      const resources = normalizeResources({
        stone:      stoneRaw,
        [volatile]:   volatileRaw,
        [structural]: structuralRaw,
        [industrial]: industrialRaw,
        [conductor]:  conductorRaw,
        [energy]:     energyRaw,
        [advanced]:   advancedRaw,
        [strange]:    strangeRaw,
      });

      const richness = Math.max(volatileRaw, structuralRaw, conductorRaw, energyRaw, advancedRaw, strangeRaw);

      return {
        density,
        resources,
        color: mixResourceColor(resources),
        richness,
        commonRockBias: zoneProfile.commonRockBias,
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
    const rgb = RESOURCE_COLOR_RGB[resource];

    if (rgb) {
      mixed[0] += rgb[0] * amount;
      mixed[1] += rgb[1] * amount;
      mixed[2] += rgb[2] * amount;
    }
  });

  if (dominant.amount > 0.16) {
    const dominantRgb = RESOURCE_COLOR_RGB[dominant.resource];

    if (dominantRgb) {
      mixed[0] = mixed[0] * 0.65 + dominantRgb[0] * 0.35;
      mixed[1] = mixed[1] * 0.65 + dominantRgb[1] * 0.35;
      mixed[2] = mixed[2] * 0.65 + dominantRgb[2] * 0.35;
    }
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
    { resource: "iron-nickel", amount: 0 },
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
