# Lesson 11: Directional scanner

The scanner is a ship system that reads the world without changing it.

This first version is directional:

- press the `Scan` button
- a blue cone pulse comes out of the ship nose
- the game searches ahead of the ship within a longer range
- each resource asteroid found gets a small marker near the canvas edge

The scanner looks for asteroids whose resource mix can produce fuel or crystal pickups. Fuel rocks get red markers. Crystal rocks get blue markers.

This is different from a full 360 scan. A full scan would be easier to use, so it should probably have a shorter range. The forward cone gives the player a reason to point the ship and sweep space.

The scanner does not move the ship, spawn resources, or change asteroids. It reads the current asteroid list and draws temporary guidance on top of the space view. The result is intentionally a little messy when several rocks are in the same direction, because that gives us something to tune later.
