const PROFILE_FIELDS = [
  "asteroidDensityMultiplier",
  "commonRockBias",
  "redOreBias",
  "blueOreBias",
  "copperBias",
  "iceBias",
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
    copperBias: 1.0,
    iceBias: 1.0,
    scrapBias: 0.1,
    hunterBias: 0.25,
    ambientLifeBias: 0.5,
    danger: 0.15,
  },
};

export const WORLD_ZONES = [
  // ── STARTER CLUSTER ─────────────────────────────────────────────────────────
  // All within ~10,000 units of the start. Dense and varied so every direction
  // looks different within the first minute of flying.
  {
    id: "starter-drift",
    name: "First Reach",
    center: { x: 0, y: 0 },
    radius: 2500,
    falloff: 2000,
    tags: ["starter", "safe", "ambient-life", "stony"],
    profile: {
      asteroidDensityMultiplier: 0.85,
      commonRockBias: 1.35,
      redOreBias: 0.6,
      blueOreBias: 0.2,
      copperBias: 0.8,
      iceBias: 0.8,
      scrapBias: 0.05,
      hunterBias: 0,
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
    tags: ["red-ore", "dense-rocks", "hunters", "metallic"],
    profile: {
      asteroidDensityMultiplier: 1.45,
      commonRockBias: 0.8,
      redOreBias: 3.0,
      blueOreBias: 0.15,
      copperBias: 0.4,
      iceBias: 0.2,
      scrapBias: 0.15,
      hunterBias: 1.4,
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
    tags: ["copper-ore", "teal-rocks", "medium-density"],
    profile: {
      asteroidDensityMultiplier: 1.1,
      commonRockBias: 0.9,
      redOreBias: 0.3,
      blueOreBias: 0.15,
      copperBias: 4.0,
      iceBias: 0.3,
      scrapBias: 0.1,
      hunterBias: 0.6,
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
    tags: ["ice", "volatile", "blue-rocks", "ambient-life"],
    profile: {
      asteroidDensityMultiplier: 0.9,
      commonRockBias: 1.1,
      redOreBias: 0.2,
      blueOreBias: 0.4,
      copperBias: 0.3,
      iceBias: 4.5,
      scrapBias: 0.05,
      hunterBias: 0.3,
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
      commonRockBias: 1.5,
      redOreBias: 0.5,
      blueOreBias: 0.3,
      copperBias: 1.2,
      iceBias: 0.8,
      scrapBias: 1.8,
      hunterBias: 0.35,
      ambientLifeBias: 1.4,
      danger: 0.2,
    },
  },

  // ── MID-RANGE ────────────────────────────────────────────────────────────────
  // 12,000–30,000 units out. Reachable with fuel planning. Noticeably richer.
  {
    id: "blue-glint",
    name: "Blue Glint",
    center: { x: -14000, y: -20000 },
    radius: 4000,
    falloff: 4000,
    tags: ["blue-ore", "crystal", "rare-pocket", "scanner-interest"],
    profile: {
      asteroidDensityMultiplier: 0.75,
      commonRockBias: 0.6,
      redOreBias: 0.35,
      blueOreBias: 3.8,
      copperBias: 0.5,
      iceBias: 0.6,
      scrapBias: 0.1,
      hunterBias: 1.2,
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
    tags: ["red-ore", "metallic", "dense-rocks", "industrial"],
    profile: {
      asteroidDensityMultiplier: 1.5,
      commonRockBias: 0.7,
      redOreBias: 2.8,
      blueOreBias: 0.2,
      copperBias: 1.4,
      iceBias: 0.2,
      scrapBias: 0.2,
      hunterBias: 1.5,
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
      commonRockBias: 0.5,
      redOreBias: 0.15,
      blueOreBias: 0.1,
      copperBias: 0.4,
      iceBias: 0.5,
      scrapBias: 0.2,
      hunterBias: 0.1,
      ambientLifeBias: 0.2,
      danger: 0.3,
    },
  },

  // ── OUTER ZONES ──────────────────────────────────────────────────────────────
  // 30,000+ units out. These require a faster ship to reach in reasonable time.
  // The world generates here — chunks exist — but the player earns access.
  {
    id: "old-iron-run",
    name: "Old Iron Run",
    center: { x: 38000, y: -22000 },
    radius: 12000,
    falloff: 8000,
    tags: ["metallic", "dense-rocks", "industrial", "corporate-claims"],
    profile: {
      asteroidDensityMultiplier: 1.7,
      commonRockBias: 0.65,
      redOreBias: 3.5,
      blueOreBias: 0.15,
      copperBias: 2.0,
      iceBias: 0.15,
      scrapBias: 0.3,
      hunterBias: 1.7,
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
      commonRockBias: 1.7,
      redOreBias: 0.35,
      blueOreBias: 0.5,
      copperBias: 1.6,
      iceBias: 2.2,
      scrapBias: 0.3,
      hunterBias: 0.55,
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
      commonRockBias: 0.75,
      redOreBias: 0.2,
      blueOreBias: 1.2,
      copperBias: 0.5,
      iceBias: 5.0,
      scrapBias: 0.05,
      hunterBias: 0.45,
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
    tags: ["anomaly", "strange", "crystal-rich", "story", "dangerous"],
    profile: {
      asteroidDensityMultiplier: 0.9,
      commonRockBias: 0.45,
      redOreBias: 0.25,
      blueOreBias: 5.0,
      copperBias: 0.6,
      iceBias: 0.8,
      scrapBias: 0.05,
      hunterBias: 1.9,
      ambientLifeBias: 1.1,
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
