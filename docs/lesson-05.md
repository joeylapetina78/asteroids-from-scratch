# Lesson 05: Camera Feel and Ship Stretch

The camera no longer follows the exact center of the ship.

Instead, it looks a little ahead in the direction of travel:

```js
lookAhead.x = ship.velocity.x * LOOK_AHEAD_SECONDS;
lookAhead.y = ship.velocity.y * LOOK_AHEAD_SECONDS;
```

Because the camera looks ahead, the ship appears slightly behind the center of the screen. That gives the movement a stronger sense of speed and weight.

The look-ahead is clamped so the ship never gets pushed too far from the center.

The ship also gets a subtle stretch at higher speeds:

```js
context.scale(1 + stretch, 1 - stretch * 0.45);
```

This is visual only. It does not change the ship's real position, collision shape, or physics. That distinction matters: game feel can be layered on top of the simulation without making the simulation harder to reason about.
