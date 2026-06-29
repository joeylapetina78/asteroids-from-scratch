# Asteroids From Scratch

A small browser-based Asteroids project built one understandable slice at a time. It started as ship flight on a canvas and is now becoming an open-space mining/RPG sandbox where page widgets represent ship components.

For the fuller system map, see [docs/project-map.md](docs/project-map.md).

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
- Space: fire charge
- Power Ship button: toggles ship systems on and off
- Thrust mode: chooses forward thrust or low-power reverse thrust
- Scan button: sends a forward resource scan from the ship nose
- Miner armed switch: enables or disables shooting
- Tractor Field button: hold to pull nearby loose resources while spending scanergy
- Processor output: chooses where crushed units go
- Processor click: crushes a collected unit into the selected output
- Panel title drag: moves component panels on a small snap grid

## Current Slice

The current opening is a small story prologue. The Journey component appears first, introduces the game, then Rook reveals the viewport and ship systems one beat at a time. Journey stays above the other panels, while newly granted panels appear above older panels so the player can notice and rearrange them.

The ship is modeled as a ship frame plus installed components: engine, miner, scanner, collector, cargo hold, hull, and processor. The page controls are the ship interface for those components.

The starter ship is a slow Yard Skiff frame. The engine has a power button, fuel, thrust-direction toggle, top speed, thrust power, rotation speed, fuel burn, and thrust visual settings. When powered off, the ship is dark, cannot be controlled, and cannot fire, but it still drifts. When powered on, the ship turns white and can rotate, thrust, coast, brake, and fire.

The ship moves through world space while a springy camera follows it, so the grid scrolls underneath the player with a little lag and catch-up.

Asteroids are generated from an invisible resource field. Dense regions contain more asteroids, and resource mixes influence color and size.

The field also contains autonomous life forms: hunters, threadling flocks, grazers, and skitters. They use steering behaviors to seek, flee, wander, flock, orbit around rocks, and avoid collisions. Red hunters can be shot, ram the ship, and lose their ship lock when the engine is powered down. Life forms outside the padded camera/ship area are preserved but not simulated every frame.

The world now has a first pass at non-player ship traffic. Small cargo haulers follow routes between hub sites, avoid rocks, can be damaged by asteroid impacts, and can be shot. They are a foundation for later traders, escorts, piracy, reputation, and defend/attack choices.

The field also contains many common white stone asteroids. Bullets and ship impacts break asteroids into smaller chunks before the smallest pieces disappear. Final white stones burst into small white debris squares when destroyed.

Destroying the smallest resource rocks ejects red fuel squares or blue crystal squares. Flying over those squares sends larger units into the processor canvas instead of immediately turning them into fuel or crystal value. Thrust spends fuel.

The scan button sends out a forward cone pulse. If it detects resource asteroids ahead, it shows small edge markers: red for fuel rocks and blue for crystal rocks. The tractor field uses scanergy continuously while held, drawing loose resource squares inward.

The smaller processor canvas sits to the left on wide screens. It receives collected units from a pipe at the top. Units fall, stack, collide, and can be clicked to crush them into the selected output. Available processor outputs are driven by installed components, so fuel comes from the engine, ammo comes from the miner, scanergy comes from the scanner, and cargo sends the unit into the cargo hold.

The cargo hold has its own pipe and physics space. Units sent there are stored instead of processed, which gives future quests a place to check for delivered goods. The hull panel tracks ship integrity. Rock impacts throw ship sparks and reduce integrity based on impact speed and asteroid size.

The game also has an in-memory event ledger for meaningful career/world events. It records docking, zone entry, shooting, asteroid destruction, resource collection, resource processing, cargo sales, repairs, enemy kills, and NPC ship destruction. The World panel shows a small verification readout with recent visible events and compact stats.

Profiles now save locally in the browser with `localStorage`. The first pass preserves component state, contracts, debt, cargo units, ship identity, and the current ship position. It is intentionally a lightweight playtest save and may be reset by future game updates. Use `?resetSave=1` to clear the local save.

For development testing, `?devStart=red-work` starts fresh near Yard Exchange with the starter mining setup so later contract work can be tested without replaying the full intro.

Current likely milestone: keep shaping Chapter 1's guided introduction, then connect that story structure to missions, starter economy, and the first ship upgrade.
