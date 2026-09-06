# Institutional NPCs and asset-derived capabilities

The settlement is the enduring NPC. A named administrator may represent it,
but the organisation owns its identity, mandate, temperament, treasury, assets,
obligations and history. Replacing a representative must not replace the mind
of Yard Exchange or erase the memory of Scrap Porch.

## The boundary

An institutional NPC has only a small set of inherent powers:

- govern itself;
- assess needs;
- allocate capital;
- plan projects.

Operational capabilities come from assets. A mining charter grants scoped
extraction authority. A population grants recruitment. A freight craft grants
transport capacity. A parts factory grants production, pricing and sale of
parts. A farm grants cultivation and produce commerce.

The rule is deliberately compositional:

```text
institutional identity + controlled assets = current capability portfolio
```

Losing an asset removes its capabilities without changing the actor's type.
Acquiring a new kind of asset adds its published capabilities without changing
the NPC engine.

## API

`src/systems/assetCapabilities.js` is the read model.

- `listAssets(state, filter)` enumerates live assets.
- `getActorCapabilityPortfolio(state, actorId)` returns assets, scoped grants
  and offer types with provenance.
- `getActorCapabilities(state, actorId, capabilityId)` returns matching grants.
- `actorHasCapability(state, actorId, capabilityId, predicate)` checks both the
  power and any scope the caller requires.
- `registerAssetSource(state, id, collect)` lets a future domain publish assets
  without editing the actor or this registry.

Domain state remains authoritative. The portfolio holds no copy that can drift:
its built-in sources project live factories, ships and facilities, while seed
assets describe durable charters and constituencies.

## First Reach

All nine settlements are now `institutional-npc` actors with distinct forms of
organisation, governance, mandates and values. Each begins with:

- a settlement charter;
- a population constituency;
- its installed, resource-scoped mining specialty;
- a municipal capacity charter.

Existing industrial factories publish `parts-factory` assets. Existing mining
and freight craft publish their corresponding craft assets. SPRC facilities
publish repair or recovery-mill assets.

All hubs now hold foundational legal authority across the resource families,
but legal authority and installed extraction are deliberately separate. A hub
may charter a new mine without pretending that mine already exists. Its current
mining asset remains scoped to its authored specialty, so shortages still
produce real imports and freight until a future project adds capacity.

The municipal capacity charter grants six explicit options: commission a
mining operator, freight operator, patrol service, maintenance service, repair
facility, or parts factory. These are options, not spawned assets. The first
live commissioning paths now apply the feasibility rule: sponsored freight
reserves a worker and hub capital, while an emergent parts factory reserves
four workers, capital and construction material and remains unavailable during
its build interval. The general project planner will broaden that rule across
the remaining capacity types.

### Sponsored carriers are concessions, not gifts

A hub-financed hauler should remain a private operating concern, but public
capital must purchase enforceable service rather than goodwill alone. The
intended model is a concession: the hub retains a lien or ownership share until
its contribution is repaid and receives a defined portion of dispatch authority
in return. That authority can require periodic home calls, reserve some completed
runs for home-origin or home-destination freight, and issue emergency supply
dispatches. The carrier controls its remaining work and may still refuse unsafe
or impossible service. A retainer or subsidy covers civic work that would not
clear an ordinary private bid.

Homesickness belongs to the operator rather than the contract. Time and stops
away, family attachment, stress and recent danger should create personal
homeward pressure and individual stories, but a settlement's survival must not
depend on every sponsored captain happening to feel homesick at the right time.
The concession is the reliability layer; temperament is the variation above it.

The first concession slice is live. Each sponsored carrier records completed
outside jobs, outside market stops and its last physical home docking. Two
outside jobs or four outside market stops make home duty binding. While due, the
carrier considers only freight serving its sponsor (imports or exports); if none
exists, its next market movement is a physical return home. Docking at home
clears the duty and publishes a `carrier.homeDutyCompleted` event. A newly built
remote-sponsored hull begins with home duty due, so it reports to the community
that capitalized it before freely roaming the market. The charter records a
one-third dispatch share and an outstanding hub-capital lien; repayment remains
an independent financial right rather than another name for dispatch control.

That lien is now a real declining balance equal to the commissioned hull's
purchase price plus the opening operating grant. After a paid delivery, fleet
finance is serviced first. The carrier then protects committed money, minimum
operating cash, its maintenance target, and—when larger—its actual operating
expenses from the preceding fifteen minutes. One third of only the remaining
distributable surplus returns to the sponsoring hub until the lien reaches
zero. Both accounts and a public `carrier.sponsorCapitalRepaid` event record the
transfer. A carrier without genuine surplus pays nothing. Buying a used
concession closes the former sponsor's interest and opens a new lien for the
actual transfer price, so repayments follow ownership rather than the craft's
original home.

