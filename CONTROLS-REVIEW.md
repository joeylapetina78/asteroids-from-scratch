# Ship Controls — Issue Report & Changes Made

Written for Codex review. The player is still experiencing control drift:
ship sometimes doesn't start turning exactly on key press, and sometimes
continues turning briefly after key release.

---

## Symptom

- Turning (A/D keys) occasionally starts 1–2 frames late
- Turning occasionally continues 1–2 frames after release
- Right-clicking in panorama mode previously caused the ship to keep doing
  whatever it was doing until the player left-clicked to re-focus
- The issue is subtle but consistent enough that the player can reproduce it
  reliably: hold A for an exact duration, repeat, observe drift

---

## Architecture Overview

Input is polled, not event-driven for ship physics.

```
keydown → pressedKeys.add(code)
keyup   → pressedKeys.delete(code)

requestAnimationFrame → frame() → update() → ship.update(deltaSeconds, input)
  → input.isDown("KeyA") → angle -= rotationSpeed * deltaSeconds
```

The maximum theoretical lag is one rAF interval (≤16.67ms at 60fps). Any
frame that takes longer than 16.67ms to execute pushes the next frame later,
extending the lag on both the start side (key press not yet seen) and the
stop side (keyup received but next frame is delayed).

Ship physics live in `src/entities/Ship.js` at `update(deltaSeconds, input)`.
Input polling lives in `src/systems/input.js`.
The frame loop lives in `src/game.js` at `frame(time)`.

---

## Changes Made This Session

### 1. `src/systems/input.js` — Focus-loss key clear

**Problem:** When the window lost keyboard focus (right-click context menu,
alt-tab, OS notification, clicking another application), the browser stopped
delivering `keyup` events. Keys held at that moment stayed "pressed" in
`pressedKeys` forever, causing the ship to keep thrusting or turning until
the player re-focused and pressed the key again.

**Fix added:**

```js
window.addEventListener("blur", () => {
  pressedKeys.clear();
  justPressedKeys.clear();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pressedKeys.clear();
    justPressedKeys.clear();
  }
});
```

`window.blur` covers: alt-tab, clicking another app, OS dialogs.
`visibilitychange` covers: switching browser tabs.

**What is NOT covered:** Keys held when the window re-gains focus are not
re-registered (the browser does not re-fire `keydown` for physically-held
keys on focus restore). This is correct — the player must re-press.

---

### 2. `src/game.js` — Context menu prevention (canvas → document)

