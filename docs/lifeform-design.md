# Lifeform Design

This note tracks the next ecology layer for the Asteroids RPG world. Life should help the player read place, danger, resources, and weirdness. Not every lifeform needs to be an enemy. Some should feel like terrarium behavior: things living on rocks, grazing around mineral pockets, migrating through corridors, or changing how a zone feels.

## Implemented First Slice

### Rockmoss Grazer

Rockmoss is asteroid ecology, not a free-flying animal. It grows as small glowing patches on some asteroids, weighted toward ambient-life zones and resource-bearing rocks. It should make some rocks feel alive and can later become farmable, harvestable, protected, diseased, owned by a claim, or useful as a visual hint for unusual ore.

Current implementation:

- seeded on asteroid objects by `lifeField.js`
- drawn in the viewport by `game.js`
- biased toward higher ambient life and resource-bearing rocks
- safe/lively zones should show more of it than sparse/dead zones
- mature colonies draw tiny crawler grazers moving around the asteroid surface

Future use:

- mark unusual ore
- create biological resource families
- create protected/farmed rocks
- make claims feel cultivated or neglected

### Lantern Herd

Lanterns are peaceful glowing lifeforms that drift around resource-rich asteroids. They are not enemies. Their job is to make mineral-rich space feel inhabited and to subtly teach players that life can be a clue.

Current implementation:

- new `lantern` lifeform type in `Lifeform.js`
- spawned in small herds by `lifeField.js`
- steers toward resource-bearing asteroids
- separates from its own herd and avoids rocks
- scatters from nearby hunters, mining fire, and scanner disturbance

Future use:

- migrate between claims
- attract predators
- serve as a soft scanner for interesting rocks

### Skitterweb Spider

The existing `skitter` type now has faint web trails. This keeps the current behavior but makes it read more like a creature that jumps or glides between rocks and leaves a filament memory behind it.

Current implementation:

- existing `skitter` lifeform records recent world positions
- viewport draws a faint dashed trail behind it
- fresh web lines briefly damp and tug a powered ship that cuts through them

Future use:

- create webbed asteroid pockets
- jump between rocks instead of continuous steering
- become a local hazard in dense mazes

### Threadwyrm

A long, translucent space snake that lives in corridors and rock walls. It should be a scale surprise: not necessarily hostile, but large enough that the player notices the world is bigger than them.

Current implementation:

- route-based megafauna in `Threadwyrm.js`
- spawned by `threadwyrmField.js` from weighted asteroid-corridor anchors
- moves as a segmented translucent body along a closed rock-chain route
- mostly ignores the player
- charges and strikes lightly if the powered ship cuts too close through its body
- treats nearby mining fire and scanner pulses as provocation

Future use:

- prefer actual zone corridor/claim geometry instead of nearby-asteroid loops
- react to nests, territory violations, or contracts
- create harvestable shed-skin/scale resources
- disturb smaller life when it passes through a field

### Mouth in the Drift

A rare event-level horror, not a normal enemy. It should feel like a place went wrong: stars pull inward, nearby life scatters, the viewport breathes, and then something opens.

Current implementation:

- rare anomaly records in `DriftMouth.js`
- spawned by `driftMouthField.js` in strange, anomalous, dangerous zones
- remains nearly invisible at range
- reveals as a circular distortion when approached
- gently pulls the ship, pickups, and nearby lifeforms while revealed

Future use:

- event lifecycle: warning, reveal, escape/consequence, cleanup
- consume asteroids or hunters and leave strange resources
- connect to rumors, missing-ship contracts, forbidden claims, and Dark Gods story
- create audio/camera distortion before the visual reveal

## Design Rules

- Life belongs to place. Zone and region should affect what appears.
- Life is not only combat. Some life should guide, warn, decorate, or complicate.
- Use existing systems first: `Lifeform` for simple agents, asteroid metadata for rock-bound ecology, world events for large anomalies.
- Avoid making special player-only interactions. NPC ships, claims, patrols, and future missions should be able to notice or care about the same ecology.
- Short-lived ecology disturbance records are emitted by noisy ship actions such as mining fire and scans. Lifeforms should react to those records rather than each hard-coding button/input checks.
