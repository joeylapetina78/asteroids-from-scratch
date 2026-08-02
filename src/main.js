import { getProcessorOutputs, normalizeProcessorOutput } from "./components/componentRules.js?v=fresh-20260801-2156-8671710";
import { getResourceColor, getResourceGuideEntries, getResourceProcessValue, getResourceShape, getResourceTradeValue, normalizeResourceType } from "./systems/resourceDefinitions.js?v=fresh-20260801-2156-8671710";
import { addToTank } from "./systems/panelMaintenance.js?v=fresh-20260801-2156-8671710";
import { drawResourceShape } from "./entities/ResourcePickup.js?v=fresh-20260801-2156-8671710";
import { shipOffers } from "./content/ships/shipOffers.js?v=fresh-20260801-2156-8671710";
import { chapterOneRoute, storyRegions, yardExchangeServices } from "./content/storyWorld.js?v=fresh-20260801-2156-8671710";
import { Game } from "./game.js?v=fresh-20260801-2156-8671710";
import { createContractManager, registerContractDefinition } from "./systems/contractManager.js?v=fresh-20260801-2156-8671710";
import { COMMS_SOURCES, createCommsDirector } from "./systems/commsDirector.js?v=fresh-20260801-2156-8671710";
import { createGameAudio } from "./systems/audio.js?v=fresh-20260801-2156-8671710";
import { canSpendCredits, depositCredits, getCredits, spendCredits } from "./systems/accounts.js?v=fresh-20260801-2156-8671710";
import {
  getHubServiceBehavior,
  getHubServicePrompt,
  getServiceTypesForPanel,
  shouldKeepServiceWindowOpen,
} from "./systems/hubServiceBehaviors.js?v=fresh-20260801-2156-8671710";
import { getAllHubServiceContractIds, getInProgressServiceContractId, getNextHubServiceContractId, isServiceContractLadderComplete } from "./systems/hubServiceContracts.js?v=fresh-20260801-2156-8671710";
import { getHubService, getHubServices } from "./systems/hubServices.js?v=fresh-20260801-2156-8671710";
import { syncActiveHullFromComponents } from "./systems/hulls.js?v=fresh-20260801-2156-8671710";
import { createJourneyDirector } from "./systems/journeyDirector.js?v=fresh-20260801-2156-8671710";
import { COMPONENT_STATE_BY_PANEL_ID } from "./systems/componentRegistry.js?v=fresh-20260801-2156-8671710";
import { getRegistryEntityIdForSite, getRegistrySubject } from "./systems/entityRegistry.js?v=fresh-20260801-2156-8671710";
import { getPilotLicense, issuePilotLicense, registerStarterDeliveryShipRecords, updateCurrentShipLegal } from "./systems/legalRecords.js?v=fresh-20260801-2156-8671710";
import { createShipPaperworkInspectionReport } from "./systems/paperworkInspections.js?v=fresh-20260801-2156-8671710";
import { Processor } from "./systems/processor.js?v=fresh-20260801-2156-8671710";
import { clearSavedProfile, getDevStart, loadSavedProfile, peekSavedDevStartId, restoreSavedWorld, saveProfile, shouldResetSave } from "./systems/saveManager.js?v=fresh-20260801-2156-8671710";
import { purchaseShipOffer } from "./systems/shipPurchase.js?v=fresh-20260801-2156-8671710";
import { createGameState } from "./state/gameState.js?v=fresh-20260801-2156-8671710";
import { createSprcOperation, SPRC } from "./systems/sprcOperation.js?v=fresh-20260801-2156-8671710";
import { createFarmOperation, FARM_INSPECTION_SERVICE_ID } from "./systems/farmOperation.js?v=fresh-20260801-2156-8671710";
import { INSTITUTION_ARCHETYPES } from "./content/institutions/institutionArchetypes.js?v=fresh-20260801-2156-8671710";
import { createLogisticsManager } from "./systems/logistics.js?v=fresh-20260801-2156-8671710";
import { createTowServiceManager } from "./systems/towService.js?v=fresh-20260801-2156-8671710";
import { createMiningOperation } from "./systems/miningOperation.js?v=fresh-20260801-2156-8671710";
import { FLINT_MINING_SEED } from "./content/economy/miningInstitutions.js";
import { createPopulationOperation } from "./systems/populationDemand.js?v=fresh-20260801-2156-8671710";
import { createHubProcurementOperation } from "./systems/hubProcurement.js?v=fresh-20260801-2156-8671710";
import { issueWorldDocument } from "./systems/worldRecords.js?v=fresh-20260801-2156-8671710";
import { inspectActor, listInspectableActors } from "./systems/actorInspector.js?v=fresh-20260801-2156-8671710";
import { listBlocked } from "./systems/diagnostics.js?v=fresh-20260801-2156-8671710";
import { CONTRACT_STATE, filterContracts, listContractParties, listContracts, summarizeContracts } from "./systems/contractBoard.js?v=fresh-20260801-2156-8671710";
import { collectFilterOptions, describeEvent, describeEventRetention, extractEventReferences, filterEvents, getEventVisibility, sortEvents, summarizeEvent } from "./systems/ledgerQuery.js?v=fresh-20260801-2156-8671710";

// main.js is the browser/page coordinator. It creates the game systems, wires
// DOM controls to component state, and keeps the visible panels in sync.

// Uncaught boot errors kill module evaluation silently — the page half-renders
// with no console.* trail. Surface them so a broken init is always loud.
window.addEventListener("error", (event) => {
  console.error(`[boot] ${event.message} (${event.filename?.split("/").pop() ?? "?"}:${event.lineno})`);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error(`[boot] unhandled rejection: ${event.reason}`);
});
const OLD_PANEL_LAYOUT_STORAGE_KEYS = [
  "asteroids.panelLayout.v1",
  "asteroids.panelLayout.v2",
  "asteroids.panelLayout.v3",
  "asteroids.panelLayout.v4",
  "asteroids.panelLayout.v5",
];
// Each play mode has its own desk. Version 6 intentionally starts clean: the
// old single-desk records were allowed to bleed positions between modes.
const PANEL_LAYOUT_STORAGE_KEY = "asteroids.panelLayout.v6";
const JOURNEY_PANEL_Z_INDEX = 560;
const VIEWPORT_PANEL_Z_INDEX = 10;
const DESK_PANEL_MIN_Z_INDEX = 30;
const DESK_PANEL_MAX_Z_INDEX = 520;
const PAPERWORK_PANEL_IDS = ["license", "resource-guide", "document", "contract"];
const TOW_DRIVER_NAMES = ["Nell Winch"];
const YARD_EXCHANGE_CORE_SERVICES = [
  yardExchangeServices.rook,
  yardExchangeServices.shipyard,
  yardExchangeServices.finance,
  yardExchangeServices.supply,
];
const MURMUR_SERVICE_ID = yardExchangeServices.roadmap;
const MURMUR_LIFEFORM_TOUR_MESSAGES = {
  rockmoss:
    "Rockmoss. Green hunger on stone. It feeds slowly, hints loudly, and marks the rocks that have slept beside minerals for a long time.",
  lantern:
    "Lantern drift. Gentle stomach-stars. They graze on mineral scent and wander toward good rock. Follow softly and they may teach you where the belt is sweet.",
  skitter:
    "Skitterweb. Do not admire the thread from inside it. Fresh silk pulls at a ship like space trying to tie a knot.",
  threadwyrm:
    "Threadwyrm. Old corridor-owner. It is not chasing you. It is using a road it had before roads had names. Cross it loudly and it will explain boundaries.",
  "drift-mouth":
    "A drift mouth. Rare. Wrong. Hungry without anger. If space bends around a silence, believe the silence.",
};
const STARTER_REGION_NAME = storyRegions.starterRegion.name;
const DEEP_SPACE_REGION_NAME = storyRegions.deepSpace.name;
const JOURNEY_WORD_DELAY_MS = 34;
const ATTENTION_ONCE_MS = 1800;
const PAPERWORK_DRAWER_AUTO_CLOSE_MS = 900;
const ROCKMOSS_CRAWLER_RESOURCE = "rockmoss-crawler";
const DEFAULT_PANEL_LAYOUT = {
  viewport: { x: 0, y: 0, z: 20 },
  license: { x: 980, y: 20, z: 95 },
  journey: { x: 980, y: 20, z: JOURNEY_PANEL_Z_INDEX },
  engine: { x: -300, y: 20, z: 70 },
  "beacon-locator": { x: 980, y: 300, z: 90 },
  "beacon-bay": { x: 980, y: 430, z: 89 },
  scanner: { x: 980, y: 560, z: 88 },
  docking: { x: -300, y: 340, z: 100 },
  tow: { x: -300, y: 520, z: 125 },
  "tow-cable": { x: 760, y: 760, z: 55 },
  "moss-harvester": { x: 760, y: 580, z: 56 },
  "moss-seeder": { x: 760, y: 400, z: 57 },
  shield: { x: 760, y: 220, z: 58 },
  cloak: { x: 980, y: 300, z: 59 },
  contract: { x: -300, y: 340, z: 95 },
  document: { x: -40, y: 240, z: 96 },
  "resource-guide": { x: -40, y: 440, z: 94 },
  finley: { x: 70, y: 120, z: 115 },
  "component-shop": { x: 80, y: 140, z: 118 },
  roadmap: { x: 120, y: 100, z: 130 },
  merchant: { x: 70, y: 120, z: 120 },
  miner: { x: 980, y: 500, z: 60 },
  collector: { x: 980, y: 680, z: 50 },
  hull: { x: -300, y: 580, z: 50 },
  world: { x: 980, y: 20, z: 40 },
  hub: { x: -300, y: 340, z: 110 },
  "rook-jobs": { x: 80, y: 140, z: 116 },
  processor: { x: 0, y: 0, z: 48 },
  cargo: { x: 0, y: 0, z: 46 },
};
const licenseApplication = document.querySelector("#license-application");
const licenseForm = document.querySelector("#license-form");
const licenseFirstName = document.querySelector("#license-first-name");
const licenseLastName = document.querySelector("#license-last-name");
const licenseFormError = document.querySelector("#license-form-error");
const licensePilotName = document.querySelector("#license-pilot-name");
const licenseIdDisplay = document.querySelector("#license-id");
const licenseCreditsDisplay = document.querySelector("#license-credits");
const paperworkDrawer = document.querySelector("#paperwork-drawer");
const drawerToggle = document.querySelector("#drawer-toggle");
const finleyPanel = document.querySelector("[data-panel-id='finley']");
const supplyPanelNpc = document.querySelector("#supply-panel-npc");
const supplyPanelOrg = document.querySelector("#supply-panel-org");
const finleyCredits = document.querySelector("#finley-credits");
const finleyCargoValue = document.querySelector("#finley-cargo-value");
const finleySellToggle = document.querySelector("#finley-sell-toggle");
const finleyHull = document.querySelector("#finley-hull");
const finleyRepairButton = document.querySelector("#finley-repair");
const finleyRepairCost = document.querySelector("#finley-repair-cost");
const finleyFuel = document.querySelector("#finley-fuel");
const finleyFuelButton = document.querySelector("#finley-fuel-btn");
const finleyFuelCost = document.querySelector("#finley-fuel-cost");
const finleyCharges = document.querySelector("#finley-charges");
const finleyChargesButton = document.querySelector("#finley-charges-btn");
const finleyChargesCost = document.querySelector("#finley-charges-cost");
const finleyScan = document.querySelector("#finley-scan");
const finleyScanButton = document.querySelector("#finley-scan-btn");
const finleyScanCost = document.querySelector("#finley-scan-cost");
const supplyRawStock = document.querySelector("#supply-raw-stock");
const supplyRawStockList = document.querySelector("#supply-raw-stock-list");
const componentShopNpc = document.querySelector("#component-shop-npc");
const componentShopOrg = document.querySelector("#component-shop-org");
const componentShopCredits = document.querySelector("#component-shop-credits");
const componentOffersPanel = document.querySelector("#component-offers");
const ammoCount = document.querySelector("#ammo-count");
const cargoCanvas = document.querySelector("#cargo");
const cargoPanel = document.querySelector("[data-panel-id='cargo']");
const canvas = document.querySelector("#game");
const creditCount = document.querySelector("#credit-count");
const contractAcceptButton = document.querySelector("#contract-accept");
const contractClauses = document.querySelector("#contract-clauses");
const contractDestination = document.querySelector("#contract-destination");
const contractFileStack = document.querySelector("#contract-file-stack");
const contractIssuer = document.querySelector("#contract-issuer");
const contractNavCount = document.querySelector("#contract-nav-count");
const contractNextButton = document.querySelector("#contract-next");
const contractPayment = document.querySelector("#contract-payment");
const contractPaymentAmount = document.querySelector("#contract-payment-amount");
const contractPaymentMax = document.querySelector("#contract-payment-max");
const contractPrimaryLabel = document.querySelector("#contract-primary-label");
const contractProgress = document.querySelector("#contract-progress");
const contractProgressLabel = document.querySelector("#contract-progress-label");
const contractProgressCount = document.querySelector("#contract-progress-count");
const contractProgressFill = document.querySelector("#contract-progress-fill");
const contractReward = document.querySelector("#contract-reward");
const contractSecondaryLabel = document.querySelector("#contract-secondary-label");
const contractStatus = document.querySelector("#contract-status");
const contractSummary = document.querySelector("#contract-summary");
const contractTertiaryLabel = document.querySelector("#contract-tertiary-label");
const contractTitle = document.querySelector("#contract-title");
const contractVin = document.querySelector("#contract-vin");
const componentCloseButtons = document.querySelectorAll("[data-close-panel]");
const fuelCount = document.querySelector("#fuel-count");
const attentionCalloutLayer = document.querySelector("#attention-callouts");
const fuelFill = document.querySelector("#fuel-fill");
const hullCount = document.querySelector("#hull-count");
const hullFill = document.querySelector("#hull-fill");
const hullVin = document.querySelector("#hull-vin");
const hullDockingLock = document.querySelector("#hull-docking-lock");
const hullReserveCount = document.querySelector("#hull-reserve-count");
const hullReserveFill = document.querySelector("#hull-reserve-fill");
const hullRepairStatus = document.querySelector("#hull-repair-status");
const dockToggleButton = document.querySelector("#dock-toggle");
const dockingDetail = document.querySelector("#docking-detail");
const dockingTarget = document.querySelector("#docking-target");
const documentFields = document.querySelector("#document-fields");
const documentStatus = document.querySelector("#document-status");
const documentSummary = document.querySelector("#document-summary");
const documentTitle = document.querySelector("#document-title");
const documentType = document.querySelector("#document-type");
const resourceGuideContent = document.querySelector("#resource-guide-content");
const hubDetail = document.querySelector("#hub-detail");
const hubName = document.querySelector("#hub-name");
const hubPanel = document.querySelector("[data-panel-id='hub']");
const hubServiceMenu = document.querySelector("#hub-service-menu");
const rookJobBoard = document.querySelector("#rook-job-board");
const rookJobsPanel = document.querySelector("[data-panel-id='rook-jobs']");
const hubStatus = document.querySelector("#hub-status");
const journeyAcceptButton = document.querySelector("#journey-accept");
const journeyDeclineButton = document.querySelector("#journey-decline");
const journeyChapter = document.querySelector("#journey-chapter");
const journeyHelpText = document.querySelector("#journey-help-text");

// The board's contents are replaced whenever its state changes. Keep one
// listener on the stable board container so a card click survives that redraw.
rookJobBoard?.addEventListener("click", (event) => {
  const jobButton = event.target.closest("[data-rook-job-id]");
  if (!jobButton || !rookJobBoard.contains(jobButton)) {
    return;
  }

  selectRookJob(jobButton.dataset.rookJobId);
});
const journeyLog = document.querySelector("#journey-log");
const journeyMissionObjective = document.querySelector("#journey-mission-objective");
const journeyMissionTitle = document.querySelector("#journey-mission-title");
const journeyPanel = document.querySelector("[data-panel-id='journey']");
const journeyPortraitArt = document.querySelector("#journey-portrait-art");
const journeyStatus = document.querySelector("#journey-status");
const merchantCredits = document.querySelector("#merchant-credits");
const minerArmed = document.querySelector("#miner-armed");
const powerButton = document.querySelector("#ship-power");
const processorCanvas = document.querySelector("#processor");
const processorOutputPanel = document.querySelector(".processor-outputs");
const scanButton = document.querySelector("#ship-scan");
const scanTrigger = document.querySelector("#scan-trigger");
const beaconTracking = document.querySelector("#beacon-tracking");
const beaconBayButtons = [...document.querySelectorAll("[data-beacon-bay]")];
const beaconRecoveryMeter = document.querySelector("#beacon-recovery-meter");
const beaconRecoveryLabel = document.querySelector("#beacon-recovery-label");
const beaconRecoveryFill = document.querySelector("#beacon-recovery-fill");
const scanergyCount = document.querySelector("#scanergy-count");
const beaconDirectionArrow = document.querySelector("#beacon-direction-arrow");
const shipOffersPanel = document.querySelector("#ship-offers");
const shipStatus = document.querySelector("#ship-status");
const towSection = document.querySelector("#tow-section");
const towButton = document.querySelector("#tow-button");
const towCostDisplay = document.querySelector("#tow-cost");
const towCableFireButton = document.querySelector("#tow-cable-fire");
const towCableReelButton = document.querySelector("#tow-cable-reel");
const towCablePayOutButton = document.querySelector("#tow-cable-pay-out");
const towCableReleaseButton = document.querySelector("#tow-cable-release");
const towCableStatus = document.querySelector("#tow-cable-status");
const towCableLength = document.querySelector("#tow-cable-length");
const mossHarvesterDeployButton = document.querySelector("#moss-harvester-deploy");
const mossHarvesterRecallButton = document.querySelector("#moss-harvester-recall");
const mossHarvesterStatus = document.querySelector("#moss-harvester-status");
const mossHarvesterFood = document.querySelector("#moss-harvester-food");
const mossSeederFireButton = document.querySelector("#moss-seeder-fire");
const mossSeederCount = document.querySelector("#moss-seeder-count");
const mossSeederStatus = document.querySelector("#moss-seeder-status");
const tractorFieldButton = document.querySelector("#tractor-field-button");
const tractorFieldStatus = document.querySelector("#tractor-field-status");
const shieldButton = document.querySelector("#shield-button");
const shieldCharges = document.querySelector("#shield-charges");
const shieldStatus = document.querySelector("#shield-status");
const cloakButton = document.querySelector("#cloak-button");
const cloakStatus = document.querySelector("#cloak-status");
const engineStrafeHint = document.querySelector("#engine-strafe-hint");
const engineBoostHint = document.querySelector("#engine-boost-hint");
const viewportRegion = document.querySelector("#viewport-region");
const zoomInButton = document.querySelector("#zoom-in");
const zoomOutButton = document.querySelector("#zoom-out");
const zoomLabel = document.querySelector("#zoom-label");
const alphaUpButton = document.querySelector("#alpha-up");
const alphaDownButton = document.querySelector("#alpha-down");
const alphaLabel = document.querySelector("#alpha-label");
const ledgerStreamEvents = document.querySelector("#ledger-stream-events");
const ledgerStreamFilter = document.querySelector("#ledger-stream-filter");
const ledgerStreamStats = document.querySelector("#ledger-stream-stats");
const ledgerStreamPopulation = document.querySelector("#ledger-stream-population");
let panelAlpha = 0;
const worldDebugFields = {
  position: document.querySelector("#debug-position"),
  zone: document.querySelector("#debug-zone"),
  influence: document.querySelector("#debug-influence"),
  danger: document.querySelector("#debug-danger"),
  density: document.querySelector("#debug-density"),
  oreBias: document.querySelector("#debug-ore-bias"),
  lifeBias: document.querySelector("#debug-life-bias"),
  asteroids: document.querySelector("#debug-asteroids"),
  hunters: document.querySelector("#debug-hunters"),
  lifeforms: document.querySelector("#debug-lifeforms"),
  activeLifeforms: document.querySelector("#debug-active-lifeforms"),
  pickups: document.querySelector("#debug-pickups"),
  eventCount: document.querySelector("#debug-event-count"),
  shotsFired: document.querySelector("#debug-shots-fired"),
  rocksDestroyed: document.querySelector("#debug-rocks-destroyed"),
  resourcesCollected: document.querySelector("#debug-resources-collected"),
  kills: document.querySelector("#debug-kills"),
  salesCredits: document.querySelector("#debug-sales-credits"),
  repairCredits: document.querySelector("#debug-repair-credits"),
  eventLog: document.querySelector("#event-log"),
};
const _hud = {
  credits: null,
  fuel: null,
  fuelFraction: null,
  ammo: null,
  tractorActive: null,
  shieldKey: null,
  cloakKey: null,
  hasLateralThrusters: null,
  towCableKey: null,
  mossHarvesterKey: null,
  mossSeederKey: null,
  hullPct: null,
  hullFraction: null,
  hullVin: null,
  hullReserveKey: null,
  minerArmed: null,
};
const state = createGameState();
const initialDevStart = getDevStart();
const isFreePlayStart = initialDevStart === "explorer" || initialDevStart === "panorama";

if (shouldResetSave() || initialDevStart || peekSavedDevStartId()) {
  clearSavedProfile();
}

const savedProfile = loadSavedProfile(state);
const audio = createGameAudio();
wireAudioUnlockGestures();
const processor = new Processor(processorCanvas, processUnit, { enableCompaction: true, getUnitFlags: getResourceUnitFlags });
const cargoHold = new Processor(cargoCanvas, handleCargoUnitClick, { isClickable: true, getUnitFlags: getCargoUnitFlags });
const game = new Game(canvas, state, updateHudDisplay, receiveCollectedResource, updateWorldDebugDisplay, updateHubDisplay, audio, updateLedgerDrivenSystems);
let activeHubServiceId = null;
const procurementManager = createHubProcurementOperation({ state });
const logisticsManager = createLogisticsManager({
  state, ships: game.npcShips, destinations: game.worldSites,
  // Delivering a procurement-backed run closes the purchase order that caused
  // it, so a hub's need is actually reduced rather than merely restocked.
  onProcurementShipped: (orderId, shipmentId) => procurementManager.markShipped(orderId, shipmentId),
  onProcurementDelivered: (orderId, settlement) => procurementManager.completeOrder(orderId, settlement),
  // A carrier turning freight away can put another ship into service; one with
  // nothing to carry lays one up. The world builds and drops the actual hull.
  commissionHauler: (spec) => game.commissionHauler(spec),
});
const towServiceManager = createTowServiceManager({ state, ships: game.npcShips, destinations: game.worldSites });

// Dev hook: the running game and state, reachable from the console for
// debugging and automated playtests. window.game is shadowed by the canvas
// element (DOM id), so this lives under a distinct name.
window.__asteroids = { game, state, processor, cargoHold, logistics: logisticsManager, towing: towServiceManager };
const contractManager = createContractManager({
  state,
  onChange: (contract) => {
    renderContract(contract);
    syncContractPanelVisibility();
    updateHudDisplay();
    renderObjectives(state);

    if (contract?.status === "fulfilled" && !fulfilledContractPanelPulls.has(contract.id)) {
      fulfilledContractPanelPulls.add(contract.id);
      window.setTimeout(() => pullContractToCenter(contract.id), 0);
    }
  },
});
const sprcManager = createSprcOperation({
  state,
  registerContractDefinition,
  onChange: () => {
    if (activeHubServiceId === SPRC.serviceId) {
      renderSprcOperationSummary();
    }
    if (contractManager.getCurrentContract()?.type === "resource-procurement") {
      renderContract();
    }
  },
});
window.__asteroids.sprc = sprcManager;
sprcManager.update();
const miningManager = createMiningOperation({ state, game, sprcOperation: sprcManager });
const flintMiningManager = createMiningOperation({ state, game, sprcOperation: sprcManager, seed: FLINT_MINING_SEED });
window.__asteroids.mining = miningManager;
window.__asteroids.miningCompetitor = flintMiningManager;
window.__asteroids.procurement = procurementManager;
const populationManager = createPopulationOperation({ state });
window.__asteroids.population = populationManager;
const farmManager = createFarmOperation({ state, now: Date.now() });
farmManager.assess();
window.__asteroids.farm = farmManager;
const journeyDirector = createJourneyDirector({
  state,
  game,
  emergencyTow: () => {
    game.emergencyTow();
    updateTowEstimateDisplay();
    updateHudDisplay();
  },
  payLoan: (contractId, amount) => {
    contractManager.payLoan(contractId, amount);
    updateHudDisplay();
  },
  offerContract: (contractId) => {
    contractManager.offerContract(contractId);
    pullContractToCenter(contractId);
  },
  onChange: () => {
    renderJourney();
    updateHudDisplay();
  },
  showComponent: setComponentAvailable,
  unlockHubService,
  requestAttention,
  updatePaperworkControls: updatePaperworkControlLabels,
  runInspection: (siteId) => {
    const site = game.worldSites.find((candidate) => candidate.id === siteId) ?? currentSiteState?.nearbySite ?? currentSiteState?.dockedSite ?? null;
    if (site) {
      game.reviewShipRegistryAtHub(site, {
        inspector: {
          type: "patrol",
          id: `${site.id}-patrol`,
          name: `${site.name} Patrol`,
        },
      });
      game.dismissPatrolIntercept(site.id);
    }
  },
  spawnPatrolIntercept: (siteId, reason) => game.spawnPatrolIntercept(siteId, reason),
  setViewportLayout: applyViewportLayout,
});
const commsDirector = createCommsDirector({ state, journeyDirector });
let bringPanelToFront = () => {};
let positionPanelById = () => {};
let movePaperPanelToDesk = () => {};
let movePaperPanelToDrawer = () => {};
let contractPulledFromDrawer = false;
let renderedLedgerVersion = -1;
let renderedLedgerEventsKey = "";
let renderedLedgerStatsKey = "";
let renderedLedgerPopulationKey = "";
let renderedLedgerFilterKey = "";
let activeLedgerFilter = "all";
let renderedWorldEventLogKey = "";
let lastAudioEventId = 0;
let journeyTypeTimers = [];
let _renderedMessageId = null;
let currentSiteState = null;
let activeDepositContractId = null;
// Render signature for the hub job board; see renderRookJobBoard. Declared
// here because dev-start boot code reaches that render during module eval.
let lastRookJobBoardSignature = null;
let isCargoSellModeActive = false;

ledgerStreamFilter?.addEventListener("change", () => {
  activeLedgerFilter = ledgerStreamFilter.value;
  renderedLedgerEventsKey = "";
  updateLedgerStreamDisplay();
});
let wasTowAvailable = false;
let saveTimer = null;
let lastHubAuthorityEventId = 0;
let lastRookAutoOfferEventId = 0;
let lastPermitGrantEventId = 0;
let lastTowChatterEventId = 0;
let lastDockingInspectionEventId = 0;
let lastLifeformTourEventId = 0;
let lastSprcChatterEventId = 0;
const pendingHubIdentityPresentations = new Map();
const fulfilledContractPanelPulls = new Set();
const COMPONENT_WARNING_RULES = [
  { panelId: "engine", cautionAt: 80, criticalAt: 35, getValue: () => state.components.engine.fuel },
  { panelId: "miner", cautionAt: 50, criticalAt: 20, getValue: () => state.components.miner.ammo },
  { panelId: "hull", cautionAt: 55, criticalAt: 30, getValue: () => state.components.hull.integrity },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function updateShipPowerDisplay() {
  const engine = state.components.engine;
  const isOutOfFuel = engine.installed && engine.fuel <= 0;

  const engineStage = engine.condition?.stage ?? "healthy";

  powerButton.textContent = engine.powered ? "Power Down" : "Power Ship";
  powerButton.setAttribute("aria-pressed", String(engine.powered));
  powerButton.disabled = !engine.installed || state.components.hull.integrity <= 0 || engine.powerLocked || (!engine.powered && isOutOfFuel);
  shipStatus.textContent =
    state.components.hull.integrity <= 0 ? "ship destroyed" :
    engine.powerLocked ? "power locked" :
    isOutOfFuel ? "out of fuel" :
    engineStage === "failed" ? "engine failed" :
    engineStage === "emergency" ? "engine faulting" :
    engineStage === "degraded" ? "engine strained" :
    engine.powered ? "ship online" : "ship offline";
}

powerButton.addEventListener("click", () => {
  game.setShipPowered(!state.components.engine.powered);
  updateShipPowerDisplay();
});

hullVin.addEventListener("click", () => {
  presentIdentityDocument("ship-vin", {
    shipVin: state.components.hull.vinPlateAttached ? state.components.hull.vin : null,
  });
});

licenseIdDisplay.addEventListener("click", () => {
  const licenseId = licenseIdDisplay.dataset.licenseId || null;
  const licenseRecord = licenseId ? (state.legal.pilotLicenses[licenseId] ?? null) : null;
  presentIdentityDocument("pilot-license", {
    pilotLicenseId: licenseId,
    pilotName: licenseRecord ? `${licenseRecord.firstName} ${licenseRecord.lastName}` : null,
    canonical: licenseRecord?.canonical ?? false,
  });
});

towButton.addEventListener("click", () => {
  if ((state.components.engine.fuel > 0 && state.components.hull.integrity > 0 && !game.isEngineFailed()) || currentSiteState?.dockedSite || game.isTowActive()) {
    return;
  }

  game.emergencyTow();
  updateTowEstimateDisplay();
  updateHudDisplay();
});

document.querySelectorAll("input[name='thrust-mode']").forEach((control) => {
  control.addEventListener("change", () => {
    state.components.engine.thrustMode = control.value;
  });
});

minerArmed.addEventListener("change", () => {
  state.components.miner.armed = minerArmed.checked;
});

tractorFieldButton.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  tractorFieldButton.setPointerCapture(event.pointerId);
  setTractorFieldActive(true);
});

tractorFieldButton.addEventListener("pointerup", (event) => {
  if (tractorFieldButton.hasPointerCapture(event.pointerId)) {
    tractorFieldButton.releasePointerCapture(event.pointerId);
  }

  setTractorFieldActive(false);
  tractorFieldButton.blur();
});

tractorFieldButton.addEventListener("click", (event) => event.preventDefault());
tractorFieldButton.addEventListener("pointercancel", () => setTractorFieldActive(false));
tractorFieldButton.addEventListener("lostpointercapture", () => setTractorFieldActive(false));

shieldButton.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  shieldButton.setPointerCapture(event.pointerId);
  setShieldActive(true);
});

shieldButton.addEventListener("pointerup", (event) => {
  if (shieldButton.hasPointerCapture(event.pointerId)) {
    shieldButton.releasePointerCapture(event.pointerId);
  }

  setShieldActive(false);
  shieldButton.blur();
});

shieldButton.addEventListener("click", (event) => event.preventDefault());
shieldButton.addEventListener("pointercancel", () => setShieldActive(false));
shieldButton.addEventListener("lostpointercapture", () => setShieldActive(false));

cloakButton.addEventListener("click", () => {
  game.setCloakActive(!state.components.cloak.isActive);
  updateHudDisplay();
});

towCableFireButton.addEventListener("click", () => {
  game.fireTowCable();
  updateHudDisplay();
});

towCableReleaseButton.addEventListener("click", () => {
  game.releaseTowCable();
  updateHudDisplay();
});

wireTowCableHoldButton(towCableReelButton, "reel");
wireTowCableHoldButton(towCablePayOutButton, "payout");

mossHarvesterDeployButton?.addEventListener("click", () => {
  game.deployMossHarvester();
  updateHudDisplay();
});

mossHarvesterRecallButton?.addEventListener("click", () => {
  game.recallMossHarvester();
  updateHudDisplay();
});

mossSeederFireButton?.addEventListener("click", () => {
  fireMossSeederFromCargo();
  updateHudDisplay();
});

scanButton.addEventListener("click", () => {
  game.cycleBeacon();
});

beaconBayButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const bayIndex = Number(button.dataset.beaconBay);
    game.deployBeaconFromBay(bayIndex);
    updateHudDisplay();
  });
});

scanTrigger?.addEventListener("click", () => {
  game.triggerResourceScan();
  updateHudDisplay();
});

journeyAcceptButton.addEventListener("click", () => {
  audio.unlock();
  journeyDirector.pressJourneyButton("confirm");
  updateHudDisplay();
});

journeyDeclineButton?.addEventListener("click", () => {
  audio.unlock();
  journeyDirector.pressJourneyButton("decline");
  updateHudDisplay();
});

dockToggleButton.addEventListener("click", () => {
  game.toggleDock();
});

