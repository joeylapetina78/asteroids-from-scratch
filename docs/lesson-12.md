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

The processor has its own tiny simulation. Units fall with gravity, collide with the floor, stay inside the canvas, and push against each other. Clicking a unit destroys it.

Later, destroying a processor unit can send material into whichever output is selected: fuel, money, crafting, power, or something else. For now, clicking only removes the unit so we can prove the second canvas and processing space work.
