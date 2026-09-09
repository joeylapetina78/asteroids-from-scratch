// What the cockpit remembers about how the player has arranged it.
//
// This file used to also carry a docking-rail scheme: three fixed slots (left,
// right, bottom) and four presets that assigned every instrument to one of
// them. The cockpit was rebuilt around a module bay and free placement, and the
// rails were never filled again — `applyAssignments` stopped reading the
// assignments, the three slot containers stayed empty, and the only surviving
// effect of choosing a preset was that it wiped `floatingPositions`. A control
// whose sole remaining function was destroying the player's arrangement.
//
// Removed rather than repaired: instruments are placed by hand now, onto the
// grid, and that is the whole model. See docs/panel-mounting-standard.md.

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

export function createCockpitLayoutState(source = null) {
  return {
    // v5 drops `preset` and `assignments`. Old saves carrying them simply lose
    // two fields nothing read; there is nothing to migrate.
    version: 5,
    floatingPositions: normalizeFloatingPositions(source?.floatingPositions),
    openModules: normalizeOpenModules(source?.openModules),
    trayOpen: source?.trayOpen === true,
    processorClawPosition: normalizePoint(source?.processorClawPosition),
    processorClawTarget: normalizeClawTarget(source?.processorClawTarget),
    phosphorColor: normalizePhosphorColor(source?.phosphorColor),
  };
}

// Put the desk back to bare: nothing floating, nothing open, the bay shut. The
// phosphor colour is deliberately kept — it is the player's, not part of an
// arrangement, and losing it on a layout reset was never the intent.
export function resetCockpitLayout(state) {
  state.floatingPositions = {};
  state.openModules = [];
  state.trayOpen = false;
  state.processorClawPosition = null;
  state.processorClawTarget = "cargo";
  return state;
}

function normalizePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ? { x: Math.round(point.x), y: Math.round(point.y) }
    : null;
}

function normalizeClawTarget(target) {
  return ["engine", "miner", "scanner", "collector", "hull", "cargo"].includes(target) ? target : "cargo";
}

function normalizeFloatingPositions(positions) {
  return Object.fromEntries(COCKPIT_MODULE_IDS.flatMap((moduleId) => {
    const position = positions?.[moduleId];
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return [];
    const responsive = Number.isFinite(position?.anchorX?.fraction)
      && Number.isFinite(position?.anchorX?.offset)
      && Number.isFinite(position?.anchorY?.fraction)
      && Number.isFinite(position?.anchorY?.offset)
      ? {
          anchorX: { fraction: position.anchorX.fraction, offset: position.anchorX.offset },
          anchorY: { fraction: position.anchorY.fraction, offset: position.anchorY.offset },
        }
      : {};
    return [[moduleId, { x: Math.round(position.x), y: Math.round(position.y), ...responsive }]];
  }));
}

function normalizeOpenModules(moduleIds) {
  if (!Array.isArray(moduleIds)) return [];
  return [...new Set(moduleIds)].filter((moduleId) => (
    COCKPIT_MODULE_IDS.includes(moduleId) && !["processor", "cargo"].includes(moduleId)
  ));
}

function normalizePhosphorColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color ?? "") ? color.toLowerCase() : DEFAULT_COCKPIT_PHOSPHOR;
}
