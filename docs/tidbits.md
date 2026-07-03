# Tidbits

This is the loose idea shelf: not promises, not specs, just useful direction to preserve before it drifts away. These should be mined later for systems, missions, NPCs, contracts, documents, and world rules.

## World-Connected Systems

The world should be connected to itself. The player is one person/entity inside that world who happens to be controlled by the human.

Avoid building rules as:

- player has license
- player has ship
- player has mining rights
- hub inspects player

Prefer building rules as:

- person holds license
- ship has VIN
- institution issues document
- contract grants rights or creates obligations
- entity currently controls ship
- inspector requests and evaluates documents
- document applies to person, ship, company, zone, hub, or contract

Nothing should be connected directly to "the player" if it could apply to an NPC, company, patrol craft, stolen ship, repo crew, hub, faction, or future multiplayer pilot. Systems should be things entities use, not things hard-wired into entities.

Missions should follow the same rule. A mission should not own a scanner, a contract engine, a licensing engine, or an economy. A mission should ask shared systems to do work: reveal a panel, offer a contract, issue a document, request an inspection, set a component lock, or listen for a ledger fact.

Entities should also use systems rather than carrying systems inside themselves. A ship can have components and physical state. A person can hold documents. A hub can request inspections. But the inspection system, contract system, document authority system, and economy should remain reusable world systems that many entities can call into.

Examples:

- A hub can inspect paperwork.
- A patrol can inspect paperwork.
- A repo crew can inspect paperwork.
- A player might inspect paperwork.
- A company might inspect paperwork before hiring.
- A pirate might fake or steal paperwork.

The paperwork inspection system should therefore be general. A hub is just one inspector using it. The question is not "does the player pass?" The question is "what documents were presented, who issued them, what do they apply to, what permissions do they grant, and does this inspector accept them under its rules?"

## Hub Approach And Identification

When a ship reaches a hub for the first time, the hub should not automatically treat the player as the center of the world. The hub should treat them as an approaching vessel that needs to be identified.

Possible flow:

1. The ship waits outside the hub boundary.
2. Hub control, a patrol, or an inspection beam contacts the ship.
3. The hub asks for ship identification.
4. The player clicks the VIN plate on the hull panel to transmit the ship VIN.
5. The hub asks for pilot identification.
6. The player clicks their name or ID on the license document to transmit pilot identity.
7. If needed, the hub asks for registration or title paperwork.
8. The player, mission NPC, or ship owner provides the relevant document.
9. The hub checks its registry/database and grants or denies access.

This should feel like a light Papers Please interaction, but in a ship cockpit. The player should present real documents and identifiers, not just pass a hidden `playerHasAccess` flag.

The first delivery ship might be registered to Rook Industries before the game starts. If Yard Exchange questions the title or registration, Rook could provide his own identity or authorization because he is the legal operator/employer for that job.

Later possibilities:

- Hubs remember ships and pilots after first clearance.
- Hubs have queues or patrol craft that intercept arrivals.
- Some hubs only check VIN and pilot license.
- Some hubs check registration, title, cargo manifest, warrants, liens, or faction status.
- A stolen ship can pass one hub and fail another depending on what that hub checks.
- Entering without clearance could trigger warning beams, fines, combat, or authority penalties.
- Patrol craft can perform the same inspection logic away from hubs.

Important systems direction:

- Hubs should inspect world records: people, ships, documents, registrations, titles, liens, contracts, and permissions.
- Hubs should use the general paperwork inspection system rather than owning a special hub-only inspection system.
- The player should provide or reveal documents through UI actions.
- NPC ships should eventually go through comparable inspection and clearance rules.
- The hub knows some truth through its registry, but it should only inspect the fields its authority/equipment/rules say it checks.
