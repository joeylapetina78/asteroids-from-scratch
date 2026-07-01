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
| [src/content/missions/chapterOneInterview.js](../src/content/missions/chapterOneInterview.js) | Authored data for the first Chapter 1 mission. Holds steps, objectives, help text, event transitions, considerations, and actions. |
| [src/content/missions/chapterOneNewShip.js](../src/content/missions/chapterOneNewShip.js) | Authored data for buying the first player-owned starter mining ship. |
| [src/content/missions/chapterOneRedWork.js](../src/content/missions/chapterOneRedWork.js) | Authored data for Rook's first repeatable red-resource mining job. |
| [src/content/hubs/yardExchangeServices.js](../src/content/hubs/yardExchangeServices.js) | Authored hub service data for Yard Exchange and Scrap Porch NPC/service windows. |
| [src/systems/hubServices.js](../src/systems/hubServices.js) | Resolves docked hub service definitions for the Hub panel. |
| [src/systems/eventLedger.js](../src/systems/eventLedger.js) | Records meaningful events and derives compact career/world stats. |
| [src/systems/audio.js](../src/systems/audio.js) | Procedural Atari-style sound effects and Journey chatter using Web Audio. |
| [src/systems/saveManager.js](../src/systems/saveManager.js) | Lightweight browser-local profile save/load for playtesting. |

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

[src/systems/journeyDirector.js](../src/systems/journeyDirector.js) is the current top-level story/chapter coordinator. It owns the active mission runner, watches hidden events from the ledger, starts the next mission when a Journey acknowledgement requests it, and keeps the Journey panel in sync.

[src/systems/missionRunner.js](../src/systems/missionRunner.js) executes authored mission data. It knows how to enter steps, respond to acknowledgments, evaluate event transitions, run consideration responses, set mission flags, and run mission actions.

[src/content/missions/chapterOneInterview.js](../src/content/missions/chapterOneInterview.js) is the first mission content file. [src/content/missions/chapterOneNewShip.js](../src/content/missions/chapterOneNewShip.js) is the second mission content file. [src/content/missions/chapterOneRedWork.js](../src/content/missions/chapterOneRedWork.js) starts the first repeatable work loop. These are JavaScript data rather than JSON for now, because the shape is still being discovered and small event predicates/markers are easier to evolve here. The structure is intentionally close to JSON so a future editor or content pipeline can grow out of it.

Current opening flow:

1. Prologue starts with only the Journey panel visible.
2. The Galaxy invites the player to play.
3. Rook starts Chapter 1, `Starting Out`, and mission `The Interview`.
4. Rook activates the Hull and points out ship integrity.
5. Rook asks the player to drag both the Journey and Hull panels.
6. Rook activates the Viewport.
7. Rook offers the assessment delivery contract.
8. Accepting the contract advances the mission.
9. Rook activates the Scanner and asks the player to scan once.
10. Rook activates the Engine.
11. Powering the engine advances the mission to movement.
12. First real player thrust confirms the ship is underway.
13. Yard Exchange entering view or becoming nearby triggers the Docking prompt.
14. Docking at Yard Exchange fulfills the contract.
15. Completing the fulfilled contract pays the account and completes the mission.
16. Rook evaluates the run and sends the player to Barvis.
16. Barvis starts `A New Ship?`, opens the Merchant panel, and shows ship offers.
17. Clicking the unaffordable Rook special calls in Mr. Mako.
18. Mako offers a starter ship loan contract.
19. Accepting the loan funds the account.
20. Buying the Rook special installs the miner and cargo hold and completes the mission.
21. Rook returns and offers the first red-resource run.
22. Accepting the red-resource contract sends the player out to mine 5 red resources.
23. Docking at Yard Exchange with the required red cargo fulfills and pays the contract.

Mission event handling keeps listening while an NPC line is waiting for `Okay`. That lets stronger world facts interrupt tutorial beats: if the player reaches Yard Exchange before acknowledging the Scanner lesson, the mission can skip ahead to the Docking prompt instead of blocking progress.

Journey is intentionally not a normal debug log. It shows the current story beat, clears acknowledged text, and reserves space so the panel does not jump between messages.

Each mission step also has `helpText`. This is the plain explanation layer for players who skipped or forgot the NPC line. The Journey panel exposes it separately from the NPC story text.

Mission rules can require multiple flags via `requiresFlags`. The first use is panel-drag training: the DOM drag system records hidden `component.dragged` events, the mission sets separate flags for Journey and Hull, and then advances when both flags are true.

### Contracts

[src/systems/contractManager.js](../src/systems/contractManager.js) is the first contract system. It listens to ledger events and updates contract records without making the Journey Director personally enforce every economic/legal term.

