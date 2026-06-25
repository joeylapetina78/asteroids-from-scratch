export function createGameState() {
  return {
    ship: {
      isPowered: false,
    },
    inventory: {
      total: 0,
      resources: {
        iron: 0,
        copper: 0,
        ice: 0,
        crystal: 0,
      },
    },
  };
}
