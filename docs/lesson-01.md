# Lesson 01: The First Playable Slice

This project starts with the smallest useful version of Asteroids: a ship on a canvas.

## Files

- `index.html` creates the page and the canvas.
- `src/main.js` starts the game.
- `src/game.js` owns the game loop and high-level state.
- `src/entities/Ship.js` owns ship movement and drawing.
- `src/systems/input.js` tracks keyboard input.
- `src/systems/rendering.js` holds drawing helper functions.

## Core Ideas

The game runs in a loop:

1. `update(deltaSeconds)` changes the world.
2. `draw()` renders the current world.
3. `requestAnimationFrame` asks the browser for the next frame.

`deltaSeconds` is the amount of time since the last frame. Using it keeps movement from depending too much on the speed of the computer.

The ship has state:

- `position`: where it is.
- `velocity`: how fast it is moving.
- `angle`: where it is pointing.
- `isThrusting`: whether to draw the flame.

The first rule of keeping a project understandable is that each file should have one obvious job.

## Controls

- `A` rotates left.
- `D` rotates right.
- `W` thrusts.
- `S` brakes.