contractAcceptButton.addEventListener("click", () => {
  const contract = contractManager.getCurrentContract();

  if (contract?.type === "resource-procurement" && contract.status === "offered") {
    sprcManager.acceptProcurement(contract.id);
  } else if (contract?.status === "fulfilled") {
    activeDepositContractId = null;
    contractManager.collectPayment(contract.id);
  } else if (canPayLoanContract(contract)) {
    const purposeRequired = Boolean(contract.terms?.fundingPurpose) && contract.considerations?.length;
    const purposeFulfilled = !purposeRequired || contract.flags?.purposeFulfilled;
    const amount = getRequestedContractPaymentAmount(contract);

    if (purposeFulfilled) {
      contractManager.payLoan(contract.id, amount);
    } else {
      journeyDirector.askConfirmation(
        contract.offerSource?.npcName ?? contract.issuer ?? "Finance",
        "Hold on — that loan was earmarked for the starter ship, and I don't see that purchase on file yet. Pay it off anyway?",
        {
          label: "Pay It Off",
          action: "payLoan",
          contractId: contract.id,
          amount,
          decline: { label: "Not Yet" },
        },
      );
    }
  } else if (canDepositToContract(contract)) {
    activeDepositContractId = activeDepositContractId === contract.id ? null : contract.id;
    renderContract();
  } else if (isCargoLoadable(contract)) {
    loadCargoManifest(contract);
  } else if (isCargoDeliverable(contract)) {
    deliverCargoManifest(contract);
  } else {
    contractManager.acceptContract();
  }

  updateHudDisplay();
});

contractPaymentMax.addEventListener("click", () => {
  const contract = contractManager.getCurrentContract();
  const payment = getMaximumContractPaymentAmount(contract);

  if (payment > 0) {
    contractPaymentAmount.value = String(payment);
  }
});

contractNextButton.addEventListener("click", () => {
  activeDepositContractId = null;
  contractManager.showNextContract(currentSiteState?.dockedSite?.id ?? null);
  updateHudDisplay();
});

contractFileStack?.addEventListener("click", (event) => {
  const file = event.target.closest("[data-paper-file-kind]");

  if (!file) {
    return;
  }

  activeDepositContractId = null;
  if (file.dataset.paperFileKind === "contract") {
    pullContractToCenter(file.dataset.paperFileId);
  } else {
    pullDocumentToCenter(file.dataset.paperFileId);
  }
  updateHudDisplay();
});

finleySellToggle.addEventListener("click", () => {
  isCargoSellModeActive = !isCargoSellModeActive;
  updateCargoTargetDisplay();
  renderFinleyPanel();
});

finleyRepairButton.addEventListener("click", () => {
  toggleSupplyPump("repair");
});

finleyFuelButton.addEventListener("click", () => {
  toggleSupplyPump("fuel");
});

finleyChargesButton.addEventListener("click", () => {
  toggleSupplyPump("charges");
});

finleyScanButton.addEventListener("click", () => {
  toggleSupplyPump("scan");
});

hubServiceMenu.addEventListener("click", (event) => {
  const ecologyButton = event.target.closest("[data-ecology-beacon-action]");

  if (ecologyButton) {
    addEcologyBeaconsToNavigation();
    return;
  }

  const beaconButton = event.target.closest("[data-hub-beacon-id]");

  if (beaconButton) {
    addHubBeaconToNavigation(beaconButton.dataset.hubBeaconId);
    return;
  }

  const button = event.target.closest("[data-service-id]");

  if (!button) {
    return;
  }

  openHubService(button.dataset.serviceId);
});

componentCloseButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    closeDriveThroughPanel(button.dataset.closePanel);
  });
});

drawerToggle?.addEventListener("click", () => {
  const isOpen = paperworkDrawer.classList.toggle("is-open");
  drawerToggle.setAttribute("aria-expanded", String(isOpen));
});

renderProcessorOutputs();
  game.placeShipNearSite(chapterOneRoute.startSite.id);
restoreSavedWorld({ save: savedProfile, game, cargoHold });
sprcManager.update();
logisticsManager.update();
towServiceManager.update();
window.setInterval(() => sprcManager.update(), 1000);
window.setInterval(() => populationManager.update(), 1000);
window.setInterval(() => procurementManager.update(), 1000);
window.setInterval(() => logisticsManager.update(), 1000);
window.setInterval(() => {
  miningManager.update();
  flintMiningManager.update();
}, 1000);
window.setInterval(() => towServiceManager.update(), 1000);
registerStarterDeliveryShipRecords(state);
clearOldPanelLayouts();
setInitialPaperworkLocations();
makePanelsDraggable();
setupPaperworkControls();
renderResourceGuide();
wirePanelControlSounds();
if (isFreePlayStart) {
  journeyDirector.startFreeMode();
} else {
  journeyDirector.start();
}
const PANORAMA_LAYOUT_VERSION = "centered-panorama-v3";
const PANORAMA_PANEL_OVERRIDES = {
  engine:           { x: 520, y: 100, z: 70 },
  hull:             { x: 760, y: 100, z: 50 },
  docking:          { x: 760, y: 330, z: 100 },
  "beacon-locator": { x: 1000, y: 330, z: 90 },
  "beacon-bay":     { x: 1000, y: 460, z: 89 },
  scanner:          { x: 1000, y: 560, z: 88 },
  miner:            { x: 520, y: 330, z: 60 },
  collector:        { x: 760, y: 560, z: 60 },
  processor:        { x: 520, y: 500, z: 48 },
  cargo:            { x: 500, y: 180, z: 46 },
  license:          { x: 1000, y: 100, z: 95 },
  contract:         { x: 1240, y: 180, z: 95 },
};
// Supply-window cleanup can run during dev-start setup through the hub display.
// Keep this initialized before any start mode calls into that display path.
let activePump = null; // { type, intervalId }

if (state.ui.viewportLayout === "fullscreen-background") {
  applyViewportLayout("fullscreen-background");
}
applyDevStart(initialDevStart);
revealInstalledComponents();
renderContract();
updateShipPowerDisplay();
updateHudDisplay();
initLicenseApplication();

game.start();
processor.start();
cargoHold.start();

new ResizeObserver(() => {
  if (!document.body.classList.contains("is-viewport-fullscreen")) return;
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
    canvas.width = w;
    canvas.height = h;
  }
}).observe(canvas);
window.addEventListener("beforeunload", () => saveNow());

function updateHudDisplay() {
  updateAttentionCallouts();
  renderProcessorOutputs();
  renderShipOffers();
  const activeService = currentSiteState?.dockedSite && activeHubServiceId ? getHubService(currentSiteState.dockedSite.id, activeHubServiceId) : null;
  if (activeService?.serviceType === "components") {
    renderComponentShop(activeService);
  }
  updateShipPowerDisplay();
  updateCargoTargetDisplay();

  const currentCredits = getCredits(state);
  const creditsFloor = Math.floor(currentCredits);
  if (creditsFloor !== _hud.credits) {
    _hud.credits = creditsFloor;
    creditCount.textContent = String(creditsFloor);
    licenseCreditsDisplay.textContent = `${creditsFloor} cr`;
    merchantCredits.textContent = `${creditsFloor} cr`;
  }

  const currentFuel = state.components.engine.fuel;
  const fuelFloor = Math.floor(currentFuel);
  const fuelFraction = getMeterFraction(currentFuel, state.components.engine.maxFuel);
  const isStranded = state.components.engine.installed && !currentSiteState?.dockedSite &&
    !game.isTowActive() &&
    !state.ledger.getSignal("actor.controlLocked") &&
    (currentFuel <= 0 || state.components.hull.integrity <= 0 || game.isEngineFailed());

  if (fuelFloor !== _hud.fuel) {
    _hud.fuel = fuelFloor;
    fuelCount.textContent = String(fuelFloor);
  }
  if (fuelFraction !== _hud.fuelFraction) {
    _hud.fuelFraction = fuelFraction;
    fuelFill.style.transform = `scaleX(${fuelFraction})`;
  }

  setTowAvailable(isStranded);
  updateTowEstimateDisplay();

  const ammoFloor = Math.floor(state.components.miner.ammo);
  if (ammoFloor !== _hud.ammo) {
    _hud.ammo = ammoFloor;
    ammoCount.textContent = String(ammoFloor);
  }

  updateBeaconLocatorDisplay();
  updateBeaconBayDisplay();

  const tractorActive = state.components.collector.isActive;
  if (tractorActive !== _hud.tractorActive) {
    _hud.tractorActive = tractorActive;
    tractorFieldStatus.textContent = tractorActive ? "Pulling" : "Idle";
    tractorFieldButton.setAttribute("aria-pressed", String(tractorActive));
  }

  const shieldActive = game.isShieldActive();
  const shieldKey = `${shieldActive}|${Math.floor(state.components.miner.ammo)}`;
  if (shieldKey !== _hud.shieldKey) {
    _hud.shieldKey = shieldKey;
    shieldCharges.textContent = String(Math.floor(state.components.miner.ammo));
    shieldStatus.textContent = shieldActive ? "Holding" : "Idle";
    shieldButton.setAttribute("aria-pressed", String(shieldActive));
  }

  const cloakActive = state.components.cloak.isActive;
  const cloakKey = `${cloakActive}|${state.components.engine.powered}|${state.components.engine.fuel > 0}`;
  if (cloakKey !== _hud.cloakKey) {
    _hud.cloakKey = cloakKey;
    cloakStatus.textContent = cloakActive ? "Masked" : "Offline";
    cloakButton.textContent = cloakActive ? "Disengage Cloak" : "Engage Cloak";
    cloakButton.setAttribute("aria-pressed", String(cloakActive));
    cloakButton.disabled = !state.components.engine.powered || state.components.engine.fuel <= 0;
  }

  const hasLateralThrusters = state.components.engine.upgrades?.includes("lateral-thrusters-mk1") ?? false;
  if (hasLateralThrusters !== _hud.hasLateralThrusters) {
    _hud.hasLateralThrusters = hasLateralThrusters;
    engineStrafeHint.hidden = !hasLateralThrusters;
  }

  const hasForwardBoost = state.components.engine.upgrades?.includes("forward-boost-mk1") ?? false;
  if (hasForwardBoost !== _hud.hasForwardBoost) {
    _hud.hasForwardBoost = hasForwardBoost;
    engineBoostHint.hidden = !hasForwardBoost;
  }

  const towCableDisplay = game.getTowCableDisplay();
  const towCableKey = `${towCableDisplay.status}|${towCableDisplay.lineLength}|${towCableDisplay.maxLength}|${towCableDisplay.control}`;
  if (towCableKey !== _hud.towCableKey) {
    _hud.towCableKey = towCableKey;
    towCableStatus.textContent = towCableDisplay.status;
    towCableLength.textContent = `${towCableDisplay.lineLength} / ${towCableDisplay.maxLength}`;
    towCableReelButton.setAttribute("aria-pressed", String(towCableDisplay.control === "reel"));
    towCablePayOutButton.setAttribute("aria-pressed", String(towCableDisplay.control === "payout"));
  }

  const mossHarvesterDisplay = game.getMossHarvesterDisplay();
  const mossHarvesterKey = `${mossHarvesterDisplay.status}|${mossHarvesterDisplay.food}|${mossHarvesterDisplay.deployed}`;
  if (mossHarvesterKey !== _hud.mossHarvesterKey) {
    _hud.mossHarvesterKey = mossHarvesterKey;
    mossHarvesterStatus.textContent = mossHarvesterDisplay.status;
    mossHarvesterFood.textContent = String(mossHarvesterDisplay.food);
    mossHarvesterDeployButton.disabled = mossHarvesterDisplay.deployed;
    mossHarvesterRecallButton.disabled = !mossHarvesterDisplay.deployed;
  }

  const mossSeederCargoCount = cargoHold.getUnitCounts()[ROCKMOSS_CRAWLER_RESOURCE] ?? 0;
  const mossSeederDisplay = game.getMossSeederDisplay(mossSeederCargoCount);
  const mossSeederKey = `${mossSeederDisplay.status}|${mossSeederDisplay.crawlerCargoCount}|${mossSeederDisplay.canFire}`;
  if (mossSeederKey !== _hud.mossSeederKey) {
    _hud.mossSeederKey = mossSeederKey;
    mossSeederCount.textContent = String(mossSeederDisplay.crawlerCargoCount);
    mossSeederStatus.textContent = mossSeederDisplay.status;
    mossSeederFireButton.disabled = !mossSeederDisplay.canFire;
  }

  const hullPct = Math.ceil((state.components.hull.integrity / state.components.hull.maxIntegrity) * 100);
  const hullFraction = getMeterFraction(state.components.hull.integrity, state.components.hull.maxIntegrity);
  if (hullPct !== _hud.hullPct) {
    _hud.hullPct = hullPct;
    hullCount.textContent = `${hullPct}%`;
  }
  if (hullFraction !== _hud.hullFraction) {
    _hud.hullFraction = hullFraction;
    hullFill.style.transform = `scaleX(${hullFraction})`;
  }

  const hull = state.components.hull;
  const reserveValue = Math.floor(hull.repairReserve ?? 0);
  const maxReserve = hull.maxRepairReserve ?? 0;
  const isPatching = game.isHullRepairing?.() ?? false;
  const reserveKey = `${reserveValue}/${maxReserve}|${isPatching}`;
  if (reserveKey !== _hud.hullReserveKey) {
    _hud.hullReserveKey = reserveKey;
    if (hullReserveCount) {
      hullReserveCount.textContent = `${reserveValue} / ${maxReserve}`;
    }
    if (hullReserveFill) {
      hullReserveFill.style.transform = `scaleX(${getMeterFraction(reserveValue, maxReserve)})`;
    }
    if (hullRepairStatus) {
      hullRepairStatus.hidden = !isPatching;
    }
  }

  const vinText = state.components.hull.vinPlateAttached ? state.components.hull.vin : "UNVERIFIED";
  if (vinText !== _hud.hullVin) {
    _hud.hullVin = vinText;
    hullVin.textContent = vinText;
  }

  if (state.components.miner.armed !== _hud.minerArmed) {
    _hud.minerArmed = state.components.miner.armed;
    minerArmed.checked = state.components.miner.armed;
  }

  updateWarningPanels();
  scheduleSave();
}

// Refresh both beacon panels together — the locator (nav memory) and the bay
// (deployables) — matching the per-frame HUD path. Called after any change to
// stored or known beacons.
function updateBeaconDisplay() {
  updateBeaconLocatorDisplay();
  updateBeaconBayDisplay();
}

function updateBeaconLocatorDisplay() {
  const locator = state.components.beaconLocator;
  const scanner = state.components.scanner;
  const activeBeacon = game.getBeaconTarget(locator.activeBeaconId);

  if (beaconTracking) {
    beaconTracking.textContent = activeBeacon?.name ?? "None";
  }
  if (scanButton) {
    scanButton.disabled = !locator.installed || game.getBeaconTargets().length === 0;
  }
  if (scanergyCount) {
    scanergyCount.textContent = String(Math.floor(scanner.scanergy));
  }
  if (scanTrigger) {
    scanTrigger.disabled = !scanner.installed || scanner.scanergy < 50;
  }

  if (!beaconDirectionArrow || !activeBeacon) {
    return;
  }

  const angle = Math.atan2(activeBeacon.position.y - game.ship.position.y, activeBeacon.position.x - game.ship.position.x);
  beaconDirectionArrow.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
}

function updateBeaconBayDisplay() {
  const bayState = state.components.beaconBay;

  beaconBayButtons.forEach((button) => {
    const bayIndex = Number(button.dataset.beaconBay);
    const bay = bayState?.bays?.[bayIndex];

    if (!bay) {
      button.disabled = true;
      button.textContent = "Empty";
      return;
    }

    button.disabled = !bayState.installed || bay.status !== "stored";
    button.textContent = bay.status === "stored" ? "Deploy" : "Empty";
  });

  if (!beaconRecoveryMeter || !beaconRecoveryFill || !beaconRecoveryLabel) {
    return;
  }

  const recovery = bayState?.recovery;
  if (!recovery) {
    beaconRecoveryMeter.hidden = true;
    beaconRecoveryFill.style.transform = "scaleX(0)";
    return;
  }

  const bay = bayState.bays?.[recovery.bayIndex];
  const progress = Math.min(1, Math.max(0, recovery.progress ?? 0));
  beaconRecoveryMeter.hidden = false;
  beaconRecoveryLabel.textContent = `Recovering ${bay?.label ?? "beacon"}`;
  beaconRecoveryFill.style.transform = `scaleX(${progress})`;
}

function setTowAvailable(isAvailable) {
  setComponentAvailable("tow", false);
  const becameAvailable = isAvailable && !wasTowAvailable;

  // sayAsNpc causes a Journey render, which calls updateHudDisplay again.
  // Update this guard first so the tow prompt cannot recurse.
  if (!isAvailable) {
    commsDirector.clearPendingAcknowledgement("emergencyTow");
    wasTowAvailable = false;
    return;
  }

  if (becameAvailable) {
    const estimate = game.getEmergencyTowEstimate();
    const driverName = TOW_DRIVER_NAMES[Math.abs(estimate.siteId.length + estimate.cost) % TOW_DRIVER_NAMES.length];

    wasTowAvailable = true;
    const prompted = commsDirector.say({
      source: COMMS_SOURCES.tow,
      speaker: driverName,
      text:
        `Tow request picked up. I can get a runner out to you and haul you back to ${estimate.siteName} for ${estimate.cost} credits. We'll move slow, clear the worst junk in the lane, and settle you on the tether. Accept the tow if you want me rolling.`,
      acknowledgement: {
        label: `Accept Tow ${estimate.cost} cr`,
        action: "emergencyTow",
        decline: { label: "No, I'll manage" },
      },
    });

    wasTowAvailable = prompted;
  }
}

function updateTowEstimateDisplay() {
  const estimate = game.getEmergencyTowEstimate();
  towCostDisplay.textContent = `${estimate.cost} cr`;
}

function getMeterPercent(value, maxValue) {
  if (maxValue <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / maxValue) * 100));
}

function getMeterFraction(value, maxValue) {
  if (maxValue <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, value / maxValue));
}

function scheduleSave() {
  if (saveTimer) {
    return;
  }

  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 800);
}

function saveNow() {
  saveProfile({ state, game, cargoHold });
}

function revealInstalledComponents() {
  if (!savedProfile) {
    return;
  }

  if (!shouldRestoreViewport(savedProfile)) {
    return;
  }

  setComponentAvailable("viewport", true);

  Object.entries(COMPONENT_STATE_BY_PANEL_ID).forEach(([panelId, componentStateId]) => {
    if (state.components[componentStateId]?.installed) {
      setComponentAvailable(panelId, true);
    }
  });

  Object.entries(state.ui.panels).forEach(([panelId, panelState]) => {
    if (panelState?.available) {
      setComponentAvailable(panelId, true);
      // If a ship-system panel was available at save time, ensure the component
      // state agrees — panel visibility and installed state can drift apart when
      // a devStart session reveals panels without running the purchase flow.
      const componentStateId = COMPONENT_STATE_BY_PANEL_ID[panelId];
      if (componentStateId && state.components[componentStateId]) {
        state.components[componentStateId].installed = true;
      }
    }
  });
}

function shouldRestoreViewport(save) {
  const journey = save?.journey;
  const missionId = journey?.mission?.id;
  const currentStepId = journey?.currentStepId;

  if (!journey?.mission || journey.mission.status === "offered") {
    return false;
  }

  if (missionId !== "chapter-1-interview") {
    return true;
  }

  return Boolean(currentStepId && !["show-hull", "drag-panels", "file-contract"].includes(currentStepId));
}

function applyDevStart(devStartId) {
  if (!devStartId) {
    return;
  }

  state._devStartId = devStartId;

  if (devStartId === "red-work") {
    setupDevRedWorkStart();
    journeyDirector.startMission("chapter-1-red-work");
    updateHudDisplay();
  }

  if (devStartId === "explorer") {
    setupExplorerStart();
    spawnExplorerIncursionPortal();
    dismissLicenseApplication();
    updateHudDisplay();
  }

  if (devStartId === "panorama") {
    setupExplorerStart();
    spawnExplorerIncursionPortal();
    dismissLicenseApplication();
    applyViewportLayout("fullscreen-background");
    updateHudDisplay();
  }
}

function applyViewportLayout(layout) {
  state.ui.viewportLayout = layout;
  document.body.classList.toggle("is-viewport-fullscreen", layout === "fullscreen-background");
  updateZoomLabel();
  updateAlphaLabel();

  if (layout === "fullscreen-background") {
    const savedLayout = loadPanelLayout();
    Object.entries(PANORAMA_PANEL_OVERRIDES).forEach(([panelId, pos]) => {
      const saved = getSavedPanelLayout(savedLayout, panelId, "panorama");
      const isCurrentPanoramaLayout = saved?.layoutVersion === PANORAMA_LAYOUT_VERSION;
      const position = isCurrentPanoramaLayout ? saved : pos;
      const panel = document.querySelector(`[data-panel-id="${panelId}"]`);

      if (panel && Number.isFinite(position.z)) {
        panel.style.zIndex = String(position.z);
      }

      positionPanelById(panelId, position);

      if (!isCurrentPanoramaLayout && panel) {
        savePanelLayout(panel, position, { layoutVersion: PANORAMA_LAYOUT_VERSION });
      }
    });
  }
}

function updateZoomLabel() {
  if (!zoomLabel) return;
  const zoom = state.ui?.viewportZoom ?? 1.0;
  zoomLabel.textContent = Math.round(zoom * 100) + "%";
}

function adjustZoom(delta) {
  const current = state.ui?.viewportZoom ?? 1.0;
  const next = Math.min(2, Math.max(0.25, Math.round((current + delta) * 20) / 20));
  state.ui.viewportZoom = next;
  updateZoomLabel();
}

zoomInButton?.addEventListener("click", () => adjustZoom(0.05));
zoomOutButton?.addEventListener("click", () => adjustZoom(-0.05));

function updateAlphaLabel() {
  if (alphaLabel) alphaLabel.textContent = Math.round(panelAlpha * 100) + "%";
  document.body.style.setProperty("--panel-alpha", panelAlpha);
}

function adjustAlpha(delta) {
  panelAlpha = Math.min(1, Math.max(0, Math.round((panelAlpha + delta) * 20) / 20));
  updateAlphaLabel();
}

alphaUpButton?.addEventListener("click", () => adjustAlpha(0.05));
alphaDownButton?.addEventListener("click", () => adjustAlpha(-0.05));
updateAlphaLabel();

const mapAlphaUp = document.querySelector("#map-alpha-up");
const mapAlphaDown = document.querySelector("#map-alpha-down");
const mapAlphaLabel = document.querySelector("#map-alpha-label");
const mapGlowUp = document.querySelector("#map-glow-up");
const mapGlowDown = document.querySelector("#map-glow-down");
const mapGlowLabel = document.querySelector("#map-glow-label");

function updateMapAlphaLabel() {
  if (mapAlphaLabel) mapAlphaLabel.textContent = Math.round((state.ui?.mapAlpha ?? 0.40) * 100) + "%";
}
function adjustMapAlpha(delta) {
  state.ui.mapAlpha = Math.min(1, Math.max(0, Math.round(((state.ui?.mapAlpha ?? 0.40) + delta) * 20) / 20));
  updateMapAlphaLabel();
}
mapAlphaUp?.addEventListener("click", () => adjustMapAlpha(0.05));
mapAlphaDown?.addEventListener("click", () => adjustMapAlpha(-0.05));
updateMapAlphaLabel();

function updateMapGlowLabel() {
  if (mapGlowLabel) mapGlowLabel.textContent = Math.round((state.ui?.mapGlow ?? 0.20) * 100) + "%";
}
function adjustMapGlow(delta) {
  state.ui.mapGlow = Math.min(1, Math.max(0, Math.round(((state.ui?.mapGlow ?? 0.20) + delta) * 20) / 20));
  updateMapGlowLabel();
}
mapGlowUp?.addEventListener("click", () => adjustMapGlow(0.05));
mapGlowDown?.addEventListener("click", () => adjustMapGlow(-0.05));
updateMapGlowLabel();

function setupExplorerStart() {
  // Slightly better ship than the yard skiff — more hull, faster, bigger tank.
  // Not a story ship; just comfortable for open exploration.
  Object.assign(state.components.engine, {
    installed: true,
    powered: false,
    fuel: 2000,
    maxFuel: 2000,
    thrustPower: 160,
    maxSpeed: 185,
    thrustVisual: {
      color: "#9ee8ff",
      length: 18,
      width: 3.5,
    },
  });
  Object.assign(state.components.hull, {
    installed: true,
    integrity: 140,
    maxIntegrity: 140,
  });
  Object.assign(state.components.beaconLocator, {
    installed: true,
    beaconMemoryIds: [
      "yard-exchange",
      "scrap-porch",
      "the-ledge",
      "ore-station-one",
      "coldwater-depot",
      "deep-research",
    ],
    ecologyBeacons: [],
    activeBeaconId: "yard-exchange",
  });
  Object.assign(state.components.scanner, {
    installed: true,
    scanergy: 2500,
    targets: ["resources"],
  });
  Object.assign(state.components.miner, {
    installed: true,
    armed: false,
    ammo: 2000,
  });
  Object.assign(state.components.processor, { installed: true });
  state.components.cargoHold.installed = true;
  state.components.docking.installed = true;
  state.components.collector.installed = true;
  state.components.towCable.installed = true;
  state.components.beaconBay.installed = true;
  state.components.mossSeeder.installed = true;

  state.ship.frameId = "explorer";
  state.ship.shape = "explorer";
  state.ship.name = "Explorer";

  issuePilotLicense(state, {
    firstName: "Explorer",
    lastName: "One",
    licenseId: "RTC-EXPLORER-ONE",
    status: "provisional",
    canonical: true,
  });

  // Unlock Rook contracts at Yard Exchange so they can take runs freely.
  state.hubServices.unlocked[chapterOneRoute.destinationSite.id] = Array.from(
    new Set([
      ...(state.hubServices.unlocked[chapterOneRoute.destinationSite.id] ?? []),
      yardExchangeServices.rook,
      yardExchangeServices.finance,
      yardExchangeServices.supply,
      yardExchangeServices.modworks,
    ]),
  );
  state.hubServices.skipMissionFirstContracts[yardExchangeServices.finance] = true;
  state.hubServices.flags.yardCoreSeenDocked = true;
  // Explorer begins after the authored Rook ladder, so its first Rook visit
  // is the ongoing three-choice board rather than another tutorial file.
  const rookService = getHubService(chapterOneRoute.destinationSite.id, yardExchangeServices.rook);
  (rookService?.contractIds ?? []).forEach((contractId) => {
    state.contracts.records[contractId] ??= {
      id: contractId,
      status: "paid",
      runCount: 1,
      paidAt: Date.now(),
    };
  });
  state.hubServices.jobBoards = {};

  // Free play begins close enough to dock, but already tethered starts make
  // the ship inherit the placement velocity and immediately break the line.
  // Let the player choose when to dock with Rook instead.
  game.placeShipNearSite(chapterOneRoute.destinationSite.id, { x: 0, y: -110 });
  game.ship.velocity.x = 0;
  game.ship.velocity.y = 0;
  game.setDockedSite(null);

  depositCredits(state, 1000);

  setComponentAvailable("viewport", true);
  setComponentAvailable("engine", true);
  setComponentAvailable("hull", true);
  setComponentAvailable("beacon-locator", true);
  setComponentAvailable("beacon-bay", true);
  setComponentAvailable("scanner", true);
  setComponentAvailable("miner", true);
  setComponentAvailable("cargo", true);
  setComponentAvailable("docking", true);
  setComponentAvailable("contract", true);
  setComponentAvailable("processor", true);
  setComponentAvailable("collector", true);
  setComponentAvailable("tow-cable", true);
  setComponentAvailable("moss-seeder", true);
  setComponentAvailable("license", true);
}

function spawnExplorerIncursionPortal() {
  if (state._explorerIncursionSeeded) {
    return;
  }

  state._explorerIncursionSeeded = true;
  game.spawnIncursionPortal({
    x: game.ship.position.x + 1250,
    y: game.ship.position.y - 520,
  });
}

function setupDevRedWorkStart() {
  game.placeShipNearSite(chapterOneRoute.destinationSite.id, { x: 190, y: -70 });
  depositCredits(state, Math.max(0, -getCredits(state)));
  Object.assign(state.components.engine, {
    installed: true,
    powered: false,
    fuel: state.components.engine.maxFuel,
  });
  Object.assign(state.components.hull, {
    installed: true,
    integrity: state.components.hull.maxIntegrity,
  });
  Object.assign(state.components.beaconLocator, {
    installed: true,
    beaconMemoryIds: ["yard-exchange", "scrap-porch"],
    activeBeaconId: "yard-exchange",
  });
  Object.assign(state.components.scanner, {
    installed: false,
    scanergy: 0,
    targets: ["resources"],
  });
  Object.assign(state.components.miner, {
    installed: true,
    armed: false,
    ammo: Math.max(state.components.miner.ammo, 150),
  });
  state.components.cargoHold.installed = true;
  state.components.docking.installed = true;
  state.hubServices.unlocked[chapterOneRoute.destinationSite.id] = Array.from(
    new Set([...(state.hubServices.unlocked[chapterOneRoute.destinationSite.id] ?? []), yardExchangeServices.rook, yardExchangeServices.supply]),
  );
  state.hubServices.flags.yardCoreSeenDocked = true;
  game.setDockedSite(game.worldSites.find((site) => site.id === chapterOneRoute.destinationSite.id) ?? null);
  state.ship.frameId = "yard-skiff-miner";
  state.ship.name = "Rook Yard Skiff";
  setComponentAvailable("viewport", true);
  setComponentAvailable("engine", true);
  setComponentAvailable("hull", true);
  setComponentAvailable("beacon-locator", true);
  setComponentAvailable("miner", true);
  setComponentAvailable("cargo", true);
  setComponentAvailable("docking", true);
  setComponentAvailable("contract", true);
}

function updateHubDisplay(siteState) {
  currentSiteState = siteState;

  if (!canDepositToContract(contractManager.getCurrentContract())) {
    activeDepositContractId = null;
  }

  if (siteState.dockedSite?.id === chapterOneRoute.destinationSite.id && areYardExchangeStoryServicesUnlocked()) {
    state.hubServices.flags.yardCoreSeenDocked = true;
  }

  if (!siteState.dockedSite) {
    isCargoSellModeActive = false;
    stopSupplyPump();
    markYardExchangeReturnOpportunity();
  }

  maybeUnlockMurmur(siteState.dockedSite);
  renderContract();
  renderFinleyPanel(siteState);
  updateDockingDisplay(siteState);
  updateHubServiceDisplay(siteState);
}

function markYardExchangeReturnOpportunity() {
  if (!state.hubServices.flags.yardCoreSeenDocked || !areYardExchangeStoryServicesUnlocked()) {
    return;
  }

  state.hubServices.flags.leftYardAfterCoreUnlocked = true;
}

function maybeUnlockMurmur(dockedSite) {
  if (
    dockedSite?.id !== chapterOneRoute.destinationSite.id ||
    isHubServiceUnlocked(chapterOneRoute.destinationSite.id, { id: MURMUR_SERVICE_ID }) ||
    !state.hubServices.flags.leftYardAfterCoreUnlocked ||
    !areYardExchangeStoryServicesUnlocked()
  ) {
    return;
  }

  unlockHubService(chapterOneRoute.destinationSite.id, MURMUR_SERVICE_ID);
  commsDirector.say({
    source: COMMS_SOURCES.worldNpc,
    speaker: "Murmur",
    text:
      "Psst. Captain. You have met the desk people, now meet the wall people. I keep the board of things that have not happened yet. Back corridor. Click my name if you want to see the shape of the future.",
  });
}

function areYardExchangeStoryServicesUnlocked() {
  return YARD_EXCHANGE_CORE_SERVICES.every((serviceId) => isHubServiceUnlocked(chapterOneRoute.destinationSite.id, { id: serviceId }));
}


function updateDockingDisplay(siteState) {
  const site = siteState.dockedSite ?? siteState.nearbySite;
  const shipSpeed = Math.hypot(game.ship.velocity.x, game.ship.velocity.y);
  const isDocked = Boolean(site && siteState.dockedSite?.id === site.id);
  const isCaution = Boolean(site && isDocked && shipSpeed > 12);

  if (!state.components.docking.installed || !site) {
    dockingTarget.textContent = "No target";
    dockingDetail.textContent = "No dock target";
    dockToggleButton.textContent = "Dock";
    dockToggleButton.disabled = true;
    hullDockingLock.classList.remove("is-docking-active", "is-docking-caution");
    return;
  }

  dockingTarget.textContent = site.name;
  dockingDetail.textContent = isDocked ? "Docked" : "Press E to dock";
  dockToggleButton.textContent = isDocked ? "Undock" : "Dock";
  dockToggleButton.disabled = false;
  hullDockingLock.classList.toggle("is-docking-active", isDocked);
  hullDockingLock.classList.toggle("is-docking-caution", isCaution);
}

