import { createEventLedger } from "../systems/eventLedger.js?v=beacon-locator-v1";
import { PANEL_IDS } from "../systems/componentRegistry.js?v=component-visibility-v1";

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
    ui: {
      panels: createInitialPanelAvailability(),
      attention: {
        targets: {},
      },
    },
    hubServices: {
      unlocked: {},
      flags: {},
    },
    debt: {
      totalBorrowed: 0,
      totalPaid: 0,
      activePrincipal: 0,
      activeBalance: 0,
      highestDebt: 0,
    },
    legal: {
      pilotLicense: {
        firstName: null,
        lastName: null,
        licenseId: null,
        status: "none",
        issuedAt: null,
        authorizedZones: ["starter-drift", "open-space", "scrap-wake", "dead-strip", "red-teeth"],
        visitedZoneIds: [],
      },
      currentShip: {
        titleHolder: "Rook Industries",
        titleStatus: "company-owned",
        lienHolder: null,
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
      pilotLicenses: {},
      shipTitles: {},
      shipRegistrations: {},
      liens: {},
      paperwork: {},
    },
    ship: {
      frameId: "yard-skiff",
      name: "Yard Skiff",
      shape: "yard-skiff",
      purchasedOfferId: null,
    },
    credits: 0,
    components: {
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
        beaconMemoryIds: ["scrap-porch", "yard-exchange"],
        activeBeaconId: "yard-exchange",
        beaconLocatorUsed: false,
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
    },
  };
}

function createInitialPanelAvailability() {
  return Object.fromEntries(PANEL_IDS.map((panelId) => [panelId, { available: panelId === "journey" }]));
}
