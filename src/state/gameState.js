import { createEventLedger } from "../systems/eventLedger.js?v=careful-mode";

// Starting game/component state. This is the current lightweight substitute for
// future accounts, saves, installed modules, and player profiles.
export function createGameState() {
  return {
    ledger: createEventLedger(),
    components: {
      account: {
        credits: 0,
      },
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
      cargoHold: {
        installed: true,
      },
      hull: {
        installed: true,
        integrity: 100,
        maxIntegrity: 100,
      },
      collector: {
        installed: true,
        isActive: false,
      },
    },
  };
}
