const REGION_PROFILE_FIELDS = [
  "volatileBias",
  "structuralBias",
  "industrialBias",
  "conductorBias",
  "energyBias",
  "advancedBias",
  "strangeBias",
  "patrolPressure",
  "piracyPressure",
  "infrastructure",
  "mystery",
];

const DEFAULT_RIGHTS = {
  transit: { status: "open", authorityId: "frontier-transit-office" },
  mining: { status: "unassigned", authorityId: "frontier-claims-office" },
  patrol: { status: "unassigned", authorityId: "frontier-transit-office" },
  salvage: { status: "permit-required", authorityId: "frontier-claims-office" },
  construction: { status: "permit-required", authorityId: "frontier-claims-office" },
  trade: { status: "open", authorityId: "frontier-trade-office" },
  enforcement: { status: "reserved", authorityId: "frontier-transit-office" },
};

const DEFAULT_REGION = {
  id: "the-black",
  name: "The Black",
  color: [32, 28, 56],
  center: { x: 0, y: 0 },
  radius: 0,
  falloff: 0,
  tags: ["unclaimed"],
  institutions: ["frontier-transit-office"],
  dominantFamilies: ["stone"],
  rights: DEFAULT_RIGHTS,
  profile: {
    volatileBias: 0.9,
    structuralBias: 0.8,
    industrialBias: 0.8,
    conductorBias: 0.6,
    energyBias: 0.08,
    advancedBias: 0.12,
    strangeBias: 0.18,
    patrolPressure: 0.05,
    piracyPressure: 0.12,
    infrastructure: 0.05,
    mystery: 0.35,
  },
};

export const WORLD_REGIONS = [
  {
    id: "rook-frontier",
    name: "Rook Frontier",
    color: [68, 190, 210],
    center: { x: 0, y: 0 },
    radius: 2600,
    falloff: 1600,
    tags: ["starter"],
    institutions: ["rook-industries", "yard-exchange-authority", "yard-exchange-finance-office"],
    dominantFamilies: ["industrial", "stone", "structural"],
    rights: {
      ...DEFAULT_RIGHTS,
      transit: { status: "open", authorityId: "yard-exchange-authority" },
      mining: { status: "charter-required", authorityId: "rook-industries" },
      patrol: { status: "delegated", authorityId: "yard-exchange-authority" },
      trade: { status: "open", authorityId: "yard-exchange-authority" },
      enforcement: { status: "reserved", authorityId: "yard-exchange-authority" },
    },
    profile: {
      volatileBias: 0.7,
      structuralBias: 1.25,
      industrialBias: 1.45,
      conductorBias: 0.8,
      energyBias: 0.02,
      advancedBias: 0.04,
      strangeBias: 0.04,
      patrolPressure: 0.35,
      piracyPressure: 0.12,
      infrastructure: 0.45,
      mystery: 0.08,
    },
  },
  {
    id: "red-vein-belt",
    name: "Red Vein Belt",
    color: [235, 44, 48],
    center: { x: 2400, y: -850 },
    radius: 2200,
    falloff: 1700,
    tags: ["mining-rush", "dangerous", "rook-claims"],
    institutions: ["rook-industries", "independent-miners-guild", "yard-exchange-authority"],
    dominantFamilies: ["structural", "industrial"],
    rights: {
      ...DEFAULT_RIGHTS,
      transit: { status: "open-corridors", authorityId: "yard-exchange-authority" },
      mining: { status: "claim-required", authorityId: "rook-industries" },
      patrol: { status: "contested", authorityId: "yard-exchange-authority" },
      salvage: { status: "permit-required", authorityId: "independent-miners-guild" },
      enforcement: { status: "shared", authorityId: "yard-exchange-authority" },
    },
    profile: {
      volatileBias: 0.25,
      structuralBias: 3.2,
      industrialBias: 1.05,
      conductorBias: 0.45,
      energyBias: 0.08,
      advancedBias: 0.12,
      strangeBias: 0.08,
      patrolPressure: 0.45,
      piracyPressure: 0.55,
      infrastructure: 0.35,
      mystery: 0.14,
    },
  },
  {
    id: "copper-wake",
    name: "Copper Wake",
    color: [0, 210, 160],
    center: { x: -2200, y: -2100 },
    radius: 1800,
    falloff: 1400,
    tags: ["trade", "prospecting"],
    institutions: ["yard-exchange-authority", "barvis-holdings", "copperline-prospectors"],
    dominantFamilies: ["conductor", "industrial"],
    rights: {
      ...DEFAULT_RIGHTS,
      transit: { status: "open", authorityId: "yard-exchange-authority" },
      mining: { status: "lease-required", authorityId: "copperline-prospectors" },
      trade: { status: "favored", authorityId: "yard-exchange-authority" },
      construction: { status: "charter-required", authorityId: "barvis-holdings" },
    },
    profile: {
      volatileBias: 0.25,
      structuralBias: 0.45,
      industrialBias: 0.9,
      conductorBias: 3.3,
      energyBias: 0.08,
      advancedBias: 0.22,
      strangeBias: 0.06,
      patrolPressure: 0.28,
      piracyPressure: 0.22,
      infrastructure: 0.5,
      mystery: 0.12,
    },
  },
  {
    id: "cold-reach",
    name: "Cold Reach",
    color: [52, 120, 245],
    center: { x: -2600, y: 1200 },
    radius: 1700,
    falloff: 1300,
    tags: ["frontier"],
    institutions: ["yard-exchange-authority", "coldreach-patrol-office"],
    dominantFamilies: ["volatile", "industrial"],
    rights: {
      ...DEFAULT_RIGHTS,
      transit: { status: "open-emergency", authorityId: "coldreach-patrol-office" },
      mining: { status: "permit-required", authorityId: "coldreach-patrol-office" },
      patrol: { status: "reserved", authorityId: "coldreach-patrol-office" },
      salvage: { status: "restricted", authorityId: "coldreach-patrol-office" },
    },
    profile: {
      volatileBias: 3.8,
      structuralBias: 0.25,
      industrialBias: 0.8,
      conductorBias: 0.35,
      energyBias: 0.04,
      advancedBias: 0.12,
      strangeBias: 0.18,
      patrolPressure: 0.22,
      piracyPressure: 0.18,
      infrastructure: 0.18,
      mystery: 0.28,
    },
  },
];

