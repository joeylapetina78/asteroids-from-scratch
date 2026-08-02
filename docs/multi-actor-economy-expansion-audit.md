# Multi-Actor Economy Expansion Audit

**Date:** 2026-08-01  
**Baseline:** `main` at `f7e757a` (`fresh-20260801-1154-52a7508`)  
**Scope:** The three-hub economy, its actor framework, and readiness for three additional hubs and competing businesses

## Executive verdict

The project now has a real reusable **decision substrate**, but not yet a fully reusable **market substrate**.

That distinction matters. Actors can resolve configuration with provenance, assess affordability, value opportunities, rank extraction work, expose intentions, explain blockers, and perform conserved transactions. Those are substantial architectural gains, not a facade. The live three-hub economy is genuinely simulated: populations consume, hubs buy and sell, miners extract, carriers move owned goods, SPRC procures and repairs, and recovery can intervene.

However, the present economy still depends on there being one obvious path through several important markets. Hub procurement asks for **the supplier**, not a ranked set of suppliers. Repair and recovery have generic matching or pricing seams but remain backed by singleton state and named execution paths. Mining has a generic public extraction surface, yet the only mining operation and much of its fulfillment lifecycle are still Cinder-shaped. Actor configuration is discoverable through one resolver, but the authoritative records remain spread across several incompatible state layouts.

Therefore:

- Adding six hubs as extra authored activity now would likely produce a larger vertical slice, not yet prove a competitive economy.
- Adding **one alternative at a time**, after a small number of prerequisite seams, is exactly the right architectural test.
- Do not build a universal planner first. Generalize only candidate discovery, choice, operation instancing, and settlement seeding far enough for the second supplier/provider to work without named code.

The short answer to the central question is: **there is a reusable economy emerging, but its current generality is strongest inside actors and weakest between competing institutions.**

## Buyer, merchant, and carrier boundary

The preferred replacement for singular hub supplier discovery is not to make each hub a smarter omniscient purchasing agent. It is to separate three economic roles:

1. **Buyer:** A hub or institution publishes a buy order describing what it needs, where it needs it, its quantity, deadline or urgency, acceptable substitutions, and maximum delivered price. It need not know the eventual supplier.
2. **Merchant:** A trading institution discovers compatible sell stock or production offers, evaluates the spread and risk, acquires title to the goods or brokers the transaction, and commits to satisfy the buy order. It owns the commercial decision.
3. **Carrier:** A transport institution quotes and physically moves goods between custody locations. It need not own the cargo or speculate on the commodity.

A single institution may hold more than one role. An owner-operator hauler can be both merchant and carrier: buy low, take title, transport, and sell into a buy order. A larger merchant can own no ship and hire a carrier. A hub quartermaster may occasionally self-procure, but should do so through the same public order and quote mechanisms rather than a private supplier table.

The reusable flow should be:

`need -> buy order -> merchant proposal/commitment -> source acquisition -> carrier quote/commitment -> physical delivery -> buyer acceptance and settlement`

This preserves an important distinction currently blurred by hub procurement: **the goods trade and the freight service are two transactions**, even when one actor performs both. Title, custody, commercial risk, and payment should be independently visible.

The smallest implementation should add merchant evaluation as a capability-based intention over public buy orders and public sell/production offers. It does not require a global auction house. Actors may only consider markets they know, can legally access, can finance, and can route between.

## Evidence reviewed

This audit covered the current architecture and handoff documents, actor inventory and prior actor-framework audit, economy roadmap, implementation modules, tests, world configuration, and a fresh browser run.

Verification at this baseline:

- `npm test`: **325 passed, 1 skipped, 0 failed** (326 total)
- `npm run validate:content`: **passed**
- Fresh runtime: the observatory reported **28 contracts** after the opening minutes: 6 open, 12 working, 9 complete, and 1 stuck
- The stuck contract had an explicit `supplier-at-capacity` blocker rather than failing silently
- A miner inspector displayed ranked extraction candidates and reasons, but also explicitly reported: **“Institutions do not carry beacon access yet; NPC visibility is unfiltered.”**
- The one skipped integration case is the loaded-freight recovery scenario. That is not a broad indictment of the suite, but it is an important risk marker in the most failure-prone cross-system chain.

### Phase 0 long-run observation

A continued run of the same build was inspected roughly 22 minutes after the opening snapshot. The contract history had grown from 28 to **76 contracts**:

- 53 completed
- 17 working
- 5 open
- 1 stuck