[src/content/contracts/chapterOneContracts.js](../src/content/contracts/chapterOneContracts.js) defines the first contracts:

- `rook-yard-exchange-delivery`: delivery contract. Requires the attached hull VIN `YRDSKF-01-7A3` to dock at Yard Exchange and pays 500 credits.
- `mako-starter-ship-loan`: loan contract. Deposits 20,000 credits, tracks principal/debt state, and leaves repayment controls for a later pass.
- `rook-red-resource-run`: repeatable resource-delivery contract. Requires 5 red resources from cargo at Yard Exchange and pays 100 credits per unit.

Current contract flow:

1. The mission action `offerContract` reveals the Contract component and records a hidden `contract.offered` event.
2. The Contract panel's accept button records `contract.accepted`.
3. The mission listens for `contract.accepted` before continuing to the scanner lesson.
4. When `site.docked` is recorded, the contract manager checks active delivery contracts against the docked site and the attached hull VIN.
5. A matching contract becomes `fulfilled` and records `contract.fulfilled`.
6. The Contract panel shows `Complete Contract`; pressing it records `contract.paid` and adds credits to the account.
7. The mission listens for `contract.paid` to complete the interview.
8. Loan contracts disburse funds on acceptance and record `loan.disbursed`.
9. Resource-delivery contracts consume deposited cargo units, become `fulfilled` at the required amount, and pay only when the player completes the contract.

This is intentionally small, but it sets up the later shape for loan contracts, delivery contracts, repeatable resource work, penalties, deadlines, damage modifiers, and hub contract boards.

The next architecture track is captured in [hub-services-roadmap.md](hub-services-roadmap.md). The goal is to make hub NPCs and services real reusable systems, then make missions point the player toward those systems instead of directly faking shops, loans, repairs, and repeatable work.

The legal/economy track is captured in [legal-contracts-roadmap.md](legal-contracts-roadmap.md). That document covers pilot licenses, ship titles, registration, liens, restricted loan funds, and how those should become reusable systems instead of mission-only story glue.

### Hub Services

[src/content/hubs/yardExchangeServices.js](../src/content/hubs/yardExchangeServices.js) defines the first authored hub service roster. Yard Exchange currently has service entries for:

- `rook-industries`: Rook Industries resource work
- `yard-shipyard`: Barvis and Yard Exchange Shipyard
- `yard-finance`: Mr. Mako and Yard Exchange Finance
- `yard-supply`: Finley and Yard Exchange Supply

[src/systems/hubServices.js](../src/systems/hubServices.js) resolves those services by site id. The docked Hub panel now renders service buttons from this data. The first bridge behavior is intentionally small: Shipyard opens the existing Merchant panel, Finance and Rook Industries focus the Contract panel, and Supply keeps the Hub panel focused with the current repair/sell controls.

Hub service contract offers are temporary until accepted. If a player opens a hub NPC service, sees a contract, and undocks without accepting it, the Contract Manager closes that unaccepted service offer when it sees `site.undocked` in the ledger. Accepted, active, fulfilled, paid, and loan records remain with the player.

### Ship Offers And Merchant

[src/content/ships/shipOffers.js](../src/content/ships/shipOffers.js) defines the first ship offer data. The Merchant panel renders this data into ship cards with brand, model, price, hull, included components, and tradeoffs.

The current offers are intentionally aspirational. Most are too expensive. The Rook special is priced at 20,500 credits so the player can afford it after the 500-credit delivery contract and Mako's 20,000-credit starter loan.

Buying the Rook special:

- subtracts the ship price from account credits
- changes the displayed owned ship name/VIN
- tunes the existing yard-skiff engine fuel burn slightly better
- installs the miner and cargo hold
- records `ship.purchased`

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

Scanning costs scanergy in `Game.scanForCrystals`. Scanner use no longer requires the engine to be powered, which lets the tutorial teach navigation before handing over propulsion.

### Audio

[src/systems/audio.js](../src/systems/audio.js) creates the current sound effects with Web Audio oscillators and noise bursts. It unlocks from the first Journey button click so browser autoplay rules are respected.

Current sounds are intentionally simple and arcade-like:

- UI click and component reveal
- Journey/NPC chatter during typed text
- engine power tones and soft thrust noise/ticks
- scanner ping
- miner charge shot
- rock break
- pickup collection
- hull impact
- docking/refuel tone
- cargo transfer packet
- contract/mission success

The system exposes named functions such as `playScanner`, `playMiningShot`, `playRockBreak`, and `chatter`. That keeps game logic from knowing about oscillators, and leaves room for later per-NPC voices or real sound assets.

### Processor And Cargo Hold

[src/systems/processor.js](../src/systems/processor.js) is a small square-unit physics sandbox used twice:

