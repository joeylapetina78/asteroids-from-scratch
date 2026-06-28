import { getProcessorOutputs, normalizeProcessorOutput } from "./components/componentRules.js";
import { Game } from "./game.js?v=tractor-field";
import { Processor } from "./systems/processor.js?v=credits-cargo";
import { createGameState } from "./state/gameState.js?v=tractor-field";

// main.js is the browser/page coordinator. It creates the game systems, wires
// DOM controls to component state, and keeps the visible panels in sync.
const PANEL_LAYOUT_STORAGE_KEY = "asteroids.panelLayout.v1";
const PROCESS_OUTPUT_AMOUNT = 50;
const CRYSTAL_VALUE_MULTIPLIER = 5;
const CARGO_UNIT_VALUES = {
  fuel: 15,
  crystal: 75,
};
const STARTER_REGION_NAME = "First Reach";
const DEEP_SPACE_REGION_NAME = "The Black";
const ammoCount = document.querySelector("#ammo-count");
const cargoCanvas = document.querySelector("#cargo");
const canvas = document.querySelector("#game");
const creditCount = document.querySelector("#credit-count");
const fuelCount = document.querySelector("#fuel-count");
const hullCount = document.querySelector("#hull-count");
const dockToggleButton = document.querySelector("#dock-toggle");
const dockingDetail = document.querySelector("#docking-detail");
const dockingStatus = document.querySelector("#docking-status");
const dockingTarget = document.querySelector("#docking-target");
const hubDetail = document.querySelector("#hub-detail");
const hubCargoValue = document.querySelector("#hub-cargo-value");
const hubHull = document.querySelector("#hub-hull");
const hubName = document.querySelector("#hub-name");
const hubPanel = document.querySelector("[data-panel-id='hub']");
const hubRepairButton = document.querySelector("#hub-repair");
const hubRepairCost = document.querySelector("#hub-repair-cost");
const hubSellCargoButton = document.querySelector("#hub-sell-cargo");
const hubStatus = document.querySelector("#hub-status");
const minerArmed = document.querySelector("#miner-armed");
const powerButton = document.querySelector("#ship-power");
const processorCanvas = document.querySelector("#processor");
const processorOutputPanel = document.querySelector(".processor-outputs");
const scanButton = document.querySelector("#ship-scan");
const scanergyCount = document.querySelector("#scanergy-count");
const shipStatus = document.querySelector("#ship-status");
const tractorFieldButton = document.querySelector("#tractor-field-button");
const tractorFieldStatus = document.querySelector("#tractor-field-status");
const viewportRegion = document.querySelector("#viewport-region");
const worldDebugFields = {
  position: document.querySelector("#debug-position"),
  zone: document.querySelector("#debug-zone"),
  influence: document.querySelector("#debug-influence"),
  danger: document.querySelector("#debug-danger"),
  density: document.querySelector("#debug-density"),
  oreBias: document.querySelector("#debug-ore-bias"),
  lifeBias: document.querySelector("#debug-life-bias"),
  asteroids: document.querySelector("#debug-asteroids"),
  hunters: document.querySelector("#debug-hunters"),
  lifeforms: document.querySelector("#debug-lifeforms"),
  activeLifeforms: document.querySelector("#debug-active-lifeforms"),
  pickups: document.querySelector("#debug-pickups"),
  eventCount: document.querySelector("#debug-event-count"),
  shotsFired: document.querySelector("#debug-shots-fired"),
  rocksDestroyed: document.querySelector("#debug-rocks-destroyed"),
  resourcesCollected: document.querySelector("#debug-resources-collected"),
  kills: document.querySelector("#debug-kills"),
  salesCredits: document.querySelector("#debug-sales-credits"),
  repairCredits: document.querySelector("#debug-repair-credits"),
  eventLog: document.querySelector("#event-log"),
};
const state = createGameState();
const processor = new Processor(processorCanvas, processUnit);
const cargoHold = new Processor(cargoCanvas, () => {}, { isClickable: false });
const game = new Game(canvas, state, updateHudDisplay, (type) => processor.addUnit(type), updateWorldDebugDisplay, updateHubDisplay);
let bringPanelToFront = () => {};
let renderedLedgerVersion = -1;
const COMPONENT_WARNING_RULES = [
  { panelId: "engine", cautionAt: 80, criticalAt: 35, getValue: () => state.components.engine.fuel },
  { panelId: "miner", cautionAt: 50, criticalAt: 20, getValue: () => state.components.miner.ammo },
  { panelId: "scanner", cautionAt: 100, criticalAt: 25, getValue: () => state.components.scanner.scanergy },
  { panelId: "hull", cautionAt: 55, criticalAt: 30, getValue: () => state.components.hull.integrity },
];