The economy had mined 171 units: 77 water ice, 55 iron nickel, 35 silicate, and 4 copper. Cinder had expanded to four active ships, accumulated 36,237 credits on the inspected ship account, and incurred at least one mining fault and 1,425 credits of reported upkeep.

The active constraints were coherent rather than silent:

- all four Cinder ships were committed;
- The Ledge lacked volatile material and had to buy from the single hub permitted to mine it;
- Yard Exchange owed three iron nickel on an underfilled order;
- all three populations were waiting for a settlement supply unit;
- the observable purchase backlog still contained one stuck order.

This demonstrates sustained throughput and useful blocker diagnostics, but it also shows that one mining business and one predefined producer per resource are carrying the whole economy. The system responds to scarcity by filling every known supplier and waiting; it does not yet invite independent merchants to discover spreads, finance inventory, assemble shipments, or find a second source.

The actor table also displayed repeated public names for expanded carriers and Cinder Four. Those may be distinct institution/craft records rather than duplicate state, but the ambiguity is an observability defect: every row should expose its institution or asset ID and controller so added competitors cannot be confused with duplicate actors.

## 1. Overall verdict

### What is real

The economy is not a scripted animation. Materials, custody, commitments, payments, deterioration, service, and production interact through stateful systems. A changed actor trait or relationship can alter some decisions. Miners consume a shared extraction-offer surface. Hubs derive demand from population inventories. Carrier trips are physically executed and evaluated against travel and wear. Blockers and intentions can be inspected while the simulation is running.

### What is still conditional

The present world has exactly one practical producer for each hub commodity, one mining company, one repair operation, one recovery operation, and two freight carriers. In those conditions, ranking an opportunity is easier than discovering a real choice. Some “generic” interfaces receive a candidate set that has already been narrowed to one answer by authored tables or singleton state.

The next architectural proof is not six hubs. It is **one choice where no choice existed before**, with the loser remaining viable and explainable.

## 2. Strongest parts of the current design

### Shared valuation and explainable decisions

`valuation.js`, actor traits, relationships, cost basis, and the actor inspector form a good decision seam. The runtime can show not only what a miner chose, but rejected alternatives and comparative net values. This is the right foundation for competitive selection.

### Public extraction offers

`extractionOffers.js` is the cleanest market seam in the project. Sources are state-scoped, failures are isolated, miners read one normalized offer shape, and a new issuer can participate without being named in mining selection code. This is the model to imitate—carefully—for freight and services.

### Conserved physical and financial loops

The simulation generally moves rather than duplicates materials and credits. Goods have custody, orders reserve funds, repair consumes real inputs, and carrier/service payments have counterparties. Tests around conservation, affordability, and quote-then-gate service are particularly valuable.

### Diagnostics and observability

The developer observatory, typed blockers, actor inspector, ledger, and provenance reporting are unusually strong for this stage of a simulation. In the fresh run, `supplier-at-capacity` was visible immediately. The observatory already turns many “NPC is parked” reports into inspectable causal chains.

### Domain execution remains concrete

Mining, hauling, repair, and towing have not been prematurely flattened into one abstract action executor. That is a strength. The game still models meaningful physical differences between these operations.

### Tests increasingly prove configuration matters

Recent tests do more than assert constants. They verify that traits, relationships, cost basis, rights, actor registration, and fallback provenance affect outcomes. The source-order and alternative-choice tests recommended below should extend this style.

## 3. Most serious remaining problems

### Deep issue: supplier discovery is singular

`hubProcurement.js` still contains `findSupplier(family)`. It selects one standing mining-order row and treats that institution as the supplier. A buyer never receives two legal suppliers to compare.

This is the most direct blocker to the proposed expansion. Price, distance, urgency, risk, relationships, and commitments cannot influence supplier choice if the candidate list contains one supplier. Adding another producer row without replacing this function would create source-order dependence disguised as economics.

### Deep issue: repair and recovery are generic at the edge, singleton in the middle

`maintenanceService.js` can match a subject to capabilities, facility, mobility, affordability, and recipe. That is a useful seam, but it is given one institution to evaluate. `sprcOperation.js` is a 1,400-line operation bound to `state.sprc`; repair orders, inventory, facilities, procurement, deferred requests, and settlement all live there. Mining and logistics still transfer money or requests directly through `state.sprc` in places.

