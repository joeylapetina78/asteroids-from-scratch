# Lesson 10: Resource pickups

Small resource asteroids now create collectible resource units when destroyed.

The chain is:

- large resource asteroid breaks into smaller rocks
- final small resource rock is destroyed
- colored square pickups eject into world space
- the ship overlaps the squares
- inventory state increases
- the page readout updates

The pickup is its own entity instead of being counted immediately. That matters because the resource has a physical moment in the world: it appears, drifts, and has to be collected.

The shared state now has an inventory:

```js
inventory: {
  total: 0,
  resources: {
    iron: 0,
    copper: 0,
    ice: 0,
    crystal: 0,
  },
}
```

The page currently shows only the total. The detailed resource counts are already stored for later inventory, selling, fuel, crafting, or refinery rules.
