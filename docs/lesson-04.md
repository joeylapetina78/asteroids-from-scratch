# Lesson 04: Resource Fields

The asteroid field is no longer just random decoration.

This milestone adds an invisible resource field. At any world coordinate, the game can ask:

```js
resourceField.getProfile(x, y)
```

That returns:

- `density`: how many asteroids should exist nearby.
- `resources`: a mix of stone, iron, copper, ice, and crystal.
- `color`: the blended asteroid color for that resource mix.
- `richness`: how strong the dominant non-stone resource is.

The visible asteroid field is generated from those invisible traits.

Asteroid color is blended from the resource mix, then biased toward the strongest non-stone material. This keeps common stone present while still making iron, copper, ice, and crystal regions readable to the player.

## Why This Matters

Mining games need the world to mean something. If every asteroid is just random, exploration has no memory and no geography.

A resource field gives the world geography:

- Some areas are dense.
- Some are sparse.
- Some are iron-heavy.
- Some are icy.
- Some have rare crystal traces.

The player can later learn these patterns through scanners, maps, upgrades, and mining choices.

## Determinism

The same world coordinate should create the same result each time. This is called determinism.

We use small seeded random helpers and value noise so the world feels natural but repeatable.

That gives us a stable universe to build survival systems on top of.
