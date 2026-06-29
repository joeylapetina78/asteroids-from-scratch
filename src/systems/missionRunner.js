export function createMissionRunner({ missionDefinition, state, actions }) {
  const stepsById = new Map(missionDefinition.steps.map((step) => [step.id, step]));

  function startOffer() {
    const prologue = missionDefinition.prologue;

    Object.assign(state.journey, {
      chapterId: prologue.chapterId,
      chapterName: prologue.chapterName,
      episodeName: prologue.episodeName,
    });
    state.journey.flags = {};
    state.journey.currentStepId = null;
    state.journey.completedStepIds = [];
    state.journey.messages = [];
    actions.say(prologue.speaker, prologue.text);
    setMission({
      id: missionDefinition.id,
      title: prologue.title,
      status: "offered",
      objective: prologue.objective,
      actionLabel: prologue.actionLabel,
      helpText: prologue.helpText ?? prologue.objective,
      successCriteria: missionDefinition.successCriteria,
      targetSiteId: missionDefinition.targetSiteId ?? null,
    });
  }

  function accept() {
    const activeChapter = missionDefinition.activeChapter;

    Object.assign(state.journey, {
      chapterId: activeChapter.chapterId,
      chapterName: activeChapter.chapterName,
      episodeName: activeChapter.episodeName,
    });
    setMission({
      ...state.journey.mission,
      title: missionDefinition.title,
      status: "active",
      actionLabel: null,
      acceptedAt: Date.now(),
    });
    actions.recordEvent(
      "mission.accepted",
      {
        missionId: missionDefinition.id,
        missionName: missionDefinition.title,
      },
      { visible: false },
    );
    goToStep(missionDefinition.startStepId);
  }

  function acknowledge() {
    const acknowledgement = state.journey.pendingAcknowledgement;

    if (!acknowledgement) {
      return false;
    }

    state.journey.pendingAcknowledgement = null;
    runActions(getCurrentStep()?.onAcknowledge ?? []);
    return true;
  }

  function handleEvent(event) {
    const step = getCurrentStep();

    if (!step || state.journey.mission?.status !== "active") {
      return false;
    }

    const consideration = (step.considerations ?? []).find((candidate) => matchesEventRule(candidate, event));

    if (consideration) {
      applyRuleMarkers(consideration);
      runActions(consideration.actions ?? []);
    }

    const transition = (step.transitions ?? []).find((candidate) => matchesEventRule(candidate, event));

    if (!transition) {
      return Boolean(consideration);
    }

    applyRuleMarkers(transition);
    runActions(transition.actions ?? []);

    if (transition.nextStepId) {
      goToStep(transition.nextStepId);
    }

    return true;
  }

  function goToStep(stepId) {
    const step = stepsById.get(stepId);

    if (!step) {
      throw new Error(`Unknown mission step: ${stepId}`);
    }

    const previousStepId = state.journey.currentStepId;

    if (previousStepId && previousStepId !== stepId) {
      state.journey.completedStepIds = [...new Set([...state.journey.completedStepIds, previousStepId])];
    }

    state.journey.currentStepId = stepId;
    setMission({
      ...state.journey.mission,
      objective: step.objective,
      helpText: step.helpText,
    });
    runActions(step.onEnter ?? []);
  }

  function runActions(actionList) {
    actionList.forEach((action) => {
      if (action.type === "say") {
        actions.say(action.speaker, action.text, action.acknowledgement);
      } else if (action.type === "clearMessage") {
        actions.clearMessage();
      } else if (action.type === "showComponent") {
        actions.showComponent(action.componentId, action.componentName);
      } else if (action.type === "offerContract") {
        actions.offerContract(action.contractId);
      } else if (action.type === "setComponentValue") {
        state.components[action.componentId][action.key] = action.value;
      } else if (action.type === "raiseComponentValue") {
        const component = state.components[action.componentId];
        component[action.key] = Math.max(component[action.key], action.value);
      } else if (action.type === "goToStep") {
        goToStep(action.stepId);
      } else if (action.type === "completeMission") {
        actions.completeMission(missionDefinition);
      } else if (action.type === "spawnHunterNearShip") {
        actions.spawnHunterNearShip(action.reason);
      }
    });
  }

  function setMission(mission) {
    state.journey.mission = mission;
  }

  function getCurrentStep() {
    return stepsById.get(state.journey.currentStepId);
  }

  function matchesEventRule(rule, event) {
    if (rule.once && state.journey.flags[rule.setFlag ?? rule.id]) {
      return false;
    }

    if (rule.requiresFlag && !state.journey.flags[rule.requiresFlag]) {
      return false;
    }

    if (rule.requiresFlags?.some((flag) => !state.journey.flags[flag])) {
      return false;
    }

    if (rule.eventType !== event.type) {
      return false;
    }

    return matchesPayload(rule.payloadEquals ?? {}, event.payload ?? {});
  }

  function matchesPayload(expectedPayload, actualPayload) {
    return Object.entries(expectedPayload).every(([key, expectedValue]) => {
      if (typeof expectedValue === "string" && expectedValue.startsWith("not:")) {
        return actualPayload[key] !== expectedValue.slice(4);
      }

      return actualPayload[key] === expectedValue;
    });
  }

  function applyRuleMarkers(rule) {
    if (rule.setFlag) {
      state.journey.flags[rule.setFlag] = true;
    }
  }

  return {
    accept,
    acknowledge,
    handleEvent,
    startOffer,
  };
}
