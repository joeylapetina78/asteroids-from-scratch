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

- ~~expose transition state, blockers, observation age and drift in the Observatory~~
  (done — see below);
- re-observe/re-sync before a measured supply rate becomes stale;
- checkpoint perpetually active orders and shipments without weakening conservation;
- aggregate and restore physical haulers, miners, patrols and ecology as regional
  populations while preserving bespoke actors, title, cargo and condition;
- represent both sides of aggregate-to-aggregate trade and cash clearing.

## Phase C observability — what a live run actually showed (2026-08-19)

`src/systems/simulationObservatory.js` is the read model behind the Observatory's
**Simulation** tab: per hub, its detail level, mode, why it is in that mode, how
long it has been far, how long it has been *continuously blocked*, what is
holding it, observation history against the floor it must clear, aggregate age,
estimated drift and transition count, plus a transition log. It reads; it never
advances a flow or forces a transition.

It was built because the boundary's failure mode is silence, and a fresh remote
run then demonstrated exactly that failure at full volume.

### The measurement

Fresh remote build (`fresh-20260819-0621-e0ba4c1`), `resetSave=1`, player parked
in the inner cluster, sampled every five seconds for 31 minutes — 373 samples.
Six inner hubs stayed NEAR/MID. The three outer hubs — Ore Station One,
Coldwater Depot, Deep Research — were correctly FAR for the entire run.

**Not one of them became eligible to aggregate in a single sample: 0/373, three
times over.** Zero transitions in thirty-one minutes. `open-orders` was present in
100% of samples; `population-production` and `industrial-work` came and went
underneath it. The nine orders those hubs opened in the first 31 seconds were
still open, untouched, 29 minutes later.

Meanwhile the inner economy was healthy: 55 purchase orders reached `delivered`
over the same half hour, with more accepted and in flight at the end. The world
is not stalled. The outer third of it is.

### Why: long-haul freight is refused on maintenance policy

The far hubs' orders reach `ready` — goods bought and waiting — and then never
acquire a `shipmentId`. Reading the carrier bid diagnostics for one of them:

```text
procurement-HPO-0016   offered 5302   asking 1387   eligible: false
freight.declined  reason: maintenance-policy   458 over 31 minutes
```

The offer is nearly four times the ask. Price is not the problem. The trip is:
the outer hubs sit 40k–85k units out, a round trip costs more hull wear than a
carrier's maintenance policy will accept, and `payer-cannot-fund` accounts for
only 13 declines against 458 refused on maintenance. Haulers were observed
parked at Coldwater Depot and Deep Research in `seeking-market`, unable to take
work at either end.

So the loop is closed and stable: a starving far hub raises emergency
procurement, no carrier will fly the distance, the order sits `ready` forever,
the hub is never quiescent, and it can never be aggregated. Clearing the orders
by hand in a disposable local world did not break the loop either — the hubs
re-posted fresh orders within ~85 seconds, which the "blocked for" counter shows
resetting and climbing again.

**This is the answer to "if busy hubs remain detailed indefinitely".** They do,
and they are not busy — they are stuck. The gate is behaving exactly as
designed and must not be loosened; what is missing is a conserved checkpoint for
orders and shipments so a hub with open commitments can still be handed over.

### The generalisation: a working settlement is never quiescent

Parking the player at the frontier turned the six *inner* hubs FAR — and every
one of them was blocked, continuously, for as long as they were watched:

```text
yard-exchange   far  blocked  open procurement orders ×4, population production ×2
scrap-forge     far  blocked  open orders ×4, shipments in flight ×1, production ×1
the-ledge       far  blocked  open orders ×5, shipments in flight ×1, production ×1
blue-lantern    far  blocked  open orders ×4, shipments in flight ×2
morrow-shoal    far  blocked  open orders ×5, active extraction ×1, production ×1
kiln-crossing   far  blocked  open orders ×4, shipments in flight ×1
```

Zero quiet samples across all six. These are not stuck hubs — this is the inner
economy working exactly as intended, delivering orders throughout. And that is
the harder result: **the outer hubs fail the gate because they are broken, and
the inner hubs fail it because they are healthy.** The only settlements that
ever passed were ones with no freight reaching them at all.

