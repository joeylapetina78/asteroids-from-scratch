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

Next:

1. Distant aggregation and restoration around preserved actors.
2. Territorial surveying, claims, upkeep, negotiation and conflict.
3. Incremental reintroduction of asymmetry.

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
