import { getProcessorOutputs, normalizeProcessorOutput } from "./components/componentRules.js";
import { Game } from "./game.js?v=window-resource-values";
import { Processor } from "./systems/processor.js?v=hunter-tuning";
import { createGameState } from "./state/gameState.js?v=impact-effects";

const PROCESS_OUTPUT_AMOUNT = 50;
const CRYSTAL_VALUE_MULTIPLIER = 5;
const ammoCount = document.querySelector("#ammo-count");
const cargoCanvas = document.querySelector("#cargo");
const canvas = document.querySelector("#game");
const collectorRangeCount = document.querySelector("#collector-range-count");
const collectorStrengthControls = document.querySelectorAll("input[name='collector-strength']");
const fuelCount = document.querySelector("#fuel-count");
const hullCount = document.querySelector("#hull-count");
const minerArmed = document.querySelector("#miner-armed");
const powerButton = document.querySelector("#ship-power");
const processorCanvas = document.querySelector("#processor");
const processorOutputPanel = document.querySelector(".processor-outputs");
const scanButton = document.querySelector("#ship-scan");
const scanergyCount = document.querySelector("#scanergy-count");
const shipStatus = document.querySelector("#ship-status");
const state = createGameState();
const processor = new Processor(processorCanvas, processUnit);
const cargoHold = new Processor(cargoCanvas, () => {}, { isClickable: false });
const game = new Game(canvas, state, updateHudDisplay, (type) => processor.addUnit(type));

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

collectorStrengthControls.forEach((control) => {
  control.addEventListener("change", () => {
    state.components.collector.rangeSetting = Number(control.value);
    updateHudDisplay();
  });
});

scanButton.addEventListener("click", () => {
  game.scanForCrystals();
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

  fuelCount.textContent = String(Math.floor(state.components.engine.fuel));
  ammoCount.textContent = String(Math.floor(state.components.miner.ammo));
  scanergyCount.textContent = `${Math.floor(state.components.scanner.scanergy)}%`;
  collectorRangeCount.textContent = getCollectorStrengthLabel();
  hullCount.textContent = `${Math.ceil(state.components.hull.integrity)}%`;
  minerArmed.checked = state.components.miner.armed;
  collectorStrengthControls.forEach((control) => {
    control.checked = Number(control.value) === state.components.collector.rangeSetting;
  });
  updateWarningPanels();
}

function updateWarningPanels() {
  setPanelWarning("engine", state.components.engine.fuel <= 35);
  setPanelWarning("miner", state.components.miner.ammo <= 20);
  setPanelWarning("scanner", state.components.scanner.scanergy <= 25);
  setPanelWarning("hull", state.components.hull.integrity <= 30);
}

function setPanelWarning(panelId, isWarning) {
  document.querySelector(`[data-panel-id="${panelId}"]`)?.classList.toggle("is-low-resource", isWarning);
}

function getCollectorStrengthLabel() {
  if (state.components.collector.rangeSetting >= 1) {
    return "Large";
  }

  if (state.components.collector.rangeSetting >= 0.6) {
    return "Med";
  }

  if (state.components.collector.rangeSetting > 0) {
    return "Small";
  }

  return "Off";
}

function processUnit(type) {
  const output = getSelectedProcessorOutput();
  const amount = getUnitProcessValue(type);
  state.components.processor.output = output;

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
  const gridSize = 20;
  let topPanelZIndex = 10;

  document.querySelectorAll(".component-panel").forEach((panel) => {
    const handle = panel.querySelector(".component-panel-title");

    if (!handle) {
      return;
    }

    const offset = { x: 0, y: 0 };
    let drag = null;

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
      topPanelZIndex += 1;
      panel.style.zIndex = String(topPanelZIndex);
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
}
