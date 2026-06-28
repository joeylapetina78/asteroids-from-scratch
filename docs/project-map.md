# Project Map

This document is the re-entry map for the Asteroids From Scratch prototype. The game is a custom browser Canvas project, not p5.js or a larger framework. The core idea is a small Asteroids-like flight game growing into a ship-component RPG/mining sandbox.

## How The Project Runs

- [index.html](../index.html) defines the page, canvases, and ship component panels.
- [src/main.js](../src/main.js) connects DOM controls to the game, processor, cargo hold, panel dragging, and HUD updates.
- [src/game.js](../src/game.js) owns the main game simulation loop and the main viewport canvas.
- [src/styles.css](../src/styles.css) lays out the component panels, viewport, processor, cargo hold, warnings, and responsive behavior.

To run locally:

```powershell
python -m http.server 8123
```

Then open `http://127.0.0.1:8123/`.

## Big Picture Architecture

The game is split into four rough layers:

1. Page shell and controls: HTML panels, buttons, readouts, radio controls, and canvases.
2. App wiring: `main.js` creates shared state, starts systems, updates UI, persists panel layout, and reacts to button clicks.
3. Game simulation: `Game` updates the ship, camera, asteroids, lifeforms, bullets, pickups, scanner, docking, particles, and collisions.
4. Small systems and entities: focused modules for asteroids, resources, lifeforms, camera, scanner, processor physics, world zones, sites, and input.

The ship position is world-space. The viewport camera follows the ship and converts world-space entities into screen-space drawing. Most gameplay objects keep their own world coordinates.

## Main Files

| File | Role |
| --- | --- |
| [index.html](../index.html) | Declares the game viewport, processor canvas, cargo canvas, and all ship component panels. |
| [src/main.js](../src/main.js) | Browser-side coordinator. Reads DOM nodes, creates state, creates `Game`, creates processor canvases, updates HUD, handles panel dragging and saved layout. |
| [src/game.js](../src/game.js) | Main simulation and render loop. Owns active world objects and high-level gameplay rules. |
| [src/styles.css](../src/styles.css) | Component panel layout, viewport sizing, warning flashes, hidden hub behavior, and control styling. |
| [src/state/gameState.js](../src/state/gameState.js) | Starting story, ship, component, and account state. This is the current single source for installed systems, ship frame, engine tuning, and initial fuel/ammo/scan/hull values. |
| [src/components/componentRules.js](../src/components/componentRules.js) | Derives available processor outputs from installed components. |
| [src/content/missions/chapterOneInterview.js](../src/content/missions/chapterOneInterview.js) | Authored data for the current Chapter 1 mission. Holds steps, objectives, help text, event transitions, considerations, and actions. |
| [src/systems/eventLedger.js](../src/systems/eventLedger.js) | Records meaningful events and derives compact career/world stats. |

## Entity Dictionary

### Ship

Defined in [src/entities/Ship.js](../src/entities/Ship.js).

The ship has `position`, `velocity`, `angle`, a reference to the engine component state, and a reference to `state.ship` for the current frame/shape. Power comes from `state.components.engine.powered`. When powered down, control is disabled but the ship still drifts through space.

The starter frame is `yard-skiff`, a deliberately clunky shape for Chapter 1. The old sleek triangle shape still exists as `dart` for later faster ships. The engine owns movement tuning and thrust visuals:

- `thrustPower`
- `maxSpeed`
- `rotationSpeed`
- `fuelBurnRate`
- `reverseThrustMultiplier`
- `thrustVisual`

Controls:

- `A` and `D`: rotate
- `W`: thrust
- `S`: brake
- thrust spends fuel
- reverse thrust is available from the engine panel and runs at reduced power

### Asteroid

Defined in [src/entities/Asteroid.js](../src/entities/Asteroid.js).

Asteroids have:

- `origin`: the spawn/rest point
- `position` and `velocity`
- `radius`
- `tier`: how many break steps remain
- `color`
- `resources`
- irregular outline `points`

Asteroids drift slowly but spring back toward their origin, which keeps fields locally stable without making them perfectly static. Bullets and ship impacts call `breakAsteroid`. Large rocks become smaller rocks; smallest rocks disappear. Resource rocks can spawn pickups only at the final break.

White/common rocks use `WHITE_ASTEROID_COLOR` and stone-only resources.

### Bullet

Defined in [src/entities/Bullet.js](../src/entities/Bullet.js).

