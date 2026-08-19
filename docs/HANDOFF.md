# Project Handoff — August 19, 2026

This is the authoritative re-entry note for Claude, Codex, or another future
maintainer. Read this file first, then [institutional-npcs-and-assets.md](institutional-npcs-and-assets.md),
[level-of-detail.md](level-of-detail.md), and [territorial-authority-roadmap.md](territorial-authority-roadmap.md).
The older August 6 session note is historical context, not the current checkpoint.

## Stable checkpoint

- Branch: `main`, clean and synchronized with `origin/main` at handoff.
- Institutional terrarium foundation: `e0ba4c1`.
- Distant aggregation/restoration implementation: `e3369de`.
- Browser build: `fresh-20260819-0621-e0ba4c1`.
- Verification: `npm test` reports 852 passing, 0 skipped, 0 failed;
  `npm run validate:content` passes; local and GitHub Pages browser smoke tests
  load without warnings or errors.
- Fresh local URL:
  `http://localhost:8123/?resetSave=1&devStart=explorer&build=fresh-20260819-0621-e0ba4c1`
- Remote URL:
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

Useful live inspection:

```js
window.__asteroids.distantSimulation.getState()
window.__asteroids.clock.getSchedule()
window.__asteroids.economy
```

## Known risks and deliberate boundaries

- A busy hub may never reach the current quiescent aggregation gate. That is
  preferable to corrupting an active contract, but long-run blocker frequency
  must now be measured.
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

1. **Run a 30–60 minute fresh remote terrarium test.** Record when each FAR hub
   becomes aggregate, which blocker prevents it, whether transitions repeat, and
   whether approaching an aggregated hub restores cleanly. Inspect Economy,
   Blockers, Contracts and Ledger alongside `distantSimulation.getState()`.
2. **Add first-class aggregation observability.** Put mode, detail level,
   `farSince`, observation age, blockers, last transition and modeled drift in the
   Observatory so this does not depend on console inspection.
3. **Bound stale-rate drift.** Re-observe/re-sync on roughly the observation-window
   timescale. Never let an hour-away hub extrapolate forever from one early rate.
4. **Handle perpetually busy hubs deliberately.** If real runs show they never
   become quiescent, design a conserved checkpoint for active orders and shipments
   instead of weakening or bypassing the gate.
5. **Aggregate operational/physical populations.** Represent distant haulers,
   miners, patrols and eventually ecology as bounded regional cohorts while keeping
   promoted/bespoke actors as preserved anchors. Restore plausible physical detail
   on approach without cloning title, cargo, condition or commitments.
6. **Introduce regional clearing.** Model both sides of aggregate inter-hub material
   and credit flows so distant regions can trade without one-sided money changes.
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
