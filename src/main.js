import { getProcessorOutputs, normalizeProcessorOutput } from "./components/componentRules.js?v=ship-market-v2";
import { shipOffers } from "./content/ships/shipOffers.js?v=ship-market-v2";
import { Game } from "./game.js?v=tow-message-guard-v1";
import { createContractManager } from "./systems/contractManager.js?v=mako-hunter-v1";
import { createGameAudio } from "./systems/audio.js?v=louder-comms-v1";
import { getHubService, getHubServices } from "./systems/hubServices.js?v=mako-hunter-v1";
import { createJourneyDirector } from "./systems/journeyDirector.js?v=attention-v1";
import { Processor } from "./systems/processor.js?v=profile-save-v1";
import { clearSavedProfile, getDevStart, loadSavedProfile, restoreSavedWorld, saveProfile, shouldResetSave } from "./systems/saveManager.js?v=attention-v1";
import { purchaseShipOffer } from "./systems/shipPurchase.js?v=legal-records-v1";
import { createGameState } from "./state/gameState.js?v=attention-v1";

// main.js is the browser/page coordinator. It creates the game systems, wires
// DOM controls to component state, and keeps the visible panels in sync.
const OLD_PANEL_LAYOUT_STORAGE_KEYS = [
  "asteroids.panelLayout.v1",
  "asteroids.panelLayout.v2",
  "asteroids.panelLayout.v3",
  "asteroids.panelLayout.v4",
];
const PANEL_LAYOUT_STORAGE_KEY = "asteroids.panelLayout.v5";
const JOURNEY_PANEL_Z_INDEX = 100000;
const VIEWPORT_PANEL_Z_INDEX = 10;
const PROCESS_OUTPUT_AMOUNT = 50;
const CRYSTAL_VALUE_MULTIPLIER = 5;
const CARGO_UNIT_VALUES = {
  fuel: 30,
  crystal: 150,
};
const PAPERWORK_PANEL_IDS = ["license", "contract"];
const TOW_DRIVER_NAMES = ["Mara Tow", "Jax Cable", "Nell Winch", "Orson Hook"];
const YARD_EXCHANGE_CORE_SERVICES = ["rook-industries", "yard-shipyard", "yard-finance", "yard-supply"];
const MURMUR_SERVICE_ID = "yard-murmur-roadmap";
const STARTER_REGION_NAME = "First Reach";
const DEEP_SPACE_REGION_NAME = "The Black";
const JOURNEY_WORD_DELAY_MS = 34;
const ATTENTION_ONCE_MS = 1800;
const DEFAULT_PANEL_LAYOUT = {
  viewport: { x: 0, y: 0, z: 20 },
  license: { x: 980, y: 20, z: 95 },
  journey: { x: 980, y: 20, z: JOURNEY_PANEL_Z_INDEX },
  engine: { x: -300, y: 20, z: 70 },
  scanner: { x: 980, y: 300, z: 90 },
  docking: { x: -300, y: 340, z: 100 },
  tow: { x: -300, y: 520, z: 125 },
  contract: { x: -300, y: 340, z: 95 },
  finley: { x: 70, y: 120, z: 115 },
  roadmap: { x: 120, y: 100, z: 130 },
  merchant: { x: 70, y: 120, z: 120 },
  miner: { x: 980, y: 500, z: 60 },
  collector: { x: 980, y: 680, z: 50 },
  hull: { x: -300, y: 580, z: 50 },
  world: { x: 980, y: 20, z: 40 },
  hub: { x: -300, y: 340, z: 110 },
  processor: { x: 0, y: 0, z: 1 },
  cargo: { x: 0, y: 0, z: 1 },
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
const ammoCount = document.querySelector("#ammo-count");
const cargoCanvas = document.querySelector("#cargo");
const cargoPanel = document.querySelector("[data-panel-id='cargo']");
const canvas = document.querySelector("#game");
const creditCount = document.querySelector("#credit-count");
const contractAcceptButton = document.querySelector("#contract-accept");
const contractClauses = document.querySelector("#contract-clauses");
const contractDestination = document.querySelector("#contract-destination");
const contractIssuer = document.querySelector("#contract-issuer");
const contractNavCount = document.querySelector("#contract-nav-count");
const contractNextButton = document.querySelector("#contract-next");
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
const journeyStatus = document.querySelector("#journey-status");
const merchantCredits = document.querySelector("#merchant-credits");
const minerArmed = document.querySelector("#miner-armed");
const powerButton = document.querySelector("#ship-power");
const processorCanvas = document.querySelector("#processor");
const processorOutputPanel = document.querySelector(".processor-outputs");
const scanButton = document.querySelector("#ship-scan");
const scanergyCount = document.querySelector("#scanergy-count");
const shipOffersPanel = document.querySelector("#ship-offers");
const shipStatus = document.querySelector("#ship-status");
const towSection = document.querySelector("#tow-section");
const towButton = document.querySelector("#tow-button");
const towCostDisplay = document.querySelector("#tow-cost");
const tractorFieldButton = document.querySelector("#tractor-field-button");
const tractorFieldStatus = document.querySelector("#tractor-field-status");
const viewportRegion = document.querySelector("#viewport-region");
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
const state = createGameState();
const initialDevStart = getDevStart();

if (shouldResetSave() || initialDevStart) {
  clearSavedProfile();
}

const savedProfile = loadSavedProfile(state);
const audio = createGameAudio();
const processor = new Processor(processorCanvas, processUnit);
const cargoHold = new Processor(cargoCanvas, handleCargoUnitClick, { isClickable: true });
const game = new Game(canvas, state, updateHudDisplay, receiveCollectedResource, updateWorldDebugDisplay, updateHubDisplay, audio, updateLedgerDrivenSystems);
const contractManager = createContractManager({
  state,
  onChange: (contract) => {
    renderContract(contract);
    syncContractPanelVisibility();
    updateHudDisplay();

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
});
let bringPanelToFront = () => {};
let positionPanelById = () => {};
let movePaperPanelToDesk = () => {};
let movePaperPanelToDrawer = () => {};
let contractPulledFromDrawer = false;
let renderedLedgerVersion = -1;
let lastAudioEventId = 0;
let journeyTypeTimers = [];
let currentSiteState = null;
let activeDepositContractId = null;
let activeHubServiceId = null;
let isCargoSellModeActive = false;
let wasTowAvailable = false;
let saveTimer = null;
let lastHubAuthorityEventId = 0;
let lastRookAutoOfferEventId = 0;
const fulfilledContractPanelPulls = new Set();
const COMPONENT_WARNING_RULES = [
  { panelId: "engine", cautionAt: 80, criticalAt: 35, getValue: () => state.components.engine.fuel },
  { panelId: "miner", cautionAt: 50, criticalAt: 20, getValue: () => state.components.miner.ammo },
  { panelId: "scanner", cautionAt: 100, criticalAt: 25, getValue: () => state.components.scanner.scanergy },
  { panelId: "hull", cautionAt: 55, criticalAt: 30, getValue: () => state.components.hull.integrity },
];

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
  game.scanForCrystals();
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
  } else if (canDepositToContract(contract)) {
    activeDepositContractId = activeDepositContractId === contract.id ? null : contract.id;
    renderContract();
  } else {
    contractManager.acceptContract();
  }

  updateHudDisplay();
});

