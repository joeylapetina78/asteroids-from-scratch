import { createEventLedger } from "../systems/eventLedger.js?v=fresh-20260822-1344-layout";
import { PANEL_IDS } from "../systems/componentRegistry.js?v=fresh-20260822-1344-layout";
import { createInitialAccounts } from "../systems/accounts.js?v=fresh-20260822-1344-layout";
import { createInitialHulls } from "../systems/hulls.js?v=fresh-20260822-1344-layout";
import { createInitialObligations } from "../systems/obligations.js?v=fresh-20260822-1344-layout";
import { seedAuthorityFoundation } from "../systems/authoritySeeds.js?v=fresh-20260822-1344-layout";
import { createEmptyWorldRecords } from "../systems/worldRecords.js?v=fresh-20260822-1344-layout";
import { createInitialSprcState } from "../systems/sprcOperation.js?v=fresh-20260822-1344-layout";
import { createInitialLogisticsState } from "../systems/logistics.js?v=fresh-20260822-1344-layout";
import { createInitialPopulationState } from "../systems/populationDemand.js?v=fresh-20260822-1344-layout";
import { createInitialProcurementState } from "../systems/hubProcurement.js?v=fresh-20260822-1344-layout";
import { createInitialTowServiceState } from "../systems/towService.js?v=fresh-20260822-1344-layout";
import { createInitialRightsAuthorities } from "../systems/rightsAuthority.js?v=fresh-20260822-1344-layout";
import { createInitialIndustrialState } from "../systems/industrialProduction.js?v=fresh-20260822-1344-layout";
import { consolidateSprcOwnership } from "../systems/sprcOwnership.js?v=fresh-20260822-1344-layout";
import { createInitialNpcDevelopmentState } from "../systems/npcDevelopment.js?v=fresh-20260822-1344-layout";

