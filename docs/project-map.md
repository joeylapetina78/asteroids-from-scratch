# Project Map

This document is the re-entry map for the Asteroids RPG prototype. The game is a custom browser Canvas project, not p5.js or a larger framework. The core idea is a space simulation where the player navigates an institutional world — banks, registries, mining authorities, employers, patrol organizations, factions — through documents, contracts, ships, and components. Mining is one profession within that world, not the definition of it.

See [README.md](../README.md) for the design direction and run instructions. See [docs/systems-direction.md](systems-direction.md) for the full systems vision with current implementation status. See [docs/resource-design.md](resource-design.md) for the resource family taxonomy, scarcity model, and asteroid ecology design.

## How The Project Runs

- [index.html](../index.html) defines the page, canvases, and ship component panels.
- [src/main.js](../src/main.js) connects DOM controls to the game, processor, cargo hold, panel dragging, and HUD updates.
- [src/game.js](../src/game.js) owns the main game simulation loop and the main viewport canvas.
- [src/styles.css](../src/styles.css) lays out the component panels, viewport, processor, cargo hold, warnings, and responsive behavior.

```powershell
python -m http.server 8123
```

## Big Picture Architecture

The game is split into four rough layers:

1. **Page shell and controls** — HTML panels, buttons, readouts, radio controls, and canvases.
2. **App wiring** — `main.js` creates shared state, starts systems, updates UI, persists panel layout, reacts to button clicks, and handles global event listeners (tow chatter, hub authority messages, Rook follow-up offers).
3. **Game simulation** — `Game` updates the ship, camera, asteroids, lifeforms, bullets, pickups, scanner, docking, particles, and collisions.
4. **Small systems and entities** — focused modules for asteroids, resources, lifeforms, camera, scanner, processor physics, world zones, sites, and input.

The ship position is world-space. The viewport camera follows the ship and converts world-space entities into screen-space drawing.

## Main Files

