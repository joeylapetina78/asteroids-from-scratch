# The panel mounting standard

The cockpit grid governs **fit**, never **face**.

Ship parts are built by different companies with their own product lines, house
styles and opinions about how loudly to put their name on a thing. That variety
is the point of the cockpit and the grid is not allowed to flatten it. What the
grid does is guarantee that a Rook condition strip and a Vektor fuel gauge, built
by two firms that have never spoken, drop into the same bay and line up.

## Why the standard exists in the fiction

Ships get refitted and parts get swapped between hulls. A panel that does not fit
a standard bay does not sell. So every manufacturer builds to the same footprint
and the same increments, and then competes on everything else — which is exactly
how 19-inch racks, DIN rail and drive bays produced *more* visual variety, not
less.

## Why it matters perceptually

Chaos needs a constant to read as chaos. Before this, dimensions *and* styles
both varied, so a difference between two panels read as an accident: HULL drew
twelve 15.1px meter cells and ENGINE sixteen 10.6px ones, which is the same
component at two incompatible scales, not two companies with different opinions.
With the footprint fixed, the same difference reads as character — a blunt
commodity part and a precision instrument, legibly.

## Structural — the bay. A brand may not override these.

Defined as custom properties on `.space-panel` in `styles.css`.

| Token | Value | Meaning |
|---|---|---|
| `--u` | 4px | the atom |
| `--minor` | 12px | minor grid: controls, meter cells, baselines |
| `--grid-major` | 24px | columns and rows; where panels land |
| `--panel-flange` | 4px | padding/border; hangs OUTSIDE the grid as bleed |
| `--panel-content-full` | 216px | 9 columns |
| `--panel-content-half` | 96px | 4 columns; `96 + 24 gutter + 96 = 216` |
| `--panel-width-full` | 224px | content + two flanges |
| `--panel-width-half` | 104px | |
| `--meter-pitch` | 12/24/36px | fixed stride, set from the maker's grain |
| `--control-h` | 36px | default; the ladder is 12/24/36/48/60/72 |
| `--control-h-lg` | 60px | the panic target — functional, so structural |
| `--control-h-primary` | 36px | an instrument's main switch, whoever built it |
| `--type-*` | 8/10/12/16px | the whole type scale |

Three rules cover everything else:

1. **Every dimension is a multiple of `--minor`** (or `--u` for fine detail).
2. **The snap targets the CONTENT box, not the border box.** The flange is bleed.
   `COCKPIT_PANEL_FLANGE` in `cockpitSnap.js` must match `--panel-flange`.
3. **The minor grid is exactly half the major one.** This is load-bearing — see
   below.

## Why the minor grid is 12 and not 8

Panels lock to lines **and to the midpoints between them**, so the player can
offset an instrument by half a column when they want to. `COCKPIT_SNAP_STRIDE`
is therefore `COCKPIT_RECT_GRID / 2`.

A panel parked on a midpoint shifts its whole interior by half a column. If the
interior rhythm were 8px, every meter cell, control edge and baseline inside it
would come off the lattice the moment the player used that freedom — and the
misalignment would appear *only* on panels they chose to offset, so it would read
as their mistake rather than the system's. Making the minor grid exactly half the
major one means any legal placement, line or midpoint, keeps the interior on a
drawn line.

The cost was re-quantizing the control ladder from 8s to 12s, which is why Rook
switches are 36 and Vektor's are 24. `tests/panelMakers.test.mjs` asserts the
half relationship directly, because breaking it would silently reintroduce the
whole class of bug.

## Expressive — the face. This is the manufacturer's.

Accent colour, typeface, weight, tracking, label placement, whether they brand it
at all, bezel and wear treatment, internal composition, control height, meter
grain and cell shape.

Control height and meter grain arrive as custom properties from
`content/ships/panelMakers.js` rather than being written in CSS, so a maker
cannot accidentally choose an off-grid value. `tests/panelMakers.test.mjs`
asserts that every grain tiles 216px exactly and every control height is a
multiple of the minor grid.