function updateHubServiceDisplay(siteState) {
  const site = siteState.dockedSite?.type === "hub" ? siteState.dockedSite : null;
  const wasHidden = isPanelHidden(hubPanel);
  const wasLocked = hubPanel.classList.contains("is-component-locked");

  setPanelHidden(hubPanel, !site);
  hubPanel.classList.toggle("is-component-locked", !site);
  hubPanel.setAttribute("aria-hidden", String(!site));

  if (!site) {
    activeHubServiceId = null;
    closeDriveThroughWindows();
    hubName.textContent = "Hub";
    hubStatus.textContent = "service window";
    hubDetail.textContent = "Dock to access services";
    renderHubServiceMenu(null);
    renderRookJobBoard(null);
    return;
  }

  if (wasHidden || wasLocked) {
    positionPanelById("hub");
    bringPanelToFront(hubPanel);
    playPanelReveal(hubPanel);
  }

  const activeService = activeHubServiceId ? getHubService(site.id, activeHubServiceId) : null;

  hubName.textContent = site.name;
  hubStatus.textContent = activeService?.organization ?? "service menu";
  if (activeService?.id === SPRC.serviceId) {
    renderSprcOperationSummary();
  } else if (activeService?.id === FARM_INSPECTION_SERVICE_ID) {
    renderFarmInstitutionSummary();
  } else {
    hubDetail.textContent = activeService ? `${activeService.npcName}: ${getHubServicePrompt(activeService)}` : "Choose a service window.";
  }
  renderHubServiceMenu(site);
  renderRookJobBoard(site);
}

function renderSprcOperationSummary() {
  const { sprc, openRepair, missing } = sprcManager.getSnapshot();
  const hauler = openRepair ? sprc.haulers[openRepair.subjectHaulerId] : null;
  const produced = sprc.inventories.produced;
  const raw = sprc.inventories.raw;
  const repairText = openRepair
    ? `${hauler?.shipName ?? openRepair.subjectShipVin} is waiting in Berth Two. Reserved stock covers ${openRepair.reserved.produced["hull-plate"] ?? 0} hull plate and ${openRepair.reserved.produced["machine-part"] ?? 0} machine part; still missing ${missing.items["hull-plate"] ?? 0} plate and ${missing.items["machine-part"] ?? 0} part.`
    : "Berth Two is available.";
  const plan = sprc.operatingPlan;
  const project = sprc.projects?.["sprc-second-cradle"];
  const availableCash = Math.max(0, sprc.account.balance - sprc.account.committed);
  hubDetail.textContent = `Sal: ${repairText} Operating plan: keep ${plan.inventoryTargets.structuralFeedstockEquivalents} feedstock equivalents, ${plan.inventoryTargets["hull-plate"]} plates, and ${plan.inventoryTargets["machine-part"]} parts on hand. Current stock: ${produced["hull-plate"] ?? 0} plates, ${produced["machine-part"] ?? 0} parts, ${(raw["iron-nickel"] ?? 0) + (raw.aluminum ?? 0) * 2} feedstock equivalents. Cash: ${availableCash} available, ${sprc.account.committed} committed, ${sprc.account.protectedReserve} protected. Next project: ${project.name} (${project.status}).`;
}

function renderFarmInstitutionSummary() {
  const { institution, controller, policy } = farmManager.assess();
  const water = institution.inventories.inputs.water ?? 0;
  const target = institution.policies.inventoryTargets.water ?? 0;
  const need = Object.values(institution.needs).find((entry) => entry.status === "open") ?? null;
  const response = need ? Object.values(institution.responses).find((entry) => entry.needIds?.includes(need.id) && ["active", "blocked"].includes(entry.status)) : null;
  const order = response ? Object.values(institution.procurementOrders).find((entry) => entry.responseId === response.id && entry.status === "offered") : null;
  const recipe = INSTITUTION_ARCHETYPES[institution.archetypeId]?.recipes?.[0];
  const recent = institution.history.slice(-3).map((entry) => entry.detail).join(" / ");
  const spendable = Math.max(0, institution.accounts.operating.balance - institution.accounts.operating.committed - policy.protectedCash);
  hubDetail.textContent = `${controller.name}, operator of ${institution.name}. Water: ${water}/${target}; seed: ${institution.inventories.inputs.seed ?? 0}/${institution.policies.inventoryTargets.seed ?? 0}. Cash: ${spendable} spendable, ${institution.accounts.operating.committed} committed, ${policy.protectedCash} protected. Current need: ${need ? `${need.shortage} ${need.subject.resourceId}` : "none"}. Internal response: ${response ? `${response.capabilityId} (${response.status})` : "none"}${order ? `; internal order ${order.id} requests ${order.quantity} ${order.resourceId} for up to ${order.maximumPayment} credits` : ""}. This order has not been posted to the pilot job board and cannot be accepted here. Planned cycle: ${recipe ? `${recipe.id}, using ${recipe.inputs.seed} seed and ${recipe.inputs.water} water to produce ${recipe.outputs.crop} crop` : "not scheduled"}. Recent decisions: ${recent || "none"}.`;
}

function syncContractPanelVisibility() {
  const hasOpenContracts = contractManager.getVisibleContractIds(currentSiteState?.dockedSite?.id ?? null).length > 0;
  setComponentAvailable("contract", hasOpenContracts);
}

function pullContractForService(service) {
  const contractIds = service.contractIds ?? [];
  const openId = contractIds.find((id) => {
    const r = state.contracts.records[id];
    return r && ["offered", "active", "fulfilled"].includes(r.status);
  });

  if (openId) {
    pullContractToCenter(openId);
  } else {
    focusPanelById("contract");
  }
}

function returnContractToDrawer() {
  const shelf = document.querySelector("#paperwork-drawer .drawer-shelf");
  const contractPanel = document.querySelector("[data-panel-id='contract']");
  if (shelf && contractPanel && !contractPanel.closest("#paperwork-drawer")) {
    contractPanel.style.transform = "";
    shelf.appendChild(contractPanel);
  }
  contractPulledFromDrawer = false;
  updatePaperworkControlLabels();
}

function pullContractToCenter(contractId) {
  contractManager.focusContract(contractId);
  renderContract();

  const hud = document.querySelector(".hud");
  const contractPanel = document.querySelector("[data-panel-id='contract']");

  if (!hud || !contractPanel) {
    return;
  }

  if (contractPanel.closest("#paperwork-drawer")) {
    contractPulledFromDrawer = true;
    contractPanel.style.transform = "translate(0px, 0px)";
    hud.appendChild(contractPanel);
    updatePaperworkControlLabels();
  }

  const hudRect = hud.getBoundingClientRect();
  const panelWidth = contractPanel.offsetWidth || 240;
  const panelHeight = contractPanel.offsetHeight || 320;
  const centerX = Math.round((hudRect.width / 2 - panelWidth / 2) / 20) * 20;
  const centerY = Math.round((hudRect.height / 2 - panelHeight / 2) / 20) * 20;

  positionPanelById("contract", { x: centerX, y: centerY });
  bringPanelToFront(contractPanel);
}

function pullDocumentToCenter(documentId) {
  renderDocumentReader(documentId);

  const hud = document.querySelector(".hud");
  const documentPanel = document.querySelector("[data-panel-id='document']");

  if (!hud || !documentPanel) {
    return;
  }

  if (documentPanel.closest("#paperwork-drawer")) {
    documentPanel.classList.remove("is-component-locked");
    documentPanel.style.transform = "translate(0px, 0px)";
    hud.appendChild(documentPanel);
    updatePaperworkControlLabels();
  }

  const hudRect = hud.getBoundingClientRect();
  const panelWidth = documentPanel.offsetWidth || 240;
  const panelHeight = documentPanel.offsetHeight || 280;
  const centerX = Math.round((hudRect.width / 2 - panelWidth / 2) / 20) * 20;
  const centerY = Math.round((hudRect.height / 2 - panelHeight / 2) / 20) * 20;

  positionPanelById("document", { x: centerX, y: centerY });
  bringPanelToFront(documentPanel);
}

function renderDocumentReader(documentId) {
  const record = state.worldRecords?.documents?.[documentId] ?? null;

  if (!record) {
    documentTitle.textContent = "Document";
    documentStatus.textContent = "missing";
    documentType.textContent = "Type: --";
    documentSummary.textContent = "This document record is not available.";
    documentFields.replaceChildren();
    return;
  }

  documentTitle.textContent = record.title ?? record.id;
  documentStatus.textContent = record.status ?? "record";
  documentType.textContent = `Type: ${formatDocumentType(record.type)}`;
  documentSummary.textContent = getDocumentSummary(record);
  documentFields.replaceChildren(
    ...getDocumentFieldPairs(record).map(([label, value]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");

      dt.textContent = label;
      dd.textContent = value;
      row.append(dt, dd);
      return row;
    }),
  );
}

function formatDocumentType(type = "document") {
  return type.replaceAll("-", " ");
}

function getDocumentSummary(record) {
  if (record.type === "pilot-license") {
    return "Identifies the pilot and grants provisional operating authority.";
  }

  if (record.type === "ship-title") {
    return "Records who holds title or beneficial ownership for a hull.";
  }

  if (record.type === "ship-registration") {
    return "Registers a ship VIN for operation under a issuing authority.";
  }

  if (record.type === "lien") {
    return "Records a collateral claim that can be released when its obligation is paid.";
  }

  return "World document record.";
}

function getDocumentFieldPairs(record) {
  const fields = [
    ["Document ID", record.id],
    ["Status", record.status ?? "record"],
  ];

  if (record.holderEntityId) fields.push(["Holder", getEntityLabel(record.holderEntityId)]);
  if (record.beneficialOwnerEntityId) fields.push(["Beneficial Owner", getEntityLabel(record.beneficialOwnerEntityId)]);
  if (record.issuerEntityId) fields.push(["Issuer", getEntityLabel(record.issuerEntityId)]);
  if (record.assetEntityId) fields.push(["Applies To", getEntityLabel(record.assetEntityId)]);
  if (record.sourceContractId) fields.push(["Source Contract", record.sourceContractId]);
  if (record.contractId) fields.push(["Contract", record.contractId]);
  if (record.collateralDocumentId) fields.push(["Collateral", record.collateralDocumentId]);
  if (record.heldByContractId) fields.push(["Held By Contract", record.heldByContractId]);
  if (record.grants?.length) fields.push(["Grants", record.grants.map((grant) => grant.permission).join(", ")]);

  return fields;
}

function renderResourceGuide() {
  if (!resourceGuideContent) {
    return;
  }

  resourceGuideContent.replaceChildren(
    ...getResourceGuideEntries().map((family) => {
      const group = document.createElement("section");
      const heading = document.createElement("h3");
      const meta = document.createElement("span");
      const list = document.createElement("ul");

      group.className = "resource-guide-family";
      heading.textContent = family.label;
      meta.textContent = family.shape;
      list.className = "resource-guide-list";

      list.append(
        ...family.resources.map((resource) => {
          const item = document.createElement("li");
          const swatch = document.createElement("span");
          const name = document.createElement("strong");
          const detail = document.createElement("span");

          item.className = "resource-guide-entry";
          swatch.className = `resource-guide-swatch is-${family.shape}`;
          swatch.style.setProperty("--resource-color", resource.color);
          swatch.setAttribute("aria-label", `${formatResourceName(resource.id)} color sample`);
          name.textContent = formatResourceName(resource.id);
          detail.textContent = `${resource.purpose} | ${resource.value} cr`;
          item.append(swatch, name, detail);
          return item;
        }),
      );

      group.append(heading, meta, list);
      return group;
    }),
  );
}

