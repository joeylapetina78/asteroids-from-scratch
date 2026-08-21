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
4c. **Chase the detailed economy's money residual.** ~-9/s before any hub
   aggregates, ~-27/s after; the aggregated hubs measure zero, so it is not the
   boundary. Own investigation, with the Economy tab and `reconcileMoney`.
5. **Aggregate operational/physical populations.** Represent distant haulers,
   miners, patrols and eventually ecology as bounded regional cohorts while keeping
   promoted/bespoke actors as preserved anchors. Restore plausible physical detail
   on approach without cloning title, cargo, condition or commitments.
6. **Introduce regional clearing.** Re-observation stops an aggregate inventing
   supply that nobody sent, which is the destructive half. The constructive half
   is still missing: two aggregated regions cannot presently trade with each
   other at all, so a fully-aggregated world has no inter-hub commerce rather
   than cheap inter-hub commerce. Model both sides of aggregate material and
   credit flow so distant regions keep trading without one-sided money changes.
7. **Connect procedural expansion.** Let institutional projects survey and found
   new settlement seeds, then pass them through the existing common pipeline.
8. **Continue territory as an asset.** Add surveying, claims, upkeep, benefits,
   negotiation and conflict only through shared authority and project systems.
9. **Reintroduce asymmetry one capability at a time** and observe compensation
   before removing another.

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
