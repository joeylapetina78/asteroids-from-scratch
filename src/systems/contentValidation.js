import { getContractRequirementDefinition } from "./contractRules.js?v=fresh-20260708-patrol2";
import { COMPONENT_STATE_BY_PANEL_ID, PANEL_IDS } from "./componentRegistry.js?v=fresh-20260708-patrol2";
import { HUB_SERVICE_BEHAVIOR_BY_TYPE } from "./hubServiceBehaviors.js?v=fresh-20260708-patrol2";
import { getMissionActionDefinition } from "./missionActions.js?v=fresh-20260708-patrol2";
import { createGameState } from "../state/gameState.js?v=fresh-20260708-patrol2";

export function validateMissionDefinition(missionDefinition, context = createValidationContext()) {
  const issues = [];
  const beatIds = new Set((missionDefinition.beats ?? []).map((beat) => beat.id));

  if (!missionDefinition.id) {
    issues.push(createIssue("mission", "Mission is missing id."));
  }

  if (missionDefinition.startBeatId && !beatIds.has(missionDefinition.startBeatId)) {
    issues.push(createIssue("mission", `startBeatId '${missionDefinition.startBeatId}' does not match a beat id.`));
  }

  (missionDefinition.beats ?? []).forEach((beat) => {
    if (!beat.id) {
      issues.push(createIssue("mission", "Mission beat is missing id."));
    }

    validateActionList(beat.onEnter, `beat '${beat.id}' onEnter`, issues, context);

    (beat.transitions ?? []).forEach((transition) => {
      if (transition.nextStepId && !beatIds.has(transition.nextStepId)) {
        issues.push(
          createIssue(
            "mission",
            `Transition from beat '${beat.id}' points to missing nextStepId '${transition.nextStepId}'.`,
          ),
        );
      }

      validateActionList(transition.actions, `beat '${beat.id}' transition '${transition.eventType ?? "unknown"}'`, issues, context);
    });
  });

  (missionDefinition.considerations ?? []).forEach((consideration) => {
    validateActionList(
      consideration.actions,
      `consideration '${consideration.id ?? consideration.eventType ?? "unknown"}'`,
      issues,
      context,
    );
    (consideration.responses ?? []).forEach((response, index) => {
      if (!response.speaker || !response.text) {
        issues.push(
          createIssue(
            "mission",
            `Consideration '${consideration.id ?? consideration.eventType ?? "unknown"}' response ${index + 1} needs speaker and text.`,
          ),
        );
      }
    });
  });

  validateAcknowledgement(missionDefinition.prologue?.acknowledgement, `mission '${missionDefinition.id}' prologue`, issues, context);
  validateAcknowledgement(missionDefinition.completion?.acknowledgement, `mission '${missionDefinition.id}' completion`, issues, context);

  return issues;
}

export function validateContractDefinition(contractDefinition) {
  const issues = [];

  if (!contractDefinition.id) {
    issues.push(createIssue("contract", "Contract is missing id."));
  }

  (contractDefinition.terms?.requires ?? []).forEach((requirement, index) => {
    const definition = getContractRequirementDefinition(requirement.type);

    if (!definition) {
      issues.push(createIssue("contract", `Contract '${contractDefinition.id}' has unknown requirement type '${requirement.type}'.`));
      return;
    }

    definition.required.forEach((field) => {
      if (!(field in requirement)) {
        issues.push(
          createIssue(
            "contract",
            `Contract '${contractDefinition.id}' requirement ${index + 1} (${requirement.type}) is missing '${field}'.`,
          ),
        );
      }
    });
  });

  return issues;
}

export function validateHubServiceDefinitions(hubServiceDefinitions = {}, context = createValidationContext()) {
  const issues = [];

  Object.entries(hubServiceDefinitions).forEach(([siteId, services]) => {
    services.forEach((service) => {
      const serviceLabel = `service '${service.id}' at site '${siteId}'`;

      if (!service.id) {
        issues.push(createIssue("hub-service", `Hub service at site '${siteId}' is missing id.`));
      }

      if (!service.serviceType) {
        issues.push(createIssue("hub-service", `${serviceLabel} is missing serviceType.`));
      } else if (!HUB_SERVICE_BEHAVIOR_BY_TYPE[service.serviceType]) {
        issues.push(createIssue("hub-service", `${serviceLabel} uses unknown serviceType '${service.serviceType}'.`));
      } else {
        const panelId = HUB_SERVICE_BEHAVIOR_BY_TYPE[service.serviceType].panelId;

        if (panelId && !context.panelIds.has(panelId)) {
          issues.push(createIssue("hub-service", `${serviceLabel} serviceType '${service.serviceType}' opens missing panel '${panelId}'.`));
        }
      }

      (service.contractIds ?? []).forEach((contractId) => {
        if (!context.contractIds.has(contractId)) {
          issues.push(createIssue("hub-service", `${serviceLabel} references missing contract '${contractId}'.`));
        }
      });

      if (service.missionFirstContractId && !(service.contractIds ?? []).includes(service.missionFirstContractId)) {
        issues.push(
          createIssue(
            "hub-service",
            `${serviceLabel} missionFirstContractId '${service.missionFirstContractId}' is not in contractIds.`,
          ),
        );
      }

      Object.entries(service.contractPrerequisites ?? {}).forEach(([contractId, prerequisiteIds]) => {
        if (!(service.contractIds ?? []).includes(contractId)) {
          issues.push(createIssue("hub-service", `${serviceLabel} has prerequisites for non-service contract '${contractId}'.`));
        }

        prerequisiteIds.forEach((prerequisiteId) => {
          if (!context.contractIds.has(prerequisiteId)) {
            issues.push(createIssue("hub-service", `${serviceLabel} prerequisite '${prerequisiteId}' is not a known contract.`));
          }
        });
      });

      (service.componentOffers ?? []).forEach((offer) => {
        if (!context.componentIds.has(offer.componentId)) {
          issues.push(createIssue("hub-service", `${serviceLabel} component offer '${offer.id}' references missing component '${offer.componentId}'.`));
        }

        if (!context.panelIds.has(offer.componentId)) {
          issues.push(createIssue("hub-service", `${serviceLabel} component offer '${offer.id}' references missing panel '${offer.componentId}'.`));
        }
      });
    });
  });

  return issues;
}