The quiescent gate can therefore only ever collapse a settlement with nothing
going on, which is close to the opposite of what level-of-detail is for. It was
the right conservative first boundary and it must not be loosened; it simply
cannot be the last one. Aggregating a live economy requires the checkpoint, not
a longer wait.

Two smaller things the same run showed:

- Arriving at the frontier dropped detailed work from 55% to 21% in one step, as
  eight hubs went FAR at once. That is the saving Phase C exists for, visible for
  the first time without a console.
- The `?v=` cache-bust discipline held: the new module and its imports carry the
  tag, and `tests/cacheBust.test.mjs` covers it.

### The second gate, which was invisible until now

Even a perfectly quiet far hub cannot aggregate until it has been *watched* for
one full cycle of its own slowest need. Because population size scales demand
cadence, that floor is not the authored 210s:

| hub | population | observation floor |
|-----|-----------:|------------------:|
| Yard Exchange | 140 | 210s |
| Ore Station One | 85 | 346s |
| Coldwater Depot | 70 | 420s |
| Deep Research | 60 | 490s |

The smallest, most remote settlements — the ones aggregation exists for — need
the longest look before they may be collapsed. The refusal was previously a bare
`supply-rate-unknown`. The Simulation tab now shows it as progress (`50s / 8m`),
which is the difference between "broken" and "not yet".

### The round trip, forced open in a disposable world

The unmodified run never aggregated anything, so the aggregate and restore paths
could not be watched in it. They were instead exercised in a throwaway local
world where the three outer hubs' procurement orders were deleted every second
to hold them quiescent — an intervention, not a measurement, and it is recorded
as one. Nothing about the remote run above depends on it.

Held open, the boundary behaved exactly as designed:

- Ore Station One crossed its 346s observation floor and aggregated. The tab
  reported `far / aggregate / observed 6m / age 14s / 0% stock · within-window`,
  and detailed work fell from 56% to 55%.
- Flying the player out to it restored it 63 seconds later. The institution was
  the **same object**, not a reconstruction; name, treasury (44732 cr, unchanged
  because an empty hub books no revenue) and population identity all survived.
  Household cash rose 26050 → 27150 across the aggregate, which is correct:
  households are paid whether or not there is anything on the shelf.
- The transition log read `ore-station-one aggregated · observed 6m` then
  `ore-station-one restored · aggregate for 63s`.
- Arriving at the frontier made the other eight hubs FAR, and detailed work
  dropped from 55% to 21% in one step. Coldwater Depot then crossed its own 420s
  floor and aggregated unaided.

That last number is the point of the whole phase, and it is the first time it
has been visible without a console.

### Drift is instrumented; live staleness is still unmeasured

`estimateFlowDrift` in `regionFlow.js` reports staleness as the ratio of how long
an aggregate has run to the window it was observed over, and extrapolates the
measured per-window error (~5% shelf, ~8% cash, accumulating linearly) across
that ratio. Bands: `within-window`, `stretched`, `beyond-window`. It is labelled
`estimated: true` because it extrapolates a measurement rather than measuring
this hub.

No aggregate in either world ran long enough to leave `within-window`, so
**nothing has yet been observed going stale**. The instrument is built and
unit-tested and has not had a real chance to complain. Re-run it once
checkpointing lets a genuinely busy hub hand over and stay handed over.

## Phase D — the aggregate as a participant, not an owner (2026-08-19)

The 31-minute run said the quiescent gate never opens. The instinct is to relax
the gate. The gate was not the problem.

### Why the gate had to be that strict

`applyFlowToLiveState` wrote the model's ABSOLUTE stock and cash over the live
records every step:

```js
institution.accounts.operating.balance = flow.cash;   // absolute
applyFamilyStock(institution, flow.stock);            // zeroes the family, writes one number
population.householdCash = aggregate.cash;            // absolute
```

So anything that touched an aggregated hub between two advances was destroyed —
a delivery, a payment, a pickup. The gate was not protecting the hub's orders;
it was protecting the hub from the aggregate. Two tests in
`tests/aggregateBoundary.test.mjs` state that directly, and both failed against
the old write model.

That is the whole reason the gate demanded silence, and it is why a settlement
with a live economy could never qualify: **the aggregate behaved as if it owned
the books.** It does not. It is one more participant in them.