function updateShipPowerDisplay() {
  const engine = state.components.engine;

  powerButton.textContent = engine.powered ? "Power Down" : "Power Ship";
  powerButton.setAttribute("aria-pressed", String(engine.powered));
  powerButton.disabled = state.components.hull.integrity <= 0;
  shipStatus.textContent = state.components.hull.integrity <= 0 ? "ship destroyed" : engine.powered ? "ship online" : "ship offline";
}

powerButton.addEventListener("click", () => {
  game.setShipPowered(!state.components.engine.powered);
  updateShipPowerDisplay();
});

document.querySelectorAll("input[name='thrust-mode']").forEach((control) => {
  control.addEventListener("change", () => {
    state.components.engine.thrustMode = control.value;
  });
});

minerArmed.addEventListener("change", () => {
  state.components.miner.armed = minerArmed.checked;
});

tractorFieldButton.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  tractorFieldButton.setPointerCapture(event.pointerId);
  setTractorFieldActive(true);
});

tractorFieldButton.addEventListener("pointerup", (event) => {
  if (tractorFieldButton.hasPointerCapture(event.pointerId)) {
    tractorFieldButton.releasePointerCapture(event.pointerId);
  }

  setTractorFieldActive(false);
  tractorFieldButton.blur();
});

tractorFieldButton.addEventListener("click", (event) => event.preventDefault());
tractorFieldButton.addEventListener("pointercancel", () => setTractorFieldActive(false));
tractorFieldButton.addEventListener("lostpointercapture", () => setTractorFieldActive(false));

scanButton.addEventListener("click", () => {
  game.scanForCrystals();
});

dockToggleButton.addEventListener("click", () => {
  game.toggleDock();
});

hubRepairButton.addEventListener("click", () => {
  game.repairAtDock();
  updateHudDisplay();
});

hubSellCargoButton.addEventListener("click", () => {
  sellCargoHold();
});

renderProcessorOutputs();
updateShipPowerDisplay();
updateHudDisplay();

game.start();
processor.start();
cargoHold.start();
makePanelsDraggable();

function updateHudDisplay() {
  renderProcessorOutputs();
  updateShipPowerDisplay();

  creditCount.textContent = String(Math.floor(state.components.account.credits));
  fuelCount.textContent = String(Math.floor(state.components.engine.fuel));
  ammoCount.textContent = String(Math.floor(state.components.miner.ammo));
  scanergyCount.textContent = `${Math.floor(state.components.scanner.scanergy)}%`;
  tractorFieldStatus.textContent = state.components.collector.isActive ? "Pulling" : "Idle";
  tractorFieldButton.setAttribute("aria-pressed", String(state.components.collector.isActive));
  hullCount.textContent = `${Math.ceil(state.components.hull.integrity)}%`;
  minerArmed.checked = state.components.miner.armed;
  updateWarningPanels();
}

function updateHubDisplay(siteState) {
  updateDockingDisplay(siteState);
  updateHubServiceDisplay(siteState);
}

