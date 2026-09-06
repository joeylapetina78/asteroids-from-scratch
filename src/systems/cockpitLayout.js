export const COCKPIT_SLOT = Object.freeze({
  LEFT: "left",
  RIGHT: "right",
  BOTTOM: "bottom",
});

export const DEFAULT_COCKPIT_PHOSPHOR = "#7dffe0";

export const COCKPIT_MODULE_IDS = Object.freeze([
  "processor",
  "cargo",
  "tow-cable",
  "moss-seeder",
  "beacon-bay",
  "moss-harvester",
  "hull",
  "engine",
  "beacon-locator",
  "shield",
  "cloak",
  "miner",
  "collector",
  "scanner",
]);

const COMMON = {
  processor: COCKPIT_SLOT.LEFT,
  cargo: COCKPIT_SLOT.RIGHT,
  "tow-cable": COCKPIT_SLOT.LEFT,
  "moss-seeder": COCKPIT_SLOT.LEFT,
  "beacon-bay": COCKPIT_SLOT.LEFT,
  "moss-harvester": COCKPIT_SLOT.LEFT,
  hull: COCKPIT_SLOT.RIGHT,
  engine: COCKPIT_SLOT.RIGHT,
  "beacon-locator": COCKPIT_SLOT.RIGHT,
  shield: COCKPIT_SLOT.RIGHT,
  cloak: COCKPIT_SLOT.RIGHT,
  miner: COCKPIT_SLOT.BOTTOM,
  collector: COCKPIT_SLOT.BOTTOM,
  scanner: COCKPIT_SLOT.BOTTOM,
};

export const COCKPIT_PRESETS = Object.freeze({
  mining: Object.freeze({ ...COMMON }),
  hauling: Object.freeze({
    ...COMMON,
    scanner: COCKPIT_SLOT.RIGHT,
    "tow-cable": COCKPIT_SLOT.LEFT,
    collector: COCKPIT_SLOT.RIGHT,
    cargo: COCKPIT_SLOT.BOTTOM,
  }),
  exploration: Object.freeze({
    ...COMMON,
    scanner: COCKPIT_SLOT.LEFT,
    "beacon-bay": COCKPIT_SLOT.LEFT,
    miner: COCKPIT_SLOT.RIGHT,
    "moss-harvester": COCKPIT_SLOT.BOTTOM,
  }),
  recovery: Object.freeze({
    ...COMMON,
    "tow-cable": COCKPIT_SLOT.LEFT,
    scanner: COCKPIT_SLOT.RIGHT,
    collector: COCKPIT_SLOT.RIGHT,
    cargo: COCKPIT_SLOT.BOTTOM,
  }),
});

export function createCockpitLayoutState(source = null) {
  const preset = COCKPIT_PRESETS[source?.preset] ? source.preset : "mining";
  const assignments = normalizeAssignments(source?.assignments, COCKPIT_PRESETS[preset]);

  return {
    version: 3,
    preset,
    assignments,
    floatingPositions: normalizeFloatingPositions(source?.floatingPositions),
    processorClawPosition: normalizePoint(source?.processorClawPosition),
    processorClawTarget: normalizeClawTarget(source?.processorClawTarget),
    phosphorColor: normalizePhosphorColor(source?.phosphorColor),
  };
}

function normalizePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ? { x: Math.round(point.x), y: Math.round(point.y) }
    : null;
}

function normalizeClawTarget(target) {
  return ["engine", "miner", "scanner", "hull", "cargo"].includes(target) ? target : null;
}

export function applyCockpitPreset(state, preset) {
  const resolvedPreset = COCKPIT_PRESETS[preset] ? preset : "mining";
  state.preset = resolvedPreset;
  state.assignments = { ...COCKPIT_PRESETS[resolvedPreset] };
  state.floatingPositions = {};
  state.processorClawPosition = null;
  state.processorClawTarget = null;
  return state;
}

export function assignCockpitModule(state, moduleId, slot) {
  if (!COCKPIT_MODULE_IDS.includes(moduleId) || !Object.values(COCKPIT_SLOT).includes(slot)) {
    return false;
  }

  state.preset = "custom";
  state.assignments[moduleId] = slot;
  return true;
}

function normalizeAssignments(assignments, fallback) {
  return Object.fromEntries(COCKPIT_MODULE_IDS.map((moduleId) => {
    const slot = assignments?.[moduleId];
    return [moduleId, Object.values(COCKPIT_SLOT).includes(slot) ? slot : fallback[moduleId]];
  }));
}

function normalizeFloatingPositions(positions) {
  return Object.fromEntries(COCKPIT_MODULE_IDS.flatMap((moduleId) => {
    const position = positions?.[moduleId];
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return [];
    return [[moduleId, { x: Math.round(position.x), y: Math.round(position.y) }]];
  }));
}

function normalizePhosphorColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color ?? "") ? color.toLowerCase() : DEFAULT_COCKPIT_PHOSPHOR;
}
