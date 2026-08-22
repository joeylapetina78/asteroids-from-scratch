# State of development — orientation for a new contributor

Written 2026-08-22 for someone joining cold. There are 53 documents in `docs/`
and 8,500 lines of them; this one exists so you do not have to read them in
order. It covers what the project is trying to be, the rules it holds itself to,
what is actually built, where the work currently stands, and — most usefully —
the specific ways this codebase has repeatedly fooled people who were sure they
were right.

If you read nothing else, read **What keeps going wrong** near the bottom.

---

## What this is

A space game built from scratch in vanilla JS on a canvas, no framework, no
build step. Modules are imported with a `?v=` cache-busting query string.

What makes it unusual is the ambition underneath the asteroids: **a living
economy of institutional NPCs**. Hubs, mining companies, carriers, repair shops
and factories are actors with treasuries, assets, relationships and character
traits, making their own decisions. The player is one participant in that world,
not its protagonist.

The test suite is 984 tests, run with `node --test tests/`. Everything is
expected to pass before a commit.

---

## The design constitution

These are not style preferences. They are rules the project owner has asserted
repeatedly, usually by rejecting something that violated them. Violating one
will get your work reverted, however well it performs.

### 1. Assets provide abilities

`institutional identity + controlled assets = capability portfolio`. A ship can
make a long haul because it owns a subspace drive. A hub can build ships because
it owns a shipyard. A hub with no miner and no way to get one **cannot mine** —
absence of an asset is a real constraint, not a balancing knob.

Corollary: a capability that arrives by decree is a bug. Ships used to appear
from nothing when a fleet grew; closing that was a whole work stream.

### 2. No arbitrary caps, floors or ceilings

Quoting the owner directly:

> "I don't know how I feel about these caps and limits and ceilings and floors
> that are arbitrary. Different kinds of NPCs based on their traits might have
> higher or lower things happening. And as desperation increases, those ceilings
> and floors would continue to move."

Before writing a constant that bounds a decision, apply the four-question test
recorded in `HANDOFF.md`: is it a shape or a limit; whose number is it; does it
move; what is the natural bound? A curve needs shape parameters and that is
fine. A ceiling that decides an outcome is not.

Worked example: hub buy-prices used a three-step urgency table. It was replaced
by `chaseMultiple` in `valuation.js`, which moves continuously with how short a
buyer is and how long it has been short, scaled by that actor's authored
`urgencyBias`. There is no cap; what stops a buyer is its own money.

### 3. NPCs decide; the engine does not protect outcomes

An operator that undervalues its only long-range hull is allowed to sell it,
strand its own hub, and leave a derelict. That is content, not a defect. Two
attempts to add protective rules were rejected outright — a rule forbidding the
sale of the last capability-holding hull, and a fixed patience cap. Both became
valuations the actor can get wrong.

### 4. Nothing is hidden

> "We don't want hidden things in this game. We want to see as much of the
> sausage being made as possible."

Every parts factory is drawn where it stands, with a progress arc that is a real
fraction of a real recipe. Material moves along visible tethers between hub,
factory and slipway. A hull is built on the ways one stroke at a time from the
same outline data the flying craft is drawn from. This is not decoration: a
same-institution procurement deadlock was found within ten minutes of making the
order board visible.

### 5. Every place starts owning what it must have needed to exist

A hub is out there because something carried the means out there. The shipyard
opens with hulls in its shed because the world commissions a freight fleet on
tick one and a yard with nothing built would strand it.

### 6. Distance can be a wall, not a cost

Some clusters should be too far apart to be economically attached, and the
answer is a **gate**, not cheaper wear or shorter lanes. Explicitly retired:
moving the outer hubs closer, and rebalancing wear to make the frontier
reachable. Miners are **not** long-range; a distant hub needs local production
or freight, and eventually a heavy-lift ship that carries craft and industrial
plant out to range.

---

## Architecture worth knowing before you touch anything

### The actor strata

Modelled on Sal's repair shop and now copied by the shipyard. Follow it.

| tier | example | holds |
| --- | --- | --- |
| hub institution | `scrap-forge`, `yard-exchange` | treasury, warehouse, ownership |
| department / operation | `sprc`, `yard-shipyard` | facility, capabilities, inventories, its own projects |
| person | `sal`, `mira-koss` | traits, delegated authority, career record |
| population | `population:scrap-porch` | labour supply, demand, royalties |

