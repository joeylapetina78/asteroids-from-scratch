import { Game } from "./game.js?v=processor-outputs";
import { Processor } from "./systems/processor.js?v=processor-outputs";
import { createGameState } from "./state/gameState.js?v=processor-outputs";

const PROCESS_OUTPUT_AMOUNT = 50;
const ammoCount = document.querySelector("#ammo-count");
const canvas = document.querySelector("#game");
const fuelCount = document.querySelector("#fuel-count");
const powerButton = document.querySelector("#ship-power");
const processorCanvas = document.querySelector("#processor");
const processorOutputControls = document.querySelectorAll("input[name='processor-output']");
const scanButton = document.querySelector("#ship-scan");
const scanergyCount = document.querySelector("#scanergy-count");
const shipStatus = document.querySelector("#ship-status");
const state = createGameState();
const processor = new Processor(processorCanvas, processUnit);
const game = new Game(canvas, state, updateHudDisplay, (type) => processor.addUnit(type));

function updateShipPowerDisplay() {
  powerButton.textContent = state.ship.isPowered ? "Power Down" : "Power Ship";
  powerButton.setAttribute("aria-pressed", String(state.ship.isPowered));
  shipStatus.textContent = state.ship.isPowered ? "ship online" : "ship offline";
}

powerButton.addEventListener("click", () => {
  game.setShipPowered(!state.ship.isPowered);
  updateShipPowerDisplay();
});

scanButton.addEventListener("click", () => {
  game.scanForCrystals();
});

updateShipPowerDisplay();
updateHudDisplay();

game.start();
processor.start();

function updateHudDisplay() {
  fuelCount.textContent = String(Math.floor(state.ship.fuel));
  ammoCount.textContent = String(Math.floor(state.ship.ammo));
  scanergyCount.textContent = `${Math.floor(state.ship.scanergy)}%`;
}

function processUnit() {
  const output = getSelectedProcessorOutput();

  if (output === "fuel") {
    state.ship.fuel += PROCESS_OUTPUT_AMOUNT;
  } else if (output === "ammo") {
    state.ship.ammo += PROCESS_OUTPUT_AMOUNT;
  } else {
    state.ship.scanergy += PROCESS_OUTPUT_AMOUNT;
  }

  updateHudDisplay();
}

function getSelectedProcessorOutput() {
  return [...processorOutputControls].find((control) => control.checked)?.value ?? "fuel";
}
