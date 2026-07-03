import { chapterOneInterviewMission } from "../content/missions/chapterOneInterview.js?v=tutorial-polish-v1";
import { chapterOneNewShipMission } from "../content/missions/chapterOneNewShip.js?v=mission-beats-v2";
import { chapterOneRedWorkMission } from "../content/missions/chapterOneRedWork.js?v=mission-beats-v3";
import { getComponentStateIdForPanel, STARTUP_HIDDEN_PANEL_IDS } from "./componentRegistry.js?v=component-visibility-v1";
import { createMissionRunner } from "./missionRunner.js?v=tutorial-polish-v1";

const MISSION_DEFINITIONS = new Map(
  [chapterOneInterviewMission, chapterOneNewShipMission, chapterOneRedWorkMission].map((missionDefinition) => [missionDefinition.id, missionDefinition]),
);
const NPC_MESSAGE_DURATION_MS = 18000;

export function createJourneyDirector({
  state,
  game = null,
  onChange = () => {},
  offerContract = () => {},
  showComponent = () => {},
  unlockHubService = () => {},
  requestAttention = () => {},
  runInspection = () => {},
  spawnPatrolIntercept = () => {},
  emergencyTow = () => {},
}) {
  const journey = state.journey;
  let lastEventId = 0;
  let activeMission = createMission(chapterOneInterviewMission);

  function start() {
    showOnlyInitialComponents();

    if (journey.mission?.id && MISSION_DEFINITIONS.has(journey.mission.id)) {
      activeMission = createMission(MISSION_DEFINITIONS.get(journey.mission.id));
      onChange(journey);
      return;
    }

    activeMission.startOffer();
    onChange(journey);
  }

  function startFreeMode() {
    showOnlyInitialComponents();
    // Show all flight panels immediately — explorer skips the mission unlock sequence.
    ["viewport", "hull", "docking", "engine", "scanner", "miner", "collector", "processor", "cargo"].forEach((id) => {
      showComponent(id);
    });
    journey.chapterId = "free";
    journey.chapterName = "Free Play";
    journey.episodeName = "Explorer Mode";
    journey.mission = null;
    onChange(journey);
  }

  function acceptMission() {
    if (journey.mission?.status !== "offered") {
      return;
    }

    activeMission.accept();
    onChange(journey);
  }

  function acknowledge() {
    const acknowledgement = journey.pendingAcknowledgement;

    if (!activeMission.acknowledge()) {
      return;
    }

    if (acknowledgement?.action === "startMission") {
      startMission(acknowledgement.missionId);
    } else if (acknowledgement?.action === "emergencyTow") {
      emergencyTow();
      clearMessage();
    }

    onChange(journey);
  }

  function pressJourneyButton() {
    if (journey.pendingAcknowledgement) {
      acknowledge();
      return;
    }

    if (journey.mission?.status === "offered") {
      acceptMission();
    }
  }

  function update() {
    const events = state.ledger.getEventsAfterId(lastEventId, { includeHidden: true });

    events.forEach((event) => {
      lastEventId = Math.max(lastEventId, event.id);

      if (activeMission.handleEvent(event)) {
        onChange(journey);
      }
    });
  }

  function completeMission(missionDefinition) {
    if (journey.mission?.status === "completed") {
      return;
    }

    const elapsedSeconds = Math.round((Date.now() - journey.mission.acceptedAt) / 1000);
    const hull = Math.round(state.components.hull.integrity);
    const completion = missionDefinition.completion;
    const grade = getCompletionGrade(completion, { hull, elapsedSeconds });

    journey.mission = {
      ...journey.mission,
      status: "completed",
      objective: completion?.objective ?? "Assessment complete.",
      helpText: completion?.helpText ?? "Mission complete. You made it to Yard Exchange.",
      completedAt: Date.now(),
      elapsedSeconds,
      grade: grade?.id ?? null,
    };
    state.ledger.recordEvent(
      "mission.completed",
      {
        missionId: missionDefinition.id,
        missionName: missionDefinition.title,
        grade: grade?.id ?? null,
        hull,
        elapsedSeconds,
      },
      { visible: true },
    );
    if (completion) {
      say(completion.speaker ?? "Journey", grade?.line ?? completion.line ?? "Mission complete.", completion.acknowledgement);
      return;
    }

    if (missionDefinition.nextMissionId) {
      say("Journey", "Mission complete.", {
        label: missionDefinition.nextMissionLabel ?? "Continue",
        action: "startMission",
        missionId: missionDefinition.nextMissionId,
      });
      return;
    }

    say("Journey", "Mission complete.");
  }

  function startMission(missionId) {
    const missionDefinition = MISSION_DEFINITIONS.get(missionId);

    if (!missionDefinition) {
      throw new Error(`Unknown mission: ${missionId}`);
    }

    activeMission = createMission(missionDefinition);
    activeMission.startOffer();

    if (missionDefinition.autoAcceptOnStart) {
      activeMission.accept();
    }

    onChange(journey);
  }

  function unlockComponent(componentId, componentName) {
    const componentStateId = getComponentStateIdForPanel(componentId);

    if (componentStateId && state.components[componentStateId]) {
      state.components[componentStateId].installed = true;
    }

    showComponent(componentId);
    state.ledger.recordEvent(
      "component.shown",
      {
        componentId,
        componentName,
      },
      { visible: false },
    );
  }

  function showOnlyInitialComponents() {
    STARTUP_HIDDEN_PANEL_IDS.forEach((componentId) => {
      showComponent(componentId, false);
    });
  }

  function say(speaker, text, acknowledgement = null, options = {}) {
    const messageId = journey.nextMessageId;
    const durationMs = options.durationMs ?? null;

    journey.messages.push({
      id: messageId,
      speaker,
      text,
      time: Date.now(),
      expiresAt: durationMs ? Date.now() + durationMs : null,
    });
    journey.nextMessageId += 1;
    journey.messages = journey.messages.slice(-1);
    journey.pendingAcknowledgement = acknowledgement;

    if (durationMs && !acknowledgement && typeof globalThis.setTimeout === "function") {
      globalThis.setTimeout(() => {
        const currentMessage = journey.messages[journey.messages.length - 1];

        if (currentMessage?.id !== messageId || journey.pendingAcknowledgement) {
          return;
        }

        journey.messages = [];
        onChange(journey);
      }, durationMs);
    }
  }

  function sayAsNpc(speaker, text, acknowledgement = null) {
    if (journey.pendingAcknowledgement) {
      return false;
    }

    say(speaker, text, acknowledgement, {
      durationMs: acknowledgement ? null : NPC_MESSAGE_DURATION_MS,
    });
    onChange(journey);
    return true;
  }

  function clearMessage() {
    journey.messages = [];
  }

  function clearPendingAcknowledgement(action = null) {
    if (!journey.pendingAcknowledgement) {
      return false;
    }

    if (action && journey.pendingAcknowledgement.action !== action) {
      return false;
    }

    journey.pendingAcknowledgement = null;
    clearMessage();
    onChange(journey);
    return true;
  }

  function createMission(missionDefinition) {
    return createMissionRunner({
      missionDefinition,
      state,
      actions: {
        clearMessage,
        completeMission,
        offerContract: (contractId) => {
          unlockComponent("contract", "Contract");
          offerContract(contractId);
        },
        hideComponent: (componentId) => showComponent(componentId, false),
        recordEvent: (...args) => state.ledger.recordEvent(...args),
        runInspection,
        say,
        spawnPatrolIntercept,
        startMission,
        requestAttention,
        updatePaperworkControls: actions.updatePaperworkControls,
        setEnginePowerLock: (isLocked) => {
          state.components.engine.powerLocked = isLocked;

          if (isLocked) {
            game?.setShipPowered(false);
          }
        },
        showComponent: unlockComponent,
        spawnHunterNearShip: (reason) => game?.spawnHunterNearShip(reason),
        unlockHubService,
      },
    });
  }

  return {
    start,
    startFreeMode,
    startMission,
    sayAsNpc,
    update,
    acceptMission,
    acknowledge,
    pressJourneyButton,
    clearPendingAcknowledgement,
  };
}

function getCompletionGrade(completion, { hull, elapsedSeconds }) {
  return completion?.grades?.find((grade) => {
    if (Number.isFinite(grade.minHull) && hull < grade.minHull) {
      return false;
    }

    if (Number.isFinite(grade.maxHull) && hull > grade.maxHull) {
      return false;
    }

    if (Number.isFinite(grade.maxElapsedSeconds) && elapsedSeconds > grade.maxElapsedSeconds) {
      return false;
    }

    if (Number.isFinite(grade.minElapsedSeconds) && elapsedSeconds < grade.minElapsedSeconds) {
      return false;
    }

    return true;
  }) ?? null;
}
