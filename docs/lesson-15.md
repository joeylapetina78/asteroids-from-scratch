# Lesson 15: Field life

The asteroid field now has simple autonomous life forms.

The idea comes from steering behavior: each creature has a position, velocity, acceleration, maximum speed, and maximum steering force. Instead of directly teleporting or choosing a final path, each creature applies small steering forces.

The basic steering idea is:

```js
desired velocity - current velocity = steering force
```

That same idea can be mixed in different ways:

- Hunter: wanders until it senses the ship, then seeks it
- Threadling: uses separation, alignment, and cohesion to move with nearby threadlings
- Grazer: orbits rocks and flees the ship if it gets too close
- Skitter: wanders quickly, avoids rocks, and flees the ship

The creatures do not damage, harvest, or drop anything yet. They are field life first: visible motion that makes the space feel inhabited.

The important design line is that these are not scripted animations. They are agents with simple rules and limited perception. More complex behavior can emerge later by adding more goals, senses, or interactions.
