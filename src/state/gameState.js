export function createGameState() {
  return {
    ship: {
      isPowered: false,
      fuel: 100,
      maxFuel: 100,
    },
    inventory: {
      crystals: 0,
    },
  };
}