Recovery has made major progress in configurable pricing and actor registration, but its live operation still resides under `state.towing`. A second repair shop or tow provider cannot be instantiated primarily from data today. These singletons were acceptable while those services had no competitors; the proposed expansion makes them architectural blockers.

### Deep issue: actor configuration is resolved, not canonical

`actorConfig.findActorRecord` is a valuable anti-corruption layer, but it searches several authoritative shapes:

- logistics institutions and ships
- mining institution, controller, and workers
- SPRC institution and controller
- populations
- towing institution, controller, and vehicle
- farm institution and controller

Every new operation type must teach the resolver where its records live. This does not require an immediate universal entity-component store, but it does require a single actor/institution catalog or registration seam from which operation-owned runtime state can be reached.

### Deep issue: no shared provider/offer commitment path

Extraction offers are normalized before choice. Purchase, freight, repair, and recovery are normalized mostly for display after their domain systems have already made important decisions. The contract board is a projection, not a shared executable market.

Without a small shared offer/quote/commitment lifecycle, each new competitive domain will reinvent candidate visibility, reservation, expiration, affordability, rejection reasons, and failover.

### Deep issue: market visibility is global

The runtime inspector states that NPC visibility is unfiltered. Beacon access, discovered routes, relationships, rights, reputation, and communication range do not yet determine which offers an actor knows about. With three nearby alternatives, global omniscience will make geography and information networks cosmetic.

### Serious simulation issue: demand is symmetric and externally funded

`POPULATION_PROFILES` currently seeds three populations with largely identical policy and need sets, while `POPULATION_NEEDS` supplies four global recipes/cadences. Population size does not yet create convincingly different demand behavior. Credits are injected periodically and capped, and consumed goods disappear into abstract population satisfaction.

That bounded faucet is a reasonable prototype stabilizer, but it can produce artificial equilibrium. Six similarly seeded hubs may look busy while revealing little about resilience, specialization, or wealth distribution.

### Serious simulation issue: failure recovery is incomplete

There is no general bankruptcy, default, liquidation, replacement, or institutional death loop. A carrier can become permanently stranded when it cannot afford recovery, which is honest but can silently remove capacity. Fleet expansion and layup use fixed timers and thresholds and may oscillate under stress. The skipped loaded-freight recovery integration test covers exactly the kind of cross-domain chain most likely to regress.

## 4. Repeated and hardcoded structures

These items are not all equally harmful. The key question is whether they define authored world content or secretly define system behavior.

| Structure | Current form | Classification | Why it matters |
|---|---|---|---|
| Hub roster, controllers, starting inventories | Inline in `logistics.createInitialLogisticsState` | Must consolidate before six hubs | A settlement is currently assembled across logistics, population, rights, sites, and mining-order tables |
| Standing mining orders | Three rows in `STANDING_MINING_ORDERS` | Leave data-authored, change consumption | Rows are fine; selecting the first matching row is not |
| Population profiles and needs | Three profiles plus four global needs | Expansion should expose | Useful content data, but current symmetry hides whether policies really matter |
| Transport connections | Three authored links | Intentionally authored | Geography should be data and missing connections should fail loudly |
| Carrier repair options | One `FIRST_REACH_REPAIR_OPTIONS` entry copied into carriers | Must change for competing repair | An array exists, but no live multi-provider discovery/choice has been proven |
| Mining rights | Explicit hub rows | Intentionally authored, seed consistently | Rights are valuable content; settlement creation should emit the expected rows |
| Trade rights | Seeded but unenforced | Must decide before competition | Otherwise “legal supplier” is only documentation |
| SPRC operation | `state.sprc`, module constants, direct callers | Must instance before second shop | Copying it would duplicate a vertical slice |
| Tow operation | `state.towing` | Must instance before second provider | Configurable prices do not make the operation multi-instance |
| Mining operation | `state.miningOperation`, Cinder-specific lifecycle | Must instance before second miner | Public work discovery is generic; ownership, fleet growth, service, and surplus execution are not |
| Repricing/capacity timers | Separate fixed policies in hub, freight, SPRC systems | Ordinary debt, expose provenance | Duplication will make balancing opaque but need not block the first competitor test |
| Site-to-institution/name mappings | Major copies recently removed | Strong progress | Do not reintroduce them through six-hub convenience tables |
| Direct `state.sprc` references | Mining, logistics, board, UI, save paths | Must remove from economic execution; UI/save migration may remain temporarily | Outside customers should discover a provider, not know Sal’s state key |

## 5. Fix before adding the three new hubs

