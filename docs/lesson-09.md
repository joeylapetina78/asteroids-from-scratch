# Lesson 09: Breakable asteroids

Asteroids now use tiers instead of hit points.

- tier 3 rocks break into tier 2 rocks
- tier 2 rocks break into tier 1 rocks
- tier 1 rocks disappear when hit

That gives every asteroid a readable life cycle: large, smaller, smallest, gone. Later the smallest tier can become the collectible rock instead of disappearing immediately.

Bullets and ship impacts use the same damage rule for now. The ship has a short hit cooldown so one overlap does not instantly chew through every fragment.

White asteroids are common stone. Colored asteroids still come from the resource field. When a colored asteroid breaks, only some of its fragments keep the ore color; the rest become white stone. That makes the resource feel embedded in ordinary rock instead of every chip being valuable.

The important design choice is that asteroids do not need to collide with each other yet. They drift near their own origins, break when hit, and give us enough world texture to start thinking about mining and collection rules next.
