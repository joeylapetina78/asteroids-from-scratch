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
  {
    id: "starter-drift",
    name: "Starter Drift",
    center: { x: 0, y: 0 },
    radius: 1700,
    falloff: 1300,
    tags: ["starter", "safe", "ambient-life"],
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
    id: "red-teeth",
    name: "Red Teeth",
    center: { x: 3200, y: -1500 },
    radius: 1550,
    falloff: 1400,
    tags: ["red-ore", "dense-rocks", "hunters"],
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
  {
    id: "blue-glint",
    name: "Blue Glint",
    center: { x: -2800, y: -2400 },
    radius: 900,
    falloff: 1000,
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
    id: "scrap-wake",
    name: "Scrap Wake",
    center: { x: -2200, y: 1800 },
    radius: 1500,
    falloff: 1300,
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
    id: "dead-strip",
    name: "Dead Strip",
    center: { x: 1200, y: 3200 },
    radius: 1100,
    falloff: 1800,
    tags: ["sparse", "low-resource", "low-life"],
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
