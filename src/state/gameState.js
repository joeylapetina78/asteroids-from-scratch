export function createGameState() {
  return {
    ship: {
      isPowered: false,
      fuel: 200,
      maxFuel: 200,
      ammo: 100,
      maxAmmo: 200,
      scanergy: 0,
      maxScanergy: 200,
    },
  };
}