contractNextButton.addEventListener("click", () => {
  activeDepositContractId = null;
  contractManager.showNextContract();
  updateHudDisplay();
});

finleySellToggle.addEventListener("click", () => {
  isCargoSellModeActive = !isCargoSellModeActive;
  updateCargoTargetDisplay();
  renderFinleyPanel();
});

finleyRepairButton.addEventListener("click", () => {
  game.repairAtDock();
  renderFinleyPanel();
  updateHudDisplay();
});

finleyFuelButton.addEventListener("click", () => {
  buyFuelFromFinley();
});

finleyChargesButton.addEventListener("click", () => {
  buyChargesFromFinley();
});

finleyScanButton.addEventListener("click", () => {
  buyScanFromFinley();
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
game.placeShipNearSite("scrap-porch");
restoreSavedWorld({ save: savedProfile, game, cargoHold });
clearOldPanelLayouts();
setInitialPaperworkLocations();
makePanelsDraggable();
setupPaperworkControls();
wirePanelControlSounds();
journeyDirector.start();
applyDevStart(initialDevStart);
revealInstalledComponents();
renderContract();
updateShipPowerDisplay();
updateHudDisplay();
initLicenseApplication();

game.start();
processor.start();
cargoHold.start();
window.addEventListener("beforeunload", () => saveNow());

function updateHudDisplay() {
  renderProcessorOutputs();
  renderShipOffers();
  updateShipPowerDisplay();
  updateCargoTargetDisplay();

  creditCount.textContent = String(Math.floor(state.components.account.credits));
  licenseCreditsDisplay.textContent = `${Math.floor(state.components.account.credits)} cr`;
  const currentFuel = state.components.engine.fuel;
  const isStranded = state.components.engine.installed && !currentSiteState?.dockedSite &&
    !game.isTowActive() &&
    !state.ledger.getSignal("player.controlLocked") &&
    (currentFuel <= 0 || state.components.hull.integrity <= 0);

  fuelCount.textContent = String(Math.floor(currentFuel));
  fuelFill.style.width = `${getMeterPercent(currentFuel, state.components.engine.maxFuel)}%`;
  setTowAvailable(isStranded);
  updateTowEstimateDisplay();
  ammoCount.textContent = String(Math.floor(state.components.miner.ammo));
  scanergyCount.textContent = `${Math.floor(state.components.scanner.scanergy)}%`;
  tractorFieldStatus.textContent = state.components.collector.isActive ? "Pulling" : "Idle";
  tractorFieldButton.setAttribute("aria-pressed", String(state.components.collector.isActive));
  hullCount.textContent = `${Math.ceil(state.components.hull.integrity)}%`;
  hullFill.style.width = `${getMeterPercent(state.components.hull.integrity, state.components.hull.maxIntegrity)}%`;
  hullVin.textContent = state.components.hull.vinPlateAttached ? state.components.hull.vin : "UNVERIFIED";
  minerArmed.checked = state.components.miner.armed;
  merchantCredits.textContent = `${Math.floor(state.components.account.credits)} cr`;
  updateWarningPanels();
  scheduleSave();
}

function setTowAvailable(isAvailable) {
  setComponentAvailable("tow", false);
  const becameAvailable = isAvailable && !wasTowAvailable;

  // sayAsNpc causes a Journey render, which calls updateHudDisplay again.
  // Update this guard first so the tow prompt cannot recurse.
  if (!isAvailable) {
    wasTowAvailable = false;
    return;
  }

  if (becameAvailable) {
    const estimate = game.getEmergencyTowEstimate();
    const driverName = TOW_DRIVER_NAMES[Math.abs(estimate.siteId.length + estimate.cost) % TOW_DRIVER_NAMES.length];

    wasTowAvailable = true;
    const prompted = journeyDirector.sayAsNpc(
      driverName,
      `Tow request picked up. I can get a runner out to you and haul you back to ${estimate.siteName} for ${estimate.cost} credits. We'll move slow, clear the worst junk in the lane, and settle you on the tether. Accept the tow if you want me rolling.`,
      { label: `Accept Tow ${estimate.cost} cr`, action: "emergencyTow" },
    );

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

  if (shouldRestoreViewport(savedProfile)) {
    setComponentAvailable("viewport", true);
  }

  Object.entries(state.components).forEach(([componentId, componentState]) => {
    if (componentState?.installed) {
      setComponentAvailable(componentId, true);
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

  return Boolean(currentStepId && !["show-hull", "move-panels"].includes(currentStepId));
}

function applyDevStart(devStartId) {
  if (!devStartId) {
    return;
  }

  if (devStartId === "red-work") {
    setupDevRedWorkStart();
    journeyDirector.startMission("chapter-1-red-work");
    updateHudDisplay();
  }
}

function setupDevRedWorkStart() {
  game.placeShipNearSite("yard-exchange", { x: 190, y: -70 });
  Object.assign(state.components.account, { credits: Math.max(state.components.account.credits, 0) });
  Object.assign(state.components.engine, {
    installed: true,
    powered: false,
    fuel: state.components.engine.maxFuel,
  });
  Object.assign(state.components.hull, {
    installed: true,
    integrity: state.components.hull.maxIntegrity,
  });
  Object.assign(state.components.scanner, {
    installed: true,
    scanergy: Math.max(state.components.scanner.scanergy, 300),
    targets: ["resources", "sites"],
  });
  Object.assign(state.components.miner, {
    installed: true,
    armed: false,
    ammo: Math.max(state.components.miner.ammo, 150),
  });
  state.components.cargoHold.installed = true;
  state.components.docking.installed = true;
  state.components.contract.installed = true;
  state.hubServices.unlocked["yard-exchange"] = Array.from(
    new Set([...(state.hubServices.unlocked["yard-exchange"] ?? []), "rook-industries", "yard-supply"]),
  );
  state.hubServices.flags.yardCoreSeenDocked = true;
  game.setDockedSite(game.worldSites.find((site) => site.id === "yard-exchange") ?? null);
  state.ship.frameId = "yard-skiff-miner";
  state.ship.name = "Rook Yard Skiff";
  setComponentAvailable("viewport", true);
  setComponentAvailable("engine", true);
  setComponentAvailable("hull", true);
  setComponentAvailable("scanner", true);
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

  if (siteState.dockedSite?.id === "yard-exchange" && areYardExchangeStoryServicesUnlocked()) {
    state.hubServices.flags.yardCoreSeenDocked = true;
  }

  if (!siteState.dockedSite) {
    isCargoSellModeActive = false;
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
    dockedSite?.id !== "yard-exchange" ||
    isHubServiceUnlocked("yard-exchange", { id: MURMUR_SERVICE_ID }) ||
    !state.hubServices.flags.leftYardAfterCoreUnlocked ||
    !areYardExchangeStoryServicesUnlocked()
  ) {
    return;
  }

  unlockHubService("yard-exchange", MURMUR_SERVICE_ID);
  journeyDirector.sayAsNpc(
    "Murmur",
    "Psst. Captain. You have met the desk people, now meet the wall people. I keep the board of things that have not happened yet. Back corridor. Click my name if you want to see the shape of the future.",
  );
}

function areYardExchangeStoryServicesUnlocked() {
  return YARD_EXCHANGE_CORE_SERVICES.every((serviceId) => isHubServiceUnlocked("yard-exchange", { id: serviceId }));
}


function updateDockingDisplay(siteState) {
  const site = siteState.dockedSite ?? siteState.nearbySite;
  const shipSpeed = Math.hypot(game.ship.velocity.x, game.ship.velocity.y);
  const isDocked = Boolean(site && siteState.dockedSite?.id === site.id);
  const isCaution = Boolean(site && !isDocked && shipSpeed > 24);

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

  closeDriveThroughWindows({ keepServiceType: service.serviceType });
  activeHubServiceId = service.id;
  clearAttention(getHubServiceAttentionTarget(dockedSite.id, service.id));
  hubStatus.textContent = service.organization;
  hubDetail.textContent = `${service.npcName}: ${getHubServicePrompt(service)}`;
  renderHubServiceMenu(dockedSite);

  if (service.greeting) {
    journeyDirector.sayAsNpc(service.npcName, service.greeting);
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

  if (service.serviceType === "shipyard") {
    setComponentAvailable("merchant", true);
    renderShipOffers();
    focusPanelById("merchant");
    return;
  }

  if (service.serviceType === "contracts" || service.serviceType === "finance") {
    setComponentAvailable("contract", true);
    offerHubServiceContract(dockedSite, service);
    pullContractForService(service);
    return;
  }

  if (service.serviceType === "supply") {
    setComponentAvailable("finley", true);
    renderFinleyPanel();
    focusPanelById("finley");
    return;
  }

  if (service.serviceType === "roadmap") {
    setComponentAvailable("roadmap", true);
    focusPanelById("roadmap");
    return;
  }
}

function closeDriveThroughPanel(panelId) {
  if (panelId === "merchant") {
    setComponentAvailable("merchant", false);

    if (activeHubServiceId && getHubService(currentSiteState?.dockedSite?.id, activeHubServiceId)?.serviceType === "shipyard") {
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

    if (activeHubServiceId && ["contracts", "finance"].includes(getHubService(currentSiteState?.dockedSite?.id, activeHubServiceId)?.serviceType)) {
      activeHubServiceId = null;
      renderHubServiceMenu(currentSiteState?.dockedSite);
    }

    return;
  }

  if (panelId === "finley") {
    isCargoSellModeActive = false;
    updateCargoTargetDisplay();
    setComponentAvailable("finley", false);

    if (activeHubServiceId && getHubService(currentSiteState?.dockedSite?.id, activeHubServiceId)?.serviceType === "supply") {
      activeHubServiceId = null;
      renderHubServiceMenu(currentSiteState?.dockedSite);
    }

    return;
  }

  if (panelId === "roadmap") {
    setComponentAvailable("roadmap", false);

    if (activeHubServiceId && getHubService(currentSiteState?.dockedSite?.id, activeHubServiceId)?.serviceType === "roadmap") {
      activeHubServiceId = null;
      renderHubServiceMenu(currentSiteState?.dockedSite);
    }

    return;
  }
}

function closeDriveThroughWindows({ keepServiceType = null } = {}) {
  if (keepServiceType !== "shipyard") {
    setComponentAvailable("merchant", false);
  }

  if (!["contracts", "finance"].includes(keepServiceType)) {
    syncContractPanelVisibility();
  }

  if (keepServiceType !== "supply") {
    isCargoSellModeActive = false;
    updateCargoTargetDisplay();
    setComponentAvailable("finley", false);
  }

  if (keepServiceType !== "roadmap") {
    setComponentAvailable("roadmap", false);
  }
}

function offerHubServiceContract(site, service) {
  const contractId = getNextHubServiceContractId(service);

  if (!contractId) {
    if (service.singleActiveContract) {
      const inProgressId = (service.contractIds ?? []).find((id) => {
        const r = state.contracts.records[id];
        return r && ["offered", "active", "fulfilled"].includes(r.status);
      });

      if (inProgressId) {
        contractManager.focusContract(inProgressId);
      }

      if (service.busyMessage) {
        journeyDirector.sayAsNpc(service.npcName, service.busyMessage);
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

function getNextHubServiceContractId(service) {
  const contractIds = service.contractIds ?? [];
  const missionFirstContractId = service.missionFirstContractId;
  const missionFirstContract = missionFirstContractId ? state.contracts.records[missionFirstContractId] : null;
  const missionFirstResolved =
    !missionFirstContractId ||
    (missionFirstContract && ["active", "fulfilled", "paid"].includes(missionFirstContract.status));

  if (!missionFirstResolved) {
    return missionFirstContractId;
  }

  if (service.serviceType === "finance" && state.components.engine.fuel <= 0) {
    const emergencyLoanId = "mako-emergency-fuel-loan";
    const existingEmergencyLoan = state.contracts.records[emergencyLoanId];

    if (!existingEmergencyLoan || existingEmergencyLoan.status === "paid") {
      return emergencyLoanId;
    }
  }

  if (service.singleActiveContract) {
    const hasInProgress = contractIds.some((contractId) => {
      const r = state.contracts.records[contractId];
      return r && ["offered", "active", "fulfilled"].includes(r.status);
    });

    if (hasInProgress) {
      return null;
    }
  }

  const prereqs = service.contractPrerequisites ?? {};
  const eligibleContractIds = contractIds.filter((contractId) => {
    if (contractId !== missionFirstContractId && !missionFirstResolved) {
      return false;
    }

    if (contractId === "mako-emergency-fuel-loan" && state.components.engine.fuel > 0) {
      return false;
    }

    const existingContract = state.contracts.records[contractId];
    if (existingContract && !(existingContract.repeatable && existingContract.status === "paid")) {
      return false;
    }
    return (prereqs[contractId] ?? []).every((reqId) => state.contracts.records[reqId]?.status === "paid");
  });

  if (eligibleContractIds.length === 0) {
    return null;
  }

  return eligibleContractIds[Math.floor(Math.random() * eligibleContractIds.length)];
}

function getHubServicePrompt(service) {
  if (service.serviceType === "shipyard") {
    return "ship offers are open at the yard window.";
  }

  if (service.serviceType === "finance") {
    return "financing records are handled through active contracts.";
  }

  if (service.serviceType === "contracts") {
    return "open contracts are handled here. Rook offers one job from the board at a time.";
  }

  if (service.serviceType === "supply") {
    return "Finley handles repair and cargo sales here.";
  }

  if (service.serviceType === "roadmap") {
    return "Murmur keeps a future-board in the back corridor.";
  }

  return service.description;
}

function updateLedgerDrivenSystems() {
  contractManager.update();
  journeyDirector.update();
  updateRookFollowupOffers();
  updateHubAuthorityMessages();
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

    if (!site || service?.id !== "rook-industries") {
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

    if (event.type === "site.nearby" && event.payload.siteType === "hub") {
      const vin = state.components.hull.vinPlateAttached ? state.components.hull.vin : "unverified VIN";
      const license = state.pilot.licenseId ?? "no active license";
      const speaker = `${event.payload.siteName ?? "Hub"} Authority`;

      if (state.journey.pendingAcknowledgement || state.journey.messages.length > 0) {
        return;
      }

      journeyDirector.sayAsNpc(
        speaker,
        `Approach logged for ${vin} under ${license}. Docking approval is open while you remain inside hub range.`,
      );
    } else if (event.type === "site.tetherBroken") {
      const vin = state.components.hull.vinPlateAttached ? state.components.hull.vin : "unverified VIN";
      const license = state.pilot.licenseId ?? "no active license";
      const speaker = `${event.payload.siteName ?? "Hub"} Authority`;

      journeyDirector.sayAsNpc(
        speaker,
        `Tether break recorded for ${vin} under ${license}. Clear the lane, stabilize, and request docking again when safe.`,
      );
    }
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
  worldDebugFields.oreBias.textContent = `R ${zone.redOreBias.toFixed(2)} / B ${zone.blueOreBias.toFixed(2)}`;
  worldDebugFields.lifeBias.textContent = `H ${zone.hunterBias.toFixed(2)} / A ${zone.ambientLifeBias.toFixed(2)}`;
  worldDebugFields.asteroids.textContent = String(debug.asteroidCount);
  worldDebugFields.hunters.textContent = `${debug.hunterCount} / ${debug.activeHunterCount} active`;
  worldDebugFields.lifeforms.textContent = String(debug.lifeformCount);
  worldDebugFields.activeLifeforms.textContent = String(debug.activeLifeformCount);
  worldDebugFields.pickups.textContent = String(debug.pickupCount);
  updateEventLedgerDisplay();
}

function renderContract(contract = contractManager.getCurrentContract()) {
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
    contractAcceptButton.disabled = true;
    contractAcceptButton.textContent = "Accept Contract";
    renderContractNavigation();
    contractClauses.replaceChildren();
    return;
  }

  contractTitle.textContent = contract.title;
  contractStatus.textContent = getContractStatusLabel(contract.status);
  contractIssuer.textContent = `Issuer: ${contract.issuer}`;
  contractSummary.textContent = contract.summary;
  renderContractTerms(contract);
  renderContractProgress(contract);
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
    contractVin.textContent = `${contract.terms.amount} ${contract.terms.resourceName}`;
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
    contractProgress.hidden = true;
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

  state.attention.targets[resolvedTargetId] = {
    mode,
    reason,
    requestedAt: Date.now(),
  };
  hubServiceMenu.dataset.renderedKey = "";
}

function clearAttention(targetId) {
  if (!targetId || !state.attention.targets[targetId]) {
    return;
  }

  delete state.attention.targets[targetId];
  hubServiceMenu.dataset.renderedKey = "";
}

function hasAttention(targetId) {
  return Boolean(targetId && state.attention.targets[targetId]);
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

    button.textContent = isInDrawer ? "Desk" : "File";
    button.title = isInDrawer ? "Move paperwork to the desktop" : "File paperwork in the drawer";
    button.setAttribute("aria-label", button.title);
  });
}

function focusPanelById(panelId) {
  const panel = document.querySelector(`[data-panel-id="${panelId}"]`);

  if (panel) {
    bringPanelToFront(panel);
  }
}

function renderJourney(journey = state.journey) {
  journeyChapter.textContent = journey.chapterName ?? "Chapter 1";
  journeyStatus.textContent = journey.episodeName ?? "The Interview";
  journeyMissionTitle.textContent = journey.mission?.title ?? "Journey";
  journeyMissionObjective.textContent = journey.mission?.objective ?? "Awaiting instructions.";
  journeyHelpText.textContent = journey.mission?.helpText ?? "Read the current objective and follow the next prompt.";
  journeyAcceptButton.hidden = !journey.pendingAcknowledgement && journey.mission?.status !== "offered";
  journeyAcceptButton.textContent = journey.pendingAcknowledgement?.label ?? journey.mission?.actionLabel ?? "Accept Job";
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

function sellCargoUnit(type) {
  const unitValue = CARGO_UNIT_VALUES[type] ?? 0;

  if (!isCargoSellModeActive || !currentSiteState?.dockedSite || unitValue <= 0) {
    return false;
  }

  state.components.account.credits += unitValue;
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
  const credits = state.components.account.credits;
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

  finleyHull.textContent = `${Math.ceil(hull.integrity)}%`;
  finleyRepairCost.textContent = `${repairCost} cr`;
  finleyRepairButton.disabled = !canRepair;

  finleyFuel.textContent = `${Math.floor(engine.fuel)} / ${engine.maxFuel}`;
  finleyFuelCost.textContent = `${fuelCost} cr`;
  finleyFuelButton.firstChild.textContent = "Fill ";
  finleyFuelButton.disabled = !canFuel;

  finleyCharges.textContent = `${Math.floor(miner.ammo)} / ${miner.maxAmmo}`;
  finleyChargesCost.textContent = `${chargesCost} cr`;
  finleyChargesButton.disabled = !canCharges;

  finleyScan.textContent = `${Math.floor(scanner.scanergy)} / ${scanner.maxScanergy}`;
  finleyScanCost.textContent = `${scanCost} cr`;
  finleyScanButton.disabled = !canScan;
}

function buyFuelFromFinley() {
  const site = currentSiteState?.dockedSite;
  const service = site ? getHubService(site.id, activeHubServiceId) : null;
  const prices = service?.supplyPrices ?? {};
  const engine = state.components.engine;
  const fuelNeeded = Math.max(0, engine.maxFuel - engine.fuel);
  const cost = Math.ceil(fuelNeeded * (prices.fuelPerUnit ?? 2));

  if (!site || fuelNeeded <= 0) {
    return;
  }

  if (state.components.account.credits < cost) {
    return;
  }

  state.components.account.credits -= cost;
  engine.fuel = engine.maxFuel;
  state.ledger.recordEvent("ship.refueled", { siteId: site.id, siteName: site.name, cost, fuelAdded: fuelNeeded });
  renderFinleyPanel();
  updateHudDisplay();
}

function buyChargesFromFinley() {
  const site = currentSiteState?.dockedSite;
  const service = site ? getHubService(site.id, activeHubServiceId) : null;
  const prices = service?.supplyPrices ?? {};
  const miner = state.components.miner;
  const chargesNeeded = Math.max(0, miner.maxAmmo - miner.ammo);
  const cost = Math.ceil(chargesNeeded * (prices.chargePerUnit ?? 3));

  if (chargesNeeded <= 0 || state.components.account.credits < cost) {
    return;
  }

  state.components.account.credits -= cost;
  miner.ammo = miner.maxAmmo;
  state.ledger.recordEvent("supply.chargesBought", { siteId: site.id, cost, chargesAdded: chargesNeeded });
  renderFinleyPanel();
  updateHudDisplay();
}

function buyScanFromFinley() {
  const site = currentSiteState?.dockedSite;
  const service = site ? getHubService(site.id, activeHubServiceId) : null;
  const prices = service?.supplyPrices ?? {};
  const scanner = state.components.scanner;
  const scanNeeded = Math.max(0, scanner.maxScanergy - scanner.scanergy);
  const cost = Math.ceil(scanNeeded * (prices.scanergyPerUnit ?? 1));

  if (scanNeeded <= 0 || state.components.account.credits < cost) {
    return;
  }

  state.components.account.credits -= cost;
  scanner.scanergy = scanner.maxScanergy;
  state.ledger.recordEvent("supply.scanBought", { siteId: site.id, cost, scanAdded: scanNeeded });
  renderFinleyPanel();
  updateHudDisplay();
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
    (total, [type, count]) => total + (CARGO_UNIT_VALUES[type] ?? 0) * count,
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
  let topPanelZIndex = getSavedTopZIndex(savedLayout);

  document.querySelectorAll(".component-panel").forEach((panel) => {
    const handle = panel.querySelector(".component-panel-title");
    const panelId = panel.dataset.panelId;

    if (!handle) {
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
    });

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    function endDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }

      panel.classList.remove("is-dragging");
      recordPanelDrag(panelId, drag, offset);
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
      paperworkDrawer.classList.add("is-open");
      drawerToggle?.setAttribute("aria-expanded", "true");
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

    topPanelZIndex += 1;
    panel.style.zIndex = String(topPanelZIndex);
    savePanelLayout(panel);
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
  const currentCredits = Math.floor(state.components.account.credits);
  const renderedKey = shipOffersPanel.dataset.renderedKey;
  const nextKey = `${currentCredits}:${state.components.merchant.purchasedOfferId ?? "none"}`;

  if (renderedKey === nextKey) {
    return;
  }

  const purchasedOfferId = state.components.merchant.purchasedOfferId;

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

function handleShipOfferClick(offer) {
  const result = purchaseShipOffer(state, offer);

  if (!result.ok) {
    updateHudDisplay();
    return;
  }

  setComponentAvailable("miner", true);
  setComponentAvailable("cargo", true);
  setComponentAvailable("merchant", false);

  const shipyardService = currentSiteState?.dockedSite ? getHubService(currentSiteState.dockedSite.id, "yard-shipyard") : null;

  if (shipyardService?.postSaleGreeting) {
    journeyDirector.sayAsNpc(shipyardService.npcName, shipyardService.postSaleGreeting);
  }

  updateHudDisplay();
}

function recordPanelDrag(panelId, drag, offset) {
  if (!panelId || (drag.originX === offset.x && drag.originY === offset.y)) {
    return;
  }

  state.ledger.recordEvent(
    "component.dragged",
    {
      componentId: panelId,
      x: offset.x,
      y: offset.y,
    },
    { visible: false },
  );
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
    .filter((zIndex) => Number.isFinite(zIndex) && zIndex < JOURNEY_PANEL_Z_INDEX);
  const defaultZIndexes = Object.entries(DEFAULT_PANEL_LAYOUT)
    .filter(([panelId]) => panelId !== "journey" && panelId !== "viewport")
    .map(([, panel]) => panel.z)
    .filter((zIndex) => Number.isFinite(zIndex) && zIndex < JOURNEY_PANEL_Z_INDEX);

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

  if (Number.isFinite(savedZ) && savedZ > 1 && savedZ < JOURNEY_PANEL_Z_INDEX) {
    return savedZ;
  }

  return defaultPanel.z;
}

function savePanelLayout(panel, offset = null) {
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
    },
  };

  window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

function initLicenseApplication() {
  if (state.pilot.licenseId) {
    applyIssuedLicense(state.pilot);
    licenseApplication.classList.add("is-dismissed");
    return;
  }

  licenseFirstName.focus();

  licenseForm.addEventListener("submit", (event) => {
    event.preventDefault();
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

    state.pilot.firstName = firstName;
    state.pilot.lastName = lastName;
    state.pilot.licenseId = licenseId;
    state.pilot.licenseStatus = "provisional";
    state.pilot.issuedAt = Date.now();
    state.ship.legal.flightLicenseId = licenseId;

    state.ledger.recordEvent("pilot.licensed", {
      licenseId,
      pilotName: `${firstName} ${lastName}`,
      licenseStatus: "provisional",
      authorizedZones: state.pilot.authorizedZones,
    }, { visible: false });

    applyIssuedLicense(state.pilot);
    setComponentAvailable("license", true);
    licenseApplication.classList.add("is-dismissed");
    saveNow();
  });
}

function applyIssuedLicense(pilot) {
  const fullName = `${pilot.firstName} ${pilot.lastName}`;
  licensePilotName.textContent = fullName;
  licenseIdDisplay.textContent = pilot.licenseId;
  const pilotNameEl = document.querySelector("#pilot-name");
  if (pilotNameEl) {
    pilotNameEl.textContent = fullName;
  }
}
