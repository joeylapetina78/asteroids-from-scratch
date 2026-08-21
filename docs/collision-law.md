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

## What it measures, and what it does not

Measured in a running world, ~4 minutes, sampling only craft that were MOVING
(a parked craft cannot dodge, see below). Penetration is expressed as a fraction
of the rock's own radius, because grazing a boulder and passing through a pebble
are not the same event:

| craft | moving samples | worst | past rock centre | rate |
|---|---:|---:|---:|---:|
| hauler | 7997 | 189% | 7 | **0.09%** |
| patrol | 329 | 141% | 1 | **0.30%** |
| miner | 5851 | 180% | 92 | **1.57%** |
| subspace hauler | 4503 | 195% | 18 | **0.40%** |

**Haulers are the standard, not perfection.** They have the richest navigator in
the game and still pass through a rock's centre about one moving frame in a
thousand, with a worst case of 186% of a radius. Anyone tempted to measure this
work against zero should start there: the bar the world actually holds is
"occasionally grazes", not "never touches".

**Miners improved from nothing to nearly that.** Before, they had no avoidance at
all and were measured at 105-138% inside rocks at full cruise on ordinary
errands. They now route around, at roughly thirteen times the hauler rate. Two
reasons for the remaining gap, both known:

- they use the simple primitive here, not the haulers' corridor-aware
  gap-finding with careful mode;
- **a parked craft cannot dodge.** Most remaining miner penetrations happen at
  speeds of 4-48 while station-keeping on a rock it is cutting, when a DIFFERENT
  rock drifts onto it. Steering cannot fix that; only a collision response or a
  station-keeping nudge could, and neither is in scope here.

**The subspace figure is the law working, not failing.** A shorter window read it
as 0.00% and the obvious story was "those craft are off on frontier lanes where no
asteroids spawn". The fuller run put them back among the rocks and they now pass
through a centre 0.40% of moving frames, with a worst of 195% of a radius. That is
what phasing looks like from outside: they do not dodge, because there is nothing
there to dodge. Read this row as confirmation, never as a defect to fix.

**Patrols are fine.** On the short window they looked mid-pack at 0.70% off 143
samples; with 329 they sit at 0.30%, nearer the haulers than the miners. No tuning
needed — which is only knowable because the thin number was not trusted.
