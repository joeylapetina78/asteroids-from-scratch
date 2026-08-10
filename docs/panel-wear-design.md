# Panel wear & failure design

How every ship panel should degrade and fail. This is the failure blueprint that
sits on top of the shared panel-condition machine already in the codebase.

## The golden rule

**A failing panel must look intentionally broken *in-universe*, never like the game
itself is malfunctioning.** No silently deleted data, no UI elements that just
vanish. Every failure has *visible* symptoms: bad readings, warning states,
mechanical sounds, intermittent behavior, obviously-wrong output.

And wherever possible, **a damaged panel should create interesting gameplay, not
just switch a feature off.** A mining laser that shoots slightly crooked, a tractor
field that swirls cargo, docking gear that catches on the fourth try — all better
than a red "SYSTEM DISABLED".

## What this builds on (don't reinvent it)

`src/systems/panelMaintenance.js` is the shared, panel-agnostic machine:

- Stages `healthy → degraded → emergency → failed` (`PANEL_STAGES`).
- `accumulatePanelWear(condition, wearDelta, thresholds)` — use-driven wear, a
  deferred-maintenance multiplier (running worn accelerates wear), permanent
  `lifetimeDegradation` that lowers the recoverable ceiling, and a stage-change
  signal to react to.
- `repairPanelCondition(condition)` — the ONE service seam every repairer funnels
  through (dock repair now, material-based SPRC service later).
- `ensurePanelCondition(component)` — migration-tolerant; safe on old saves.

**The engine is the first and only wired panel** (`src/systems/engineCondition.js`
+ handlers in `game.js`). It IS the reference implementation — its structure is the
template every panel below should copy. See [[project-survival-loop-design]] for
the engine build.

### What wiring a new panel takes (the engine's shape)

1. A per-panel config module like `engineCondition.js`: `thresholds`
   `{ degraded, emergency, failed }`, per-**wear-source** rates (the inputs that
   wear THIS panel — firing, scanning, field-use, docking, travel…), and per-stage
   effect values.
2. `game.js`: apply the stage's effects around the panel's action, accrue wear on
   the real work it does, and fire a stage-change handler (fault banner + mechanical
   audio + the gameplay symptom).
3. `main.js`: HUD symptoms — warning glow, status text, degraded readouts.
4. `gameState.js` seed `condition` + `saveManager` calls `ensurePanelCondition` on
   load.
5. Repair through the shared seam only.

## The general progression (template for every panel)

- **Early wear** — reduced efficiency: smaller range, slower operation, higher
  energy use, slight inaccuracies.
- **Moderate wear** — intermittent operation, retries, drift, partial capability
  loss; strange but understandable behavior.
- **Severe wear** — major limitations that force the player to compensate manually
  or change how they play.
- **Critical failure** — the panel can no longer do its primary job, or begins
  creating *secondary* problems (cargo loss, life-support drain, damaged equipment,
  stranding). If a panel can hard-fail at something essential (docking), there MUST
  be an emergency alternative (see below).

## Per-panel failure ladders

### Engine — BUILT
The existing engine wear system is sufficient for now: progressive thrust loss,
sputtering/misfire, intermittent failure, eventual shutdown → the stranded/tow
path. It is the baseline model for everything else.

