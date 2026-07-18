import { runMissionActions } from "./missionActions.js?v=fresh-20260717-2003-fcd6b0d";
import { applyRuleMarkers, getRuleActions, matchesEventRule } from "./missionRules.js?v=fresh-20260717-2003-fcd6b0d";

export function createMissionRunner({ missionDefinition, state, actions }) {
  const beatDefs = missionDefinition.beats ?? missionDefinition.steps;
  const stepsById = new Map(beatDefs.map((beat) => [beat.id, beat]));
  const beatIndexById = new Map(beatDefs.map((beat, index) => [beat.id, index]));
  const missionConsiderations = missionDefinition.considerations ?? [];

  function startOffer() {
    const prologue = missionDefinition.prologue;

    state.journey.pendingAcknowledgement = null;
    state.journey.messages = [];
    Object.assign(state.journey, {
      chapterId: prologue.chapterId,
      chapterName: prologue.chapterName,
      episodeName: prologue.episodeName,
    });
    state.journey.flags = {};
    state.journey.globalFlags ??= {};
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
      patrolExemptSiteIds: missionDefinition.patrolExemptSiteIds ?? [],
    });
  }

  function accept() {
    const activeChapter = missionDefinition.activeChapter;

    state.journey.pendingAcknowledgement = null;
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
    goToStep(missionDefinition.startBeatId ?? missionDefinition.startStepId);
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
    if (pendingDelayedTransition) {
      pendingDelayedTransition.queuedEvents.push(event);
      return false;
    }

    const step = getCurrentStep();

    if (!step || state.journey.mission?.status !== "active") {
      return false;
    }

    const controlLocked = state.ledger.getSignal("actor.controlLocked");
    const currentBeatIndex = beatIndexById.get(state.journey.currentStepId) ?? -1;
    const activeMissionConsiderations = missionConsiderations.filter((c) => {
      const fromIndex = c.fromBeat !== undefined ? (beatIndexById.get(c.fromBeat) ?? -1) : 0;
      const toIndex = c.throughBeat !== undefined ? (beatIndexById.get(c.throughBeat) ?? -1) : Infinity;
      return currentBeatIndex >= fromIndex && currentBeatIndex <= toIndex;
    });
    const allConsiderations = [...(step.considerations ?? []), ...activeMissionConsiderations];
    const consideration = state.journey.pendingAcknowledgement
      ? null
      : allConsiderations.find(
          (candidate) => (!controlLocked || candidate.allowWhileControlLocked) && matchesEventRule(candidate, event, { state }),
        );

    if (consideration) {
      const considerationActions = getRuleActions(consideration, { state });
      applyRuleMarkers(consideration, { state });
      runActions(considerationActions);
    }

    const transition = (step.transitions ?? []).find((candidate) => matchesEventRule(candidate, event, { state }));

    if (!transition) {
      return Boolean(consideration);
    }

    const transitionActions = getRuleActions(transition, { state });
    applyRuleMarkers(transition, { state });
    runActions(transitionActions);

    if (transition.nextStepId) {
      if (transition.delayMs) {
        const sourceStepId = state.journey.currentStepId;
        pendingDelayedTransition = {
          nextStepId: transition.nextStepId,
          queuedEvents: [],
          sourceStepId,
        };
        setTimeout(() => {
          const pending = pendingDelayedTransition;
          pendingDelayedTransition = null;

          if (!destroyed && pending?.sourceStepId === sourceStepId && state.journey.currentStepId === sourceStepId) {
            goToStep(pending.nextStepId);
            actions.onChange?.();
            replayQueuedEvents(pending.queuedEvents);
            actions.onChange?.();
          }
        }, transition.delayMs);
      } else {
        goToStep(transition.nextStepId);
      }
    } else {
      runActions(step.onEnd ?? []);
    }

    return true;
  }

  function replayQueuedEvents(events) {
    for (const event of events) {
      if (destroyed) {
        return;
      }

      handleEvent(event);
    }
  }

  function goToStep(stepId) {
    const step = stepsById.get(stepId);

    if (!step) {
      console.warn(`Mission step not found: ${stepId} — resetting to start`);
      goToStep(missionDefinition.startBeatId ?? missionDefinition.startStepId);
      return;
    }

    const previousStepId = state.journey.currentStepId;

    if (previousStepId && previousStepId !== stepId) {
      state.journey.completedStepIds = [...new Set([...state.journey.completedStepIds, previousStepId])];
    }

    state.journey.pendingAcknowledgement = null;
    state.journey.currentStepId = stepId;
    setMission({
      ...state.journey.mission,
      objective: step.objective,
      helpText: step.helpText,
      actionLabel: step.actionLabel ?? null,
      tasks: step.tasks ?? [],
    });
    runActions(step.onEnter ?? []);
  }

  function runActions(actionList) {
    runMissionActions(actionList, {
      state,
      actions,
      missionDefinition,
      goToStep,
    });
  }

  function setMission(mission) {
    state.journey.mission = mission;
  }

  function getCurrentStep() {
    return stepsById.get(state.journey.currentStepId);
  }

  let destroyed = false;
  let pendingDelayedTransition = null;

  return {
    accept,
    acknowledge,
    handleEvent: (event) => (destroyed ? false : handleEvent(event)),
    startOffer,
    destroy: () => { destroyed = true; },
  };
}
