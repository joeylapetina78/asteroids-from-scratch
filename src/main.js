import { getProcessorOutputs, normalizeProcessorOutput } from "./components/componentRules.js?v=ship-market-v2";
import { shipOffers } from "./content/ships/shipOffers.js?v=ship-market-v2";
import { Game } from "./game.js?v=main-loop-heartbeat-v1";
import { createContractManager } from "./systems/contractManager.js?v=hub-drive-through-v1";
import { createGameAudio } from "./systems/audio.js?v=npc-registry-v1";
import { getHubService, getHubServices } from "./systems/hubServices.js?v=npc-registry-v1";
import { createJourneyDirector } from "./systems/journeyDirector.js?v=rook-contract-handoff-v1";
import { Processor } from "./systems/processor.js?v=profile-save-v1";
import { clearSavedProfile, getDevStart, loadSavedProfile, restoreSavedWorld, saveProfile, shouldResetSave } from "./systems/saveManager.js?v=story-hub-gates-v1";
import { purchaseShipOffer } from "./systems/shipPurchase.js?v=main-loop-heartbeat-v1";
import { createGameState } from "./state/gameState.js?v=ledger-reactivity-v1";

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
const PROCESS_OUTPUT_AMOUNT = 50;
const CRYSTAL_VALUE_MULTIPLIER = 5;
const CARGO_UNIT_VALUES = {
  fuel: 15,
  crystal: 75,
};
const STARTER_REGION_NAME = "First Reach";
const DEEP_SPACE_REGION_NAME = "The Black";
const JOURNEY_WORD_DELAY_MS = 34;
const DEFAULT_PANEL_LAYOUT = {
  viewport: { x: 0, y: 0, z: 20 },
  journey: { x: 980, y: 20, z: JOURNEY_PANEL_Z_INDEX },
  engine: { x: -300, y: 20, z: 70 },
  scanner: { x: 980, y: 300, z: 90 },
  docking: { x: -300, y: 340, z: 100 },
  contract: { x: -300, y: 340, z: 95 },
  merchant: { x: 70, y: 120, z: 120 },
  miner: { x: 980, y: 500, z: 60 },
  collector: { x: 980, y: 680, z: 50 },
  hull: { x: -300, y: 580, z: 50 },
  world: { x: 980, y: 20, z: 40 },
  hub: { x: -300, y: 340, z: 110 },
  processor: { x: 0, y: 0, z: 1 },
  cargo: { x: 0, y: 0, z: 1 },
};
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
const dockToggleButton = document.querySelector("#dock-toggle");
const dockingDetail = document.querySelector("#docking-detail");
const dockingStatus = document.querySelector("#docking-status");
const dockingTarget = document.querySelector("#docking-target");
const hubDetail = document.querySelector("#hub-detail");
const hubCargoValue = document.querySelector("#hub-cargo-value");
const hubHull = document.querySelector("#hub-hull");
const hubName = document.querySelector("#hub-name");
const hubPanel = document.querySelector("[data-panel-id='hub']");
const hubRepairButton = document.querySelector("#hub-repair");
const hubRepairCost = document.querySelector("#hub-repair-cost");
const hubSellCargoButton = document.querySelector("#hub-sell-cargo");
const hubServiceMenu = document.querySelector("#hub-service-menu");
const hubStatus = document.querySelector("#hub-status");
const hubSupplyActions = document.querySelector(".hub-supply-actions");
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
const cargoHold = new Processor(cargoCanvas, depositCargoUnit, { isClickable: true });
const game = new Game(canvas, state, updateHudDisplay, receiveCollectedResource, updateWorldDebugDisplay, updateHubDisplay, audio, updateLedgerDrivenSystems);
const contractManager = createContractManager({
  state,
  onChange: (contract) => {
    renderContract(contract);
    syncContractPanelVisibility(contract);
    updateHudDisplay();
  },
});
const journeyDirector = createJourneyDirector({
  state,
  game,
  offerContract: (contractId) => contractManager.offerContract(contractId),
  onChange: () => {
    renderJourney();
    updateHudDisplay();
  },
  showComponent: setComponentAvailable,
  unlockHubService,
});
let bringPanelToFront = () => {};
let positionPanelById = () => {};
let renderedLedgerVersion = -1;
let lastAudioEventId = 0;
let journeyTypeTimers = [];
let currentSiteState = null;
let activeDepositContractId = null;
let activeHubServiceId = null;
let saveTimer = null;
const COMPONENT_WARNING_RULES = [
  { panelId: "engine", cautionAt: 80, criticalAt: 35, getValue: () => state.components.engine.fuel },
  { panelId: "miner", cautionAt: 50, criticalAt: 20, getValue: () => state.components.miner.ammo },
  { panelId: "scanner", cautionAt: 100, criticalAt: 25, getValue: () => state.components.scanner.scanergy },
  { panelId: "hull", cautionAt: 55, criticalAt: 30, getValue: () => state.components.hull.integrity },
];