Bullets are short-lived projectiles fired from the ship nose when the miner is installed, armed, powered, and has ammo.

### Resource Pickup

Defined in [src/entities/ResourcePickup.js](../src/entities/ResourcePickup.js).

Pickups are tiny square loose resources in world space. Red `fuel` pickups and blue `crystal` pickups are created when the smallest resource rocks are destroyed, or when hunters drop loot. Flying over them sends the pickup into the processor canvas instead of directly adding it to ship systems.

### Lifeform

Defined in [src/entities/Lifeform.js](../src/entities/Lifeform.js).

Current types:

- `hunter`: red hostile rammer. Seeks the powered ship within range, wanders when the ship is off or far away, avoids rocks, can be shot, drops resources, and respawns elsewhere.
- `threadling`: small flocking lifeform using separation, alignment, cohesion, fleeing, orbiting, and wandering.
- `grazer`: slower lifeform that orbits rocks and flees the ship.
- `skitter`: twitchier lifeform that orbits or flees rocks and strongly avoids the ship.

The lifeforms use simple steering forces inspired by autonomous agents: seek, flee, separate, align, cohere, wander, and orbit.

### NPC Ship

Defined in [src/entities/NpcShip.js](../src/entities/NpcShip.js).

NPC ships are the first non-player ship actors. They use steering behavior like lifeforms, but represent ships rather than animals. Current haulers follow hub-to-hub routes, avoid rocks, separate from each other, draw as a small cab plus cargo cars, can be shot, and can take damage from asteroid impacts.

## System Dictionary

### Journey Director

[src/systems/journeyDirector.js](../src/systems/journeyDirector.js) is the current top-level story/chapter coordinator. It owns the active mission runner, watches hidden events from the ledger, and keeps the Journey panel in sync.

[src/systems/missionRunner.js](../src/systems/missionRunner.js) executes authored mission data. It knows how to enter steps, respond to acknowledgments, evaluate event transitions, run consideration responses, set mission flags, and run mission actions.

[src/content/missions/chapterOneInterview.js](../src/content/missions/chapterOneInterview.js) is the first mission content file. It is JavaScript data rather than JSON for now, because the shape is still being discovered and small event predicates/markers are easier to evolve here. The structure is intentionally close to JSON so a future editor or content pipeline can grow out of it.

Current opening flow:

1. Prologue starts with only the Journey panel visible.
2. The Galaxy invites the player to play.
3. Rook starts Chapter 1, `Starting Out`, and mission `The Interview`.
4. Rook activates the Viewport.
5. Rook explains panel dragging and activates the Engine.
6. First real player thrust triggers the Scanner prompt.
7. Yard Exchange entering view or becoming nearby triggers the Docking prompt.
8. Docking at Yard Exchange completes the mission.

Mission event handling keeps listening while an NPC line is waiting for `Okay`. That lets stronger world facts interrupt tutorial beats: if the player reaches Yard Exchange before acknowledging the Scanner lesson, the mission can skip ahead to the Docking prompt instead of blocking progress.

Journey is intentionally not a normal debug log. It shows the current story beat, clears acknowledged text, and reserves space so the panel does not jump between messages.

Each mission step also has `helpText`. This is the plain explanation layer for players who skipped or forgot the NPC line. The Journey panel exposes it separately from the NPC story text.

### Game Loop

[src/game.js](../src/game.js) is the main coordinator.

Each animation frame:

1. Read input and component power state.
2. Update ship movement.
3. Update docking/site state and zone title cards.
4. Update shooting, bullets, asteroid hits, and ship impacts.
5. Update asteroids.
6. Select nearby lifeforms and asteroids for active simulation.
7. Update active lifeforms, hunter collisions, and hunter/player collisions.
8. Update pickups, particles, tractor pull field, pickup collection, scanner, camera, story sensors, debug data, and site readout.
9. Draw grid, sites, asteroids, lifeforms, pickups, particles, tractor field, bullets, vector, scanner, ship, and title cards.

### Camera

[src/systems/camera.js](../src/systems/camera.js) keeps the ship near the center using spring-like movement. The camera intentionally lags and catches up, giving speed feel without changing the ship shape.

### Input

[src/systems/input.js](../src/systems/input.js) tracks held keys and keys pressed this frame. It also prevents browser scrolling/default behavior for game keys. `clearGameKeys` drops control keys when power is off or the ship is destroyed, but leaves docking key behavior available.

