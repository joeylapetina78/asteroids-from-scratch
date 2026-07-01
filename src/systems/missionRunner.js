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

    const controlLocked = state.ledger.getSignal("player.controlLocked");
    const consideration = state.journey.pendingAcknowledgement
      ? null
      : (step.considerations ?? []).find(
          (candidate) => (!controlLocked || candidate.allowWhileControlLocked) && matchesEventRule(candidate, event),
        );

    if (consideration) {
      const considerationActions = getRuleActions(consideration);
      applyRuleMarkers(consideration);
      runActions(considerationActions);
    }

    const transition = (step.transitions ?? []).find((candidate) => matchesEventRule(candidate, event));

    if (!transition) {
      return Boolean(consideration);
    }

    const transitionActions = getRuleActions(transition);
    applyRuleMarkers(transition);
    runActions(transitionActions);

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
    });
  }

  function setMission(mission) {
    state.journey.mission = mission;
  }

  function getCurrentStep() {
    return stepsById.get(state.journey.currentStepId);
  }

  function matchesEventRule(rule, event) {
    if (!rule.repeatable && rule.once && state.journey.flags[rule.setFlag ?? rule.id]) {
      return false;
    }

    if (rule.repeatable && rule.cooldownMs) {
      const lastAt = state.journey.flags[getRuleLastAtKey(rule)] ?? 0;

      if (Date.now() - lastAt < rule.cooldownMs) {
        return false;
      }
    }

    if (rule.maxRuns !== undefined && getRuleRunCount(rule) >= rule.maxRuns) {
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

    if (!matchesPayload(rule.payloadEquals ?? {}, event.payload ?? {})) {
      return false;
    }

    return matchesConditions(rule, event);
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

    if (rule.repeatable || rule.responses?.length || rule.maxRuns !== undefined) {
      state.journey.flags[getRuleCountKey(rule)] = getRuleRunCount(rule) + 1;
      state.journey.flags[getRuleLastAtKey(rule)] = Date.now();
    }
  }

  function getRuleActions(rule) {
    if (!rule.responses?.length) {
      return rule.actions ?? [];
    }

    const runCount = getRuleRunCount(rule);
    const responseIndex =
      rule.responseMode === "loop"
        ? runCount % rule.responses.length
        : Math.min(runCount, rule.responses.length - 1);
    const response = rule.responses[responseIndex];

    return [
      ...(rule.beforeResponseActions ?? []),
      { type: "say", ...response },
      ...(rule.afterResponseActions ?? []),
    ];
  }

  function getRuleRunCount(rule) {
    return state.journey.flags[getRuleCountKey(rule)] ?? 0;
  }

  function getRuleCountKey(rule) {
    return `rule:${rule.id}:count`;
  }

  function getRuleLastAtKey(rule) {
    return `rule:${rule.id}:lastAt`;
  }

  function matchesConditions(rule, event) {
    const ledger = state.ledger;

    if (rule.requiresSignal && !ledger.getSignal(rule.requiresSignal)) {
      return false;
    }

    if (rule.requiresSignals?.some((signal) => !ledger.getSignal(signal))) {
      return false;
    }

    if (rule.forbidSignal && ledger.getSignal(rule.forbidSignal)) {
      return false;
    }

    if (rule.forbidSignals?.some((signal) => ledger.getSignal(signal))) {
      return false;
    }

    if (rule.requiresStat && !matchesStatCondition(rule.requiresStat)) {
      return false;
    }

    if (rule.requiresStats?.some((condition) => !matchesStatCondition(condition))) {
      return false;
    }

    if (rule.requiresRecentEvent && !matchesRecentEventCondition(rule.requiresRecentEvent)) {
      return false;
    }

    if (typeof rule.requiresCondition === "function") {
      return Boolean(rule.requiresCondition({ event, ledger, state }));
    }

    return true;
  }

  function matchesStatCondition(condition) {
    const value = state.ledger.getStat(condition.key, condition.fallback ?? 0);

    if (condition.equals !== undefined && value !== condition.equals) {
      return false;
    }

    if (condition.min !== undefined && value < condition.min) {
      return false;
    }

    if (condition.max !== undefined && value > condition.max) {
      return false;
    }

    return true;
  }

  function matchesRecentEventCondition(condition) {
    const lastSeen = state.ledger.getLastSeen(condition.type);

    if (!lastSeen) {
      return false;
    }

    if (condition.withinMs !== undefined && Date.now() - lastSeen.time > condition.withinMs) {
      return false;
    }

    return matchesPayload(condition.payloadEquals ?? {}, lastSeen.payload ?? {});
  }

  return {
    accept,
    acknowledge,
    handleEvent,
    startOffer,
  };
}
