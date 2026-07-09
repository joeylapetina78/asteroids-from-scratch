import { getProcessorOutputs, normalizeProcessorOutput } from "./components/componentRules.js?v=fresh-20260708-patrol11";
import { getResourceColor, getResourceShape, normalizeResourceType } from "./systems/resourceDefinitions.js?v=fresh-20260708-patrol11";
import { drawResourceShape } from "./entities/ResourcePickup.js?v=fresh-20260708-patrol11";
import { shipOffers } from "./content/ships/shipOffers.js?v=fresh-20260708-patrol11";
import { chapterOneRoute, storyRegions, yardExchangeServices } from "./content/storyWorld.js?v=fresh-20260708-patrol11";
import { Game } from "./game.js?v=fresh-20260708-patrol11";
import { createContractManager } from "./systems/contractManager.js?v=fresh-20260708-patrol11";
import { COMMS_SOURCES, createCommsDirector } from "./systems/commsDirector.js?v=fresh-20260708-patrol11";
import { createGameAudio } from "./systems/audio.js?v=fresh-20260708-patrol11";
import { canSpendCredits, depositCredits, getCredits, spendCredits } from "./systems/accounts.js?v=fresh-20260708-patrol11";
import {
  getHubServiceBehavior,
  getHubServicePrompt,
  getServiceTypesForPanel,
  shouldKeepServiceWindowOpen,
} from "./systems/hubServiceBehaviors.js?v=fresh-20260708-patrol11";
import { getInProgressServiceContractId, getNextHubServiceContractId } from "./systems/hubServiceContracts.js?v=fresh-20260708-patrol11";
import { getHubService, getHubServices } from "./systems/hubServices.js?v=fresh-20260708-patrol11";
import { syncActiveHullFromComponents } from "./systems/hulls.js?v=fresh-20260708-patrol11";
import { createJourneyDirector } from "./systems/journeyDirector.js?v=fresh-20260708-patrol11";
import { COMPONENT_STATE_BY_PANEL_ID } from "./systems/componentRegistry.js?v=fresh-20260708-patrol11";
import { getPilotLicense, issuePilotLicense, registerStarterDeliveryShipRecords, updateCurrentShipLegal } from "./systems/legalRecords.js?v=fresh-20260708-patrol11";
import { createShipPaperworkInspectionReport } from "./systems/paperworkInspections.js?v=fresh-20260708-patrol11";
import { Processor } from "./systems/processor.js?v=fresh-20260708-patrol11";
import { clearSavedProfile, getDevStart, loadSavedProfile, peekSavedDevStartId, restoreSavedWorld, saveProfile, shouldResetSave } from "./systems/saveManager.js?v=fresh-20260708-patrol11";
import { purchaseShipOffer } from "./systems/shipPurchase.js?v=fresh-20260708-patrol11";
import { createGameState } from "./state/gameState.js?v=fresh-20260708-patrol11";