function formatResourceName(resourceId) {
  return resourceId.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function getEntityLabel(entityId) {
  const entity = state.worldRecords?.entities?.[entityId];
  return entity?.name ?? entity?.vin ?? entityId;
}

function renderHubServiceMenu(site) {
  const services = site ? getHubServices(site.id).filter((service) => isHubServiceUnlocked(site.id, service)) : [];
  const locator = state.components.beaconLocator;
  const hasHubBeacon = Boolean(site && (locator.beaconMemoryIds ?? []).includes(site.id));
  const ecologyBeaconCount = locator.ecologyBeacons?.length ?? 0;
  const canAddEcologyBeacons = Boolean(site?.id === chapterOneRoute.destinationSite.id && locator.installed);
  const nextKey = [
    site?.id ?? "none",
    activeHubServiceId ?? "none",
    locator.installed ? "locator" : "no-locator",
    hasHubBeacon ? "remembered" : "new",
    canAddEcologyBeacons ? `ecology:${ecologyBeaconCount}` : "no-ecology",
    services.map((service) => service.id).join("|"),
  ].join(":");

  if (hubServiceMenu.dataset.renderedKey === nextKey) {
    return;
  }

  hubServiceMenu.dataset.renderedKey = nextKey;

  if (services.length === 0) {
    hubServiceMenu.replaceChildren();
    return;
  }

  const beaconButton = site ? renderHubBeaconButton(site, hasHubBeacon) : null;
  const ecologyButton = canAddEcologyBeacons ? renderEcologyBeaconButton(ecologyBeaconCount) : null;

  hubServiceMenu.replaceChildren(
    ...(beaconButton ? [beaconButton] : []),
    ...(ecologyButton ? [ecologyButton] : []),
    ...services.map((service) => {
      const button = document.createElement("button");
      const label = document.createElement("strong");
      const meta = document.createElement("span");

      button.type = "button";
      button.className = "hub-service-button";
      button.classList.toggle("is-active-service", service.id === activeHubServiceId);
      button.classList.toggle("needs-attention-until-clicked", hasAttention(getHubServiceAttentionTarget(site.id, service.id)));
      button.dataset.serviceId = service.id;
      label.textContent = service.label;
      meta.textContent = `${service.npcName} - ${service.description}`;
      button.append(label, meta);
      return button;
    }),
  );
}

// Any contracts service flagged proceduralSurveyContracts runs a survey job
// board once its authored ladder (if any) is complete. Rook was the first;
// every hub work board goes through the same panel.
function getActiveSurveyBoardService(site) {
  const service = site && activeHubServiceId ? getHubService(site.id, activeHubServiceId) : null;

  return service?.proceduralSurveyContracts ? service : null;
}

// This render is reached from the per-frame site readout. Rebuilding the DOM
// every frame destroys a job button between the player's mousedown and
// mouseup, so no click can ever complete on it. The signature check makes the
// rebuild happen only when the board's visible state actually changed.
// (Its `let` lives with the other module state near the top of the file —
// dev-start boot code runs mid-file and reaches this render before this line.)
function renderRookJobBoard(site) {
  if (!rookJobBoard || !rookJobsPanel) {
    return;
  }

  const service = getActiveSurveyBoardService(site);

  if (!site || !service || !isServiceContractLadderComplete(service, state)) {
    if (lastRookJobBoardSignature !== "hidden") {
      lastRookJobBoardSignature = "hidden";
      rookJobBoard.hidden = true;
      rookJobBoard.replaceChildren();
      setComponentAvailable("rook-jobs", false);
      rookJobsPanel.setAttribute("aria-hidden", "true");
    }

    return;
  }

  setComponentAvailable("rook-jobs", true);
  rookJobsPanel.setAttribute("aria-hidden", "false");
  const board = getOrCreateRookJobBoard(site, service);
  const selectedContract = board.selectedContractId ? state.contracts.records[board.selectedContractId] : null;

  if (selectedContract && selectedContract.status !== "paid") {
    const signature = `assignment:${service.id}:${selectedContract.id}:${selectedContract.status}:${selectedContract.deliveredAmount ?? 0}:${selectedContract.killCount ?? 0}:${selectedContract.type === "cargo-run" ? (isManifestLoaded(selectedContract) ? "loaded" : "empty") : ""}`;

    if (signature === lastRookJobBoardSignature) {
      return;
    }

    lastRookJobBoardSignature = signature;
    setJobBoardTitle(service);
    rookJobBoard.hidden = false;
    rookJobBoard.replaceChildren(createRookBoardHeader("Current Assignment"), createRookCurrentAssignment(selectedContract));
    return;
  }

  const localNeedsSignature = site.id === SPRC.siteId
    ? Object.values(state.sprc?.procurementOrders ?? {}).filter((order) => ["offered", "active"].includes(order.status)).map((order) => `${order.id}:${order.status}:${order.deliveredEquivalentUnits}:${order.objectiveType}`).join("|")
    : "none";
  const signature = `board:${site.id}:${service.id}:${localNeedsSignature}:${board.jobs.map((job) => job.id).join(",")}`;

  if (signature === lastRookJobBoardSignature) {
    return;
  }

  lastRookJobBoardSignature = signature;
  setJobBoardTitle(service);
  rookJobBoard.hidden = false;
  rookJobBoard.replaceChildren(
    ...createSprcLocalNeedCards(site),
    createRookBoardHeader("Job Board"),
    ...board.jobs.map((job) => createRookJobButton(job)),
  );
}

function createSprcLocalNeedCards(site) {
  if (site?.id !== SPRC.siteId) return [];
  const orders = Object.values(state.sprc?.procurementOrders ?? {}).filter((order) => ["offered", "active"].includes(order.status));
  if (orders.length === 0) return [];
  const cards = [createRookBoardHeader("Local Needs")];
  orders.forEach((order) => {
    const contract = state.contracts.records[order.contractId];
    if (!contract) return;
    const button = document.createElement("button");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    button.type = "button";
    button.className = "rook-job-button";
    title.textContent = order.objectiveType === "emergency-repair" ? "Urgent: Porch Runner Two Repair" : "Reserve Replenishment";
    detail.textContent = `${order.deliveredEquivalentUnits}/${order.requiredEquivalentUnits} feedstock equivalents - ${order.maximumPayment} cr reserved`;
    button.append(title, detail);
    button.addEventListener("click", () => {
      contractManager.focusContract(contract.id);
      setComponentAvailable("contract", true);
      pullContractToCenter(contract.id);
    });
    cards.push(button);
  });
  return cards;
}

function setJobBoardTitle(service) {
  const title = document.querySelector("#job-board-org");

  if (title) {
    title.textContent = service.organization ?? service.label ?? "Work Board";
  }
}

function createRookBoardHeader(title) {
  const header = document.createElement("div");
  const heading = document.createElement("strong");
  const detail = document.createElement("span");

  header.className = "rook-job-board-header";
  heading.textContent = title;
  detail.textContent = "Choose one run. Fresh briefs arrive after it pays out.";
  header.append(heading, detail);
  return header;
}

// The board mixes three job kinds that all read as "get N of X" at a glance;
// a kind label keeps mining (dig here, sell here) legible next to freight
// (haul to another hub) and bounty. Falls back to type for any legacy job
// missing jobKind (e.g. a board cached in an old save).
function getJobKind(job) {
  if (job.jobKind) {
    return job.jobKind;
  }
  if (job.type === "cargo-run") return "freight";
  if (job.type === "bounty") return "bounty";
  return "mining";
}

function getJobKindLabel(job) {
  return { mining: "Mining", freight: "Freight", bounty: "Bounty", logistics: "Logistics" }[getJobKind(job)] ?? "Work";
}

function createRookJobButton(job) {
  const button = document.createElement("button");
  const tier = document.createElement("span");
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const payout = document.createElement("em");

  button.type = "button";
  button.className = "rook-job-option";
  button.dataset.rookJobId = job.id;
  button.dataset.jobKind = getJobKind(job);
  // Say plainly whether this is scripted story work or work an institution
  // actually needs right now — their terms behave completely differently.
  const provenance = job.provenanceLabel ? ` · ${job.provenanceLabel}` : "";
  tier.textContent = `${getJobKindLabel(job)} · ${job.jobTierLabel}${provenance}`;
  if (job.provenance) button.dataset.jobProvenance = job.provenance;
  title.textContent = job.title;
  const jobUnitLabel = job.terms.resourceName ?? job.terms.targetName ?? job.terms.commodityName ?? "cargo";
  detail.textContent = `${job.terms.amount} ${jobUnitLabel} - ${job.summary}`;
  payout.textContent = `Accept - ${job.reward.credits.toLocaleString()} cr`;
  button.append(tier, title, detail, payout);
  return button;
}

function createRookCurrentAssignment(contract) {
  const card = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const button = document.createElement("button");

  card.className = "rook-current-assignment";
  title.textContent = contract.title;
  if (contract.type === "cargo-run") {
    const delivered = contract.status === "fulfilled" || contract.status === "paid";
    detail.textContent = delivered
      ? `delivered to ${contract.terms.destinationName}`
      : isManifestLoaded(contract)
        ? `en route to ${contract.terms.destinationName}`
        : `load manifest at ${contract.terms.originName}`;
  } else {
    const isBounty = contract.type === "bounty";
    const assignmentDone = isBounty ? contract.killCount ?? 0 : contract.deliveredAmount ?? 0;
    const assignmentUnit = contract.terms.resourceName ?? contract.terms.targetName ?? "units";
    detail.textContent = `${assignmentDone}/${contract.terms.amount} ${assignmentUnit} ${isBounty ? "cleared" : "delivered"}`;
  }
  button.type = "button";
  button.textContent = "Open Contract";
  button.addEventListener("click", () => pullContractToCenter(contract.id));
  card.append(title, detail, button);
  return card;
}

function getOrCreateRookJobBoard(site, service) {
  const boards = state.hubServices.jobBoards ??= {};
  const boardId = `${site.id}:${service.id}`;
  const existingBoard = boards[boardId];
  const selectedContract = existingBoard?.selectedContractId ? state.contracts.records[existingBoard.selectedContractId] : null;

  if (existingBoard && (!existingBoard.selectedContractId || selectedContract?.status !== "paid")) {
    (existingBoard.jobs ?? []).forEach(registerContractDefinition);
    return existingBoard;
  }

  // A saved or legacy run may already be active even if it predates the job
  // board. Adopt it instead of placing a second Rook offer beside it.
  const inProgressContractId = getInProgressServiceContractId(service, state);
  if (inProgressContractId) {
    const board = {
      id: boardId,
      createdAt: Date.now(),
      selectedContractId: inProgressContractId,
      jobs: [],
    };
    boards[boardId] = board;
    return board;
  }

  const jobs = game.generateSurveyJobBoard(site, service.organization);
  const board = {
    id: boardId,
    createdAt: Date.now(),
    selectedContractId: null,
    jobs,
  };

  jobs.forEach(registerContractDefinition);
  boards[boardId] = board;
  return board;
}

function selectRookJob(jobId) {
  const site = currentSiteState?.dockedSite;
  const service = getActiveSurveyBoardService(site);

  if (!site || !service || !isServiceContractLadderComplete(service, state)) {
    return;
  }

  const board = getOrCreateRookJobBoard(site, service);
  const job = board.jobs.find((candidate) => candidate.id === jobId);

  if (!job || board.selectedContractId) {
    return;
  }

  // Store the selection before offering the contract. Offering synchronously
  // refreshes the HUD, and the redraw needs to see this board as committed.
  board.selectedContractId = job.id;
  registerContractDefinition(job);
  contractManager.offerContract(job.id, {
    type: "hub-service",
    siteId: site.id,
    siteName: site.name,
    serviceId: service.id,
    serviceType: service.serviceType,
    npcId: service.npcId,
    npcName: service.npcName,
    organization: service.organization,
  });

  const offeredContract = state.contracts.records[job.id];
  if (!offeredContract || offeredContract.status !== "offered") {
    board.selectedContractId = null;
    renderRookJobBoard(site);
    return;
  }

  // Choosing a board brief is the explicit acceptance action. The active
  // contract still appears as paperwork, but the player never has to chase a
  // second accept button after committing to one of Rook's three jobs.
  if (!contractManager.acceptContract(job.id)) {
    board.selectedContractId = null;
    renderRookJobBoard(site);
    return;
  }
  if (offeredContract.terms?.standingFreightTemplateId) {
    const playerInstitutionId = state.character.controlledPersonEntityId ?? "person:player";
    if (!logisticsManager.acceptPlayerContract(offeredContract, playerInstitutionId)) {
      offeredContract.status = "canceled";
      board.selectedContractId = null;
      renderRookJobBoard(site);
      return;
    }
  }
  setComponentAvailable("contract", true);
  pullContractToCenter(job.id);
  renderRookJobBoard(site);
}

function renderEcologyBeaconButton(ecologyBeaconCount) {
  const button = document.createElement("button");
  const label = document.createElement("strong");
  const meta = document.createElement("span");
  const hasEcologyBeacons = ecologyBeaconCount > 0;

  button.type = "button";
  button.className = "hub-service-button hub-beacon-button";
  button.dataset.ecologyBeaconAction = "add-all";
  button.disabled = hasEcologyBeacons;
  label.textContent = hasEcologyBeacons ? "Ecology Beacons Stored" : "Add Ecology Beacons";
  meta.textContent = hasEcologyBeacons
    ? "Lifeform tour markers are already in Beacon Navigation."
    : "Add Murmur's lifeform tour markers to Beacon Navigation.";
  button.append(label, meta);
  return button;
}

function renderHubBeaconButton(site, hasHubBeacon) {
  const button = document.createElement("button");
  const label = document.createElement("strong");
  const meta = document.createElement("span");
  const locator = state.components.beaconLocator;

  button.type = "button";
  button.className = "hub-service-button hub-beacon-button";
  button.dataset.hubBeaconId = site.id;
  button.disabled = !locator.installed || hasHubBeacon;
  label.textContent = hasHubBeacon ? "Beacon Stored" : "Add Hub Beacon";
  meta.textContent = hasHubBeacon
    ? `${site.name} is already in Beacon Navigation.`
    : `Add ${site.name} to Beacon Navigation.`;
  button.append(label, meta);
  return button;
}

function addEcologyBeaconsToNavigation() {
  const locator = state.components.beaconLocator;

  if (!locator.installed) {
    return;
  }

  const ecologyBeacons = game.createEcologyBeaconTargets?.() ?? [];

  if (ecologyBeacons.length === 0) {
    return;
  }

  locator.ecologyBeacons = ecologyBeacons;
  locator.activeBeaconId = ecologyBeacons[0].id;
  locator.beaconLocatorUsed = true;
  state.ledger.recordEvent(
    "beaconLocator.ecologyBeaconsStored",
    {
      count: ecologyBeacons.length,
      sourceSiteId: chapterOneRoute.destinationSite.id,
      sourceSiteName: chapterOneRoute.destinationSite.name,
    },
    { visible: false },
  );
  updateBeaconDisplay();
  renderHubServiceMenu(currentSiteState?.dockedSite);
  scheduleSave();
}

function addHubBeaconToNavigation(siteId) {
  if (!game.rememberHubBeacon(siteId)) {
    return;
  }

  updateBeaconDisplay();
  renderHubServiceMenu(currentSiteState?.dockedSite);
  scheduleSave();
}

function isHubServiceUnlocked(siteId, service) {
  return Boolean(service.defaultUnlocked || state.hubServices.unlocked[siteId]?.includes(service.id));
}

function unlockHubService(siteId, serviceId) {
  const unlockedServices = state.hubServices.unlocked[siteId] ?? [];

  if (unlockedServices.includes(serviceId)) {
    return;
  }

  state.hubServices.unlocked[siteId] = [...unlockedServices, serviceId];
  requestAttention({
    targetId: getHubServiceAttentionTarget(siteId, serviceId),
    mode: "until-clicked",
    reason: "hub-service-unlocked",
  });
  hubServiceMenu.dataset.renderedKey = "";
  state.ledger.recordEvent(
    "hub.serviceUnlocked",
    {
      siteId,
      serviceId,
    },
    { visible: false },
  );
}

function openHubService(serviceId) {
  const dockedSite = currentSiteState?.dockedSite;
  const service = dockedSite ? getHubService(dockedSite.id, serviceId) : null;

  if (!service) {
    return;
  }

  const behavior = getHubServiceBehavior(service);
  closeDriveThroughWindows({ keepServiceType: service.serviceType });
  activeHubServiceId = service.id;
  clearAttention(getHubServiceAttentionTarget(dockedSite.id, service.id));
  hubStatus.textContent = service.organization;
  hubDetail.textContent = `${service.npcName}: ${getHubServicePrompt(service)}`;
  renderHubServiceMenu(dockedSite);

  if (service.greeting) {
    commsDirector.say({
      source: COMMS_SOURCES.serviceNpc,
      speaker: service.npcName,
      text: service.greeting,
    });
  }
  state.ledger.recordEvent(
    "hub.serviceOpened",
    {
      siteId: dockedSite.id,
      siteName: dockedSite.name,
      serviceId: service.id,
      serviceType: service.serviceType,
      npcId: service.npcId,
      npcName: service.npcName,
      organization: service.organization,
    },
    { visible: false },
  );

  if (service.id === FARM_INSPECTION_SERVICE_ID) {
    renderFarmInstitutionSummary();
    return;
  }

  if (service.serviceType === "operation") {
    renderSprcOperationSummary();
    const openContract = Object.values(state.contracts.records).find(
      (contract) => contract.type === "resource-procurement" && ["offered", "active", "fulfilled"].includes(contract.status),
    );
    if (openContract) {
      setComponentAvailable("contract", true);
      pullContractToCenter(openContract.id);
    }
    return;
  }

  if (behavior.panelId === "merchant") {
    setComponentAvailable("merchant", true);
    renderShipOffers();
    focusPanelById("merchant");
    return;
  }

  if (behavior.offersContracts) {
    if (service.proceduralSurveyContracts && isServiceContractLadderComplete(service, state)) {
      syncContractPanelVisibility();
      renderRookJobBoard(dockedSite);
      focusPanelById("rook-jobs");
      return;
    }

    setComponentAvailable("contract", true);
    if (service.offersAllContracts) {
      offerAllHubServiceContracts(dockedSite, service);
    } else {
      offerHubServiceContract(dockedSite, service);
    }
    pullContractForService(service);
    return;
  }

  if (behavior.panelId === "finley") {
    setComponentAvailable("finley", true);
    renderFinleyPanel();
    focusPanelById("finley");
    return;
  }

  if (behavior.panelId === "component-shop") {
    setComponentAvailable("component-shop", true);
    renderComponentShop(service);
    focusPanelById("component-shop");
    return;
  }

  if (behavior.panelId === "roadmap") {
    setComponentAvailable("roadmap", true);
    focusPanelById("roadmap");
    return;
  }
}

function closeDriveThroughPanel(panelId) {
  if (panelId === "rook-jobs") {
    setComponentAvailable("rook-jobs", false);

    if (getActiveSurveyBoardService(currentSiteState?.dockedSite)) {
      activeHubServiceId = null;
      renderHubServiceMenu(currentSiteState?.dockedSite);
    }

    return;
  }

  if (panelId === "merchant") {
    setComponentAvailable("merchant", false);

    if (isActiveServiceUsingPanel("merchant")) {
      activeHubServiceId = null;
      renderHubServiceMenu(currentSiteState?.dockedSite);
    }

    return;
  }

  if (panelId === "contract") {
    if (contractPulledFromDrawer) {
      returnContractToDrawer();
    } else {
      setComponentAvailable("contract", false);
    }

    if (isActiveServiceUsingPanel("contract")) {
      activeHubServiceId = null;
      renderHubServiceMenu(currentSiteState?.dockedSite);
    }

    return;
  }

  if (panelId === "finley") {
    isCargoSellModeActive = false;
    updateCargoTargetDisplay();
    setComponentAvailable("finley", false);

    if (isActiveServiceUsingPanel("finley")) {
      activeHubServiceId = null;
      renderHubServiceMenu(currentSiteState?.dockedSite);
    }

    return;
  }

  if (panelId === "roadmap") {
    setComponentAvailable("roadmap", false);

    if (isActiveServiceUsingPanel("roadmap")) {
      activeHubServiceId = null;
      renderHubServiceMenu(currentSiteState?.dockedSite);
    }

    return;
  }

  if (panelId === "component-shop") {
    setComponentAvailable("component-shop", false);

    if (isActiveServiceUsingPanel("component-shop")) {
      activeHubServiceId = null;
      renderHubServiceMenu(currentSiteState?.dockedSite);
    }

    return;
  }
}

function isActiveServiceUsingPanel(panelId) {
  const activeService = activeHubServiceId ? getHubService(currentSiteState?.dockedSite?.id, activeHubServiceId) : null;
  return getServiceTypesForPanel(panelId).includes(activeService?.serviceType);
}

function closeDriveThroughWindows({ keepServiceType = null } = {}) {
  if (!shouldKeepServiceWindowOpen(keepServiceType, "rook-jobs")) {
    setComponentAvailable("rook-jobs", false);
  }

  if (!shouldKeepServiceWindowOpen(keepServiceType, "merchant")) {
    setComponentAvailable("merchant", false);
  }

  if (!shouldKeepServiceWindowOpen(keepServiceType, "contract")) {
    syncContractPanelVisibility();
  }

  if (!shouldKeepServiceWindowOpen(keepServiceType, "finley")) {
    isCargoSellModeActive = false;
    updateCargoTargetDisplay();
    setComponentAvailable("finley", false);
  }

  if (!shouldKeepServiceWindowOpen(keepServiceType, "roadmap")) {
    setComponentAvailable("roadmap", false);
  }

  if (!shouldKeepServiceWindowOpen(keepServiceType, "component-shop")) {
    setComponentAvailable("component-shop", false);
  }
}

function offerHubServiceContract(site, service) {
  if (service.id === yardExchangeServices.rook && isServiceContractLadderComplete(service, state)) {
    renderRookJobBoard(site);
    return;
  }

  if (offerSurveyContract(site, service)) {
    return;
  }

  const contractId = getNextHubServiceContractId(service, { state });

  if (!contractId) {
    if (service.singleActiveContract) {
      const inProgressId = getInProgressServiceContractId(service, state);

      if (inProgressId) {
        contractManager.focusContract(inProgressId);
      }

      if (service.busyMessage) {
        commsDirector.say({
          source: COMMS_SOURCES.serviceNpc,
          speaker: service.npcName,
          text: service.busyMessage,
        });
      }
    }

    return;
  }

  contractManager.offerContract(contractId, {
    type: "hub-service",
    siteId: site.id,
    siteName: site.name,
    serviceId: service.id,
    serviceType: service.serviceType,
    npcId: service.npcId,
    npcName: service.npcName,
    organization: service.organization,
  });
}

// Once a service's authored contract ladder is fully paid out, it switches to
// world-generated survey runs: the hub reads the ore clusters that actually
// exist around it and writes a contract for one of them. Returns true when it
// handled the interaction (offer, refocus, or busy), false to fall through to
// the authored contract flow.
function offerSurveyContract(site, service) {
  if (!service.proceduralSurveyContracts || !isServiceContractLadderComplete(service, state)) {
    return false;
  }

  const inProgressId = getInProgressServiceContractId(service, state);
  const inProgress = inProgressId ? state.contracts.records[inProgressId] : null;

  if (inProgress?.status === "offered") {
    contractManager.focusContract(inProgressId);
    return true;
  }

  if (inProgress) {
    contractManager.focusContract(inProgressId);

    if (service.busyMessage) {
      commsDirector.say({
        source: COMMS_SOURCES.serviceNpc,
        speaker: service.npcName,
        text: service.busyMessage,
      });
    }

    return true;
  }

  const definition = game.generateSurveyContract(site, service.organization);

  if (!definition) {
    return false;
  }

  registerContractDefinition(definition);
  contractManager.offerContract(definition.id, {
    type: "hub-service",
    siteId: site.id,
    siteName: site.name,
    serviceId: service.id,
    serviceType: service.serviceType,
    npcId: service.npcId,
    npcName: service.npcName,
    organization: service.organization,
  });
  return true;
}

function offerAllHubServiceContracts(site, service) {
  const contractIds = getAllHubServiceContractIds(service, { state });

  contractIds.forEach((contractId) => {
    contractManager.offerContract(contractId, {
      type: "hub-service",
      siteId: site.id,
      siteName: site.name,
      serviceId: service.id,
      serviceType: service.serviceType,
      npcId: service.npcId,
      npcName: service.npcName,
      organization: service.organization,
    });
  });
}

function updateLedgerDrivenSystems() {
  syncPlayerCargoCustody();
  sprcManager.update();
  contractManager.update();
  journeyDirector.update();
  commsDirector.update();
  updateRookFollowupOffers();
  updatePermitGrants();
  updateHubAuthorityMessages();
  updateTowChatter();
  updateSprcChatter();
  updateLifeformTour();
  updateDockingInspection();
}

function updateSprcChatter() {
  const events = state.ledger.getEventsAfterId(lastSprcChatterEventId, { includeHidden: true });
  events.forEach((event) => {
    lastSprcChatterEventId = Math.max(lastSprcChatterEventId, event.id);
    let text = null;
    if (event.type === "sprc.productionCompleted") {
      text = `The Maw finished a batch: ${event.payload.amount} ${formatResourceName(event.payload.itemId)} ready for the berth.`;
    } else if (event.type === "sprc.repairCompleted") {
      text = `${event.payload.shipName ?? "The runner"} is cleared out of Berth Two and going back to work.`;
    } else if (event.type === "contract.expired" && event.payload.repairOrderId) {
      text = "That feedstock order expired. The stock is still short, so the repair stays blocked and the committed credits are back in the operating account.";
    } else if (event.type === "contract.paid" && event.payload.payerAccountId === state.sprc?.account?.id) {
      text = "Feedstock received, title transferred, and the reserved payment is yours. The Maw can work with this.";
    }
    if (text) commsDirector.say({ source: COMMS_SOURCES.serviceNpc, speaker: "Sal", text });
  });
}

function syncPlayerCargoCustody() {
  const grouped = new Map();
  cargoHold.units.forEach((unit) => {
    if (String(unit.type).startsWith("manifest:")) return;
    const key = `${unit.type}:${unit.sourceClaimId ?? "unproven"}`;
    const record = grouped.get(key) ?? { type: normalizeResourceType(unit.type), quantity: 0, sourceClaimId: unit.sourceClaimId ?? null };
    record.quantity += unit.quantity ?? 1;
    grouped.set(key, record);
  });
  state.cargoCustody = {
    holderEntityId: state.character.controlledPersonEntityId,
    shipVin: state.character.activeHullVin,
    units: [...grouped.values()],
    updatedAt: Date.now(),
  };
}

function updatePermitGrants() {
  const events = state.ledger.getEventsAfterId(lastPermitGrantEventId, { includeHidden: true });

  events.forEach((event) => {
    lastPermitGrantEventId = Math.max(lastPermitGrantEventId, event.id);

    if (event.type !== "permit.granted" || event.payload.permitType !== "hub-docking" || !event.payload.siteId) {
      return;
    }

    addHubBeaconToNavigation(event.payload.siteId);
  });
}

function updateDockingInspection() {
  const events = state.ledger.getEventsAfterId(lastDockingInspectionEventId, { includeHidden: true });

  events.forEach((event) => {
    lastDockingInspectionEventId = Math.max(lastDockingInspectionEventId, event.id);

    if (event.type !== "site.docked") {
      return;
    }

    const report = createShipPaperworkInspectionReport(state);

    state.ledger.recordEvent(
      "paperwork.inspected",
      {
        siteId: event.payload?.siteId ?? null,
        siteName: event.payload?.siteName ?? null,
        vin: report.vin,
        pilotLicenseId: report.pilotLicenseId,
        pilotName: report.pilotName,
        hasVin: report.clearance.hasVin,
        hasPilotLicense: report.clearance.hasPilotLicense,
        hasFlightRegistration: report.clearance.hasFlightRegistration,
      },
      { visible: false },
    );
  });
}

function updateTowChatter() {
  const events = state.ledger.getEventsAfterId(lastTowChatterEventId, { includeHidden: true });

  events.forEach((event) => {
    lastTowChatterEventId = Math.max(lastTowChatterEventId, event.id);

    if (event.type === "tow.attached") {
      const { siteId, cost } = event.payload;
      const driver = TOW_DRIVER_NAMES[Math.abs(siteId.length + cost) % TOW_DRIVER_NAMES.length];
      commsDirector.say({
        source: COMMS_SOURCES.tow,
        speaker: driver,
        text: "Got the line set. Hands off the controls, I'll get you home.",
      });
    } else if (event.type === "ship.towed") {
      const { siteId, cost } = event.payload;
      const driver = TOW_DRIVER_NAMES[Math.abs(siteId.length + cost) % TOW_DRIVER_NAMES.length];
      commsDirector.say({
        source: COMMS_SOURCES.tow,
        speaker: driver,
        text: `You're docked. That's ${cost} credits off your account. Stay closer to home next run.`,
      });
    }
  });
}

function updateLifeformTour() {
  const events = state.ledger.getEventsAfterId(lastLifeformTourEventId, { includeHidden: true });

  events.forEach((event) => {
    lastLifeformTourEventId = Math.max(lastLifeformTourEventId, event.id);

    if (event.type !== "lifeform.contacted") {
      return;
    }

    const ecologyType = event.payload?.ecologyType;
    const text = MURMUR_LIFEFORM_TOUR_MESSAGES[ecologyType];

    if (!text) {
      return;
    }

    commsDirector.say({
      source: COMMS_SOURCES.worldNpc,
      speaker: "Murmur",
      text,
      priority: 28,
      requireIdle: true,
      queueIfBlocked: true,
      ttlMs: 16000,
    });
  });
}

function updateRookFollowupOffers() {
  const events = state.ledger.getEventsAfterId(lastRookAutoOfferEventId, { includeHidden: true });

  events.forEach((event) => {
    lastRookAutoOfferEventId = Math.max(lastRookAutoOfferEventId, event.id);

    if (event.type !== "contract.paid" || event.payload.contractGroup !== "rook-resource-run") {
      return;
    }

    const site = currentSiteState?.dockedSite;
    const service = site ? getHubService(site.id, activeHubServiceId) : null;

    if (!site || service?.id !== yardExchangeServices.rook) {
      return;
    }

    if (service.id === yardExchangeServices.rook && isServiceContractLadderComplete(service, state)) {
      renderRookJobBoard(site);
      return;
    }

    offerHubServiceContract(site, service);
    pullContractForService(service);
  });
}

function updateHubAuthorityMessages() {
  const events = state.ledger.getEventsAfterId(lastHubAuthorityEventId, { includeHidden: true });

  events.forEach((event) => {
    lastHubAuthorityEventId = Math.max(lastHubAuthorityEventId, event.id);

    if (event.type === "authority.identityRequested") {
      const speaker = `${event.payload.siteName ?? "Hub"} Traffic`;
      const siteId = event.payload.siteId;
      const site = game.worldSites.find((candidate) => candidate.id === siteId) ?? null;
      const registrySubject = getRegistrySubject(state, {
        registryEntityId: getRegistryEntityIdForSite(site),
        subjectEntityId: event.payload.entityId,
      });

      if (registrySubject?.status === "cleared") {
        pendingHubIdentityPresentations.delete(siteId);
        state.ledger.recordEvent(
          "authority.identityCleared",
          {
            siteId,
            siteName: event.payload.siteName ?? site?.name ?? null,
            entityId: event.payload.entityId ?? registrySubject.subjectEntityId ?? null,
            presentedLicenseId: registrySubject.pilotLicenseId ?? event.payload.pilotLicenseId ?? null,
            presentedVin: registrySubject.shipVin ?? event.payload.shipVin ?? null,
            source: "registry-memory",
          },
          { visible: false },
        );
        return;
      }

      // Pre-populate with any documents the player already presented before the patrol finished scanning.
      const pastEvents = state.ledger.getEventsAfterId(0, { includeHidden: true })
        .filter((e) => e.type === "authority.documentPresented" && e.payload.siteId === siteId && e.id < event.id);
      const record = { kinds: new Set(pastEvents.map((e) => e.payload.documentKind)), licenseId: null, licenseCanonical: false, vin: null };
      pastEvents.forEach((e) => {
        if (e.payload.documentKind === "pilot-license") { record.licenseId = e.payload.pilotLicenseId ?? null; record.licenseCanonical = e.payload.canonical ?? false; }
        if (e.payload.documentKind === "ship-vin") { record.vin = e.payload.shipVin ?? null; }
      });
      pendingHubIdentityPresentations.set(siteId, record);
      if (record.kinds.has("ship-vin") && record.kinds.has("pilot-license")) {
        markHubIdentityDocumentPresented(siteId, "ship-vin", {});
        return;
      }

      commsDirector.say({
        source: COMMS_SOURCES.hubAuthority,
        speaker,
        priority: 75,
        text: pick([
          "Unregistered contact. Present ship VIN and pilot license for first-time registry entry.",
          "No registry record for this contact. Show VIN and pilot authorization to complete clearance.",
          "First-time arrival detected. Hold your line and present VIN plus pilot license for entry review.",
        ]),
        requireIdle: false,
      });
    } else if (event.type === "authority.documentPresented") {
      const siteId = event.payload.siteId;
      const speaker = `${event.payload.siteName ?? "Hub"} Traffic`;
      const isVin = event.payload.documentKind === "ship-vin";
      const pending = pendingHubIdentityPresentations.get(siteId);
      markHubIdentityDocumentPresented(siteId, event.payload.documentKind, event.payload);

      // Only speak if this presentation was part of an open identity review.
      if (pending) {
        const needsOther = isVin ? !pending.kinds.has("pilot-license") : !pending.kinds.has("ship-vin");
        const text = isVin
          ? needsOther ? pick(["VIN received. Now show pilot authorization.", "Got the VIN. Show your pilot license to complete the check.", "Ship identity confirmed. Now present pilot authorization."]) : "VIN received. Stand by."
          : needsOther ? pick(["Authorization received. Now show the ship VIN.", "Pilot credentials on file. Show the ship VIN to complete the check.", "License confirmed. We still need the ship VIN."]) : "Authorization received. Stand by.";

        // Priority 76 — must cut through the identityRequested message (priority 75)
        commsDirector.say({ source: COMMS_SOURCES.hubAuthority, speaker, text, priority: 76 });
      }
    } else if (event.type === "authority.inspectionFlagged") {
      const speaker = `${event.payload.siteName ?? "Hub"} Traffic`;
      const reasons = event.payload.reasons ?? [];
      let text;

      if (reasons.includes("missing-vin") && reasons.includes("missing-pilot-license")) {
        text = pick([
          "No valid VIN or pilot authorization on record. Docking clearance is denied. This contact has been logged.",
          "Contact has no registered VIN and no pilot license on file. Clearance denied. Entry logged.",
          "Neither ship identity nor pilot credentials found. Docking is not authorized. This incident is on record.",
        ]);
      } else if (reasons.includes("missing-vin")) {
        text = pick([
          "No valid VIN on record for this contact. Docking clearance is denied. This contact has been logged.",
          "Ship VIN not found in registry. Clearance denied. Contact has been flagged.",
          "Unregistered hull. No VIN match found. Docking not approved — contact logged for review.",
        ]);
      } else if (reasons.includes("missing-pilot-license")) {
        text = pick([
          "No pilot authorization on record for this contact. Docking clearance is denied.",
          "Pilot credentials not found. Authorization to dock is denied.",
          "No active pilot license on file for this contact. Clearance is not approved.",
        ]);
      } else if (reasons.includes("unauthorized-zone-history")) {
        text = pick([
          "Zone violation flag on this contact. Docking clearance is temporarily restricted. This contact has been logged.",
          "This contact carries an unauthorized zone entry. Clearance is suspended pending review.",
          "Zone access record flagged. Docking not approved until the violation is resolved.",
        ]);
      } else {
        text = pick([
          "Contact flagged. Docking clearance is denied. This contact has been logged.",
          "Inspection flag raised on this contact. Clearance is not approved.",
          "Registry check returned a flag. Docking denied — contact has been recorded.",
        ]);
      }

      commsDirector.say({
        source: COMMS_SOURCES.hubAuthority,
        speaker,
        text,
        requireIdle: false,
      });
    } else if (event.type === "patrol.standoff") {
      const speaker = `${event.payload.siteName ?? "Hub"} Traffic`;
      commsDirector.say({
        source: COMMS_SOURCES.hubAuthority,
        speaker,
        text: pick([
          "Uncleared contact, stand by. Present ship VIN and pilot authorization before docking clearance will be approved.",
          "Hold position. This contact has not been cleared. Show VIN and pilot authorization before docking will be permitted.",
          "Unregistered approach detected. Stand by for inspection. VIN and pilot credentials required before entry is approved.",
        ]),
        requireIdle: false,
      });
    } else if (event.type === "patrol.arrived") {
      const speaker = `${event.payload.patrolName ?? "Patrol"}`;
      commsDirector.say({
        source: COMMS_SOURCES.hubAuthority,
        speaker,
        text: pick([
          "Hold position. Running identity check now.",
          "Stay on your heading. Scanning.",
          "Don't move. Checking your registry entry.",
        ]),
        requireIdle: false,
      });
    } else if (event.type === "patrol.cleared") {
      const speaker = `${event.payload.patrolName ?? "Patrol"}`;
      commsDirector.say({
        source: COMMS_SOURCES.hubAuthority,
        speaker,
        text: pick([
          "Documents check out. You're cleared — carry on.",
          "Registry confirmed. Docking is approved. Move along.",
          "All clear. You're good to dock.",
        ]),
        requireIdle: false,
      });
      pendingHubIdentityPresentations.delete(event.payload.siteId);
    } else if (event.type === "authority.identityCleared") {
      pendingHubIdentityPresentations.delete(event.payload.siteId);
    } else if (event.type === "patrol.dockingBlocked") {
      const speaker = `${event.payload.siteName ?? "Hub"} Traffic`;
      commsDirector.say({
        source: COMMS_SOURCES.hubAuthority,
        speaker,
        text: pick([
          "Clearance check in progress. Docking is not approved until review is complete.",
          "Stand down on docking. Your clearance review is not finished.",
          "Docking denied. Inspection is still active — wait for the all clear.",
        ]),
        requireIdle: false,
      });
    } else if (event.type === "patrol.dismissed") {
      commsDirector.clearActiveMessage();
      pendingHubIdentityPresentations.delete(event.payload.siteId);
    } else if (event.type === "site.nearby" && event.payload.siteType === "hub") {
      const vin = state.components.hull.vinPlateAttached ? state.components.hull.vin : "unverified VIN";
      const license = getPilotLicense(state).licenseId ?? "no active license";
      const speaker = `${event.payload.siteName ?? "Hub"} Authority`;

      commsDirector.say({
        source: COMMS_SOURCES.hubAuthority,
        speaker,
        text: `Approach logged for ${vin} under ${license}. Docking approval is open while you remain inside hub range.`,
        requireIdle: true,
      });
    } else if (event.type === "site.tetherBroken") {
      const vin = state.components.hull.vinPlateAttached ? state.components.hull.vin : "unverified VIN";
      const license = getPilotLicense(state).licenseId ?? "no active license";
      const speaker = `${event.payload.siteName ?? "Hub"} Authority`;

      commsDirector.say({
        source: COMMS_SOURCES.hubAuthority,
        speaker,
        text: `Tether break recorded for ${vin} under ${license}. Clear the lane, stabilize, and request docking again when safe.`,
      });
    } else if (event.type === "site.tetherStrained") {
      const vin = state.components.hull.vinPlateAttached ? state.components.hull.vin : "unverified VIN";
      const speaker = `${event.payload.siteName ?? "Hub"} Authority`;

      commsDirector.say({
        source: COMMS_SOURCES.hubAuthority,
        speaker,
        text: `Docking tether strain alarm for ${vin}. Cut thrust while tethered or undock before maneuvering.`,
      });
    }
  });
}

function markHubIdentityDocumentPresented(siteId, documentKind, payload = {}) {
  if (!siteId || !pendingHubIdentityPresentations.has(siteId)) {
    return;
  }

  const record = pendingHubIdentityPresentations.get(siteId);
  record.kinds.add(documentKind);

  if (documentKind === "pilot-license" && payload.pilotLicenseId) {
    record.licenseId = payload.pilotLicenseId;
    record.licenseCanonical = payload.canonical ?? false;
  }
  if (documentKind === "ship-vin" && payload.shipVin) {
    record.vin = payload.shipVin;
  }

  if (!record.kinds.has("ship-vin") || !record.kinds.has("pilot-license")) {
    return;
  }

  pendingHubIdentityPresentations.delete(siteId);
  const site = game.worldSites.find((candidate) => candidate.id === siteId) ?? null;

  if (!site) {
    return;
  }

  game.reviewShipRegistryAtHub(site, {
    inspector: {
      type: "hub-traffic",
      id: `${site.id}-traffic`,
      name: `${site.name} Traffic`,
    },
  });
  game.dismissPatrolIntercept(site.id);

  const canonicalLicenseId = getPilotLicense(state).licenseId ?? null;
  const canonicalVin = state.components.hull.vinPlateAttached ? state.components.hull.vin : null;

  state.ledger.recordEvent(
    "authority.identityCleared",
    {
      siteId: site.id,
      siteName: site.name,
      presentedLicenseId: record.licenseId,
      presentedVin: record.vin,
      canonicalLicenseId,
      canonicalVin,
      licenseIsCanonical: record.licenseId === canonicalLicenseId,
      vinIsCanonical: record.vin === canonicalVin,
    },
    { visible: false },
  );

  commsDirector.say({
    source: COMMS_SOURCES.hubAuthority,
    speaker: `${site.name} Traffic`,
    text: "Identity confirmed. Registry entry opened. You are cleared for routine docking at this hub.",
  });
}

function updateWorldDebugDisplay(debug) {
  const zone = debug.zoneProfile;

  worldDebugFields.position.textContent = `${Math.round(debug.worldX)}, ${Math.round(debug.worldY)}`;
  worldDebugFields.zone.textContent = `${zone.strongestZoneName} (${zone.strongestZoneId})`;
  viewportRegion.textContent = getViewportLocationLabel(debug);
  worldDebugFields.influence.textContent = `${Math.round(zone.influence * 100)}%`;
  worldDebugFields.danger.textContent = `${Math.round(zone.danger * 100)}%`;
  worldDebugFields.density.textContent = `${zone.asteroidDensityMultiplier.toFixed(2)}x`;
  worldDebugFields.oreBias.textContent = formatZoneResourceBias(zone);
  worldDebugFields.lifeBias.textContent = `H ${zone.hunterBias.toFixed(2)} / A ${zone.ambientLifeBias.toFixed(2)}`;
  worldDebugFields.asteroids.textContent = String(debug.asteroidCount);
  worldDebugFields.hunters.textContent = `${debug.hunterCount} / ${debug.activeHunterCount} active`;
  worldDebugFields.lifeforms.textContent = String(debug.lifeformCount);
  worldDebugFields.activeLifeforms.textContent = String(debug.activeLifeformCount);
  worldDebugFields.pickups.textContent = String(debug.pickupCount);
  updatePopulationDisplay(debug.population);
  updateEventLedgerDisplay();
}

function formatZoneResourceBias(zone) {
  if (Number.isFinite(zone.redOreBias) || Number.isFinite(zone.blueOreBias)) {
    return `R ${formatBias(zone.redOreBias)} / B ${formatBias(zone.blueOreBias)}`;
  }

  return [
    `St ${formatBias(zone.structuralBias)}`,
    `In ${formatBias(zone.industrialBias)}`,
    `Vo ${formatBias(zone.volatileBias)}`,
    `Cn ${formatBias(zone.conductorBias)}`,
  ].join(" / ");
}

function formatBias(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function renderContract(contract = contractManager.getCurrentContract()) {
  const visibleContractIds = contractManager.getVisibleContractIds(currentSiteState?.dockedSite?.id ?? null);
  if (contract && !visibleContractIds.includes(contract.id)) {
    contract = null;
  }
  game.syncContractBeaconTarget(contract);
  renderContractFileStack(contract);

  if (!contract) {
    contractTitle.textContent = "Contract";
    contractStatus.textContent = "no offer";
    contractIssuer.textContent = "Issuer: --";
    contractSummary.textContent = "No active contract.";
    contractPrimaryLabel.textContent = "VIN";
    contractVin.textContent = "--";
    contractSecondaryLabel.textContent = "Destination";
    contractDestination.textContent = "--";
    contractTertiaryLabel.textContent = "Reward";
    contractReward.textContent = "0 cr";
    contractProgress.hidden = true;
    contractPayment.hidden = true;
    contractAcceptButton.disabled = true;
    contractAcceptButton.textContent = "Accept Contract";
    renderContractNavigation();
    contractClauses.replaceChildren();
    updatePaperworkControlLabels();
    return;
  }

  contractTitle.textContent = contract.title;
  contractStatus.textContent = getContractStatusLabel(contract.status);
  contractIssuer.textContent = `Issuer: ${contract.issuer}`;
  contractSummary.textContent = contract.summary;
  renderContractTerms(contract);
  renderContractProgress(contract);
  renderContractPayment(contract);
  contractAcceptButton.disabled = !isContractButtonEnabled(contract);
  contractAcceptButton.textContent = getContractButtonLabel(contract);
  renderContractNavigation(contract);
  contractClauses.replaceChildren(
    ...(contract.clauses ?? []).map((clause) => {
      const item = document.createElement("li");
      item.textContent = clause;
      return item;
    }),
  );
  updatePaperworkControlLabels();
}

function renderContractFileStack(currentContract = contractManager.getCurrentContract()) {
  if (!contractFileStack) {
    return;
  }

  const files = getPaperworkFiles();

  if (files.length === 0) {
    contractFileStack.replaceChildren();
    contractFileStack.hidden = true;
    return;
  }

  contractFileStack.hidden = false;
  contractFileStack.replaceChildren(
    ...files.map((fileRecord) => {
      const file = document.createElement("button");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      const status = document.createElement("em");

      file.type = "button";
      file.className = "contract-file-card";
      file.classList.toggle("is-current", fileRecord.kind === "contract" && currentContract?.id === fileRecord.id);
      file.dataset.paperFileKind = fileRecord.kind;
      file.dataset.paperFileId = fileRecord.id;

      title.textContent = fileRecord.title;
      meta.textContent = fileRecord.meta;
      status.textContent = fileRecord.status;
      file.append(title, meta, status);
      return file;
    }),
  );
}

function getPaperworkFiles() {
  const contractFiles = contractManager.getVisibleContractIds(currentSiteState?.dockedSite?.id ?? null).map((contractId) => {
    const contract = state.contracts.records[contractId];
    return {
      kind: "contract",
      id: contract.id,
      title: contract.title,
      meta: getContractFileMeta(contract),
      status: getContractStatusLabel(contract.status),
      sort: `1-${contract.offeredAt ?? 0}-${contract.id}`,
    };
  });

  const documentFiles = Object.values(state.worldRecords?.documents ?? {})
    .filter(isDocumentVisibleInDrawer)
    .map((document) => ({
      kind: "document",
      id: document.id,
      title: document.title ?? document.id,
      meta: getDocumentFileMeta(document),
      status: document.status ?? "record",
      sort: `2-${document.issuedAt ?? 0}-${document.id}`,
    }));

  return [...contractFiles, ...documentFiles].sort((a, b) => a.sort.localeCompare(b.sort));
}

function isDocumentVisibleInDrawer(document) {
  return Boolean(document?.id && document.type && document.status !== "archived");
}

function getDocumentFileMeta(document) {
  if (document.type === "pilot-license") {
    return "pilot authority";
  }

  if (document.type === "ship-title") {
    return "ship title";
  }

  if (document.type === "ship-registration") {
    return "ship registration";
  }

  if (document.type === "lien") {
    return "collateral claim";
  }

  return document.type.replaceAll("-", " ");
}

function getContractFileMeta(contract) {
  if (contract.type === "loan") {
    const balance = contract.balance ?? 0;
    return balance > 0 ? `${balance.toLocaleString()} cr owed` : "paid off";
  }

  if (contract.type === "resource-delivery" || contract.type === "resource-procurement") {
    const resourceLabel = contract.type === "resource-procurement" ? "feedstock equivalents" : contract.terms.resourceName;
    return `${contract.deliveredAmount ?? 0}/${contract.terms.amount ?? 0} ${resourceLabel}`;
  }

  if (contract.type === "bounty") {
    return `${contract.killCount ?? 0}/${contract.terms.amount ?? 0} ${contract.terms.targetName ?? "targets"}`;
  }

  if (contract.type === "cargo-run") {
    return `→ ${contract.terms.destinationName}`;
  }

  if (contract.type === "delivery") {
    return contract.terms.destinationName ?? contract.issuer;
  }

  return contract.issuer;
}

function createResourceBadge(resourceType) {
  const size = 18;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.style.cssText = "display:inline-block;vertical-align:middle;margin-right:5px;";
  const ctx = canvas.getContext("2d");
  const color = getResourceColor(normalizeResourceType(resourceType));
  const shape = getResourceShape(resourceType);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
  ctx.lineWidth = 1.5;
  drawResourceShape(ctx, shape, size * 0.78);
  return canvas;
}

function renderContractTerms(contract) {
  if (contract.type === "permit") {
    const terms = contract.terms;
    contractPrimaryLabel.textContent = "Grants";
    contractVin.textContent = terms.permitType === "zone-flight" ? `Flight rights — ${terms.zoneName}` : `Docking clearance — ${terms.siteName}`;
    contractSecondaryLabel.textContent = "Coverage";
    contractDestination.textContent = terms.permitType === "zone-flight" ? "Permanent zone authorization" : "Registry pre-clearance + beacon";
    contractTertiaryLabel.textContent = "Cost";
    contractReward.textContent = `${(terms.cost ?? 0).toLocaleString()} cr`;
    return;
  }

  if (contract.type === "loan") {
    contractPrimaryLabel.textContent = "Principal";
    contractVin.textContent = `${contract.terms.principal.toLocaleString()} cr`;
    contractSecondaryLabel.textContent = "Term";
    contractDestination.textContent = contract.terms.dueLabel;
    contractTertiaryLabel.textContent = "Interest";
    contractReward.textContent = `${contract.terms.interestRate * 100}% / cap ${contract.terms.maxInterest} cr`;
    return;
  }

  if (contract.type === "resource-delivery") {
    contractPrimaryLabel.textContent = "Resource";
    contractVin.replaceChildren(createResourceBadge(contract.terms.resourceType), `${contract.terms.amount} ${contract.terms.resourceName}`);
    contractSecondaryLabel.textContent = "Destination";
    contractDestination.textContent = contract.terms.sourceClaimIds?.length
      ? `${contract.terms.destinationName} / marked ${contract.terms.sourceClaimLabel ?? "plots"}`
      : contract.terms.destinationName;
    contractTertiaryLabel.textContent = "Reward";
    contractReward.textContent = `${contract.reward.credits ?? 0} cr (${contract.reward.creditsPerUnit} cr/unit)`;
    return;
  }

  if (contract.type === "resource-procurement") {
    const accepted = Object.entries(contract.terms.acceptedMaterials ?? {})
      .map(([materialId, equivalents]) => `${formatResourceName(materialId)} (${equivalents}x)`)
      .join(" or ");
    contractPrimaryLabel.textContent = "Accepted Feedstock";
    contractVin.textContent = accepted || "Structural material";
    contractSecondaryLabel.textContent = "Destination";
    contractDestination.textContent = contract.terms.destinationName ?? "Scrap Porch";
    contractTertiaryLabel.textContent = "Reserved Payment";
    contractReward.textContent = `${contract.reward.credits ?? 0} cr`;
    return;
  }

  if (contract.type === "bounty") {
    contractPrimaryLabel.textContent = "Target";
    contractVin.textContent = `${contract.terms.amount} ${contract.terms.targetName ?? "targets"}`;
    contractSecondaryLabel.textContent = "Reported";
    contractDestination.textContent = [contract.terms.hotspotRange, contract.terms.hotspotBearing ? `to the ${contract.terms.hotspotBearing}` : null]
      .filter(Boolean)
      .join(" ") || contract.terms.destinationName;
    contractTertiaryLabel.textContent = "Reward";
    contractReward.textContent = `${contract.reward.credits ?? 0} cr (${contract.reward.creditsPerUnit} cr/kill)`;
    return;
  }

  if (contract.type === "cargo-run") {
    contractPrimaryLabel.textContent = "Manifest";
    contractVin.textContent = `${contract.terms.amount} ${contract.terms.commodityName ?? "cargo"}`;
    contractSecondaryLabel.textContent = "Destination";
    contractDestination.textContent = [contract.terms.destinationName, contract.terms.destinationBearing ? `(${contract.terms.destinationBearing})` : null]
      .filter(Boolean)
      .join(" ");
    contractTertiaryLabel.textContent = "Reward";
    contractReward.textContent = `${contract.reward.credits ?? 0} cr`;
    return;
  }

  contractPrimaryLabel.textContent = "VIN";
  contractVin.textContent = contract.terms.deliverShipVin;
  contractSecondaryLabel.textContent = "Destination";
  contractDestination.textContent = contract.terms.destinationName;
  contractTertiaryLabel.textContent = "Reward";
  contractReward.textContent = `${contract.reward.credits ?? 0} cr`;
}

function renderContractProgress(contract) {
  if (contract.type === "loan") {
    const balance = contract.balance ?? 0;
    const maxBalance = contract.maxBalance ?? contract.terms.principal ?? 0;
    const progressPercent = maxBalance > 0 ? Math.min(100, (balance / maxBalance) * 100) : 0;

    contractProgress.hidden = false;
    contractProgressLabel.textContent = contract.obligationId ? "Obligation" : "Debt";
    contractProgressCount.textContent = contract.obligationId ? `${balance.toLocaleString()} cr owed` : "not accepted";
    contractProgressFill.style.width = `${progressPercent}%`;
    return;
  }

  if (contract.type === "delivery") {
    const isComplete = contract.status === "fulfilled" || contract.status === "paid";

    contractProgress.hidden = false;
    contractProgressLabel.textContent = "Delivery";
    contractProgressCount.textContent = isComplete ? "confirmed" : "pending";
    contractProgressFill.style.width = isComplete ? "100%" : "0%";
    return;
  }

  if (contract.type === "cargo-run") {
    const isComplete = contract.status === "fulfilled" || contract.status === "paid";
    const loaded = isManifestLoaded(contract);

    contractProgress.hidden = false;
    contractProgressLabel.textContent = "Freight";
    contractProgressCount.textContent = isComplete ? "delivered" : loaded ? "in transit" : "awaiting pickup";
    contractProgressFill.style.width = isComplete ? "100%" : loaded ? "50%" : "0%";
    return;
  }

  if (contract.type === "resource-delivery" || contract.type === "resource-procurement") {
    const requiredAmount = contract.terms.amount ?? 0;
    const deliveredAmount = contract.deliveredAmount ?? 0;
    const progressPercent = requiredAmount > 0 ? Math.min(100, (deliveredAmount / requiredAmount) * 100) : 0;

    contractProgress.hidden = false;
    contractProgressLabel.textContent = contract.type === "resource-procurement" ? "Feedstock" : "Delivered";
    contractProgressCount.textContent = contract.type === "resource-procurement"
      ? `${deliveredAmount} / ${requiredAmount} equivalents`
      : `${deliveredAmount} / ${requiredAmount}`;
    contractProgressFill.style.width = `${progressPercent}%`;
    return;
  }

  if (contract.type === "bounty") {
    const requiredAmount = contract.terms.amount ?? 0;
    const killCount = contract.killCount ?? 0;
    const progressPercent = requiredAmount > 0 ? Math.min(100, (killCount / requiredAmount) * 100) : 0;

    contractProgress.hidden = false;
    contractProgressLabel.textContent = "Cleared";
    contractProgressCount.textContent = `${killCount} / ${requiredAmount}`;
    contractProgressFill.style.width = `${progressPercent}%`;
    return;
  }

  contractProgress.hidden = true;
}

function renderContractPayment(contract) {
  const payment = getMaximumContractPaymentAmount(contract);
  const canShowPayment = canPayLoanContract(contract) || (contract?.type === "loan" && contract.status === "active" && (contract.balance ?? 0) > 0);

  contractPayment.hidden = !canShowPayment;

  if (!canShowPayment) {
    contractPaymentAmount.value = "";
    return;
  }

  contractPaymentAmount.max = String(payment);
  contractPaymentAmount.placeholder = payment > 0 ? String(payment) : "0";
  contractPaymentAmount.disabled = !canPayLoanContract(contract);
  contractPaymentMax.disabled = !canPayLoanContract(contract);

  const currentValue = Number(contractPaymentAmount.value);
  if (!Number.isFinite(currentValue) || currentValue <= 0 || currentValue > payment) {
    contractPaymentAmount.value = payment > 0 ? String(payment) : "";
  }
}

function getContractStatusLabel(status) {
  if (status === "offered") {
    return "offer pending";
  }

  if (status === "active") {
    return "active";
  }

  if (status === "fulfilled") {
    return "ready to complete";
  }

  if (status === "paid") {
    return "paid";
  }

  return status ?? "unknown";
}

function getContractButtonLabel(contract) {
  if (contract.type === "permit" && contract.status === "offered") {
    return getCredits(state) < (contract.terms.cost ?? 0) ? "Can't Afford" : "Purchase Permit";
  }

  if (contract.status === "offered") {
    return "Accept Contract";
  }

  if (contract.status === "fulfilled") {
    return "Complete Contract";
  }

  if (canDepositToContract(contract)) {
    return activeDepositContractId === contract.id ? "Depositing..." : "Deposit Cargo";
  }

  if (canPayLoanContract(contract)) {
    return "Make Payment";
  }

  if (contract.type === "loan" && contract.status === "active" && (contract.balance ?? 0) > 0) {
    return getCredits(state) <= 0 ? "No Credits" : "Visit Finance";
  }

  if ((contract.type === "resource-delivery" || contract.type === "resource-procurement") && contract.status === "active") {
    return "Dock to Deposit";
  }

  if (contract.type === "bounty" && contract.status === "active") {
    return "Hunt in Progress";
  }

  if (contract.type === "cargo-run" && contract.status === "active") {
    if (isCargoLoadable(contract)) {
      return "Load Manifest";
    }
    if (isCargoDeliverable(contract)) {
      return `Unload at ${contract.terms.destinationName}`;
    }
    if (isManifestLoaded(contract)) {
      return `Carrying to ${contract.terms.destinationName}`;
    }
    return `Return to ${contract.terms.originName} to Load`;
  }

  if (contract.status === "active") {
    return "Accepted";
  }

  if (contract.status === "paid") {
    return "Paid";
  }

  return "Closed";
}

function isContractButtonEnabled(contract) {
  if (contract.type === "permit" && contract.status === "offered") {
    return getCredits(state) >= (contract.terms.cost ?? 0);
  }

  return (
    contract.status === "offered" ||
    contract.status === "fulfilled" ||
    canPayLoanContract(contract) ||
    canDepositToContract(contract) ||
    isCargoLoadable(contract) ||
    isCargoDeliverable(contract)
  );
}

function renderContractNavigation(contract = contractManager.getCurrentContract()) {
  const contractIds = contractManager.getVisibleContractIds(currentSiteState?.dockedSite?.id ?? null);
  const currentIndex = contract ? contractIds.indexOf(contract.id) : -1;
  const countLabel = contractIds.length === 1 ? "1 contract" : `${contractIds.length} contracts`;

  contractNavCount.textContent = currentIndex >= 0 ? `${currentIndex + 1}/${contractIds.length} ${countLabel}` : countLabel;
  contractNextButton.disabled = contractIds.length <= 1;
}

function canDepositToContract(contract) {
  const dockedSite = currentSiteState?.dockedSite;

  return Boolean(
    (contract?.type === "resource-delivery" || contract?.type === "resource-procurement") &&
      contract.status === "active" &&
      dockedSite &&
      dockedSite.id === contract.terms.destinationSiteId &&
      (contract.deliveredAmount ?? 0) < (contract.terms.amount ?? 0),
  );
}

// A cargo run's manifest rides in the hold as a single sealed container, keyed
// by contract id so it survives save/reload (only the unit `type` persists) and
// never merges with another run's freight.
const MANIFEST_CONTAINER_COLOR = "#d8b24a"; // warm courier gold, distinct from ore
const MANIFEST_CONTAINER_SIZE = 34; // between a single unit (22) and a stack (~37): reads as a crate

function getManifestUnitType(contractId) {
  return `manifest:${contractId}`;
}

function isManifestLoaded(contract) {
  return (cargoHold.getUnitCounts()[getManifestUnitType(contract.id)] ?? 0) > 0;
}

function isCargoLoadable(contract) {
  return Boolean(
    contract?.type === "cargo-run" &&
      contract.status === "active" &&
      currentSiteState?.dockedSite?.id === contract.terms.originSiteId &&
      !isManifestLoaded(contract),
  );
}

function isCargoDeliverable(contract) {
  return Boolean(
    contract?.type === "cargo-run" &&
      contract.status === "active" &&
      currentSiteState?.dockedSite?.id === contract.terms.destinationSiteId &&
      isManifestLoaded(contract),
  );
}

function loadCargoManifest(contract) {
  if (!isCargoLoadable(contract)) {
    return;
  }

  if (contract.terms?.standingFreightTemplateId && !logisticsManager.loadPlayerContract(contract.id)) return;
  const unitType = getManifestUnitType(contract.id);
  cargoHold.addUnit(unitType, {
    quantity: 1,
    tradeValue: 0, // sealed freight: not sellable, not refinable
    label: `${contract.terms.amount} ${contract.terms.commodityName}`,
    color: MANIFEST_CONTAINER_COLOR,
    shape: "square",
    size: MANIFEST_CONTAINER_SIZE,
  });
  setComponentAvailable("cargo", true);
  game.createCargoTransferTrail({
    type: contract.terms.commodity,
    color: getResourceColor(contract.terms.commodity),
    shape: getResourceShape(contract.terms.commodity),
  }, "from-hub");
  state.ledger.recordEvent(
    "cargo.manifestLoaded",
    { contractId: contract.id, contractTitle: contract.title, originSiteId: contract.terms.originSiteId, commodity: contract.terms.commodityName },
    { visible: true },
  );
  renderContract();
  updateHudDisplay();
  scheduleSave();
}

function deliverCargoManifest(contract) {
  if (!isCargoDeliverable(contract)) {
    return;
  }

  if (contract.terms?.standingFreightTemplateId && !logisticsManager.deliverPlayerContract(contract.id)) return;
  const unitType = getManifestUnitType(contract.id);
  cargoHold.removeUnits(unitType, 1);
  game.createCargoTransferTrail({
    type: contract.terms.commodity,
    color: getResourceColor(contract.terms.commodity),
    shape: getResourceShape(contract.terms.commodity),
  }, "to-hub");
  contractManager.deliverCargoRun(contract.id, currentSiteState?.dockedSite?.id);
  renderContract();
  updateHudDisplay();
  game.updateSiteReadout();
  scheduleSave();
}

function canPayLoanContract(contract) {
  const dockedSite = currentSiteState?.dockedSite;
  const service = dockedSite && activeHubServiceId ? getHubService(dockedSite.id, activeHubServiceId) : null;

  return Boolean(
    contract?.type === "loan" &&
      contract.status === "active" &&
      (contract.balance ?? 0) > 0 &&
      service?.id === yardExchangeServices.finance &&
      getCredits(state) > 0,
  );
}

function getMaximumContractPaymentAmount(contract) {
  if (!contract || contract.type !== "loan") {
    return 0;
  }

  return Math.floor(Math.min(contract.balance ?? 0, Math.max(0, getCredits(state))));
}

function getRequestedContractPaymentAmount(contract) {
  const requested = Math.floor(Number(contractPaymentAmount.value));
  const maximum = getMaximumContractPaymentAmount(contract);

  if (!Number.isFinite(requested) || requested <= 0) {
    return maximum;
  }

  return Math.min(requested, maximum);
}

function updateCargoTargetDisplay() {
  const contract = contractManager.getCurrentContract();
  const isActiveDepositTarget = activeDepositContractId && contract?.id === activeDepositContractId && canDepositToContract(contract);

  cargoPanel.classList.toggle("is-deposit-target", Boolean(isActiveDepositTarget) && !isCargoSellModeActive);
  cargoPanel.classList.toggle("is-sell-target", isCargoSellModeActive);
}

function getViewportLocationLabel(debug) {
  const zone = debug.zoneProfile;
  const isInsideStarterRegion = zone.influence > 0;
  const parts = [isInsideStarterRegion ? STARTER_REGION_NAME : DEEP_SPACE_REGION_NAME];

  if (zone.influence >= 0.55 && zone.strongestZoneId !== "open-space") {
    parts.push(zone.strongestZoneName);
  }

  if (debug.currentSite) {
    parts.push(debug.currentSite.name);
  }

  return parts.join(" > ");
}

function updateWarningPanels() {
  COMPONENT_WARNING_RULES.forEach((rule) => {
    let level = getPanelAlertLevel(rule.getValue(), rule);
    if (rule.panelId === "engine") {
      // Engine warning is the worse of low fuel and engine-condition stage, so a
      // fault glows even on a full tank.
      level = worseAlertLevel(level, engineConditionAlertLevel());
    }
    setPanelAlert(rule.panelId, level);
  });
}

function engineConditionAlertLevel() {
  const stage = state.components.engine.condition?.stage ?? "healthy";
  if (stage === "emergency" || stage === "failed") {
    return "critical";
  }
  if (stage === "degraded") {
    return "caution";
  }
  return "none";
}

function worseAlertLevel(first, second) {
  const order = { none: 0, caution: 1, critical: 2 };
  return (order[first] ?? 0) >= (order[second] ?? 0) ? first : second;
}

function getPanelAlertLevel(value, rule) {
  if (value <= rule.criticalAt) {
    return "critical";
  }

  if (value <= rule.cautionAt) {
    return "caution";
  }

  return "none";
}

function setPanelAlert(panelId, level) {
  const panel = document.querySelector(`[data-panel-id="${panelId}"]`);

  if (!panel) {
    return;
  }

  panel.classList.toggle("is-caution-resource", level === "caution");
  panel.classList.toggle("is-low-resource", level === "critical");
}

function requestAttention({ targetId = null, targetType = null, panelId = null, siteId = null, serviceId = null, mode = "once", reason = "general", label = null }) {
  const resolvedTargetId = targetId ?? getAttentionTarget({ targetType, panelId, siteId, serviceId });

  if (!resolvedTargetId) {
    return;
  }

  if (mode === "once") {
    const element = findAttentionElement(resolvedTargetId);
    playAttentionOnce(element);
    return;
  }

  state.ui.attention.targets[resolvedTargetId] = {
    mode,
    reason,
    label,
    requestedAt: Date.now(),
  };
  hubServiceMenu.dataset.renderedKey = "";
}

function clearAttention(targetId) {
  if (!targetId || !state.ui.attention.targets[targetId]) {
    return;
  }

  delete state.ui.attention.targets[targetId];
  hubServiceMenu.dataset.renderedKey = "";
}

function hasAttention(targetId) {
  return Boolean(targetId && state.ui.attention.targets[targetId]);
}

function getHubServiceAttentionTarget(siteId, serviceId) {
  return `hub-service:${siteId}:${serviceId}`;
}

function getPanelAttentionTarget(panelId) {
  return `panel:${panelId}`;
}

function getAttentionTarget({ targetType, panelId, siteId, serviceId }) {
  if (targetType === "panel" && panelId) {
    return getPanelAttentionTarget(panelId);
  }

  if (targetType === "hub-service" && siteId && serviceId) {
    return getHubServiceAttentionTarget(siteId, serviceId);
  }

  return null;
}

function findAttentionElement(targetId) {
  if (targetId.startsWith("panel:")) {
    return document.querySelector(`[data-panel-id="${targetId.slice("panel:".length)}"]`);
  }

  if (targetId.startsWith("hub-service:")) {
    const [, siteId, serviceId] = targetId.split(":");
    if (currentSiteState?.dockedSite?.id !== siteId) {
      return null;
    }
    return hubServiceMenu.querySelector(`[data-service-id="${serviceId}"]`);
  }

  if (targetId.startsWith("element:")) {
    return document.getElementById(targetId.slice("element:".length));
  }

  return null;
}

function playAttentionOnce(element) {
  if (!element) {
    return;
  }

  element.classList.remove("needs-attention-once");
  void element.offsetWidth;
  element.classList.add("needs-attention-once");
  window.setTimeout(() => element.classList.remove("needs-attention-once"), ATTENTION_ONCE_MS);
}

function updateAttentionCallouts() {
  if (!attentionCalloutLayer) {
    return;
  }

  const activeTargetIds = new Set();

  Object.entries(state.ui.attention.targets).forEach(([targetId, target]) => {
    if (!target.label) {
      return;
    }

    const element = findAttentionElement(targetId);

    if (!element || element.offsetParent === null) {
      return;
    }

    activeTargetIds.add(targetId);
    positionAttentionCallout(targetId, target.label, element);
  });

  attentionCalloutLayer.querySelectorAll("[data-callout-target]").forEach((node) => {
    if (!activeTargetIds.has(node.dataset.calloutTarget)) {
      node.remove();
    }
  });
}

function positionAttentionCallout(targetId, label, element) {
  let callout = attentionCalloutLayer.querySelector(`[data-callout-target="${CSS.escape(targetId)}"]`);

  if (!callout) {
    callout = document.createElement("div");
    callout.className = "attention-callout";
    callout.dataset.calloutTarget = targetId;
    const arrow = document.createElement("span");
    arrow.className = "attention-callout-arrow";
    arrow.textContent = "▾";
    const text = document.createElement("span");
    text.className = "attention-callout-label";
    callout.append(arrow, text);
    attentionCalloutLayer.append(callout);
  }

  const labelNode = callout.querySelector(".attention-callout-label");
  if (labelNode.textContent !== label) {
    labelNode.textContent = label;
  }

  const rect = element.getBoundingClientRect();
  callout.style.left = `${rect.left + rect.width / 2}px`;
  callout.style.top = `${rect.top - 26}px`;
}

function setPanelHidden(panel, isHidden) {
  panel.classList.toggle("is-panel-hidden", isHidden);
}

function isPanelHidden(panel) {
  return panel.classList.contains("is-panel-hidden");
}

function setComponentAvailable(componentId, isAvailable = true) {
  if (!state.ui.panels[componentId]) {
    state.ui.panels[componentId] = { available: false };
  }

  state.ui.panels[componentId].available = isAvailable;
  const panel = document.querySelector(`[data-panel-id="${componentId}"]`);

  if (panel) {
    if (panel.closest("#paperwork-drawer")) {
      if (isAvailable) {
        const wasLocked = panel.classList.contains("is-component-locked");
        panel.classList.remove("is-component-locked");
        if (wasLocked) playPanelReveal(panel);
      }
      return;
    }

    const wasLocked = panel.classList.contains("is-component-locked");
    panel.classList.toggle("is-component-locked", !isAvailable);

    if (isAvailable && wasLocked) {
      positionPanelById(componentId);
      bringPanelToFront(panel);
      playPanelReveal(panel);
    }
  }
}

function setInitialPaperworkLocations() {
  const hud = document.querySelector(".hud");
  const licensePanel = document.querySelector('[data-panel-id="license"]');

  if (hud && licensePanel && licensePanel.closest("#paperwork-drawer")) {
    hud.appendChild(licensePanel);
  }
}

function setupPaperworkControls() {
  PAPERWORK_PANEL_IDS.forEach((panelId) => {
    const panel = document.querySelector(`[data-panel-id="${panelId}"]`);
    const title = panel?.querySelector(".component-panel-title");

    if (!panel || !title || title.querySelector(".paper-file-button")) {
      return;
    }

    const button = document.createElement("button");
    button.className = "paper-file-button";
    button.type = "button";
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      if (!canMovePaperPanel(panelId)) {
        return;
      }

      if (panel.closest("#paperwork-drawer")) {
        movePaperPanelToDesk(panelId);
      } else {
        movePaperPanelToDrawer(panelId);
      }

      updatePaperworkControlLabels();
    });
    title.append(button);
  });

  updatePaperworkControlLabels();
}

