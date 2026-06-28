# Lesson 16: Journey and starter ship

The game now starts with a small story prologue instead of dropping the player directly into every panel.

The first visible component is Journey. It acts like a radio/story panel, not a debug log. It shows the current speaker line, mission title, objective, and one action button. NPC lines type in word by word to make new speech feel intentional. After the player acknowledges a line with `Okay`, the old text clears but the message area keeps its height so the interface does not jump around.

The opening sequence is:

1. The Galaxy welcomes the player.
2. Rook starts Chapter 1, `Starting Out`.
3. The first mission is `The Interview`.
4. Rook activates the Hull and points out ship integrity.
5. Rook asks the player to drag both the Journey and Hull panels.
6. Rook activates the Viewport.
7. Rook activates the Scanner and asks for one scan.
8. Rook activates the Engine.
9. Powering the engine advances the mission to movement.
10. The first real thrust event confirms the ship is underway.
11. Yard Exchange entering view or becoming nearby unlocks the Docking prompt.

The Hull now also displays a starter VIN plate. For now this is a state-backed readout on the Hull component, but it is meant to become a real gameplay identity hook for docking, scans, permits, and later suspicious ship-paperwork tricks.

The Scanner lesson is now optional in practice. If a player flies straight to Yard Exchange before pressing `Okay` on the Scanner prompt, the mission keeps listening and advances to Docking. The starter scanner is also target-limited to sites, so the first scan teaches "find the hub" instead of mixing in resource hunting too early.

Panel layering now has a rule:

- Journey is always on top.
- Newly granted components appear above older components.
- Normal components stay below Journey.

The starter ship also split into two concepts:

- `state.ship` describes the ship frame and shape.
- `state.components.engine` controls motion tuning and thrust visuals.

This lets a future ship upgrade change the body shape and panel capacity, while a future engine upgrade changes speed, thrust, fuel burn, turn rate, or exhaust style. The current `yard-skiff` is intentionally slow and ugly compared with the old fast dart shape.

After the first pass, the hardcoded Journey logic was split into a top-level Journey Director, a Mission Runner, and an authored mission data file. The mission data now owns ordered steps, objective text, optional help text, event transitions, considerations, and actions like showing a component or saying a line.

This is not pure JSON yet. It is JavaScript data shaped like future JSON, which gives the project room to discover the mission format before building an editor or content pipeline.

Mission rules can now require multiple flags. The first use is panel-drag training: hidden `component.dragged` events set separate flags for Journey and Hull, and the mission advances only after both have moved.
