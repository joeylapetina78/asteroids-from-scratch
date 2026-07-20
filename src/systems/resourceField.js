import { createValueNoise } from "./valueNoise.js";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260719-2120-67e79b8";
import { getRegionProfile } from "./worldRegions.js?v=fresh-20260719-2120-67e79b8";
import { RESOURCE_COLOR_RGB, pickFamilyMember } from "./resourceDefinitions.js?v=fresh-20260719-2120-67e79b8";

export function createResourceField(seed = 1337) {
  const noise = createValueNoise(seed);

  return {
    getProfile(x, y) {
      const zoneProfile = getZoneProfile(x, y);
      const regionProfile = getRegionProfile(x, y);
      const tags = [...new Set([...(regionProfile.tags ?? []), ...(zoneProfile.tags ?? [])])];
      const survival = getSurvivalResourceProfile(tags);
      const densityNoise = Math.pow(layeredNoise(noise, x + 1000, y - 1000, 1800, 0.18, 1), 1.15);
      const density = clamp(densityNoise * zoneProfile.asteroidDensityMultiplier, 0, 1.35);

      // One noise channel per family. Exponent controls rarity — higher = rarer.
      // Survival-role hierarchy: fuel (volatile) most abundant, charge
      // (structural + industrial combined) a step behind, scanergy (conductor)
      // scarce enough that each find is worth grabbing but never a soft-lock.
      const volatileRaw   = Math.max(survival.volatile.floor, Math.pow(layeredNoise(noise, x + 2400,   y - 8100,  3800, 0, 1), 1.35) * combineBias(zoneProfile.volatileBias, regionProfile.volatileBias) * survival.volatile.multiplier);
      const structuralRaw = Math.max(survival.structural.floor, Math.pow(layeredNoise(noise, x + 9000,   y + 1200,  2600, 0, 1), 1.9) * combineBias(zoneProfile.structuralBias, regionProfile.structuralBias) * survival.structural.multiplier);
      const industrialRaw = Math.max(survival.industrial.floor, Math.pow(layeredNoise(noise, x + 1500,   y + 3000,  1800, 0, 1), 1.75) * combineBias(zoneProfile.industrialBias, regionProfile.industrialBias) * survival.industrial.multiplier);
      const conductorRaw  = Math.max(survival.conductor.floor, Math.pow(layeredNoise(noise, x - 7000,   y + 5400,  3200, 0, 1), 2.05) * combineBias(zoneProfile.conductorBias, regionProfile.conductorBias) * survival.conductor.multiplier);
      const energyRaw     = Math.pow(layeredNoise(noise, x + 5000,   y - 12000, 4200, 0, 1), 3.5) * combineBias(zoneProfile.energyBias, regionProfile.energyBias);
      const advancedRaw   = Math.pow(layeredNoise(noise, x - 12000,  y - 6000,  4500, 0, 1), 2.8) * combineBias(zoneProfile.advancedBias, regionProfile.advancedBias);
      const strangeRaw    = Math.pow(layeredNoise(noise, x - 15000,  y + 8000,  5500, 0, 1), 4.5) * combineBias(zoneProfile.strangeBias, regionProfile.strangeBias);
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
        regionProfile,
        tags,
      };
    },
  };
}

function combineBias(zoneBias, regionBias) {
  return zoneBias * (0.65 + regionBias * 0.35);
}

