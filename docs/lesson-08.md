# Lesson 08: Page controls and shared game state

The game is starting to become more than one canvas. A button on the page can now change something inside the game world.

The new idea is shared state:

```js
const state = createGameState();
const game = new Game(canvas, state);
```

The page reads and writes that state. The game simulation also reads that state.

For ship power:

- `main.js` listens for clicks on the HTML button
- the click asks `Game` to change ship power
- `Game` toggles `state.components.engine.powered` and clears active controls when power goes off
- `Game` passes the engine component into the `Ship`
- `Ship.update()` ignores controls while power is off, but still lets the ship drift
- `Ship.draw()` changes color based on power
- shooting also checks ship power before firing

This is the pattern we can reuse later for bigger ideas:

- inventory canvas reads the same inventory state as the space view
- sliders change ship or machine settings
- buttons power systems on and off
- collection systems add resources into shared inventory

The important design boundary is that the button does not directly move the ship. It asks the game to change power, and the game decides which state and input cleanup belong to that action.
