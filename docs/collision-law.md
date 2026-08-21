# The collision law

Whether a craft could pass through a rock used to be an accident of which entity
happened to get collision code. Four different answers to one question, none of
them written down anywhere:

| craft | collided | steered around |
|---|---|---|
| player ship | yes | pilot does |
| enemy fighters and hunters | yes | no |
| haulers | no | **yes** |
| miners | no | no |
| patrols | no | no |
| tow cable hook | **yes** | no |
| tow vehicle and towed ship | no | no |

So haulers politely rounded obstacles they could not have hit, miners and patrols
flew straight through, and a tow truck's cable collided while the hull it was
attached to did not. That last one is what makes the inconsistency visible from
outside: the tug appeared to clear a path for itself and then sink through the
rocks anyway.

## The rule

> A craft is either in **normal space**, where it must work around what is in the
> way, or in **subspace**, where there is nothing to work around. Nothing is half
> of each.

The two sides are declared on the drive (`shipDrives.js`) rather than implied by
an entity's class, so the answer travels with the hull.

| craft | space | works around the field |
|---|---|---|
| player ship | normal | pilot does |
| enemies | normal | no — hitting rocks is their problem |
| standard haulers | normal | yes, with corridor knowledge |
| subspace haulers | subspace | nothing to avoid |
| miners | normal | **yes**, except the rock they were sent to cut |
| patrols | normal | **yes** |
| tug + towed ship | **subspace** | nothing to avoid, at 2.5x |

## What it deliberately does not change

**Damage.** The law governs TRAVERSAL — whether a craft must go around — not
whether contact hurts. Making every working craft take collision damage would be
a balance change nobody asked for, and it would break mining outright: a miner
has to park against the rock it is cutting. Combatants and the player still take
impacts exactly as before.

**Hauler navigation.** Haulers already avoided obstacles, with corridor-aware
gap-finding and careful mode, and they do it well. `obstacleNavigation.js` is a
simpler primitive for craft that only need to not fly through things; the haulers
keep their richer navigator. One law, two implementations of differing capability
— stated here so the duplication is a decision rather than a discovery.

## The tow, and why it is subspace

The towed ship was already exempt from asteroid collision (`!this.activeTow` on
the player's collision check). That exemption had no reason attached; it was just
a special case that happened to look like sinking through the world.

A recovery tug carrying a subspace drive and pulling its client under is the same
behaviour with a cause — and it makes the cable consistent too, because both ends
are under together. The haul home runs at 2.5x rather than a jump: being
recovered from the frontier should feel like a long ride, not a punishing one and
not a teleport.
