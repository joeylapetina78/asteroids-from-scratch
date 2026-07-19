# Encounter Director — Design Brief

This is a design brief, not a spec. It captures direction agreed on in a design conversation between Joey and Claude, for Codex to implement, extend, and push back on. Numbers here are starting points, not final tuning.

**Naming note:** this is *not* `journeyDirector.js`. That system already exists and owns mission/beat/story coordination — narrative sequencing. What this doc proposes is a different responsibility: a system that watches how a specific play session is going and adjusts encounter pacing (currently: incursions) in response. Call it the **Encounter Director** to keep the two apart. If a better name turns up during implementation, take it — just don't call it "journey director," that name is taken and means something else in this codebase.

---

## Why this exists

Two conversations led here:

1. A review of `incursionField.js` / the incursion side of `game.js` found that portal spawning and wave pacing run on a flat, context-blind clock — no awareness of zone danger, region, player power, or session history. Reasonable as a first pass, but it means every player gets the same pressure regardless of how the session is actually going.
2. The same review found a real spiral risk: `InvaderPortal.isShielded` is fully invulnerable while *any* guard from *any* wave is alive, but new waves fire on a fixed timer regardless of whether the last one was cleared. A player who falls behind can end up facing a portal that becomes permanently unkillable, and the reward curve (`180 * 1.75^(waveCount-1)`) actually pays *more* the longer that goes on — those two mechanics were built independently and are currently in tension.

Separately, live playtesting surfaced a concrete case of "the world isn't listening to what's actually happening": a hub's patrol sat and looped its idle waypoint circuit a short distance from an active incursion portal instead of engaging it. Traced it to two independent radius constants that were never reconciled — see Stage 2 below. That's the "listen to the right things" fix referenced in the ask for this brief.

---

## Prior art (for context on the approach, not to be copied literally)

- **Left 4 Dead's AI Director** (Valve, GDC 2009, Michael Booth) — a per-player "intensity" score that spikes on stress and decays over time, with the Director cycling explicit **build-up → peak → relax → sustain** phases rather than only ramping. The relax phase is the important idea to borrow: nothing here should escalate forever without a guaranteed cooldown after a spike.
- **Robin Hunicke, "The Case for Dynamic Difficulty Adjustment in Games" (2005)** — built from work on *Max Payne*. Tracks deaths and damage taken/dealt, invisibly tunes enemy accuracy/health and item generosity. Never surfaced to the player. That's a hard requirement here too — this system should never announce itself.
- Framed as a control loop (proportional controller): `adjustment = k * (target - currentPressure)`. Useful because it gives a concrete mechanism instead of if/else difficulty tiers, and it scales the response to *how far off* things are rather than snapping between fixed states.

---

## Stage 0 (do this first, it's a prerequisite): fix signal attribution

Status: done. `eventLedger.js` now gates `player.hasDestroyedEnemy` / `player.isAggressive` / `player.hasDestroyedNpc` on player-attributed causes (`weapon`, `ramming-ship`) and records `enemy.destroyed.byPlayer` / `npc.destroyed.byPlayer` stats for downstream consumers.

Every downstream idea in this doc reads from the event ledger. Right now, some of what the ledger reports is wrong, and building a pressure system on top of it before fixing this means it's tuned against bad data from day one.

**The bug:** `enemy.destroyed` and `npc.destroyed` events already carry an accurate `cause` field (`"weapon"`, `"ramming-ship"`, `"patrol-defense"`, `"hub-defense"`, `"asteroid-collision"`, `"environment"` — see `getHostileEnemyType` usage and `recordEnemyDestroyed`/`recordNpcDestroyed` in `game.js`), and the stats layer already buckets by cause (`enemy.destroyed.cause.<cause>` in `eventLedger.js`). But the *signal* derivation in `eventLedger.js` (~line 362) ignores `cause` entirely:

```js
} else if (event.type === "enemy.destroyed") {
  setSignalAliases(["player.hasDestroyedEnemy", "actor.hasDestroyedEnemy"]);
  if (getStat("enemy.destroyed.total") >= 3) {
    setSignalAliases(["player.isAggressive", "actor.isAggressive"]);
  }
} else if (event.type === "npc.destroyed") {
  setSignalAliases(["player.hasDestroyedNpc", "actor.hasDestroyedNpc"]);
}
```

A patrol or hub turret killing three hunters near a player who never fired a shot currently sets `actor.isAggressive = true`. An NPC hauler crashing into a rock on its own sets `player.hasDestroyedNpc = true`. Both are wrong, and both would poison any pressure/performance signal built on top of them.

