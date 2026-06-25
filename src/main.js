import { Game } from "./game.js?v=fuel-crystals";
import { createGameState } from "./state/gameState.js?v=fuel-crystals";

const canvas = document.querySelector("#game");
const crystalCount = document.querySelector("#crystal-count");
const fuelCount = document.querySelector("#fuel-count");
const powerButton = document.querySelector("#ship-power");
const shipStatus = document.querySelector("#ship-status");
const state = createGameState();
const game = new Game(canvas, state, updateHudDisplay);

function updateShipPowerDisplay() {
  powerButton.textContent = state.ship.isPowered ? "Power Down" : "Power Ship";
  powerButton.setAttribute("aria-pressed", String(state.ship.isPowered));
  shipStatus.textContent = state.ship.isPowered ? "ship online" : "ship offline";
}

powerButton.addEventListener("click", () => {
  game.setShipPowered(!state.ship.isPowered);
  updateShipPowerDisplay();
});

updateShipPowerDisplay();
updateHudDisplay();

game.start();

function updateHudDisplay() {
  fuelCount.textContent = String(Math.floor(state.ship.fuel));
  crystalCount.textContent = String(state.inventory.crystals);
}
