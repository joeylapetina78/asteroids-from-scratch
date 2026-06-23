# Lesson 03: Asteroids as World Objects

Asteroids are now entities, just like the ship.

Each asteroid owns:

- `origin`: the place it belongs in the world.
- `position`: where it currently is.
- `velocity`: how slowly it is drifting.
- `radius`: its rough size.
- `points`: the uneven polygon shape.
- `color`: the outline color.

The field generator divides the world into cells about one screen-width wide. It creates one asteroid in each cell, with some random offset so it does not look like a perfect grid.

The starting cell is skipped so the player does not begin on top of an asteroid.

Asteroids drift slowly, but they also get pulled back toward their origin:

```js
velocity.x -= offsetX * SPRING_STRENGTH * deltaSeconds;
velocity.y -= offsetY * SPRING_STRENGTH * deltaSeconds;
```

That gives them a little life without letting them wander away forever.

The important design idea: asteroids are not tied to the screen. They exist in world space, and the camera decides whether they are visible.
