export function createGameState() {
  return {
    components: {
      engine: {
        installed: true,
        powered: false,
        thrustMode: "forward",
        fuel: 200,
        maxFuel: 200,
      },
      miner: {
        installed: true,
        armed: false,
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
      collector: {
        installed: true,
        rangeSetting: 0,
      },
    },
  };
}
