# World Structure

This document defines the world-generation mental model for Asteroids RPG. It is a design constraint for future code, not just lore.

The key distinction: geology/economy and navigation are different systems. The player experiences both at once, but they should not be tightly coupled.

## Universe

The complete setting.

This is mostly lore and long-term expansion for now. It does not need deep implementation yet.

## System

A major frontier.

Different systems may eventually have different governments, histories, economies, factions, and large-scale identities. This can remain lightweight for quite a while.

## Region

Region is the primary gameplay-scale world layer.

Regions define the ecology and economic identity of an area. A region answers: what kind of place is this in the wider world?

Regions can control:

- dominant resource families
- faction influence
- organizations operating there
- wildlife tendencies
- contract opportunities
- patrol activity
- piracy pressure
- mystery level
- infrastructure
- historical character

Examples: Iron Belt, Frozen Drift, Corporate Claim, Old War Scrapfield.

An Iron Belt and a Frozen Drift should naturally generate different industries, contracts, traffic, and stories.

## Zone

Zone defines the player's immediate flying experience.

Zones are about navigation, not economy. A player should often move through several zones while remaining inside the same region.

Zones can control:

- asteroid density
- average asteroid size
- maximum asteroid size
- clustering
- tunnel frequency
- line-of-sight
- open space
- debris fields
- traversal speed
- maneuvering difficulty
- visibility
- local hazards

Examples:

- Open Drift
- Dense Maze
- Needle Field
- Giant Boulders
- Rubble Cloud
- Crystal Forest
- Broken Corridor
- Spiral Field
- Cavern Belt
- Debris Stream

These names are gameplay promises. Dense Maze should create careful navigation. Needle Field should create a different style of flying. If a zone only changes visuals, it is probably not doing enough.

## Jurisdiction / Plot / Claim / Charter

This is the local authority/economy parcel layer.

The broad concept is not only "claim." A mining claim is one kind of right, but the world also needs transit rights, patrol rights, salvage rights, construction rights, trade rights, enforcement authority, and other legal relationships.

Useful terms:

- Jurisdiction: who has authority/control in an area.
- Plot: a small place-based parcel used by the map and economy.
- Claim: extraction/mining rights tied to a place.
- Charter: a granted bundle of legal rights, such as patrol, trade, mining, construction, or salvage.
- Corridor: fly-through/transit space that may remain open even when surrounding plots are restricted.

These parcels are not just resource patches. They are place-based units of rights, responsibility, and paperwork. They can include rocks, lanes, empty space, hazards, and infrastructure. They answer: who can do what here, under whose authority?

Plots/jurisdictions can hold:

- controlling authority
- owner, lessee, or responsible institution
- mining rights
- transit rights
- patrol rights
- salvage rights
- construction rights
- trade rights
- enforcement rights
- docking or transit rules
- resource focus and resource intensity
- claim status, such as active, disputed, abandoned, protected, or unclaimed
- valid documents, leases, permits, registrations, and contracts
- inspection rules and enforcement expectations

Plots should usually inherit broad context from their region and local navigation flavor from their zone, then vary individually. A Red Vein Belt region can contain many red-leaning mining claims, but a specific plot may be richer, poorer, disputed, exhausted, leased to Rook Industries, reserved as a public corridor, or controlled by a patrol authority.

This layer can later support:

- Rook assigning the player to work one of Rook's claims
- buying or leasing a claim
- hiring NPC miners to work a claim
- hub patrols inspecting whether a ship has permission to mine in a claim
- disputed claims, claim jumping, repo work, salvage rights, and legal trouble
- contracts that target a place instead of only a person or hub

For now, plots should be deterministic records that can be queried by world position. Do not make them only a visual overlay. The overlay is useful, but the important thing is that systems can ask: "what place-rights parcel is this coordinate inside, and what authority or paperwork applies here?"

## Regions And Zones Are Independent

Regions and zones combine to make a place.

Example:

Iron Belt Region:

- iron-rich
- corporate claims
- heavy industry
- medium patrol presence

Dense Maze Zone:

- high asteroid density
- tight tunnels
- poor visibility
- slow traversal

Together they create an iron-rich maze with industrial pressure and careful flying.

The same Dense Maze inside a Frozen Drift should keep the navigation feel but change the resources, contracts, wildlife, factions, ambience, and stories.

The flying stays familiar. The world changes.

Plots and jurisdictions sit underneath that combination. They divide the combined place into legal/economic parcels without replacing either the region or the zone. A Dense Maze in the Iron Belt can have mining claims, public transit corridors, patrol jurisdictions, disputed plots, and unclaimed gaps, all while keeping the same navigation profile.

## Transitions

Zones should not feel like invisible boxes. Asteroid density, clustering, visibility, and navigation characteristics should gradually shift as the player moves.

The player should feel that they are entering a different kind of space before they consciously recognize it.

Regions can transition more distinctly because they represent larger ecological and economic changes.

## Navigation Should Create Decisions

Zones are not decoration. They should create meaningful navigation choices.

Good zone decisions:

- This is a great place to lose a patrol.
- I should slow down here.
- This corridor is dangerous but much faster.
- Pirates would probably hide here.
- My larger ship will not fit comfortably through these tunnels.
- This is a good place to deploy a beacon or ambush someone.

## Resource Philosophy

Iron should feel like dirt.

It is common. It is everywhere.

Interesting gameplay comes from:

- concentration
- impurities
- extraction difficulty
- ownership
- competition
- transport costs
- processing requirements

Resources become interesting because of their relationships to the world, not because they are artificially rare.

## Current Implementation Note

The current code predates this cleaner split. `src/systems/worldZones.js` still mixes region-like values, such as resource families and danger, with zone-like navigation values, such as density. `src/systems/worldTerrain.js` is the first navigation-profile layer, but it still reads from `worldZones.js`.

Future work should split this into:

- `worldRegions.js`: economy, ecology, resource families, factions, organizations, contracts, patrol pressure, mystery.
- `worldZones.js` or `navigationZones.js`: flying profile, density, clustering, tunnels, visibility, asteroid size, hazards.
- `claimField.js`: deterministic plot/claim records and optional map overlay colors. Parcels should expose IDs, authority, separated rights, resource intensity, and ownership hooks before they drive gameplay.
- `worldTerrain.js`: chunk-level realization of the active zone profile into actual asteroid placement and movement.

The safe path is to add the new region layer beside the current one, then migrate resource/economy consumers first. Do not rewrite all world generation in one pass.

The current `worldRegions.js` is the first region-shaped scaffold. It defines region-level geology, economy, faction pressure, institutions, and default rights by type. The current `claimField.js` is the first parcel-shaped scaffold. It uses jittered grid/Voronoi-style seeds to make irregular map cells and can now return a lightweight plot/claim record for a world coordinate. That is enough for panorama inspection and future document/contract experiments, but it is not yet the full legal/economic parcel system.
