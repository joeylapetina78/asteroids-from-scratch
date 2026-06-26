# Lesson 10: Resource pickups

Small resource asteroids now create collectible resource units when destroyed.

The chain is:

- large resource asteroid breaks into smaller rocks
- final small resource rock is destroyed
- red or blue square pickups eject into world space
- the ship overlaps the squares
- a processor unit is created in the second canvas

The pickup is its own entity instead of being counted immediately. That matters because the resource has a physical moment in the world: it appears, drifts, and has to be collected.

The shared state keeps engine fuel:

```js
components: {
  engine: {
    fuel: 200,
    maxFuel: 200,
  },
}
```

Red pickups represent future fuel material. Blue pickups represent crystal material. They do not become usable immediately anymore; the processor canvas receives them first. Holding thrust still spends fuel, but collected units only become usable when they are crushed into the selected processor output.
