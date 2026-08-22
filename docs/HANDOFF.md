# Project Handoff — August 19, 2026

This is the authoritative re-entry note for Claude, Codex, or another future
maintainer. Read this file first, then [institutional-npcs-and-assets.md](institutional-npcs-and-assets.md),
[level-of-detail.md](level-of-detail.md), and [territorial-authority-roadmap.md](territorial-authority-roadmap.md).
The older August 6 session note is historical context, not the current checkpoint.

## Stable checkpoint

- Branch: `main`. Simulation-boundary observability is in the working tree on
  top of `f8c9397`; commit and deploy are the operator's call.
- Institutional terrarium foundation: `e0ba4c1`.
- Distant aggregation/restoration implementation: `e3369de`.
- Simulation observability + live-run findings: working tree at `f8c9397`.
- Browser build: `fresh-20260819-1920-f8c9397`.
- Verification: `npm test` reports 860 passing, 0 skipped, 0 failed;
  `npm run validate:content` passes; the local browser smoke test on the bumped
  build loads with no console warnings or errors. The public build still serves
  `fresh-20260819-0621-e0ba4c1` until this is deployed.
- Fresh local URL:
  `http://localhost:8123/?resetSave=1&devStart=explorer&build=fresh-20260819-1920-f8c9397`
- Remote URL (currently the previous build):
  `https://joeylapetina78.github.io/asteroids-from-scratch/?resetSave=1&devStart=explorer&build=fresh-20260819-0621-e0ba4c1&remote=e3369de`
- Browser-facing changes require `npm run bump:cache` before final testing.

## Product direction and non-negotiable invariants

The goal is a terrarium universe, not a set of player-facing scripts. The player,
named people, operational craft, businesses, populations and political/economic
institutions act inside the same rules.

The enduring high-level NPC is the institution. A named representative such as
Sal can be its face, but changing that representative must not erase the
institution's treasury, assets, policies, obligations, motivations or memory.
Operational miners, haulers and patrol operators are a lower-cost NPC tier that
can earn promotion into bespoke actors through recorded careers. Population is
the labor constituency from which real operators can emerge.

Capabilities come from controlled assets, not actor-type conditionals:

```text
institutional identity + controlled assets = current capability portfolio
```

A mining charter, territory, factory, repair facility, ship or future farm
publishes what its controller can attempt. Authority, labor, money, inventory,
time, knowledge and condition still decide whether the attempt succeeds.

Conservation remains central. Credits, commitments, material, title, custody,
labor, wear, repair inputs and wrecks require traceable sources and destinations.
Never fix the economy by silently spawning stock, deleting obligations, granting
a named ship a route, or replaying only one side of a payment.

## Current architecture

### Nine institutional hub actors

All nine First Reach hubs are `institutional-npc` actors. `hubActors.js` exposes
one coherent live surface per settlement: the authoritative treasury and
warehouse, population and labor, assets and facilities, capabilities, policies,
relationships, needs, projects, development records, domain orders and bounded
history. These are references to domain-owned state rather than copied balances.

Scrap Porch owns the SPRC operation. Sal is its delegated representative rather
than a competing backend decision-maker. Compatibility adapters preserve older
SPRC IDs while economic ownership remains with the hub.

Every hub has foundational extraction authority and a municipal capacity charter.
Installed extraction remains specialized, so legal ability does not pretend that
physical capacity already exists. Hubs can plan responses such as importing,
commissioning sponsored freight, building a parts factory, delaying, or accepting
a shortage. Capacity consumes treasury, material, construction time and finite
population labor.

### Asset-derived capability and NPC development

`assetCapabilities.js` is the common read model. New asset domains register
sources instead of editing the NPC engine. Municipal freight and factory projects
create named operational NPCs with homes, motivations, traits, employment and
asset-scoped charters.

`npcDevelopment.js` promotes operators only from recorded economic evidence.
Emergent factories can later spin out as independent businesses when their
operator, production history, customers, clear obligations, inventory and
capital justify it. Existing people, facilities and labor assignments move;
nothing is cloned.

### One authored/procedural settlement pipeline

`settlementSeedPipeline.js` is the construction boundary for both authored and
procedurally generated hubs. A seed contains institutional identity, motivation,
representative, treasury, population, extraction, charters, policy, durable hub
state and geography. Registration materializes the same live logistics,
population, extraction, actor, patrol, place, territory and authority projections
used by authored hubs.