| File | Role |
|---|---|
| [index.html](../index.html) | Declares the game viewport, processor canvas, cargo canvas, and all ship component panels. |
| [src/main.js](../src/main.js) | Browser-side coordinator. Reads DOM nodes, creates state, creates `Game`, updates HUD, handles panel dragging, saved layout, and global event listeners. |
| [src/game.js](../src/game.js) | Main simulation and render loop. Owns active world objects and high-level gameplay rules. |
| [src/styles.css](../src/styles.css) | Component panel layout, viewport sizing, warning flashes, hidden hub behavior, and control styling. |
| [src/state/gameState.js](../src/state/gameState.js) | Starting state shape: ship, components, credits, legal records, UI panel availability, debt, contracts, hub services. |
| [src/components/componentRules.js](../src/components/componentRules.js) | Derives available processor outputs from installed components. |
| [src/content/missions/chapterOneInterview.js](../src/content/missions/chapterOneInterview.js) | Authored beat data for the Chapter 1 delivery mission. Beats, objectives, help text, event transitions, considerations, and actions. |
| [src/content/missions/chapterOneNewShip.js](../src/content/missions/chapterOneNewShip.js) | Authored beat data for buying the first player-owned starter mining ship. |
| [src/content/missions/chapterOneRedWork.js](../src/content/missions/chapterOneRedWork.js) | Authored beat data for Rook's first repeatable red-resource mining job. |
| [src/content/storyWorld.js](../src/content/storyWorld.js) | Shared authored route, site, zone, region, and service IDs for Chapter 1 so world reshaping doesn't require hunting raw IDs through mission files. |
| [src/content/hubs/yardExchangeServices.js](../src/content/hubs/yardExchangeServices.js) | Authored hub service roster for Yard Exchange and Scrap Porch. |
| [src/content/npcs.js](../src/content/npcs.js) | NPC identity records: name, role, voice frequency, home hubs, organizations. |
| [src/systems/hubServices.js](../src/systems/hubServices.js) | Resolves docked hub service definitions by site ID. |
| [src/systems/hubServiceBehaviors.js](../src/systems/hubServiceBehaviors.js) | Maps hub service types to their UI behavior (which panel to open, what to show). |
| [src/systems/hubServiceContracts.js](../src/systems/hubServiceContracts.js) | Chooses which contract a service should offer next (mission-first, prerequisites, repeatables, emergency finance). |
| [src/systems/commsDirector.js](../src/systems/commsDirector.js) | Routes non-mission speech — hub authority, tow drivers, service NPCs, world NPCs — into the comms display with a priority queue. |
| [src/systems/eventLedger.js](../src/systems/eventLedger.js) | Records meaningful events and derives compact career/world stats. Central memory spine. |
| [src/systems/accounts.js](../src/systems/accounts.js) | Cash account bridge. New credit changes go through this system while `state.credits` remains a compatibility mirror for current UI. |
| [src/systems/obligations.js](../src/systems/obligations.js) | Loan/debt obligation records. Loan contracts create obligations, and the old debt summary is derived from them. |
| [src/systems/contractRules.js](../src/systems/contractRules.js) | Maps ledger events to contract fulfillment checks. Seed for declarative contract terms. |
| [src/systems/missionActions.js](../src/systems/missionActions.js) | Defines and runs the mission action vocabulary. Seed for a future mission editor. |
| [src/systems/missionRules.js](../src/systems/missionRules.js) | Matches mission event rules: stat/signal conditions, cooldowns, flags, rotating responses. |
| [src/systems/missionRunner.js](../src/systems/missionRunner.js) | Executes authored mission data. Manages beat traversal, consideration filtering, transition matching, and onEnd. |
| [src/systems/journeyDirector.js](../src/systems/journeyDirector.js) | Top-level story coordinator. Creates mission runners, injects callbacks, starts missions, handles acknowledgements. |
| [src/systems/contentValidation.js](../src/systems/contentValidation.js) | Validates authored mission actions, beat references, contract requirements, hub services, and cross-file content references. |
| [src/systems/componentRegistry.js](../src/systems/componentRegistry.js) | Central panel/component ID registry, startup visibility list, and panel-to-state-ID mapping. |
| [src/systems/hulls.js](../src/systems/hulls.js) | Active hull record bridge. Tracks hull VIN, frame, status, and installed component IDs while current gameplay still reads `state.components`. |
| [src/systems/legalRecords.js](../src/systems/legalRecords.js) | Access layer for pilot license, current ship legal summary, title/registration/lien records, and visited zones under `state.legal`. |
| [src/systems/worldRecords.js](../src/systems/worldRecords.js) | Generic record layer for world entities, documents, and relationships. This is the bridge toward people, ships, companies, institutions, contracts, licenses, and liens sharing one relational shape. |
| [src/systems/paperworkInspections.js](../src/systems/paperworkInspections.js) | Creates paperwork inspection reports from world records: VIN, pilot identity, ship documents, pilot documents, title, lien, registration, and clearance facts. Hubs are one possible inspector. |
| [src/systems/contractManager.js](../src/systems/contractManager.js) | Contract lifecycle management. Listens to ledger events and updates contract records. |
| [src/systems/shipPurchase.js](../src/systems/shipPurchase.js) | Handles ship offer purchase: credits, VIN transfer, component installation, event recording. |
| [src/systems/saveManager.js](../src/systems/saveManager.js) | Lightweight browser-local playtest save/load. |
| [src/systems/audio.js](../src/systems/audio.js) | Procedural Atari-style sound effects using Web Audio. |
| [docs/event-dictionary.md](event-dictionary.md) | Living list of ledger events, payloads, mission rule conditions, and mission actions. |
| [docs/system-authoring-roadmap.md](system-authoring-roadmap.md) | Roadmap for moving toward reusable systems and future web-authored missions/contracts. |

Content authoring can be checked without opening the browser:

```powershell
npm run validate:content
```

## State Shape

```
state = {
  ledger,           // eventLedger — event recording, stats, signals
  journey,          // mission state, flags, messages, currentStepId
  contracts,        // { currentContractId, records }
  ui: {
    panels,         // panel availability (from componentRegistry)
    attention,      // { targets } — UI highlight targets
  },
  hubServices,      // { unlocked, flags }
  character,        // { controlledPersonEntityId, currentLicenseId, activeHullVin }
  accounts,         // { currentAccountId, records } - cash account bridge
  hulls,            // { activeHullVin, records } - VIN-centered hull/component records
  obligations,      // { records } - loans/debts and future owed duties
  debt,             // { totalBorrowed, totalPaid, activePrincipal, activeBalance, highestDebt }
  worldRecords,     // { entities, documents, relationships } - generic world facts
  legal,            // { pilotLicense, currentShip, pilotLicenses, shipTitles, registrations, liens, paperwork }
  ship,             // { frameId, name, shape, purchasedOfferId }
  credits,          // compatibility mirror of current cash account balance
  components,       // ship hardware only: engine, miner, scanner, processor, cargoHold, docking, hull, collector
}
```

