# Living Frontier — Systems Direction

This document describes the architectural direction for the Asteroids RPG. It is a living reference for both design and implementation. The vision is described first, with current implementation status noted inline so Codex and Claude can see what exists, what is partially built, and what is ahead.

**The big goal:** Build systems first, then let ideas use those systems. We do not want a special pirate system, miner system, mercenary system, or patrol system. We want shared systems where different roles emerge from equipment, documents, relationships, goals, places, and contracts.

A mercenary should not be able to do something because they are a mercenary. They should be an entity with weapons, contracts, reputation, authority, and AI goals. Other entities use the same pieces differently.

---

## Core Design Direction

The game is a living, compressed space frontier.

The player is not the center of the universe. The player is one entity inside a world of institutions, ships, hubs, documents, contracts, routes, risks, resources, wildlife, criminals, authorities, and economic pressure.

The universe should feel like a terrarium. We place environments, entities, resources, institutions, and pressures into the world, then let them interact.

---

## Systems

### Entity System

Anything that can act or be acted on.

Examples: person, company, hub, faction, ship, drone, crate, station, wildlife, wreck, beacon.

> **Current status:** Partial. Entities exist as separate typed classes — `Ship.js`, `NpcShip.js`, `Lifeform.js`, `Asteroid.js`, `ResourcePickup.js` — but there is no shared entity base or registry. `worldRecords.js` is the first step toward a generic entity/relationship record layer. The player's ship is still a special object in `game.js` rather than an entity in a shared world registry.

---

### Component System

Entities gain abilities from components. A ship mines because it has a mining component. A ship tows because it has a tow component. A ship hauls because it has cargo capacity. A ship patrols because it has scanners, weapons, documents, and AI goals.

Composition over hardcoded ship types.

> **Current status:** Partial. Ship components exist as state under `state.components` (engine, miner, scanner, cargoHold, hull, etc.) and are how the player ship gains abilities. However, components are not yet composable on generic entities — NPC ships do not have the same component structure. Hull VINs exist (`state.components.hull.vin`) as the identity anchor for documents and contracts. The component vocabulary and registry live in `componentRegistry.js`. Hulls are being bridged through `hulls.js`.

---

### Relationship System

Important facts should live as relationships, not as player-only state.

Examples:
- person controls ship
- institution issued license
- bank holds lien
- company owns hub
- person owes debt
- faction employs pilot
- title document links owner to hull VIN
- repo crew has authority to seize ship

> **Current status:** Early. `state.legal` stores the first legal relationships (pilot license, current ship summary, title/registration/lien records). `worldRecords.js` is the first generic relationship layer — the bridge toward people, ships, companies, institutions, and documents sharing one relational shape. The older `state.legal` shape is maintained as a compatibility mirror while the generic layer is built out. True cross-entity relationships (company owns hub, faction employs pilot) do not exist yet.

---

### Document / Authority System

Documents create rights, obligations, permissions, ownership, and enforcement.

Examples: pilot license, mining license, ship registration, title, lien, loan contract, cargo manifest, bounty, warrant, patrol permit, salvage claim, access pass.

The question becomes: *does this entity have the right document to do this action, in this place, with this asset, right now?*

> **Current status:** Partial. The provisional pilot license (RTC Form RTC–109–P) exists as a record in `state.legal.pilotLicense`. Ship title and registration records exist in `state.legal`. The loan contract (`mako-starter-ship-loan`) creates a debt obligation. `legalRecords.js` provides access helpers. `paperworkInspections.js` creates inspection reports from world records. The structure is in place but documents are still mostly one-off records rather than instances of a shared document schema. Expiration, revocation, forgery, and transfer are not yet implemented.

---

### Place / Ecology System

Places should have character, not just coordinates. Places should have pressures:

- resources, danger, traffic, patrol presence, piracy
- wildlife, jurisdiction, remoteness, infrastructure
- mystery, history

Objects should emerge from places. A mining camp appears where resources are worth extracting. A patrol checkpoint appears where traffic needs protection. A pirate base appears where traffic is valuable and patrol coverage is weak.

> **Current status:** Early. `worldZones.js` defines overlapping circular zones (Starter Drift, Red Teeth, Blue Glint, Scrap Wake, Dead Strip) with density, ore bias, hunter bias, and danger level. `resourceField.js` blends zone profiles with value noise to create local variation. `lifeField.js` spawns lifeforms according to zone pressures. Hub sites are authored fixed positions in `worldSites.js`. This gives zones personality and drives resource/life distribution, but emergent structures (mining camps, patrol posts, pirate bases) do not yet appear from pressures — they would need to be placed or generated from place + organization logic.