These are the minimum reusable seams, not a universal AI rewrite.

### A. Replace singular supplier lookup with candidate discovery and pure ranking

Create a function that returns every visible, legal, capable supplier for a requested family and quantity. Evaluate each candidate using:

- delivered goods price
- freight/distance cost
- expected wear and route risk
- urgency and service level
- relationship/trust modifier
- available stock and production lead time
- current commitments and capacity
- buyer affordability and protected cash

Return a standard evaluation record with accepted/rejected status and reasons. Selection must be independent of array insertion order.

### B. Introduce a settlement seed bundle

One data record should be sufficient to emit or reference:

- settlement institution and controller
- site/place identity
- population profile
- starting accounts and inventories
- production/supply specialization
- rights and jurisdiction grants
- network connections
- policies, relationships, and market knowledge

The systems may continue to own runtime state. The seed bundle prevents a fourth hub from being partially created in five files.

### C. Make service operations instance-addressable

Convert repair and recovery state from named singletons to operation instances keyed by institution ID (or place them in an operation registry). Domain-specific execution should remain domain-specific. The required change is that callers ask for a selected provider and operation instance, not `state.sprc` or `state.towing`.

### D. Add a minimal shared offer/quote/commitment envelope

Do not universalize every contract. Standardize only the fields needed for competition:

- offer/provider/buyer IDs and kind
- capability and location constraints
- price or quote basis
- capacity/availability
- visibility and legal eligibility
- expiration/reconsideration
- reservation/commitment state
- rejection/blocker reasons

Each domain can keep its own fulfillment payload and executor.

### E. Define market knowledge and enforce relevant rights

Before alternatives exist, decide how an actor learns of them. A first version can use discovered hub/route records plus explicit relationships. Enforce trade/service rights where candidate lists are formed, or explicitly remove those seeded rights until they mean something.

### F. Close the most dangerous failure test

Unskip or replace the loaded-freight recovery integration test. Add long-run invariants for conserved cash/material/custody, bounded outstanding orders, and “every prolonged wait has a blocker plus a wake condition.”

## 6. Intentionally leave for the expansion to expose

The following should not delay the first alternative supplier/provider:

- A universal motivations, goals, or long-horizon planning framework
- One generic executor for mining, hauling, repair, farming, and towing
- Fully simulated households, wages, taxes, banking, bankruptcy, insurance, and depreciation
- Procedurally generated transport geography; authored routes are appropriate
- Perfectly balanced prices or elimination of the bounded population money faucet
- Preemptive scheduling for every urgent job
- Complete skill modeling for every worker and craft
- Time-series dashboards beyond the current observatory

Instead, instrument these limitations and let asymmetric competitors reveal which one next constrains believable behavior.

Population profiles should deliberately differ in the expansion, but the population subsystem can remain an abstract sink. Fixed cadences and caps can remain if they are data, visible in diagnostics, and varied between hubs.

## 7. Recommended expansion sequence

### Phase 0 — Establish the baseline

Run the existing three-hub world for a fixed simulated interval and record throughput, unfilled demand age, inventory, cash, failures, idle time, provider utilization, and blocker counts. Preserve the seed and build identifier.

### Phase 1 — Prove supplier choice without adding a hub

Add a second legal supplier for one existing commodity at an existing site or test fixture. Feed both through candidate discovery. Prove that price, distance, relationship, risk, and capacity can each change the winner in isolation.

**Implemented 2026-08-01:** `hubProcurement.evaluateSupplierCandidates` now gathers all configured extraction definitions for the requested family, verifies that their institutions exist and hold the relevant mining right, requires a transportation route and sufficient uncommitted sale capacity, and ranks eligible suppliers by estimated delivered cost. The estimate combines the supplier's live cost basis and trait/relationship-shaped ask, route freight cost, available stock, and the production required before pickup. Ties are resolved by stable IDs, never authored array order. Purchase orders and buyer diagnostics retain the considered candidates, scores, metrics, and rejection reasons. Focused tests prove order independence, distance choice, cost-over-distance tradeoff, capacity failover, and relationship influence. Risk remains a later input because current transport connections do not yet publish a route-risk value.

### Phase 2 — Add one fourth settlement from one seed record

Give it an asymmetric population, controller, balance sheet, inventory, rights, relationships, and geography. It should be able to buy from two suppliers and sell at least one substitute product. No shared system code should name it.