`state.components` contains only physical ship hardware. UI state lives under `state.ui`. Legal/document compatibility state lives under `state.legal`. The more general world model lives under `state.worldRecords`: entities, documents, and relationships. Pilot money now lives in `state.accounts`, with `state.credits` kept as a compatibility mirror for existing UI code. Panel availability is `state.ui.panels` — not a ship system.

## Mission Beat System

Missions are authored as a list of **beats** — discrete story units each with an objective, help text, entry actions, event-driven transitions, and an optional `onEnd` hook.

```js
{
  id: "beat-id",
  objective: "Shown in the HUD goal line.",
  helpText: "Shown in the help panel while this beat is active.",
  onEnter: [actions],     // fires when beat becomes current
  onEnd: [actions],       // fires when a transition matches but has no nextStepId
  transitions: [          // advance or end the beat chain
    {
      eventType: "...",
      payloadEquals: { ... },
      requiresFlags: [...],
      nextStepId: "next-beat-id",  // omit to end chain (fires onEnd)
      actions: [actions],
      setFlag: "...",
      once: true,
    }
  ],
  considerations: [...]   // local to this beat (rare — prefer mission-level)
}
```

**Mission-level considerations** are ambient event listeners scoped to a beat range via `fromBeat`/`throughBeat`. They fire dialogue and actions without advancing the beat. A consideration with no `throughBeat` stays active through the end of the mission.

```js
{
  id: "...",
  fromBeat: "show-scanner",   // inclusive start
  throughBeat: "...",         // inclusive end (omit = through mission end)
  eventType: "ship.collision",
  payloadEquals: { targetType: "asteroid" },
  repeatable: true,
  cooldownMs: 8000,
  responses: [{ speaker: "Rook", text: "..." }, ...]
}
```

`missionRunner.js` builds a `beatIndexById` map and filters active considerations by current beat index on every event. Beat order in the `beats` array defines the range — the linear index is authoritative.

**`onEnd`** fires when a transition resolves with no `nextStepId` — the intentional chain end. Existing missions put `completeMission` in transition actions directly; `onEnd` is available as a cleaner semantic slot.

Backward compatibility: `missionRunner.js` reads `beats ?? steps` and `startBeatId ?? startStepId` so older mission files still load.

## Current Missions

### chapter-1-yard-exchange-delivery (Interview)

13 beats: `show-hull` → `drag-panels` → `file-license` → `offer-contract` → `show-viewport` → `show-scanner` → `try-scanner` → `show-engine` → `power-on` → `first-thrust` → `find-yard-exchange` → `dock-yard-exchange` → `complete-delivery-contract`

Beats `try-scanner`, `power-on`, `first-thrust`, and `find-yard-exchange` all shortcut directly to `dock-yard-exchange` on `site.nearby` or `site.enteredViewport` so a player who reaches Yard Exchange early doesn't get stuck mid-tutorial.

Mission considerations: 9 total — 2 scoped to `drag-panels` (panel drag feedback), 7 scoped from `show-scanner` through mission end (flight commentary: rocks, haulers, zone exits, wrong hub docking).

### chapter-1-new-ship (A New Ship?)

7 beats: `find-barvis` → `show-merchant` → `offer-loan` → `read-loan-contract` → `return-to-barvis` → `buy-starter-ship` → `find-rook`

No mission-level considerations. This mission is primarily hub service navigation.

### chapter-1-red-work (First Red Run)

2 beats: `offer-red-contract` → `mine-red-resources`

Mission considerations: 7 items scoped from `mine-red-resources` through end — mining feedback, low fuel warnings, arm miner reminder, red teeth zone warning, hunter commentary, stranded dispatch, tow events.

Completion requires an explicit acknowledgement ("Got It") so the message stays up until dismissed rather than auto-clearing.

## Global Tow Chatter

The tow system is global — not tied to any mission. Three distinct voices in `main.js`:

- `setTowAvailable()` — polls stranded state each frame; the tow driver calls through with an offer and an accept button when the ship is stranded
- `updateTowChatter()` — ledger-event driven; the same driver speaks on `tow.attached` and `ship.towed`

Driver name is derived from `TOW_DRIVER_NAMES` using a hash of `siteId.length + cost` so the same driver name appears across all three moments of a tow.