The pipeline assigns capabilities and facts, never prescribed suppliers or
routes. Economic choices continue through the shared planners. Generated seeds
are saved so derived legal projections can be rebuilt without resetting evolved
treasuries and populations.

### Territory and player rights

Every hub controls a deterministic geographic jurisdiction with its own overlay
color. Adjacent domains meet at geographic boundaries; outer claims leave open
frontier. Unclaimed space is currently lawful, and transit remains open during
this policy pass.

The Yard Exchange Travel Authority sells one territory-scoped work pass per hub.
A purchase pays the issuing hub's real treasury, creates a shared authority grant,
updates the rights overlay immediately and upgrades the player's displayed
authorization. Restricted labels identify the controlling hub, required mining
right and where it can currently be cleared.

### Economy, freight, maintenance and industrial groundwork

The prior conserved economy remains in place: population demand, competing
extraction, purchase-backed freight, material-family substitution, parts
production, repair, towing, recovery, salvage, insurance, protection and bounded
observability. Haulers choose work through the market; they are not assigned
bespoke routes. Hub-local contract discovery and staggered decisions reduced the
old universe-wide flocking behavior.

General maintenance suppresses ordinary component deterioration. Specific faults
become repair-shop work only when routine care can no longer contain them. Hub
repair access and industrial expansion are assets/capabilities rather than Sal-only
exceptions. The game still needs further long-run balancing; do not assume the
earlier Sal pileups are permanently solved without a fresh run.

## Distant aggregation/restoration — current boundary

`detailLevel.js`, `regionFlow.js`, `simulationMode.js` and
`distantSimulation.js` now form a live three-level simulation boundary.

- The player ship supplies `simulationFocus` every world-clock tick.
- NEAR and MID hubs remain detailed. A FAR hub becomes eligible after 30 seconds,
  but only after procurement orders, shipments, extraction allocations,
  population production, industrial work and protection requests are quiescent.
- A hub also needs a sufficiently long observed supply history. Unknown supply is
  refused rather than treated as zero.
- Once aggregated, transaction planners stop mutating that hub. Measured supply
  and exact population demand advance stock, household income/spending, treasury
  revenue and production burn through the same live books.
- Approach restores detailed operation around the exact same institutional actor.
  Treasury, assets, projects, relationships, policies and history are preserved;
  population cadences are reset to avoid a catch-up burst.
- Authored and generated hubs use the same handoff. Aggregation state is saved,
  but time spent with the browser closed is not treated as simulated time.
- Observed external cash drift is diagnostic only. It is not replayed because
  applying one side of an inter-hub payment would create or destroy credits.

The live smoke test found nine hub records. Inner hubs were NEAR/MID. The three
outer hubs were correctly FAR but initially remained detailed because they still
had open procurement or industrial work. This conservative refusal is intended.

Important limitation: this stage aggregates the institutional economic loop after
transactional work becomes quiet. It does not yet serialize arbitrary active
contracts, in-flight carriers or physical craft into a regional snapshot. It also
does not yet periodically relearn a supply rate during a very long absence.

Live inspection: use the Observatory's **Simulation** tab first — it answers
"which places are aggregated and why not" without a console. The raw state is
still there when you need it:

```js
window.__asteroids.distantSimulation.getState()
window.__asteroids.clock.getSchedule()
window.__asteroids.economy
```

## Simulation-boundary observability (2026-08-19)

The Observatory has a **Simulation** tab, backed by
`src/systems/simulationObservatory.js`. For every hub it shows detail level,
mode, the reason it is in that mode, how long it has been far, how long it has
been *continuously blocked*, what is holding it, observation history against the
floor it must clear, aggregate age, estimated drift band and transition count,
plus a transition log and the share of detailed work still being paid for. It is
a read model: it never advances a flow or forces a transition.

`estimateFlowDrift`/`describeObservation` live in `regionFlow.js` next to the
measurement they extrapolate. `distantSimulation.js` now records `blockedSince`,
which is what separates a hub that is busy from one that is stuck.

### What the fresh remote run found

