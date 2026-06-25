import { Game } from "./game.js?v=resource-pickups";
import { createGameState } from "./state/gameState.js?v=resource-pickups";

const canvas = document.querySelector("#game");
const powerButton = document.querySelector("#ship-power");
const resourceCount = document.querySelector("#resource-count");
const shipStatus = document.querySelector("#ship-status");
const state = createGameState();
const game = new Game(canvas, state, updateInventoryDisplay);

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
updateInventoryDisplay();

game.start();

function updateInventoryDisplay() {
  resourceCount.textContent = String(state.inventory.total);
}
