# Lesson 14: Component rules

The processor output list is no longer hard-coded in the HTML.

Instead, `componentRules.js` looks at installed ship components and decides which processor outputs should exist:

```js
engine installed -> fuel output
miner installed -> ammo output
scanner installed -> scanergy output
```

That means components can start to affect each other.

This is different from simply checking a button click. The page is now asking the ship state what systems are available, and then building the interface from that answer.

For the current version, the miner and scanner are still installed at startup, so all three processor outputs still appear. The important change is the relationship:

- the processor does not own the idea of ammo by itself
- ammo appears because the miner exists
- scanergy appears because the scanner exists
- fuel appears because the engine exists

This points toward the larger RPG structure:

- a starter ship can begin with only an engine and processor
- buying or earning a scanner can add scanergy as a processor output
- buying or earning a miner or gun can add ammo as a processor output
- damaged or unpowered components can eventually hide, disable, or weaken their connected controls

The UI panels are also starting to match the fantasy. The engine, processor, and ship systems are visible as separate ship component panels. They are still fixed in place for now, but this structure can grow into draggable panels later.