export function getRegionProfile(x, y) {
  const regionInfluences = WORLD_REGIONS.map((region) => ({
    region,
    influence: getRegionInfluence(region, x, y),
  })).filter(({ influence }) => influence > 0);

  const strongest = regionInfluences.reduce(
    (best, current) => {
      if (current.influence > best.influence) {
        return current;
      }

      // Region cores can overlap while their profiles blend. Resolve an equal
      // full-strength influence by nearest center so one place still owns the
      // legal/economic identity instead of whichever definition came first.
      if (current.influence === best.influence) {
        const currentDistance = Math.hypot(x - current.region.center.x, y - current.region.center.y);
        const bestDistance = Math.hypot(x - best.region.center.x, y - best.region.center.y);
        return currentDistance < bestDistance ? current : best;
      }

      return best;
    },
    { region: DEFAULT_REGION, influence: 0 },
  );
  const regionWeight = regionInfluences.reduce((sum, { influence }) => sum + influence, 0);
  const defaultWeight = Math.max(0, 1 - Math.min(1, regionWeight));
  const totalWeight = regionWeight + defaultWeight || 1;
  const profile = {};

  REGION_PROFILE_FIELDS.forEach((field) => {
    const weightedRegionValue = regionInfluences.reduce(
      (sum, { region, influence }) => sum + region.profile[field] * influence,
      DEFAULT_REGION.profile[field] * defaultWeight,
    );

    profile[field] = weightedRegionValue / totalWeight;
  });

  return {
    strongestRegionId: strongest.region.id,
    strongestRegionName: strongest.region.name,
    influence: strongest.influence,
    color: strongest.region.color,
    dominantFamilies: [...strongest.region.dominantFamilies],
    institutions: [...strongest.region.institutions],
    rights: cloneRights(strongest.region.rights),
    tags: getBlendedTags(regionInfluences, strongest),
    ...profile,
  };
}

export function getRegionInfluence(region, x, y) {
  const distance = Math.hypot(x - region.center.x, y - region.center.y);

  if (distance <= region.radius) {
    return 1;
  }

  if (distance >= region.radius + region.falloff) {
    return 0;
  }

  const falloffProgress = (distance - region.radius) / region.falloff;
  return smoothStep(1 - falloffProgress);
}

function getBlendedTags(regionInfluences, strongest) {
  // Region identity is intentionally firmer than zone navigation. Nearby
  // regions may blend numeric profiles across a border, but their authority,
  // economy, and danger labels should not all claim the same location. The
  // strongest region alone owns the semantic tag set; only its numeric
  // profile is allowed to blend through the transition band.
  return [...strongest.region.tags];
}

function cloneRights(rights) {
  return Object.fromEntries(
    Object.entries(rights).map(([rightType, right]) => [rightType, { ...right }]),
  );
}

function smoothStep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}
