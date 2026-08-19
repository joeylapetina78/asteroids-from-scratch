# Level of detail

Step 4 of the general-engine direction. The world should be able to grow without
the cost of simulating it growing with it, which means distant places have to be
cheaper than near ones without becoming obviously fake when the player arrives.

All three original phases are now built. Phase C deliberately begins with a
quiescent-only handoff; active transactional and physical populations are the
next expansion of the boundary.

---

## Phase A — act less often, far away (built)

`src/systems/detailLevel.js`. Places are NEAR / MID / FAR by distance from
`simulationFocus`, and a system asks `shouldActThisTick` before doing work.

Two properties worth keeping:

- **No focus means everything is NEAR.** Every gate returns true when nothing has
  set a focus, so the machinery is inert rather than subtly wrong by default.
- **Cadence is hash-offset per actor.** Deferred work is spread across ticks
  instead of bunching into one expensive frame every _n_ ticks.

`src/main.js` now updates `simulationFocus` from the player ship at the start of
each world-clock tick. The runtime therefore classifies all nine hubs and any
registered procedural geography as NEAR, MID or FAR.

Measured saving today: ~7%. Small, because a settlement's per-tick cost is
already low; the saving that matters is the one Phase C unlocks.

## Phase B — model a place as rates (built and wired conservatively)

`src/systems/regionFlow.js`. A place simulated as flows rather than transactions,
throwing away negotiation, supplier contention, individual carriers and every
blocker — the things that make a place interesting to watch, and exactly the
things nobody is watching six jumps out.

The split is the whole design:

- **Demand is derived, and it is exact.** Consumption, income, spending and
  production burn come from the same authored records the detailed path reads.
  Nothing here estimates them; if the two ever disagree, one has a bug.
- **Supply is observed, never guessed.** How fast ore actually reaches a hub is
  the outcome of a market. So a region's supply rate is measured out of the
  sampler's own history of what that region was seen doing.

### Two corrections the live world forced

Both were found by running the model against the running game rather than
against fixtures, and both were the model claiming to know something it did not.

**Wanting is not eating.** Supply was measured as stock delta plus what the
population *would* have consumed at its authored rate. Six settlements sitting
with completely empty shelves were therefore reported as supplied at exactly
their full consumption rate. A hub with nothing on the shelf consumes nothing,
however much its people want. Consumption is now counted from purchases that
actually cleared, and `advanceRegionFlow` bills accordingly: an empty hub books
no revenue and burns no credits, and reports its `shortfall` per family.

**A glance is not an observation.** Fifteen seconds of history reported every hub
as supplied at exactly zero — and zero is a rate, so the model would have drained
them all to empty. `minimumObservationSeconds` now refuses to report a rate for a
window shorter than the settlement's own slowest demand cycle (210s today). The
distinction that matters is *known to be zero* versus *not yet known*: the first
drains a working hub, the second refuses to advance.

### The measurement

Headless, nine settlements, mining + procurement + population running detailed.
Watched for 600s, then the same starting flow raced against the detailed
simulation over lengthening spans:

| raced | worst stock drift | shelves held | cash drift (median / worst) |
|-------|-------------------|--------------|------------------------------|
| 300s  | 6.2 units         | 143–157      | 4% / 7%                      |
| 600s  | 7.1 units         | 132–148      | 4% / 8%                      |
| 1200s | 14.1 units        | 105–135      | 1% / 12%                     |
| 2400s | 26.3 units        | 55–104       | 1% / 18%                     |

**Drift grows roughly linearly with the span.** Four times the span gives about
four times the stock drift. That is a rate error accumulating, not a phase
offset — and it is expected rather than alarming, because the observed world was
not in steady state: the shelves drained from ~150 units to ~55 over the run, so
a supply rate measured while stocked does not describe a hub later running down.

**The rule this sets for Phase C:** the model is trustworthy over a span
comparable to its own observation window — at 600s watched and 600s raced, ~5% of
shelf and 4% of cash — and degrades past it. A far region must be **re-observed
or re-synced on roughly the timescale it was observed over**, not left running
indefinitely on one measurement. A player who flies away and returns within about
ten minutes gets a good answer; one who returns an hour later must not be handed
a number extrapolated from a single old window.

Reproduce with the measurement harness pattern in
`tests/regionFlow.test.mjs` ("the model is measured against a real detailed run").

## Phase C — restore detail on approach (built, quiescent boundary)

`src/systems/distantSimulation.js` owns the live handoff and
`src/systems/simulationMode.js` provides the lightweight gate read by domain
systems.

A FAR institutional hub is not collapsed merely because it crossed a radius. It
must remain far for the policy window, have a sufficiently long observed supply
history, and have no open procurement orders, active shipments, extraction
allocations, population production, industrial work or protection requests.
Only then does its flow take custody and the detailed planners stop acting for
that hub.

The flow writes material-family stock, treasury cash, household cash, income,
spending, revenue and production burn back into the live authoritative records.
Stock is measured in effective material units, so higher-yield substitutes do
not change quantity during the round trip. Households cannot consume stock they
could not afford. Observed external cash drift remains diagnostic rather than
being replayed one-sided across the aggregate boundary.

Approach first advances the flow to the restoration instant, writes it back,
resets population cadences to avoid a catch-up burst, and switches the same hub
actor to detailed mode. The institution and its durable `hubState` are never
reconstructed. Authored and procedurally generated hubs pass through this same
boundary. Saves retain aggregate state but do not simulate wall-clock time spent
with the browser closed.

Covered by `tests/distantSimulation.test.mjs`: quiescent entry, obligation
blocking, live accounting, identity-preserving restoration, procedural-hub
parity, and household affordability.

What the next phase still owes:

- expose transition state, blockers, observation age and drift in the Observatory;
- re-observe/re-sync before a measured supply rate becomes stale;
- checkpoint perpetually active orders and shipments without weakening conservation;
- aggregate and restore physical haulers, miners, patrols and ecology as regional
  populations while preserving bespoke actors, title, cargo and condition;
- represent both sides of aggregate-to-aggregate trade and cash clearing.

---

## Content findings surfaced along the way

Neither is a bug in the level-of-detail work; both are things aggregation made
visible, recorded here so they are not rediscovered.

- **Every settlement consumes an identical basket.** All nine authored
  settlements carry the same four needs at the same intervals, so derived
  consumption and production burn are byte-identical across the map. Only
  household income differs (6000 / 3000 / 2600 / 2400 per minute).
- **Population size now scales demand cadence.** Yard Exchange remains the
  reference population; smaller communities wait proportionally longer between
  needs. The aggregate reads those same scaled intervals rather than maintaining
  a second appetite estimate.
