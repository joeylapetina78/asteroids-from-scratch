import { Ship } from "./entities/Ship.js";
import { createAsteroidField } from "./systems/asteroidField.js";
import { createCamera } from "./systems/camera.js";
import { createInput } from "./systems/input.js";
import { clearScreen, drawGrid, drawVector, isVisible } from "./systems/rendering.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.input = createInput();
    this.camera = createCamera(canvas);
    this.ship = new Ship(0, 0);
    this.asteroids = createAsteroidField(canvas);
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
    this.ship.update(deltaSeconds, this.input);
    this.asteroids.forEach((asteroid) => asteroid.update(deltaSeconds));
    this.camera.follow(this.ship);
  }

  draw() {
    clearScreen(this.context, this.canvas);
    drawGrid(this.context, this.canvas, this.camera);
    this.asteroids.forEach((asteroid) => {
      if (isVisible(asteroid, this.canvas, this.camera)) {
        asteroid.draw(this.context, this.camera);
      }
    });
    drawVector(this.context, this.ship.position, this.ship.velocity, this.camera);
    this.ship.draw(this.context, this.camera);
  }
}