The hub OWNS (`ownerInstitutionId`), the person RUNS it under `delegatedRoles`
and `authority`, and departments carry `organizationRole: "department"`. A
department may share the hub's operating account — `economySampler` deduplicates
by account identity, so this does not double-count. See
`src/content/institutions/institutionInstances.js`.

### Key systems

- `src/systems/logistics.js` — hubs, carriers, freight, the one actor table
- `src/systems/miningOperation.js` — mining companies, extraction offers, fleets
- `src/systems/hubProcurement.js` — orders, reservations, title transfer
- `src/systems/industrialProduction.js` — factories, recipes, the parts market
- `src/systems/shipyards.js` — hull build queue, stock, relationship pricing
- `src/systems/valuation.js` — the shared valuation vocabulary everything prices with
- `src/systems/extractionMarket.js` — one clearing ranks every miner against every offer
- `src/systems/economySampler.js` — money reconciliation; treats `capitalSpend` as burned
- `src/systems/hubLayout.js` — where facilities may be placed around a hub
- `src/systems/distantSimulation.js` + `regionFlow.js` — level-of-detail aggregation

### Conservation invariants

Money, material, custody and title must all have traceable sources and
destinations. `economySampler.reconcile()` reports a residual. A transfer must
never be recorded as a burn — hull purchases are tracked as `hullSpend`
precisely because `capitalSpend` means "left the world" to the reconciler.

---

## Where the work stands

### Recently completed

- **Frontier reach** — a five-link chain that starved the outer hubs, ending in
  the first frontier mining delivery this world had ever produced. Then largely
  retired by design: miners are no longer long-range (see constitution §6).
- **Shipbuilding Stage 1** — hulls are bought from a shipyard, not conjured.
  Money moves to a seller; every hull records `builtBy` and `quality`. Pricing
  is by relational standing: the owning hub builds at cost, a stranger pays book,
  friends less, enemies are refused. This is the first enforcement of the
  `access` shape in `relationshipProjections.js`.
- **Shipbuilding Stage 2** — hulls consume `hull-plate` and `machine-part`, take
  45 seconds, and enter a shed. A buyer arriving at an empty shed is refused.
  Shipbuilding bids for parts in the same market as Sal's repair queue.
- **Visibility** — every factory drawn, material in motion, a capital that reads
  as one, subspace haulers marked, and a placement rule with tests.

### The open question

**Ore is the binding constraint on the whole industrial chain.** Measured live:
all three parts works idle simultaneously with zero iron-nickel and zero
silicate between them, having converted every scrap of ore in the world into
twelve parts. A hull needs 3–9 plate plus 2–7 machine parts.

No keel has yet been laid in a live run. The chain is connected and correct at
every link; it is starved at the first one.

Three candidate levers, none pulled, recorded in `shipbuilding.md`:

1. **Miners carry more per trip** (`MINING_ALLOCATION_SIZE`, currently 6). Tried
   at 12 and reverted — it re-ranks the entire job market and broke three tests
   encoding intended behaviour.
2. **Ore yields more parts.** Lifts all industry at once; leaves the mining loop
   feeling like five-ore errands.
3. **Fewer hulls destroyed.** An overnight run lost sixteen mining hulls to
   incursion waves. Reads as an economy problem, is actually a protection one.

The owner's stated position is that the balance is above what they can compute
by hand and wants something that can find its own equilibrium. Measure one lever
properly rather than tuning all three.

### Known open items

- Stage 3: every hub endowed at founding (a distant hub with no extractor still
  posts extraction demand nobody can serve).
- Stage 4: hubs commissioning industry they lack, via the existing project
  mechanism. `commission-shipyard` is already in the municipal capacity charter.
- Stage 5: heavy-lift craft carrying ships and plant; viewport scale changing
  when boarding a larger vessel.
- Hull `quality` is recorded at construction but nothing derives it from
  materials or reads it. The repair-ceiling half already exists —
  `maxRecoverableCondition` falls as `lifetimeDegradation` accumulates.
- A market visit commits a ship to a voyage but does not reserve the offer, so
  several craft can set out for the same exclusive job. Harmless locally,
  ruinous at frontier distances. Three options recorded in `HANDOFF.md`.

