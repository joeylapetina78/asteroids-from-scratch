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
- `docs/authority-model.md` is the Place / Actor / Power / Right / Action authority model.

## Important Invariants

- Mission scripts should introduce systems; they should not be the only place a system works.
- Contracts should use shared contract/payment/document systems, not one-off mission payouts.
- Documents, accounts, obligations, registrations, titles, and licenses should be records and relationships.
- Authority questions should use Place / Actor / Power / Right / Action. Prefer `canActorDoAction()` over adding player-only flags.
- Hubs, patrols, NPCs, and the player should inspect or present paperwork through the same authority/document systems.
- `state.components` is ship hardware. UI panels are not ship hardware.
- The viewport should keep drawing even if a subsystem throws; `game.js` logs frame errors and keeps the loop alive.

## World Generation Direction

World generation is layered:

1. System profile: large frontier identity, mostly future/lore for now.
2. Region profile: ecology, resource families, economy, factions, organizations, contracts, patrol pressure, mystery.
3. Zone profile: immediate navigation experience, such as open drift, dense maze, needle field, giant boulders, rubble cloud, or debris stream.
4. Resource profile: material likelihood and local concentration.
5. Terrain profile: chunk-level asteroid placement, clustering, size, drift, tunnels, and flight feel.
6. Danger/civilization profiles: hunters, patrol risk, hubs, mines, haulers, demand, contracts later.

`docs/world-structure.md` is the current world-generation north star. It separates Region from Zone: regions are economic/ecological identity, zones are navigation promises. Current code still mixes those ideas in `src/systems/worldZones.js`; split carefully over time.

`src/systems/worldTerrain.js` is the first terrain layer. It chooses chunk archetypes such as open drift, cluster pocket, stone wall, debris stream, giant garden, and sparse dead. `src/systems/asteroidField.js` uses that terrain to place rocks differently without replacing the resource system.

## Token-Saving Workflow

For most future requests, start by reading only:

1. This file.
2. The one system/content file named by the request.
3. `docs/project-map.md` only if broader context is needed.

Avoid rereading all of `main.js` and `game.js` unless the task crosses UI/simulation boundaries.

After browser-facing JS/CSS/HTML edits, run `npm run bump:cache` before testing or pushing. The project uses module query strings heavily, and stale browser modules can make fixed code look broken.

When a new reusable system is added or an ownership boundary changes, update this file and `docs/project-map.md` in the same pass. The docs are part of the tooling now, not a separate chore.
