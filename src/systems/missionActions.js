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
  offerContract: {
    label: "Offer Contract",
    description: "Open or create a contract offer through the contract system.",
    required: ["contractId"],
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
  completeMission: {
    label: "Complete Mission",
    description: "Complete the active mission.",
    required: [],
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
    actions.say(action.speaker, action.text, action.acknowledgement);
  } else if (action.type === "clearMessage") {
    actions.clearMessage();
  } else if (action.type === "showComponent") {
    actions.showComponent(action.componentId, action.componentName);
  } else if (action.type === "hideComponent") {
    actions.hideComponent(action.componentId);
  } else if (action.type === "offerContract") {
    actions.offerContract(action.contractId);
  } else if (action.type === "setComponentValue") {
    state.components[action.componentId][action.key] = action.value;
  } else if (action.type === "raiseComponentValue") {
    const component = state.components[action.componentId];
    component[action.key] = Math.max(component[action.key], action.value);
  } else if (action.type === "unlockHubService") {
    actions.unlockHubService(action.siteId, action.serviceId);
  } else if (action.type === "requestAttention") {
    actions.requestAttention(action);
  } else if (action.type === "setPaperworkFiling") {
    state.ui.paperwork ??= {};
    state.ui.paperwork.filingIntroduced = action.isEnabled;
    actions.updatePaperworkControls?.();
  } else if (action.type === "runInspection") {
    actions.runInspection(action.siteId, action);
  } else if (action.type === "spawnPatrolIntercept") {
    actions.spawnPatrolIntercept(action.siteId, action.reason);
  } else if (action.type === "setEnginePowerLock") {
    actions.setEnginePowerLock(action.isLocked);
  } else if (action.type === "goToStep") {
    goToStep(action.stepId);
  } else if (action.type === "completeMission") {
    actions.completeMission(missionDefinition);
  } else if (action.type === "completeAndStartMission") {
    actions.completeMission(missionDefinition);
    actions.startMission(action.missionId);
  } else if (action.type === "spawnHunterNearShip") {
    actions.spawnHunterNearShip(action.reason);
  }
}
