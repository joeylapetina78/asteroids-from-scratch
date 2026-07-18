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

// Resource records are the shared material vocabulary for the world. Systems
// ask these records about use, value, and appearance instead of maintaining
// per-resource switch statements in UI, contracts, or shops.
export const FAMILY_MEMBERS = {
  volatile: [
    { id: "water-ice",   color: "#b8eaff", weight: 3, value: 30, processOutputs: { fuel: 250 } },
    { id: "methane-ice", color: "#d0f0a0", weight: 2, value: 50, processOutputs: { fuel: 320 } },
    { id: "hydrogen",    color: "#fffdc0", weight: 1, value: 80, processOutputs: { fuel: 400 } },
  ],
  structural: [
    { id: "iron-nickel", color: "#ff7452", weight: 3, value: 20, processOutputs: { ammo: 250 } },
    { id: "aluminum",    color: "#c8d4e0", weight: 2, value: 35, processOutputs: { ammo: 300 } },
    { id: "titanium",    color: "#7898c0", weight: 1, value: 60, processOutputs: { ammo: 400 } },
  ],
  industrial: [
    { id: "silicate",     color: "#d4b896", weight: 3, value: 15, processOutputs: { ammo: 180 } },
    { id: "carbonaceous", color: "#8a7060", weight: 2, value: 25, processOutputs: { ammo: 220, fuel: 100 } },
  ],
  conductor: [
    { id: "copper", color: "#49e1b8", weight: 3, value: 50, processOutputs: { scanergy: 250 } },
    { id: "cobalt", color: "#4a7fd4", weight: 2, value: 80, processOutputs: { scanergy: 350 } },
    { id: "silver", color: "#e8d090", weight: 1, value: 120, processOutputs: { scanergy: 450 } },
  ],
  energy: [
    { id: "uranium", color: "#a0e040", weight: 2, value: 90, processOutputs: { fuel: 650 } },
    { id: "thorium", color: "#60e0a0", weight: 1, value: 160, processOutputs: { fuel: 900 } },
  ],
  advanced: [
    { id: "lithium",    color: "#30f0a0", weight: 3, value: 130, processOutputs: { ammo: 450, scanergy: 300 } },
    { id: "rare-earth", color: "#e050d0", weight: 2, value: 220, processOutputs: { scanergy: 700 } },
    { id: "platinum",   color: "#d8e8f8", weight: 1, value: 300, processOutputs: {} },
  ],
  strange: [
    { id: "crystal-matrix", color: "#de6fff", weight: 2, value: 200, processOutputs: {} },
    { id: "anomaly-shard",  color: "#ff3080", weight: 1, value: 450, processOutputs: {} },
    { id: "rockmoss-crawler", color: "#72ffc9", weight: 0, value: 0, processOutputs: {} },
  ],
};

// Flat lookups built from the above at module load time.
export const RESOURCE_FAMILY = {};
export const RESOURCE_COLOR = {};
export const RESOURCE_COLOR_RGB = {};
export const RESOURCE_DEFINITIONS = {};

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
    RESOURCE_DEFINITIONS[member.id] = { ...member, family: familyId };
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

export function getResourceDefinition(resourceId) {
  return RESOURCE_DEFINITIONS[normalizeResourceType(resourceId)] ?? null;
}

export function getResourceTradeValue(resourceId) {
  return getResourceDefinition(resourceId)?.value ?? 0;
}

export function getResourceProcessValue(resourceId, outputId) {
  if (outputId === "cargo") {
    return getResourceDefinition(resourceId) ? 1 : 0;
  }

  return getResourceDefinition(resourceId)?.processOutputs?.[outputId] ?? 0;
}

export function getResourceGuideEntries() {
  return Object.entries(FAMILY_MEMBERS).map(([familyId, members]) => ({
    id: familyId,
    label: FAMILIES[familyId]?.label ?? familyId,
    shape: FAMILIES[familyId]?.shape ?? "square",
    resources: members.filter((member) => member.weight > 0).map((member) => ({
      ...member,
      purpose: getResourcePurpose(member),
    })),
  }));
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

function getResourcePurpose(resource) {
  const outputs = Object.entries(resource.processOutputs ?? {});

  if (outputs.length === 0) {
    return resource.id === "crystal-matrix" || resource.id === "anomaly-shard"
      ? "Unknown use / valuable cargo"
      : "Trade cargo";
  }

  return outputs
    .map(([output, amount]) => `${formatPurpose(output)} +${amount}`)
    .join(" / ");
}

function formatPurpose(output) {
  if (output === "ammo") return "Charges";
  return output.charAt(0).toUpperCase() + output.slice(1);
}
