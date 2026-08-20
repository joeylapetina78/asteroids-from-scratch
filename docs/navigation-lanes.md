# Navigation lanes and waypoint capture

How a craft aims at its next waypoint, why that can strand it, and the
invariant that now prevents it.

## Berth lanes and waypoint capture (2026-08-19)

A hub-sponsored hauler stopped for good, and nothing noticed for an entire
session. Recorded here because the failure is a whole class, not one ship.

### What happened

`Blue Lantern Cartage 1` drew a **225-unit berth lane** against NpcShip's
**150-unit `WAYPOINT_RADIUS`**. A craft steers at an aim point displaced
sideways from its waypoint, and arrival is measured against that same aim point.
On a corridor bend it settled into a steering equilibrium 163 units out: close
enough to keep steering at, never close enough to register arrival.

```text
routeIndex 13, frozen 100+ seconds     target: corridor-yard-ledge:1
aim point offset 225 → (981, -147)     ship (978, -310)   distance 163
WAYPOINT_RADIUS 150                    nearest hub: yard-exchange @ 612
```

`routeIndex` stopped advancing, so the craft hovered outside Yard Exchange
holding `SHIP-0001` — the first shipment that world ever created — while the
rest of the fleet cycled through eight. Changing only `laneOffset` 225 → 140
restarted it immediately (index 13 → 16, speed 86).

Deterministic, and always the same NPC: see the fleet-floor note below — index 1
is always Blue Lantern, and `berthBands[101 % 6]` was always ±225.

### The invariant

**No lane offset may exceed the arrival radius.** Otherwise a craft sitting
exactly on its waypoint is still "not there", and there exists a road it can
drive perfectly and never be recorded as having travelled. `laneOffsetFor()`
clamps to `MAX_BERTH_LANE_OFFSET` (141), and harder — `CORRIDOR_LANE_LIMIT`
(60) — at corridor waypoints, which are ~80-unit gates rather than berths.
Berth bands are now all within ±140.

### The watchdog, and the wrong version of it

A stall now raises a `navigation-stalled` blocker. **The signal is closing
distance, not waypoint count** — and getting that wrong is instructive.

The first version watched whether `routeIndex` advanced, which looks right and
is wrong: a market circuit to an outer hub is a single leg tens of thousands of
units long, and a craft crossing it at full speed goes minutes without clearing
anything. That version immediately flagged a healthy hauler at full speed on a
legitimate ~30,000-unit haul to Coldwater Depot.

What a stalled craft cannot do is *get closer*. The watchdog tracks the best
distance-to-waypoint achieved since the target last changed: a craft under way
keeps beating its own record; one circling a point it cannot capture stops
improving. Quiet on long legs, exact on deadlocks.

Covered by `tests/navigationLanes.test.mjs`, including the long-haul false
positive and a guarantee that standing on a waypoint always registers arrival.

### Why it was always the same NPC

`REGIONAL_HAULER_FLOOR` is 8 and the world is authored with 3 carriers, so the
`belowFloor` branch of the hub-capacity planner commissions ~5 sponsored haulers
on the **first tick of every world**, bypassing the 60-second unserved gate the
rest of that function is built around. Hubs are sorted by unserved need then
treasury, Blue Lantern sorts first, so index 1 is always `Blue Lantern Cartage
1` and always drew `berthBands[(100 + 1) % 6]`.

When a bug reproduces "every run, same named NPC", suspect that generator before
suspecting a save. The 60-second gate is close to dead code in practice — the
floor is reached before it can apply, which is worth revisiting on its own.