function updatePaperworkControlLabels() {
  PAPERWORK_PANEL_IDS.forEach((panelId) => {
    const panel = document.querySelector(`[data-panel-id="${panelId}"]`);
    const button = panel?.querySelector(".paper-file-button");
    const isInDrawer = Boolean(panel?.closest("#paperwork-drawer"));

    if (!button) {
      return;
    }

    button.disabled = !canMovePaperPanel(panelId);
    button.hidden = !state.ui.paperwork?.filingIntroduced;
    button.textContent = isInDrawer ? "Desk" : "File";
    button.title = button.disabled
      ? panelId === "contract" && contractManager.getCurrentContract()?.status === "offered"
        ? "Accept this contract before filing it"
        : "No contract selected"
      : isInDrawer
        ? "Move paperwork to the desktop"
        : "File paperwork in the drawer";
    button.setAttribute("aria-label", button.title);
  });
}

function canMovePaperPanel(panelId) {
  if (panelId !== "contract") {
    return true;
  }

  const contract = contractManager.getCurrentContract();
  return Boolean(contract && contract.status !== "offered");
}

function focusPanelById(panelId) {
  const panel = document.querySelector(`[data-panel-id="${panelId}"]`);

  if (panel) {
    bringPanelToFront(panel);
  }
}

function renderJourney(journey = state.journey) {
  const latestMessage = journey.messages.at(-1) ?? null;
  const speaker = latestMessage?.speaker ?? "Journey";
  const isOpen = Boolean(latestMessage || journey.pendingAcknowledgement || journey.mission?.status === "offered");

  journeyChapter.textContent = journey.chapterName ?? "Chapter 1";
  journeyStatus.textContent = journey.episodeName ?? "The Interview";
  journeyMissionTitle.textContent = journey.mission?.title ?? "Journey";
  journeyMissionObjective.textContent = journey.mission?.objective ?? "Awaiting instructions.";
  journeyHelpText.textContent = journey.mission?.helpText ?? "Read the current objective and follow the next prompt.";
  journeyAcceptButton.hidden = !journey.pendingAcknowledgement && journey.mission?.status !== "offered";
  journeyAcceptButton.textContent = journey.pendingAcknowledgement?.label ?? journey.mission?.actionLabel ?? "Accept Job";

  if (journeyDeclineButton) {
    journeyDeclineButton.hidden = !journey.pendingAcknowledgement?.decline;
    journeyDeclineButton.textContent = journey.pendingAcknowledgement?.decline?.label ?? "Not Yet";
  }

  const panoramaLink = document.querySelector("#journey-panorama-link");
  if (panoramaLink) {
    panoramaLink.hidden = journey.mission?.status !== "offered";
  }

  const isTrafficCheck = journey.currentStepId === "yard-traffic-check";
  const vinNeedsAttention = isTrafficCheck && !journey.flags?.yardVinPresented;
  const licenseNeedsAttention = isTrafficCheck && !journey.flags?.yardLicensePresented;

  hullVin.classList.toggle("needs-id-attention", vinNeedsAttention);
  licenseIdDisplay.classList.toggle("needs-id-attention", licenseNeedsAttention);

  if (vinNeedsAttention) {
    requestAttention({ targetId: "element:hull-vin", mode: "until-clicked", reason: "identity-check", label: "Show VIN" });
  } else {
    clearAttention("element:hull-vin");
  }

  if (licenseNeedsAttention) {
    requestAttention({ targetId: "element:license-id", mode: "until-clicked", reason: "identity-check", label: "Show License" });
  } else {
    clearAttention("element:license-id");
  }
  const identityReady = canPresentIdentityDocuments();
  hullVin.disabled = !identityReady;
  licenseIdDisplay.disabled = !identityReady;
  journeyPanel?.classList.toggle("is-journey-open", isOpen);
  journeyPanel?.classList.toggle("is-journey-speaking", Boolean(latestMessage));
  journeyPanel?.setAttribute("data-speaker", normalizeSpeakerKey(speaker));

  if (journeyPortraitArt) {
    journeyPortraitArt.textContent = getSpeakerPortrait(speaker);
  }

  const currentMessageId = latestMessage?.id ?? null;
  if (currentMessageId !== _renderedMessageId) {
    _renderedMessageId = currentMessageId;
    clearJourneyTypeTimers();
    journeyLog.replaceChildren(
      ...journey.messages.slice(-1).map((message) => {
        const line = document.createElement("div");
        const speaker = document.createElement("strong");
        const text = document.createElement("span");

        line.className = "journey-line";
        speaker.textContent = message.speaker;
        text.className = "journey-line-text";
        text.dataset.speaker = message.speaker;
        typeJourneyText(text, message.text);
        line.append(speaker, text);
        return line;
      }),
    );
    playJourneyUpdate();
  }
  renderObjectives(state);
}

function renderObjectives(state) {
  const el = document.getElementById("current-objectives");
  if (!el) return;

  const mission = state.journey?.mission;
  const flags = state.journey?.flags ?? {};
  const contracts = Object.values(state.contracts?.records ?? {});
  const obligations = Object.values(state.obligations?.records ?? {});
  const now = Date.now();
  const previousItems = readObjectiveDataset(el, "objectiveItems", []);
  const carriedCompletions = readObjectiveDataset(el, "completedObjectives", [])
    .filter((item) => item.expiresAt > now);

  // Track which flags have already played their flash so we only animate once.
  const flashed = new Set(JSON.parse(el.dataset.flashedFlags ?? "[]"));
  const sectionMap = new Map();
  const activeItems = [];
  const previousOrderByKey = new Map(previousItems.map((item) => [item.key, item.order ?? 0]));
  let objectiveOrder = previousItems.reduce((max, item) => Math.max(max, item.order ?? 0), -1) + 1;

  function addObjective(section, item) {
    const flashKey = `objective:${item.key}`;
    const shouldFlash = Boolean(item.flash) && !flashed.has(flashKey);
    if (shouldFlash) flashed.add(flashKey);
    const order = previousOrderByKey.has(item.key)
      ? previousOrderByKey.get(item.key)
      : objectiveOrder++;
    const objective = {
      key: item.key,
      label: item.label,
      section,
      done: Boolean(item.done),
      flash: shouldFlash,
      order,
    };
    activeItems.push(objective);
    if (!sectionMap.has(section)) sectionMap.set(section, []);
    sectionMap.get(section).push(objective);
  }

  const tasks = mission?.tasks ?? [];
  if (tasks.length > 0 && mission?.status === "active") {
    tasks.forEach((task) => {
      const done = Boolean(flags[task.flag]);
      const justDone = done && !flashed.has(task.flag);
      if (justDone) flashed.add(task.flag);
      addObjective("Tasks", {
        key: `mission:${mission.id ?? "active"}:${task.flag}`,
        label: task.label,
        done,
        flash: justDone,
      });
    });
  }

  const activeContracts = contracts.filter((c) => c.status === "active" || c.status === "fulfilled");
  activeContracts.forEach((c) => {
    let label;
    if (c.status === "fulfilled") {
      label = `Collect payment from ${c.issuer ?? "contractor"}`;
    } else if (c.type === "resource-delivery" || c.type === "resource-procurement") {
      const delivered = c.deliveredAmount ?? 0;
      const required = c.terms?.amount ?? 0;
      const resource = c.type === "resource-procurement" ? "feedstock equivalents" : c.terms?.resourceName ?? c.terms?.resourceType ?? "cargo";
      label = `Deliver ${delivered}/${required} ${resource}`;
    } else {
      label = c.summary ?? c.title ?? c.id;
    }
    addObjective("Contracts", {
      key: `contract:${c.id}`,
      label,
    });
  });

  const activeObligations = obligations.filter((o) => o.status === "active" && (o.balance ?? 0) > 0);
  activeObligations.forEach((o) => {
    addObjective("Obligations", {
      key: `obligation:${o.id}`,
      label: `${o.title}: ${Math.ceil(o.balance).toLocaleString()} cr`,
    });
  });

  // Interrupters render after the standard Tasks / Contracts / Obligations stack.
  const patrol = game?.activePatrolIntercept;
  if (patrol && (patrol.phase === "standoff" || patrol.phase === "approach" || patrol.phase === "hold")) {
    const siteName = patrol.site?.name ?? "Hub";
    const flagged = patrol.hasScanned && patrol.flaggedDismissTimer > 0;
    const reasons = patrol.flaggedReasons ?? [];

    if (flagged) {
      const docTasks = [];
      if (reasons.includes("missing-vin")) docTasks.push("Attach ship VIN plate");
      if (reasons.includes("missing-pilot-license")) docTasks.push("Obtain a pilot license");
      if (reasons.includes("unauthorized-zone-history")) docTasks.push("Resolve zone violation on record");
      if (docTasks.length === 0) docTasks.push("Resolve documentation issue");
      docTasks.forEach((label) => addObjective(`Patrol Check - ${siteName}`, {
        key: `patrol:${patrol.site?.id ?? "hub"}:flagged:${label}`,
        label,
      }));
    } else if (patrol.hasScanned) {
      const presented = pendingHubIdentityPresentations.get(patrol.site?.id)?.kinds ?? new Set();
      const vinDone = presented.has("ship-vin");
      const licDone = presented.has("pilot-license");
      addObjective(`Patrol Check - ${siteName}`, {
        key: `patrol:${patrol.site?.id ?? "hub"}:present-vin`,
        label: "Present ship VIN",
        done: vinDone,
        flash: vinDone,
      });
      addObjective(`Patrol Check - ${siteName}`, {
        key: `patrol:${patrol.site?.id ?? "hub"}:present-license`,
        label: "Present pilot authorization",
        done: licDone,
        flash: licDone,
      });
    } else {
      addObjective(`Patrol Check - ${siteName}`, {
        key: `patrol:${patrol.site?.id ?? "hub"}:hold`,
        label: "Hold position - identity check in progress",
      });
    }
  }

  const activeKeys = new Set(activeItems.map((item) => item.key));
  const completionsByKey = new Map(carriedCompletions.map((item) => [item.key, item]));
  previousItems.forEach((item) => {
    if (!item.done && !activeKeys.has(item.key) && !completionsByKey.has(item.key)) {
      completionsByKey.set(item.key, {
        ...item,
        done: true,
        flash: true,
        expiresAt: now + 1300,
      });
    }
  });

  [...completionsByKey.values()]
    .filter((item) => !activeKeys.has(item.key))
    .forEach((item) => {
      if (!sectionMap.has(item.section)) sectionMap.set(item.section, []);
      sectionMap.get(item.section).push({ ...item, done: true, flash: true, retiring: true, order: item.order ?? -1 });
    });

  if (sectionMap.size === 0) {
    el.hidden = true;
    el.dataset.flashedFlags = "[]";
    el.dataset.objectiveItems = "[]";
    el.dataset.completedObjectives = "[]";
    return;
  }

  el.hidden = false;
  el.innerHTML = [...sectionMap.entries()]
    .map(([label, items]) => {
      const renderedItems = items
        .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(renderObjectiveItem)
        .join("");
      return `<p class="obj-section-label">${escapeHtml(label)}</p><ul class="obj-list">${renderedItems}</ul>`;
    })
    .join("");
  el.dataset.flashedFlags = JSON.stringify([...flashed]);
  el.dataset.objectiveItems = JSON.stringify(activeItems.map(({ key, label, section, done, order }) => ({ key, label, section, done, order })));
  const activeCompletions = [...completionsByKey.values()].filter((item) => item.expiresAt > now);
  el.dataset.completedObjectives = JSON.stringify(activeCompletions);
  scheduleObjectiveCleanup(el, state, activeCompletions);
}

function renderObjectiveItem(item) {
  const classes = ["obj-task"];
  if (item.done) classes.push(item.retiring ? "obj-done" : "obj-done-active");
  if (item.flash) classes.push(item.retiring ? "obj-flash-retiring" : "obj-flash");
  return `<li class="${classes.join(" ")}"><span>${escapeHtml(item.label)}</span></li>`;
}