A 31-minute fresh remote run with the player parked in the inner cluster,
sampled every five seconds, produced an unambiguous result: **the three outer
hubs never became eligible to aggregate in a single sample — 0/373, each.** Zero
transitions in thirty-one minutes. `open-orders` was present in 100% of samples for
all three, and the nine orders they opened in the first 31 seconds were still
open at the end.

The cause is not the aggregation gate. Long-haul freight to the outer hubs is
refused on `maintenance-policy` — 458 declines across the run, against 13 for
`payer-cannot-fund`. One order was offered 5302 credits against a carrier
ask of 1387 and still declined: the round trip costs more hull wear than a carrier's
maintenance policy accepts. So the far hubs' orders reach `ready` and never get
a shipment, the hub is never quiescent, and it can never be handed over. The
inner economy meanwhile delivered 55 orders normally over the same period.

Clearing those orders by hand did not break the loop; the hubs re-posted fresh
emergency orders within ~85 seconds.

The harder half of the result came from parking the player at the frontier,
which turned the six *inner* hubs FAR. All six were blocked too — by open
orders, shipments in flight, extraction and population production — with zero
quiet samples. Those hubs are not stuck; that is the inner economy working. So
**the outer hubs fail the gate because they are broken and the inner hubs fail
it because they are healthy.** The only settlements that ever passed were ones
no freight was reaching at all. A quiescent-only boundary can therefore only
ever collapse a settlement with nothing going on.

The same move dropped detailed work from 55% to 21% in one step, which is the
saving the phase exists for and is now readable in the tab.

The aggregate and restore paths themselves are sound: forced open in a
disposable local world, Ore Station One aggregated, ran for 63 seconds and
restored around the **same institution object** with treasury, name and
population identity intact, both transitions logged.

**Conclusion: item 4 of the previous sequence is now confirmed by measurement
and is the next thing to build.** Do not loosen the quiescent gate. Design a
conserved checkpoint for open orders and in-flight shipments so a hub with live
commitments can still be aggregated without corrupting them.

A second gate also became visible: a far hub cannot aggregate until it has been
watched for one full cycle of its own slowest need, which population scaling
stretches to 346s / 420s / 490s for the three outer hubs. The tab now shows this
as progress (`3m / 8m`) rather than a bare `supply-rate-unknown`.

Because nothing aggregated unaided, **no supply rate has yet been observed going
stale.** Every aggregate seen so far stayed inside `within-window`. The drift
instrument is built and unit-tested and has not yet had a real chance to
complain; step 3 is what will give it one.

## Physical navigation

A craft steers at an aim point displaced sideways from its waypoint by a berth
lane, and arrival is measured against that same aim point — so a lane wider than
the arrival radius can strand a ship on a road it is driving perfectly. That
happened, silently, for a whole session. See
[navigation-lanes.md](navigation-lanes.md) for the invariant, the
`navigation-stalled` blocker that now reports it, and why the obvious version of
that watchdog (count waypoints) was wrong.

## The frontier is unreachable, and that is a content decision

Measured 2026-08-20, and it needs a design call rather than a patch.

A carrier may accept a run only if `currentWear + tripWear + returnWear` stays
inside `maximumWear - minimumReturnMargin`. With the authored policy that budget
is `(6 - 0.9) / 0.00016` = **31,875 units of round trip**. The network:

| lane | distance | trip wear | budget |
|---|---:|---:|---:|
| inner lanes | 1,875–8,400 | 0.3–1.3 | 5.1 |
| kiln-crossing → ore-station-one | 37,473 | 6.0 | 5.1 |
| ore-station-one → coldwater-depot | 76,158 | 12.2 | 5.1 |
| morrow-shoal → deep-research | 84,953 | 13.6 | 5.1 |

**The shortest lane to an outer hub exceeds the entire round-trip budget on its
outbound leg alone.** No hull in the game can reach the outer third of the map,
from full condition, at any price — one order was offered 5,302 credits against a
carrier ask of 1,387 and still refused. Ore Station One even has its own repair
facility, so its return leg costs nothing, and it is still out of range.

A fresh run now reports 77 freight declines, **all** `beyond-fleet-range` and
none `maintenance-policy`. Every one of the 459 declines in the earlier 31-minute
run was this, not tired ships.

This is why the outer hubs never went quiescent, and — now that a distant region
re-observes its supply instead of inventing it — it is why they visibly starve.
The aggregate used to hide the broken trade route behind phantom deliveries.