**Seed prerequisite implemented 2026-08-01:** `src/content/economy/firstReachSettlements.js` is now the authoritative catalog for the three current settlements. Each seed owns its institution and controller records, opening account and inventory, renewable resource, population profile, extraction specialization, mining families, and authority place identity. Logistics initialization and save migration, population profiles, extraction definitions, mining grants, trade grants, and hub-place seeding are derived from that catalog. Authored transportation connections remain deliberately separate geography. Contract tests verify that every seed emits the complete cross-system bundle and that live exports are projections of the catalog. The next step is now truly adding the fourth asymmetric seed plus its authored connection, not first performing another consolidation.

**Fourth-settlement proof implemented 2026-08-01:** Blue Lantern is now instantiated through that same seed catalog, with Nia Pell as controller, its own balance sheet, population, opening inventory, volatile extraction right, and a deliberately different caution/growth/urgency profile. Its physical hub and Blue Lantern Spur are authored geography rather than decision-engine cases. The existing population, mining, procurement, authority, and logistics systems discover it without shared code naming it. In the opening market it competes directly with Scrap Porch for volatile orders and wins Yard Exchange business on delivered economics; tests retain both competitive-world assertions and isolated single-seller fixtures for bilateral bargaining behavior. This proves the data seam can add a hub and alter trade topology. It does not yet prove long-run supplier switching, route-risk choice, or competitive services.

### Phase 3 — Prove one competitive service market

Instance a second repair **or** recovery provider, not both at once. Repair is the stronger test because it exercises capabilities, recipes, inventory, procurement, scheduling, and affordability. Require provider failover when the preferred shop is busy, incompatible, unreachable, or unaffordable.

### Phase 4 — Prove a second mining business

Instantiate a non-Cinder mining operation using the same extraction offers and actor configuration seams. Give it meaningfully different fleet cost, risk tolerance, relationships, protected cash, and home geography. It must sometimes choose differently from Cinder for explainable reasons.

**Initial competitive-mining proof implemented 2026-08-01:** Mining-company identity, controller, treasury, fleet seed, home geography, naming, and optional expansion project now come from `src/content/economy/miningInstitutions.js`. Cinder Contracting and the new Flint Prospecting instance run the same operation code, read the same extraction-offer market, and share the same active-allocation view so they compete without double-booking work. Actor resolution, inspection, intentions, incoming inventory, repair affordability, and the contract board now read all mining-operation instances rather than only the legacy singleton. Flint is controlled by Rhea Flint, begins with a smaller, more cautious fleet at Blue Lantern and Yard Exchange, and has a different cash/trait profile. Both fleets begin with staggered wear so they do not arrive at SPRC in a synchronized wave. The global wear rate remains unchanged pending the dedicated wear-and-tear milestone. Tests prove data-instantiation, shared-market participation, cross-company allocation exclusivity, actor discovery, and non-synchronized starting condition. Long-run proof that the firms repeatedly choose different work for economic reasons remains to be observed and tuned.

### Phase 5 — Add competing freight capacity

Add carriers with different capacities, wear tolerance, required margin, route knowledge, and affiliations. Ensure work is not allocated by iteration order and that existing commitments affect new choices.

**Initial carrier-instance proof implemented 2026-08-01:** Carrier institutions now originate in `src/content/transportation/firstReachCarriers.js`, which emits each business, controller, account, operating policy, repair options, ship record, starting condition, home geography, and visual fleet palette. Quill Independent Freight and Mara Venn Freight were migrated to the catalog, and Lantern Cartage was added at Blue Lantern under Oren Vale with a distinct cash reserve, temperament, starting wear, and violet fleet identity. Physical route ships and logistics state derive from the same seeds, including save migration, rather than parallel two-carrier lists. All carriers continue to evaluate the shared procurement-generated freight market, and shipment commitments remain globally exclusive. This adds genuine capacity and more future maintenance demand without changing the wear-rate formula. Remaining proof: deterministic tests in which price, route, maintenance exposure, and existing commitments each change which carrier wins the same run.

**Carrier-choice proof implemented 2026-08-01:** Freight is no longer granted to whichever ship happens to be visited first by the update loop. Every currently available carrier produces a normalized bid for each physically and financially eligible run. The market ranks those bids by the surplus above the carrier's trait-, route-, repositioning-, wear-, live-maintenance-cost-, and relationship-shaped ask; buyer preference may break a close contest, while stable carrier and ship IDs are the final tie-breaker. Active commitments remove capacity before ranking. The complete ranked bid set, including losers, is retained in `logistics.carrierBidDiagnostics` and displayed in each hauler's Observatory inspection. Pure tests prove registration-order independence, economic and condition effects, commitment exclusion, bounded relationship influence, and retained losing bids. The next live proof is sustained switching under changing inventory, wear, and commitments rather than a scripted rotation.