function readObjectiveDataset(el, key, fallback) {
  try {
    return JSON.parse(el.dataset[key] ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function scheduleObjectiveCleanup(el, state, completions) {
  if (completions.length === 0) {
    el.dataset.cleanupAt = "";
    return;
  }

  const cleanupAt = Math.min(...completions.map((item) => item.expiresAt));
  if (el.dataset.cleanupAt === String(cleanupAt)) return;

  el.dataset.cleanupAt = String(cleanupAt);
  setTimeout(() => {
    if (el.dataset.cleanupAt === String(cleanupAt)) {
      renderObjectives(state);
    }
  }, Math.max(0, cleanupAt - Date.now()) + 40);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function normalizeSpeakerKey(speaker = "") {
  return speaker.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "journey";
}

function getSpeakerPortrait(speaker = "") {
  const key = normalizeSpeakerKey(speaker);

  if (key.includes("rook")) {
    return String.raw`        .-""""-.
     .-'  _  _  '-.
    /   / \/ \     \
   |   |  o  o |    |
   |   |   __  |    |
    \   \ '--' /   /
     '._ '-..-' _.'
        /| R |\
      _/ |___| \_
     /__/|___|__/
       /_/ \_/`;
  }

  if (key.includes("galaxy") || key.includes("storm")) {
    return String.raw`      .-._.-.
   .-'  . .  '-.
  /   *  ___  * \
 |  *   /___\   |
 | .   /  |  \  .
  \  * \_____/ /
   '-.  . .  .'
      '-._.-'`;
  }

  if (key.includes("barvis")) {
    return String.raw`      ______
   .-'  B  '-.
  /  _      _  \
 |  (_)    (_)  |
 |      __      |
  \   .'__'.   /
   '-.______.-'
      /_||_/
      /_||_/`;
  }

  if (key.includes("mako") || key.includes("finance")) {
    return String.raw`     [ M A K O ]
    .----------.
   /  []    []  \
  |      /\      |
  |   .------.   |
   \  '------'  /
    '----------'
       /____/
       \____/`;
  }

  if (key.includes("jax") || key.includes("tow") || key.includes("cable")) {
    return String.raw`       _______
    .-' JAX '-.
   /  _      _  \
  |  /_\    /_\  |
  |      ==      |
   \   \____/   /
    '---.  .---'
        |__|`;
  }

  if (key.includes("murmur")) {
    return String.raw`     /\_/\_/\ 
   .'  . .  '.
  /   (___)   \
 |   .-...-.   |
  \  '-----'  /
   '._\___/_.'
      /###/
      \###/`;
  }

  return String.raw`      .----.
   .-'      '-.
  /   .--.     \
 |   ( .. )     |
 |    '--'      |
  \            /
   '._    _.'
      |__|`;
}

function playPanelReveal(panel) {
  panel.classList.remove("is-component-revealed");
  void panel.offsetWidth;
  panel.classList.add("is-component-revealed");
  playAttentionOnce(panel);
  audio.playPanelReveal();
}

function playJourneyUpdate() {
  const animatedNodes = [journeyLog, journeyMissionTitle, journeyMissionObjective, journeyAcceptButton];

  animatedNodes.forEach((node) => {
    node.classList.remove("is-journey-updated");
    void node.offsetWidth;
    node.classList.add("is-journey-updated");
  });
}

function wirePanelControlSounds() {
  document.addEventListener(
    "click",
    (event) => {
      const control = event.target.closest("button, input, label, summary, select, textarea, [role='button']");
      const panel = event.target.closest(".component-panel");

      if (!panel || !control || control.closest(".component-panel-title") || isDisabledControl(control)) {
        return;
      }

      audio.playUiClick();
    },
    true,
  );
}

function getIdentityPresentationSite() {
  const hubSite = currentSiteState?.nearbySite?.type === "hub"
    ? currentSiteState.nearbySite
    : currentSiteState?.dockedSite?.type === "hub"
      ? currentSiteState.dockedSite
      : null;
  return hubSite ?? game.activePatrolIntercept?.site ?? null;
}

function canPresentIdentityDocuments() {
  const site = getIdentityPresentationSite();
  return site ? pendingHubIdentityPresentations.has(site.id) : false;
}

function presentIdentityDocument(documentKind, payload = {}) {
  const site = getIdentityPresentationSite();

  state.ledger.recordEvent(
    "authority.documentPresented",
    {
      documentKind,
      siteId: site?.id ?? null,
      siteName: site?.name ?? null,
      ...payload,
    },
    { visible: false },
  );

  // Process immediately so mission flags and comms update in the same tick as
  // the click, rather than waiting up to 50ms for the next logic accumulator fire.
  updateLedgerDrivenSystems();
  updateHudDisplay();
}

function wireAudioUnlockGestures() {
  const unlockOnce = () => audio.unlock();
  document.addEventListener("pointerdown", unlockOnce, { once: true, capture: true });
  document.addEventListener("keydown", unlockOnce, { once: true, capture: true });
}

function isDisabledControl(control) {
  if (control.disabled || control.getAttribute("aria-disabled") === "true") {
    return true;
  }

  const nestedControl = control.querySelector?.("button, input, select, textarea");

  return Boolean(nestedControl?.disabled || nestedControl?.getAttribute("aria-disabled") === "true");
}

function typeJourneyText(element, fullText) {
  clearJourneyTypeTimers();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = fullText;
    return;
  }

  const words = fullText.split(" ");
  element.textContent = "";

  words.forEach((word, index) => {
      const timer = window.setTimeout(() => {
        element.textContent += `${index === 0 ? "" : " "}${word}`;
        audio.chatter(element.dataset.speaker, index);
      }, index * JOURNEY_WORD_DELAY_MS);

    journeyTypeTimers.push(timer);
  });
}

function clearJourneyTypeTimers() {
  journeyTypeTimers.forEach((timer) => window.clearTimeout(timer));
  journeyTypeTimers = [];
}

function setTractorFieldActive(isActive) {
  if (state.components.collector.isActive === isActive) {
    return;
  }

  state.components.collector.isActive = isActive;
  updateHudDisplay();
}

function setShieldActive(isActive) {
  const shield = state.components.shield;
  if (shield.isActive === isActive) {
    return;
  }

  shield.isActive = isActive;
  updateHudDisplay();
}

function wireTowCableHoldButton(button, control) {
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    game.setTowCableControl(control);
    updateHudDisplay();
  });

  button.addEventListener("pointerup", (event) => {
    if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }

    game.setTowCableControl("hold");
    updateHudDisplay();
    button.blur();
  });

  button.addEventListener("click", (event) => event.preventDefault());
  button.addEventListener("pointercancel", () => {
    game.setTowCableControl("hold");
    updateHudDisplay();
  });
  button.addEventListener("lostpointercapture", () => {
    game.setTowCableControl("hold");
    updateHudDisplay();
  });
}

function fireMossSeederFromCargo() {
  const removedUnits = cargoHold.removeUnits(ROCKMOSS_CRAWLER_RESOURCE, 1);

  if (removedUnits.length === 0) {
    game.setMossSeederStatus("No crawler cargo");
    return false;
  }

  const fired = game.fireMossSeeder(getResourceUnitMetadata(removedUnits[0]));

  if (!fired) {
    cargoHold.addUnit(ROCKMOSS_CRAWLER_RESOURCE, getResourceUnitMetadata(removedUnits[0]));
    game.setMossSeederStatus("Seeder offline");
    return false;
  }

  return true;
}

// Remaining capacity for a processor output's destination tank. Cargo has no
// cap (Infinity), so it always accepts.
function getProcessorOutputHeadroom(output) {
  const components = state.components;

  if (output === "fuel") {
    return components.engine.maxFuel - components.engine.fuel;
  }
  if (output === "ammo") {
    return components.miner.maxAmmo - components.miner.ammo;
  }
  if (output === "scanergy") {
    return components.scanner.maxScanergy - components.scanner.scanergy;
  }
  if (output === "hull-repair") {
    return (components.hull.maxRepairReserve ?? 0) - (components.hull.repairReserve ?? 0);
  }

  return Infinity;
}

function processUnit(type, unit = {}) {
  const output = getSelectedProcessorOutput();
  const quantity = unit.quantity ?? 1;
  const amount = getResourceProcessValue(type, output);
  const totalAmount = amount * quantity;

  if (amount <= 0) {
    state.ledger.recordEvent("resource.processingRejected", {
      resourceType: type,
      output,
      reason: "incompatible-resource-output",
    }, { visible: false });
    return false;
  }

  // Don't let the player feed a resource into an already-full tank — the unit
  // stays in the processor instead of being consumed for nothing.
  if (getProcessorOutputHeadroom(output) <= 0) {
    state.ledger.recordEvent("resource.processingRejected", {
      resourceType: type,
      output,
      reason: "output-full",
    }, { visible: false });
    return false;
  }

  state.components.processor.output = output;
  audio.playCargoTransfer(type);
  state.ledger.recordEvent("resource.processed", {
    resourceType: type,
    output,
    amount: output === "cargo" ? quantity : totalAmount,
    quantity,
  });

  if (output === "fuel") {
    const engine = state.components.engine;
    engine.fuel = addToTank(engine.fuel, totalAmount, engine.maxFuel);
  } else if (output === "ammo") {
    const miner = state.components.miner;
    miner.ammo = addToTank(miner.ammo, totalAmount, miner.maxAmmo);
  } else if (output === "scanergy") {
    const scanner = state.components.scanner;
    scanner.scanergy = addToTank(scanner.scanergy, totalAmount, scanner.maxScanergy);
  } else if (output === "hull-repair") {
    const hull = state.components.hull;
    hull.repairReserve = addToTank(hull.repairReserve ?? 0, totalAmount, hull.maxRepairReserve);
  } else if (output === "cargo") {
    cargoHold.addUnit(type, { ...getResourceUnitMetadata(unit), quantity });
  }

  updateHudDisplay();
  game.updateSiteReadout();
}

function receiveCollectedResource(resource) {
  const type = typeof resource === "string" ? resource : resource.type;
  const metadata = getResourceUnitMetadata(resource);

  if (state.components.processor.installed) {
    processor.addUnit(type, metadata);
    return;
  }

  if (state.components.cargoHold.installed) {
    cargoHold.addUnit(type, metadata);
  }
}

function getResourceUnitMetadata(resource = {}) {
  if (!resource || typeof resource === "string") {
    return {};
  }

  return {
    sourceClaimId: resource.sourceClaimId ?? null,
    sourceClaimName: resource.sourceClaimName ?? null,
    tradeValue: resource.tradeValue ?? null,
    label: resource.label ?? null,
    quantity: resource.quantity ?? 1,
    strain: resource.strain ?? null,
  };
}

function handleCargoUnitClick(type, unit) {
  if (isCargoSellModeActive) {
    return sellCargoUnit(type, unit);
  }

  return depositCargoUnit(type, unit);
}

function getOreUnitValue(type) {
  const service = currentSiteState?.dockedSite && activeHubServiceId
    ? getHubService(currentSiteState.dockedSite.id, activeHubServiceId)
    : null;
  const normalized = normalizeResourceType(type);
  return service?.oreValues?.[normalized]
    ?? service?.oreValues?.[type]
    ?? getResourceTradeValue(normalized)
    ?? 0;
}

function getCargoUnitValue(type, unit = {}) {
  return unit.tradeValue ?? getOreUnitValue(type);
}

function sellCargoUnit(type, unit = {}) {
  const unitValue = getCargoUnitValue(type, unit);
  const quantity = unit.quantity ?? 1;

  if (!isCargoSellModeActive || !currentSiteState?.dockedSite || unitValue <= 0) {
    return false;
  }

  const creditsEarned = unitValue * quantity;
  depositCredits(state, creditsEarned);
  state.ledger.recordEvent("cargo.sold", { creditsEarned, units: { [type]: quantity }, totalUnits: quantity }, { visible: false });
  game.createCargoTransferTrail({ type, color: unit.color, shape: unit.shape, size: unit.size }, "to-hub");
  renderFinleyPanel();
  updateHudDisplay();
  game.updateSiteReadout();
  return true;
}

function renderFinleyPanel(siteState = currentSiteState) {
  if (finleyPanel.classList.contains("is-component-locked")) {
    return;
  }

  const site = siteState?.dockedSite;
  const service = site && activeHubServiceId ? getHubService(site.id, activeHubServiceId) : null;
  const prices = service?.supplyPrices ?? {};

  if (supplyPanelNpc) supplyPanelNpc.textContent = service?.npcName ?? "Supply";
  if (supplyPanelOrg) supplyPanelOrg.textContent = service?.organization ?? "Supply Window";
  const engine = state.components.engine;
  const miner = state.components.miner;
  const scanner = state.components.scanner;
  const hull = state.components.hull;
  const credits = getCredits(state);
  const repairCost = siteState?.repairCost ?? 0;
  const canRepair = siteState?.canRepair && hull.integrity < hull.maxIntegrity && credits >= repairCost;
  const fuelNeeded = Math.max(0, engine.maxFuel - engine.fuel);
  const fuelCost = Math.ceil(fuelNeeded * (prices.fuelPerUnit ?? 2));
  const canFuel = fuelNeeded > 0 && credits >= fuelCost;
  const chargesNeeded = Math.max(0, miner.maxAmmo - miner.ammo);
  const chargesCost = Math.ceil(chargesNeeded * (prices.chargePerUnit ?? 3));
  const canCharges = chargesNeeded > 0 && credits >= chargesCost;
  const scanNeeded = Math.max(0, scanner.maxScanergy - scanner.scanergy);
  const scanCost = Math.ceil(scanNeeded * (prices.scanergyPerUnit ?? 1));
  const canScan = scanNeeded > 0 && credits >= scanCost;
  const cargoValue = getCargoHoldValue();
  renderRawStockMarket(site, service);

  finleyCredits.textContent = `${Math.floor(credits)} cr`;
  finleyCargoValue.textContent = `${cargoValue} cr`;
  finleySellToggle.disabled = cargoValue <= 0 && !isCargoSellModeActive;
  finleySellToggle.textContent = isCargoSellModeActive ? "Close Window" : "Open Window";
  finleySellToggle.classList.toggle("is-open", isCargoSellModeActive);

  finleyHull.textContent = `${Math.ceil((hull.integrity / hull.maxIntegrity) * 100)}%`;
  finleyRepairCost.textContent = `${repairCost} cr`;
  if (activePump?.type !== "repair") finleyRepairButton.disabled = !canRepair;

  finleyFuel.textContent = `${Math.floor(engine.fuel)} / ${engine.maxFuel}`;
  finleyFuelCost.textContent = `${fuelCost} cr`;
  if (activePump?.type !== "fuel") finleyFuelButton.disabled = !canFuel;

  finleyCharges.textContent = `${Math.floor(miner.ammo)} / ${miner.maxAmmo}`;
  finleyChargesCost.textContent = `${chargesCost} cr`;
  if (activePump?.type !== "charges") finleyChargesButton.disabled = !canCharges;

  finleyScan.textContent = `${Math.floor(scanner.scanergy)} / ${scanner.maxScanergy}`;
  finleyScanCost.textContent = `${scanCost} cr`;
  if (activePump?.type !== "scan") finleyScanButton.disabled = !canScan;
}

function renderRawStockMarket(site, service) {
  const offers = service?.rawStockOffers ?? null;
  supplyRawStock.hidden = !offers;
  supplyRawStockList.replaceChildren();
  if (!site || !offers) return;
  const markets = state.hubServices.marketInventories ??= {};
  const inventory = markets[service.id] ??= Object.fromEntries(
    Object.entries(offers).map(([itemId, offer]) => [itemId, offer.initialQuantity ?? 0]),
  );
  Object.entries(offers).forEach(([itemId, offer]) => {
    const row = document.createElement("div");
    const detail = document.createElement("div");
    const button = document.createElement("button");
    row.className = "supply-buy-row";
    detail.className = "supply-status-item";
    detail.textContent = `${formatResourceName(itemId)} - ${inventory[itemId] ?? 0} available - ${offer.price} cr`;
    button.type = "button";
    button.className = "supply-buy-button";
    button.textContent = "Buy";
    button.disabled = (inventory[itemId] ?? 0) <= 0 || !state.components.cargoHold.installed || !canSpendCredits(state, offer.price);
    button.addEventListener("click", () => buyRawStockUnit({ site, service, itemId, offer }));
    row.append(detail, button);
    supplyRawStockList.append(row);
  });
}

function buyRawStockUnit({ site, service, itemId, offer }) {
  const inventory = state.hubServices.marketInventories?.[service.id];
  if (!inventory || (inventory[itemId] ?? 0) <= 0 || !canSpendCredits(state, offer.price)) return false;
  spendCredits(state, offer.price);
  inventory[itemId] -= 1;
  const receiptId = `receipt:${service.id}:${Date.now()}:${inventory[itemId]}`;
  issueWorldDocument(state, {
    document: { id: receiptId, type: "purchase-receipt", title: `${formatResourceName(itemId)} Purchase Receipt`, status: "active", resourceType: itemId, quantity: 1, price: offer.price, siteId: site.id },
    issuerEntityId: `organization:${service.id}`,
    holderEntityId: state.character.controlledPersonEntityId,
    assetEntityId: state.character.activeHullVin ? `ship:${state.character.activeHullVin}` : null,
  });
  cargoHold.addUnit(itemId, { quantity: 1, tradeValue: offer.price, label: formatResourceName(itemId), sourceClaimId: receiptId });
  state.ledger.recordEvent("cargo.purchased", { siteId: site.id, serviceId: service.id, resourceType: itemId, quantity: 1, creditsPaid: offer.price }, { visible: true });
  syncPlayerCargoCustody();
  renderFinleyPanel();
  updateHudDisplay();
  scheduleSave();
  return true;
}

function toggleSupplyPump(type) {
  if (activePump?.type === type) {
    stopSupplyPump();
    return;
  }

  stopSupplyPump();

  const intervals = { fuel: 140, scan: 180, charges: 420, repair: 480 };
  const intervalId = setInterval(() => {
    const did = pumpSupplyTick(type);

    if (!did) {
      stopSupplyPump();
    }
  }, intervals[type]);

  activePump = { type, intervalId };
  updatePumpButtonStates();
}

function stopSupplyPump() {
  if (!activePump) {
    return;
  }

  clearInterval(activePump.intervalId);
  activePump = null;
  updatePumpButtonStates();
  renderFinleyPanel();
  updateHudDisplay();
}

function updatePumpButtonStates() {
  const map = { fuel: finleyFuelButton, charges: finleyChargesButton, scan: finleyScanButton, repair: finleyRepairButton };
  const labels = { fuel: "Pump", charges: "Load", scan: "Fill", repair: "Repair" };

  for (const [type, btn] of Object.entries(map)) {
    const active = activePump?.type === type;
    btn.classList.toggle("is-pumping", active);
    btn.textContent = active ? "Stop" : labels[type];
  }
}

function pumpSupplyTick(type) {
  const site = currentSiteState?.dockedSite;
  const service = site ? getHubService(site.id, activeHubServiceId) : null;
  const prices = service?.supplyPrices ?? {};

  if (type === "fuel") {
    const engine = state.components.engine;
    const chunk = 7 + Math.floor(Math.random() * 6); // 7—12 units
    const space = engine.maxFuel - engine.fuel;

    if (space <= 0) {
      return false;
    }

    const added = Math.min(chunk, space);
    const cost = Math.ceil(added * (prices.fuelPerUnit ?? 2));

    if (!canSpendCredits(state, cost)) {
      return false;
    }

    spendCredits(state, cost);
    engine.fuel += added;
    state.ledger.recordEvent("ship.refueled", { siteId: site.id, siteName: site.name, cost, fuelAdded: added }, { visible: false });
    renderFinleyPanel();
    updateHudDisplay();
    return true;
  }

  if (type === "scan") {
    const scanner = state.components.scanner;
    const chunk = 30 + Math.floor(Math.random() * 25); // 30—54 units
    const space = scanner.maxScanergy - scanner.scanergy;

    if (space <= 0) {
      return false;
    }

    const added = Math.min(chunk, space);
    const cost = Math.ceil(added * (prices.scanergyPerUnit ?? 1));

    if (!canSpendCredits(state, cost)) {
      return false;
    }

    spendCredits(state, cost);
    scanner.scanergy += added;
    state.ledger.recordEvent("supply.scanBought", { siteId: site.id, cost, scanAdded: added }, { visible: false });
    renderFinleyPanel();
    updateHudDisplay();
    return true;
  }

  if (type === "charges") {
    const miner = state.components.miner;
    const space = miner.maxAmmo - miner.ammo;

    if (space <= 0) {
      return false;
    }

    const added = Math.min(20, space);
    const cost = Math.ceil(added * (prices.chargePerUnit ?? 3));

    if (!canSpendCredits(state, cost)) {
      return false;
    }

    spendCredits(state, cost);
    miner.ammo += added;
    state.ledger.recordEvent("supply.chargesBought", { siteId: site.id, cost, chargesAdded: added }, { visible: false });
    renderFinleyPanel();
    updateHudDisplay();
    return true;
  }

  if (type === "repair") {
    const hull = state.components.hull;
    const space = hull.maxIntegrity - hull.integrity;

    if (space <= 0 || !currentSiteState?.canRepair) {
      return false;
    }

    const chunk = 5 + Math.floor(Math.random() * 18); // 5—22 units
    const added = Math.min(chunk, space);
    const repairCostPerUnit = (currentSiteState?.repairCost ?? 0) / Math.max(1, space);
    const cost = Math.ceil(added * repairCostPerUnit);

    if (!canSpendCredits(state, cost)) {
      return false;
    }

    spendCredits(state, cost);
    hull.integrity += added;
    state.ledger.recordEvent("ship.repaired", { siteId: site.id, cost, hullAdded: added }, { visible: false });
    renderFinleyPanel();
    updateHudDisplay();
    return true;
  }

  return false;
}

function depositCargoUnit(type, unit = {}) {
  const contract = contractManager.getCurrentContract();

  if (!activeDepositContractId || contract?.id !== activeDepositContractId || !canDepositToContract(contract)) {
    return false;
  }

  if (contract.type !== "resource-procurement" && isIllegalForContractSource(contract, unit)) {
    return false;
  }

  if (contract.type === "resource-procurement") {
    const result = sprcManager.deliverMaterial({
      contractId: contract.id,
      materialId: normalizeResourceType(type),
      amount: unit.quantity ?? 1,
    });

    if (!result.acceptedUnits) {
      return false;
    }

    game.createCargoTransferTrail({ type, color: unit.color, shape: unit.shape, size: unit.size }, "to-hub");
    if (contract.status === "paid" || contract.status === "fulfilled") {
      activeDepositContractId = null;
    }
    renderContract();
    updateHudDisplay();
    game.updateSiteReadout();
    scheduleSave();
    return { processedQuantity: result.acceptedUnits };
  }

  const didDeposit = contractManager.depositResourceUnit({
    contractId: contract.id,
    resourceType: type,
    sourceClaimId: unit.sourceClaimId ?? null,
    siteId: currentSiteState?.dockedSite?.id,
    amount: unit.quantity ?? 1,
  });

  if (!didDeposit) {
    return false;
  }

  game.createCargoTransferTrail({ type, color: unit.color, shape: unit.shape, size: unit.size }, "to-hub");

  if (contract.status === "fulfilled" || contract.status === "paid") {
    activeDepositContractId = null;
  }

  renderContract();
  updateHudDisplay();
  game.updateSiteReadout();
  return { processedQuantity: didDeposit };
}

function getCargoUnitFlags(unit) {
  return getResourceUnitFlags(unit);
}

function getResourceUnitFlags(unit) {
  const contract = getSourceLimitedContractForUnit(unit);

  return {
    illegal: isIllegalForContractSource(contract, unit),
  };
}

function getSourceLimitedContractForUnit(unit = {}) {
  const preferredContracts = [
    activeDepositContractId ? state.contracts.records[activeDepositContractId] : null,
    contractManager.getCurrentContract(),
    ...Object.values(state.contracts.records ?? {}),
  ];

  return preferredContracts.find((contract) => isSourceLimitedResourceContractForUnit(contract, unit)) ?? null;
}

function isSourceLimitedResourceContractForUnit(contract, unit = {}) {
  return Boolean(
    contract?.type === "resource-delivery" &&
    contract.status === "active" &&
    contract.terms?.sourceClaimIds?.length &&
    resourceTypesMatchForContract(contract.terms.resourceType, unit.type),
  );
}

function isIllegalForContractSource(contract, unit = {}) {
  const sourceClaimIds = contract?.terms?.sourceClaimIds ?? [];

  if (
    !isSourceLimitedResourceContractForUnit(contract, unit) ||
    sourceClaimIds.length === 0
  ) {
    return false;
  }

  return !sourceClaimIds.includes(unit.sourceClaimId);
}

function resourceTypesMatchForContract(expectedType, actualType) {
  return normalizeResourceType(expectedType) === normalizeResourceType(actualType);
}

function updateEventLedgerDisplay() {
  if (renderedLedgerVersion === state.ledger.version) {
    return;
  }

  playLedgerAudioEvents();
  renderedLedgerVersion = state.ledger.version;
  updateLedgerStreamDisplay();
  setTextIfChanged(worldDebugFields.eventCount, String(state.ledger.eventCount));
  setTextIfChanged(worldDebugFields.shotsFired, String(state.ledger.getStat("weapon.fired.total")));
  setTextIfChanged(worldDebugFields.rocksDestroyed, String(state.ledger.getStat("asteroid.destroyed.total")));
  setTextIfChanged(worldDebugFields.resourcesCollected, String(state.ledger.getStat("resource.collected.total")));
  setTextIfChanged(
    worldDebugFields.kills,
    String(state.ledger.getStat("enemy.destroyed.total") + state.ledger.getStat("npc.destroyed.total")),
  );
  setTextIfChanged(worldDebugFields.salesCredits, String(state.ledger.getStat("credits.earned.sales")));
  setTextIfChanged(worldDebugFields.repairCredits, String(state.ledger.getStat("credits.spent.repairs")));

  const eventGroups = state.ledger
    .getRecentEventGroups(25)
    .filter((eventGroup) => eventGroup.latestEvent?.type !== "ship.moved")
    .slice(0, 5)
    .reverse();
  const eventLogKey = eventGroups.map((eventGroup) => `${eventGroup.latestEvent?.type}:${eventGroup.message}`).join("|");

  if (renderedWorldEventLogKey !== eventLogKey) {
    renderedWorldEventLogKey = eventLogKey;
    worldDebugFields.eventLog.replaceChildren(
      ...eventGroups.map((eventGroup) => {
      const item = document.createElement("li");
      item.textContent = eventGroup.message;
      return item;
      }),
    );
  }
}

function updateLedgerStreamDisplay() {
  // The compact activity feed was superseded by the Observatory's Ledger
  // browser, so its list element may not exist. Stats and Population still
  // render from here, so only the feed section is skipped.
  if (!ledgerStreamStats) {
    return;
  }

  updateLedgerFilterOptions();
  const visibleEvents = ledgerStreamEvents ? getCompactLedgerEvents(activeLedgerFilter) : [];
  const eventsKey = `${activeLedgerFilter}|${visibleEvents.map((event) => `${event.message}:${event.count}`).join("|")}`;

  if (ledgerStreamEvents && renderedLedgerEventsKey !== eventsKey) {
    renderedLedgerEventsKey = eventsKey;
    ledgerStreamEvents.replaceChildren(
      ...visibleEvents.map((eventGroup) => {
        const item = document.createElement("li");
        const message = document.createElement("span");

        message.textContent = eventGroup.message;
        item.className = eventGroup.visible ? "is-visible-event" : "is-hidden-event";
        item.append(message);

        if (eventGroup.count > 1) {
          const count = document.createElement("em");
          count.textContent = `x${eventGroup.count}`;
          item.append(count);
        }

        return item;
      }),
    );
  }

  const statEntries = Object.entries(state.ledger.getStatsSnapshot())
    .filter(([key]) => !isNoisyLedgerKey(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-34);
  const statsKey = statEntries.map(([key, value]) => `${key}:${formatLedgerValue(value)}`).join("|");

  if (renderedLedgerStatsKey !== statsKey) {
    renderedLedgerStatsKey = statsKey;
    ledgerStreamStats.replaceChildren(
      ...statEntries.flatMap(([key, value]) => {
        const term = document.createElement("dt");
        const data = document.createElement("dd");

        term.textContent = key;
        data.textContent = formatLedgerValue(value);
        return [term, data];
      }),
    );
  }

}

function updatePopulationDisplay(population) {
  if (!ledgerStreamPopulation || !population) {
    return;
  }

  const entries = [
    ["Life", population.lifeformTotal],
    ...population.lifeforms.map(({ type, count }) => [formatPopulationLabel(type), count]),
    ["NPC ships", population.npcShips],
    ["Gates", population.gates.length],
    ["Gate shots", population.gateShots],
    ...population.gates.flatMap((gate, index) => [
      [`Gate ${index + 1} guards`, gate.guards],
      ["  hunters / fighters", `${gate.hunters} / ${gate.fighters}`],
      ["  sentries / blooms / mines", `${gate.sentries} / ${gate.dragBlooms} / ${gate.mines}`],
      ["  state", gate.state],
      ["  waves", gate.waves],
    ]),
  ];
  const populationKey = entries.map(([label, value]) => `${label}:${value}`).join("|");

  if (renderedLedgerPopulationKey === populationKey) {
    return;
  }

  renderedLedgerPopulationKey = populationKey;
  ledgerStreamPopulation.replaceChildren(
    ...entries.map(([label, value]) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const count = document.createElement("strong");
      name.textContent = label;
      count.textContent = String(value);
      item.append(name, count);
      return item;
    }),
  );
}

function formatPopulationLabel(type) {
  return type.replace(/(^|[-_])(\w)/g, (_, prefix, character) => `${prefix} ${character.toUpperCase()}`).trim();
}

function setTextIfChanged(element, value) {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

function getCompactLedgerEvents(filterKey = "all") {
  const repeatWindowMs = 90_000;
  const now = Date.now();
  const groups = new Map();
  const recentEvents = state.ledger.getRecentEvents(160, { includeHidden: true })
    .filter((event) => !isNoisyLedgerEvent(event))
    .filter((event) => filterKey === "all" || getLedgerEventEntityKeys(event).has(filterKey));

  recentEvents.forEach((event) => {
    const message = event.message?.trim();

    if (!message || groups.has(message)) {
      return;
    }

    const matchingEvents = recentEvents
      .filter((candidate) => candidate.message === message && now - candidate.time <= repeatWindowMs);

    groups.set(message, {
      message,
      count: Math.max(1, matchingEvents.length),
      visible: event.visible,
    });
  });

  return [...groups.values()].slice(0, 80);
}

function updateLedgerFilterOptions() {
  if (!ledgerStreamFilter) return;
  const labels = new Map([
    ["all", "All activity"],
    ["player", "My pilot"],
    ["institution:sprc", "SPRC"],
    ["actor:sal", "Sal"],
    ["institution:sunward-acre", "Sunward Acre"],
    ["actor:tavi", "Tavi"],
    ["institution:first-reach-recovery", "First Reach Recovery"],
    ["actor:nell-winch", "Nell Winch"],
  ]);
  state.ledger.getRecentEvents(160, { includeHidden: true }).forEach((event) => collectLedgerEntityLabels(event, labels));
  const current = activeLedgerFilter;
  const filterKey = [...labels].map(([value, label]) => `${value}:${label}`).join("|");
  if (renderedLedgerFilterKey === filterKey) {
    ledgerStreamFilter.value = labels.has(current) ? current : "all";
    return;
  }
  renderedLedgerFilterKey = filterKey;
  ledgerStreamFilter.replaceChildren(...[...labels].map(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }));
  activeLedgerFilter = labels.has(current) ? current : "all";
  ledgerStreamFilter.value = activeLedgerFilter;
}

function collectLedgerEntityLabels(event, labels) {
  const payload = event.payload ?? {};
  if (payload.institutionId) labels.set(`institution:${payload.institutionId}`, payload.institutionName ?? payload.institutionId);
  if (payload.carrierInstitutionId) labels.set(`institution:${payload.carrierInstitutionId}`, payload.carrierName ?? payload.carrierInstitutionId);
  if (payload.actorInstitutionId) labels.set(`actor:${payload.actorInstitutionId}`, payload.actorName ?? payload.actorInstitutionId);
  if (payload.pilotInstitutionId) labels.set(`actor:${payload.pilotInstitutionId}`, payload.pilotName ?? payload.pilotInstitutionId);
  if (payload.scannerId && payload.scannerId !== "controlled-ship") labels.set(`npc:${payload.scannerId}`, payload.scannerName ?? payload.scannerId);
  if (payload.npcId) {
    const hauler = state.logistics?.haulers?.[payload.npcId];
    const shipName = hauler ? state.logistics?.institutions?.[hauler.shipInstitutionId]?.name : null;
    labels.set(`npc:${payload.npcId}`, payload.shipName ?? payload.pilotName ?? shipName ?? payload.npcId);
  }
}

function getLedgerEventEntityKeys(event) {
  const payload = event.payload ?? {};
  const keys = new Set();
  if (payload.institutionId) keys.add(`institution:${payload.institutionId}`);
  if (payload.carrierInstitutionId) keys.add(`institution:${payload.carrierInstitutionId}`);
  if (payload.actorInstitutionId) keys.add(`actor:${payload.actorInstitutionId}`);
  if (payload.pilotInstitutionId) keys.add(`actor:${payload.pilotInstitutionId}`);
  if (payload.scannerId && payload.scannerId !== "controlled-ship") keys.add(`npc:${payload.scannerId}`);
  if (payload.npcId) keys.add(`npc:${payload.npcId}`);
  const controlledVin = state.components?.hull?.vin ?? state.character?.activeHullVin;
  const playerName = state.legal?.pilotLicense?.firstName ? `${state.legal.pilotLicense.firstName} ${state.legal.pilotLicense.lastName}` : null;
  const explicitlyPlayer = payload.scannerId === "controlled-ship"
    || payload.subjectId === controlledVin
    || payload.shipVin === controlledVin
    || (playerName && (payload.pilotName === playerName || payload.actorName === playerName));
  if (explicitlyPlayer || /^(ship|weapon|resource|cargo|scanner|beacon|tow|site|zone|contract|mission|pilot|title|supply)\./.test(event.type)) keys.add("player");
  return keys;
}

function isNoisyLedgerEvent(event) {
  return event.type === "ship.moved" || event.message === "Ship moved";
}

function isNoisyLedgerKey(key) {
  return key === "events.ship.moved" || key === "ship.moved.total" || key.startsWith("ship.distance.");
}