---

## What keeps going wrong

This is the section that will save you time. Every entry below is a real
incident from the last two days, and in every single one the tests were green
and the code read correctly.

### The bug is almost never in the logic. It is in the measurement.

Five consecutive investigations ended with "the thing I was measuring never had
a chance to happen":

1. A hunger clock read `order.at` — but the order book is rebuilt on every read,
   so elapsed time always measured zero and a starving hub could never raise its
   offer past its opening bid.
2. A fleet planner counted a travelling ship as idle, because
   `trackFleetClocks` checked `assignment` but not `marketVisit`. It retired its
   only long-range hull 26,000 units into a voyage. The bias was systematic:
   the longer the trip, the likelier the recall.
3. A shipyard read free parts stock, which was permanently zero because every
   part was reserved against an accepted order the moment it existed.
4. A hub ordered parts from the factory it owns; the procurement path leaves
   goods at the seller awaiting freight, and no carrier runs a route from a site
   to itself. The order sat accepted forever.
5. Parts recipes were sped up 3x and nothing changed, because conversion was
   never the constraint — ore was.

**Before concluding a mechanism does not work, prove it ran at all.**

### Tests that assert their own fixtures

The urgency-ceiling tests kept a private copy of the ceiling table in the test
file. They passed unchanged when the production constant was deleted. Another
test asserted `busy <= quiet + delivered`, which permits the exact double-count
it was meant to catch.

Assert the outcome through the real code path. When you fix something, **revert
the fix and confirm the test fails.** This has caught two would-be no-ops.

### The `?v=` cache trap, in three flavours

- A bare import without `?v=` is never cache-busted. Tests green, game dead at
  boot.
- A symbol used without being imported — `DRIVE_KIND` in `NpcShip.js` — throws
  at draw time, which no test exercises.
- `index.html` itself is cached by the browser and is **not** covered by the
  `?v=` scheme. A single page load once fetched three different versions of
  `valuation.js` while disk was uniform. If the game behaves like yesterday's
  code, force-reload before debugging anything.

Bump with the snippet in `HANDOFF.md`, **after** committing, so the sha in the
version string matches the code it labels.

### Headless harnesses lie

`createMiningOperation` with a stub `addWorkerShip` produces a world with no
physical workers, no demand, and no posted orders — and it will answer your
questions confidently and wrongly. Some behaviour can only be verified in the
running game. When a test cannot honestly cover something, say so in the test
file rather than writing one that passes vacuously.

### Instruments that lie

- `getRetainedEvents()` **prunes**. Counts are within-window, not cumulative.
  A count that goes down is retention, not a bug.
- `deliveredUnits` on a procurement order stays 0 while the reserve fills;
  reserve progress lives on the supplier.
- A withheld order has no `paymentPerUnit`. Rounding it yields `NaN` and looks
  like a pricing defect.
- `capitalSpend` means "money that left the world" to the reconciler.

### Short observation windows over-claim

Two findings were reported from 23 and 143 samples and both were wrong at larger
N. The live game is the real instrument; give it minutes, not seconds, and say
how long you watched.

---

## How to work here

- Run `node --test tests/` before every commit; keep it green.
- Verify in the running game, not only in tests. Reset freely — the owner always
  plays from a fresh start. Use `?resetSave=1&devStart=explorer`, which opens in
  free-play with all panels visible so the screen is legible in passing.
- Commit messages here are unusually substantive: what changed, what was
  observed, what was tried and reverted. Match that.
- Comments explain *why*, and frequently cite the live incident that motivated
  the code. Match that too.
- When a decision is genuinely the owner's — a balance lever, what an actor is
  allowed to know, whether a hub may privilege itself — record the evidence and
  the options and ask. Several unilateral changes were reverted for being
  engine-protects-outcome rules.

## Where to read next

- `HANDOFF.md` — the running log, densest and most current
- `shipbuilding.md` — the active work stream and the ore-economy evidence
- `institutional-npcs-and-assets.md` — the actor model and asset archetypes
- `level-of-detail.md` — distant simulation, aggregation, drift budgets
- `observability-architecture.md` — diagnostics, blockers, the economy tab
- `project-map.md` — the file-by-file tour