// main.js is the browser/page coordinator. It creates the game systems, wires
// DOM controls to component state, and keeps the visible panels in sync.
const OLD_PANEL_LAYOUT_STORAGE_KEYS = [
  "asteroids.panelLayout.v1",
  "asteroids.panelLayout.v2",
  "asteroids.panelLayout.v3",
  "asteroids.panelLayout.v4",
];
const PANEL_LAYOUT_STORAGE_KEY = "asteroids.panelLayout.v5";
const JOURNEY_PANEL_Z_INDEX = 560;
const VIEWPORT_PANEL_Z_INDEX = 10;
const DESK_PANEL_MIN_Z_INDEX = 30;
const DESK_PANEL_MAX_Z_INDEX = 520;
const PROCESS_OUTPUT_AMOUNT = 50;
const CRYSTAL_VALUE_MULTIPLIER = 5;
const CARGO_UNIT_BASE_VALUES = {
  // volatile
  "water-ice":     30,
  "methane-ice":   50,
  "hydrogen":      80,
  // structural
  "iron-nickel":   20,
  "aluminum":      35,
  "titanium":      60,
  // industrial
  "silicate":      15,
  "carbonaceous":  25,
  // conductor
  "copper":        50,
  "cobalt":        80,
  "silver":       120,
  // energy
  "uranium":       90,
  "thorium":      160,
  // advanced
  "lithium":      130,
  "rare-earth":   220,
  "platinum":     300,
  // strange
  "crystal-matrix": 200,
  "anomaly-shard":  450,
  // legacy aliases
  fuel:   20,
  crystal: 200,
};
const PAPERWORK_PANEL_IDS = ["license", "document", "contract"];
const TOW_DRIVER_NAMES = ["Mara Tow", "Jax Cable", "Nell Winch", "Orson Hook"];
const YARD_EXCHANGE_CORE_SERVICES = [
  yardExchangeServices.rook,
  yardExchangeServices.shipyard,
  yardExchangeServices.finance,
  yardExchangeServices.supply,
];
const MURMUR_SERVICE_ID = yardExchangeServices.roadmap;
const STARTER_REGION_NAME = storyRegions.starterRegion.name;
const DEEP_SPACE_REGION_NAME = storyRegions.deepSpace.name;
const JOURNEY_WORD_DELAY_MS = 34;
const ATTENTION_ONCE_MS = 1800;
const PAPERWORK_DRAWER_AUTO_CLOSE_MS = 900;
const DEFAULT_PANEL_LAYOUT = {
  viewport: { x: 0, y: 0, z: 20 },
  license: { x: 980, y: 20, z: 95 },
  journey: { x: 980, y: 20, z: JOURNEY_PANEL_Z_INDEX },
  engine: { x: -300, y: 20, z: 70 },
  "beacon-locator": { x: 980, y: 300, z: 90 },
  scanner: { x: 980, y: 430, z: 88 },
  docking: { x: -300, y: 340, z: 100 },
  tow: { x: -300, y: 520, z: 125 },
  contract: { x: -300, y: 340, z: 95 },
  document: { x: -40, y: 240, z: 96 },
  finley: { x: 70, y: 120, z: 115 },
  "component-shop": { x: 80, y: 140, z: 118 },
  roadmap: { x: 120, y: 100, z: 130 },
  merchant: { x: 70, y: 120, z: 120 },
  miner: { x: 980, y: 500, z: 60 },
  collector: { x: 980, y: 680, z: 50 },
  hull: { x: -300, y: 580, z: 50 },
  world: { x: 980, y: 20, z: 40 },
  hub: { x: -300, y: 340, z: 110 },
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
const fuelFill = document.querySelector("#fuel-fill");
const hullCount = document.querySelector("#hull-count");
const hullFill = document.querySelector("#hull-fill");
const hullVin = document.querySelector("#hull-vin");
const hullDockingLock = document.querySelector("#hull-docking-lock");
const dockToggleButton = document.querySelector("#dock-toggle");
const dockingDetail = document.querySelector("#docking-detail");
const dockingTarget = document.querySelector("#docking-target");
const documentFields = document.querySelector("#document-fields");
const documentStatus = document.querySelector("#document-status");
const documentSummary = document.querySelector("#document-summary");
const documentTitle = document.querySelector("#document-title");
const documentType = document.querySelector("#document-type");
const hubDetail = document.querySelector("#hub-detail");
const hubName = document.querySelector("#hub-name");
const hubPanel = document.querySelector("[data-panel-id='hub']");
const hubServiceMenu = document.querySelector("#hub-service-menu");
const hubStatus = document.querySelector("#hub-status");
const journeyAcceptButton = document.querySelector("#journey-accept");
const journeyChapter = document.querySelector("#journey-chapter");
const journeyHelpText = document.querySelector("#journey-help-text");
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
const scanergyCount = document.querySelector("#scanergy-count");
const beaconDirectionArrow = document.querySelector("#beacon-direction-arrow");
const shipOffersPanel = document.querySelector("#ship-offers");
const shipStatus = document.querySelector("#ship-status");
const towSection = document.querySelector("#tow-section");
const towButton = document.querySelector("#tow-button");
const towCostDisplay = document.querySelector("#tow-cost");
const tractorFieldButton = document.querySelector("#tractor-field-button");
const tractorFieldStatus = document.querySelector("#tractor-field-status");
const viewportRegion = document.querySelector("#viewport-region");
const zoomInButton = document.querySelector("#zoom-in");
const zoomOutButton = document.querySelector("#zoom-out");
const zoomLabel = document.querySelector("#zoom-label");
const alphaUpButton = document.querySelector("#alpha-up");
const alphaDownButton = document.querySelector("#alpha-down");
const alphaLabel = document.querySelector("#alpha-label");
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
  hullPct: null,
  hullFraction: null,
  hullVin: null,
  minerArmed: null,
};
const state = createGameState();
const initialDevStart = getDevStart();

