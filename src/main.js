import { Game } from "./game.js?v=processor-canvas";
import { Processor } from "./systems/processor.js?v=processor-canvas";
import { createGameState } from "./state/gameState.js?v=processor-canvas";

const canvas = document.querySelector("#game");
const fuelCount = document.querySelector("#fuel-count");
const powerButton = document.querySelector("#ship-power");
const processorCanvas = document.querySelector("#processor");
const scanButton = document.querySelector("#ship-scan");
const shipStatus = document.querySelector("#ship-status");
const state = createGameState();
const processor = new Processor(processorCanvas);
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
}
