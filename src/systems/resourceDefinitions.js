// 7 resource families, each with a distinct shape. Members within a family
// share the shape but have unique colors and rarity weights. Weight is
// relative frequency WITHIN the family — higher = appears more often.

export const FAMILIES = {
  volatile:   { shape: "circle",   label: "Volatile" },
  structural: { shape: "square",   label: "Structural" },
  industrial: { shape: "triangle", label: "Industrial" },
  conductor:  { shape: "hexagon",  label: "Conductor" },
  energy:     { shape: "octagon",  label: "Energy" },
  advanced:   { shape: "diamond",  label: "Advanced" },
  strange:    { shape: "shard",    label: "Strange" },
};

export const FAMILY_MEMBERS = {
  volatile: [
    { id: "water-ice",   color: "#b8eaff", weight: 3 },
    { id: "methane-ice", color: "#d0f0a0", weight: 2 },
    { id: "hydrogen",    color: "#fffdc0", weight: 1 },
  ],
  structural: [
    { id: "iron-nickel", color: "#ff7452", weight: 3 },
    { id: "aluminum",    color: "#c8d4e0", weight: 2 },
    { id: "titanium",    color: "#7898c0", weight: 1 },
  ],
  industrial: [
    { id: "silicate",     color: "#d4b896", weight: 3 },
    { id: "carbonaceous", color: "#8a7060", weight: 2 },
  ],
  conductor: [
    { id: "copper", color: "#49e1b8", weight: 3 },
    { id: "cobalt", color: "#4a7fd4", weight: 2 },
    { id: "silver", color: "#e8d090", weight: 1 },
  ],
  energy: [
    { id: "uranium", color: "#a0e040", weight: 2 },
    { id: "thorium", color: "#60e0a0", weight: 1 },
  ],
  advanced: [
    { id: "lithium",    color: "#30f0a0", weight: 3 },
    { id: "rare-earth", color: "#e050d0", weight: 2 },
    { id: "platinum",   color: "#d8e8f8", weight: 1 },
  ],
  strange: [
    { id: "crystal-matrix", color: "#de6fff", weight: 2 },
    { id: "anomaly-shard",  color: "#ff3080", weight: 1 },
    { id: "rockmoss-crawler", color: "#72ffc9", weight: 0 },
  ],
};

// Flat lookups built from the above at module load time.
export const RESOURCE_FAMILY = {};
export const RESOURCE_COLOR = {};
export const RESOURCE_COLOR_RGB = {};

// Story/content can still use early prototype names while the world uses
// canonical material IDs from the resource family table.
export const LEGACY_RESOURCE_TYPE_MAP = {
  fuel: "iron-nickel",
  iron: "iron-nickel",
  ice: "water-ice",
  crystal: "crystal-matrix",
};

for (const [familyId, members] of Object.entries(FAMILY_MEMBERS)) {
  for (const member of members) {
    RESOURCE_FAMILY[member.id] = familyId;
    RESOURCE_COLOR[member.id] = member.color;
    RESOURCE_COLOR_RGB[member.id] = hexToRgb(member.color);
  }
}

RESOURCE_COLOR_RGB.stone = [170, 185, 210];

export function getResourceFamily(resourceId) {
  return RESOURCE_FAMILY[normalizeResourceType(resourceId)] ?? "structural";
}

export function getResourceShape(resourceId) {
  return FAMILIES[getResourceFamily(resourceId)]?.shape ?? "square";
}

export function getResourceColor(resourceId) {
  return RESOURCE_COLOR[normalizeResourceType(resourceId)] ?? "#888888";
}

export function normalizeResourceType(resourceId) {
  return LEGACY_RESOURCE_TYPE_MAP[resourceId] ?? resourceId;
}

export function resourceTypesMatch(first, second) {
  return normalizeResourceType(first) === normalizeResourceType(second);
}

export function pickFamilyMember(familyId, selectorValue) {
  const members = FAMILY_MEMBERS[familyId];

  if (!members) {
    return null;
  }

  const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);
  let cumulative = 0;

  for (const member of members) {
    cumulative += member.weight / totalWeight;

    if (selectorValue <= cumulative) {
      return member.id;
    }
  }

  return members[members.length - 1].id;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return [r, g, b];
}
