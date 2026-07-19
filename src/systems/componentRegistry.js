// Central panel/component ids. Some entries are physical ship systems, while
// others are paperwork, shops, or debug windows; keeping the ids here is the
// first step toward separating gameplay state from UI visibility rules.
export const PANEL_IDS = Object.freeze([
  "journey",
  "viewport",
  "engine",
  "beacon-locator",
  "beacon-bay",
  "scanner",
  "miner",
  "collector",
  "shield",
  "cloak",
  "tow-cable",
  "moss-harvester",
  "moss-seeder",
  "hull",
  "docking",
  "hub",
  "world",
  "processor",
  "cargo",
  "license",
  "resource-guide",
  "contract",
  "merchant",
  "finley",
  "roadmap",
  "component-shop",
  "tow",
]);

export const STARTUP_HIDDEN_PANEL_IDS = Object.freeze([
  "viewport",
  "engine",
  "beacon-locator",
  "beacon-bay",
  "scanner",
  "miner",
  "collector",
  "shield",
  "cloak",
  "tow-cable",
  "moss-harvester",
  "moss-seeder",
  "hull",
  "docking",
  "hub",
  "world",
  "processor",
  "cargo",
  "contract",
  "merchant",
  "component-shop",
]);

export const COMPONENT_STATE_BY_PANEL_ID = Object.freeze({
  engine: "engine",
  "beacon-locator": "beaconLocator",
  "beacon-bay": "beaconBay",
  scanner: "scanner",
  miner: "miner",
  collector: "collector",
  shield: "shield",
  cloak: "cloak",
  "tow-cable": "towCable",
  "moss-harvester": "mossHarvester",
  "moss-seeder": "mossSeeder",
  hull: "hull",
  docking: "docking",
  processor: "processor",
  cargo: "cargoHold",
});

export function getComponentStateIdForPanel(panelId) {
  return COMPONENT_STATE_BY_PANEL_ID[panelId] ?? null;
}

export function isShipSystemPanel(panelId) {
  return Boolean(getComponentStateIdForPanel(panelId));
}