### The options, none of which should be picked quietly

1. **A long-haul craft class.** Follows the project's own doctrine — capability
   comes from controlled assets — and makes reaching the frontier an investment
   somebody decides to make. A hub that cannot get supplied commissions a
   different hull rather than another identical one. Largest change; best fit.
2. **Service outposts on the long lanes.** The physically true answer: a long
   haul is legal if you can service partway. `evaluateTransportPlan` only
   considers repair reachable from the DESTINATION today, so this needs staging
   as well as new content.
3. **Move the outer hubs closer.** Cheapest, and throws away the frontier as a
   place that is meaningfully far.
4. **Rebalance wear or hull tolerance.** One number, world-wide consequences for
   every maintenance decision already tuned around it.

Options 1 and 2 keep distance meaningful and make the frontier a thing the world
has to solve. 3 and 4 make it stop being a problem by making it stop being far.

### What was built, and the third thing it needed (2026-08-21)

Option 1, in two halves, because one was not enough.

**(a) The hull.** A mining company that keeps losing an order to
`beyond-fleet-range` prices a counterfactual refit — what would this order be
worth to this ship with a subspace drive — and buys one at 7,500cr if the answer
pays. Three refits happened in the first live run, so the investment path works.

**(b) The price.** Every refused frontier order sat pinned at a flat 2.5x book
and still did not cover the wear: ore-station aluminium paid 750/u and needed
~909, coldwater water-ice paid 750 and needed ~1,548, kiln carbonaceous paid 200
and needed ~288.

The first attempt scaled the cap by a three-step urgency bucket. That was still
a table of authored ceilings, and it produced its own bug live: Ore Station One
repriced once while it was still stocked, hit that moment's ceiling, and could
never raise again as it starved to 0.7 units against a target of 8.

There is no ceiling table now. `chaseMultiple` in `valuation.js` moves
continuously with two things — how short the buyer is, and how long it has been
short — scaled by the buyer's own authored `urgencyBias`, a trait that already
existed on every hub and was not being used for this. What bounds a buyer is its
own money: the affordability check the caller already makes. A buyer that chases
itself into ruin is something this world is allowed to contain.

The traits were already written as characters and now show up in the prices.
Dag Wren at Ore Station One (0.5) "chases supply" and covers his aluminium
inside ten minutes. Sera Okonjo at Coldwater (0.4) "holds its price hard, hoards
its margin" and takes about fifteen, so Coldwater stays dry longer. Tolan Reyes
at Deep Research (0.15) "will not be rushed into paying over the odds", and Deep
Research stays hungry longest of all. None of that is tuned; it falls out of
authored traits meeting one curve.

**(c) Valuing what you bought.** Neither of the above delivered anything,
because the refitted hulls were gone: `mining.workerReleased`, not destroyed.
The hull that just gained reach is precisely the one idling — waiting for the
distant work only it can take — so it sorted first for release by longest-idle.

The first attempt at this was a rule: never retire the last hull holding a
capability nothing else in the fleet has. That was wrong, and was removed. It
made the outcome true by decree rather than by decision, which is the opposite
of how this world is supposed to work. What was actually missing is that the
release decision never weighed what a hull uniquely lets its owner do.

Now each ship reports `capabilityValue` — credits of open work it would accept
and no other ship in the fleet would — and that buys it patience against the
price of replacing a hull, scaled by the operator's own caution. Flint holds a
capability longer than Cinder because Flint is sticky, out of traits already
authored. The planner still does not know what a drive is.

