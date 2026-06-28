import { createEventLedger } from "../systems/eventLedger.js?v=journey-chapter-one";

// Starting game/component state. This is the current lightweight substitute for
// future accounts, saves, installed modules, and player profiles.
export function createGameState() {
  return {
    ledger: createEventLedger(),
    journey: {
      chapterId: "chapter-1",
      chapterName: "Chapter 1",
      episodeName: "The Interview",
      messages: [],
      mission: null,
      flags: {},
      pendingAcknowledgement: null,
      nextMessageId: 1,
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
