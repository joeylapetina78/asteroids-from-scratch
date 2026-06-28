# Lesson 15: Field life

The asteroid field now has simple autonomous life forms.

The idea comes from steering behavior: each creature has a position, velocity, acceleration, maximum speed, and maximum steering force. Instead of directly teleporting or choosing a final path, each creature applies small steering forces.

The basic steering idea is:

```js
desired velocity - current velocity = steering force
```

That same idea can be mixed in different ways:

- Hunter: wanders until it senses a powered ship, then seeks it. If the ship powers down, the hunter loses lock. Hunters can be shot, ram the ship, take damage from impacts, drop resources, and respawn elsewhere.
- Threadling: uses separation, alignment, and cohesion to move with nearby threadlings
- Grazer: orbits rocks and flees the ship if it gets too close
- Skitter: wanders quickly, avoids rocks, and flees the ship

The creatures started as field life first: visible motion that makes the space feel inhabited. Since then, hunters have become the first hostile lifeform with combat and drops, while threadlings, grazers, and skitters remain mostly ambient. They are more densely seeded based on zone bias, then preserved farther out in the field.

Drawing and simulation are separate. We only draw life forms inside the viewport, but we also keep a larger active area around the viewport and ship where they update. Life forms outside that padded area sleep until the player gets near them again.

The important design line is that these are not scripted animations. They are agents with simple rules and limited perception. More complex behavior can emerge later by adding more goals, senses, or interactions.