**An operator may still be wrong.** Patience is bounded
(`MAX_CAPABILITY_PATIENCE`); a hull whose work never materialises is sold, and
the hub it served may be cut off. That is content, not a defect — a derelict hub
with a bad decision behind it is a thing the player can find. See
[The frontier is unreachable](#the-frontier-is-unreachable-and-that-is-a-content-decision)
for why some clusters may simply be too far apart to be economically attached at
all, and should be reached by a gate rather than by cheaper wear.

The lesson is the same one this document keeps recording: each fix was correct
and each was invisible, because the next link in the chain undid it. Do not
conclude a capability does not pay until you have checked the thing you built is
still in the world.

## Physical space

Whether a craft can pass through a rock is one rule now, declared on its drive
rather than implied by its class: normal space works around the field, subspace
has nothing to work around, and nothing is half of each. See
[collision-law.md](collision-law.md) for the table of who sits where, and for the
two things it deliberately leaves alone (damage, and the haulers' richer
corridor navigation).

## Known risks and deliberate boundaries

- A busy hub never reaches the current quiescent aggregation gate. This is no
  longer a risk to watch for; it was measured on 2026-08-19 and it is universal.
  Every hub with a live economy stayed blocked for every sample it was far.
  Refusing is still preferable to corrupting an active contract, so the fix is
  the checkpoint, not a weaker gate.
- Regional flow accuracy degrades as its observed supply rate becomes stale.
  Existing measurements show drift increasing roughly linearly beyond the
  observation window.
- Material entering an aggregate is modeled from observed boundary flow; there
  is not yet a conserved aggregate-to-aggregate clearing network with both sides
  of inter-hub trade represented.
- Physical haulers, miners, patrols, wrecks and ecology are not yet converted into
  regional populations and restored from snapshots. The current savings target
  institutional transaction work first.
- Territory surveying, upkeep, revenue, expansion, negotiation, overlap conflict,
  transfer and loss are not implemented.
- Self-sufficiency is a baseline capability, not free inventory or installed
  capacity. Reintroduce asymmetry by changing efficiency, expertise, access or
  assets gradually—not by restoring absolute single-supplier dependencies.
- Bankruptcy, liquidation, repossession, institutional death and a general credit
  market remain incomplete.
- `main.js` and `game.js` remain oversized. Extract only along demonstrated
  ownership boundaries.
- Browser saves are playtest data. Reproduce architecture and economy issues with
  `resetSave=1`.

## Recommended next sequence

1. ~~Run a 30–60 minute fresh remote terrarium test.~~ Done 2026-08-19; findings
   above. No hub aggregated in the unmodified run, so no supply rate has yet
   been observed going stale. Aggregation and restoration themselves were
   verified separately, in a world held quiescent by hand.
2. ~~Add first-class aggregation observability.~~ Done — Observatory **Simulation**
   tab, `src/systems/simulationObservatory.js`.
3. ~~Checkpoint perpetually busy hubs.~~ Largely done, and the diagnosis was
   different from the plan: the gate demanded silence because the aggregate wrote
   ABSOLUTE stock and cash over live records, destroying any delivery or payment
   that landed mid-step. It now reads live state, advances, and writes back only
   its own delta — and nets real arrivals against modelled supply so the two are
   never counted twice. Counterparty work (orders, shipments, extraction) no
   longer blocks. See [level-of-detail.md](level-of-detail.md) Phase D.
   **Still blocking, and still owed a checkpoint:** the hub's own population
   production, factory/construction runs and commissioned protection — the flow
   models those, so both running would double-count.
4. ~~Bound stale-rate drift.~~ Done, together with the first half of item 6 —
   they were one problem. The supply rate is now RE-OBSERVED every step from what
   actually arrives, blended over the window it was measured on, so it cannot
   extrapolate forever and cannot credit freight from suppliers that have
   themselves stopped. Measured: a held rate invents >20,000 units of phantom
   stock over eight hours; a re-observed one does not move. See
   [level-of-detail.md](level-of-detail.md) Phase E.
   **Still owed:** the drift coefficients were derived against a held rate and
   have not been re-derived for a re-observed one. Re-race the model against a
   detailed run before quoting a drift number for a live region.
4b. **Checkpoint a hub's own internal work.** Population production, factory and
   construction runs, and commissioned protection still block, because the flow
   models them too. With the player at the frontier these are now the ONLY thing
   keeping the inner six detailed — several read "eligible in 11s" behind them.
4c. ~~Chase the detailed economy's money residual.~~ Done, and it was never a
   leak. `getActorAccount` returns the SAME account object for `sprc` and
   `scrap-forge` — the compatibility adapters left both ids alive after SPRC's
   operation was consolidated into Scrap Porch — so the reconciler counted that
   treasury twice. Every movement of it landed in `money.total` twice while the
   income and burn that caused it landed once, producing a residual proportional
   to whatever SPRC was doing, with a sign that flipped as it earned or spent.
   Measured before: residual 1144 against a 1200 balance delta. After: a -4067
   delta produces only -190. Purses are now deduplicated by account identity,
   duplicates flagged rather than dropped so their SHELF still counts.
   **Remaining:** about -1.15/s, ~0.87% of money created, no longer correlated
   with any one account. An order of magnitude smaller and unexplained; likely
   rounding across the sampler's many `round()` calls, but not demonstrated.
5. **Aggregate operational/physical populations.** Represent distant haulers,
   miners, patrols and eventually ecology as bounded regional cohorts while keeping
   promoted/bespoke actors as preserved anchors. Restore plausible physical detail
   on approach without cloning title, cargo, condition or commitments.
6. ~~Introduce regional clearing.~~ Built, including across the detail boundary:
   `regionalClearing.js`. Material and credits move in one operation so both
   sides of every payment are real; the carrier is a firm with a hull that could
   have made the trip; a lane no hull could survive is not traded. A detailed hub
   sells out of its real warehouse and only what `getInventoryPosition` says is
   spare, so stock already promised is never sold twice, and both halves share
   `TARGET_COVERAGE_SECONDS` as one definition of enough cover.
   Three sizing bugs were found by RUNNING it, none of which broke conservation
   or failed a test — the accounting was right each time and the signal was
   wrong. Clearing against `flow.shortfall` trades one tick of unmet demand;
   a region between its sell floor and buy target is both buyer and seller and
   two neighbours then oscillate forever; refusing a whole shipment because the
   buyer cannot fund all of it starves a hub beside a full warehouse. See
   [level-of-detail.md](level-of-detail.md) Phase F.
   **Still missing: aggregated hubs cannot SELL to detailed ones.** Procurement
   excludes aggregated hubs from its offers and clearing only routes stock toward
   aggregated buyers, so the frontier can be supplied but cannot export.
   **And read this before building on it:** a live run fires the mechanism
   correctly but moves almost nothing across the boundary, because NO settlement
   in the world has a surplus — every one sits at or below its own target cover
   and three hold nothing at all. The belief that the inner cluster was rich came
   from the overnight run's 315 water-ice at Yard Exchange, and that stock was
   phantom: the held-rate bug fixed in Phase E. First Reach is
   **production-limited, not distribution-limited.** Clearing is the right
   mechanism for when a surplus exists and cannot conjure one.

7. **Connect procedural expansion.** Let institutional projects survey and found
   new settlement seeds, then pass them through the existing common pipeline.
8. **Continue territory as an asset.** Add surveying, claims, upkeep, benefits,
   negotiation and conflict only through shared authority and project systems.
9. **Reintroduce asymmetry one capability at a time** and observe compensation
   before removing another.
10. **Decide whether the world should produce more.** Nobody holds a surplus
   anywhere, which leaves every distribution system correct and idle. Measured
   over 33 minutes: authored demand 14.9 units/minute world wide (~490 across the
   run) against 207 units actually delivered by 39 completed extraction
   allocations — supply meets roughly 40% of appetite. A balance decision across
   extraction rates, population appetite and `TARGET_COVERAGE_SECONDS`.
   **Measure extraction through allocations, not crew career records.** A first
   attempt at this counted crew records and read a flat zero, which was an
   artefact of most hulls being uncrewed rather than a famine.
10b. **The frontier's starvation is now a PRICED decision, not a mystery.**
   `getPostedMiningOrders` used to skip aggregated buyers, so a hub dropped out of
   the mining market the moment it was modelled: no orders, no miners cutting for
   it, nothing arriving, while it sat on tens of thousands of credits. Fixed —
   aggregation suspends a hub's decisions, not its hunger, and the gap is computed
   from live inventory the aggregate keeps current.
   The frontier now posts and is bid on. It is still refused, on economics, and
   the numbers say exactly why:

   ```text
   mine-yard-iron             accept  net +2316   travel  4,731u   wear   416
   mine-ledge-silicate        accept  net  +428   travel  9,725u   wear   856
   mine-kiln-carbonaceous     REJECT  net  -322   travel 14,755u   wear 1,298
   mine-ore-station-aluminum  REJECT  net  -241   travel 48,045u   wear 4,228
   mine-coldwater-water       REJECT  net -3575   travel 84,284u   wear 7,417
   ```

   Wear-per-distance is the dominant cost, exactly as it was for freight before
   subspace hulls. Note Kiln Crossing — an INNER hub — is refused too, so this is
   not only a frontier problem. Ore Station One misses by 241 credits.
   Three ways out, and this is a balance decision:
   (a) **subspace mining hulls**, consistent with what already fixed freight —
       wear x0.15 turns Ore Station's 4,228 into ~634 and the run clears easily;
       needs `valueOrderForWorker` to know which hull is bidding, which it does
       not today;
   (b) **let desperate hubs bid higher** — the model already routes desperation
       through price and Ore Station already pays 4,500 against Yard Exchange's
       3,000; it is short, not absent;
   (c) **soften wear-per-distance**, one number with world-wide consequences for
       every maintenance decision already tuned around it.
11. **Frontier settlements are dying, and it is now visible rather than hidden.**
   A 33-minute run ends with ore-station-one at 0.27 served, coldwater-depot at
   0.03 and deep-research at 0.00, warehouses empty, observed supply decayed to
   zero — while each still holds 27k-45k credits and its households 21k-24k. They
   can afford to buy; there is nothing to buy. Solvent and starving is a
   deliberate outcome of honest accounting, but it is not a stable world, and it
   is the clearest argument for item 10.

## Handoff checklist

1. Start from clean `main`; inspect `git log` before changing behavior.
2. Use the fresh URL and `resetSave=1` for every architecture test.
3. Add a conservation or causal regression test before changing economic rules.
4. Preserve institutional identity and asset provenance across every abstraction
   boundary.
5. Run `npm test` and `npm run validate:content`.
6. Run `npm run bump:cache` before a browser-facing release, then smoke-test local
   and public builds and confirm the displayed build string.
7. Update this document whenever an ownership, conservation or simulation-detail
   boundary changes.

## Self-sufficiency, distance, and how a hub comes to exist (design, 2026-08-21)

Direction set by the player, recorded here before it is built.

**Distance may be a wall, not a cost.** Some clusters should be too far apart to
be economically attached at all. The right answer for those is a gate, not
cheaper wear or shorter lanes — reaching the far cluster becomes a thing the
world builds, not a number that is quietly relaxed. This retires the temptation
of options 3 and 4 above for the outer hubs specifically.

**A hub off by itself must be self-sufficient or own its lifeline.** Either it
produces what it needs locally, or it controls a hauler that can fetch it. That
follows the existing doctrine — capability comes from controlled assets — and it
means a distant hub's supply problem is an asset it holds, not a service the
world guarantees.

**Founding should cost what founding costs (the Anno model).** For a hub to be
out there, something had to carry the equipment out there. Procedural settlement
founding should therefore require both the materials and a ship able to deliver
them — which naturally endows a new distant hub with the vessel that reached it,
and explains why it has one. This connects the institutional-projects work to
`settlementSeedPipeline`.

**Bad decisions are allowed to land.** An operator that fails to value its
long-range hull may sell it and cut its own hub off. The hub then dies, and what
the player finds later is a derelict — possibly one somebody else has taken over.
Failure states should be discoverable places, consistent with the no-Game-Over
ownership ladder already in the design.

### On caps, floors and ceilings (2026-08-21)

A standing instruction from the player, recorded because it has now caught two
separate pieces of work in one sitting:

> "I don't know how I feel about these caps and limits and ceilings and floors
> that are arbitrary. Different kinds of NPCs based on their traits might have
> higher or lower things happening. And as desperation increases, those ceilings
> and floors would continue to move."

The test to apply before writing a constant that bounds a decision:

1. **Is this a shape or a limit?** A curve needs shape parameters and those are
   fine. A ceiling that decides an outcome is not.
2. **Whose number is it?** If two different actors should behave differently
   here, it belongs in traits, not in a module constant.
3. **Does it move?** A bound that is right at one moment and frozen afterwards
   will freeze an actor mid-situation. Ore Station One is the worked example.
4. **What is the natural bound?** Usually something real already in the world —
   what a buyer can afford, what an asset is actually worth. Prefer it to a
   number chosen to feel safe.

Known constants that have NOT been through this test and probably should be:
`MINING_REPRICE_MARGIN`, `MINING_REPRICE_INTERVAL_MS`, the fleet
`minFleet`/`maxFleet` pair, `REGIONAL_HAULER_FLOOR`, and the clearing defaults in
`regionalClearing.js`.
