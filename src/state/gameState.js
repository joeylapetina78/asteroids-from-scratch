export function createGameState() {
  return {
    ship: {
      isPowered: false,
      fuel: 200,
      maxFuel: 200,
      ammo: 200,
      maxAmmo: 200,
      scanergy: 200,
      maxScanergy: 200,
    },
  };
}