### Resource Field

[src/systems/resourceField.js](../src/systems/resourceField.js) creates deterministic resource profiles from value noise plus zone modifiers.

The profile includes:

- asteroid density
- normalized resources
- display color
- richness
- common rock bias
- scrap bias placeholder
- zone profile

The existing noise still creates local variation; zones bias the odds and density rather than replacing noise.

### Asteroid Field

[src/systems/asteroidField.js](../src/systems/asteroidField.js) creates the starting asteroid population in a fixed 9 by 9 cell area around the origin. It samples the resource field at cell centers and asteroid positions. Resource asteroids and common white asteroids are spawned separately.

There is no chunk streaming yet. The current field is generated at startup and preserved.

### World Zones

[src/systems/worldZones.js](../src/systems/worldZones.js) defines organic overlapping circular zones:

- Starter Drift
- Red Teeth
- Blue Glint
- Scrap Wake
- Dead Strip
- Open Space fallback

`getZoneProfile(x, y)` blends nearby zones using smooth falloff. It returns fields like density multiplier, ore bias, hunter bias, ambient life bias, danger, strongest zone, influence, and tags.

### Life Field

[src/systems/lifeField.js](../src/systems/lifeField.js) spawns lifeforms anchored near asteroids. Zone profiles weight those anchors:

- dangerous/high hunter-bias zones produce more hunters
- safe zones suppress hunters
- ambient-life zones produce more threadlings, grazers, and skitters
- sparse/dead zones reduce life

Lifeforms are created once at startup. The game preserves all lifeforms but only updates ones near the camera/ship padded simulation area each frame.

### Scanner

[src/systems/scanner.js](../src/systems/scanner.js) creates a forward cone scan. It can be given a target list so starter/tutorial scanners can look only for sites, while later scanner upgrades can include resources or other target classes. Resource asteroids are found in front of the ship; world sites use a broader scan range and can be filtered to the current mission target.

Scanning costs scanergy in `Game.scanForCrystals`.

### Processor And Cargo Hold

[src/systems/processor.js](../src/systems/processor.js) is a small square-unit physics sandbox used twice:

- Processor: clickable, crushes units into the selected output.
- Cargo hold: not clickable, stores units for selling/future quests.

Collected pickups become larger square units falling from a pipe. The processor resolves basic gravity, walls, floor bounce, friction, unit collision, and click sparks.

### World Sites

[src/systems/worldSites.js](../src/systems/worldSites.js) defines authored places in world space. Current sites are repair hubs. The game detects nearby sites, lets the player dock, shows viewport title cards, and reveals the hub service component only while docked.

### Event Ledger

[src/systems/eventLedger.js](../src/systems/eventLedger.js) is the central memory spine for meaningful events and compact stats. Systems report events such as `site.docked`, `site.nearby`, `zone.entered`, `ship.thrusted`, `ship.repaired`, `cargo.sold`, `weapon.fired`, `asteroid.destroyed`, `resource.collected`, `resource.processed`, `enemy.destroyed`, and `npc.destroyed`. The ledger stores capped in-memory event history and derives stat keys like `site.docked.yard-exchange`, `zone.entered.red-teeth`, `resource.collected.crystal`, `credits.earned.sales`, and `credits.spent.repairs`.

This is intentionally separate from contracts and achievements. Future systems can listen to new events or compare stat snapshots without each gameplay system knowing about every possible contract, achievement, reputation rule, or ship record.

Fast/repeating events can be recorded as hidden events. They feed stats and future systems without appearing in the recent visible event list.

The ledger also supports grouped recent display rows. Raw events remain separate for contracts and stats, while the small World panel can collapse repeated visible events such as repeated processor clicks into one line like `Processed fuel to scanergy x5`.

### NPC Routes

[src/systems/npcRoutes.js](../src/systems/npcRoutes.js) creates the first route-following NPC ships from existing hub sites. This is intentionally small: it proves that authored sites can support traffic before adding trade goods, factions, reputation, escorts, piracy, or mission logic.

### Rendering Helpers

[src/systems/rendering.js](../src/systems/rendering.js) contains small shared canvas utilities: clear screen, draw grid, draw velocity vector, and visibility checks.

### Random And Noise

[src/systems/random.js](../src/systems/random.js) provides seeded random helpers. [src/systems/valueNoise.js](../src/systems/valueNoise.js) provides deterministic smooth-ish noise for resource fields.