function updateDockingDisplay(siteState) {
  const site = siteState.dockedSite ?? siteState.nearbySite;

  if (!site) {
    dockingStatus.textContent = "no target";
    dockingTarget.textContent = "None";
    dockingDetail.textContent = "No dock target";
    dockToggleButton.textContent = "Dock";
    dockToggleButton.disabled = true;
    return;
  }

  const isDocked = siteState.dockedSite?.id === site.id;

  dockingStatus.textContent = isDocked ? "tether connected" : "tether available";
  dockingTarget.textContent = site.name;
  dockingDetail.textContent = isDocked ? "Docked" : "Press E to dock";
  dockToggleButton.textContent = isDocked ? "Undock" : "Dock";
  dockToggleButton.disabled = false;
}

function updateHubServiceDisplay(siteState) {
  const site = siteState.dockedSite?.type === "hub" ? siteState.dockedSite : null;
  const wasHidden = hubPanel.hidden;

  hubPanel.hidden = !site;
  hubPanel.setAttribute("aria-hidden", String(!site));

  if (!site) {
    hubName.textContent = "Hub";
    hubStatus.textContent = "service window";
    hubDetail.textContent = "Dock to access services";
    hubHull.textContent = `${Math.ceil(siteState.hullIntegrity)}%`;
    hubRepairCost.textContent = `${siteState.repairCost} cr`;
    hubCargoValue.textContent = `${getCargoHoldValue()} cr`;
    hubSellCargoButton.disabled = true;
    hubRepairButton.disabled = true;
    return;
  }

  if (wasHidden) {
    bringPanelToFront(hubPanel);
  }

  const hullPercent = Math.ceil(siteState.hullIntegrity);

  hubName.textContent = site.name;
  hubStatus.textContent = "service window";
  hubDetail.textContent = "Repair dock available";
  hubHull.textContent = `${hullPercent}%`;
  hubRepairCost.textContent = `${siteState.repairCost} cr`;
  hubCargoValue.textContent = `${getCargoHoldValue()} cr`;
  hubSellCargoButton.disabled = getCargoHoldValue() <= 0;
  hubRepairButton.disabled = !siteState.canRepair || hullPercent >= 100 || siteState.credits < siteState.repairCost;
}

function updateWorldDebugDisplay(debug) {
  const zone = debug.zoneProfile;

  worldDebugFields.position.textContent = `${Math.round(debug.worldX)}, ${Math.round(debug.worldY)}`;
  worldDebugFields.zone.textContent = `${zone.strongestZoneName} (${zone.strongestZoneId})`;
  viewportRegion.textContent = getViewportLocationLabel(debug);
  worldDebugFields.influence.textContent = `${Math.round(zone.influence * 100)}%`;
  worldDebugFields.danger.textContent = `${Math.round(zone.danger * 100)}%`;
  worldDebugFields.density.textContent = `${zone.asteroidDensityMultiplier.toFixed(2)}x`;
  worldDebugFields.oreBias.textContent = `R ${zone.redOreBias.toFixed(2)} / B ${zone.blueOreBias.toFixed(2)}`;
  worldDebugFields.lifeBias.textContent = `H ${zone.hunterBias.toFixed(2)} / A ${zone.ambientLifeBias.toFixed(2)}`;
  worldDebugFields.asteroids.textContent = String(debug.asteroidCount);
  worldDebugFields.hunters.textContent = `${debug.hunterCount} / ${debug.activeHunterCount} active`;
  worldDebugFields.lifeforms.textContent = String(debug.lifeformCount);
  worldDebugFields.activeLifeforms.textContent = String(debug.activeLifeformCount);
  worldDebugFields.pickups.textContent = String(debug.pickupCount);
  updateEventLedgerDisplay();
}

function getViewportLocationLabel(debug) {
  const zone = debug.zoneProfile;
  const isInsideStarterRegion = zone.influence > 0;
  const parts = [isInsideStarterRegion ? STARTER_REGION_NAME : DEEP_SPACE_REGION_NAME];

  if (zone.influence >= 0.55 && zone.strongestZoneId !== "open-space") {
    parts.push(`< ${zone.strongestZoneName}`);
  }

  if (debug.currentSite) {
    parts.push(`-- ${debug.currentSite.name}`);
  }

  return parts.join(" ");
}