## Document And Authority Framework

The current compatibility pass lives in `state.legal` and `legalRecords.js`:

- Pilot license (RTC–109–P provisional, issued by Reach Transit Commission)
- Current ship legal summary (VIN, title holder, registration status)
- Visited zone log (foundation for zone enforcement)
- Paperwork records (filed documents by component ID)

The intended direction is a general document framework where documents are issued by institutions, held by entities (people, ships, companies), apply to assets by VIN or ID, grant permissions, create obligations, expire, and can be inspected by hubs or patrols. `state.worldRecords` is the first shared record store for that shape. `state.legal` remains a compatibility summary for current UI/gameplay code, while pilot licenses and ship purchases now also write entity/document/relationship records.

`paperworkInspections.js` is the first reader of that record layer. When a hub reviews a docked ship, it uses the same general inspection system that future patrols, employers, repo crews, companies, NPCs, or players can use. The report comes from both compatibility state and `worldRecords`: what ship VIN was presented, which pilot license is held, which documents apply to the ship, whether title is lien-held, and whether a flight registration exists. The interaction is still automatic for now, but the data shape is ready for future “click the VIN / click your license / present registration” flows.

The RTC issues flight licenses. Rook Industries holds a mining permit (RI–7A3). The player's mining rights flow through Rook's permit. Zone violations are logged to `state.legal` and fire visible ledger events for future enforcement systems.

## Contract System

`contractManager.js` listens to ledger events and updates contract records. Fulfillment logic lives in `contractRules.js` (first step toward declarative contract predicates). Contract lifecycle: offered → accepted → fulfilled → paid.

Current contracts in `chapterOneContracts.js`:

- `rook-yard-exchange-delivery` — delivery contract, requires VIN `YRDSKF-01-7A3` docked at Yard Exchange, pays 500 credits
- `mako-starter-ship-loan` — loan, deposits 20,000 credits, tracks debt state
- `rook-red-resource-run` — repeatable resource delivery, requires 5 red units at Yard Exchange, pays 100 credits/unit

## Hub Services

`hubServiceContracts.js` chooses which contract a service should offer. `hubServiceBehaviors.js` maps service types to UI behavior. `hubServices.js` resolves services by site ID. This keeps the Hub panel from owning job board logic.

Current Yard Exchange services: Rook Industries, Yard Exchange Shipyard (Barvis), Yard Exchange Finance (Mr. Mako), Yard Exchange Supply (Finley), Modworks (Nara Coil), Back Corridor (Murmur).

## Entity Dictionary

### Ship

[src/entities/Ship.js](../src/entities/Ship.js) — `position`, `velocity`, `angle`, reference to engine component state, reference to `state.ship` for frame/shape. Power from `state.components.engine.powered`. Starter frame is `yard-skiff`.

### Component Dictionary

Component state lives under `state.components`. Only physical ship hardware lives here.

| Component | UI | Role |
|---|---|---|
| `engine` | Power button, fuel, thrust mode | Ship power, fuel, movement, thrust tuning. |
| `miner` | Blaster arm switch, charges | Mining shots. Space fires when armed + powered + charged. |
| `scanner` | Scan button, scanergy | Forward cone scan, powers tractor collector. |
| `collector` | Tractor Field hold button | Pulls loose resource pickups toward ship. |
| `processor` | Processor canvas, output choices | Converts resource units into fuel, ammo, scanergy, or cargo. |
| `cargoHold` | Cargo canvas | Stores units for selling and contract delivery. |
| `hull` | Integrity readout, VIN plate | Collision damage state. VIN is the ship's identity anchor for documents, contracts, and legal records. |
| `docking` | Target, credits, dock button | Nearest/nearby site state, docking toggle. |

Non-hardware panels (Contract, Merchant, Hub, World) are UI panels with availability tracked in `state.ui.panels`. They are not ship components.

### Asteroid

[src/entities/Asteroid.js](../src/entities/Asteroid.js) — `origin`, `position`, `velocity`, `radius`, `tier`, `color`, `resources`, irregular outline `points`. Spring back toward origin to keep fields locally stable.

### NPC Ship

[src/entities/NpcShip.js](../src/entities/NpcShip.js) — Route-following ship actors. Current haulers follow hub-to-hub routes, avoid rocks, can take damage. Foundation for traders, escorts, piracy, and patrol.

### Lifeform