The sponsoring hub now also maintains a live dispatch channel to the carrier.
It transmits the hub's open inbound and outbound procurement needs, plus the
specific ready freight offers that can serve them, while the craft is underway;
no market docking is required merely to learn what home needs. A captain still
finishes cargo already in custody and accepts or changes work at a safe stop,
so continuous communication does not become mid-flight route thrashing. Changes
to the feed are retained in logistics history as `carrier.homeDispatchUpdated`.

That feed now has economic force before the hard home-call threshold. The
carrier values sponsor-serving freight progressively more as its originating
purchase order ages, with a further increase when duty is due. It remains a
reasoned preference: an infeasible route, unsafe wear projection, unfunded
buyer or below-cost rate is still rejected. The actor card shows those exact
reasons alongside approach distance and the age/direction/value of the
sponsored obligation, making an untouched frontier order diagnosable in-world.

That diagnosis now governs service choice. If sponsor-serving cargo is funded,
loadable and profitable but the carrier's present condition fails the
maintenance projection, an unrelated eligible auction bid won by another ship
cannot mask the obligation. The empty carrier seeks preventive service rather
than spending more wear on a market circuit, then reconsiders the still-open
home order from its repaired condition.

Arrival is now a real decision boundary. Before starting another exploratory
market circuit, a carrier evaluates loadable freight at the stop. A sponsored
craft standing beside cargo for its home hub has first consideration if the run
is otherwise eligible; this closes the independent-auction case where another
ship won several loads, accepted one, and caused the local carrier to leave the
others behind. Departures retain their considered offers and reasons on the
actor card instead of erasing the evidence once the ship is in transit.

The procurement boundary now refuses to turn a READY label into imaginary
freight. The matching supplier custody manifest must name the titled buyer,
resource and full quantity before the carrier market can see the load. A stale
READY order is reconciled to an extant active shipment or has its missing
supplier-held custody row restored from the conserved paid title; neither path
creates stock or repeats payment. Records lacking enough identity to repair are
withheld behind a visible custody blocker, and every successful repair is on
the ledger as `procurement.readyCustodyReconciled`.

Sponsored concessions also enter a used-capacity market before their worker and
hull disappear from economic life. When a one-hull sponsored carrier reaches
withdrawal, it publishes the physical craft, its condition, operator, existing
concession and a condition-adjusted asking price below new-build cost. A hub may
assume that whole relationship only after freight involving the hub has remained
genuinely unserved; a quiet regional fleet floor alone is not a reason to trade.
The payment goes to the outgoing lienholder, the craft and operator retain their
identities and histories, and the new sponsor receives the lien, live dispatch
relationship and a binding first home call. The operator's personal home remains
their place of origin even though the job's service home changes.

A remote pickup claim is intentionally narrower than a freight contract. It
prevents two empty craft from making the same approach, then expires when the
first craft physically reaches the pickup market. The load is bid again from
the arriving craft's real location and current condition. If wear or maintenance
policy changed during the journey, the load returns to the market rather than
remaining invisibly reserved by a carrier that now refuses it.

Hub-owned ecological collectors are different again. The hub owns the craft
permanently and employs its operator; completing a field assignment does not
retire or transfer the hull. Existing empty craft are reassigned, and craft with
retained partial cargo return home to unload. Additional collector capital must
eventually be justified by an explicit parallel-capacity/backlog decision, not
by failing to recognize an existing owned ship as reusable.

## Population, labor and operational people

`src/systems/populationLabor.js` makes a settlement population a finite labor
source. Employment creates a durable assignment instead of reducing resident
count: workers remain members of their households, but assigned workers are no
longer available to another project. A protected community reserve prevents a
construction burst from recruiting the entire economically active population.

Each new operational concern also receives a named operator with a home
population, employer, role, motivation, traits and an asset-scoped charter.
These people are persisted in population state and published through the actor
registry as `operational-npc` controllers. They are more specific than an
anonymous population faucet but remain eligible for the later promotion system
rather than beginning as fully bespoke institutional actors.

Recorded work can now change that tier. `src/systems/npcDevelopment.js`
projects freight deliveries, earned revenue, served ports, factory runs and
accepted industrial orders into a durable career record. Time is necessary but
never sufficient: a person is promoted to `bespoke-npc` only after evidence of
a real career crosses the common threshold. Identity, home, motivation and the
original asset charter survive promotion.

An emergent municipal factory can subsequently become an independent parts
business when its promoted operator, completed production, customer history,
idle plant, clear obligations, input stock and capitalization all justify it.
The parent hub transfers working capital and inventory; the existing factory,
operator and labor assignment change institutional home rather than being
cloned. Money and materials are conserved and the spinout remains in both the
hub's history and the development registry.

