# Project Handoff - July 26, 2026

This is the authoritative re-entry note for Claude, Codex, or another future maintainer. Read this file, then `agent-map.md`, before broad code archaeology.

## Product direction

Asteroids RPG is a browser-based institutional space simulation. The player is one participant in a world of people, ships, institutions, accounts, documents, contracts, freight, mining, repair, authority, ecology, and hazards. New features should strengthen shared world rules rather than create player-only or named-NPC-only exceptions.

The strongest current design principle is conservation: cargo, inventory, custody, credits, wear, repair inputs, and institutional commitments should have traceable origins and destinations.

## Stable checkpoint

- Branch: `job-board-archetypes`
- Handoff checkpoint begins at commit `c19da17` (`Conserve mining deliveries and close local supply loop`).
- Local server: `python -m http.server 8123`
- Recommended test URL: `http://127.0.0.1:8123/?resetSave=1&devStart=panorama`
- Browser-facing changes require `npm run bump:cache` before final testing.
- Verification commands: `npm test` and `npm run validate:content`.
- At handoff, 61 tests and content validation pass.

## What is playable now

- The guided opening introduces Rook Industries, a provisional license, Yard Exchange, a starter ship loan, ship purchase, and mining work.
- The player can fly, dock, mine physical asteroids, tractor loose resources, process cargo, accept local work, haul or deliver real materials, and interact with hub services.
- Unaccepted contracts remain at their issuing location; accepted paperwork becomes portable.
- The ledger exposes world events, filters by institution/character, and supports wheel scrolling.
- Yard Exchange, Scrap Porch, and The Ledge participate in freight and mining loops.
- A reusable procedural freight-corridor system builds deterministic curved roads from authored connections, including cleared shoulders, obstacle maintenance, route waypoints, bidirectional kinetic speed pads, and safer NPC pathing.

## Living institutions

### SPRC and Sal

Scrap Porch Recovery Cooperative is the deepest institutional vertical. Sal is a person-archetype institution controlling SPRC rather than a special actor type.

SPRC owns an account, protected reserve, inventories, facilities, policies, needs, responses, projects, procurement orders, production orders, a repair queue, and public repair capabilities. Sal plans structural, mechanical, and modest copper/Scanergy-material reserves and retains the Second Repair Cradle as a planned growth objective.

Repairs match craft/object class, condition issue, required capability, facility compatibility, location/mobility, payer affordability, and available/procurable material. The freight haulers and unregistered Cinder mining craft use this public service path. Ready repairs can bypass an earlier material-blocked job.

SPRC procurement accepts outcome-equivalent materials, pays for accepted units, commits cash on publication, protects its reserve, joins compatible needs into one order, and reconsiders blocked responses when funding changes. Orders have a 45-minute base deadline and up to three 20-minute extensions while institutional allocations are physically in transit.

Rejected mining deliveries are transactional: cargo and assignment remain with the miner. Partial demand is recalculated before replacement procurement, preventing a new full-size order after a nearly completed one.

SPRC checks Scrap Porch's local supply inventory before publishing outside structural or copper procurement. This is the first local wholesale path, not yet a general market.

### Cinder Contracting

Ivo Cinder controls a mining institution with three physical worker ships and a bounded fourth-ship expansion project. Workers use flight physics, regional deposit knowledge, asteroid streaming around remote workers, real mining shots, tractor fields, physical pickups, persistent accounts, and work-based wear.

SPRC material orders have priority over ordinary extraction because the repair economy can otherwise stop. An eight-equivalent Sal order is normally split into a six-unit trip and a two-unit remainder. SPRC miners harvest up to six units before returning, allowing multiple rocks per trip; surplus is sold into the destination hub's real supply inventory.

Cinder ships can develop structural fatigue, tractor-field instability, field-control failure, or preventive-calibration needs from completed work. A fault can disable mining while allowing return to SPRC. Repair recipes use ordinary structural, mechanical, and copper/Scanergy-family inputs, not rare advanced crystals.

### Freight and recovery

Named haulers own accounts, documents, identities, cargo custody, wear, maintenance policy, and persistent decisions. Freight loading requires real source inventory. The player and NPC miners feed the same inventory used by haulers; there are no separate player goods.