Identity lives in `[data-brand="…"]` blocks. `main.js` stamps the attribute from
`getPanelMakerId()`. The **engine** panel is the exception that proves the model:
its maker is whoever built the drive currently fitted, so it is re-stamped in
`updateCockpitDisplay()` when the drive is swapped.

Makers so far: `rook` (cheap, legible, wide tracking, coarse 9-cell meters,
chunky 36px switches), `vektor` (precision, tight type, amber maker's mark,
18-cell meters, low-profile 24px controls), `generic` (unsigned salvage-market
fitment).

Vektor's low profile shapes its SECONDARY controls. The one control that turns
an instrument on is not a stylistic choice: `--control-h-primary` is structural,
so the engine's power switch is the same size as the hull's dock button whoever
built the drive.

## The guide draws what the snap does

`getCockpitScope()` is the single definition of the scope centre, radius and ring
pitch; `main.js` publishes it to CSS as `--cockpit-scope-size` and
`--cockpit-ring-step`. These used to disagree — the stylesheet drew a fixed 65px
ring period and sized the scope from `min(100vw, 100vh)` anchored at `top: 0`,
while the maths used `max(48, radius / 7)` around the desk centre. On a 1000×640
desk the player was aiming at rings 48px apart under a guide showing them 65px
apart.

The guide is drawn at two weights: major 24px for panel placement, minor 12px for
controls. Every second minor line is a major line, so a small control aligned to
one and a panel aligned to the other can never disagree — and neither can a panel
parked on a midpoint.

## Placement paths that must stay on the grid

There are three, and all three had to be fixed:

- **Dragging** — `snapCockpitPanel()`, content-box snapped.
- **First open** — `snapCockpitPanelToBay()`. The default slot came from the tray
  edge plus a free-slot search, so a never-dragged panel used to sit 16px off the
  lattice with its meters and labels off every column. This deliberately skips
  the radial branch, or the overlap search it came from would be undone.
- **Clamping** — `ceilToColumn()` / `floorToColumn()`. A bound is a raw pixel
  limit, so a correctly snapped panel could still be clamped off-grid at an edge.
  Floors round up and ceilings round down, so quantizing a bound never pushes a
  panel back outside it.

## Where an arrangement lives

There is one physical cockpit, so there is one arrangement. It is not a property
of a save or of a game mode — it is where this person likes their hands to fall.

`asteroids.cockpitDefault.v1` holds it, and `persistCockpitDefault()` writes it
the moment anything moves: a drag finishing, an instrument switched on or off,
the bay opening, the phosphor colour, the viewport mode. There is no "save my
layout" button, because being asked to press one is how an arrangement gets lost.

Two consequences worth stating plainly:

- **`?resetSave=1` does not clear it.** Starting a fresh run throws away the
  world, the money and the ship. It does not rearrange the furniture.
- **It is read in every mode**, saved or fresh, Explorer or Campaign. It used to
  be consulted only when there was no profile, so a continued save carried its
  own private copy of the desk and the two drifted apart.

### Position is shared. Being switched on is not.

WHERE an instrument sits is the player's arrangement, and belongs to every run.
WHETHER it is switched on is a fact about *this ship*, and does not.

Restoring both from the shared store meant a fresh Campaign booted with an
engine, a beacon locator, a tractor field and a scanner already humming — none
of which the pilot had been given yet — purely because a previous Explorer run
had left them on. So the stored open list is filtered by what the ship actually
has (`state.ui.panels[id].available`), while positions restore unconditionally.
The first time the player switches the tractor field on in Campaign, it appears
exactly where they keep it.

Two ordering facts make this work, and both cost a wrong first attempt:

- The filter **cannot run during `setupCockpitLayout()`**. Nothing is fitted yet
  in any mode at that point — `applyDevStart` and `revealInstalledComponents`
  both run afterwards — so gating there emptied every start, Explorer included.
  `restoreOpenCockpitInstruments()` is called once fitment has settled.
