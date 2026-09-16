export const MISSION_ACTION_DEFINITIONS = {
  say: {
    label: "Say",
    description: "Show NPC dialogue in the Journey/comms panel.",
    required: ["speaker", "text"],
    optional: ["acknowledgement"],
  },
  clearMessage: {
    label: "Clear Message",
    description: "Clear the current NPC dialogue text.",
    required: [],
  },
  showComponent: {
    label: "Show Panel",
    description: "Reveal an interface panel or component window.",
    required: ["componentId"],
    optional: ["componentName"],
  },
  hideComponent: {
    label: "Hide Panel",
    description: "Hide an interface panel or component window.",
    required: ["componentId"],
  },
  dockComponent: {
    label: "Rack Module",
    description: "Return a cockpit module to the module bay so the player must switch it on.",
    required: ["componentId"],
  },
  offerContract: {
    label: "Offer Contract",
    description: "Open or create a contract offer through the contract system.",
    required: ["contractId"],
  },
  grantContract: {
    label: "Grant Contract",
    description: "Offer and immediately accept a zero-cost authored grant such as a sponsored work pass.",
    required: ["contractId"],
  },
  showEmptyRack: {
    label: "Show Empty Rack",
    description: "Reveal a module's slot in the bay WITHOUT fitting the hardware — a rack waiting to be filled.",
    required: ["componentId"],
    optional: ["componentName"],
  },
  openModuleBay: {
    label: "Open Module Bay",
    description: "Slide the module bay open so the player sees what is racked, and what is not.",
    required: [],
  },
  buySalvageHull: {
    label: "Buy Salvage Hull",
    description: "Sell the player the impounded hull they are flying, from the Authority, with the starter loan's money.",
    required: [],
  },
  setComponentValue: {
    label: "Set Component Value",
    description: "Set one key on an installed component state object.",
    required: ["componentId", "key", "value"],
  },
  raiseComponentValue: {
    label: "Raise Component Value",
    description: "Raise one component value to at least the supplied value.",
    required: ["componentId", "key", "value"],
  },
  serviceComponent: {
    label: "Service Component",
    description: "Put a component through the shared service seam: wear cleared, stage back to healthy, service count up. A tune-up, not a replacement — lifetime degradation stays.",
    required: ["componentId"],
  },
  unlockHubService: {
    label: "Unlock Hub Service",
    description: "Make a hub NPC/service available.",
    required: ["siteId", "serviceId"],
  },
  requestAttention: {
    label: "Request Attention",
    description: "Ask the UI to visually call attention to a target.",
    required: ["targetId"],
    optional: ["mode"],
  },
  setPaperworkFiling: {
    label: "Set Paperwork Filing",
    description: "Enable or disable the FILE/DESK controls on paperwork panels after the mechanic is introduced.",
    required: ["isEnabled"],
  },
  placePaperworkOnDesk: {
    label: "Place Paperwork On Desk",
    description: "Reveal a document and place it at the center of the cockpit desk.",
    required: ["componentId"],
  },
  filePaperwork: {
    label: "File Paperwork",
    description: "Return a signed paperwork panel to the drawer.",
    required: ["componentId"],
  },
  runInspection: {
    label: "Run Inspection",
    description: "Ask a shared inspection system to review paperwork for an entity, site, or authority.",
    required: ["siteId"],
    optional: ["inspectionType"],
  },
  spawnPatrolIntercept: {
    label: "Spawn Patrol Intercept",
    description: "Ask the world simulation to send an authority patrol craft for a scripted intercept.",
    required: ["siteId"],
    optional: ["reason"],
  },
  setEnginePowerLock: {
    label: "Set Engine Power Lock",
    description: "Lock or unlock the engine power control.",
    required: ["isLocked"],
  },
  goToStep: {
    label: "Go To Mission Step",
    description: "Jump to another beat in the same mission.",
    required: ["stepId"],
  },
  goToStepIfFlags: {
    label: "Skip Ahead If Already Done",
    description: "Jump to another beat when the player has already satisfied every listed flag.",
    required: ["flags", "stepId"],
  },
  completeMission: {
    label: "Complete Mission",
    description: "Complete the active mission.",
    required: [],
  },
  startInterludeMission: {
    label: "Start Interlude Mission",
    description: "Suspend the active mission, run another (a lesson at a window), and resume the first when it completes.",
    required: ["missionId"],
  },
  giveResource: {
    label: "Give Resource",
    description: "Hand the ship loose units of a resource, as if scooped — into the processor if one runs, else the hold.",
    required: ["resourceType", "amount"],
  },
  damageHull: {
    label: "Damage Hull",
    description: "Take integrity off the hull, for a demonstration. Never below a safe floor.",
    required: ["amount"],
  },
  drainFuel: {
    label: "Drain Fuel",
    description: "Bleed fuel out of the drive, for a demonstration.",
    required: ["amount"],
  },
  completeAndStartMission: {
    label: "Complete And Start Mission",
    description: "Complete the active mission and start another mission.",
    required: ["missionId"],
  },
  spawnHunterNearShip: {
    label: "Spawn Hunter Near Ship",
    description: "Spawn a hostile hunter near the controlled ship for a scripted danger beat.",
    required: [],
    optional: ["reason"],
  },
  spawnPirateNearShip: {
    label: "Spawn Pirate Near Ship",
    description: "Spawn a pirate attacker near the controlled ship for a scripted contract danger beat.",
    required: [],
    optional: ["reason"],
  },
  setFlag: {
    label: "Set Flag",
    description: "Set a flag in the current mission's journey.flags.",
    required: ["flag"],
  },
  setGlobalFlag: {
    label: "Set Global Flag",
    description: "Set a flag that persists across missions in journey.globalFlags.",
    required: ["flag"],
  },
  setViewportLayout: {
    label: "Set Viewport Layout",
    description: "Change how the viewport panel is displayed. 'fullscreen-background' fills the entire page; 'default' restores normal layout.",
    required: ["layout"],
  },
};

