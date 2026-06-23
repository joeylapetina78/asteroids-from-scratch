# Lesson 07: Spring camera feel

The previous camera feel was a direct formula:

- look at the ship velocity
- turn that velocity into an offset
- place the camera there immediately

That made the ship sit away from center, but it did not really have a body. This version gives the camera its own position and velocity.

The camera is pulled toward the ship with a spring:

```js
acceleration = distanceToShip * springStrength - cameraVelocity * damping
```

That means the ship can move forward faster than the camera at first. Then the camera catches up because the spring is stretched. If the camera has enough speed, it can pass the ship a little before settling back.

The important design knobs are:

- `SPRING_STRENGTH`: how hard the camera gets pulled toward the ship
- `SPRING_DAMPING`: how much camera motion gets slowed down
- `MAX_SHIP_OFFSET`: how far the ship is allowed to get from screen center

A lower damping value feels looser and more dramatic. A higher damping value feels calmer and more direct. Too little damping can feel seasick, so the max offset keeps the camera from wandering too far away from the player.
