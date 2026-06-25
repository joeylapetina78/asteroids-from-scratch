# Lesson 10: Resource pickups

Small resource asteroids now create collectible resource units when destroyed.

The chain is:

- large resource asteroid breaks into smaller rocks
- final small resource rock is destroyed
- red or blue square pickups eject into world space
- the ship overlaps the squares
- fuel or crystal state increases
- the page readout updates

The pickup is its own entity instead of being counted immediately. That matters because the resource has a physical moment in the world: it appears, drifts, and has to be collected.

The shared state now has fuel and inventory:

```js
ship: {
  fuel: 100,
  maxFuel: 100,
},
inventory: {
  crystals: 0,
}
```

Red pickups are fuel. Blue pickups are crystals. Holding thrust spends fuel, so fuel is now part of the movement loop instead of just being a number on the page.