## Unified hub actor

`src/systems/hubActors.js` is the coherent surface used by inspection today and
by the general planner next. `getHubActor(state, id)` returns one settlement
with its:

- authoritative treasury and warehouse;
- population relationship and live labor availability;
- current assets, facilities, capabilities and offer types;
- projected population and procurement needs;
- institutional policies and relationships;
- durable generic needs, projects and bounded history;
- current domain orders and trade state.

This is deliberately an aggregate over live references. The hub treasury is
the institution's actual operating account, not a copied `hub.balance` field;
the population is the population subsystem's actual record; factories remain
industrial records. Mutation through the unified view therefore changes the
one source of truth.

Generic hub needs, projects and history do belong directly to the institution's
`hubState`. These records are the handoff between a future planner and domain
executors: for example a freight shortage can become a commission-hauler
project without making logistics responsible for the hub's long-term intent.

Population, procurement, industrial state and relationship projections are now
saved and restored together with logistics. Previously those live parts of a
hub disappeared across a reload even though its treasury survived.

## Adding a future asset

Prefer an asset archetype when several instances share a meaning:

```js
farm: {
  capabilities: [
    { id: "cultivate" },
    { id: "price-produce" },
    { id: "sell-produce" },
  ],
  offerTypes: ["purchase", "sale"],
}
```

The owning domain then publishes an instance with ownership and scope. The hub
planner can immediately discover the new choices. Only the farm executor needs
to understand planting, inputs and harvest; the NPC core does not.

Capabilities say what an actor can attempt. Authority, inventory, knowledge,
cash, labor, time and current condition still decide whether an attempt is
legal and feasible. The planner must retain those failures as explicit blockers
rather than treating possession of a capability as guaranteed success.

## Forward sequence

Completed: general project planning; operational-NPC promotion and spinout;
territorial authority and player access foundation; one authored/generated hub
seed pipeline.

Completed after the foundation: distant aggregation and restoration around
preserved institutional actors. See `distantSimulation.js` and
[level-of-detail.md](level-of-detail.md).

Completed 2026-08-19: first-class simulation-boundary observability
(`simulationObservatory.js`, the Observatory's **Simulation** tab), plus the
30-minute live run that measured the busy-hub blockers. Result: no far hub
aggregated unaided, because a settlement with a live economy is never
quiescent. See [level-of-detail.md](level-of-detail.md).

Next:

1. Checkpoint open orders and in-flight shipments so a busy hub can be
   aggregated without weakening the quiescent gate. This is the blocking item.
2. Bound long-run aggregate drift once step 1 produces a live aggregate to watch.
3. Aggregate operational/physical populations while keeping bespoke actors as anchors.
4. Territorial surveying, claims, upkeep, negotiation and conflict.
5. Incremental reintroduction of asymmetry.

## Shared settlement seed pipeline

`src/systems/settlementSeedPipeline.js` is now the single construction boundary
for a settlement. The nine authored First Reach seeds and future procedural
descriptors both pass through `compileSettlementSeed`. The compiled contract
contains institutional identity and motivation, representative, treasury,
population, installed extraction, capability-bearing charters, policy, durable
hub state and geography.

`registerGeneratedSettlement` materializes that contract into live logistics,
population, extraction, actor, patrol, place, territory and authority systems.
Those systems enumerate the state registry rather than maintaining a second
procedural-only list. The source seed is saved and restored; derived legal
records can therefore be rebuilt while evolved treasuries, inventories and
populations remain live domain state.

No route, supplier or prescribed economic behavior is generated by this
pipeline. A new hub receives capabilities, assets, needs and decision traits.
Its actual mining orders, procurement choices, protection responses and trade
relationships emerge through the same evaluators used by authored hubs.

The geography portion now enters `worldNetworkRegistry.js`, the shared runtime
graph of sites, connections, and trade communities. Authored First Reach and a
procedurally founded site have the same stored shape, including provenance and
history. Founding roads are registered separately, validate both endpoints,
and immediately become available to freight, procurement, aggregate trade,
industrial sourcing, towing, detail selection, and physical-world routing.
This separation lets the historical generator say *why* a place and route were
built without preselecting what businesses will later do with them.

`src/systems/worldHistoryCompiler.js` now performs the first pre-play replay of
that process. A sponsoring frontier government surveys actual procedural
geography, chooses a balanced opportunity, approves an expedition, builds the
founding trunk and local roads, and registers three complementary settlements
as an independent trade community. Population, wealth, specialization, and
the later capital designation follow the recorded opportunity and historical
success. The result is ordinary live institutional state after compilation;
the chronicle is explanatory memory, not a second simulation.
