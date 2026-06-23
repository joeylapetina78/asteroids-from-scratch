import { Game } from "./game.js";

const canvas = document.querySelector("#game");
const game = new Game(canvas);

game.start();
