# Lesson 13: Ship components

The ship now has explicit components in shared state:

```js
components: {
  engine: {
    installed: true,
    powered: false,
    fuel: 200,
    maxFuel: 200,
  },
  miner: {
    installed: true,
    ammo: 100,
    maxAmmo: 200,
  },
  scanner: {
    installed: true,
    scanergy: 0,
    maxScanergy: 200,
  },
  processor: {
    installed: true,
    output: "fuel",
  },
}
```

This does not change the visible game much yet. The point is to change what the code believes the game is.

Before this, fuel, ammo, scanergy, processor output, and ship power were loose state values. Now they belong to ship components:

- the engine owns fuel, power, and thrust
- the miner owns ammo and shooting
- the scanner owns scanergy and scanning
- the processor owns the selected output mode

This gives us a path toward the larger game idea:

- components can be installed or locked
- components can require power
- components can be bought, damaged, repaired, or upgraded
- the permit/application flow can grant a starter ship with starter components

The UI is becoming the ship interface. Buttons, gauges, and canvases are not just page decoration; they are how the player touches installed ship systems.