---

### Flow System

Jobs exist because flows exist. Resources flow. Goods flow. Money flows. Information flows. Authority flows. Risk flows. People flow.

Professions are ways of managing, exploiting, protecting, or interpreting those flows.

> **Current status:** Early. Resource flow exists (rocks → pickups → processor → cargo → sold at hub → credits). Money flow exists in one direction (contracts pay credits, hub services spend credits). NPC hauler ships follow routes between hubs, establishing the visual of traffic flow, but they do not carry real cargo or interact with the economy. Information flow (market prices, contract boards, threat intelligence) does not exist yet.

---

### Organization System

Organizations exist because they have ongoing needs. Those needs generate contracts. Contracts create professions.

Examples:
- Mining companies need ore → mining contracts → miners
- Banks need loans serviced → repossession contracts → repo agents
- Patrol agencies need trade protected → patrol contracts → security pilots
- Research institutes need discoveries → research grants → surveyors

> **Current status:** Early. Organizations exist as named entities (Rook Industries, Yard Exchange Finance, Reach Transit Commission, Yard Exchange Shipyard) referenced in content files and hub service rosters. Their authored identities are in `npcs.js` and hub service files. However, organizations do not yet have persistent need/state machines that generate contracts dynamically. Contracts are currently authored by hand in mission content files rather than generated from organizational needs.

---

### Contract System

Contracts are reusable simulation objects that represent work, obligations, permissions, or legal authority. They exist independently of the player and can be issued to NPCs as well.

Examples: mining contract, hauling contract, patrol assignment, bounty, salvage claim, repossession order, research grant.

> **Current status:** Partial. `contractManager.js` handles contract lifecycle (offered → accepted → fulfilled → paid). `contractRules.js` maps ledger events to fulfillment checks. Current contracts are authored in `chapterOneContracts.js` (delivery, loan, repeatable resource run). `hubServiceContracts.js` selects which contract a hub NPC should offer next. Contracts are functional but still player-only — NPCs cannot hold or fulfill contracts using the same system. The shape is close to JSON-serializable but `requiresCondition` function references block full serialization.

---

### Mission / Story System

Missions are authored narrative structures built on top of the simulation. They are not a replacement for contracts. Instead, they sequence contracts, places, NPCs, dialogue, discoveries, and world events into a coherent story.

Their purpose is to introduce mechanics, teach systems, develop characters, reveal lore, pace progression, and create memorable moments. A mission may contain several ordinary contracts connected by narrative.

> **Current status:** Solid foundation. The beat system is built and running. Missions are authored as beats with objectives, help text, event-driven transitions, and mission-level considerations scoped to beat ranges. Three missions exist: the interview/delivery run, the new ship purchase, and the first repeatable mining job. The mission runner (`missionRunner.js`) handles beat traversal, consideration filtering, transition matching, and `onEnd`. The mission/contract separation is philosophically correct but not yet fully enforced — some mission beats do work that should belong to the contract or hub service layer.

---

### AI Goal System

NPCs should pursue generic goals:
- mine resource, deliver cargo, avoid danger, inspect ship
- attack target, flee, rescue stranded ship, tow object
- patrol route, smuggle cargo, salvage wreck, return to hub

A pirate and a patrol officer might both "hunt target." The difference is authority, documents, faction, contract, and consequences.

> **Current status:** Minimal. Lifeforms use simple steering behaviors (seek, flee, separate, align, cohere, wander, orbit). NPC hauler ships follow hub-to-hub routes and avoid rocks. The tow truck has a physical simulation and approach/return phases. None of these use a shared goal system — each is purpose-built. A generic AI goal layer that reads from entity components, documents, and contracts does not exist yet.

---

### Inspection / Detection System

The game knows the truth. Inspectors only check some of it. Inspection fields depend on place, institution, equipment, corruption, skill, and danger level.

Possible inspection fields: pilot license, ship VIN, registration, title, cargo manifest, contract, bounty/warrant status, contraband, illegal components, expired documents.

> **Current status:** Foundation exists. `paperworkInspections.js` creates inspection reports from world records — VIN, pilot identity, ship documents, pilot documents, title, lien, registration, and clearance facts. This is the right shape but it is not yet wired into active hub docking or patrol encounters. No hub currently runs an inspection check on docking. Zone violations are logged to `state.legal` and fire visible ledger events, but no enforcement system reads them yet.