function formatLedgerPayload(payload = {}) {
  const entries = Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined)
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${formatLedgerValue(value)}`);

  return entries.length > 0 ? entries.join(" | ") : "-";
}

function formatLedgerValue(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (Array.isArray(value)) {
    return `[${value.slice(0, 3).map(formatLedgerValue).join(", ")}${value.length > 3 ? ", ..." : ""}]`;
  }

  if (typeof value === "object" && value !== null) {
    return "{...}";
  }

  return String(value);
}

function playLedgerAudioEvents() {
  const events = state.ledger.getEventsAfterId(lastAudioEventId, { includeHidden: true });

  events.forEach((event) => {
    lastAudioEventId = Math.max(lastAudioEventId, event.id);

    if (event.type === "contract.paid" || event.type === "mission.completed") {
      audio.playContractPaid();
    } else if (event.type === "ship.refueled") {
      audio.playDock();
    } else if (event.type === "site.tetherBroken") {
      flashDockingDanger();
    }
  });
}

function flashDockingDanger() {
  hullDockingLock.classList.remove("is-docking-danger");
  void hullDockingLock.offsetWidth;
  hullDockingLock.classList.add("is-docking-danger");
  window.setTimeout(() => hullDockingLock.classList.remove("is-docking-danger"), 1800);
}

function getCargoHoldValue() {
  return cargoHold.units.reduce(
    (total, unit) => total + getCargoUnitValue(unit.type, unit) * (unit.quantity ?? 1),
    0,
  );
}

function getSelectedProcessorOutput() {
  return document.querySelector("input[name='processor-output']:checked")?.value ?? "fuel";
}

function renderProcessorOutputs() {
  normalizeProcessorOutput(state.components);

  const outputs = getProcessorOutputs(state.components);
  const renderedOutputIds = [...processorOutputPanel.querySelectorAll("input[name='processor-output']")]
    .map((control) => control.value)
    .join(",");
  const outputIds = outputs.map((output) => output.id).join(",");

  if (renderedOutputIds === outputIds) {
    return;
  }

  processorOutputPanel.querySelectorAll("label").forEach((label) => label.remove());

  outputs.forEach((output) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const detail = document.createElement("span");
    const shapes = document.createElement("span");

    input.type = "radio";
    input.name = "processor-output";
    input.value = output.id;
    input.checked = output.id === state.components.processor.output;
    input.addEventListener("change", () => {
      state.components.processor.output = output.id;
    });

    detail.className = "processor-output-detail";
    detail.textContent = output.amountLabel;

    shapes.className = "processor-output-shapes";
    output.acceptedShapes.forEach((shape) => {
      const swatch = document.createElement("span");
      swatch.className = `processor-output-shape is-${shape}`;
      swatch.style.setProperty("--output-color", output.color);
      shapes.append(swatch);
    });

    label.append(input, output.label, shapes, detail);
    processorOutputPanel.append(label);
  });
}

function makePanelsDraggable() {
  // Component panels are intentionally ordinary HTML. Their position and z-order
  // are saved locally so the ship console can slowly become the player's own
  // layout before full accounts/profiles exist.
  const gridSize = 20;
  const viewportPadding = 12;
  const savedLayout = loadPanelLayout();
  const offsetsByPanelId = new Map();
  let topPanelZIndex = Math.min(getSavedTopZIndex(savedLayout), DESK_PANEL_MAX_Z_INDEX);

  document.querySelectorAll(".component-panel").forEach((panel) => {
    const handle = panel.querySelector(".component-panel-title");
    const panelId = panel.dataset.panelId;

    if (!handle) {
      return;
    }

    if (panelId === "journey") {
      panel.style.zIndex = String(JOURNEY_PANEL_Z_INDEX);
      return;
    }

    const defaultPanel = DEFAULT_PANEL_LAYOUT[panelId] ?? { x: 0, y: 0, z: 1 };
    const savedPanel = panelId ? getSavedPanelLayout(savedLayout, panelId) : null;
    const isInDrawer = Boolean(panel.closest("#paperwork-drawer"));
    const startsOnDeskAfterBeingFiled = !isInDrawer && savedPanel?.inDrawer;
    const offset = startsOnDeskAfterBeingFiled
      ? { x: defaultPanel.x, y: defaultPanel.y }
      : isInDrawer && !savedPanel?.inDrawer
      ? { x: 0, y: 0 }
      : { x: savedPanel?.x ?? defaultPanel.x, y: savedPanel?.y ?? defaultPanel.y };

    offsetsByPanelId.set(panelId, offset);

    let drag = null;

    panel.style.zIndex = String(getInitialPanelZ(panelId, savedPanel, defaultPanel));
    applyPanelOffset(panel, offset, { clamp: isPanelMeasurable(panel) });
    savePanelLayout(panel, offset);

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("[data-close-panel], .paper-file-button")) {
        return;
      }

      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: offset.x,
        originY: offset.y,
        hasRecordedIntentionalDrag: false,
      };
      setPanelTop(panel);
      panel.classList.add("is-dragging");
      handle.setPointerCapture(event.pointerId);
    });

    panel.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || event.target.closest(".component-panel-title")) {
          return;
        }

        setPanelTop(panel);
      },
      true,
    );

    handle.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }

      offset.x = Math.round((drag.originX + event.clientX - drag.startX) / gridSize) * gridSize;
      offset.y = Math.round((drag.originY + event.clientY - drag.startY) / gridSize) * gridSize;
      applyPanelOffset(panel, offset);
      savePanelLayout(panel, offset);
      recordPanelDrag(panelId, drag, event);
    });

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    function endDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }

      panel.classList.remove("is-dragging");
      recordPanelDrag(panelId, drag, event);
      audio.playPanelDrop();
      drag = null;
    }
  });

  bringPanelToFront = setPanelTop;
  movePaperPanelToDesk = (panelId) => movePaperPanel(panelId, "desk");
  movePaperPanelToDrawer = (panelId) => movePaperPanel(panelId, "drawer");
  positionPanelById = (panelId, position = null) => {
    const panel = document.querySelector(`[data-panel-id="${panelId}"]`);
    const offset = offsetsByPanelId.get(panelId);

    if (!panel || !offset) {
      return;
    }

    if (position) {
      offset.x = position.x;
      offset.y = position.y;
    }

    applyPanelOffset(panel, offset, { clamp: isPanelMeasurable(panel) });
    savePanelLayout(panel, offset);
  };

  function movePaperPanel(panelId, destination) {
    const panel = document.querySelector(`[data-panel-id="${panelId}"]`);
    const offset = offsetsByPanelId.get(panelId);
    const hud = document.querySelector(".hud");
    const shelf = document.querySelector("#paperwork-drawer .drawer-shelf");

    if (!panel || !offset || !hud || !shelf) {
      return;
    }

    if (destination === "drawer") {
      shelf.appendChild(panel);
      offset.x = 0;
      offset.y = 0;
      state.ledger.recordEvent(
        "component.filed",
        {
          componentId: panelId,
          destination: "drawer",
        },
        { visible: false },
      );
      updateLedgerDrivenSystems();
      paperworkDrawer.classList.add("is-open");
      drawerToggle?.setAttribute("aria-expanded", "true");
      window.setTimeout(() => {
        paperworkDrawer.classList.remove("is-open");
        drawerToggle?.setAttribute("aria-expanded", "false");
      }, PAPERWORK_DRAWER_AUTO_CLOSE_MS);
    } else {
      hud.appendChild(panel);
      const defaultPanel = DEFAULT_PANEL_LAYOUT[panelId] ?? { x: 0, y: 0 };
      offset.x = defaultPanel.x;
      offset.y = defaultPanel.y;
      setPanelTop(panel);
    }

    applyPanelOffset(panel, offset, { clamp: isPanelMeasurable(panel) });
    savePanelLayout(panel, offset);
    updatePaperworkControlLabels();
    playPanelReveal(panel);
  }

  function setPanelTop(panel) {
    if (panel.dataset.panelId === "journey") {
      panel.style.zIndex = String(JOURNEY_PANEL_Z_INDEX);
      savePanelLayout(panel);
      return;
    }

    if (panel.dataset.panelId === "viewport") {
      panel.style.zIndex = String(VIEWPORT_PANEL_Z_INDEX);
      savePanelLayout(panel);
      return;
    }

    topPanelZIndex = getNextDeskPanelZIndex();
    panel.style.zIndex = String(topPanelZIndex);
    savePanelLayout(panel);
  }

  function getNextDeskPanelZIndex() {
    if (topPanelZIndex < DESK_PANEL_MAX_Z_INDEX) {
      return topPanelZIndex + 1;
    }

    normalizeDeskPanelZIndexes();
    return topPanelZIndex + 1;
  }

  function normalizeDeskPanelZIndexes() {
    const deskPanels = [...document.querySelectorAll(".hud > .component-panel")]
      .filter((panel) => !["journey", "viewport"].includes(panel.dataset.panelId))
      .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));

    topPanelZIndex = DESK_PANEL_MIN_Z_INDEX;
    deskPanels.forEach((panel) => {
      topPanelZIndex += 1;
      panel.style.zIndex = String(topPanelZIndex);
      savePanelLayout(panel);
    });
  }

  function applyPanelOffset(panel, offset, { clamp = true } = {}) {
    panel.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    if (clamp) {
      clampPanelOffset(panel, offset);
      keepPanelClearOfJourney(panel, offset);
    }
    panel.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
  }

  function clampPanelOffset(panel, offset) {
    if (panel.closest("#paperwork-drawer")) {
      clampDrawerPanelOffset(panel, offset);
      return;
    }

    const rect = panel.getBoundingClientRect();
    let adjustX = 0;
    let adjustY = 0;

    if (rect.left < viewportPadding) {
      adjustX = viewportPadding - rect.left;
    } else if (rect.right > window.innerWidth - viewportPadding) {
      adjustX = window.innerWidth - viewportPadding - rect.right;
    }

    if (rect.top < viewportPadding) {
      adjustY = viewportPadding - rect.top;
    } else if (rect.bottom > window.innerHeight - viewportPadding) {
      adjustY = window.innerHeight - viewportPadding - rect.bottom;
    }

    offset.x = Math.round((offset.x + adjustX) / gridSize) * gridSize;
    offset.y = Math.round((offset.y + adjustY) / gridSize) * gridSize;
  }

  function clampDrawerPanelOffset(panel, offset) {
    const shelf = panel.closest(".drawer-shelf");

    if (!shelf) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const shelfRect = shelf.getBoundingClientRect();
    const padding = 14;
    const minLeft = shelfRect.left + padding;
    const maxRight = shelfRect.right - padding;
    const minTop = shelfRect.top + padding;
    const maxBottom = shelfRect.bottom - padding;
    let adjustX = 0;
    let adjustY = 0;

    if (rect.width >= maxRight - minLeft) {
      adjustX = minLeft - rect.left;
    } else if (rect.left < minLeft) {
      adjustX = minLeft - rect.left;
    } else if (rect.right > maxRight) {
      adjustX = maxRight - rect.right;
    }

    if (rect.height >= maxBottom - minTop) {
      adjustY = minTop - rect.top;
    } else if (rect.top < minTop) {
      adjustY = minTop - rect.top;
    } else if (rect.bottom > maxBottom) {
      adjustY = maxBottom - rect.bottom;
    }

    offset.x = Math.round((offset.x + adjustX) / gridSize) * gridSize;
    offset.y = Math.round((offset.y + adjustY) / gridSize) * gridSize;
  }

  function keepPanelClearOfJourney(panel, offset) {
    if (panel.dataset.panelId === "journey" || panel.dataset.panelId === "viewport" || panel.closest("#paperwork-drawer")) {
      return;
    }

    const journeyPanel = document.querySelector("[data-panel-id='journey']");

    if (!journeyPanel || isPanelHidden(journeyPanel) || isPanelHidden(panel)) {
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const journeyRect = journeyPanel.getBoundingClientRect();

    if (!rectsOverlap(panelRect, journeyRect)) {
      return;
    }

    const moveRight = journeyRect.right + viewportPadding - panelRect.left;
    const moveLeft = journeyRect.left - viewportPadding - panelRect.right;
    const rightFits = panelRect.right + moveRight <= window.innerWidth - viewportPadding;
    const leftFits = panelRect.left + moveLeft >= viewportPadding;
    const adjustment = rightFits || !leftFits ? moveRight : moveLeft;

    offset.x = Math.round((offset.x + adjustment) / gridSize) * gridSize;
    panel.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    clampPanelOffset(panel, offset);
  }
}

function rectsOverlap(first, second) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

function renderShipOffers() {
  const currentCredits = Math.floor(getCredits(state));
  const renderedKey = shipOffersPanel.dataset.renderedKey;
  const nextKey = `${currentCredits}:${state.ship.purchasedOfferId ?? "none"}`;

  if (renderedKey === nextKey) {
    return;
  }

  const purchasedOfferId = state.ship.purchasedOfferId;

  shipOffersPanel.dataset.renderedKey = nextKey;
  shipOffersPanel.replaceChildren(
    ...shipOffers
      .filter((offer) => offer.id !== purchasedOfferId)
      .map((offer) => {
        const card = document.createElement("article");
        const title = document.createElement("h3");
        const price = document.createElement("strong");
        const description = document.createElement("p");
        const meta = document.createElement("div");
        const tags = document.createElement("div");
        const button = document.createElement("button");
        const canAfford = currentCredits >= offer.price;

        card.className = `ship-offer${offer.special ? " is-special-offer" : ""}`;
        title.textContent = offer.title;
        price.className = "ship-offer-price";
        price.textContent = `${offer.price.toLocaleString()} cr`;
        description.textContent = offer.description;
        meta.className = "ship-offer-meta";
        [offer.brand, offer.model, `${offer.hull}% hull`, offer.engine].forEach((item) => {
          const chip = document.createElement("span");
          chip.textContent = item;
          meta.append(chip);
        });
        tags.className = "ship-offer-tags";
        offer.includedComponents.forEach((componentName) => {
          const chip = document.createElement("span");
          chip.textContent = componentName;
          tags.append(chip);
        });
        button.className = "ship-offer-button";
        button.type = "button";
        button.textContent = canAfford ? "Buy Ship" : offer.special ? "I don't have enough" : "Out of Reach";
        button.addEventListener("click", () => handleShipOfferClick(offer));
        card.append(title, price, description, meta, tags, button);
        return card;
      }),
  );
}

function renderComponentShop(service = null) {
  if (!componentOffersPanel) {
    return;
  }

  const currentCredits = Math.floor(getCredits(state));
  const offers = getVisibleComponentOffers(service?.componentOffers ?? []);
  const nextKey = `${service?.id ?? "none"}:${currentCredits}:${offers
    .map((offer) => `${offer.id}:${isComponentOfferPurchased(offer) ? "installed" : "open"}`)
    .join("|")}`;

  if (componentOffersPanel.dataset.renderedKey === nextKey) {
    return;
  }

  componentOffersPanel.dataset.renderedKey = nextKey;
  componentShopNpc.textContent = service?.npcName ?? "Modworks";
  componentShopOrg.textContent = service?.organization ?? "Component sales";
  componentShopCredits.textContent = `${currentCredits.toLocaleString()} cr`;

  componentOffersPanel.replaceChildren(
    ...offers.map((offer) => {
      const card = document.createElement("article");
      const title = document.createElement("h3");
      const price = document.createElement("strong");
      const description = document.createElement("p");
      const tags = document.createElement("div");
      const button = document.createElement("button");
      const isInstalled = isComponentOfferPurchased(offer);
      const canAfford = currentCredits >= offer.price;

      card.className = "ship-offer is-special-offer";
      title.textContent = offer.title;
      price.className = "ship-offer-price";
      price.textContent = `${offer.price.toLocaleString()} cr`;
      description.textContent = offer.description;
      tags.className = "ship-offer-tags";
      (offer.tags ?? []).forEach((tag) => {
        const chip = document.createElement("span");
        chip.textContent = tag;
        tags.append(chip);
      });
      button.className = "ship-offer-button";
      button.type = "button";
      button.disabled = isInstalled || !canAfford;
      button.textContent = isInstalled ? "Installed" : canAfford ? "Buy Component" : "Need Credits";
      button.addEventListener("click", () => buyComponentOffer(offer, service));
      card.append(title, price, description, tags, button);
      return card;
    }),
  );
}

function getVisibleComponentOffers(offers) {
  const starterOffers = offers.filter((offer) => (offer.stockGroup ?? "starter") === "starter");
  const starterComplete = starterOffers.length > 0 && starterOffers.every((offer) => isComponentOfferPurchased(offer));
  const desiredStockGroup = starterComplete ? "restock-1" : "starter";
  const visibleOffers = offers.filter((offer) => (offer.stockGroup ?? "starter") === desiredStockGroup);

  return visibleOffers.length > 0 ? visibleOffers : starterOffers;
}

function isComponentOfferPurchased(offer) {
  const component = state.components[offer.componentId];

  if (!component) {
    return false;
  }

  if (offer.upgradeId) {
    return component.upgrades?.includes(offer.upgradeId) ?? false;
  }

  return Boolean(component.installed);
}

function buyComponentOffer(offer, service = null) {
  const component = state.components[offer.componentId];

  if (!component || isComponentOfferPurchased(offer) || !canSpendCredits(state, offer.price)) {
    renderComponentShop(service);
    return;
  }

  spendCredits(state, offer.price);
  component.installed = true;

  if (offer.upgradeId) {
    component.upgrades = Array.from(new Set([...(component.upgrades ?? []), offer.upgradeId]));
  }

  applyComponentOffer(offer);
  setComponentAvailable(offer.panelId ?? offer.componentId, true);

  if (offer.componentId === "processor") {
    // Cargo hold becomes the processor's output destination. Ensure the panel
    // is visible and in-bounds — it may have been off-screen from a prior layout.
    setComponentAvailable("cargo", true);
    positionPanelById("cargo", { x: 0, y: 0 });
  }

  state.ledger.recordEvent(
    "component.purchased",
    {
      componentId: offer.componentId,
      componentName: offer.componentName,
      offerId: offer.id,
      price: offer.price,
      sellerId: service?.npcId ?? null,
      sellerName: service?.npcName ?? "Component Seller",
      siteId: currentSiteState?.dockedSite?.id ?? null,
      siteName: currentSiteState?.dockedSite?.name ?? null,
      accountCredits: getCredits(state),
    },
    { visible: true },
  );

  commsDirector.say({
    source: COMMS_SOURCES.serviceNpc,
    speaker: service?.npcName ?? "Modworks",
    text:
      offer.purchaseMessage ??
      `${offer.componentName} is bolted in. It will not make you graceful, but it will make you harder to ignore.`,
  });
  renderComponentShop(service);
  updateHudDisplay();
}

function applyComponentOffer(offer) {
  if (offer.apply?.engine) {
    Object.assign(state.components.engine, offer.apply.engine);
  }
}

function handleShipOfferClick(offer) {
  const result = purchaseShipOffer(state, offer);

  if (!result.ok) {
    updateHudDisplay();
    return;
  }

  setComponentAvailable("miner", true);
  setComponentAvailable("cargo", true);
  setComponentAvailable("merchant", false);

  const shipyardService = currentSiteState?.dockedSite ? getHubService(currentSiteState.dockedSite.id, yardExchangeServices.shipyard) : null;

  if (shipyardService?.postSaleGreeting) {
    commsDirector.say({
      source: COMMS_SOURCES.serviceNpc,
      speaker: shipyardService.npcName,
      text: shipyardService.postSaleGreeting,
    });
  }

  renderContract();
  updateHudDisplay();
}

function recordPanelDrag(panelId, drag, endEvent) {
  if (!panelId) {
    return;
  }

  const mouseDeltaX = Math.abs(endEvent.clientX - drag.startX);
  const mouseDeltaY = Math.abs(endEvent.clientY - drag.startY);

  if (drag.hasRecordedIntentionalDrag) {
    return;
  }

  if (mouseDeltaX < 4 && mouseDeltaY < 4) {
    return;
  }

  drag.hasRecordedIntentionalDrag = true;
  state.ledger.recordEvent(
    "component.dragged",
    {
      componentId: panelId,
      x: endEvent.clientX,
      y: endEvent.clientY,
    },
    { visible: false },
  );
  updateLedgerDrivenSystems();
}

function isPanelMeasurable(panel) {
  return getComputedStyle(panel).display !== "none";
}

function clearOldPanelLayouts() {
  OLD_PANEL_LAYOUT_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

function loadPanelLayout() {
  try {
    return JSON.parse(window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY)) ?? { panels: {} };
  } catch {
    return { panels: {} };
  }
}

function getPanelLayoutProfile() {
  const devStartId = state._devStartId ?? initialDevStart;

  if (devStartId === "panorama" || state.ui.viewportLayout === "fullscreen-background") {
    return "panorama";
  }

  return devStartId === "explorer" ? "explorer" : "main";
}

function getSavedPanelLayout(layout, panelId, profile = getPanelLayoutProfile()) {
  const record = layout.panels?.[panelId];

  // Layouts are intentionally profile-only. Falling back to a legacy record
  // makes switching modes overwrite a carefully arranged desk with another
  // mode's coordinates.
  return record?.profiles?.[profile] ?? null;
}

function getSavedTopZIndex(layout) {
  const savedZIndexes = Object.entries(layout.panels ?? {})
    .filter(([panelId]) => panelId !== "journey" && panelId !== "viewport")
    .map(([panelId]) => getSavedPanelLayout(layout, panelId)?.z)
    .filter((zIndex) => Number.isFinite(zIndex) && zIndex >= DESK_PANEL_MIN_Z_INDEX && zIndex <= DESK_PANEL_MAX_Z_INDEX);
  const defaultZIndexes = Object.entries(DEFAULT_PANEL_LAYOUT)
    .filter(([panelId]) => panelId !== "journey" && panelId !== "viewport")
    .map(([, panel]) => panel.z)
    .filter((zIndex) => Number.isFinite(zIndex) && zIndex >= DESK_PANEL_MIN_Z_INDEX && zIndex <= DESK_PANEL_MAX_Z_INDEX);

  return Math.max(10, ...defaultZIndexes, ...savedZIndexes);
}

function getInitialPanelZ(panelId, savedPanel, defaultPanel) {
  if (panelId === "journey") {
    return JOURNEY_PANEL_Z_INDEX;
  }

  if (panelId === "viewport") {
    return VIEWPORT_PANEL_Z_INDEX;
  }

  const savedZ = savedPanel?.z;

  if (Number.isFinite(savedZ) && savedZ >= DESK_PANEL_MIN_Z_INDEX && savedZ <= DESK_PANEL_MAX_Z_INDEX) {
    return savedZ;
  }

  return clampDeskPanelZIndex(defaultPanel.z);
}

function clampDeskPanelZIndex(zIndex) {
  if (!Number.isFinite(zIndex)) {
    return DESK_PANEL_MIN_Z_INDEX;
  }

  return Math.min(DESK_PANEL_MAX_Z_INDEX, Math.max(DESK_PANEL_MIN_Z_INDEX, zIndex));
}

function savePanelLayout(panel, offset = null, options = {}) {
  const panelId = panel.dataset.panelId;

  if (!panelId) {
    return;
  }

  const layout = loadPanelLayout();
  const profile = getPanelLayoutProfile();
  const previousRecord = layout.panels?.[panelId] ?? {};
  const previousPanel = getSavedPanelLayout(layout, panelId, profile) ?? {};
  const zIndex = panelId === "journey" ? JOURNEY_PANEL_Z_INDEX : Number(panel.style.zIndex) || previousPanel.z || 1;
  const nextPanel = {
    x: offset?.x ?? previousPanel.x ?? 0,
    y: offset?.y ?? previousPanel.y ?? 0,
    z: zIndex,
    inDrawer: Boolean(panel.closest("#paperwork-drawer")),
    ...(options.layoutVersion || previousPanel.layoutVersion
      ? { layoutVersion: options.layoutVersion ?? previousPanel.layoutVersion }
      : {}),
  };

  layout.panels = {
    ...layout.panels,
    [panelId]: {
      ...previousRecord,
      profiles: {
        ...(previousRecord.profiles ?? {}),
        [profile]: nextPanel,
      },
    },
  };

  window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

function initLicenseApplication() {
  if (isFreePlayStart) {
    dismissLicenseApplication();
    applyIssuedLicense(getPilotLicense(state));
    return;
  }

  const existingLicense = getPilotLicense(state);

  if (existingLicense.licenseId) {
    applyIssuedLicense(existingLicense);
    dismissLicenseApplication();
    renderContract();
    return;
  }

  licenseFirstName.focus();

  licenseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    audio.unlock();
    const firstName = licenseFirstName.value.trim();
    const lastName = licenseLastName.value.trim();

    if (!firstName || !lastName) {
      licenseFormError.hidden = false;
      (firstName ? licenseLastName : licenseFirstName).focus();
      return;
    }

    licenseFormError.hidden = true;
    const year = new Date().getFullYear();
    const suffix = String(Math.floor(Math.random() * 90000) + 10000);
    const licenseId = `RTC-P${year}-${suffix}`;

    const license = issuePilotLicense(state, {
      firstName,
      lastName,
      licenseId,
      status: "provisional",
      canonical: true,
    });
    updateCurrentShipLegal(state, { flightLicenseId: licenseId });

    state.ledger.recordEvent("pilot.licensed", {
      licenseId,
      pilotName: `${firstName} ${lastName}`,
      licenseStatus: "provisional",
      authorizedZones: license.authorizedZones,
    }, { visible: false });

    applyIssuedLicense(license);
    setComponentAvailable("license", true);
    dismissLicenseApplication();
    journeyDirector.acceptMission();
    renderContract();
    saveNow();
  });
}

function dismissLicenseApplication() {
  licenseForm?.reset();
  licenseApplication?.classList.add("is-dismissed");
}

function applyIssuedLicense(pilot) {
  const fullName = `${pilot.firstName} ${pilot.lastName}`;
  licensePilotName.textContent = fullName;
  licenseIdDisplay.textContent = pilot.licenseId;
  licenseIdDisplay.dataset.licenseId = pilot.licenseId ?? "";
  const pilotNameEl = document.querySelector("#pilot-name");
  if (pilotNameEl) {
    pilotNameEl.textContent = fullName;
  }
}

// ── Developer observability UI ──────────────────────────────────────────────
// Point at an actor and ask "what are you doing, and why?". Reads the
// diagnostics projection through actorInspector; never mutates simulation state.

const actorDiagnosticPanel = document.querySelector("#actor-diagnostic");
const actorDiagnosticName = document.querySelector("#actor-diagnostic-name");
const actorDiagnosticKind = document.querySelector("#actor-diagnostic-kind");
const actorDiagnosticBody = document.querySelector("#actor-diagnostic-body");
const actorDiagnosticClose = document.querySelector("#actor-diagnostic-close");
const observatoryPanel = document.querySelector("#observatory");
const observatoryBody = document.querySelector("#observatory-body");
const observatorySearch = document.querySelector("#observatory-search");
const observatoryCount = document.querySelector("#observatory-count");
const observatoryToggle = document.querySelector("#observatory-toggle");
const observatoryCloseButton = document.querySelector("#observatory-close");

const ACTOR_PICK_RADIUS = 60;
let selectedActorId = null;
let observatoryTab = "actors";

function getInspectableWorldActors() {
  const physicalActors = [...(game.npcShips ?? []), ...(game.workerShips ?? [])].filter((actor) => actor?.position && actor.id);
  const physicalIds = new Set(physicalActors.map((actor) => actor.id));
  const locatedActors = listInspectableActors(state, { game })
    .filter((actor) => !physicalIds.has(actor.actorId) && actor.locationSiteId)
    .map((actor) => {
      const site = game.worldSites?.find((candidate) => candidate.id === actor.locationSiteId);
      if (!site?.position) return null;
      return {
        id: actor.actorId,
        name: actor.name,
        position: site.position,
        locationSiteId: site.id,
        inspectionKind: actor.kind,
        pickRadius: Math.max(ACTOR_PICK_RADIUS, site.radius ?? 0),
      };
    })
    .filter(Boolean);
  return [...physicalActors, ...locatedActors];
}

// Click an actor in the viewport to select it. Uses the camera to map the click
// into world space, then picks the nearest actor within a generous radius.
canvas?.addEventListener("click", (event) => {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  const screenX = (event.clientX - bounds.left) * scaleX;
  const screenY = (event.clientY - bounds.top) * scaleY;
  const worldX = screenX + (game.camera?.x ?? 0);
  const worldY = screenY + (game.camera?.y ?? 0);

  const candidates = getInspectableWorldActors()
    .map((actor) => ({ actor, distance: Math.hypot(actor.position.x - worldX, actor.position.y - worldY) }))
    .filter(({ actor, distance }) => distance <= (actor.pickRadius ?? ACTOR_PICK_RADIUS))
    .sort((first, second) => first.distance - second.distance);

  if (candidates.length > 0) {
    // A hub administration and its population occupy the same site. Repeated
    // clicks cycle through every actor under the cursor instead of making the
    // first one in registration order permanently hide the others.
    const currentIndex = candidates.findIndex(({ actor }) => actor.id === selectedActorId);
    const next = candidates[(currentIndex + 1) % candidates.length];
    selectActorForDiagnostics(next.actor.id);
  }
});

function selectActorForDiagnostics(actorId) {
  selectedActorId = actorId;
  if (actorDiagnosticPanel) actorDiagnosticPanel.hidden = false;
  renderActorDiagnostic();
}

actorDiagnosticClose?.addEventListener("click", () => {
  selectedActorId = null;
  if (actorDiagnosticPanel) actorDiagnosticPanel.hidden = true;
});

observatoryToggle?.addEventListener("click", () => {
  if (!observatoryPanel) return;
  observatoryPanel.hidden = !observatoryPanel.hidden;
  if (!observatoryPanel.hidden) renderObservatory();
});
observatoryCloseButton?.addEventListener("click", () => {
  if (observatoryPanel) observatoryPanel.hidden = true;
});
observatorySearch?.addEventListener("input", () => renderObservatory());
// Table tabs render into observatory-body; ledger/stats/population are their own
// panes so the existing render functions keep driving them by id.
const OBSERVATORY_TABLE_TABS = new Set(["actors", "blockers"]);

function applyObservatoryTab() {
  const isTable = OBSERVATORY_TABLE_TABS.has(observatoryTab);
  if (observatoryBody) observatoryBody.hidden = !isTable;
  if (observatorySearch) observatorySearch.hidden = !isTable;
  if (observatoryCount) observatoryCount.hidden = !isTable;
  ["ledger", "stats", "population", "contracts"].forEach((pane) => {
    const node = document.querySelector(`#observatory-pane-${pane}`);
    if (node) node.hidden = observatoryTab !== pane;
  });
}

document.querySelectorAll(".observatory-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    observatoryTab = tab.dataset.observatoryTab;
    document.querySelectorAll(".observatory-tab").forEach((entry) => entry.classList.toggle("is-active", entry === tab));
    applyObservatoryTab();
    renderObservatory();
  });
});

// ── Contract board ────────────────────────────────────────────────────────
// Five systems offer work in five shapes. This shows all of it in one place,
// grouped by whether anyone has taken it, so "what is everyone agreeing to"
// is answerable without reading the ledger.
const contractSearch = document.querySelector("#contract-search");
const contractFilterParty = document.querySelector("#contract-filter-party");
const contractFilterKind = document.querySelector("#contract-filter-kind");
const contractFilterState = document.querySelector("#contract-filter-state");
const contractBoardSummary = document.querySelector("#contract-board-summary");
const contractTable = document.querySelector("#contract-table");
const contractPauseButton = document.querySelector("#contract-pause");

// Pause freezes only the DISPLAY, exactly like the ledger: the simulation keeps
// running underneath and resuming shows wherever everything got to.
let contractPaused = false;
let contractFrozenRows = null;

contractPauseButton?.addEventListener("click", () => {
  contractPaused = !contractPaused;
  contractFrozenRows = contractPaused ? listContracts(state) : null;
  contractPauseButton.textContent = contractPaused ? "Resume" : "Pause";
  contractPauseButton.classList.toggle("is-active", contractPaused);
  renderContractBoard();
});

// Elapsed time in the plainest units that still read at a glance.
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatClock(at) {
  if (!at) return null;
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString();
}

const CONTRACT_STATE_LABELS = {
  [CONTRACT_STATE.AVAILABLE]: "Up for grabs",
  [CONTRACT_STATE.TAKEN]: "Being worked",
  [CONTRACT_STATE.BLOCKED]: "Stuck",
  [CONTRACT_STATE.DONE]: "Completed",
};

// Sort so the board reads as a priority list: what nobody has taken first,
// then what is stuck, then live work, then history.
const CONTRACT_STATE_ORDER = [CONTRACT_STATE.AVAILABLE, CONTRACT_STATE.BLOCKED, CONTRACT_STATE.TAKEN, CONTRACT_STATE.DONE];

[contractSearch, contractFilterParty, contractFilterKind, contractFilterState].forEach((control) => {
  control?.addEventListener("input", () => renderContractBoard());
  control?.addEventListener("change", () => renderContractBoard());
});

