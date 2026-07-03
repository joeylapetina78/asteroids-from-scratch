const PROFILE_FIELDS = [
  "asteroidDensityMultiplier",
  "commonRockBias",
  // One bias per resource family. Controls how strong that family's noise
  // channel is in this region — higher = more likely to dominate.
  "volatileBias",
  "structuralBias",
  "industrialBias",
  "conductorBias",
  "energyBias",
  "advancedBias",
  "strangeBias",
  // Non-resource zone properties
  "scrapBias",
  "hunterBias",
  "ambientLifeBias",
  "danger",
];

const DEFAULT_PROFILE = {
  id: "open-space",
  name: "Open Space",
  tags: ["open-space"],
  profile: {
    asteroidDensityMultiplier: 0.75,
    commonRockBias: 1.0,
    volatileBias:   1.0,
    structuralBias: 0.7,
    industrialBias: 1.0,
    conductorBias:  1.0,
    energyBias:     0.05,
    advancedBias:   0.15,
    strangeBias:    0.2,
    scrapBias:      0.1,
    hunterBias:     0.25,
    ambientLifeBias: 0.5,
    danger: 0.15,
  },
};

export const WORLD_ZONES = [
  // ── STARTER CLUSTER ─────────────────────────────────────────────────────────
  {
    id: "starter-drift",
    name: "First Reach",
    center: { x: 0, y: 0 },
    radius: 2500,
    falloff: 2000,
    tags: ["starter", "safe", "ambient-life", "stony"],
    profile: {
      asteroidDensityMultiplier: 0.85,
      commonRockBias:  1.35,
      volatileBias:    0.8,
      structuralBias:  0.6,
      industrialBias:  1.3,
      conductorBias:   0.8,
      energyBias:      0.0,
      advancedBias:    0.05,
      strangeBias:     0.05,
      scrapBias:       0.05,
      hunterBias:      0,
      ambientLifeBias: 1.25,
      danger: 0.04,
    },
  },
  {
    id: "red-teeth",
    name: "Red Teeth",
    center: { x: 4500, y: -2500 },
    radius: 2500,
    falloff: 2000,
    tags: ["structural", "dense-rocks", "hunters", "metallic"],
    profile: {
      asteroidDensityMultiplier: 1.45,
      commonRockBias:  0.8,
      volatileBias:    0.2,
      structuralBias:  3.0,
      industrialBias:  0.5,
      conductorBias:   0.4,
      energyBias:      0.1,
      advancedBias:    0.2,
      strangeBias:     0.1,
      scrapBias:       0.15,
      hunterBias:      1.4,
      ambientLifeBias: 0.7,
      danger: 0.55,
    },
  },
  {
    id: "copper-drift",
    name: "Copper Drift",
    center: { x: -3000, y: -4000 },
    radius: 2000,
    falloff: 1500,
    tags: ["conductor", "teal-rocks", "medium-density"],
    profile: {
      asteroidDensityMultiplier: 1.1,
      commonRockBias:  0.9,
      volatileBias:    0.3,
      structuralBias:  0.3,
      industrialBias:  0.6,
      conductorBias:   4.0,
      energyBias:      0.05,
      advancedBias:    0.3,
      strangeBias:     0.1,
      scrapBias:       0.1,
      hunterBias:      0.6,
      ambientLifeBias: 0.9,
      danger: 0.3,
    },
  },
  {
    id: "ice-field",
    name: "Ice Field",
    center: { x: -4500, y: 2000 },
    radius: 1800,
    falloff: 1500,
    tags: ["volatile", "blue-rocks", "ambient-life"],
    profile: {
      asteroidDensityMultiplier: 0.9,
      commonRockBias:  1.1,
      volatileBias:    4.5,
      structuralBias:  0.2,
      industrialBias:  0.8,
      conductorBias:   0.3,
      energyBias:      0.0,
      advancedBias:    0.2,
      strangeBias:     0.2,
      scrapBias:       0.05,
      hunterBias:      0.3,
      ambientLifeBias: 1.4,
      danger: 0.12,
    },
  },
  {
    id: "scrap-wake",
    name: "Scrap Wake",
    center: { x: -7000, y: 3500 },
    radius: 3500,
    falloff: 2500,
    tags: ["scrap", "common-rocks", "ambient-life"],
    profile: {
      asteroidDensityMultiplier: 1.05,
      commonRockBias:  1.5,
      volatileBias:    0.8,
      structuralBias:  0.5,
      industrialBias:  1.4,
      conductorBias:   1.2,
      energyBias:      0.0,
      advancedBias:    0.1,
      strangeBias:     0.15,
      scrapBias:       1.8,
      hunterBias:      0.35,
      ambientLifeBias: 1.4,
      danger: 0.2,
    },
  },

  // ── MID-RANGE ────────────────────────────────────────────────────────────────
  {
    id: "blue-glint",
    name: "Blue Glint",
    center: { x: -14000, y: -20000 },
    radius: 4000,
    falloff: 4000,
    tags: ["strange", "rare-pocket", "scanner-interest"],
    profile: {
      asteroidDensityMultiplier: 0.75,
      commonRockBias:  0.6,
      volatileBias:    0.6,
      structuralBias:  0.35,
      industrialBias:  0.4,
      conductorBias:   0.5,
      energyBias:      0.15,
      advancedBias:    0.5,
      strangeBias:     3.8,
      scrapBias:       0.1,
      hunterBias:      1.2,
      ambientLifeBias: 0.7,
      danger: 0.7,
    },
  },
  {
    id: "ore-ridge",
    name: "Ore Ridge",
    center: { x: 16000, y: -9000 },
    radius: 5000,
    falloff: 4000,
    tags: ["structural", "metallic", "dense-rocks", "industrial"],
    profile: {
      asteroidDensityMultiplier: 1.5,
      commonRockBias:  0.7,
      volatileBias:    0.2,
      structuralBias:  2.8,
      industrialBias:  0.5,
      conductorBias:   1.4,
      energyBias:      0.3,
      advancedBias:    0.4,
      strangeBias:     0.1,
      scrapBias:       0.2,
      hunterBias:      1.5,
      ambientLifeBias: 0.6,
      danger: 0.6,
    },
  },
  {
    id: "dead-strip",
    name: "Dead Strip",
    center: { x: 20000, y: 55000 },
    radius: 6000,
    falloff: 8000,
    tags: ["sparse", "low-resource", "low-life", "navigation-hazard"],
    profile: {
      asteroidDensityMultiplier: 0.3,
      commonRockBias:  0.5,
      volatileBias:    0.5,
      structuralBias:  0.15,
      industrialBias:  0.3,
      conductorBias:   0.4,
      energyBias:      0.0,
      advancedBias:    0.05,
      strangeBias:     0.05,
      scrapBias:       0.2,
      hunterBias:      0.1,
      ambientLifeBias: 0.2,
      danger: 0.3,
    },
  },

  // ── OUTER ZONES ──────────────────────────────────────────────────────────────
  {
    id: "old-iron-run",
    name: "Old Iron Run",
    center: { x: 38000, y: -22000 },
    radius: 12000,
    falloff: 8000,
    tags: ["metallic", "dense-rocks", "industrial", "corporate-claims"],
    profile: {
      asteroidDensityMultiplier: 1.7,
      commonRockBias:  0.65,
      volatileBias:    0.15,
      structuralBias:  3.5,
      industrialBias:  0.4,
      conductorBias:   2.0,
      energyBias:      0.5,
      advancedBias:    0.6,
      strangeBias:     0.1,
      scrapBias:       0.3,
      hunterBias:      1.7,
      ambientLifeBias: 0.45,
      danger: 0.72,
    },
  },
  {
    id: "carbonaceous-veil",
    name: "Carbonaceous Veil",
    center: { x: -48000, y: -35000 },
    radius: 16000,
    falloff: 12000,
    tags: ["carbonaceous", "ancient", "ambient-life", "volatile-rich", "strange-life"],
    profile: {
      asteroidDensityMultiplier: 1.1,
      commonRockBias:  1.7,
      volatileBias:    2.2,
      structuralBias:  0.35,
      industrialBias:  2.0,
      conductorBias:   1.6,
      energyBias:      0.1,
      advancedBias:    0.3,
      strangeBias:     0.4,
      scrapBias:       0.3,
      hunterBias:      0.55,
      ambientLifeBias: 2.0,
      danger: 0.32,
    },
  },
  {
    id: "volatile-pockets",
    name: "Volatile Pockets",
    center: { x: 68000, y: 48000 },
    radius: 18000,
    falloff: 13000,
    tags: ["volatile", "water-ice", "cold", "sparse", "strategic"],
    profile: {
      asteroidDensityMultiplier: 0.55,
      commonRockBias:  0.75,
      volatileBias:    5.0,
      structuralBias:  0.2,
      industrialBias:  0.5,
      conductorBias:   0.5,
      energyBias:      0.0,
      advancedBias:    0.3,
      strangeBias:     0.5,
      scrapBias:       0.05,
      hunterBias:      0.45,
      ambientLifeBias: 0.85,
      danger: 0.22,
    },
  },
  {
    id: "anomaly-cluster",
    name: "The Anomaly",
    center: { x: -70000, y: 55000 },
    radius: 7000,
    falloff: 10000,
    tags: ["anomaly", "strange", "story", "dangerous"],
    profile: {
      asteroidDensityMultiplier: 0.9,
      commonRockBias:  0.45,
      volatileBias:    0.8,
      structuralBias:  0.25,
      industrialBias:  0.3,
      conductorBias:   0.6,
      energyBias:      0.5,
      advancedBias:    0.5,
      strangeBias:     5.0,
      scrapBias:       0.05,
      hunterBias:      1.9,
      ambientLifeBias: 1.1,
      danger: 0.9,
    },
  },
];