if (shouldResetSave() || initialDevStart || peekSavedDevStartId()) {
  clearSavedProfile();
}

const savedProfile = loadSavedProfile(state);
const audio = createGameAudio();
wireAudioUnlockGestures();
const processor = new Processor(processorCanvas, processUnit);
const cargoHold = new Processor(cargoCanvas, handleCargoUnitClick, { isClickable: true });
const game = new Game(canvas, state, updateHudDisplay, receiveCollectedResource, updateWorldDebugDisplay, updateHubDisplay, audio, updateLedgerDrivenSystems);
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
const journeyDirector = createJourneyDirector({
  state,
  game,
  emergencyTow: () => {
    game.emergencyTow();
    updateTowEstimateDisplay();
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
let lastAudioEventId = 0;
let journeyTypeTimers = [];
let _renderedMessageId = null;
let currentSiteState = null;
let activeDepositContractId = null;
let activeHubServiceId = null;
let isCargoSellModeActive = false;
let wasTowAvailable = false;
let saveTimer = null;
let lastHubAuthorityEventId = 0;
let lastRookAutoOfferEventId = 0;
let lastTowChatterEventId = 0;
let lastDockingInspectionEventId = 0;
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

  powerButton.textContent = engine.powered ? "Power Down" : "Power Ship";
  powerButton.setAttribute("aria-pressed", String(engine.powered));
  powerButton.disabled = !engine.installed || state.components.hull.integrity <= 0 || engine.powerLocked || (!engine.powered && isOutOfFuel);
  shipStatus.textContent = state.components.hull.integrity <= 0 ? "ship destroyed" : engine.powerLocked ? "power locked" : isOutOfFuel ? "out of fuel" : engine.powered ? "ship online" : "ship offline";
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
  if ((state.components.engine.fuel > 0 && state.components.hull.integrity > 0) || currentSiteState?.dockedSite || game.isTowActive()) {
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

scanButton.addEventListener("click", () => {
  game.cycleBeacon();
});

scanTrigger?.addEventListener("click", () => {
  game.triggerResourceScan();
  updateHudDisplay();
});

journeyAcceptButton.addEventListener("click", () => {
  audio.unlock();
  journeyDirector.pressJourneyButton();
  updateHudDisplay();
});

dockToggleButton.addEventListener("click", () => {
  game.toggleDock();
});

contractAcceptButton.addEventListener("click", () => {
  const contract = contractManager.getCurrentContract();

  if (contract?.status === "fulfilled") {
    activeDepositContractId = null;
    contractManager.collectPayment(contract.id);
  } else if (canPayLoanContract(contract)) {
    contractManager.payLoan(contract.id, getRequestedContractPaymentAmount(contract));
  } else if (canDepositToContract(contract)) {
    activeDepositContractId = activeDepositContractId === contract.id ? null : contract.id;
    renderContract();
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
  contractManager.showNextContract();
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
registerStarterDeliveryShipRecords(state);
clearOldPanelLayouts();
setInitialPaperworkLocations();
makePanelsDraggable();
setupPaperworkControls();
wirePanelControlSounds();
if (initialDevStart === "explorer" || initialDevStart === "panorama") {
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
  scanner:          { x: 1000, y: 560, z: 88 },
  miner:            { x: 520, y: 330, z: 60 },
  collector:        { x: 760, y: 560, z: 60 },
  processor:        { x: 520, y: 500, z: 48 },
  cargo:            { x: 500, y: 180, z: 46 },
  license:          { x: 1000, y: 100, z: 95 },
  contract:         { x: 1240, y: 180, z: 95 },
};
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
    (currentFuel <= 0 || state.components.hull.integrity <= 0);

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

  const tractorActive = state.components.collector.isActive;
  if (tractorActive !== _hud.tractorActive) {
    _hud.tractorActive = tractorActive;
    tractorFieldStatus.textContent = tractorActive ? "Pulling" : "Idle";
    tractorFieldButton.setAttribute("aria-pressed", String(tractorActive));
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

function updateBeaconLocatorDisplay() {
  const locator = state.components.beaconLocator;
  const scanner = state.components.scanner;
  const activeSite = game.worldSites.find((site) => site.id === locator.activeBeaconId);

  if (beaconTracking) {
    beaconTracking.textContent = activeSite?.name ?? "None";
  }
  if (scanButton) {
    scanButton.disabled = !locator.installed || (locator.beaconMemoryIds?.length ?? 0) === 0;
  }
  if (scanergyCount) {
    scanergyCount.textContent = String(Math.floor(scanner.scanergy));
  }
  if (scanTrigger) {
    scanTrigger.disabled = !scanner.installed || scanner.scanergy < 50;
  }

  if (!beaconDirectionArrow || !activeSite) {
    return;
  }

  const angle = Math.atan2(activeSite.position.y - game.ship.position.y, activeSite.position.x - game.ship.position.x);
  beaconDirectionArrow.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
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
      acknowledgement: { label: `Accept Tow ${estimate.cost} cr`, action: "emergencyTow" },
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
    licenseApplication.classList.add("is-dismissed");
    updateHudDisplay();
  }

  if (devStartId === "panorama") {
    setupExplorerStart();
    licenseApplication.classList.add("is-dismissed");
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
      const saved = savedLayout.panels?.[panelId];
      if (!saved || saved.panoramaLayoutVersion !== PANORAMA_LAYOUT_VERSION) {
        positionPanelById(panelId, pos);
        const panel = document.querySelector(`[data-panel-id="${panelId}"]`);
        if (panel) {
          savePanelLayout(panel, pos, {
            panoramaPlaced: true,
            panoramaLayoutVersion: PANORAMA_LAYOUT_VERSION,
          });
        }
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
    fuel: 350,
    maxFuel: 350,
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
    activeBeaconId: "yard-exchange",
  });
  Object.assign(state.components.scanner, {
    installed: true,
    scanergy: 400,
    targets: ["resources"],
  });
  Object.assign(state.components.miner, {
    installed: true,
    armed: false,
    ammo: 200,
  });
  Object.assign(state.components.processor, { installed: true });
  state.components.cargoHold.installed = true;
  state.components.docking.installed = true;
  state.components.collector.installed = true;

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
    new Set([...(state.hubServices.unlocked[chapterOneRoute.destinationSite.id] ?? []), yardExchangeServices.rook, yardExchangeServices.supply]),
  );
  state.hubServices.flags.yardCoreSeenDocked = true;

  depositCredits(state, 1000);

  setComponentAvailable("viewport", true);
  setComponentAvailable("engine", true);
  setComponentAvailable("hull", true);
  setComponentAvailable("beacon-locator", true);
  setComponentAvailable("scanner", true);
  setComponentAvailable("miner", true);
  setComponentAvailable("cargo", true);
  setComponentAvailable("docking", true);
  setComponentAvailable("contract", true);
  setComponentAvailable("processor", true);
  setComponentAvailable("collector", true);
  setComponentAvailable("license", true);
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
  hubDetail.textContent = activeService ? `${activeService.npcName}: ${getHubServicePrompt(activeService)}` : "Choose a service window.";
  renderHubServiceMenu(site);
}

function syncContractPanelVisibility() {
  const hasOpenContracts = contractManager.getOpenContractIds().length > 0;
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

function getEntityLabel(entityId) {
  const entity = state.worldRecords?.entities?.[entityId];
  return entity?.name ?? entity?.vin ?? entityId;
}

function renderHubServiceMenu(site) {
  const services = site ? getHubServices(site.id).filter((service) => isHubServiceUnlocked(site.id, service)) : [];
  const nextKey = `${site?.id ?? "none"}:${activeHubServiceId ?? "none"}:${services.map((service) => service.id).join("|")}`;

  if (hubServiceMenu.dataset.renderedKey === nextKey) {
    return;
  }

  hubServiceMenu.dataset.renderedKey = nextKey;

  if (services.length === 0) {
    hubServiceMenu.replaceChildren();
    return;
  }

  hubServiceMenu.replaceChildren(
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

  if (behavior.panelId === "merchant") {
    setComponentAvailable("merchant", true);
    renderShipOffers();
    focusPanelById("merchant");
    return;
  }

  if (behavior.offersContracts) {
    setComponentAvailable("contract", true);
    offerHubServiceContract(dockedSite, service);
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

function updateLedgerDrivenSystems() {
  contractManager.update();
  journeyDirector.update();
  commsDirector.update();
  updateRookFollowupOffers();
  updateHubAuthorityMessages();
  updateTowChatter();
  updateDockingInspection();
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
  const contractFiles = contractManager.getOpenContractIds().map((contractId) => {
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

  if (contract.type === "resource-delivery") {
    return `${contract.deliveredAmount ?? 0}/${contract.terms.amount ?? 0} ${contract.terms.resourceName}`;
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
    contractDestination.textContent = contract.terms.destinationName;
    contractTertiaryLabel.textContent = "Reward";
    contractReward.textContent = `${contract.reward.credits ?? 0} cr (${contract.reward.creditsPerUnit} cr/unit)`;
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

  if (contract.type === "resource-delivery") {
    const requiredAmount = contract.terms.amount ?? 0;
    const deliveredAmount = contract.deliveredAmount ?? 0;
    const progressPercent = requiredAmount > 0 ? Math.min(100, (deliveredAmount / requiredAmount) * 100) : 0;

    contractProgress.hidden = false;
    contractProgressLabel.textContent = "Delivered";
    contractProgressCount.textContent = `${deliveredAmount} / ${requiredAmount}`;
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

  if (contract.type === "resource-delivery" && contract.status === "active") {
    return "Dock to Deposit";
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
  return (
    contract.status === "offered" ||
    contract.status === "fulfilled" ||
    canPayLoanContract(contract) ||
    canDepositToContract(contract)
  );
}

function renderContractNavigation(contract = contractManager.getCurrentContract()) {
  const contractIds = contractManager.getOpenContractIds();
  const currentIndex = contract ? contractIds.indexOf(contract.id) : -1;
  const countLabel = contractIds.length === 1 ? "1 contract" : `${contractIds.length} contracts`;

  contractNavCount.textContent = currentIndex >= 0 ? `${currentIndex + 1}/${contractIds.length} ${countLabel}` : countLabel;
  contractNextButton.disabled = contractIds.length <= 1;
}

function canDepositToContract(contract) {
  const dockedSite = currentSiteState?.dockedSite;

  return Boolean(
    contract?.type === "resource-delivery" &&
      contract.status === "active" &&
      dockedSite &&
      dockedSite.id === contract.terms.destinationSiteId &&
      (contract.deliveredAmount ?? 0) < (contract.terms.amount ?? 0),
  );
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
    setPanelAlert(rule.panelId, getPanelAlertLevel(rule.getValue(), rule));
  });
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

function requestAttention({ targetId = null, targetType = null, panelId = null, siteId = null, serviceId = null, mode = "once", reason = "general" }) {
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
      ? "Accept this contract before filing it"
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

  const panoramaLink = document.querySelector("#journey-panorama-link");
  if (panoramaLink) {
    panoramaLink.hidden = journey.mission?.status !== "offered";
  }

  const isTrafficCheck = journey.currentStepId === "yard-traffic-check";
  hullVin.classList.toggle("needs-id-attention", isTrafficCheck && !journey.flags?.yardVinPresented);
  licenseIdDisplay.classList.toggle("needs-id-attention", isTrafficCheck && !journey.flags?.yardLicensePresented);
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

  // Track which flags have already played their flash so we only animate once
  const flashed = new Set(JSON.parse(el.dataset.flashedFlags ?? "[]"));

  const sections = [];

  // ── PATROL CHECK ─────────────────────────────────────────────────────────────
  const patrol = game?.activePatrolIntercept;
  if (patrol && (patrol.phase === "standoff" || patrol.phase === "approach" || patrol.phase === "hold")) {
    const siteName = patrol.site?.name ?? "Hub";
    const flagged = patrol.hasScanned && patrol.flaggedDismissTimer > 0;
    const reasons = patrol.flaggedReasons ?? [];

    let taskItems;
    if (flagged) {
      const docTasks = [];
      if (reasons.includes("missing-vin")) docTasks.push("Attach ship VIN plate");
      if (reasons.includes("missing-pilot-license")) docTasks.push("Obtain a pilot license");
      if (reasons.includes("unauthorized-zone-history")) docTasks.push("Resolve zone violation on record");
      if (docTasks.length === 0) docTasks.push("Resolve documentation issue");
      taskItems = docTasks.map((label) => `<li class="obj-task"><span class="obj-check">☐</span><span>${label}</span></li>`).join("");
    } else if (patrol.hasScanned) {
      const presented = pendingHubIdentityPresentations.get(patrol.site?.id)?.kinds ?? new Set();
      const vinDone = presented.has("ship-vin");
      const licDone = presented.has("pilot-license");
      const vinItem = `<li class="obj-task${vinDone ? " obj-done obj-flash" : ""}"><span class="obj-check">${vinDone ? "☑" : "☐"}</span><span>Present ship VIN</span></li>`;
      const licItem = `<li class="obj-task${licDone ? " obj-done obj-flash" : ""}"><span class="obj-check">${licDone ? "☑" : "☐"}</span><span>Present pilot authorization</span></li>`;
      taskItems = vinItem + licItem;
    } else {
      taskItems = `<li class="obj-task"><span class="obj-check">☐</span><span>Hold position — identity check in progress</span></li>`;
    }

    sections.push(`<p class="obj-section-label">Patrol Check — ${siteName}</p><ul class="obj-list">${taskItems}</ul>`);
  }

  const tasks = mission?.tasks ?? [];
  if (tasks.length > 0 && mission?.status === "active") {
    const items = tasks.map((task) => {
      const done = Boolean(flags[task.flag]);
      const justDone = done && !flashed.has(task.flag);
      if (justDone) flashed.add(task.flag);
      return `<li class="obj-task${done ? " obj-done" : ""}${justDone ? " obj-flash" : ""}"><span class="obj-check">${done ? "☑" : "☐"}</span><span>${task.label}</span></li>`;
    }).join("");
    sections.push(`<p class="obj-section-label">Tasks</p><ul class="obj-list">${items}</ul>`);
  }

  const activeContracts = contracts.filter((c) => c.status === "active" || c.status === "fulfilled");
  if (activeContracts.length > 0) {
    const items = activeContracts.map((c) => {
      let label;
      if (c.status === "fulfilled") {
        label = `Collect payment from ${c.issuer ?? "contractor"}`;
      } else if (c.type === "resource-delivery") {
        const delivered = c.deliveredAmount ?? 0;
        const required = c.terms?.amount ?? 0;
        const resource = c.terms?.resourceName ?? c.terms?.resourceType ?? "cargo";
        label = `Deliver ${delivered}/${required} ${resource}`;
      } else {
        label = c.summary ?? c.title ?? c.id;
      }
      return `<li class="obj-task"><span class="obj-check">☐</span><span>${label}</span></li>`;
    }).join("");
    sections.push(`<p class="obj-section-label">Contracts</p><ul class="obj-list">${items}</ul>`);
  }

  const activeObligations = obligations.filter((o) => o.status === "active" && (o.balance ?? 0) > 0);
  if (activeObligations.length > 0) {
    const items = activeObligations.map((o) => {
      return `<li class="obj-task"><span class="obj-check">☐</span><span>${o.title}: ${Math.ceil(o.balance).toLocaleString()} cr</span></li>`;
    }).join("");
    sections.push(`<p class="obj-section-label">Obligations</p><ul class="obj-list">${items}</ul>`);
  }

  if (sections.length === 0) {
    el.hidden = true;
    el.dataset.flashedFlags = "[]";
    return;
  }

  el.hidden = false;
  el.innerHTML = sections.join("");
  el.dataset.flashedFlags = JSON.stringify([...flashed]);
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

function presentIdentityDocument(documentKind, payload = {}) {
  // Prefer a hub the player is physically within interaction range of, but
  // fall back to the active patrol's site — the patrol spawns at sensor range
  // (3× interaction radius) so the player may not be within nearbySite range yet.
  const hubSite = currentSiteState?.nearbySite?.type === "hub"
    ? currentSiteState.nearbySite
    : currentSiteState?.dockedSite?.type === "hub"
      ? currentSiteState.dockedSite
      : null;
  const site = hubSite ?? game.activePatrolIntercept?.site ?? null;

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

function processUnit(type) {
  // Processor clicks do not care where a unit came from. The selected output
  // determines whether the same physical unit becomes fuel, ammo, scanergy, or
  // stored cargo.
  const output = getSelectedProcessorOutput();
  const amount = getUnitProcessValue(type);
  state.components.processor.output = output;
  audio.playCargoTransfer(type);
  state.ledger.recordEvent("resource.processed", {
    resourceType: type,
    output,
    amount: output === "cargo" ? 1 : amount,
  });

  if (output === "fuel") {
    state.components.engine.fuel += amount;
  } else if (output === "ammo") {
    state.components.miner.ammo += amount;
  } else if (output === "scanergy") {
    state.components.scanner.scanergy += amount;
  } else if (output === "cargo") {
    cargoHold.addUnit(type);
  }

  updateHudDisplay();
  game.updateSiteReadout();
}

function receiveCollectedResource(type) {
  if (state.components.processor.installed) {
    processor.addUnit(type);
    return;
  }

  if (state.components.cargoHold.installed) {
    cargoHold.addUnit(type);
  }
}

function handleCargoUnitClick(type) {
  if (isCargoSellModeActive) {
    return sellCargoUnit(type);
  }

  return depositCargoUnit(type);
}

function getOreUnitValue(type) {
  const service = currentSiteState?.dockedSite && activeHubServiceId
    ? getHubService(currentSiteState.dockedSite.id, activeHubServiceId)
    : null;
  const normalized = normalizeResourceType(type);
  return service?.oreValues?.[normalized]
    ?? service?.oreValues?.[type]
    ?? CARGO_UNIT_BASE_VALUES[normalized]
    ?? CARGO_UNIT_BASE_VALUES[type]
    ?? 0;
}

function sellCargoUnit(type) {
  const unitValue = getOreUnitValue(type);

  if (!isCargoSellModeActive || !currentSiteState?.dockedSite || unitValue <= 0) {
    return false;
  }

  depositCredits(state, unitValue);
  state.ledger.recordEvent("cargo.sold", { creditsEarned: unitValue, units: { [type]: 1 }, totalUnits: 1 }, { visible: false });
  game.createCargoTransferTrail(type);
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

let activePump = null; // { type, intervalId }

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
    const chunk = 7 + Math.floor(Math.random() * 6); // 7–12 units
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
    const chunk = 30 + Math.floor(Math.random() * 25); // 30–54 units
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

    const chunk = 5 + Math.floor(Math.random() * 18); // 5–22 units
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

function depositCargoUnit(type) {
  const contract = contractManager.getCurrentContract();

  if (!activeDepositContractId || contract?.id !== activeDepositContractId || !canDepositToContract(contract)) {
    return false;
  }

  const didDeposit = contractManager.depositResourceUnit({
    contractId: contract.id,
    resourceType: type,
    siteId: currentSiteState?.dockedSite?.id,
  });

  if (!didDeposit) {
    return false;
  }

  game.createCargoTransferTrail(type);

  if (contract.status === "fulfilled" || contract.status === "paid") {
    activeDepositContractId = null;
  }

  renderContract();
  updateHudDisplay();
  game.updateSiteReadout();
  return true;
}

function updateEventLedgerDisplay() {
  if (renderedLedgerVersion === state.ledger.version) {
    return;
  }

  playLedgerAudioEvents();
  renderedLedgerVersion = state.ledger.version;
  worldDebugFields.eventCount.textContent = String(state.ledger.eventCount);
  worldDebugFields.shotsFired.textContent = String(state.ledger.getStat("weapon.fired.total"));
  worldDebugFields.rocksDestroyed.textContent = String(state.ledger.getStat("asteroid.destroyed.total"));
  worldDebugFields.resourcesCollected.textContent = String(state.ledger.getStat("resource.collected.total"));
  worldDebugFields.kills.textContent = String(state.ledger.getStat("enemy.destroyed.total") + state.ledger.getStat("npc.destroyed.total"));
  worldDebugFields.salesCredits.textContent = String(state.ledger.getStat("credits.earned.sales"));
  worldDebugFields.repairCredits.textContent = String(state.ledger.getStat("credits.spent.repairs"));
  worldDebugFields.eventLog.replaceChildren(
    ...state.ledger.getRecentEventGroups(5).reverse().map((eventGroup) => {
      const item = document.createElement("li");
      item.textContent = eventGroup.message;
      return item;
    }),
  );
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
  const counts = cargoHold.getUnitCounts();

  return Object.entries(counts).reduce(
    (total, [type, count]) => total + getOreUnitValue(type) * count,
    0,
  );
}

function getUnitProcessValue(type) {
  return type === "crystal" ? PROCESS_OUTPUT_AMOUNT * CRYSTAL_VALUE_MULTIPLIER : PROCESS_OUTPUT_AMOUNT;
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

    input.type = "radio";
    input.name = "processor-output";
    input.value = output.id;
    input.checked = output.id === state.components.processor.output;
    input.addEventListener("change", () => {
      state.components.processor.output = output.id;
    });

    detail.className = "processor-output-detail";
    detail.textContent = output.amountLabel;

    label.append(input, output.label, detail);
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
    const savedPanel = panelId ? savedLayout.panels?.[panelId] : null;
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
  const offers = service?.componentOffers ?? [];
  const nextKey = `${service?.id ?? "none"}:${currentCredits}:${offers
    .map((offer) => `${offer.id}:${state.components[offer.componentId]?.installed ? "installed" : "open"}`)
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
      const isInstalled = Boolean(state.components[offer.componentId]?.installed);
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

function buyComponentOffer(offer, service = null) {
  const component = state.components[offer.componentId];

  if (!component || component.installed || !canSpendCredits(state, offer.price)) {
    renderComponentShop(service);
    return;
  }

  spendCredits(state, offer.price);
  component.installed = true;
  setComponentAvailable(offer.componentId, true);

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
    text: `${offer.componentName} is bolted in. It will not make you graceful, but it will make you harder to ignore.`,
  });
  renderComponentShop(service);
  updateHudDisplay();
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

function getSavedTopZIndex(layout) {
  const savedZIndexes = Object.entries(layout.panels ?? {})
    .filter(([panelId]) => panelId !== "journey" && panelId !== "viewport")
    .map(([, panel]) => panel.z)
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
  const previousPanel = layout.panels?.[panelId] ?? {};
  const zIndex = panelId === "journey" ? JOURNEY_PANEL_Z_INDEX : Number(panel.style.zIndex) || previousPanel.z || 1;

  layout.panels = {
    ...layout.panels,
    [panelId]: {
      x: offset?.x ?? previousPanel.x ?? 0,
      y: offset?.y ?? previousPanel.y ?? 0,
      z: zIndex,
      inDrawer: Boolean(panel.closest("#paperwork-drawer")),
      ...(options.panoramaPlaced ? { panoramaPlaced: true } : {}),
      ...(options.panoramaLayoutVersion ? { panoramaLayoutVersion: options.panoramaLayoutVersion } : {}),
    },
  };

  window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

function initLicenseApplication() {
  const existingLicense = getPilotLicense(state);

  if (existingLicense.licenseId) {
    applyIssuedLicense(existingLicense);
    licenseApplication.classList.add("is-dismissed");
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
    licenseApplication.classList.add("is-dismissed");
    journeyDirector.acceptMission();
    renderContract();
    saveNow();
  });
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
