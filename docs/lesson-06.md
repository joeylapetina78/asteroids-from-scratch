# Lesson 06: Shooting

Shooting adds two new ideas:

- A `Bullet` entity.
- Input that can tell the difference between "down" and "pressed this frame."

Holding `Space` fires repeatedly using a cooldown:

```js
const FIRE_COOLDOWN_SECONDS = 0.18;
```

Pressing `Space` once also fires immediately because the input system tracks `wasPressed("Space")`.

Bullets inherit the ship's velocity:

```js
bullet.velocity = ship.velocity + forwardDirection * BULLET_SPEED;
```

That means firing while moving feels physical. The shot travels forward relative to the ship, but it also carries the ship's current momentum.

Bullets have a lifetime and remove themselves after a short time. That keeps the world from filling up with old projectiles forever.