**Fix:** gate these branches on `cause`. Treat `"weapon"` and `"ramming-ship"` as player-caused; treat `"patrol-defense"`, `"hub-defense"`, `"asteroid-collision"`, `"environment"` as not. Keep the existing `enemy.destroyed.cause.*` / `npc.destroyed.cause.*` stat buckets as-is — those are already correct and are exactly what the Encounter Director should read from, rather than the blind `.total` counters.

This is small and self-contained. Land it before anything else in this doc.

---

## Stage 1: a hard safety floor, independent of any pressure tuning

Status: done. `incursionField.js` holds the next wave (10s recheck, hidden `incursion.waveHeld` event) while living guards exceed 40% of the previous wave size (min 2). `InvaderPortal.damage()` now chips 20% through the guard shield instead of blocking fully — call sites still read the return value as "shield held" for messaging, but health always moves.

This is a correctness fix, not a tuning knob, and it should not be gated behind the pressure system existing. Two changes to `incursionField.js` / `game.js`:

1. **Population-gate waves.** Before a portal's `nextWaveIn` timer fires the next wave, check current living-guard count for that portal (already tracked via `portal.guardIds`). If it's still above some threshold, extend the timer instead of spawning on schedule. A portal should never be able to outrun a player who's actively trying to clear it.
2. **Soften the shield.** Binary "any guard alive = zero damage" is the harshest version of this mechanic and is what turns "player is behind" into "portal is now unkillable." Consider scaling damage reduction by guard count instead (e.g. floor at 20-ish% instead of 0%), so a losing player chips away slower instead of being fully locked out.

These apply to every player regardless of skill or pacing tuning. Do this even if Stage 3+ never happens.

---

## Stage 2: reconcile the patrol-jurisdiction gap

Status: done — both options, deliberately. A: `findPatrolIncursionTarget` now uses a dedicated `INCURSION_DEFENSE_JURISDICTION_FACTOR = 8` (patrol *creation* still uses the 4.2 factor, unchanged). B: `clampIncursionIntoHubJurisdiction` in `game.js` pulls ambient/objective portals inside the defense jurisdiction of whichever hub's patrol territory currently contains the ship, so near-hub incursions are answerable by that hub's patrol by design.

Traced during playtesting. Two radii govern related but disconnected decisions and were never checked against each other:

- Portal placement only enforces a **minimum** distance from a hub: `getHubSensorRadius(site)` (`interactionRadius × 2`) `+ INCURSION_HUB_EXCLUSION_BUFFER` (180). For Scrap Porch (`interactionRadius: 190`), that's a 560-unit floor — nothing stops a portal from landing far past it.
- A patrol only considers a portal (or its guards) a target within `interactionRadius × PATROL_CREATE_RANGE_FACTOR` (4.2×) of its **hub's fixed position** (`findPatrolIncursionTarget` in `game.js`). For Scrap Porch, that's 798 units.
- Ambient portal placement (`getAmbientIncursionSpawnPosition`) is based on the *ship's* current position (1050–1700 units out), with zero awareness of where the nearest hub actually is.

Net effect: a portal can easily spawn outside the exclusion zone but also outside patrol jurisdiction, and the local patrol will never register it — it just runs its normal idle loiter loop (`interactionRadius × 3.5`) nearby, looking like it's "ignoring" an obvious threat.

Two options, pick one (or propose a third) during implementation rather than defaulting silently:

- **A.** Widen `PATROL_CREATE_RANGE_FACTOR` (or make it a function of how far ambient portals actually spawn) so jurisdiction reliably covers ambient spawn range.
- **B.** Make portal placement hub-aware in the other direction — when placement isn't tied to a contract claim (the existing 32% "objective" path), have some chance of biasing toward *within* a nearby hub's jurisdiction on purpose, so "this hub's patrol should be dealing with this" is sometimes true by design rather than by accident.

B is probably more interesting narratively (a hub actually defending its own territory reads as intentional, not just wide sensor range), but it's more work. Flag whichever gets picked in `docs/project-map.md` once done.

---

## Stage 3: the Encounter Director — pressure tracking

Status: built, in validation. `src/systems/encounterDirector.js` exists as a read-only ledger consumer: EWMA pressure score (2s sample tick), signals = collision damage + sentry hits + strandings/tows + hull-integrity concern + nearby hostiles, relief from player-attributed kills. Pacing multipliers (wave size, wave delay, portal gap) are slew-limited at 0.06/tick, include a 45s relax phase after each portal clear, and only lean in gently below pressure 25 / ease off between 45 and 80. Wired into incursion pacing only, per scope. The score ships in the `onDebugChange` payload as `encounter` — the debug-panel UI hookup in `main.js` is deliberately deferred (panel work was in flight in a parallel session) and is the next small step. Watch it across a few playtest sessions before trusting it further.

