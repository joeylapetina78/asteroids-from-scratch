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

## Current Slice

The ship can rotate, thrust, coast, and brake. The ship moves through world space while the camera follows it, so the grid scrolls underneath the player.

Next likely milestone: add a scanner that points toward nearby asteroids.
