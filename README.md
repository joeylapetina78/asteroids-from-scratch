# Asteroids From Scratch

A small browser-based Asteroids project built one understandable slice at a time.

## Run It

Run a local static server:

```powershell
python -m http.server 8123
```

Then open `http://127.0.0.1:8123/`.

## Controls

- A: rotate left
- D: rotate right
- W: thrust
- S: brake
- Space: fire
- Power Ship button: toggles ship systems on and off

## Current Slice

The page has a ship power button that changes shared game state. When powered off, the ship is dark and cannot move or fire. When powered on, the ship turns white and can rotate, thrust, coast, brake, and fire.

The ship moves through world space while a springy camera follows it, so the grid scrolls underneath the player with a little lag and catch-up.

Asteroids are generated from an invisible resource field. Dense regions contain more asteroids, and resource mixes influence color and size.

Next likely milestone: add a scanner that points toward nearby asteroids, or make bullets collide with mineable rocks.
