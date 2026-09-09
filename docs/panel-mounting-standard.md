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

Vektor's low profile is why the engine's power switch sits flatter than the
hull's dock button. That is the house style, not a one-off exception — fit a Rook
drive and the same panel's switch gets taller.

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
