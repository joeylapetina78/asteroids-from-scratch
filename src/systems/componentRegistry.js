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
  "tow-cable",
  "moss-harvester",
  "hull",
  "docking",
  "hub",
  "world",
  "processor",
  "cargo",
  "license",
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
  "tow-cable",
  "moss-harvester",
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
  "tow-cable": "towCable",
  "moss-harvester": "mossHarvester",
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