// Send the observer to the ledger already searching for this contract, so
// "what actually happened to it" is one click rather than a manual hunt.
function openContractInLedger(contractId) {
  const ledgerTab = document.querySelector('[data-observatory-tab="ledger"]');
  if (!ledgerTab || !contractId) return;
  ledgerTab.click();
  const search = document.querySelector("#ledger-search");
  if (search) {
    search.value = contractId;
    search.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function contractLinkButton(label, title, onClick, enabled = true) {
  const button = diagElement("button", "quick-link-button", enabled ? label : "—");
  button.type = "button";
  button.disabled = !enabled;
  button.title = enabled ? title : "Nothing to open";
  if (enabled) {
    button.addEventListener("click", (event) => { event.stopPropagation(); onClick(); });
  }
  return button;
}

function renderContractBoard() {
  if (!contractTable || observatoryTab !== "contracts") return;
  const all = contractPaused && contractFrozenRows ? contractFrozenRows : listContracts(state);

  // Keep the party list in sync without losing the current selection.
  if (contractFilterParty) {
    const parties = listContractParties(all);
    const selected = contractFilterParty.value;
    const signature = parties.map((party) => party.id).join("|");
    if (contractFilterParty.dataset.signature !== signature) {
      contractFilterParty.dataset.signature = signature;
      contractFilterParty.replaceChildren(
        Object.assign(document.createElement("option"), { value: "", textContent: "All parties" }),
        ...parties.map((party) => Object.assign(document.createElement("option"), { value: party.id, textContent: party.name })),
      );
      contractFilterParty.value = parties.some((party) => party.id === selected) ? selected : "";
    }
  }

  const wanted = contractFilterState?.value || null;
  const rows = filterContracts(all, {
    party: contractFilterParty?.value || null,
    kind: contractFilterKind?.value || null,
    search: contractSearch?.value ?? "",
  }).filter((contract) => !wanted || contract.state === wanted);

  const counts = summarizeContracts(rows);
  if (contractBoardSummary) {
    contractBoardSummary.textContent = `${rows.length} of ${all.length} · ${counts.available ?? 0} open, ${counts.taken ?? 0} working, ${counts.done ?? 0} done, ${counts.blocked ?? 0} stuck${contractPaused ? " · paused" : ""}`;
  }

  if (rows.length === 0) {
    contractTable.replaceChildren(diagElement("p", "observatory-empty", all.length === 0
      ? "No contracts yet — run the simulation for a moment."
      : "No contracts match those filters."));
    return;
  }

  const sorted = [...rows].sort((first, second) => {
    const byState = CONTRACT_STATE_ORDER.indexOf(first.state) - CONTRACT_STATE_ORDER.indexOf(second.state);
    return byState !== 0 ? byState : (second.at ?? 0) - (first.at ?? 0);
  });

  // Everything the projection carries. A dash means the underlying record does
  // not hold that field — it is not a rendering gap.
  const now = Date.now();
  const credits = (value) => (value === null || value === undefined ? null : `${Math.round(value)} cr`);
  const columns = [
    ["Created", (row) => formatClock(row.createdAt)],
    ["Age / closed", (row) => (row.closedAt
      ? `closed ${formatDuration(row.closedAt - (row.createdAt ?? row.closedAt)) ?? ""}`.trim()
      : formatDuration(now - (row.createdAt ?? now)))],
    ["ID", (row) => row.id],
    ["Contract", (row) => row.title],
    ["Buyer", (row) => row.buyerName],
    ["Type", (row) => row.kind],
    ["Qty", (row) => row.units],
    ["Resource", (row) => (row.resourceId ? `${String(row.resourceId).replaceAll("-", " ")}${row.family ? ` (${row.family})` : ""}` : null)],
    ["Unit price", (row) => credits(row.unitPrice)],
    ["Seller", (row) => row.sellerName],
    ["Detail", (row) => row.note],
    ["Status", (row) => CONTRACT_STATE_LABELS[row.state] ?? row.state],
    ["Assigned", (row) => row.supplierName ?? "unclaimed"],
    ["Goods", (row) => credits(row.goodsPayment)],
    ["Freight/service", (row) => credits(row.servicePayment)],
    // The four not named in the requested order, kept rather than dropped.
    ["Issued by", (row) => row.issuerName],
    ["Source", (row) => row.originSiteId],
    ["Destination", (row) => row.siteId],
    ["Remaining", (row) => row.remainingUnits],
  ];

  const table = diagElement("table", "observatory-table contract-board-table");
  const headRow = diagElement("tr");
  columns.forEach(([label]) => headRow.append(diagElement("th", null, label)));
  headRow.append(diagElement("th", null, "View"));
  const thead = diagElement("thead");
  thead.append(headRow);

  const tbody = diagElement("tbody");
  sorted.forEach((row) => {
    const tableRow = diagElement("tr", `contract-state-${row.state}`);
    columns.forEach(([, read]) => {
      const value = read(row);
      tableRow.append(diagElement("td", null, value === null || value === undefined || value === "" ? "—" : value));
    });

    // The party worth watching is whoever is doing the work; failing that,
    // whoever is waiting on it.
    const focusId = row.supplierId ?? row.issuerId;
    const viewCell = diagElement("td", "contract-view-cell");
    viewCell.append(createCenterCameraButton(focusId));
    viewCell.append(contractLinkButton("Ledger", "Search the ledger for this contract", () => openContractInLedger(row.id), Boolean(row.id)));
    tableRow.append(viewCell);

    // Clicking the row opens whoever is involved in the actor panel, where the
    // why-chain and the rest of their state already live.
    tableRow.addEventListener("click", () => { if (focusId) selectActorForDiagnostics(focusId); });
    if (row.detail?.length) tableRow.title = row.detail.join(" | ");
    tbody.append(tableRow);
  });

  table.append(thead, tbody);
  contractTable.replaceChildren(table);
}

function diagElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function diagSection(title, contentNode) {
  const section = diagElement("div", "diag-section");
  section.append(diagElement("h4", null, title), contentNode);
  return section;
}

function diagRows(pairs) {
  const list = diagElement("dl", "diag-rows");
  pairs.filter(([, value]) => value !== null && value !== undefined && value !== "").forEach(([label, value]) => {
    list.append(diagElement("dt", null, label), diagElement("dd", null, value));
  });
  return list;
}

function formatDiagRelativeTime(timestamp) {
  if (!timestamp) return null;
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  if (seconds > 0) return `in ${seconds}s`;
  return `${Math.abs(seconds)}s ago`;
}

function formatCargoMap(cargoMap) {
  const entries = Object.entries(cargoMap ?? {}).filter(([, quantity]) => quantity > 0);
  return entries.length ? entries.map(([type, quantity]) => `${quantity} ${type}`).join(", ") : "";
}

function formatInventorySnapshot(inventories) {
  const entries = Object.entries(inventories ?? {}).flatMap(([key, value]) => {
    if (value && typeof value === "object") {
      return Object.entries(value).filter(([, quantity]) => quantity > 0).map(([item, quantity]) => `${quantity} ${item}`);
    }
    return value > 0 ? [`${value} ${key}`] : [];
  });
  return entries.length ? entries.join(", ") : "empty";
}

function renderActorDiagnostic() {
  if (!actorDiagnosticPanel || actorDiagnosticPanel.hidden || !selectedActorId || !actorDiagnosticBody) return;
  const view = inspectActor(state, selectedActorId, { game });
  if (!view) {
    actorDiagnosticBody.replaceChildren(diagElement("p", "observatory-empty", "No diagnostic record for this actor yet."));
    return;
  }

  actorDiagnosticName.textContent = view.name;
  actorDiagnosticKind.textContent = `${view.kind}${view.controllerId ? ` · ${view.controllerId}` : ""}`;

  const fragments = [];

  const statusWrap = diagElement("div");
  const cameraRow = diagElement("div", "diag-camera-row");
  const focusedId = game.getCameraFocusId?.() ?? null;
  if (focusedId === selectedActorId) {
    const release = diagElement("button", "quick-link-button", "Release camera");
    release.type = "button";
    release.addEventListener("click", () => { game.setCameraFocus(null); renderActorDiagnostic(); });
    cameraRow.append(diagElement("span", "diag-camera-note", "camera is following this actor"), release);
  } else {
    cameraRow.append(createCenterCameraButton(selectedActorId));
  }
  statusWrap.append(
    diagElement("span", `diag-state is-${view.state}`, view.state),
    cameraRow,
    diagRows([
      ["Location", view.locationSiteId ?? (view.position ? `${view.position.x}, ${view.position.y}` : null)],
      ["Doing", view.summary],
      ["Intention", view.intention?.goal],
      ["Contract", view.intention?.contractId],
    ]),
  );
  fragments.push(diagSection("Status", statusWrap));

  if (view.blockerChain.length > 0) {
    const chain = diagElement("div", "diag-chain");
    view.blockerChain.forEach((line, index) => {
      const row = diagElement("div", `diag-chain-line${index > 0 ? " is-cause" : ""}`);
      row.style.marginLeft = `${line.indent * 12}px`;
      row.append(diagElement("span", "diag-chain-kind", line.kind), diagElement("span", null, line.summary));
      chain.append(row);
    });
    fragments.push(diagSection("Why it is stopped", chain));
    fragments.push(diagSection("Waiting", diagRows([
      ["Waiting for", view.waitingFor],
      ["Wakes on", (view.wakeOn ?? []).join(", ")],
      ["Reconsiders", formatDiagRelativeTime(view.nextReconsiderAt)],
    ])));
  }

  if (view.lastDecision) {
    const decisions = diagElement("div");
    const chosen = diagElement("div", "diag-alt is-chosen");
    chosen.append(
      diagElement("span", null, `✓ ${view.lastDecision.chosen?.label ?? view.lastDecision.chosen?.id ?? "chosen"}`),
      diagElement("span", "diag-alt-score", view.lastDecision.chosen?.score ?? ""),
    );
    decisions.append(chosen);
    (view.lastDecision.alternatives ?? []).forEach((alternative) => {
      const row = diagElement("div", "diag-alt");
      row.append(diagElement("span", null, alternative.label ?? alternative.id), diagElement("span", "diag-alt-score", alternative.score ?? ""));
      if (alternative.rejectedBecause) row.append(diagElement("span", "diag-alt-why", alternative.rejectedBecause));
      decisions.append(row);
    });
    if (view.lastDecision.reasons?.length) {
      const reasons = diagElement("ul", "diag-list");
      view.lastDecision.reasons.forEach((reason) => reasons.append(diagElement("li", null, reason)));
      decisions.append(reasons);
    }
    fragments.push(diagSection(`Last evaluation (${formatDiagRelativeTime(view.lastDecision.at) ?? "—"})`, decisions));
  }

  if (view.cargo) {
    fragments.push(diagSection("Cargo", diagRows([
      ["Held", formatCargoMap(view.cargo.held) || "empty"],
      ["Committed to", view.cargo.committedTo],
      ["Uncommitted", view.cargo.uncommitted ? (formatCargoMap(view.cargo.uncommitted) || "none") : "all cargo is committed"],
    ])));
  }
  if (view.cash) {
    fragments.push(diagSection("Cash", diagRows([
      ["Balance", view.cash.balance],
      ["Committed", view.cash.committed],
      ["Protected", view.cash.protectedCash],
      ["Available", view.cash.available],
      ["Upkeep costs", view.cash.maintenanceCost],
    ])));
  }
  if (view.condition) {
    fragments.push(diagSection("Condition", diagRows([
      ["Wear", view.condition.wear],
      ["Status", view.condition.maintenanceStatus],
      ["Pending issue", view.condition.pendingIssue],
      ["Faults so far", view.condition.issueCount],
    ])));
  }

  const offerList = diagElement("ul", "diag-list");
  if (view.visibleOffers.length === 0) offerList.append(diagElement("li", null, "no public offers visible from here"));
  view.visibleOffers.forEach((offer) => {
    offerList.append(diagElement("li", null, `[${offer.kind}] ${offer.label} — ${offer.price} cr${offer.available === false ? " (no stock)" : ""}`));
  });
  const marketWrap = diagElement("div");
  marketWrap.append(offerList, diagRows([
    ["Beacon access", view.beaconAccess?.siteIds ? view.beaconAccess.siteIds.join(", ") : view.beaconAccess?.note],
  ]));
  fragments.push(diagSection("Visible markets", marketWrap));

  if (view.freightBids?.length) {
    const bids = diagElement("ul", "diag-list");
    view.freightBids.forEach((market) => {
      const bid = market.bid;
      const outcome = market.winnerShipId === selectedActorId ? "won" : `lost to ${market.winnerShipId ?? "no eligible carrier"}`;
      bids.append(diagElement("li", null, `${market.templateId}: ${outcome}; score ${Math.round(bid.selectionScore * 10) / 10}, ask ${bid.askingPrice} / offer ${bid.offeredPrice}, cost ${Math.round(bid.costToServe)}`));
    });
    fragments.push(diagSection("Freight bids", bids));
  }

  if (view.institution) {
    const institution = diagElement("div");
    institution.append(diagRows([
      ["Balance", view.institution.account?.balance],
      ["Committed", view.institution.account?.committed],
      ["Available", view.institution.account?.available],
      ["Inventory", formatInventorySnapshot(view.institution.inventories)],
      ["Local resources", view.institution.renewableResources?.join(", ")],
      ["Berth", view.institution.facilities?.berth],
      ["Mill", view.institution.facilities?.mill],
      ["Open orders", view.institution.openOrders.length],
      ["Deferred requests", view.institution.deferred.length],
    ]));
    if (view.institution.openOrders.length) {
      const orders = diagElement("ul", "diag-list");
      view.institution.openOrders.forEach((order) => {
        orders.append(diagElement("li", null, `${order.id}: ${order.delivered}/${order.required} ${order.item} @ ${order.unitPrice}${order.repriceCount ? ` (repriced ×${order.repriceCount})` : ""}`));
      });
      institution.append(orders);
    }
    if (view.institution.repairs.length) {
      const repairs = diagElement("ul", "diag-list");
      view.institution.repairs.forEach((repair) => {
        repairs.append(diagElement("li", null, `${repair.id}: ${repair.subject} — ${repair.condition} [${repair.status}] ${repair.price} cr`));
      });
      institution.append(repairs);
    }
    if (view.institution.needs.length) {
      const needs = diagElement("ul", "diag-list");
      view.institution.needs.forEach((need) => needs.append(diagElement("li", null, `${need.itemId}: short ${need.missing} (${need.urgency})`)));
      institution.append(needs);
    }
    fragments.push(diagSection("Institution", institution));
  }

  if (view.detail) {
    fragments.push(diagSection("Snapshot", diagRows(
      Object.entries(view.detail).map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(value) : value]),
    )));
  }

  actorDiagnosticBody.replaceChildren(...fragments);
}

function renderObservatory() {
  if (!observatoryPanel || observatoryPanel.hidden || !observatoryBody) return;
  if (observatoryTab === "contracts") { renderContractBoard(); return; }
  // Ledger/stats/population panes are driven by the existing HUD render path.
  if (!OBSERVATORY_TABLE_TABS.has(observatoryTab)) return;
  const search = observatorySearch?.value?.trim() ?? "";
  const rows = observatoryTab === "blockers"
    ? listBlocked(state).map((record) => ({
        actorId: record.actorId,
        name: record.actorName,
        kind: record.actorKind,
        state: record.state,
        blockerKind: record.blocker?.kind ?? record.state,
        blockerSummary: record.blocker?.summary ?? record.summary,
        waitingFor: record.waitingFor,
        wakeOn: (record.wakeOn ?? []).join(", "),
      }))
    : listInspectableActors(state, { game });

  const filtered = search
    ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))
    : rows;

  if (observatoryCount) observatoryCount.textContent = `${filtered.length} / ${rows.length}`;

  if (filtered.length === 0) {
    observatoryBody.replaceChildren(diagElement("p", "observatory-empty", rows.length === 0
      ? "No diagnostics recorded yet — run the simulation for a moment."
      : "No rows match that filter."));
    return;
  }

  const columns = observatoryTab === "blockers"
    ? [["Actor", "name"], ["State", "state"], ["Blocker", "blockerKind"], ["Why", "blockerSummary"], ["Waiting for", "waitingFor"], ["Wakes on", "wakeOn"]]
    : [["Actor", "name"], ["Kind", "kind"], ["State", "state"], ["Location", "locationSiteId"], ["Doing", "summary"], ["Blocker", "blockerKind"], ["Last action", "lastAction"]];

  const table = diagElement("table", "observatory-table");
  const headRow = diagElement("tr");
  columns.forEach(([label]) => headRow.append(diagElement("th", null, label)));
  headRow.append(diagElement("th", null, "View"));
  const thead = diagElement("thead");
  thead.append(headRow);
  const tbody = diagElement("tbody");
  filtered.forEach((row) => {
    const tableRow = diagElement("tr");
    columns.forEach(([, key]) => tableRow.append(diagElement("td", null, row[key] ?? "—")));
    const viewCell = diagElement("td");
    viewCell.append(createCenterCameraButton(row.actorId));
    tableRow.append(viewCell);
    tableRow.addEventListener("click", () => selectActorForDiagnostics(row.actorId));
    tbody.append(tableRow);
  });
  table.append(thead, tbody);
  observatoryBody.replaceChildren(table);
}

// Point the camera at an actor so you can actually see where it is. Only offered
// for actors that exist physically in the world (institutions have no position).
function createCenterCameraButton(actorId) {
  const target = getInspectableWorldActors().find((actor) => actor.id === actorId);
  const exists = Boolean(target);
  const button = diagElement("button", "quick-link-button", exists ? "Center" : "—");
  button.type = "button";
  button.disabled = !exists;
  if (!exists) {
    button.title = "No known world position";
    return button;
  }
  button.title = "Center the camera on this actor (releases when you thrust)";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    game.setCameraFocus(target);
    selectActorForDiagnostics(actorId);
    if (observatoryPanel) observatoryPanel.hidden = true;
  });
  return button;
}

// Diagnostics are a projection, so refreshing is a cheap read — but there is no
// need to rebuild tables every frame.
window.setInterval(() => {
  renderActorDiagnostic();
  renderObservatory();
}, 700);

window.__asteroids.diagnostics = {
  inspect: (actorId) => inspectActor(state, actorId, { game }),
  list: () => listInspectableActors(state, { game }),
  blocked: () => listBlocked(state),
  select: selectActorForDiagnostics,
};

// ── Ledger event browser ────────────────────────────────────────────────────
// The searchable historical record. Developer view: exposes everything. Future
// in-world access rules (beacon access, authority, ownership, investigation,
// concealment) belong in a separate access layer — deliberately NOT applied
// here, so the player is never made omniscient by reusing this view.

const ledgerSearchInput = document.querySelector("#ledger-search");
const ledgerFilterActor = document.querySelector("#ledger-filter-actor");
const ledgerFilterInstitution = document.querySelector("#ledger-filter-institution");
const ledgerFilterLocation = document.querySelector("#ledger-filter-location");
const ledgerFilterType = document.querySelector("#ledger-filter-type");
const ledgerFilterContract = document.querySelector("#ledger-filter-contract");
const ledgerFilterService = document.querySelector("#ledger-filter-service");
const ledgerFilterRetention = document.querySelector("#ledger-filter-retention");
const ledgerFilterVisibility = document.querySelector("#ledger-filter-visibility");
const ledgerFilterRange = document.querySelector("#ledger-filter-range");
const ledgerOnlyCausal = document.querySelector("#ledger-only-causal");
const ledgerOnlyDurable = document.querySelector("#ledger-only-durable");
const ledgerSortSelect = document.querySelector("#ledger-sort");
const ledgerPauseButton = document.querySelector("#ledger-pause");
const ledgerResetButton = document.querySelector("#ledger-reset-filters");
const ledgerCountLabel = document.querySelector("#ledger-count");
const ledgerTableWrap = document.querySelector("#ledger-table-wrap");
const ledgerDetailPanel = document.querySelector("#ledger-detail");

const LEDGER_PAGE_SIZE = 250;
let ledgerPaused = false;
let ledgerFrozenEvents = null;
let ledgerSelectedEventId = null;
let ledgerRenderKey = null;

function readLedgerFilters() {
  const rangeSeconds = Number(ledgerFilterRange?.value ?? 0);
  return {
    search: ledgerSearchInput?.value ?? "",
    actorId: ledgerFilterActor?.value ?? "",
    institutionId: ledgerFilterInstitution?.value ?? "",
    locationId: ledgerFilterLocation?.value ?? "",
    type: ledgerFilterType?.value ?? "",
    contractId: ledgerFilterContract?.value ?? "",
    serviceId: ledgerFilterService?.value ?? "",
    retentionClass: ledgerFilterRetention?.value ?? "",
    visibility: ledgerFilterVisibility?.value ?? "",
    sinceMs: rangeSeconds > 0 ? Date.now() - rangeSeconds * 1000 : null,
    onlyCausal: Boolean(ledgerOnlyCausal?.checked),
    onlyDurable: Boolean(ledgerOnlyDurable?.checked),
  };
}

// Developer view reads the whole stream, hidden events included.
function getLedgerSourceEvents() {
  if (ledgerPaused && ledgerFrozenEvents) return ledgerFrozenEvents;
  return state.ledger.getRecentEvents(6000, { includeHidden: true });
}

function setLedgerSelectOptions(select, options, placeholder) {
  if (!select) return;
  const previous = select.value;
  const desired = [`|${placeholder}`, ...options.map((option) => `${option.id}|${option.name}`)].join("\n");
  if (select.dataset.optionsKey === desired) {
    select.value = previous;
    return;
  }
  select.dataset.optionsKey = desired;
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  const nodes = [placeholderOption, ...options.map((option) => {
    const node = document.createElement("option");
    node.value = option.id;
    node.textContent = option.name;
    return node;
  })];
  select.replaceChildren(...nodes);
  select.value = options.some((option) => option.id === previous) ? previous : "";
}

function formatEventAge(time) {
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function ledgerReferenceLabel(references) {
  const first = references[0];
  if (!first) return null;
  return references.length > 1 ? `${first.name} +${references.length - 1}` : first.name;
}

function renderLedgerBrowser({ force = false } = {}) {
  if (!observatoryPanel || observatoryPanel.hidden || observatoryTab !== "ledger" || !ledgerTableWrap) return;

  const sourceEvents = getLedgerSourceEvents();
  const options = collectFilterOptions(sourceEvents);
  setLedgerSelectOptions(ledgerFilterActor, options.actors, "any actor");
  setLedgerSelectOptions(ledgerFilterInstitution, options.institutions, "any institution");
  setLedgerSelectOptions(ledgerFilterLocation, options.locations, "any location");
  setLedgerSelectOptions(ledgerFilterType, options.types, "any event type");
  setLedgerSelectOptions(ledgerFilterContract, options.contracts, "any contract");
  setLedgerSelectOptions(ledgerFilterService, options.services, "any service");

  const filters = readLedgerFilters();
  const matched = sortEvents(filterEvents(sourceEvents, filters), ledgerSortSelect?.value ?? "newest");
  const page = matched.slice(0, LEDGER_PAGE_SIZE);

  if (ledgerCountLabel) {
    ledgerCountLabel.textContent = `${matched.length} / ${sourceEvents.length}${matched.length > page.length ? ` (showing ${page.length})` : ""}${ledgerPaused ? " · paused" : ""}`;
  }

  // Cheap identity check so we do not rebuild the table every tick.
  const key = [
    ledgerPaused, ledgerSortSelect?.value, ledgerSelectedEventId,
    JSON.stringify(filters), page.length, page[0]?.id, page[page.length - 1]?.id,
  ].join("|");
  if (!force && key === ledgerRenderKey) return;
  ledgerRenderKey = key;

  if (page.length === 0) {
    ledgerTableWrap.replaceChildren(diagElement("p", "observatory-empty",
      sourceEvents.length === 0 ? "No events recorded yet." : "No events match these filters."));
    return;
  }

  const columns = [
    ["Age", (event) => formatEventAge(event.time)],
    ["Type", (event) => event.type],
    ["Ret", (event) => describeEventRetention(event).slice(0, 4)],
    ["Vis", (event) => getEventVisibility(event).slice(0, 4)],
    ["Actor", (event) => ledgerReferenceLabel(extractEventReferences(event).actor)],
    ["Institution", (event) => ledgerReferenceLabel(extractEventReferences(event).institution)],
    ["Location", (event) => ledgerReferenceLabel(extractEventReferences(event).location)],
    ["Contract / service", (event) => {
      const references = extractEventReferences(event);
      return ledgerReferenceLabel([...references.contract, ...references.service]);
    }],
    ["Summary", (event) => summarizeEvent(event)],
  ];

  const table = diagElement("table", "observatory-table ledger-table");
  const headRow = diagElement("tr");
  columns.forEach(([label]) => headRow.append(diagElement("th", null, label)));
  const thead = diagElement("thead");
  thead.append(headRow);
  const tbody = diagElement("tbody");

  page.forEach((event) => {
    const row = diagElement("tr", `ledger-row is-${describeEventRetention(event)}${event.id === ledgerSelectedEventId ? " is-selected" : ""}`);
    columns.forEach(([, read]) => row.append(diagElement("td", null, read(event) ?? "—")));
    row.addEventListener("click", () => {
      ledgerSelectedEventId = event.id;
      renderLedgerBrowser({ force: true });
    });
    tbody.append(row);
  });

  table.append(thead, tbody);
  ledgerTableWrap.replaceChildren(table);
  renderLedgerDetail(sourceEvents);
}

// Clickable actions for a referenced entity. Only offers camera centering when
// the entity actually has a live physical position.
function ledgerEntityActions(kind, reference) {
  const wrap = diagElement("span", "ledger-entity-actions");
  const worldTarget = getInspectableWorldActors().find((actor) => actor.id === reference.id);
  const hasBody = Boolean(worldTarget);
  const hasDiagnostic = Boolean(listInspectableActors(state, { game }).find((entry) => entry.actorId === reference.id));

  const filterButton = diagElement("button", "quick-link-button", "Filter");
  filterButton.type = "button";
  filterButton.title = "Filter the ledger to this entity";
  filterButton.addEventListener("click", () => {
    const target = {
      actor: ledgerFilterActor, institution: ledgerFilterInstitution, location: ledgerFilterLocation,
      contract: ledgerFilterContract, service: ledgerFilterService,
    }[kind];
    if (target) {
      target.value = reference.id;
      renderLedgerBrowser({ force: true });
    }
  });
  wrap.append(filterButton);

  if (hasDiagnostic) {
    const inspectButton = diagElement("button", "quick-link-button", "Inspect");
    inspectButton.type = "button";
    inspectButton.title = "Open this actor's diagnostic panel";
    inspectButton.addEventListener("click", () => selectActorForDiagnostics(reference.id));
    wrap.append(inspectButton);
  }
  if (hasBody) {
    const centerButton = diagElement("button", "quick-link-button", "Center");
    centerButton.type = "button";
    centerButton.title = "Center the camera on this entity";
    centerButton.addEventListener("click", () => {
      game.setCameraFocus(worldTarget);
      if (observatoryPanel) observatoryPanel.hidden = true;
    });
    wrap.append(centerButton);
  }
  return wrap;
}

function ledgerRelatedGroup(title, entries, note) {
  if (!entries || entries.length === 0) return null;
  const list = diagElement("ul", "diag-list ledger-related");
  entries.forEach((entry) => {
    const item = diagElement("li");
    const link = diagElement("button", "ledger-event-link", `#${entry.event.id} ${entry.event.type}`);
    link.type = "button";
    link.title = summarizeEvent(entry.event);
    link.addEventListener("click", () => {
      ledgerSelectedEventId = entry.event.id;
      renderLedgerBrowser({ force: true });
    });
    item.append(link);
    if (entry.via) item.append(diagElement("span", "ledger-related-via", ` via ${entry.via}`));
    list.append(item);
  });
  const section = diagSection(`${title} (${entries.length})`, list);
  if (note) section.append(diagElement("p", "ledger-note", note));
  return section;
}

function renderLedgerDetail(sourceEvents) {
  if (!ledgerDetailPanel) return;
  const event = sourceEvents.find((candidate) => candidate.id === ledgerSelectedEventId);
  if (!event) {
    ledgerDetailPanel.replaceChildren(diagElement("p", "observatory-empty", "Select an event to inspect its references, causes, and raw payload."));
    return;
  }

  const described = describeEvent(sourceEvents, event);
  const fragments = [];

  fragments.push(diagSection("Event", diagRows([
    ["ID", `#${described.id}`],
    ["Type", described.type],
    ["When", new Date(described.time).toLocaleString()],
    ["Age", formatEventAge(described.time)],
    ["Retention", described.retentionClass],
    ["Visibility", described.visibility],
    ["Feed", described.visible ? "player-visible" : "hidden (developer only)"],
  ])));

  fragments.push(diagSection("What happened", diagElement("p", "ledger-summary", described.summary)));

  // Involved entities, each with actions.
  const referenceGroups = [
    ["actor", "Actors & ships"],
    ["institution", "Institutions"],
    ["asset", "Assets"],
    ["location", "Locations"],
    ["contract", "Contracts"],
    ["service", "Services & orders"],
  ];
  referenceGroups.forEach(([kind, title]) => {
    const list = described.references[kind];
    if (!list || list.length === 0) return;
    const container = diagElement("div", "ledger-entities");
    list.forEach((reference) => {
      const row = diagElement("div", "ledger-entity");
      row.append(diagElement("span", "ledger-entity-name", reference.name));
      row.append(diagElement("span", "ledger-entity-field", reference.field));
      row.append(ledgerEntityActions(kind, reference));
      container.append(row);
    });
    fragments.push(diagSection(title, container));
  });

  if (Object.keys(described.amounts).length > 0) {
    fragments.push(diagSection("Amounts", diagRows(Object.entries(described.amounts))));
  }

  if (described.causes.length > 0) {
    fragments.push(diagSection("Explicit cause references", diagRows(
      described.causes.map((cause) => [cause.field, cause.id]),
    )));
  }

  // Sequences. Labels distinguish proven causal references from structural
  // same-record links so nothing reads as inferred causation.
  const related = [
    ledgerRelatedGroup("Caused by", described.related.causedBy, "Events naming a record this event explicitly cites."),
    ledgerRelatedGroup("Caused", described.related.caused, "Later events whose own cause field names a record here."),
    ledgerRelatedGroup("Earlier in this record", described.related.preceded, "Same contract/order — sequence, not proven causation."),
    ledgerRelatedGroup("Followed by", described.related.followed, "Same contract/order, later in time."),
    ledgerRelatedGroup("Same contract", described.related.sameContract),
    ledgerRelatedGroup("Same actor", described.related.sameActor),
    ledgerRelatedGroup("Same asset", described.related.sameAsset),
  ].filter(Boolean);
  if (related.length === 0) {
    fragments.push(diagSection("Sequences", diagElement("p", "ledger-note", "No explicit references link this event to others.")));
  } else {
    fragments.push(...related);
  }

  // Raw payload, developer-only, collapsed by default.
  const details = document.createElement("details");
  details.className = "ledger-raw";
  const summaryNode = document.createElement("summary");
  summaryNode.textContent = "Raw payload (developer)";
  const pre = diagElement("pre", "ledger-raw-json", JSON.stringify(described.payload, null, 2));
  details.append(summaryNode, pre);
  fragments.push(details);

  ledgerDetailPanel.replaceChildren(...fragments);
}

[ledgerSearchInput, ledgerFilterActor, ledgerFilterInstitution, ledgerFilterLocation, ledgerFilterType,
  ledgerFilterContract, ledgerFilterService, ledgerFilterRetention, ledgerFilterVisibility,
  ledgerFilterRange, ledgerOnlyCausal, ledgerOnlyDurable, ledgerSortSelect].forEach((control) => {
  control?.addEventListener("input", () => renderLedgerBrowser({ force: true }));
  control?.addEventListener("change", () => renderLedgerBrowser({ force: true }));
});

// Pause freezes only the DISPLAY. The simulation and the ledger keep running;
// unpausing shows everything that arrived meanwhile.
ledgerPauseButton?.addEventListener("click", () => {
  ledgerPaused = !ledgerPaused;
  ledgerFrozenEvents = ledgerPaused ? state.ledger.getRecentEvents(6000, { includeHidden: true }) : null;
  ledgerPauseButton.textContent = ledgerPaused ? "Resume" : "Pause";
  ledgerPauseButton.classList.toggle("is-active", ledgerPaused);
  renderLedgerBrowser({ force: true });
});

ledgerResetButton?.addEventListener("click", () => {
  [ledgerSearchInput, ledgerFilterActor, ledgerFilterInstitution, ledgerFilterLocation, ledgerFilterType,
    ledgerFilterContract, ledgerFilterService, ledgerFilterRetention, ledgerFilterVisibility].forEach((control) => {
    if (control) control.value = "";
  });
  if (ledgerFilterRange) ledgerFilterRange.value = "0";
  if (ledgerOnlyCausal) ledgerOnlyCausal.checked = false;
  if (ledgerOnlyDurable) ledgerOnlyDurable.checked = false;
  renderLedgerBrowser({ force: true });
});

window.setInterval(() => renderLedgerBrowser(), 900);

window.__asteroids.ledgerBrowser = {
  filters: readLedgerFilters,
  describe: (eventId) => {
    const events = state.ledger.getRecentEvents(6000, { includeHidden: true });
    return describeEvent(events, events.find((event) => event.id === eventId));
  },
  select: (eventId) => { ledgerSelectedEventId = eventId; renderLedgerBrowser({ force: true }); },
  isPaused: () => ledgerPaused,
};