export function createGameState() {
  const state = {
    ledger: createEventLedger(),
    journey: {
      chapterId: "prologue",
      chapterName: "Prologue",
      episodeName: "Do you want to play?",
      messages: [],
      mission: null,
      flags: {},
      globalFlags: {},
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
      paperwork: {
        filingIntroduced: true,
      },
      viewportLayout: "default",
      viewportZoom: 1.0,
      mapAlpha: 0.40,
      mapGlow: 0.20,
      // The rights overlay outlines and shades controlled plots the pilot may
      // not legally work. On by default so a new pilot learns where the lines
      // are; toggled from the rights paperwork once they know the neighborhood.
      rightsOverlayEnabled: true,
    },
    hubServices: {
      unlocked: {},
      flags: {},
      skipMissionFirstContracts: {},
      jobBoards: {},
    },
    worldRecords: createEmptyWorldRecords(),
    // Rights-issuing authorities (the capital that sells work passes/permits).
    // Their treasuries are intentionally NOT part of the tracked institutional
    // economy yet — see rightsAuthority.js.
    authorities: createInitialRightsAuthorities(),
    // Procedural settlements are durable seeds, not reconstructed guesses.
    // Authored settlements use the same compiler but remain content-owned.
    settlements: { version: 1, generated: {} },
    distantSimulation: { version: 1, hubs: {}, transitions: [], counters: { transition: 0 } },
    sprc: createInitialSprcState(),
    logistics: createInitialLogisticsState(),
    population: createInitialPopulationState(),
    hubProcurement: createInitialProcurementState(),
    industrial: createInitialIndustrialState(),
    npcDevelopment: createInitialNpcDevelopmentState(),
    towing: createInitialTowServiceState(),
    cargoCustody: {
      holderEntityId: null,
      shipVin: null,
      units: [],
      updatedAt: null,
    },
    character: {
      controlledPersonEntityId: null,
      currentLicenseId: null,
      activeHullVin: "YRDSKF-01-7A3",
    },
    hulls: createInitialHulls(),
    obligations: createInitialObligations(),
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
        class: "provisional",
        displayClass: "Provisional · 90-Day",
        issuedAt: null,
        authorizedZones: ["starter-drift", "open-space", "scrap-wake", "dead-strip", "red-teeth"],
        visitedZoneIds: [],
        territorialEndorsements: [],
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
      // Which authorities the pilot may currently mine under. To start this is
      // only Rook's sponsoring permit (RI-7A3 / rook-industries), so controlled
      // ground under any other claims office reads as off-limits until the pilot
      // buys or is granted the right. Not a `player.canMine` flag — a set of
      // authorities checked against each plot's own mining right.
      //
      // Flight rights are NOT here: they are the pilot license's `authorizedZones`
      // above, which is the rule hub inspections actually enforce.
      operatingRights: {
        enforceLegacyZones: false,
        mining: { authorityIds: ["rook-industries"] },
        territories: { grants: [] },
      },
    },
    ship: {
      frameId: "yard-skiff",
      name: "Yard Skiff",
      shape: "yard-skiff",
      purchasedOfferId: null,
    },
    accounts: createInitialAccounts(),
    credits: 0,
    components: {
      engine: {
        installed: false,
        powered: false,
        powerLocked: false,
        engineModelId: "rook-standard-drive",
        upgrades: [],
        thrustMode: "forward",
        fuel: 2000,
        maxFuel: 2000,
        thrustPower: 95,
        reverseThrustMultiplier: 0.2,
        rotationSpeed: 2.6,
        maxSpeed: 105,
        fuelBurnRate: 10,
        // Persistent wear/fault state, driven by the shared panel-condition
        // machine (panelMaintenance.js) with engine-specific rules from
        // engineCondition.js. First panel wired into that system.
        condition: {
          stage: "healthy", wear: 0, currentCondition: 100,
          lifetimeDegradation: 0, maxRecoverableCondition: 100, serviceCount: 0,
        },
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
        maxAmmo: 2000,
        // Second panel on the shared wear/condition machine (minerCondition.js).
        // Wears from firing; symptoms are slower/heavier charge, sputtering
        // misfires, and aim drifting off the reticle. Seeded even while
        // uninstalled so the record exists the moment the laser is fitted.
        condition: {
          stage: "healthy", wear: 0, currentCondition: 100,
          lifetimeDegradation: 0, maxRecoverableCondition: 100, serviceCount: 0,
        },
      },
      beaconLocator: {
        installed: false,
        beaconMemoryIds: ["scrap-porch", "yard-exchange"],
        activeBeaconId: "yard-exchange",
        beaconLocatorUsed: false,
      },
      beaconBay: {
        installed: false,
        recoverySeconds: 2.4,
        recovery: null,
        bays: [
          { id: "bay-1", label: "Bay 1", status: "stored", beaconId: "personal-beacon-1", position: null },
          { id: "bay-2", label: "Bay 2", status: "stored", beaconId: "personal-beacon-2", position: null },
          { id: "bay-3", label: "Bay 3", status: "stored", beaconId: "personal-beacon-3", position: null },
        ],
      },
      scanner: {
        installed: false,
        scanergy: 0,
        maxScanergy: 2500,
        targets: ["resources"],
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
        // Onboard patch material converted at the processor (Repair Hull mode).
        // Denominated in integrity points, so it patches the hull 1:1; a full
        // reserve is exactly one full hull repair. Lives here for now because the
        // hull is its only consumer — will move to a shared onboard supply once
        // other panels draw from it.
        repairReserve: 0,
        maxRepairReserve: 100,
        condition: {
          stage: "healthy", wear: 0, currentCondition: 100,
          lifetimeDegradation: 0, maxRecoverableCondition: 100, serviceCount: 0,
        },
        vin: "YRDSKF-01-7A3",
        vinPlateAttached: true,
      },
      collector: {
        installed: false,
        isActive: false,
        // Third panel on the shared wear/condition machine (collectorCondition.js).
        // Wears from holding the field active; symptoms shrink its reach, weaken
        // its pull, flicker its grip, swirl objects, and at worst shove them away.
        condition: {
          stage: "healthy", wear: 0, currentCondition: 100,
          lifetimeDegradation: 0, maxRecoverableCondition: 100, serviceCount: 0,
        },
      },
      shield: {
        installed: false,
        isActive: false,
        chargeBurnRate: 14,
        radius: 42,
      },
      cloak: {
        installed: false,
        isActive: false,
        fuelBurnMultiplier: 1.35,
        maxSpeedMultiplier: 0.78,
      },
      towCable: {
        installed: false,
        status: "Idle",
        lineLength: 0,
        maxLength: 650,
      },
      mossHarvester: {
        installed: false,
        deployed: false,
        status: "Stored",
        food: 0,
        intakeProgress: 0,
        intakeRadius: 96,
        position: null,
      },
      mossSeeder: {
        installed: false,
        status: "No crawler cargo",
        shotsFired: 0,
      },
    },
  };

  seedAuthorityFoundation(state);
  consolidateSprcOwnership(state);
  return state;
}

function createInitialPanelAvailability() {
  const alwaysAvailablePanelIds = new Set(["journey", "resource-guide"]);
  return Object.fromEntries(PANEL_IDS.map((panelId) => [panelId, { available: alwaysAvailablePanelIds.has(panelId) }]));
}
