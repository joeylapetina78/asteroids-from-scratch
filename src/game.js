import { Ship } from "./entities/Ship.js";
import { createInput } from "./systems/input.js";
import { clearScreen, drawGrid, drawVector } from "./systems/rendering.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.input = createInput();
    this.ship = new Ship(canvas.width / 2, canvas.height / 2);
    this.lastFrameTime = 0;
  }

  start() {
    requestAnimationFrame((time) => this.frame(time));
  }

  frame(time) {
    const deltaSeconds = Math.min((time - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = time;

    this.update(deltaSeconds);
    this.draw();

    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  update(deltaSeconds) {
    this.ship.update(deltaSeconds, this.input, this.canvas);
  }

  draw() {
    clearScreen(this.context, this.canvas);
    drawGrid(this.context, this.canvas);
    drawVector(this.context, this.ship.position, this.ship.velocity);
    this.ship.draw(this.context);
  }
}
