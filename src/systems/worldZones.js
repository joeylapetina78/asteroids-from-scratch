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
    asteroidDensityMultiplier: 1.0,
    commonRockBias: 1.1,
    volatileBias:   1.0,
    structuralBias: 0.8,
    industrialBias: 1.0,
    conductorBias:  1.0,
    energyBias:     0.05,
    advancedBias:   0.15,
    strangeBias:    0.2,
    scrapBias:      0.15,
    hunterBias:     0.3,
    ambientLifeBias: 0.6,
    danger: 0.18,
  },
};

export const WORLD_ZONES = [
  // ── STARTER CLUSTER — tight pack near origin, multiple zones visible at once ──
  {
    id: "starter-drift",
    name: "First Reach",
    color: [0, 220, 255],
    center: { x: 0, y: 0 },
    radius: 900,
    falloff: 800,
    tags: ["starter", "safe", "ambient-life", "stony", "open-drift"],
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
    color: [255, 20, 80],
    center: { x: 2000, y: -1000 },
    radius: 1000,
    falloff: 900,
    tags: ["structural", "dense-rocks", "hunters", "metallic", "maze-corridor"],
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
    color: [0, 255, 180],
    center: { x: -1400, y: -2000 },
    radius: 800,
    falloff: 700,
    tags: ["conductor", "teal-rocks", "medium-density", "cluster-pocket"],
    conductorMember: "copper",
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
    color: [40, 120, 255],
    center: { x: -2200, y: 900 },
    radius: 800,
    falloff: 700,
    tags: ["volatile", "blue-rocks", "ambient-life", "open-drift"],
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
    color: [255, 160, 0],
    center: { x: -3800, y: 1800 },
    radius: 1200,
    falloff: 1000,
    tags: ["scrap", "common-rocks", "ambient-life", "debris-stream"],
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

  // ── NEAR-FIELD CONNECTORS ─────────────────────────────────────────────────────
  {
    id: "shatter-belt",
    name: "Shatter Belt",
    color: [255, 70, 30],
    center: { x: 4200, y: -2500 },
    radius: 900,
    falloff: 800,
    tags: ["structural", "dense-rocks", "stone-wall", "maze-corridor"],
    profile: {
      asteroidDensityMultiplier: 1.55,
      commonRockBias:  0.85,
      volatileBias:    0.2,
      structuralBias:  2.5,
      industrialBias:  0.6,
      conductorBias:   0.6,
      energyBias:      0.1,
      advancedBias:    0.15,
      strangeBias:     0.05,
      scrapBias:       0.2,
      hunterBias:      1.0,
      ambientLifeBias: 0.5,
      danger: 0.45,
    },
  },
  {
    id: "drift-channel",
    name: "Drift Channel",
    color: [0, 200, 255],
    center: { x: -5500, y: -3500 },
    radius: 1000,
    falloff: 900,
    tags: ["volatile", "ambient-life", "open-drift", "debris-stream"],
    profile: {
      asteroidDensityMultiplier: 0.95,
      commonRockBias:  1.2,
      volatileBias:    2.5,
      structuralBias:  0.3,
      industrialBias:  0.7,
      conductorBias:   0.5,
      energyBias:      0.05,
      advancedBias:    0.1,
      strangeBias:     0.15,
      scrapBias:       0.15,
      hunterBias:      0.4,
      ambientLifeBias: 1.3,
      danger: 0.18,
    },
  },
  {
    id: "rust-bank",
    name: "Rust Bank",
    color: [255, 100, 20],
    center: { x: 3200, y: 3500 },
    radius: 900,
    falloff: 800,
    tags: ["scrap", "industrial", "cluster-pocket", "debris-stream"],
    profile: {
      asteroidDensityMultiplier: 1.2,
      commonRockBias:  1.3,
      volatileBias:    0.4,
      structuralBias:  1.2,
      industrialBias:  2.0,
      conductorBias:   0.8,
      energyBias:      0.05,
      advancedBias:    0.1,
      strangeBias:     0.05,
      scrapBias:       2.0,
      hunterBias:      0.5,
      ambientLifeBias: 0.6,
      danger: 0.28,
    },
  },
  {
    id: "iron-scatter",
    name: "Iron Scatter",
    color: [255, 30, 60],
    center: { x: 6000, y: 1200 },
    radius: 700,
    falloff: 600,
    tags: ["metallic", "industrial", "cluster-pocket"],
    profile: {
      asteroidDensityMultiplier: 1.3,
      commonRockBias:  0.75,
      volatileBias:    0.2,
      structuralBias:  2.2,
      industrialBias:  1.5,
      conductorBias:   0.9,
      energyBias:      0.1,
      advancedBias:    0.2,
      strangeBias:     0.05,
      scrapBias:       0.4,
      hunterBias:      0.8,
      ambientLifeBias: 0.5,
      danger: 0.38,
    },
  },
  {
    id: "pale-run",
    name: "Pale Run",
    color: [160, 80, 255],
    center: { x: -7000, y: -1500 },
    radius: 900,
    falloff: 800,
    tags: ["ambient-life", "open-drift", "sparse"],
    profile: {
      asteroidDensityMultiplier: 0.7,
      commonRockBias:  1.0,
      volatileBias:    1.2,
      structuralBias:  0.3,
      industrialBias:  0.6,
      conductorBias:   0.5,
      energyBias:      0.05,
      advancedBias:    0.1,
      strangeBias:     0.3,
      scrapBias:       0.1,
      hunterBias:      0.3,
      ambientLifeBias: 1.5,
      danger: 0.12,
    },
  },
  {
    id: "grit-shelf",
    name: "Grit Shelf",
    color: [180, 255, 0],
    center: { x: 1000, y: 5500 },
    radius: 800,
    falloff: 700,
    tags: ["stony", "cluster-pocket", "debris-stream"],
    profile: {
      asteroidDensityMultiplier: 1.25,
      commonRockBias:  1.4,
      volatileBias:    0.5,
      structuralBias:  1.0,
      industrialBias:  1.2,
      conductorBias:   0.7,
      energyBias:      0.0,
      advancedBias:    0.1,
      strangeBias:     0.1,
      scrapBias:       0.6,
      hunterBias:      0.4,
      ambientLifeBias: 0.8,
      danger: 0.22,
    },
  },

  // ── MID-RANGE ────────────────────────────────────────────────────────────────
  {
    id: "blue-glint",
    name: "Blue Glint",
    color: [120, 0, 255],
    center: { x: -9000, y: -12000 },
    radius: 2000,
    falloff: 1800,
    tags: ["strange", "rare-pocket", "scanner-interest", "cluster-pocket"],
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
    color: [255, 50, 180],
    center: { x: 10000, y: -4500 },
    radius: 2500,
    falloff: 2000,
    tags: ["structural", "metallic", "dense-rocks", "industrial", "stone-wall"],
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
    color: [10, 5, 40],
    center: { x: 12000, y: 25000 },
    radius: 3000,
    falloff: 4000,
    tags: ["sparse", "low-resource", "low-life", "navigation-hazard", "sparse-dead"],
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
    color: [255, 20, 50],
    center: { x: 22000, y: -12000 },
    radius: 6000,
    falloff: 4500,
    tags: ["metallic", "dense-rocks", "industrial", "corporate-claims", "maze-corridor", "stone-wall"],
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
    color: [0, 255, 90],
    center: { x: -30000, y: -20000 },
    radius: 8000,
    falloff: 6000,
    tags: ["carbonaceous", "ancient", "ambient-life", "volatile-rich", "strange-life", "giant-garden"],
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
    color: [0, 160, 255],
    center: { x: 42000, y: 28000 },
    radius: 9000,
    falloff: 7000,
    tags: ["volatile", "water-ice", "cold", "sparse", "strategic", "open-drift", "sparse-dead"],
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
    color: [255, 0, 255],
    center: { x: -44000, y: 32000 },
    radius: 4000,
    falloff: 5000,
    tags: ["anomaly", "strange", "story", "dangerous", "cluster-pocket", "maze-corridor"],
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
    zoneColor: strongest.zone.color ?? null,
    conductorMember: strongest.zone.conductorMember ?? null,
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