## Component Dictionary

Component state lives under `state.components`.

| Component | Current UI | Gameplay State |
| --- | --- | --- |
| `account` | Credits in Docking panel | Stores credits earned from selling cargo. |
| `engine` | Power button, fuel, thrust mode, movement hints | Controls ship power, fuel, forward/reverse thrust, top speed, turn speed, fuel burn, thrust strength, thrust visual, and movement permission. |
| `miner` | Arm switch, ammo, fire hint | Controls shooting. Space fires only when armed, powered, and supplied with ammo. |
| `scanner` | Scan button, scanergy percent | Controls scan ability and powers the collector pull field. |
| `collector` | Tractor Field hold button | Pulls loose resource pickups toward the ship while spending scanergy. |
| `processor` | Processor canvas and output choices | Turns clicked resource units into fuel, ammo, scanergy, or cargo storage. |
| `cargoHold` | Cargo canvas | Stores units for selling and future mission delivery. |
| `hull` | Integrity readout | Takes collision damage. At 0%, ship is destroyed and controls are disabled. |
| `docking` | Target, credits, dock button | Shows nearest/nearby site state and toggles docking. |
| `hub` | Hidden service panel | Appears only while docked at a hub. Sells cargo and repairs hull. |
| `world` | Debug component | Shows world position, zone, danger, bias values, and object counts. |

Processor outputs are not hardcoded in the HTML. [src/components/componentRules.js](../src/components/componentRules.js) derives them from installed components.

## Resource And Economy Flow

1. Asteroid field creates white/common rocks plus red/blue resource rocks.
2. Bullets or ship impacts break rocks into smaller rocks.
3. Final resource rocks eject small square pickups.
4. The ship collects pickups by flying over them or pulling them with the collector.
5. Collected pickups fall into the processor canvas.
6. Clicking a processor unit sends its value to the selected output:
   - Fuel
   - Ammo
   - Scanergy
   - Cargo
7. Cargo units fall into the cargo hold.
8. While docked at a hub, cargo can be sold for credits.
9. Credits pay for hull repair.

Current values:

- Basic processed unit: 50
- Blue crystal unit: 5x value when processed
- Cargo fuel unit: 15 credits
- Cargo crystal unit: 75 credits
- Repair: 2 credits per missing hull point

## World And Zone Flow

The current world is authored procedurally at startup:

- `worldZones.js` defines regional personality.
- `resourceField.js` blends zone profile with noise.
- `asteroidField.js` samples the resource field to create rocks.
- `lifeField.js` samples zone profiles near asteroid anchors to place life and hunters.
- `npcRoutes.js` creates route ships between authored world sites.
- `game.js` simulates only nearby life each frame but preserves off-screen entities.

There is no dynamic streaming yet. That is intentional for now.

## Story, UI, And Layout Flow

The HTML panels are treated as ship components. The Journey panel is the story/radio layer and is always above other panels. Newly revealed components are brought above older components but remain below Journey.

`main.js`:

- updates text readouts
- enables/disables buttons
- renders processor output options
- flashes low-resource panels
- hides/reveals hub service panel
- saves panel positions and z-order in `localStorage`
- shows a tiny event-ledger verification readout in the World panel
- keeps the Journey message space stable even when the current message has been acknowledged

Saved layout key:

```text
asteroids.panelLayout.v5
```

## Current Boundaries And Good Next Refactors

Things that are working and should be preserved:

- Ship power vs drift behavior
- Processor and cargo canvas separation
- Zone-biased asteroid and life spawning
- Component panels as ship systems
- Startup-generated world with active-life culling

Pressure points:

- [src/game.js](../src/game.js) is doing many jobs: loop, collision rules, docking, particles, economy hooks, title cards, and debug data.
- [src/main.js](../src/main.js) is doing many browser jobs: DOM binding, HUD, economy UI, processor outputs, layout persistence.
- Resource classification exists in both scanner/pickup logic and may eventually deserve a shared helper.
- Cache-busted import query strings must be kept aligned when changing modules.
- The event ledger is still in-memory only; future save/profile work should decide how much history and which stats persist.

Small future cleanup candidates:

- Extract collision/impact rules from `game.js`.
- Extract viewport title/site drawing from `game.js`.
- Extract economy values from `main.js`.
- Create a shared resource classification helper.
- Replace manual import cache strings with a cleaner dev-server setup when the project grows.
