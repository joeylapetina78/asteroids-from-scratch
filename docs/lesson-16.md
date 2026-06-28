# Lesson 16: Journey and starter ship

The game now starts with a small story prologue instead of dropping the player directly into every panel.

The first visible component is Journey. It acts like a radio/story panel, not a debug log. It shows the current speaker line, mission title, objective, and one action button. After the player acknowledges a line with `Okay`, the old text clears but the message area keeps its height so the interface does not jump around.

The opening sequence is:

1. The Galaxy welcomes the player.
2. Rook starts Chapter 1, `Starting Out`.
3. The first mission is `The Interview`.
4. Rook activates the Viewport.
5. Rook explains that panels can be dragged by their titles.
6. Rook activates the Engine.
7. The first real thrust event unlocks the Scanner prompt.
8. Yard Exchange entering view or becoming nearby unlocks the Docking prompt.

Panel layering now has a rule:

- Journey is always on top.
- Newly granted components appear above older components.
- Normal components stay below Journey.

The starter ship also split into two concepts:

- `state.ship` describes the ship frame and shape.
- `state.components.engine` controls motion tuning and thrust visuals.

This lets a future ship upgrade change the body shape and panel capacity, while a future engine upgrade changes speed, thrust, fuel burn, turn rate, or exhaust style. The current `yard-skiff` is intentionally slow and ugly compared with the old fast dart shape.
