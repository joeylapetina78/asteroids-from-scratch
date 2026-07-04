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
- `worldTerrain.js`: chunk-level realization of the active zone profile into actual asteroid placement and movement.

The safe path is to add the new region layer beside the current one, then migrate resource/economy consumers first. Do not rewrite all world generation in one pass.