### Mining Laser — BUILT 2026-08-09 (second panel; proves the machine is shared)
Charges slower → more energy per shot → fires intermittently / occasionally fails
to fire → beam unstable → **aim drifts off the reticle** (compensate with "Kentucky
windage"). Drift worsens *gradually* rather than snapping to random. Severe: large
misalignment, sputtering. Deliberately NOT zeroed at Failed — a dead laser is just
"OFF"; a failing one that mostly sputters and drifts badly still barely cuts rock,
which is the more interesting state.

Implemented in `src/systems/minerCondition.js` (sibling to `engineCondition.js`) +
handlers in `game.js` (`applyMinerConditionEffects` slow aim-swing, `updateShooting`
misfire/heavier-charge/slower-rate/drift, `accrueMinerWear` per shot,
`onMinerPanelStageChanged`, `serviceMinerPanel`, `debugSetMinerPanelStage`). Wears
from **firing** (not thrust) — the different wear input is what proves the shared
machine. Wired into the **Observatory Wear Lab** with live stage controls and an
effects-by-level table, exactly like the engine. `playMinerFault` is the sputter
sound. Repairs through the shared seam (dock repair now). Tests:
`tests/minerCondition.test.mjs`.

### Scanner
Loses fidelity *progressively* rather than switching off. May lose shape info but
keep colors, or lose color but keep shapes; can degrade to monochrome. Resolution/
range shrink; certain resource/object families stop appearing; individual contacts
flicker. Severe: intermittent scanning, very incomplete results. **Missing info must
read as scanner degradation, never as world entities mysteriously vanishing.**

### Collector / Tractor Field — BUILT 2026-08-09 (third panel)
Effective radius shrinks → strength weakens → field cuts in and out → objects wobble
or **orbit instead of coming in** → severe: field may occasionally *push objects
away*. Never fully OFF at Failed — it still grips weakly between flickers.

Implemented in `src/systems/collectorCondition.js` + `game.js`: `getCollectorRadius`
scales by `radiusScale` (so the drawn ring shrinks too, not just the grab range);
`updateCollector` applies `strengthScale`, a grip-flicker `dropoutChance`, a
tangential `swirl` force, and a Failed-only `pushChance` pulse that reverses the
pull; wear accrues per second the field is held active (`accrueCollectorWear`).
`onCollectorPanelStageChanged` / `serviceCollectorPanel` / `debugSetCollectorPanelStage`,
`playCollectorFault` audio, Wear Lab entry with live controls + effects table.
Tests: `tests/collectorCondition.test.mjs`.

### Tow Cable
Deploy slower → occasionally fails to deploy → needs multiple attempts to latch →
reel slower / intermittently stops → may deploy but fail to retract → connection
less stable, releases under stress → severe: rising chance the cable **snaps** →
end-stage: tow system unusable until repaired.

### Beacon Bay
"Ka-chunk"/misfire on deploy → needs multiple attempts to release → sometimes fails
to pick a beacon back up → pickup/deploy slower and unreliable → severe: can damage
a beacon during handling → worst case: **destroys or loses a beacon**.

### Beacon Locator
Direction indicator drifts or spins → points slightly off true → increasingly
inaccurate → intermittently loses lock then reacquires. Individual stored beacon
entries can become "**corrupted**" but must **stay visibly listed** — a corrupted
entry spins, flickers, shows the wrong color, an error state, or points wrong,
rather than disappearing. Severe: several entries corrupt at once.

### Docking Gear
Clamp unreliable → mechanism engages/revs without locking → several attempts before
it catches → docking takes longer → may partially connect then release → severe:
prevents normal docking. **Hard-fail needs an emergency alternative** — contact the
hub and have station equipment capture/tow the ship into berth (reuse the tow flow).

### Cargo Hold
Minor: reduced usable capacity → severe: occasional cargo loss while maneuvering →
end-stage: an actual **breach** — cargo physically falls out while flying and must
be re-collected or left behind.

### Hull
Cosmetic/structural warning states → reduced environmental integrity → **raises
life-support consumption** → severe deterioration dramatically accelerates
life-support drain. End-stage hull failure should be a *survival* problem, not just
subtracted hit points. Becomes central once life support is active — see
[[project-survival-loop-design]].

### Processor
Failures must be **visibly understandable**, never silent wrong output. Slower
processing → routing/sorting takes longer → may get "stuck" on one operation/
resource → player may temporarily lose the ability to switch targets → may
intermittently reject valid commands → severe: may misroute output **only if the UI
clearly signals the processor is malfunctioning.** Avoid invisible mistakes that
read as bugs.

### Moss Seeder — TBD
Failure states deferred: the seeder's normal inputs/outputs/deployment/success
conditions aren't defined enough yet. Once they are, degrade *those specific
functions* rather than inventing generic failures. See the farming notes in
[[project-survival-loop-design]].

## Cross-cutting requirements

- **Emergency alternatives** for any panel that can hard-fail at something essential
  (docking → station-assisted berth; engine → the existing tow path).
- **Survival ties**: hull → life-support drain; several failures push toward the
  stranded/tow/distress low-points rather than a hit-point game-over.
- **No invisible failures.** If output is wrong or missing, the panel must *look*
  broken. This is the difference between the failure being a feature and the failure
  being reported as a bug.

## Suggested build order

Engine and **Mining Laser are done** — the laser was the second panel, chosen to
prove the shared machine on a substantially different wear input (firing) and symptom
set (aim drift). Remaining candidates, core-loop and gameplay-forward:

1. ~~**Mining Laser**~~ — BUILT 2026-08-09.
2. ~~**Tractor Field / Collector**~~ — BUILT 2026-08-09.
3. **Docking Gear** — wears from *docking*; the retry ladder + station-assisted
   emergency berth is self-contained and reuses the tow flow. Strongest next pick.

Hull is high-value but should wait for the life-support system (its end-stage is a
survival mechanic). Scanner and Processor are rich but their symptom *rendering*
(degrading scan output, malfunction-signposted misroute) is the most work.