### Read, advance, write the difference

`advanceHub` now:

1. `syncFlowFromLiveState` — pull live stock, cash and household cash into the
   flow, absorbing whatever the world did since the last step;
2. `advanceRegionFlow` — advance the model;
3. `applyFlowDeltaToLiveState` — write back only what the model itself changed.

Both halves of every external transaction survive, because the aggregate never
touches them. `applyFlowToLiveState` and its absolute `applyFamilyStock` are
deleted rather than left beside the new path; two write models for one set of
books is exactly the drift this codebase keeps warning about.

Negative stock deltas draw across whatever the warehouse actually holds instead
of assuming a single preferred resource, so an aggregate can never consume stock
that is not there.

### Reality is counted first

Netting is the other half, and it is easy to miss. The flow's `supply` is an
OBSERVED rate — it is a description of the freight that was reaching this hub.
If that freight also keeps physically arriving while the hub is aggregated,
crediting both invents material:

```js
const modelled = supply[family] * seconds;
const arriving = Math.max(0, modelled - externalInflow[family]);
```

`externalInflow` is measured, not assumed: the difference between what the
warehouse holds now and what this aggregate last left in it. When reality
delivers everything, the model adds nothing; when reality delivers nothing, the
model supplies at the rate it observed.

The test for this is worth reading before changing it. The first version asserted
`busy <= quiet + delivered`, which **permits the exact double count** — a hub
credited twice lands at precisely that bound. The property that actually holds is
substitution: a region supplied for real at the rate the model observed ends up
where the model would have put it anyway, so `|busy - quiet|` stays small.

### The income cap, and how the boundary exposed it

Letting hubs actually aggregate surfaced a divergence between the two paths that
had never been reachable before.

The detailed path treats household income as a **faucet with a valve**: income is
credited only up to `householdCashCap`, and the surplus is discarded and logged
as `totalDiscarded`. That is deliberate — it is what keeps credit creation
bounded over a long session, and `notCreatedAtCap` reached 202,470 in a
ten-minute run, so it is not a corner case.

The flow had no valve. It credited `householdIncomePerSecond * seconds`
unconditionally. So an aggregated settlement whose households were already at
their cap kept creating credits that the detailed path would have refused —
money the rest of the world could not make.

`advanceRegionFlow` now applies the same valve per household and reports
`discardedCumulative`; `syncFlowFromLiveState` carries the cap in and
`applyFlowDeltaToLiveState` writes `totalDiscarded` back, so the money reconciler
sees one consistent story either side of the boundary.

The invariant to hold onto, and the one the test states:

```text
created + discarded == the income the rate would have made
```

Not "created == rate × seconds". That older assertion was in
`tests/regionFlow.test.mjs` and had to be replaced, because it asserted the
absence of the valve.

**How this was found is the reusable part.** The per-hub check is arithmetic on
live records and takes seconds:

```text
(hub balance Δ + household cash Δ)  ==  (income Δ − production burn Δ)
```

Measured across three aggregated hubs it came out at exactly 0, which is what
cleared the delta write model of suspicion and sent the search to the faucet
instead. Session-level reconciler residuals are too coarse to localise anything;
they say a leak exists, not where.

### What the gate blocks now

Only the hub's OWN internal work: population production, factory and
construction runs, protection it commissioned. The flow models those, so running
both would count one activity twice. Work done TO the hub — orders somebody else
is filling, cargo in flight, extraction working for it — no longer blocks.

Those remaining three still need a conserved checkpoint of their own. That is a
smaller and better-defined problem than the one this started as, because it is
now about double-counting inside one hub rather than about protecting the whole
world from the aggregate's pen.

### What it measures now

Same world, same player position, before and after:

| | quiescent-only gate | participant boundary |
|---|---|---|
| far hubs aggregating | **0 of 3, in 31 minutes** | **3 of 3, by 7–8 minutes** |
| transitions | 0 | 1 each, no thrashing |
| binding constraint | open orders that never clear | the observation floor |

With the player at the frontier the Observatory reads:

```text
DETAILED WORK  19%          STALEST AGGREGATE  Ore Station One · 0.84× window
Ore Station One   far  aggregate  observed 7m  age 6m  4% stock · within-window
Deep Research     far  aggregate  observed 8m  age 5m  3% stock · within-window
Yard Exchange     far  detailed   blocked  population production runs ×2
The Ledge         far  detailed   blocked  factory or construction work ×1
Scrap Porch       far  detailed   settling eligible in 11s
```