export const MISSION_ACTION_TYPES = Object.keys(MISSION_ACTION_DEFINITIONS);

export function getMissionActionDefinition(actionType) {
  return MISSION_ACTION_DEFINITIONS[actionType] ?? null;
}

export function runMissionActions(actionList, context) {
  actionList.forEach((action) => runMissionAction(action, context));
}

function runMissionAction(action, { state, actions, missionDefinition, goToStep }) {
  if (!getMissionActionDefinition(action.type)) {
    throw new Error(`Unknown mission action type: ${action.type}`);
  }

  if (action.type === "say") {
    const pilotFirstName = state.legal?.pilotLicense?.firstName || "Rookie";
    const text = action.text.replaceAll("{pilotFirstName}", pilotFirstName);
    actions.say(action.speaker, text, action.acknowledgement);
  } else if (action.type === "clearMessage") {
    actions.clearMessage();
  } else if (action.type === "showComponent") {
    actions.showComponent(action.componentId, action.componentName);
  } else if (action.type === "hideComponent") {
    actions.hideComponent(action.componentId);
  } else if (action.type === "dockComponent") {
    actions.dockComponent?.(action.componentId);
  } else if (action.type === "offerContract") {
    actions.offerContract(action.contractId);
  } else if (action.type === "grantContract") {
    actions.grantContract?.(action.contractId);
  } else if (action.type === "buySalvageHull") {
    actions.buySalvageHull?.();
  } else if (action.type === "openModuleBay") {
    actions.openModuleBay?.();
  } else if (action.type === "showEmptyRack") {
    actions.showEmptyRack?.(action.componentId, action.componentName);
  } else if (action.type === "setComponentValue") {
    state.components[action.componentId][action.key] = action.value;
  } else if (action.type === "raiseComponentValue") {
    const component = state.components[action.componentId];
    component[action.key] = Math.max(component[action.key], action.value);
  } else if (action.type === "serviceComponent") {
    actions.serviceComponent?.(action.componentId);
  } else if (action.type === "unlockHubService") {
    actions.unlockHubService(action.siteId, action.serviceId);
  } else if (action.type === "requestAttention") {
    actions.requestAttention(action);
  } else if (action.type === "setPaperworkFiling") {
    state.ui.paperwork ??= {};
    state.ui.paperwork.filingIntroduced = action.isEnabled;
    actions.updatePaperworkControls?.();
  } else if (action.type === "placePaperworkOnDesk") {
    actions.placePaperworkOnDesk?.(action.componentId);
  } else if (action.type === "filePaperwork") {
    actions.filePaperwork?.(action.componentId);
  } else if (action.type === "runInspection") {
    actions.runInspection(action.siteId, action);
  } else if (action.type === "spawnPatrolIntercept") {
    actions.spawnPatrolIntercept(action.siteId, action.reason);
  } else if (action.type === "enableHubPatrol") {
    actions.enableHubPatrol();
  } else if (action.type === "setEnginePowerLock") {
    actions.setEnginePowerLock(action.isLocked);
  } else if (action.type === "goToStep") {
    goToStep(action.stepId);
  } else if (action.type === "goToStepIfFlags") {
    // A player can get ahead of the script. Transitions only fire on incoming
    // events, so a beat entered with its flags ALREADY satisfied would sit
    // there asking for something that has been done — waiting on an event that
    // has already passed. Checked on enter, before the beat speaks, so the
    // alternate line is what the player hears.
    const required = Array.isArray(action.flags) ? action.flags : [];
    if (required.length > 0 && required.every((flag) => Boolean(state.journey.flags?.[flag]))) {
      goToStep(action.stepId);
    }
  } else if (action.type === "completeMission") {
    actions.completeMission(missionDefinition);
  } else if (action.type === "startInterludeMission") {
    actions.startInterlude?.(action.missionId);
  } else if (action.type === "giveResource") {
    actions.giveResource?.(action.resourceType, action.amount);
  } else if (action.type === "damageHull") {
    actions.damageHull?.(action.amount);
  } else if (action.type === "drainFuel") {
    actions.drainFuel?.(action.amount);
  } else if (action.type === "completeAndStartMission") {
    actions.completeMission(missionDefinition);
    actions.startMission(action.missionId);
  } else if (action.type === "spawnHunterNearShip") {
    actions.spawnHunterNearShip(action.reason);
  } else if (action.type === "spawnPirateNearShip") {
    actions.spawnPirateNearShip(action.reason);
  } else if (action.type === "setFlag") {
    state.journey.flags ??= {};
    state.journey.flags[action.flag] = true;
  } else if (action.type === "clearFlag") {
    if (state.journey.flags) delete state.journey.flags[action.flag];
  } else if (action.type === "setGlobalFlag") {
    state.journey.globalFlags ??= {};
    state.journey.globalFlags[action.flag] = true;
  } else if (action.type === "setViewportLayout") {
    actions.setViewportLayout?.(action.layout);
  }
}