A new module, something like `src/systems/encounterDirector.js`. Scope: read-only consumer of the event ledger, produces one thing — a rolling `pressure` score — and nothing else touches game state directly here. Keep it side-effect-free and easy to unit-test in isolation.

### What to track (first pass — don't build all of these at once, start with the top group)

**Combat outcome** (most directly tied to the incursion spiral problem):
- Damage taken per minute (`ship.collision` payload damage, hostile weapon hits)
- Player-caused kills per minute (`enemy.destroyed` / `npc.destroyed` filtered to `cause: "weapon"` or `"ramming-ship"` — depends on Stage 0)
- Recent hull-integrity low point, not just current value

**Flight competency** (relevant given the current playtester's actual struggle is flying, not fighting):
- Asteroid collisions outside combat context (`ship.collision` with `targetType: "asteroid"`)
- Stranding cause ratio — already distinguishable today via `recordStrandedEvent`'s `"out-of-fuel"` vs `"hull-destroyed"` reasons, no new tracking needed

**Exposure** (how much danger is even present, independent of outcome):
- Concurrent hostiles near the ship
- Time since last hostile encounter — this is the "relax timer," mirrors L4D directly

**Engagement style** (lower priority, nice-to-have):
- Of recent encounters, fraction ending in a player kill vs. a flee/tow vs. a death

Explicitly deferred, don't build yet: hit/miss ratio (needs a new `weapon.missed`-style event that doesn't exist today), and anything geometry-based like a facing/attention cone — interesting later, not a good first metric.

### How to compute it

Single dimensionless rolling score, updated via exponentially-weighted moving average on each relevant ledger event — no history buffer needed:

```
score = score * decay + newSample * (1 - decay)
```

Arbitrary scale (0–100 is fine). The number means nothing in isolation — what matters is trend and position relative to *that player's own recent baseline*, not a fixed global threshold. A skilled player and a struggling new player shouldn't be judged against the same cutoff.

Re-evaluate at natural decision points (about to pick next wave size, about to decide when the next portal opens) — not every frame. Rate-limit how much a single re-evaluation can move a downstream knob (don't let one bad encounter swing wave size from max to min in one step).

### What it should adjust (Stage 3 scope: incursion pacing only)

Deliberately narrow for the first pass — one lever, well understood, not five systems all moving based on one new number at once:

- `PORTAL_WAVE_SIZES` baseline shrinks/grows with pressure (e.g. a struggling player sees something like `[3, 6, 15]` instead of `[5, 10, 30]`)
- `BASE_WAVE_SECONDS` / `WAVE_SECONDS_STEP` stretch under high pressure, compress under low
- `INCURSION_AMBIENT_REPEAT_MIN/MAX_SECONDS` — the gap before the *next portal* — widens deliberately after a portal that generated a lot of pressure gets cleared. This is the closest analog to L4D's relax phase and is probably the single highest-value lever to get right.

Explicitly out of scope for Stage 3: ambient hunter respawn rate, patrol aggression, resource/fuel generosity. Those are real future levers (see prior conversation) but wiring them all up before the first one is validated makes it impossible to tell what's causing what if something feels off.

### Non-negotiables

- Never surfaced to the player. No difficulty indicator, no "easy mode detected" message.
- Bias uncertain rounding toward generosity, not punishment. Occasionally-too-gentle reads as luck; occasionally-too-harsh reads as broken.
- Keep the score visible in the existing debug readout during development so it can be watched live against real playtesting before it drives anything.
- Respects Stage 1's hard floor — this system tunes *within* the safe range, it is not itself the thing preventing the spiral.

---

## What to avoid for now

- Don't wire the pressure score into non-incursion systems yet (see Stage 3 scope note).
- Don't build a full player-skill classifier. A rolling EWMA over 3-4 signals is enough; resist the urge to build a bigger model than the problem needs.
- Don't touch the reward curve (`getIncursionPortalReward`) as part of this pass — note the tension (pressure-tuned smaller waves also mean smaller payouts) but treat that as a deliberate future decision, not a side effect to quietly patch here.
- Don't make Stage 2's fix implicit — whichever option gets picked should be a visible, named decision, not something that falls out of tuning other numbers.

## Suggested order

1. Stage 0 (signal attribution) — small, unblocks everything else, no visible gameplay change.
2. Stage 1 (safety floor) — fixes a real bug, no dependency on anything else in this doc.
3. Stage 2 (patrol jurisdiction) — independent of Stage 3, can happen in parallel with it.
4. Stage 3 (Encounter Director) — build the score, wire it to the debug readout only, watch it during a few playtest sessions before letting it touch any spawn constant.
5. Only after Stage 3 is validated against real play: revisit whether it should expand beyond incursion pacing.
