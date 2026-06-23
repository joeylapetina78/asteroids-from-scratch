# Lesson 02: Screen Space vs World Space

The first version treated the canvas as the whole world. The ship moved directly around the screen.

This version separates two ideas:

- World position: where the ship really is in the game world.
- Screen position: where that world position appears on the canvas.

The ship now starts at world position `{ x: 0, y: 0 }`.

The camera follows the ship:

```js
camera.x = ship.position.x - canvas.width / 2;
camera.y = ship.position.y - canvas.height / 2;
```

That means the ship stays centered because the camera is always looking at it.

The grid moves because grid lines are drawn relative to the camera. As the ship moves through the world, the camera moves too, and the world appears to slide underneath.

This prepares us for a larger game where asteroids can exist at world positions far away from the player. The player will need to travel, search, and find them.
