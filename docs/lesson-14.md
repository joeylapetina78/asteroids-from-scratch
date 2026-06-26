# Lesson 14: Component rules

The processor output list is no longer hard-coded in the HTML.

Instead, `componentRules.js` looks at installed ship components and decides which processor outputs should exist:

```js
engine installed -> fuel output
miner installed -> ammo output
scanner installed -> scanergy output
cargo hold installed -> cargo output
```

That means components can start to affect each other.

This is different from simply checking a button click. The page is now asking the ship state what systems are available, and then building the interface from that answer.

For the current version, the miner and scanner are still installed at startup, so all three processor outputs still appear. The important change is the relationship:

- the processor does not own the idea of ammo by itself
- ammo appears because the miner exists
- scanergy appears because the scanner exists
- fuel appears because the engine exists
- cargo appears because the cargo hold exists

This points toward the larger RPG structure:

- a starter ship can begin with only an engine and processor
- buying or earning a scanner can add scanergy as a processor output
- buying or earning a miner or gun can add ammo as a processor output
- damaged or unpowered components can eventually hide, disable, or weaken their connected controls

The UI panels are also starting to match the fantasy. The engine, processor, scanner, miner, collector, cargo hold, and hull are visible as separate ship component panels. Panel titles can now be dragged, and the movement snaps to a small grid.

The current draggable behavior is visual and session-only. The likely saved version is:

```js
components: {
  scanner: {
    installed: true,
    panel: { x: 2, y: 0, width: 1, height: 1 },
  },
}
```

Then the page can render component panels onto a dashboard grid and save their positions. That is separate from the gameplay behavior, which is important: moving the scanner panel around should change the ship interface layout, not the scanner's world position.

The collector is the first component that continuously connects two systems. It belongs to the ship UI, but it spends scanner energy and affects resource pickups in the world. That is the pattern we can reuse later for things like shields, repair systems, cargo handling, or factory modules.

The cargo hold is different from the processor. It uses the same falling-square physics, but its units are not clickable. They are stored for future systems, like quests that ask for a certain number of crystals.

The collector now uses four named strengths instead of a free slider:

```js
Off -> 0
Small -> 0.25
Med -> 0.6
Large -> 1
```

That gives the component a more switch-like cockpit feel. It also makes balancing easier, because each strength can eventually have a known power draw and range.

White stone debris and ship sparks are visual feedback only. They are particles, not resources. That distinction matters: resources go through processor/cargo systems, while impact particles just help the world feel responsive.