export function validateContent({ missions = [], contracts = [], hubServiceDefinitions = {} }) {
  const context = createValidationContext({ missions, contracts, hubServiceDefinitions });

  return [
    ...missions.flatMap((mission) => validateMissionDefinition(mission, context)),
    ...contracts.flatMap((contract) => validateContractDefinition(contract)),
    ...validateHubServiceDefinitions(hubServiceDefinitions, context),
  ];
}

function validateActionList(actionList = [], label, issues, context) {
  actionList.forEach((action, index) => {
    const definition = getMissionActionDefinition(action.type);

    if (!definition) {
      issues.push(createIssue("mission", `${label} action ${index + 1} has unknown type '${action.type}'.`));
      return;
    }

    definition.required.forEach((field) => {
      if (!(field in action)) {
        issues.push(createIssue("mission", `${label} action ${index + 1} (${action.type}) is missing '${field}'.`));
      }
    });

    validateActionReferences(action, `${label} action ${index + 1} (${action.type})`, issues, context);
  });
}

function validateActionReferences(action, label, issues, context) {
  if ((action.type === "showComponent" || action.type === "hideComponent") && !context.panelIds.has(action.componentId)) {
    issues.push(createIssue("mission", `${label} references missing panel '${action.componentId}'.`));
  }

  if ((action.type === "setComponentValue" || action.type === "raiseComponentValue") && !context.componentIds.has(action.componentId)) {
    issues.push(createIssue("mission", `${label} references missing component state '${action.componentId}'.`));
  }

  if ((action.type === "setComponentValue" || action.type === "raiseComponentValue") && context.componentIds.has(action.componentId)) {
    const component = context.componentDefaults[action.componentId];

    if (!(action.key in component)) {
      issues.push(createIssue("mission", `${label} references missing key '${action.key}' on component '${action.componentId}'.`));
    }
  }

  if (action.type === "offerContract" && !context.contractIds.has(action.contractId)) {
    issues.push(createIssue("mission", `${label} references missing contract '${action.contractId}'.`));
  }

  if (action.type === "completeAndStartMission" && !context.missionIds.has(action.missionId)) {
    issues.push(createIssue("mission", `${label} references missing mission '${action.missionId}'.`));
  }

  if (action.type === "unlockHubService" && !context.serviceIdsBySite.get(action.siteId)?.has(action.serviceId)) {
    issues.push(createIssue("mission", `${label} references missing service '${action.serviceId}' at site '${action.siteId}'.`));
  }

  if (action.type === "requestAttention") {
    validateAttentionReference(action, label, issues, context);
  }
}

function validateAttentionReference(action, label, issues, context) {
  if (action.targetId) {
    if (action.targetId.startsWith("panel:")) {
      const panelId = action.targetId.slice("panel:".length);

      if (!context.panelIds.has(panelId)) {
        issues.push(createIssue("mission", `${label} references missing attention panel '${panelId}'.`));
      }
    } else if (action.targetId.startsWith("hub-service:")) {
      const [, siteId, serviceId] = action.targetId.split(":");

      if (!context.serviceIdsBySite.get(siteId)?.has(serviceId)) {
        issues.push(createIssue("mission", `${label} references missing attention service '${serviceId}' at site '${siteId}'.`));
      }
    }

    return;
  }

  if (action.targetType === "panel" && !context.panelIds.has(action.panelId)) {
    issues.push(createIssue("mission", `${label} references missing attention panel '${action.panelId}'.`));
  }

  if (action.targetType === "hub-service" && !context.serviceIdsBySite.get(action.siteId)?.has(action.serviceId)) {
    issues.push(createIssue("mission", `${label} references missing attention service '${action.serviceId}' at site '${action.siteId}'.`));
  }
}

function validateAcknowledgement(acknowledgement, label, issues, context) {
  if (!acknowledgement) {
    return;
  }

  if (acknowledgement.action === "startMission" && !context.missionIds.has(acknowledgement.missionId)) {
    issues.push(createIssue("mission", `${label} acknowledgement references missing mission '${acknowledgement.missionId}'.`));
  }
}

function createValidationContext({ missions = [], contracts = [], hubServiceDefinitions = {} } = {}) {
  const componentDefaults = createGameState().components;

  return {
    componentDefaults,
    componentIds: new Set(Object.keys(componentDefaults)),
    contractIds: new Set(contracts.map((contract) => contract.id)),
    missionIds: new Set(missions.map((mission) => mission.id)),
    panelIds: new Set(PANEL_IDS),
    shipSystemPanelIds: new Set(Object.keys(COMPONENT_STATE_BY_PANEL_ID)),
    serviceIdsBySite: new Map(
      Object.entries(hubServiceDefinitions).map(([siteId, services]) => [
        siteId,
        new Set(services.map((service) => service.id)),
      ]),
    ),
  };
}

function createIssue(kind, message) {
  return { kind, message };
}
