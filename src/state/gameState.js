export function createGameState() {
  return {
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
    },
  };
}