[src/entities/Lifeform.js](../src/entities/Lifeform.js) — `hunter`, `threadling`, `grazer`, `skitter`. Steering behavior: seek, flee, separate, align, cohere, wander, orbit.

## System Dictionary

### Event Ledger

[src/systems/eventLedger.js](../src/systems/eventLedger.js) — central memory spine. Records meaningful events, derives compact career stats, tracks signals (booleans), and supports recent-event queries with time-window matching. Systems report to the ledger; other systems read from it. The mission runner polls the ledger every frame for new events.

Key events: `site.docked`, `site.nearby`, `zone.entered`, `ship.thrusted`, `ship.collision`, `ship.stranded`, `ship.towed`, `tow.attached`, `contract.accepted`, `contract.fulfilled`, `contract.paid`, `loan.disbursed`, `ship.purchased`, `resource.collected`, `resource.mined`, `enemy.destroyed`, `mission.accepted`, `mission.completed`, `component.dragged`, `component.filed`.

### Game Loop

Each animation frame in `game.js`:

1. Read input and component power state.
2. Update ship movement.
3. Update docking/site state and zone title cards.
4. Update shooting, bullets, asteroid hits, and ship impacts.
5. Update asteroids, lifeforms, pickups, particles, tractor field, scanner, camera.
6. Fire story sensors and collect debug data.
7. Draw everything.

### Camera

[src/systems/camera.js](../src/systems/camera.js) — spring-like follow. Intentional lag gives speed feel.

### World Zones

[src/systems/worldZones.js](../src/systems/worldZones.js) — organic overlapping circular zones: Starter Drift, Red Teeth, Blue Glint, Scrap Wake, Dead Strip, Open Space fallback. `getZoneProfile(x, y)` blends nearby zones with smooth falloff.

### Resource Field / Asteroid Field / Life Field

`resourceField.js` — deterministic profiles from value noise + zone modifiers.
`asteroidField.js` — startup asteroid population from resource field samples.
`lifeField.js` — lifeforms anchored near asteroids, weighted by zone profile.

No chunk streaming yet. All entities are generated at startup and preserved.

### Processor And Cargo Hold

[src/systems/processor.js](../src/systems/processor.js) — small square-unit physics sandbox used for both processor (clickable, crushes into output) and cargo hold (stores for delivery). Collected pickups route through processor if installed, directly into cargo if not.

### Save Manager

[src/systems/saveManager.js](../src/systems/saveManager.js) — temporary browser-local playtest save in `localStorage`. Stores components, credits, debt, contracts, ship frame, journey mission pointer, cargo, world position. Not a durable account system. Save key may be bumped during architecture cleanup.

## Resource And Economy Flow

1. Bullets or ship impacts break resource rocks → small square pickups
2. Flying over pickups or tractor field → processor canvas
3. Click unit in processor → fuel / charges / scanergy / cargo
4. Cargo units stored in cargo hold
5. While docked: cargo sold for credits, hull repaired for credits

Current values: fuel cargo 15 cr, crystal cargo 75 cr, repair 2 cr/hull point, delivery contract 500 cr, red resource run 100 cr/unit.

## Current Boundaries And Next Steps

**Working well:**
- Ship power vs drift behavior
- Processor and cargo canvas separation
- Zone-biased asteroid and life spawning
- Mission beat system with beat-range considerations
- Component panels as ship hardware (non-hardware panels separated)
- Event ledger as the shared memory spine

**Active pressure points:**
- `game.js` is doing many jobs: simulation loop, collision, docking, particles, economy hooks, title cards, debug. Needs extraction passes.
- `main.js` is doing many browser jobs: DOM binding, HUD, economy UI, layout persistence, global event listeners. Needs extraction passes.
- `requiresCondition` is a JS function in some mission transitions — blocks JSON serialization needed for the mission designer backend. Needs a declarative replacement (e.g. `requiresPayloadField`).
- Cache-busted `?v=` import strings must be kept aligned manually when changing modules.
- Event ledger is in-memory only. Future profile saves should decide which stats and how much history persists.

**Near-term architecture priorities:**
- General document/authority framework replacing one-off legal systems
- Declarative condition replacements for `requiresCondition` in mission/contract rules
- Sub-beat sequences for NPC interactions (tow driver, patrol, repair)
- Contract and hub consideration systems (ambient chatter scoped to active contract or docked hub)
- Mission and contract designer backend (web form interface for authoring beats and contract terms)