function updateWarningPanels() {
  COMPONENT_WARNING_RULES.forEach((rule) => {
    setPanelAlert(rule.panelId, getPanelAlertLevel(rule.getValue(), rule));
  });
}

function getPanelAlertLevel(value, rule) {
  if (value <= rule.criticalAt) {
    return "critical";
  }

  if (value <= rule.cautionAt) {
    return "caution";
  }

  return "none";
}

function setPanelAlert(panelId, level) {
  const panel = document.querySelector(`[data-panel-id="${panelId}"]`);

  if (!panel) {
    return;
  }

  panel.classList.toggle("is-caution-resource", level === "caution");
  panel.classList.toggle("is-low-resource", level === "critical");
}

function setTractorFieldActive(isActive) {
  if (state.components.collector.isActive === isActive) {
    return;
  }

  state.components.collector.isActive = isActive;
  updateHudDisplay();
}

function processUnit(type) {
  // Processor clicks do not care where a unit came from. The selected output
  // determines whether the same physical unit becomes fuel, ammo, scanergy, or
  // stored cargo.
  const output = getSelectedProcessorOutput();
  const amount = getUnitProcessValue(type);
  state.components.processor.output = output;
  state.ledger.recordEvent("resource.processed", {
    resourceType: type,
    output,
    amount: output === "cargo" ? 1 : amount,
  });

  if (output === "fuel") {
    state.components.engine.fuel += amount;
  } else if (output === "ammo") {
    state.components.miner.ammo += amount;
  } else if (output === "scanergy") {
    state.components.scanner.scanergy += amount;
  } else if (output === "cargo") {
    cargoHold.addUnit(type);
  }

  updateHudDisplay();
  game.refreshSiteReadout();
}

function sellCargoHold() {
  if (hubPanel.hidden || hubSellCargoButton.disabled) {
    return;
  }

  const cargoValue = getCargoHoldValue();
  const cargoCounts = cargoHold.getUnitCounts();
  const totalUnits = Object.values(cargoCounts).reduce((sum, count) => sum + count, 0);

  if (cargoValue <= 0) {
    return;
  }

  cargoHold.drainUnits();
  state.components.account.credits += cargoValue;
  state.ledger.recordEvent("cargo.sold", {
    creditsEarned: cargoValue,
    units: cargoCounts,
    totalUnits,
  });
  updateHudDisplay();
  game.refreshSiteReadout();
}

function updateEventLedgerDisplay() {
  if (renderedLedgerVersion === state.ledger.version) {
    return;
  }

  renderedLedgerVersion = state.ledger.version;
  worldDebugFields.eventCount.textContent = String(state.ledger.eventCount);
  worldDebugFields.shotsFired.textContent = String(state.ledger.getStat("weapon.fired.total"));
  worldDebugFields.rocksDestroyed.textContent = String(state.ledger.getStat("asteroid.destroyed.total"));
  worldDebugFields.resourcesCollected.textContent = String(state.ledger.getStat("resource.collected.total"));
  worldDebugFields.kills.textContent = String(state.ledger.getStat("enemy.destroyed.total") + state.ledger.getStat("npc.destroyed.total"));
  worldDebugFields.salesCredits.textContent = String(state.ledger.getStat("credits.earned.sales"));
  worldDebugFields.repairCredits.textContent = String(state.ledger.getStat("credits.spent.repairs"));
  worldDebugFields.eventLog.replaceChildren(
    ...state.ledger.getRecentEventGroups(5).reverse().map((eventGroup) => {
      const item = document.createElement("li");
      item.textContent = eventGroup.message;
      return item;
    }),
  );
}

function getCargoHoldValue() {
  const counts = cargoHold.getUnitCounts();

  return Object.entries(counts).reduce(
    (total, [type, count]) => total + (CARGO_UNIT_VALUES[type] ?? 0) * count,
    0,
  );
}

