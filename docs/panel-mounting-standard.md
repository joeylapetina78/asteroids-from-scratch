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
| `--u2` | 8px | minor grid: controls, meter cells, baselines |
| `--grid-major` | 24px | columns and rows; where panels land |
| `--panel-flange` | 4px | padding/border; hangs OUTSIDE the grid as bleed |
| `--panel-content-full` | 216px | 9 columns |
| `--panel-content-half` | 96px | 4 columns; `96 + 24 gutter + 96 = 216` |
| `--panel-width-full` | 224px | content + two flanges |
| `--panel-width-half` | 104px | |
| `--meter-pitch` | 8/12/24px | fixed stride, set from the maker's grain |
| `--type-*` | 8/10/12/16px | the whole type scale |

Two rules cover everything else:

1. **Every dimension is a multiple of `--u2`** (or `--u` for fine detail).
2. **The snap targets the CONTENT box, not the border box.** The flange is bleed.
   `COCKPIT_PANEL_FLANGE` in `cockpitSnap.js` must match `--panel-flange`.

## Expressive — the face. This is the manufacturer's.

Accent colour, typeface, weight, tracking, label placement, whether they brand it
at all, bezel and wear treatment, internal composition, control height, meter
grain and cell shape.

Control height and meter grain arrive as custom properties from
`content/ships/panelMakers.js` rather than being written in CSS, so a maker
cannot accidentally choose an off-grid value. `tests/panelMakers.test.mjs`
asserts that every grain tiles 216px exactly and every control height is a
multiple of 8.

Identity lives in `[data-brand="…"]` blocks. `main.js` stamps the attribute from
`getPanelMakerId()`. The **engine** panel is the exception that proves the model:
its maker is whoever built the drive currently fitted, so it is re-stamped in
`updateCockpitDisplay()` when the drive is swapped.

Makers so far: `rook` (cheap, legible, wide tracking, coarse 9-cell meters),
`vektor` (precision, tight type, amber maker's mark, fine 18-cell meters),
`generic` (unsigned salvage-market fitment).

## The guide draws what the snap does

`getCockpitScope()` is the single definition of the scope centre, radius and ring
pitch; `main.js` publishes it to CSS as `--cockpit-scope-size` and
`--cockpit-ring-step`. These used to disagree — the stylesheet drew a fixed 65px
ring period and sized the scope from `min(100vw, 100vh)` anchored at `top: 0`,
while the maths used `max(48, radius / 7)` around the desk centre. On a 1000×640
desk the player was aiming at rings 48px apart under a guide showing them 65px
apart.

The guide is drawn at two weights: major 24px for panel placement, minor 8px for
controls. Every third minor line is a major line, so a small control aligned to
one and a panel aligned to the other can never disagree.

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
