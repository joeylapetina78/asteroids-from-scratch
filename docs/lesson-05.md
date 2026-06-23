# Lesson 05: Camera Feel

The camera no longer follows the exact center of the ship.

Instead, it looks ahead in the direction of travel. Because the camera looks ahead, the ship appears slightly behind the center of the screen. That gives movement a stronger sense of speed and weight.

```js
const speedRatio = Math.min(speed / OFFSET_SPEED, 1);
const offsetDistance = Math.pow(speedRatio, OFFSET_CURVE) * MAX_SHIP_OFFSET;
```

The important design choice is the curve.

Linear movement would spend a lot of time in the middle of the offset range. This version uses an exponent below `1`, which pushes the visible offset outward sooner and makes the ship spend more time near the expressive extremes.

The ship itself does not change shape. The feel comes from the relationship between:

- the ship's real world position
- the camera's look-ahead position
- the screen center

This is still visual only. It does not change the ship's real position, collision shape, or physics. That distinction matters: game feel can be layered on top of the simulation without making the simulation harder to reason about.
