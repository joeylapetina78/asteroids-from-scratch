export function createGameState() {
  return {
    ship: {
      isPowered: false,
      fuel: 200,
      maxFuel: 200,
    },
    inventory: {
      crystals: 0,
    },
  };
}