That is the first live drift reading the model has ever produced — the
instrument had nothing to watch before, because nothing aggregated.

Restoration was exercised by flying the player to an aggregated hub: the same
institution object and the same durable `hubState` object came back, history
intact, treasury moving smoothly across the transition rather than jumping.
`restoreHub` used to apply the flow twice — harmless when writes were absolute,
a double count under deltas — and that second call is gone.

### Conservation, and how far it was checked

The aggregate path was checked directly against the invariant that matters:

```text
(hub balance Δ + household cash Δ)  ==  (income Δ − production burn Δ)
```

Measured live across three aggregated hubs over ~50s, twice: **0**, to rounding.
Deep Research showed the cap valve engaging at the same time — household cash
flat at the cap, 262 created, 298 discarded — so the two paths now agree there
too.

**An unexplained world-level residual remains, and it is not this.** The money
reconciler shows roughly −9/s before any hub aggregates and roughly −27/s after.
The aggregated hubs contribute zero by direct measurement, so the difference sits
in the detailed economy — plausibly a pre-existing leak that gets exercised
differently once three hubs stop trading, but that is a hypothesis and it is not
tested. It deserves its own pass with the Economy tab and the reconciler rather
than being folded into this one.

## Phase E — the rate is re-observed, not held (2026-08-20)

An eight-hour unattended run is what made this unavoidable, and it is worth
stating what it looked like because the failure is quiet and plausible.

Eight of nine hubs aggregated, one transition each, no thrashing — the boundary
itself behaved perfectly. Detailed work fell to 11%. And then:

```text
shipments: 32 delivered, 0 in flight     orders: 12 sitting `ready`
Yard Exchange    315 water-ice, 207 iron-nickel   served 1.00
Deep Research    empty                            served 0.00
Ore Station One  observed 7m · age 8.5h · 72.98× window · beyond-window
```

**When every hub aggregates, inter-hub trade stops entirely** — no procurement
runs for either side of any order. But each flow went on crediting itself supply
at a rate measured from that trade back when it was running. So one settlement
sat on hundreds of units no carrier had ever moved, while another starved to
nothing, and both were "correct" according to their own model.

Two roadmap items — bound stale-rate drift, and represent aggregate-to-aggregate
trade — turn out to be one problem with one answer.

### Reality is the only evidence, so keep consulting it

`reobserveSupply` blends what ACTUALLY arrived into the rate every step, over the
timescale the rate was originally measured on:

```js
const weight = Math.min(1, seconds / flow.observedSeconds);
blended[family] = held + (measured - held) * weight;
```

`observedSeconds` is that timescale by construction, so a region re-learns its
supply at the speed it was originally learned. Long enough that a gap between
lumpy deliveries is not read as famine; short enough that a supplier which has
genuinely stopped is noticed within a window or two.

This bounds staleness and cures phantom aggregate-to-aggregate supply with the
same mechanism, and it can only ever *reduce* invented material.

The measurement, over eight hours of simulated time with nothing arriving:

| supply rate | phantom stock accrued |
|---|---|
| held (old) | **> 20,000 units** |
| re-observed | **0** — within 500 of where it started |

### Absence of evidence is not evidence of zero

`reobserveSupply` returns the rate untouched when the caller passes no inflow
measurement at all. A step that could not measure is not a step that measured
nothing — the same distinction `minimumObservationSeconds` exists to protect,
and the same one that once drained six working settlements to empty.

### What this does to the drift estimate

A re-observed rate is an exponential blend whose time constant IS the observation
window, so the information in it is never much older than one window however long
the region has been aggregated. `estimateFlowDrift` therefore saturates staleness
at one window when `resyncedAt` is set, and the Observatory prints `re-observed`
or `HELD` beside the band so the two modes are never confused.

**The coefficients have not been re-derived.** The 5%/8%-per-window figures come
from racing a HELD rate against a detailed run. What has been checked for this
mode is the pathology they existed to catch, not a new drift curve. Re-race the
model against a detailed run before quoting a number for a re-observed region.

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
