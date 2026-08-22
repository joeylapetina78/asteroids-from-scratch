# Shipbuilding, parts, and where a hull comes from

Status: design agreed 2026-08-22. Stage 1 is the only stage being built now;
everything after it is written down so Stage 1 is built in a shape that accepts
it.

## Why this exists

Ships currently come from nowhere and the money paid for them goes nowhere.

```js
// src/systems/miningOperation.js — hireWorker
account.balance -= hireCost;                     // 3,500cr destroyed, paid to nobody
const shipRecord = createWorkerRecord(defaults, operation.institution.id);   // hull minted
```

`src/systems/logistics.js` does the same for haulers
(`hub.accounts.operating.balance -= hullCost`, then `commissionHauler(...)`).
So every fleet growth event is simultaneously a **money sink** and a **hull
faucet**, and every release is a hull that simply stops existing.

Two consequences, one of them already recorded elsewhere as a mystery:

1. **Money leaves the world untracked.** The economy's unexplained residual is
   NEGATIVE (~-1.15/s, ~0.87% of created — see `docs/HANDOFF.md`). Hull purchases
   destroying credits is a candidate source, and unlike the faucets closed in the
   player-money work, a sink does not show up as unexplained creation.
2. **A ship is not an asset anybody made, owns, or sold.** That contradicts the
   project's central doctrine — `institutional identity + controlled assets =
   capability portfolio`. A capability that arrives by decree is exactly the kind
   of thing this world is not supposed to contain.

### What it does to the economy

| thing | cost | in ore at book (~300/unit) |
| --- | ---: | ---: |
| mining hull | 3,500 | ~12 units |
| standard hauler | 6,000 | ~20 units |
| subspace hauler | 21,000 | ~70 units |

A single six-unit frontier delivery earned **4,512cr** — more than a mining hull
costs. Inner deliveries ran 984–3,336cr. A hull therefore pays for itself in one
or two runs, which is why fleets churn so violently: there is no capital
decision to make, and no reason not to hire.

It also explains why every job feels like a five-ore errand. Ore demand today is
**only consumption** — hub shelves with targets of 8 to 15 units. Nothing in the
world is BUILT out of ore. Shipbuilding is the first structural demand for
material, which changes the shape of the ore economy rather than merely its
numbers.

## The principle

Buying and selling ships — and later the panels that go in them — is intended to
be a major part of progression and a major part of the fun. It therefore has to
be modelled properly rather than approximated:

- A hull exists because somebody built it, out of something, at a place.
- A hull is owned, and ownership transfers by sale with money going to a seller.
- A hub that has no shipyard cannot make ships. A hub with no miner and no way to
  get one cannot mine. **Absence of an asset is a real constraint**, not a
  balancing knob.
- Every hub starts owning what it must have needed to exist. It may lose those
  things later; that is a story, not a bug.

## The actor pattern this must follow

Sal's shop is the precedent and the shipyard copies it exactly. From
`src/content/institutions/institutionInstances.js`:

```js
{
  id: "sprc",
  archetypeId: "repair-cooperative",
  ownerInstitutionId: "scrap-forge",      // the HUB owns it
  controllerInstitutionId: "sal",         // a PERSON runs it
  departmentHeadPersonId: "sal",
  organizationRole: "department",         // not an independent company
  siteId: "scrap-porch",
  accounts: { operating: { id: "account:scrap-forge-operating", ... } },
  serviceCapabilities: [ ... ],
  inventories: { raw: {}, produced: {}, reserved: { raw: {}, produced: {} } },
  projects: { "sprc-second-cradle": { requirements: { "hull-plate": 6, "machine-part": 4, credits: 600 } } },
}
```

with the controlling person carrying delegated authority rather than ownership:

```js
{
  id: "sal", archetypeId: "person",
  delegatedRoles: [{ ownerInstitutionId: "scrap-forge", operationId: "sprc", role: "mechanic-and-recovery-factor" }],
  traits: { caution: 0.7, growthBias: 0.4, urgencyBias: 0.8 },
  authority: { mayProcure: true, mayScheduleProduction: true, mayFundProjects: true },
}
```

The strata, stated plainly:

| tier | example | holds |
| --- | --- | --- |
| hub institution | `scrap-forge` | treasury, warehouse, ownership |
| department / operation | `sprc` | facility, capabilities, inventories, its own projects |
| person | `sal` | traits, delegated authority, career record |
| population | `population:scrap-porch` | labour supply, demand, royalties |

**Account sharing is deliberate and load-bearing.** SPRC's operating account IS
`account:scrap-forge-operating`. `economySampler.listAccountHolders` deduplicates
by account identity so a shared account is not counted twice — see the
"five hidden treasuries" note in the observability memory before adding any new
treasury.

## Stage 1 — the shipyard as a seller (BUILDING NOW)

The smallest change that makes a hull a thing somebody sold.

- New asset archetype `shipyard`, sibling to `parts-factory`:
  capabilities `procure-production-input`, `build-craft`, `price-craft`,
  `sell-craft`; `offerTypes: ["purchase", "sale"]`.
- Yard Exchange gains a shipyard department, wired exactly like SPRC: owned by
  `yard-exchange`, run by a named person with delegated authority, sharing the
  hub's operating account, holding its own inventories and projects.
- `hireWorker` and the hauler commissioning path become PURCHASES. The buyer's
  credits move to the shipyard's account via the shared `creditPayee` path rather
  than being subtracted into nothing. The hull records `builtBy` and `purchasedAt`.
- A buyer with no reachable shipyard **cannot buy a hull**. That is the first
  point at which the frontier's isolation bites structurally rather than
  economically.

Deliberately NOT in Stage 1: hulls consuming materials, hull prices moving,
build queues, build time. Balance is held still so that any economic change
observed after this lands is attributable to conservation alone.

Conservation invariants to hold and to test:

- credits: buyer debit == seller credit, every time, no residual
- hulls: every hull in the world has a builder and an owner
- a released or destroyed hull leaves a record; it does not merely vanish

## Stage 2 — hulls are made of something

The shipyard consumes `hull-plate` and `machine-part` from a parts factory, which
consumes ore. This is what turns ore into a structural demand and gives the ore
economy something to be FOR. `parts-factory` already exists as an archetype and
`industrialProduction.js` already runs factories, so this is wiring rather than
invention.

Balance note recorded before it is tuned: the player is comfortable with ore
going further or miners carrying more per trip, precisely because six-unit orders
look small beside a 3,500cr hull. Set the material cost of a hull first, then let
order sizes follow from real demand rather than tuning order sizes directly.

## Stage 3 — every hub starts endowed

A hub exists because something carried the means out there. Each settlement seed
gains a starting endowment appropriate to what it is — at minimum, a distant hub
that posts extraction demand starts with an extractor of its own. This retires
the structural absurdity found on 2026-08-21: three frontier hubs posting
extraction demand that no extractor in the world was homed near.

## Stage 4 — a hub builds industry it lacks

Already agreed: via the existing project mechanism, the same way
`sprc-second-cradle` works. `commission-shipyard` joins the
`municipal-capacity-charter` capability list beside `commission-parts-factory`.
A distant civil hub can then bootstrap: miners first, then a parts factory, then
a shipyard.

This is also where hub CHARACTER enters. A civil hub wants to grow and connect. A
pirate hub would rather stay hidden and reach out only to raid — it might build
gates instead of factories. Different hub kinds should want different industry.

## Stage 5 — heavy lift, and ships that are places

Two related ideas, both wanted, neither scoped:

- **A larger logistics ship that carries other craft** (and later industrial
  plant) out to range. This is how a distant hub gets its first miner if it was
  not endowed with one, and it is the honest answer to "miners are not long
  range".
- **Scale as a first-class thing.** Boarding a larger ship changes the viewport
  zoom so that the big ship occupies roughly the same screen size as the normal
  player ship — the world zooms out around it, hubs and rocks read smaller, and
  more of space is visible. Panorama mode already has the zoom machinery. From
  outside, that same ship reads as huge. The end of this road is a mobile mining
  operation: a big ship flown out to deep space carrying equipment and smaller
  miners that deploy from it.

## Open questions

- Does a shipyard sell to anyone, or only to its own hub and hub-sponsored
  operators? (Stage 1 assumes anyone who can pay and can reach it.)
- Do hulls have condition when sold — is a cheap hull a worn hull? This connects
  to the existing component-condition system and to the panel trade the player
  wants eventually.
- When a hub commissions a hauler today it also grants operating cash
  (`HUB_SPONSORED_OPERATING_GRANT`). Once hulls are bought rather than conjured,
  is that grant still a grant, or is it the hub buying a hull and lending it out?
