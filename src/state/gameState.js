import { createEventLedger } from "../systems/eventLedger.js?v=tow-component-v1";

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
    contracts: {
      currentContractId: null,
      records: {},
    },
    hubServices: {
      unlocked: {},
    },
    debt: {
      totalBorrowed: 0,
      totalPaid: 0,
      activePrincipal: 0,
      activeBalance: 0,
      highestDebt: 0,
    },
    ship: {
      frameId: "yard-skiff",
      name: "Yard Skiff",
      shape: "yard-skiff",
      legal: {
        titleHolder: "Rook Industries",
        flightLicenseId: "TEMP-ROOKIE-FLIGHT",
        registrations: {
          flight: {
            id: "YR-FLIGHT-TEMP-7A3",
            status: "temporary",
            issuingHubId: "yard-exchange",
          },
          mining: {
            id: null,
            status: "none",
            issuingHubId: null,
          },
          patrol: {
            id: null,
            status: "none",
            issuingHubId: null,
          },
        },
      },
    },
    components: {
      account: {
        credits: 0,
      },
      engine: {
        installed: false,
        powered: false,
        powerLocked: false,
        thrustMode: "forward",
        fuel: 200,
        maxFuel: 200,
        thrustPower: 95,
        reverseThrustMultiplier: 0.2,
        rotationSpeed: 2.6,
        maxSpeed: 105,
        fuelBurnRate: 10,
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
        targets: ["resources", "sites"],
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
        vin: "YRDSKF-01-7A3",
        vinPlateAttached: true,
      },
      collector: {
        installed: false,
        isActive: false,
      },
      contract: {
        installed: false,
      },
      merchant: {
        installed: false,
      },
    },
  };
}