### Phase 6 — Add hubs five and six one at a time

Each hub should introduce one controlled asymmetry or stress case: remote cheap producer, politically preferred expensive supplier, unreliable short route, cash-poor buyer, constrained repair capacity, or hostile rights regime. Do not add three symmetric copies in one change.

**Hub five implemented 2026-08-01:** Morrow Shoal is instantiated from the settlement catalog as a second structural producer. Edda Morrow runs it with a low-margin policy, a deeper opening iron shelf, and high caution, but the settlement has only 9,000 operating credits and substantially weaker household income. Its authored geography is one new bidirectional corridor to Scrap Porch; population, extraction offers, authority rights, procurement, pricing, and freight discovery all arise from existing projections of the shared seed. Scrap Porch now receives two eligible structural bids—nearer Yard Exchange and lower-margin Morrow Shoal—and chooses Morrow on opening delivered economics. This is intentionally a fragile competitor: it can win export business while still struggling to finance its own imports. No shared economic system names Morrow Shoal.

### Phase 7 — Remove a pillar and observe recovery

Disable a major supplier, route, carrier, or repair provider during a long run. The system should reroute, reprice, defer, substitute, contract capacity, or visibly fail. A believable economy is demonstrated more by its response to loss than by steady-state throughput.

## 8. Success criteria for a real multi-actor economy

### Configuration and architecture

- A new settlement is added from one seed bundle without editing decision-engine code.
- No shared system code names any of the three new hubs, their controllers, or their businesses.
- Repair, recovery, and mining operations can each have more than one live instance keyed by institution ID.
- Actor resolution reports authoritative, non-fallback provenance for every deciding actor.
- Shuffling seed and registry order does not change the selected supplier/provider when evaluations are otherwise equal.

### Choice and competition

- Every important resource or service has at least two legal, visible, capable candidates in at least one market.
- Changing only price, distance, route risk, relationship, trait, or current commitment can change the selected candidate in a focused test.
- Runtime inspection shows all considered candidates and why each won or lost.
- At least one buyer changes suppliers over time for an explainable economic reason rather than a hardcoded rotation.
- A preferred provider becoming busy, broke, incompatible, or unreachable produces deliberate failover.

### Economic integrity

- Credits, goods, reservations, custody, and service inputs remain conserved across multi-provider transactions.
- The same job is not sold, reserved, or fulfilled twice when two actors compete for it.
- Purchase, freight, and service commitments expire or reconsider without leaking cash or inventory.
- Inventories, order counts, and account balances remain bounded during a long deterministic run, or a diagnostic explains insolvency/runaway state.
- Removing one producer or carrier degrades throughput but does not deadlock the entire economy when an alternative exists.

### Geography, authority, and information

- An actor cannot select a provider it cannot know about, legally use, or physically reach.
- Route distance and risk affect delivered cost rather than merely animation.
- Relationships can influence choice without overriding catastrophic price, compatibility, or safety differences.
- Missing rights, routes, knowledge, stock, cash, or capacity each produce a distinct blocker and wake condition.

### Behavioral credibility

- Two actors using the same engine but different data make observably different choices.
- A new mining company or repair provider requires mostly archetype and institution data, not a copied domain module.
- Competition can produce both substitution and specialization; it does not merely split work round-robin.
- The economy survives a deterministic stress run with no unexplained actor parked indefinitely.

## Architectural boundary to preserve

The shared layer should own discovery, eligibility, evaluation, commitment, provenance, and diagnostics. Domain operations should own how mining, transport, repair, recovery, and production physically execute.

That is the smallest useful seam. It allows a second actor to prove transfer without turning the terrarium into an enormous universal AI framework.

## Final recommendation

Proceed toward the six-hub world, but treat it as a sequence of adversarial proofs rather than a content expansion. First make one buyer choose between two suppliers. Then make one customer choose between two service providers. Then instantiate one competing operation from data. Only after those choices are real should hubs five and six be added.

If that sequence succeeds, the additional hubs will reveal economic behavior. If it is skipped, they will mostly multiply today’s hidden assumptions and make them more expensive to remove.
