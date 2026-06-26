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
- Thrust mode: chooses forward thrust or low-power reverse thrust
- Scan button: sends a forward resource scan from the ship nose
- Miner armed switch: enables or disables shooting
- Collector range: pulls loose resource squares toward the ship and spends scanergy
- Processor output: chooses where crushed units go
- Processor click: crushes a collected unit into the selected output

## Current Slice

The ship is modeled as a set of installed components: engine, miner, scanner, collector, and processor. The page controls are the ship interface for those components.

The engine has a power button, fuel, and a thrust-direction toggle. When powered off, the ship is dark, cannot be controlled, and cannot fire, but it still drifts. When powered on, the ship turns white and can rotate, thrust, coast, brake, and fire.

The ship moves through world space while a springy camera follows it, so the grid scrolls underneath the player with a little lag and catch-up.

Asteroids are generated from an invisible resource field. Dense regions contain more asteroids, and resource mixes influence color and size.

The field also contains many common white stone asteroids. Bullets and ship impacts break asteroids into smaller chunks before the smallest pieces disappear.

Destroying the smallest resource rocks ejects red fuel squares or blue crystal squares. Flying over those squares sends larger units into the processor canvas instead of immediately turning them into fuel or crystal value. Thrust spends fuel.

The scan button sends out a forward cone pulse. If it detects resource asteroids ahead, it shows small edge markers: red for fuel rocks and blue for crystal rocks. The collector uses scanergy continuously to create a pull field around the ship, drawing loose resource squares inward while the slider is above zero.

The smaller processor canvas sits to the left on wide screens. It receives collected units from a pipe at the top. Units fall, stack, collide, and can be clicked to crush them into the selected output. Available processor outputs are driven by installed components, so fuel comes from the engine, ammo comes from the miner, and scanergy comes from the scanner.

Next likely milestone: make component panels draggable on a ship dashboard grid, or add install/locked states so new systems can appear through progression.
