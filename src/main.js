import { getProcessorOutputs, normalizeProcessorOutput } from "./components/componentRules.js";
import { Game } from "./game.js?v=components";
import { Processor } from "./systems/processor.js?v=processor-outputs";
import { createGameState } from "./state/gameState.js?v=components";

const PROCESS_OUTPUT_AMOUNT = 50;
const ammoCount = document.querySelector("#ammo-count");
const canvas = document.querySelector("#game");
const fuelCount = document.querySelector("#fuel-count");
const powerButton = document.querySelector("#ship-power");
const processorCanvas = document.querySelector("#processor");
const processorOutputPanel = document.querySelector(".processor-outputs");
const scanButton = document.querySelector("#ship-scan");
const scanergyCount = document.querySelector("#scanergy-count");
const shipStatus = document.querySelector("#ship-status");
const state = createGameState();
const processor = new Processor(processorCanvas, processUnit);
const game = new Game(canvas, state, updateHudDisplay, (type) => processor.addUnit(type));

function updateShipPowerDisplay() {
  const engine = state.components.engine;

  powerButton.textContent = engine.powered ? "Power Down" : "Power Ship";
  powerButton.setAttribute("aria-pressed", String(engine.powered));
  shipStatus.textContent = engine.powered ? "ship online" : "ship offline";
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

scanButton.addEventListener("click", () => {
  game.scanForCrystals();
});

renderProcessorOutputs();
updateShipPowerDisplay();
updateHudDisplay();

game.start();
processor.start();

function updateHudDisplay() {
  renderProcessorOutputs();

  fuelCount.textContent = String(Math.floor(state.components.engine.fuel));
  ammoCount.textContent = String(Math.floor(state.components.miner.ammo));
  scanergyCount.textContent = `${Math.floor(state.components.scanner.scanergy)}%`;
}

function processUnit() {
  const output = getSelectedProcessorOutput();
  state.components.processor.output = output;

  if (output === "fuel") {
    state.components.engine.fuel += PROCESS_OUTPUT_AMOUNT;
  } else if (output === "ammo") {
    state.components.miner.ammo += PROCESS_OUTPUT_AMOUNT;
  } else {
    state.components.scanner.scanergy += PROCESS_OUTPUT_AMOUNT;
  }

  updateHudDisplay();
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