---

### Persistence / Memory System

We should not save the entire universe. The base world comes from seed + generation rules. Save meaningful changes:
- asteroid depleted, beacon placed, crate dropped, ship destroyed
- contract completed, license revoked, debt created
- faction influence changed, route became dangerous
- hub inventory changed, player/NPC arrested

World seed + generated baseline + saved deltas = current world.

> **Current status:** Minimal. `saveManager.js` saves player state (components, credits, debt, contracts, ship, journey mission pointer, cargo, position). The asteroid field and lifeforms are regenerated fresh each session — no asteroid depletion or world change persists. The event ledger is in-memory only. There is no world seed concept or delta system. This is an intentional deferral — the current field is small enough that regeneration is acceptable, but it will need to change as the world grows.

---

## Suggested Path (Not a Rigid Roadmap)

### 1. Define shared vocabulary
Establish Entity, Component, Place, Organization, Document, Relationship, Contract as named concepts in the codebase. Do not migrate everything immediately — create the vocabulary so new work naturally uses it.

*Where we are:* Most of this vocabulary exists implicitly. `worldRecords.js` is the first explicit generic layer. The next step is making new documents use the generic schema rather than creating new one-off `state.legal` fields.

### 2. Places as first-class world objects
Places defined by pressures rather than a single role. Objects emerge from pressures.

*Where we are:* Zones have pressure profiles. The gap is that emerging structures (camps, checkpoints, bases) don't yet spawn from those profiles — they would need organization + place logic working together.

### 3. Sectors / chunks and a world seed
The starter area remains as authored. Make it a region inside a generated universe.

*Where we are:* No sectors or world seed yet. The asteroid field is a fixed 9×9 cell grid. This is the biggest structural gap for a larger world.

### 4. Meaningful resources
Instead of "what color ore," ask: who wants it, what industries depend on it, what contracts does it generate, what organizations care about it?

*Where we are:* Resources are currently fuel (red) and crystal (blue) — interchangeable by color. They drive the processor/cargo economy but have no downstream industry or organization interest.

### 5. Organizations with needs
Organizations generate contracts because they have needs. Contracts create opportunities.

*Where we are:* Organizations are named but static. The next step is giving them needs (demand for ore, need for transport, threat response) that generate contract offers dynamically.

### 6. One fully generic document
Make one document (ship registration, pilot license, or mining license) a true world record — issued by an institution, held by an entity, applicable to an asset, checkable by inspection.

*Where we are:* The pilot license is close to this. It has issuer (RTC), holder (pilot), class, zone scope, and expiration fields. It needs to exist as a world record rather than a player-only state field.

### 7. One generic inspection
A docking authority checks pilot license, ship registration, VIN, local permissions. This demonstrates the document system's value immediately.

*Where we are:* `paperworkInspections.js` builds the report. It needs to be wired into the docking event flow.

### 8. One fully generic contract
A contract that NPCs can also hold and fulfill using the same system the player uses.

*Where we are:* The contract shape is close. The gap is the `requiresCondition` function references (not serializable) and the player-only fulfillment hooks in `contractManager.js`.

### 9. Keep missions separate from contracts
Missions are narrative. Contracts are simulation. A mission may contain many contracts.

*Where we are:* The distinction is philosophically correct. Some mission beats still do contract work directly (offerContract action). The separation will sharpen as the contract system becomes more self-contained.

### 10. Expand professions
Once places, organizations, documents, contracts, and inspections exist, new professions mostly mean new contracts, documents, AI goals, components, and place pressures.

*Where we are:* Mining is the first profession. The architecture should support salvage, rescue, patrol, and hauling next, reusing the same underlying systems.

---

## Guiding Rule

If a thing could apply to an NPC, company, stolen ship, faction, or future multiplayer player, it should not live as `player.whatever`.

It should live as a relationship between records.

The player is one participant in the frontier.

---

## Highest Impact Early Wins

1. Larger generated space using sectors/chunks
2. More meaningful resource/mineral logic (who wants it, what it enables)
3. A real generic document record for license/registration
4. A hub inspection that actually checks documents on docking
5. A contract that grants legal permission in a specific place
6. One additional job loop beyond mining (salvage or rescue)
7. Persistent world deltas so actions leave traces
