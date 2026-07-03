const PROFILE_FIELDS = [
  "asteroidDensityMultiplier",
  "commonRockBias",
  "redOreBias",
  "blueOreBias",
  "scrapBias",
  "hunterBias",
  "ambientLifeBias",
  "danger",
];

// Zones are authored regions of influence, not rooms or grid cells. The rest of
// the world systems ask for a blended profile at a coordinate and use it as a
// bias layer over their existing noise/randomness.
const DEFAULT_PROFILE = {
  id: "open-space",
  name: "Open Space",
  tags: ["open-space"],
  profile: {
    asteroidDensityMultiplier: 0.75,
    commonRockBias: 1,
    redOreBias: 0.7,
    blueOreBias: 0.2,
    scrapBias: 0.1,
    hunterBias: 0.25,
    ambientLifeBias: 0.5,
    danger: 0.15,
  },
};

export const WORLD_ZONES = [
  // ── STARTER CLUSTER ─────────────────────────────────────────────────────────
  // Accessible in the starter ship. Safe enough to learn without being trivial.
  {
    id: "starter-drift",
    name: "First Reach",
    center: { x: 0, y: 0 },
    radius: 5000,
    falloff: 4000,
    tags: ["starter", "safe", "ambient-life", "stony"],
    profile: {
      asteroidDensityMultiplier: 0.85,
      commonRockBias: 1.35,
      redOreBias: 0.75,
      blueOreBias: 0.25,
      scrapBias: 0.05,
      hunterBias: 0,
      ambientLifeBias: 1.25,
      danger: 0.04,
    },
  },
  {
    id: "scrap-wake",
    name: "Scrap Wake",
    center: { x: -8000, y: 5500 },
    radius: 5500,
    falloff: 4000,
    tags: ["scrap", "common-rocks", "ambient-life"],
    profile: {
      asteroidDensityMultiplier: 1.05,
      commonRockBias: 1.4,
      redOreBias: 0.7,
      blueOreBias: 0.35,
      scrapBias: 1.8,
      hunterBias: 0.35,
      ambientLifeBias: 1.4,
      danger: 0.25,
    },
  },
  {
    id: "red-teeth",
    name: "Red Teeth",
    center: { x: 14000, y: -7000 },
    radius: 5500,
    falloff: 4500,
    tags: ["red-ore", "dense-rocks", "hunters", "metallic"],
    profile: {
      asteroidDensityMultiplier: 1.45,
      commonRockBias: 0.85,
      redOreBias: 2.3,
      blueOreBias: 0.25,
      scrapBias: 0.15,
      hunterBias: 1.4,
      ambientLifeBias: 0.85,
      danger: 0.55,
    },
  },

  // ── MID-RANGE ────────────────────────────────────────────────────────────────
  // Reachable with some fuel investment. Better returns. More risk.
  {
    id: "blue-glint",
    name: "Blue Glint",
    center: { x: -18000, y: -30000 },
    radius: 5000,
    falloff: 6000,
    tags: ["blue-ore", "rare-pocket", "scanner-interest"],
    profile: {
      asteroidDensityMultiplier: 0.75,
      commonRockBias: 0.65,
      redOreBias: 0.45,
      blueOreBias: 3.4,
      scrapBias: 0.1,
      hunterBias: 1.2,
      ambientLifeBias: 0.7,
      danger: 0.7,
    },
  },
  {
    id: "dead-strip",
    name: "Dead Strip",
    center: { x: 25000, y: 65000 },
    radius: 8000,
    falloff: 12000,
    tags: ["sparse", "low-resource", "low-life", "navigation-hazard"],
    profile: {
      asteroidDensityMultiplier: 0.35,
      commonRockBias: 0.55,
      redOreBias: 0.2,
      blueOreBias: 0.1,
      scrapBias: 0.2,
      hunterBias: 0.15,
      ambientLifeBias: 0.25,
      danger: 0.35,
    },
  },

  // ── OUTER ZONES ──────────────────────────────────────────────────────────────
  // These require a faster ship or significant fuel planning to reach.
  // The world exists here — chunks generate — but the player earns access.
  {
    id: "old-iron-run",
    name: "Old Iron Run",
    center: { x: 45000, y: -25000 },
    radius: 14000,
    falloff: 10000,
    tags: ["metallic", "dense-rocks", "industrial", "corporate-claims"],
    profile: {
      asteroidDensityMultiplier: 1.6,
      commonRockBias: 0.7,
      redOreBias: 3.2,
      blueOreBias: 0.15,
      scrapBias: 0.25,
      hunterBias: 1.6,
      ambientLifeBias: 0.5,
      danger: 0.7,
    },
  },
  {
    id: "carbonaceous-veil",
    name: "Carbonaceous Veil",
    center: { x: -55000, y: -40000 },
    radius: 18000,
    falloff: 12000,
    tags: ["carbonaceous", "ancient", "ambient-life", "volatile-rich", "strange-life"],
    profile: {
      asteroidDensityMultiplier: 1.1,
      commonRockBias: 1.6,
      redOreBias: 0.4,
      blueOreBias: 0.6,
      scrapBias: 0.3,
      hunterBias: 0.6,
      ambientLifeBias: 1.8,
      danger: 0.35,
    },
  },
  {
    id: "volatile-pockets",
    name: "Volatile Pockets",
    center: { x: 80000, y: 55000 },
    radius: 20000,
    falloff: 15000,
    tags: ["volatile", "water-ice", "cold", "sparse", "strategic"],
    profile: {
      asteroidDensityMultiplier: 0.6,
      commonRockBias: 0.8,
      redOreBias: 0.25,
      blueOreBias: 1.8,
      scrapBias: 0.05,
      hunterBias: 0.5,
      ambientLifeBias: 0.8,
      danger: 0.25,
    },
  },
  {
    id: "anomaly-cluster",
    name: "The Anomaly",
    center: { x: -80000, y: 60000 },
    radius: 8000,
    falloff: 10000,
    tags: ["anomaly", "strange", "crystal-rich", "story", "dangerous"],
    profile: {
      asteroidDensityMultiplier: 0.9,
      commonRockBias: 0.5,
      redOreBias: 0.3,
      blueOreBias: 4.5,
      scrapBias: 0.05,
      hunterBias: 1.8,
      ambientLifeBias: 1.0,
      danger: 0.9,
    },
  },
];

export function getZoneProfile(x, y) {
  // Each nearby zone contributes smoothly. If no zone is nearby, open-space
  // defaults fill the profile so callers never need a special "no zone" branch.
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