export function getSurvivalResourceProfile(tags = []) {
  // Floors follow the survival-role hierarchy: volatile alone feeds fuel, but
  // structural AND industrial both feed charge, so their combined floor must
  // stay below the volatile floor for fuel to read as the most common find.
  const profile = {
    volatile: { floor: 0.15, multiplier: 1 },
    structural: { floor: 0.07, multiplier: 1 },
    industrial: { floor: 0.06, multiplier: 1 },
    conductor: { floor: 0.05, multiplier: 1 },
  };
  const tagSet = new Set(tags);

  applyScarcity(tagSet, ["fuel-desert", "fuel-lean", "no-fuel"], profile.volatile, 0.16, 0.012);
  applyScarcity(tagSet, ["charge-desert", "charge-lean", "no-charges"], profile.structural, 0.2, 0.02);
  applyScarcity(tagSet, ["charge-desert", "charge-lean", "no-charges"], profile.industrial, 0.2, 0.018);
  applyScarcity(tagSet, ["scanergy-desert", "scanergy-lean", "no-scanergy"], profile.conductor, 0.16, 0.005);

  applyAbundance(tagSet, ["fuel-rich", "volatile-rich"], profile.volatile, 1.65, 0.2);
  applyAbundance(tagSet, ["charge-rich", "industrial-rich"], profile.structural, 1.35, 0.15);
  applyAbundance(tagSet, ["charge-rich", "industrial-rich"], profile.industrial, 1.35, 0.14);
  applyAbundance(tagSet, ["scanergy-rich", "conductor-rich"], profile.conductor, 1.8, 0.07);

  return profile;
}

// These are the travel supplies, not a replacement for a region's dominant
// geology. Asteroid generation uses them to seed occasional small deposits
// into otherwise ordinary chunks, so a route can sustain a ship without every
// zone becoming visually or economically uniform.
export function getAmbientSurvivalResourceWeights(tags = []) {
  const weights = {
    "water-ice": 5,
    "methane-ice": 2,
    hydrogen: 1,
    "iron-nickel": 2,
    aluminum: 1.25,
    titanium: 0.5,
    silicate: 1.25,
    carbonaceous: 0.75,
    copper: 1.5,
    cobalt: 0.75,
    silver: 0.35,
  };
  const tagSet = new Set(tags);

  scaleAmbientResources(tagSet, ["fuel-rich", "volatile-rich"], weights, ["water-ice", "methane-ice", "hydrogen"], 2.6);
  scaleAmbientResources(tagSet, ["fuel-lean"], weights, ["water-ice", "methane-ice", "hydrogen"], 0.55);
  scaleAmbientResources(tagSet, ["fuel-desert", "no-fuel"], weights, ["water-ice", "methane-ice", "hydrogen"], 0.18);
  scaleAmbientResources(tagSet, ["charge-rich", "industrial-rich"], weights, ["iron-nickel", "aluminum", "titanium", "silicate", "carbonaceous"], 2.1);
  scaleAmbientResources(tagSet, ["charge-lean"], weights, ["iron-nickel", "aluminum", "titanium", "silicate", "carbonaceous"], 0.55);
  scaleAmbientResources(tagSet, ["charge-desert", "no-charges"], weights, ["iron-nickel", "aluminum", "titanium", "silicate", "carbonaceous"], 0.18);
  scaleAmbientResources(tagSet, ["scanergy-rich", "conductor-rich"], weights, ["copper", "cobalt", "silver"], 3.2);
  scaleAmbientResources(tagSet, ["scanergy-lean"], weights, ["copper", "cobalt", "silver"], 0.45);
  scaleAmbientResources(tagSet, ["scanergy-desert", "no-scanergy"], weights, ["copper", "cobalt", "silver"], 0.12);

  return weights;
}

function applyScarcity(tags, matchingTags, resource, multiplier, floor) {
  if (matchingTags.some((tag) => tags.has(tag))) {
    resource.multiplier *= multiplier;
    resource.floor = Math.min(resource.floor, floor);
  }
}

function applyAbundance(tags, matchingTags, resource, multiplier, floor) {
  if (matchingTags.some((tag) => tags.has(tag))) {
    resource.multiplier *= multiplier;
    resource.floor = Math.max(resource.floor, floor);
  }
}

function scaleAmbientResources(tags, matchingTags, weights, resourceIds, multiplier) {
  if (!matchingTags.some((tag) => tags.has(tag))) {
    return;
  }

  resourceIds.forEach((resourceId) => {
    weights[resourceId] *= multiplier;
  });
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

export function mixResourceColor(resources) {
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