export function getZoneProfile(x, y) {
  const zoneInfluences = WORLD_ZONES.map((zone) => ({
    zone,
    influence: getZoneInfluence(zone, x, y),
  })).filter(({ influence }) => influence > 0);

  const strongest = zoneInfluences.reduce(
    (best, current) => (current.influence > best.influence ? current : best),
    { zone: DEFAULT_PROFILE, influence: 0 },
  );
  const zoneWeight = zoneInfluences.reduce((sum, { influence }) => sum + influence, 0);
  const defaultWeight = Math.max(0, 1 - Math.min(1, zoneWeight));
  const totalWeight = zoneWeight + defaultWeight || 1;
  const profile = {};

  PROFILE_FIELDS.forEach((field) => {
    const weightedZoneValue = zoneInfluences.reduce(
      (sum, { zone, influence }) => sum + zone.profile[field] * influence,
      DEFAULT_PROFILE.profile[field] * defaultWeight,
    );

    profile[field] = weightedZoneValue / totalWeight;
  });

  return {
    strongestZoneId: strongest.zone.id,
    strongestZoneName: strongest.zone.name,
    influence: strongest.influence,
    ...profile,
    tags: getBlendedTags(zoneInfluences, strongest),
  };
}

export function getZoneInfluence(zone, x, y) {
  const distance = Math.hypot(x - zone.center.x, y - zone.center.y);

  if (distance <= zone.radius) {
    return 1;
  }

  if (distance >= zone.radius + zone.falloff) {
    return 0;
  }

  const falloffProgress = (distance - zone.radius) / zone.falloff;
  return smoothStep(1 - falloffProgress);
}

function smoothStep(value) {
  const clamped = Math.max(0, Math.min(1, value));

  return clamped * clamped * (3 - 2 * clamped);
}

function getBlendedTags(zoneInfluences, strongest) {
  if (zoneInfluences.length === 0) {
    return [...DEFAULT_PROFILE.tags];
  }

  const tags = new Set(strongest.zone.tags);

  zoneInfluences.forEach(({ zone, influence }) => {
    if (influence >= 0.25) {
      zone.tags.forEach((tag) => tags.add(tag));
    }
  });

  return [...tags];
}