- Processor: clickable, crushes units into the selected output.
- Cargo hold: not clickable, stores units for selling/future quests.

Collected pickups normally become larger square units falling from a pipe. If the processor is not installed yet but the cargo hold is installed, pickups route straight into cargo storage. The processor resolves basic gravity, walls, floor bounce, friction, unit collision, and click sparks once that system is available.

When docked and depositing contract cargo, clicked cargo units are consumed from the hold and clean square cargo packets travel down the docking tether to the hub in the viewport. This is intentionally similar to the hauler loading/unloading visual, because later NPC cargo should use the same idea for real goods rather than fake decorative lights.

### Save Manager

[src/systems/saveManager.js](../src/systems/saveManager.js) is the first browser-local save foundation. It stores a lightweight profile in `localStorage`:

- component state
- account/debt/contracts
- ship frame/name
- current Journey mission pointer
- cargo hold units
- current ship position and camera position

This is a playtest save, not an account system. It may be reset by future game updates. Use `?resetSave=1` to clear the local save in a browser, and `?devStart=red-work` to start fresh in the first mining work test setup.

### World Sites

[src/systems/worldSites.js](../src/systems/worldSites.js) defines authored places in world space. Current sites are repair hubs. The game detects nearby sites, lets the player dock, shows viewport title cards, and reveals the hub service component only while docked.

### Event Ledger

[src/systems/eventLedger.js](../src/systems/eventLedger.js) is the central memory spine for meaningful events and compact stats. Systems report events such as `site.docked`, `site.nearby`, `zone.entered`, `ship.thrusted`, `ship.repaired`, `cargo.sold`, `contract.accepted`, `contract.fulfilled`, `contract.paid`, `loan.disbursed`, `ship.purchased`, `weapon.fired`, `asteroid.destroyed`, `resource.collected`, `resource.processed`, `enemy.destroyed`, and `npc.destroyed`. The ledger stores capped in-memory event history and derives stat keys like `site.docked.yard-exchange`, `zone.entered.red-teeth`, `resource.collected.crystal`, `contract.resourceDelivered.fuel`, `credits.earned.sales`, `credits.earned.contracts`, `credits.borrowed.total`, and `credits.spent.repairs`.

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
| `miner` | Blaster arm switch, charges, blast hint | Controls mining shots. Space fires only when armed, powered, and supplied with charges. |
| `scanner` | Scan button, scanergy percent | Controls scan ability and powers the collector pull field. |
| `collector` | Tractor Field hold button | Pulls loose resource pickups toward the ship while spending scanergy. |
| `processor` | Processor canvas and output choices | Turns clicked resource units into fuel, ammo, scanergy, or cargo storage. |
| `cargoHold` | Cargo canvas | Stores units for selling and future mission delivery. |
| `hull` | Integrity readout, VIN plate | Takes collision damage. At 0%, ship is destroyed and controls are disabled. The starter VIN is state-backed so future docking, scanning, permits, and identity tricks have a real hook. |
| `docking` | Target, credits, dock button | Shows nearest/nearby site state and toggles docking. |
| `contract` | Contract terms and accept button | Shows the current offered/active/paid contract. Delivery contracts check VIN plus destination; resource contracts check cargo plus destination; loan contracts fund credits and track debt state. |
| `merchant` | Shipyard offer cards | Shows ship offers, handles unaffordable offer events, and buys the starter mining ship. |
| `hub` | Hidden service panel | Appears only while docked at a hub. Sells cargo and repairs hull. |
| `world` | Debug component | Shows world position, zone, danger, bias values, and object counts. |

Processor outputs are not hardcoded in the HTML. [src/components/componentRules.js](../src/components/componentRules.js) derives them from installed components.

## Resource And Economy Flow

1. Asteroid field creates white/common rocks plus red/blue resource rocks.
2. Bullets or ship impacts break rocks into smaller rocks.
3. Final resource rocks eject small square pickups.
4. The ship collects pickups by flying over them or pulling them with the collector.
5. If the processor is installed, collected pickups fall into the processor canvas.
6. If the processor is not installed and the cargo hold is installed, collected pickups fall directly into cargo storage.
7. Clicking a processor unit sends its value to the selected output:
   - Fuel
   - Charges
   - Scanergy
   - Cargo
8. Cargo units fall into the cargo hold.
9. While docked at a hub, cargo can be sold for credits.
10. Credits pay for hull repair.

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
- The event ledger is still in-memory only; save/profile work now preserves the current player state, but future account saves should decide how much event history and which stats persist.

Small future cleanup candidates:

- Extract collision/impact rules from `game.js`.
- Extract viewport title/site drawing from `game.js`.
- Extract economy values from `main.js`.
- Create a shared resource classification helper.
- Replace manual import cache strings with a cleaner dev-server setup when the project grows.
