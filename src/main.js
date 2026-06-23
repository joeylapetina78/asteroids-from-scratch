import { Game } from "./game.js";
import { createGameState } from "./state/gameState.js";

const canvas = document.querySelector("#game");
const powerButton = document.querySelector("#ship-power");
const shipStatus = document.querySelector("#ship-status");
const state = createGameState();
const game = new Game(canvas, state);

function updateShipPowerDisplay() {
  powerButton.textContent = state.ship.isPowered ? "Power Down" : "Power Ship";
  powerButton.setAttribute("aria-pressed", String(state.ship.isPowered));
  shipStatus.textContent = state.ship.isPowered ? "ship online" : "ship offline";
}

powerButton.addEventListener("click", () => {
  state.ship.isPowered = !state.ship.isPowered;
  updateShipPowerDisplay();
});

updateShipPowerDisplay();

game.start();
