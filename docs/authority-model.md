# Authority Model

This document is the re-entry map for the institutional authority system.

The goal is not to make a special player permission system. The goal is to model a world where people, ships, companies, hubs, patrols, banks, and future NPCs all use the same records.

The guiding question is:

> Can this actor perform this action in this place, with this asset, right now?

## Core Vocabulary

### Place

Where a rule applies.

Examples: universe, system, region, zone, plot, claim, jurisdiction, corridor, hub.

Places can have parents. A plot can belong to a zone. A zone can belong to a region. A region can belong to a system.

This lets a rule granted for a region apply inside its child plots or claims.

### Actor

Who is trying to do something.

Examples: player character, Rook Industries, Yard Exchange, a patrol agency, a hauler pilot, a tow company, a bank, an NPC miner.

An actor is not always a person. Institutions and companies act too.

### Asset

The thing an action uses or affects.

Examples: ship VIN, cargo, component, claim, beacon, building, contract, license.

### Power

Institutional authority.

Power answers: is this actor allowed to grant, own, enforce, or conduct something at this level?

The five top-level powers are:

| Power | Meaning |
|---|---|
| Define Place | Create or modify regions, zones, hubs, plots, claims, or corridors. |
| Own Property | Hold or transfer title to ships, claims, buildings, equipment, or other assets. |
| Authorize Work | Grant permission to mine, patrol, tow, salvage, build, haul, dock, or operate. |
| Conduct Commerce | Buy, sell, lend, insure, tax, fine, lease, hire, or repair. |
| Enforce Rules | Inspect, cite, seize, tow, impound, revoke, or clear violations. |

### Right

Player-facing or NPC-facing permission.

Rights are usually represented by documents: licenses, contracts, registrations, charters, titles, liens, leases, warrants, manifests, or permits.

Example: Rook Industries may hold the power to authorize mining in a region. A player may hold a mining contract from Rook that grants the right to mine a specific plot.

### Action

The thing being attempted.

Examples: fly, dock, mine, tow, inspect, patrol, sell, buy, repair, salvage, build, transferTitle.

Actions map to a right type and a backing power type.

## The Four Systems

### Place Registry

Stores place records and parent/child relationships.

Implemented in [src/systems/placeRegistry.js](../src/systems/placeRegistry.js).

Current helpers:

- `upsertPlace(state, place)`
- `getPlace(state, placeId)`
- `getPlaceLineage(state, placeId)`
- `isSameOrChildPlace(state, childPlaceId, parentPlaceId)`
- `ensureRegionPlace(state, region)`

### Authority Registry

Stores authority grants.

Implemented in [src/systems/authorityRegistry.js](../src/systems/authorityRegistry.js).

An authority grant says:

- who has power
- what power they have
- where it applies
- who granted it
- when it is valid
- what limits apply

Example shape:

```js
{
  id: "authority:institution:rook-industries:mining:red-vein-belt",
  holderId: "institution:rook-industries",
  powerType: "authorize-work",
  jurisdictionType: "region",
  jurisdictionId: "region:red-vein-belt",
  grantedById: "institution:frontier-regional-authority",
  status: "active",
  limits: {
    rightTypes: ["mining"],
    resources: ["iron-nickel"]
  }
}
```

### Rights / Document Registry

Stores player-facing and NPC-facing paperwork.

This currently uses `worldRecords.documents`, with compatibility mirrors still living under `state.legal` and `state.contracts`.

Documents should become the standard shape for:

- pilot licenses
- mining licenses
- ship registrations
- ship titles
- loan agreements
- liens
- delivery contracts
- mining contracts
- patrol permits
- towing authority
- salvage claims
- cargo manifests

Documents can grant actions or right types, apply to places, apply to assets, and optionally point back to the authority that made them legitimate.

Example future document:

```js
{
  id: "contract:rook-red-resource-run",
  type: "contract",
  issuerId: "institution:rook-industries",
  holderId: "person:player",
  authorityId: "authority:institution:rook-industries:mining:red-vein-belt",
  status: "accepted",
  grants: {
    actions: ["mine"],
    rightTypes: ["mining"],
    placeIds: ["claim:red-vein-208"],
    limits: {
      resources: ["red-resource"]
    }
  },
  obligations: [
    { action: "deliver", resourceType: "red-resource", amount: 5, destinationId: "site:yard-exchange" }
  ]
}
```

### Rule Checker

Asks whether an action is allowed.

Implemented in [src/systems/ruleChecker.js](../src/systems/ruleChecker.js).

Current helper:

- `canActorDoAction(state, { actorId, action, placeId, assetId, documentId, resourceType })`

If no document is provided, it checks whether the actor directly has the required power. If a document is provided, it checks the document first, then checks the backing authority when present.

## Current Implementation

The first foundation is in place:

- `worldRecords.places`
- `worldRecords.authorityGrants`
- [src/systems/authorityModel.js](../src/systems/authorityModel.js)
- [src/systems/placeRegistry.js](../src/systems/placeRegistry.js)
- [src/systems/authorityRegistry.js](../src/systems/authorityRegistry.js)
- [src/systems/ruleChecker.js](../src/systems/ruleChecker.js)
- [src/systems/authoritySeeds.js](../src/systems/authoritySeeds.js)

`authoritySeeds.js` seeds the known universe, First Reach system, region place records, and region-level authority grants from `worldRegions.js`.

This is intentionally not driving gameplay yet. It is the skeleton that contracts, inspections, claims, hub services, and patrols can start using.

## Design Rules

- Do not add `player.canMine` or `player.hasDockingRights`.
- Prefer a document held by an actor, backed by an authority grant, scoped to a place.
- Do not make hubs special inspectors. Hubs, patrols, employers, banks, repo crews, and future players should all use inspection/rule-checking systems.
- Missions introduce systems. Missions should not be the only reason a system works.
- If a rule could apply to an NPC, company, stolen ship, or future multiplayer player, make it a record relationship.

## Next Steps

1. Make contracts optionally include `authorityId` and `grants`.
2. Register claim/plot cells as `Place` records, not just map overlay geometry.
3. Make Rook's resource contracts grant mining rights in a specific place or set of places.
4. Make hub and patrol inspection ask `canActorDoAction()` instead of hardcoding player state.
5. Move ship registration, title, lien, and pilot license toward the same document schema.
6. Add rule checks for docking, mining, towing, and salvage before adding more professions.
