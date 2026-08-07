# Project Handoff — August 6, 2026

This is the authoritative re-entry note for Claude, Codex, or another future maintainer. Read this file, then [agent-map.md](agent-map.md) and [session-2026-08-06.md](session-2026-08-06.md), before broad code archaeology.

## Stable checkpoint

- Branch: `main`
- Checkpoint: the commit containing this document
- Browser build: `fresh-20260806-2000-39c17e6`
- Local server: `python -m http.server 8123`
- Recommended fresh test URL: `http://127.0.0.1:8123/?resetSave=1&devStart=explorer&build=2000`
- Verification: `npm test` reports 502 passing, 1 intentional skip, 0 failures (503 total); `npm run validate:content` passes.
- Browser-facing changes require `npm run bump:cache` before final testing.

## Product direction and invariants

Asteroids RPG is a browser-based institutional space simulation. The player is one participant in the same world as NPC people, craft, companies, hubs, populations, authorities, and hazards. Do not add player-only or named-NPC-only shortcuts when the rule should belong to the world.

Conservation is the central invariant: cargo, title, custody, credits, commitments, wear, repair inputs, wrecks, and institutional capacity need traceable origins and destinations. Rejection or failure must not silently destroy property. Physical action and legal/economic settlement should be distinct but connected.

## What exists now

### Six-hub economy

Six settlements now participate in population demand, production, extraction, procurement, freight, pricing, accounts, authority, services, and observability: Yard Exchange, Scrap Porch, The Ledge, Blue Lantern, Morrow Shoal, and Kiln Crossing. Additional mining and carrier institutions create real alternatives rather than one authored path.

Hubs publish needs and compare every legal, reachable supplier by delivered effective cost, capacity, stock delay, distance, relationship, and current ask. Suppliers accept, reserve physical stock, transfer title on sale, and expose prepaid freight only when the goods exist. Buyers and sellers can reprice in opposite directions. `supplier-at-capacity` refusals reopen when capacity clears.

Populations buy settlement supply goods produced from material families. Morrow Shoal has a hardship policy rather than being silently rescued. The Observatory Economy tab records cash, stocks, effective family coverage, demand, production, prices, margins, commitments, and reconciliation residuals.

### Materials and substitution

Resource families now support materials with different effective production yields. Physical units remain cargo/title/mining units; effective units are what hub planning and recipes receive. Current substitutes include aluminum versus iron-nickel, methane versus water ice, and carbonaceous versus silicate.

Institutional feedstock value is separate from player processing/shop value. Low-grade carbonaceous is cheap per crate but bulky at 0.65 effective industrial units, while silicate is compact at 1.0. Supplier selection prices delivered effective output, so distance and freight capacity can reverse the apparent bargain. Contract and economy views expose both physical and effective quantities/prices.

### Mining

Cinder Contracting and Flint Prospecting use the same extraction market, capability and valuation seams. Their physical worker craft find deposits, shoot rocks, tractor loose resources, aggregate multiple contracts and cargo types, deliver against real orders, sell uncommitted surplus, pay operating expenses, accumulate component wear, request service, and can expand within bounded policy.

The player can accept the same procedural extraction work locally. Mining authority is checked through resource-family rights rather than named material exceptions. Extractions are real conserved transactions, not a separate player economy.

### Freight and carrier growth

NPC and player freight use the same purchase-backed manifests, title, custody, loading, route, delivery, and settlement lifecycle. Haulers can carry multiple compatible contracts and build a deterministic multi-stop itinerary. Contract acceptance remains a physical dockside market action.

Carrier selection considers price, repositioning, route cost, wear, commitments, relationships, and maintenance access. Haulers use procedural corridors and can travel quickly on their cleared centerlines. Their component condition and physical combat durability are real.

Carrier expansion is demand-led: all owned operational capacity must remain committed for 60 seconds while loadable freight is waiting. The old global six-hauler cap is gone; the current limits are four operational haulers per carrier and twelve region-wide. A carrier must still fund the 6,000-credit hull. If it cannot, `carrier.hireDeferred` appears visibly in the ledger. Total fleet loss has a separate emergency-finance path.

### Contracts shared by player and NPCs

The contract board projects extraction, purchase, freight, SPRC feedstock, repair, protection, salvage, and the evergreen gate-trophy bounty. Local acceptance and eligibility remain domain rules; the global board is an observational projection, not an omniscient remote acceptance mechanism.

Player and NPC mining, freight, and protection now converge on common underlying records. Multiple-contract portfolios exist for mining and freight. Partial or failed operations conserve cargo and commitments.

### Wear, repair, recovery, insurance, and salvage

Persistent craft are collections of independently wearing components with current condition, permanent lifetime degradation, maximum recoverable condition, stage, and service history. Mining, freight, patrol, recovery, hostile craft, gates, and the player have class-appropriate component records. Work—not wall-clock time—causes ordinary wear.