function getUnitProcessValue(type) {
  return type === "crystal" ? PROCESS_OUTPUT_AMOUNT * CRYSTAL_VALUE_MULTIPLIER : PROCESS_OUTPUT_AMOUNT;
}

function getSelectedProcessorOutput() {
  return document.querySelector("input[name='processor-output']:checked")?.value ?? "fuel";
}

function renderProcessorOutputs() {
  normalizeProcessorOutput(state.components);

  const outputs = getProcessorOutputs(state.components);
  const renderedOutputIds = [...processorOutputPanel.querySelectorAll("input[name='processor-output']")]
    .map((control) => control.value)
    .join(",");
  const outputIds = outputs.map((output) => output.id).join(",");

  if (renderedOutputIds === outputIds) {
    return;
  }

  processorOutputPanel.querySelectorAll("label").forEach((label) => label.remove());

  outputs.forEach((output) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const detail = document.createElement("span");

    input.type = "radio";
    input.name = "processor-output";
    input.value = output.id;
    input.checked = output.id === state.components.processor.output;
    input.addEventListener("change", () => {
      state.components.processor.output = output.id;
    });

    detail.className = "processor-output-detail";
    detail.textContent = output.amountLabel;

    label.append(input, output.label, detail);
    processorOutputPanel.append(label);
  });
}

function makePanelsDraggable() {
  // Component panels are intentionally ordinary HTML. Their position and z-order
  // are saved locally so the ship console can slowly become the player's own
  // layout before full accounts/profiles exist.
  const gridSize = 20;
  const savedLayout = loadPanelLayout();
  let topPanelZIndex = getSavedTopZIndex(savedLayout);

  document.querySelectorAll(".component-panel").forEach((panel) => {
    const handle = panel.querySelector(".component-panel-title");
    const panelId = panel.dataset.panelId;

    if (!handle) {
      return;
    }

    const savedPanel = panelId ? savedLayout.panels?.[panelId] : null;
    const offset = { x: savedPanel?.x ?? 0, y: savedPanel?.y ?? 0 };
    let drag = null;

    panel.style.transform = `translate(${offset.x}px, ${offset.y}px)`;

    if (savedPanel?.z) {
      panel.style.zIndex = String(savedPanel.z);
    }

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: offset.x,
        originY: offset.y,
      };
      setPanelTop(panel);
      panel.classList.add("is-dragging");
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }

      offset.x = Math.round((drag.originX + event.clientX - drag.startX) / gridSize) * gridSize;
      offset.y = Math.round((drag.originY + event.clientY - drag.startY) / gridSize) * gridSize;
      panel.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
      savePanelLayout(panel, offset);
    });

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    function endDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }

      panel.classList.remove("is-dragging");
      drag = null;
    }
  });

  bringPanelToFront = setPanelTop;

  function setPanelTop(panel) {
    topPanelZIndex += 1;
    panel.style.zIndex = String(topPanelZIndex);
    savePanelLayout(panel);
  }
}

function loadPanelLayout() {
  try {
    return JSON.parse(window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY)) ?? { panels: {} };
  } catch {
    return { panels: {} };
  }
}

function getSavedTopZIndex(layout) {
  const savedZIndexes = Object.values(layout.panels ?? {})
    .map((panel) => panel.z)
    .filter((zIndex) => Number.isFinite(zIndex));

  return Math.max(10, ...savedZIndexes);
}

function savePanelLayout(panel, offset = null) {
  const panelId = panel.dataset.panelId;

  if (!panelId) {
    return;
  }

  const layout = loadPanelLayout();
  const previousPanel = layout.panels?.[panelId] ?? {};

  layout.panels = {
    ...layout.panels,
    [panelId]: {
      x: offset?.x ?? previousPanel.x ?? 0,
      y: offset?.y ?? previousPanel.y ?? 0,
      z: Number(panel.style.zIndex) || previousPanel.z || 1,
    },
  };

  window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}
