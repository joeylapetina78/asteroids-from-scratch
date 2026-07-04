# Agent Map

This is the short re-entry map for future coding passes. Read this before broad code archaeology.

## Current North Star

Asteroids RPG is a world-centric institutional space sim. The player controls one person in that world. Avoid player-only magic. If a rule could apply to an NPC, company, ship, hub, patrol, or document, put it in a reusable system and have the player use that system too.

## Fast Orientation

- `src/main.js` is browser/page coordination: DOM, panels, HUD, buttons, drag/drop, UI reactions.
- `src/game.js` is simulation: ship, camera, chunks, asteroids, life, NPC ships, patrols, towing, collisions, drawing.
- `src/state/gameState.js` is the starting state shape.
- `src/content/**` is authored content: missions, contracts, hubs, NPCs, ships.
- `src/systems/**` is reusable game logic. Prefer adding logic here instead of burying it in mission scripts or DOM handlers.
- `docs/project-map.md` is the deeper map.
- `docs/systems-direction.md` is the philosophy and architecture direction.

## Important Invariants

- Mission scripts should introduce systems; they should not be the only place a system works.
- Contracts should use shared contract/payment/document systems, not one-off mission payouts.
- Documents, accounts, obligations, registrations, titles, and licenses should be records and relationships.
- Hubs, patrols, NPCs, and the player should inspect or present paperwork through the same authority/document systems.
- `state.components` is ship hardware. UI panels are not ship hardware.
- The viewport should keep drawing even if a subsystem throws; `game.js` logs frame errors and keeps the loop alive.

## World Generation Direction

World generation is layered:

1. Zone profile: authored organic region influence.
2. Resource profile: material likelihood.
3. Terrain profile: flight feel and rock layout.
4. Danger profile: hunters, patrol risk, strange life.
5. Civilization profile: hubs, mines, haulers, demand, contracts later.

`src/systems/worldTerrain.js` is the first terrain layer. It chooses chunk archetypes such as open drift, cluster pocket, stone wall, debris stream, giant garden, and sparse dead. `src/systems/asteroidField.js` uses that terrain to place rocks differently without replacing the resource system.

## Token-Saving Workflow

For most future requests, start by reading only:

1. This file.
2. The one system/content file named by the request.
3. `docs/project-map.md` only if broader context is needed.

Avoid rereading all of `main.js` and `game.js` unless the task crosses UI/simulation boundaries.

After browser-facing JS/CSS/HTML edits, run `npm run bump:cache` before testing or pushing. The project uses module query strings heavily, and stale browser modules can make fixed code look broken.

When a new reusable system is added or an ownership boundary changes, update this file and `docs/project-map.md` in the same pass. The docs are part of the tooling now, not a separate chore.
