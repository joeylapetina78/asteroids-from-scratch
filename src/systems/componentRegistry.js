// Central panel/component ids. Some entries are physical ship systems, while
// others are paperwork, shops, or debug windows; keeping the ids here is the
// first step toward separating gameplay state from UI visibility rules.
export const PANEL_IDS = Object.freeze([
  "journey",
  "viewport",
  "engine",
  "scanner",
  "miner",
  "collector",
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
  "scanner",
  "miner",
  "collector",
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