**Problem:** Right-clicking the game canvas opened the browser context menu,
causing `window.blur` (fixed by change #1), but right-clicking any UI panel
also showed a context menu and could affect focus state.

**Fix:** Moved the `contextmenu` listener from `canvas` to `document`:

```js
document.addEventListener("contextmenu", (e) => e.preventDefault());
```

Previously only `canvas.addEventListener("contextmenu", ...)` was present.

---

### 3. `src/game.js` — `onLogicUpdate` throttled to 20/sec

**Problem:** `onLogicUpdate` (which calls contract manager, journey director,
comms director, and several mission/hub inspection systems) was called on
every single rAF frame. As the event ledger grows, these systems scan it
linearly — `getEventsAfterId` does `history.filter(e => e.id > lastId)` on
every call. In a long session this adds variable per-frame overhead (1–5ms+),
pushing frames past the 16.67ms rAF budget and delaying the next input poll.

Ship physics, HUD, and rendering are not affected — they still run every frame.

**Fix:**

```js
// In constructor:
this.logicAccumulator = 0;

// In frame():
this.logicAccumulator += deltaSeconds;

try {
  this.update(deltaSeconds);          // ship physics, every frame
  if (this.logicAccumulator >= 0.05) {
    this.onLogicUpdate(this.state);   // mission/contract systems, ~20/sec
    this.logicAccumulator = 0;
  }
  ...
}
```

`0.05` = 50ms interval = 20 calls/sec. Mission events, contract completions,
and NPC dialogue respond within 50ms of the triggering event — imperceptible
in practice.

---

## What Is Still Happening

After the above fixes, the player reports the issue is "not as much" but still
present. The remaining drift is likely:

### A. Inherent rAF polling latency (irreducible with current architecture)

Because ship controls are polled (not event-driven), there is always up to
one rAF frame of lag on both key-press start and key-release stop. At a steady
60fps this is ≤16.67ms. At the exact moment a key is released, the ship turns
for up to one more frame before the poll catches it.

This is not a bug — it is the fundamental property of a polling input system
in a browser rAF loop. The player is sensitive enough to notice it.

**To fully eliminate this:** ship angle changes would need to be driven directly
by `keydown`/`keyup` events rather than polled each frame. This is a
significant architectural change — the physics tick and the event system are
currently decoupled by design (events fire asynchronously, deltaSeconds-based
physics requires a known time step).

### B. Frame time variance from rendering and physics

Even with `onLogicUpdate` throttled, some frames take longer than others due to:
- Variable asteroid/particle counts in the draw loop
- Canvas 2D radial gradient generation for zone backgrounds (per-zone, per-frame)
- GC pressure from short-lived objects (vectors, arrays) created each frame
- `onHudChange` still fires every frame that fuel or scanergy changes, triggering
  `updateHudDisplay()` which does DOM manipulation

Any frame over 16.67ms directly extends the input polling gap.

### C. `clearGameKeys()` skips `KeyE`

`clearGameKeys()` (called when engine is unpowered or ship destroyed) deliberately
skips clearing `KeyE`. This is existing behavior. Does not affect turning.

---

## Files Changed

| File | Change |
|------|--------|
| `src/systems/input.js` | Added `window.blur` and `visibilitychange` handlers to clear key state on focus loss |
| `src/game.js` | Moved `contextmenu` listener from canvas to document; throttled `onLogicUpdate` to 20/sec with `logicAccumulator` |

---

---

## Update: Root Cause Identified (Panorama-Specific)

The player confirmed controls feel fine in **standard viewport mode** — the
issue only manifests in **panorama (fullscreen) mode**. This pointed directly
at rendering cost differences between the two modes.

### `backdrop-filter: blur()` was the culprit

Three CSS rules applied `backdrop-filter` exclusively under
`body.is-viewport-fullscreen`:

```css
body.is-viewport-fullscreen .hud .component-panel {
  backdrop-filter: blur(2px);   /* applied to hull, engine, docking, miner, collector */
}
body.is-viewport-fullscreen .component-stack .processor-panel,
body.is-viewport-fullscreen .component-stack .cargo-panel {
  backdrop-filter: blur(2px);
}
/* HUD overlay bar */
  backdrop-filter: blur(4px);
```

`backdrop-filter: blur()` is one of the most GPU-expensive CSS properties:
it forces each element onto its own compositing layer, samples all pixels
behind it, applies a Gaussian blur, and composites the result — every frame.
With 7+ transparent panels over a fullscreen canvas (potentially 4× the pixel
area of standard mode), this easily pushes frames past the 16.67ms rAF budget,
causing input polling to slip by one or more frames.

With the player's alpha set to 0 (fully transparent panels), the blur is still
computed in full — transparent does not mean free.

**Fix:** All three `backdrop-filter` declarations removed from `src/styles.css`.
Panels are still transparent/semi-transparent; they just don't blur what's
behind them.

---

## Suggested Next Investigation Areas for Codex

1. **Event-driven turning**: Instead of (or in addition to) polling `isDown`,
   directly apply angular velocity changes in `keydown`/`keyup` handlers. Would
   eliminate the rAF polling lag entirely for turning start/stop.

2. **Frame time profiling**: Use `performance.now()` before/after `update()`,
   `onLogicUpdate()`, and `draw()` to find which phase is causing the longest
   frames during pure turning in open space.

3. **`getEventsAfterId` optimization**: Replace the linear `history.filter`
   scan with a binary search or indexed lookup since event IDs are monotonically
   increasing. This would make `onLogicUpdate` O(log n) instead of O(n) even
   if the throttle is removed.

4. **Zone background rendering**: `drawZoneBackgrounds` reportedly creates
   radial gradients per zone per frame. Pre-computing or caching these could
   shave significant draw time.

5. **Input capture / Pointer Lock API**: For the panorama view specifically,
   `canvas.requestPointerLock()` would give the game exclusive pointer and
   keyboard ownership, completely preventing any focus-steal issues.