SPRC publicly matches freight and mining repairs by craft class, issue, capability, facility, mobility, affordability, and materials. Its queue can bypass a material-blocked job for a ready repair. Sal plans reserves, procures and produces repair inputs, buys useful wreck title, queues physical dismantling, and preserves a growth objective.

First Reach Recovery, insurance, titled wrecks, salvage contracts, and ownerless hostile salvage form the beginning of a used-universe loop. Tow workers perform physical recovery. Player hull repair reserve continues operating through zero integrity while reserve remains.

### Patrols and incursions

Patrol offices and Sable Meridian Security are institutions with accounts, controllers, authority, titled craft, capabilities, and finite availability. Hubs choose direct, contracted, or hybrid protection from real threat, exposure, distance, force, cash, and policy. Independent providers bid, reserve one craft, physically travel, fight, return, and are paid only for successful threat clearance.

The player can see and accept compatible public protection work through the same request records. Incursions can target economic craft and hubs; casualties create real capacity, salvage, repair, insurance, and protection consequences. Encounter direction observes economic casualties and can ease or escalate opposition within bounds.

### Observatory and ledger

The Observatory exposes actors, blockers, contracts, economy, ledger, statistics, populations, and the wear lab. Actor cards include IDs, ownership/control, finances, intentions, cargo/portfolio, condition bars, and representative craft. Actors are alphabetized and dynamically commissioned craft receive distinct public identity.

Ledger retention is classified as ephemeral, operational, or durable and bounded accordingly. Diagnostics answer what an actor is doing, why, what it awaits, and what wakes it. Economy sampling is bounded to avoid the prior long-run UI throbbing/performance failure.

## Architecture boundaries

- `src/main.js`: DOM, panels, browser coordination and UI projection. Keep domain decisions out.
- `src/game.js`: physical simulation, streaming, collisions, combat and rendering. It remains large.
- `src/state/gameState.js`: initial/compatibility state and save migration.
- `src/content/**`: identities, institutions, policies, archetypes, recipes, contracts, missions and network configuration.
- `src/systems/**`: reusable rules, markets and operation managers.
- `src/entities/**`: physical craft, objects, rocks and pickups.

Important seams: `actorConfig.js`, `institutionDecision.js`, `extractionMarket.js`, `extractionOffers.js`, `hubInventory.js`, `hubProcurement.js`, `logistics.js`, `transportationPlanning.js`, `contractBoard.js`, `componentCondition.js`, `sprcOperation.js`, `protectionPlanning.js`, `protectionProviders.js`, `economySampler.js`, `diagnostics.js`, and `eventLedger.js`.

## Known risks and deliberate boundaries

- Carrier expansion is not guaranteed merely because work exists. Capital is real. Growth loans beyond total-fleet-loss emergency finance are not designed yet.
- There is no independent merchant layer. Buyers currently discover suppliers and separately hire freight. A future merchant may buy/title goods and hire carriers, while an owner-operator hauler can perform both roles.
- Repair and recovery have reusable matching edges but SPRC and the current recovery operation remain singleton-heavy internally. A second provider is the proper generalization test.
- Actor lookup resolves several operation-owned state shapes rather than one canonical institution catalog.
- Market knowledge is still broader than the eventual beacon, communications, relationship and rights model should permit.
- Population demand uses a bounded income faucet and abstract final consumption. Manufacturing is limited to settlement supplies and repair inputs.
- Bankruptcy, liquidation, repossession, replacement markets and institutional death are incomplete.
- The loaded-freight recovery integration test remains skipped and should be restored before deepening failure chains.
- `main.js` and `game.js` remain oversized. Extract only around demonstrated ownership seams.
- Browser saves are playtest data; always reproduce architecture issues with `resetSave=1`.

## Recommended next sequence

1. Run the fresh build for 20–30 minutes and inspect Economy, Blockers, Contracts and Ledger. Confirm the six-hub economy maintains production, clears reservations, and does not accumulate unbounded records.
2. Decide carrier capital policy from observed `carrier.hireDeferred` events: retained earnings only, growth loans, leases, or hub-backed guarantees. Do not spawn free ships.
3. Finish ordinary public maintenance matching for patrol and recovery craft, then use a second repair provider to extract only the seams actually needed.
4. Close the loaded-freight recovery test and the remaining salvage/manufacturing handoff.
5. Introduce a minimal merchant institution only when comparing ownership/spread versus hired carriage is the actual next experiment.
6. Continue the used-universe chain: used parts, fabrication, resale, reliability, debt, repossession and ownerless hostile salvage.
7. Extend authority upward only through concrete rights: mining, transit, patrol, salvage, trade and settlement charters with issuers, scope, inspection and revocation.

## Handoff checklist

1. Read this file and the dated session record.
2. Inspect Git history and preserve user changes.
3. Reproduce with a fresh save and cache build.
4. Add a conservation or causal regression test before changing economic behavior.
5. Run `npm test`, `npm run validate:content`, `npm run bump:cache`, and a browser smoke check.
6. Update this handoff whenever an ownership boundary or economic invariant changes.