- Instruments filtered out are **held, not dropped** (`suppressedOpenModules`),
  and written back by `persistCockpitDefault`. Otherwise a single Campaign run
  would erase the Explorer desk's open set on its way past. An explicit toggle
  releases the hold, because that is the player making a real decision.

### The one exception

Campaign's induction has Rook ask the player to switch the hull readout on and
drag it clear of the bay. That only teaches anything if the hull actually starts
beside the bay, so campaign racks it — and a stored position would otherwise have
it already parked on the far side, satisfying the lesson before it was given.

The suppression is staging for one run and must never reach the store:
`campaignHullFallback` holds the player's real hull position and
`persistCockpitDefault()` writes it back until the player moves the hull
themselves, at which point their placement wins. Without that, starting a
campaign silently wiped a hull carefully parked in Explorer.

Note that this branch reads `initialDevStart`, not `state._devStartId`. The
latter is only assigned this early for free-play starts, so it is `undefined` at
cockpit-setup time in the one mode the branch exists for.

## How an instrument is handled

**The module bay is the on/off switch, at both ends.** Click an instrument in
the rack to bring it out; click its launcher — left behind in the rack while it
is out — to stow it. A floating panel does not close when clicked.

That last part is not squeamishness. Once the whole panel became a drag surface,
"click it" and "start to move it" are the same gesture, and a hand that slipped
would put an instrument away mid-flight.

**Everything on a floating instrument that is not a control is somewhere to pick
it up by.** Drag listeners live on the panel, not on its title bar, and bail
only when the pointer went down on something in `CONTROL_SELECTOR`.

This is what frees a panel from having to carry a heading. The engine's only
visible title was its maker's plate; moving that plate under the switch left the
title bar zero pixels tall, which — while the title was the handle — meant an
instrument that could not be picked up at all. With the whole panel live, the
engine can be as stripped as its design wants: one switch, one plate, one gauge.

The title's `role="button"` and `tabindex` move with the job. Racked, the title
is the control that brings the instrument out. Floating, it is just a label, and
the attributes are removed so it stops announcing itself as a button.

> **Trap:** `CONTROL_SELECTOR` includes `[role='button']`, and the racked title
> carries that role itself. A bare `closest(CONTROL_SELECTOR)` check inside the
> title's own click handler therefore matches the element the handler is on, and
> silently swallows every attempt to bring an instrument out of the bay. The
> guard has to exclude the title itself.

## Campaign staging, and what a dead chamber looks like

Two more things Campaign stages for one run without touching the shared desk.

**The bay starts shut.** The induction's first instruction is to open the module
bay, and a bay left open in Explorer answers that instruction before it is given.
Held in `campaignTrayWasOpen` and written back by `persistCockpitDefault`, so the
staging never reaches the store; opening the bay by hand spends it.

**The processor starts dead**, and now looks it. `CAMPAIGN_BROKEN_COMPONENT_IDS`
has always put the skiff's processor at `stage: "failed"`, but the only visible
sign was an amber flag on a bay row the player has to open the bay to see. A
chamber is the size of a wall, so a dead one now reads from across the cockpit:
hazard paint over the bay, the painted designation gone to rust, and the fault
stencilled under the name at wall scale.

Everything in that treatment is deliberately faint. Ore drifts across this wall
and the ore has to win — a bay you cannot read material against is worse than
one that does not announce its fault loudly enough.

> **Two gotchas.** Chambers are permanently `is-cockpit-expanded`, and that state
> hides `.cockpit-module-summary` with `!important`; the dead-chamber rule has to
> say `display: block !important` to paint the fault line. And the chamber is
> `display: none` at the very start of Campaign — it is revealed during the
> induction — so the treatment cannot be judged at t=0; force the fault in
> Explorer to iterate on it.