function updateShipPowerDisplay() {
  const engine = state.components.engine;

  powerButton.textContent = engine.powered ? "Power Down" : "Power Ship";
  powerButton.setAttribute("aria-pressed", String(engine.powered));
  powerButton.disabled = !engine.installed || state.components.hull.integrity <= 0 || engine.powerLocked;
  shipStatus.textContent = state.components.hull.integrity <= 0 ? "ship destroyed" : engine.powerLocked ? "power locked" : engine.powered ? "ship online" : "ship offline";
}

powerButton.addEventListener("click", () => {
  game.setShipPowered(!state.components.engine.powered);
  updateShipPowerDisplay();
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

  if (contract?.repeatable && contract.status === "paid") {
    activeDepositContractId = null;
    contractManager.offerContract(contract.id);
  } else if (contract?.status === "fulfilled") {
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

hubRepairButton.addEventListener("click", () => {
  game.repairAtDock();
  updateHudDisplay();
});

hubSellCargoButton.addEventListener("click", () => {
  sellCargoHold();
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

renderProcessorOutputs();
game.placeShipNearSite("scrap-porch");
restoreSavedWorld({ save: savedProfile, game, cargoHold });
clearOldPanelLayouts();
makePanelsDraggable();
wirePanelControlSounds();
journeyDirector.start();
applyDevStart(initialDevStart);
revealInstalledComponents();
renderContract();
updateShipPowerDisplay();
updateHudDisplay();

game.start();
processor.start();
cargoHold.start();
window.addEventListener("beforeunload", () => saveNow());

function updateHudDisplay() {
  renderProcessorOutputs();
  renderShipOffers();
  updateShipPowerDisplay();
  updateDepositTargetDisplay();

  creditCount.textContent = String(Math.floor(state.components.account.credits));
  fuelCount.textContent = String(Math.floor(state.components.engine.fuel));
  fuelFill.style.width = `${getMeterPercent(state.components.engine.fuel, state.components.engine.maxFuel)}%`;
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

  Object.entries(state.components).forEach(([componentId, componentState]) => {
    if (componentState?.installed) {
      setComponentAvailable(componentId, true);
    }
  });
}

function applyDevStart(devStartId) {
  if (!devStartId) {
    return;
  }

  if (devStartId === "red-work") {
    setupDevRedWorkStart();
    journeyDirector.startMission("chapter-1-red-work");
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

  renderContract();
  updateDockingDisplay(siteState);
  updateHubServiceDisplay(siteState);
}

function updateDockingDisplay(siteState) {
  const site = siteState.dockedSite ?? siteState.nearbySite;

  if (!state.components.docking.installed || !site) {
    dockingStatus.textContent = "no target";
    dockingTarget.textContent = "None";
    dockingDetail.textContent = "No dock target";
    dockToggleButton.textContent = "Dock";
    dockToggleButton.disabled = true;
    return;
  }

  const isDocked = siteState.dockedSite?.id === site.id;

  dockingStatus.textContent = isDocked ? "tether connected" : "tether available";
  dockingTarget.textContent = site.name;
  dockingDetail.textContent = isDocked ? "Docked" : "Press E to dock";
  dockToggleButton.textContent = isDocked ? "Undock" : "Dock";
  dockToggleButton.disabled = false;
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
    hubHull.textContent = `${Math.ceil(siteState.hullIntegrity)}%`;
    hubRepairCost.textContent = `${siteState.repairCost} cr`;
    hubCargoValue.textContent = `${getCargoHoldValue()} cr`;
    hubSellCargoButton.disabled = true;
    hubRepairButton.disabled = true;
    hubSupplyActions.hidden = true;
    renderHubServiceMenu(null);
    return;
  }

  if (wasHidden || wasLocked) {
    positionPanelById("hub");
    bringPanelToFront(hubPanel);
    playPanelReveal(hubPanel);
  }

  const hullPercent = Math.ceil(siteState.hullIntegrity);
  const activeService = activeHubServiceId ? getHubService(site.id, activeHubServiceId) : null;
  const isSupplyAvailable = getHubServices(site.id).some((service) => service.serviceType === "supply" && isHubServiceUnlocked(site.id, service));

  hubName.textContent = site.name;
  hubStatus.textContent = activeService?.organization ?? "service menu";
  hubDetail.textContent = activeService ? `${activeService.npcName}: ${getHubServicePrompt(activeService)}` : "Choose a service window.";
  hubHull.textContent = `${hullPercent}%`;
  hubRepairCost.textContent = `${siteState.repairCost} cr`;
  hubCargoValue.textContent = `${getCargoHoldValue()} cr`;
  hubSupplyActions.hidden = !isSupplyAvailable;
  hubSellCargoButton.disabled = !isSupplyAvailable || getCargoHoldValue() <= 0;
  hubRepairButton.disabled = !isSupplyAvailable || !siteState.canRepair || hullPercent >= 100 || siteState.credits < siteState.repairCost;
  renderHubServiceMenu(site);
}

function syncContractPanelVisibility(contract = contractManager.getCurrentContract()) {
  if (!contract) {
    setComponentAvailable("contract", false);
  }
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
  hubStatus.textContent = service.organization;
  hubDetail.textContent = `${service.npcName}: ${getHubServicePrompt(service)}`;
  renderHubServiceMenu(dockedSite);
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
    focusPanelById("contract");
    return;
  }

  if (service.serviceType === "supply") {
    bringPanelToFront(hubPanel);
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
    setComponentAvailable("contract", false);

    if (activeHubServiceId && ["contracts", "finance"].includes(getHubService(currentSiteState?.dockedSite?.id, activeHubServiceId)?.serviceType)) {
      activeHubServiceId = null;
      renderHubServiceMenu(currentSiteState?.dockedSite);
    }
  }
}

function closeDriveThroughWindows({ keepServiceType = null } = {}) {
  if (keepServiceType !== "shipyard") {
    setComponentAvailable("merchant", false);
  }

  if (!["contracts", "finance"].includes(keepServiceType) && !contractManager.getCurrentContract()) {
    setComponentAvailable("contract", false);
  }
}

function offerHubServiceContract(site, service) {
  const contractId = getNextHubServiceContractId(service);

  if (!contractId) {
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

  return contractIds.find((contractId) => {
    const existingContract = state.contracts.records[contractId];

    if (!existingContract) {
      return true;
    }

    return existingContract.repeatable && existingContract.status === "paid";
  });
}

function getHubServicePrompt(service) {
  if (service.serviceType === "shipyard") {
    return "ship offers are open at the yard window.";
  }

  if (service.serviceType === "finance") {
    return "financing records are handled through active contracts.";
  }

  if (service.serviceType === "contracts") {
    return "work offers will live here as Rook Industries comes online.";
  }

  if (service.serviceType === "supply") {
    return "basic repair and cargo services are available here.";
  }

  return service.description;
}

function updateLedgerDrivenSystems() {
  contractManager.update();
  journeyDirector.update();
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

  if (contract.repeatable && contract.status === "paid") {
    return "Run Again";
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
    (contract.repeatable && contract.status === "paid") ||
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

function updateDepositTargetDisplay() {
  const contract = contractManager.getCurrentContract();
  const isActiveDepositTarget = activeDepositContractId && contract?.id === activeDepositContractId && canDepositToContract(contract);

  cargoPanel.classList.toggle("is-deposit-target", Boolean(isActiveDepositTarget));
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

function setPanelHidden(panel, isHidden) {
  panel.classList.toggle("is-panel-hidden", isHidden);
}

function isPanelHidden(panel) {
  return panel.classList.contains("is-panel-hidden");
}

function setComponentAvailable(componentId, isAvailable = true) {
  const panel = document.querySelector(`[data-panel-id="${componentId}"]`);

  if (panel) {
    const wasLocked = panel.classList.contains("is-component-locked");
    panel.classList.toggle("is-component-locked", !isAvailable);

    if (isAvailable && wasLocked) {
      positionPanelById(componentId);
      bringPanelToFront(panel);
      playPanelReveal(panel);
    }
  }
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
  game.refreshSiteReadout();
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
  game.refreshSiteReadout();
  return true;
}

function sellCargoHold() {
  if (isPanelHidden(hubPanel) || hubSellCargoButton.disabled) {
    return;
  }

  const cargoValue = getCargoHoldValue();
  const cargoCounts = cargoHold.getUnitCounts();
  const totalUnits = Object.values(cargoCounts).reduce((sum, count) => sum + count, 0);

  if (cargoValue <= 0) {
    return;
  }

  cargoHold.drainUnits();
  Object.entries(cargoCounts).forEach(([type, count]) => {
    const visibleTransfers = Math.min(count, 10);

    for (let index = 0; index < visibleTransfers; index += 1) {
      window.setTimeout(() => game.createCargoTransferTrail(type), index * 90);
    }
  });
  state.components.account.credits += cargoValue;
  state.ledger.recordEvent("cargo.sold", {
    creditsEarned: cargoValue,
    units: cargoCounts,
    totalUnits,
  });
  updateHudDisplay();
  game.refreshSiteReadout();
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
    }
  });
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
    const offset = { x: savedPanel?.x ?? defaultPanel.x, y: savedPanel?.y ?? defaultPanel.y };
    let drag = null;

    panel.style.zIndex = String(getInitialPanelZ(panelId, savedPanel, defaultPanel));
    offsetsByPanelId.set(panelId, offset);
    applyPanelOffset(panel, offset, { clamp: isPanelMeasurable(panel) });
    savePanelLayout(panel, offset);

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("[data-close-panel]")) {
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
  positionPanelById = (panelId) => {
    const panel = document.querySelector(`[data-panel-id="${panelId}"]`);
    const offset = offsetsByPanelId.get(panelId);

    if (!panel || !offset) {
      return;
    }

    applyPanelOffset(panel, offset);
    savePanelLayout(panel, offset);
  };

  function setPanelTop(panel) {
    if (panel.dataset.panelId === "journey") {
      panel.style.zIndex = String(JOURNEY_PANEL_Z_INDEX);
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
    }
    panel.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
  }

  function clampPanelOffset(panel, offset) {
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
}

function renderShipOffers() {
  const currentCredits = Math.floor(state.components.account.credits);
  const renderedKey = shipOffersPanel.dataset.renderedKey;
  const nextKey = `${currentCredits}:${state.components.merchant.purchasedOfferId ?? "none"}`;

  if (renderedKey === nextKey) {
    return;
  }

  shipOffersPanel.dataset.renderedKey = nextKey;
  shipOffersPanel.replaceChildren(
    ...shipOffers.map((offer) => {
      const card = document.createElement("article");
      const title = document.createElement("h3");
      const price = document.createElement("strong");
      const description = document.createElement("p");
      const meta = document.createElement("div");
      const tags = document.createElement("div");
      const button = document.createElement("button");
      const canAfford = currentCredits >= offer.price;
      const isPurchased = state.components.merchant.purchasedOfferId === offer.id;

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
      button.textContent = isPurchased ? "Purchased" : canAfford ? "Buy Ship" : offer.special ? "I don't have enough" : "Out of Reach";
      button.disabled = isPurchased;
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
    .filter(([panelId]) => panelId !== "journey")
    .map(([, panel]) => panel.z)
    .filter((zIndex) => Number.isFinite(zIndex) && zIndex < JOURNEY_PANEL_Z_INDEX);
  const defaultZIndexes = Object.entries(DEFAULT_PANEL_LAYOUT)
    .filter(([panelId]) => panelId !== "journey")
    .map(([, panel]) => panel.z)
    .filter((zIndex) => Number.isFinite(zIndex) && zIndex < JOURNEY_PANEL_Z_INDEX);

  return Math.max(10, ...defaultZIndexes, ...savedZIndexes);
}

function getInitialPanelZ(panelId, savedPanel, defaultPanel) {
  if (panelId === "journey") {
    return JOURNEY_PANEL_Z_INDEX;
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
    },
  };

  window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}
