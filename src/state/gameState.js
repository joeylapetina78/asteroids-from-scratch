import { createEventLedger } from "../systems/eventLedger.js?v=journey-chapter-one";

// Starting game/component state. This is the current lightweight substitute for
// future accounts, saves, installed modules, and player profiles.
export function createGameState() {
  return {
    ledger: createEventLedger(),
    journey: {
      chapterId: "prologue",
      chapterName: "Prologue",
      episodeName: "Do you want to play?",
      messages: [],
      mission: null,
      flags: {},
      pendingAcknowledgement: null,
      nextMessageId: 1,
    },
    ship: {
      frameId: "yard-skiff",
      name: "Yard Skiff",
      shape: "yard-skiff",
    },
    components: {
      account: {
        credits: 0,
      },
      engine: {
        installed: false,
        powered: false,
        thrustMode: "forward",
        fuel: 200,
        maxFuel: 200,
        thrustPower: 95,
        reverseThrustMultiplier: 0.2,
        rotationSpeed: 2.6,
        maxSpeed: 105,
        fuelBurnRate: 6,
        thrustVisual: {
          style: "ragged-flame",
          color: "#ffb85c",
          length: 15,
          width: 5,
        },
      },
      miner: {
        installed: false,
        armed: false,
        ammo: 100,
        maxAmmo: 200,
      },
      scanner: {
        installed: false,
        scanergy: 0,
        maxScanergy: 400,
      },
      processor: {
        installed: false,
        output: "fuel",
      },
      cargoHold: {
        installed: false,
      },
      docking: {
        installed: false,
      },
      hull: {
        installed: true,
        integrity: 100,
        maxIntegrity: 100,
      },
      collector: {
        installed: false,
        isActive: false,
      },
    },
  };
}