Long-haul eligibility includes route wear and the ability to reach a compatible repair provider with a safety margin. Worn haulers decline unsafe freight or return empty for maintenance. Disabled loaded carriers preserve cargo through First Reach Recovery: delivery destination first, then SPRC. Blue Hook is a physical recovery worker, not teleportation.

Docking tethers visualize the actual transferred resource shape and color for player and NPC custody changes.

### Sunward Acre

Tavi controls the farm institution transfer test. It uses the generic need, policy, priority, affordability, response, commitment, and reconsideration seams. It is executable in simulation/tests and visible through institutional/ledger data, but is not yet a physical farming gameplay vertical.

## Architecture boundaries

- `src/main.js`: page/UI coordinator. Avoid adding domain logic here when a system module can own it.
- `src/game.js`: physical simulation, rendering, streaming, collisions, sites, ships, hazards, and worker integration.
- `src/state/gameState.js`: initial and compatibility state.
- `src/content/**`: authored identities, services, contracts, missions, connections, recipes, policies, and archetypes.
- `src/systems/**`: reusable rules and operation managers.
- `src/entities/**`: physical actors and world objects.

Important modules:

- `institutionDecision.js`: domain-neutral needs, problems, responses, policy, priority, affordability, capability proposals, targets, and reconsideration.
- `sprcOperation.js`: repair-specific execution and SPRC operation state.
- `miningOperation.js` / `MiningWorkerShip.js`: institutional extraction dispatch and physical worker behavior.
- `logistics.js`, `transportationPlanning.js`, `transportCorridors.js`, `towService.js`: freight, eligibility, roads, and recovery.
- `contractManager.js`: shared contract lifecycle and settlement bridges.
- `eventLedger.js`: shared event memory and stats.

Shared institution-engine code must not contain authored nouns such as Sal, SPRC, Mara, hull plates, repair cradles, farming, or crops. A source-guard test enforces this boundary.

## Known boundaries and risks

- `main.js` and `game.js` remain oversized coordinators with compatibility bridges. Refactor only around demonstrated seams.
- Browser saves are development data; compatibility is intentionally not guaranteed across architecture changes.
- The local wholesale path is narrow. There is no generic order book, price discovery, tax system, NPC fuel economy, or market competition.
- Partial SPRC deliveries pay accepted units immediately. No lateness/inconvenience fee exists; observe timing before adding one.
- In-transit deadline extensions are capped. A truly stuck worker can eventually expire, but its cargo remains conserved.
- Surplus selling targets the local hub institution at a fixed fraction of authored trade value. Generalize only when a second buyer proves the need.
- Cinder Four is a bounded growth proof, not a general institution growth planner.
- The farm proves evaluator transfer only; it has no physical workers, fields, crops, or visible service loop.
- Incursion craft and gates do not yet share the full wear/service/scrap lifecycle requested for ordinary ships.
- Corridors are reusable from authored connections, but governance, construction cost, ownership, maintenance funding, races, and procedural decisions about which hubs deserve roads remain future work.
- Authority/document systems exist but do not yet universally gate every docking, contract, inspection, and enforcement action.

## Recommended next milestone

Observe the closed economy before broadening it. Add a small simulation diagnostic that answers, over a 20-30 minute ordinary run:

1. Which institutions held each key material and credit balance over time?
2. How long did haulers wait for inventory, miners wait for work, and repairs wait for inputs?
3. How many jobs expired, extended, rejected, or completed?
4. Which ships entered maintenance, why, and how long were they unavailable?
5. Did Cinder's expansion improve throughput without flooding supply?

Use those measurements to tune quantities, payouts, deadlines, wear, and reserve targets. Then make one second buyer/seller institution use the wholesale seam. Generalize only what that second instance actually needs.

After observation, the best larger feature is the requested universal non-player wear/service/scrap lifecycle. Start with one incursion craft class, use public repair matching where compatible, and turn unrecoverable destruction into conserved salvage. Do not fully simulate every ambient object at once.

## Handoff checklist

1. Read this file and `agent-map.md`.
2. Inspect Git history and the working tree; preserve unrelated user changes.
3. Reproduce with `resetSave=1` because old saves can misrepresent current code.
4. Add a conservation/regression test before tuning live behavior.
5. Run cache bump, content validation, tests, and a fresh browser smoke check.
6. Update this handoff when a major ownership boundary or economic invariant changes.
