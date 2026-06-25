# Lesson 12: Second canvas processor

The page now has two canvases:

- the space canvas, where the ship flies, shoots, scans, and collects loose resource pickups
- the processor canvas, where collected resource units become larger physical squares

The important architectural shift is that collecting a resource no longer directly changes fuel or crystal counts. Collection now means:

```text
ship overlaps pickup
-> space game removes pickup
-> processor receives a unit
-> unit falls out of the pipe into the processor canvas
```

The processor has its own tiny simulation. Units fall with gravity, collide with the floor, stay inside the canvas, and push against each other. Clicking a unit crushes it into the selected output.

For this pass, the outputs are:

- fuel: +50 fuel
- ammo: +50 ammo
- scanergy: +50% scan power

The resource type does not constrain the output yet. That is intentionally loose so we can first prove the processor routing loop.

The current starting values are 200 fuel, 100 ammo, and 0% scanergy. A scan costs 100%, so scanning only happens after the player has found and processed enough material.
