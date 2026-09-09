import { chapterOneInterviewMission } from "../content/missions/chapterOneInterview.js?v=fresh-20260909-1841-3b03c045";
import { chapterOneNewShipMission } from "../content/missions/chapterOneNewShip.js?v=fresh-20260909-1841-3b03c045";
import { chapterOneRedWorkMission } from "../content/missions/chapterOneRedWork.js?v=fresh-20260909-1841-3b03c045";
import { getComponentStateIdForPanel, STARTUP_HIDDEN_PANEL_IDS } from "./componentRegistry.js?v=fresh-20260909-1841-3b03c045";
import { createMissionRunner } from "./missionRunner.js?v=fresh-20260909-1841-3b03c045";

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
  dockComponent = () => {},
  unlockHubService = () => {},
  requestAttention = () => {},
  runInspection = () => {},
  spawnPatrolIntercept = () => {},
  emergencyTow = () => {},
  payLoan = () => {},
  updatePaperworkControls = () => {},
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

  // Start with no authored mission chain running.
  //
  // Explorer and campaign both enter this way, but they are not the same
  // chapter and they are emphatically not the same ship: explorer is open play
  // with every instrument fitted, campaign is a hand in a company skiff with
  // four things bolted to it. So the panel list is the caller's too — showing
  // explorer's set in campaign would hand the player a scanner, a collector and
  // a processor that its hull does not have.
  //
  // Every default here is explorer's, so that start is unchanged.
  const FREE_MODE_PANELS = ["viewport", "hull", "docking", "engine", "beacon-locator", "scanner", "miner", "collector", "processor", "cargo"];

  function startFreeMode({
    chapterId = "free", chapterName = "Free Play", episodeName = "Explorer Mode",
    panels = FREE_MODE_PANELS,
  } = {}) {
    showOnlyInitialComponents();
    // Neither start walks the mission unlock sequence that reveals panels one at
    // a time, so whatever the ship actually carries is shown at once.
    panels.forEach((id) => {
      showComponent(id);
    });
    game?.enableHubPatrol();
    journey.chapterId = chapterId;
    journey.chapterName = chapterName;
    journey.episodeName = episodeName;
    journey.mission = null;
    onChange(journey);
  }

  // Does the current mission hold the comms floor?
  //
  // Rook is conducting an interview. Sal offering a repair quote or a hub
  // hailing about paperwork on top of him does not read as a living world during
  // an induction — it reads as the game talking over itself while a new player
  // is being told which button to press. A mission can therefore declare a step
  // up to which it speaks alone; anything else is QUEUED, not dropped, so the
  // world still gets its say once the player is flying.
  function isCommsFloorHeld() {
    const missionId = journey.mission?.id;
    const definition = missionId ? MISSION_DEFINITIONS.get(missionId) : null;
    const untilStepId = definition?.exclusiveCommsUntilStepId;

    if (!untilStepId || journey.mission?.status === "completed") return false;

    return !(journey.completedStepIds ?? []).includes(untilStepId);
  }

  function acceptMission() {
    if (journey.mission?.status !== "offered") {
      return;
    }

    activeMission.accept();
    onChange(journey);
  }

  function acknowledge(role = "confirm") {
    const acknowledgement = journey.pendingAcknowledgement;
    const chosen = role === "decline" ? (acknowledgement?.decline ?? { action: "dismiss" }) : acknowledgement;

    if (!activeMission.acknowledge()) {
      return;
    }

    runAcknowledgementAction(chosen);

    if (role === "decline") {
      clearMessage();
    }

    onChange(journey);
  }

  function runAcknowledgementAction(chosen) {
    if (!chosen?.action || chosen.action === "dismiss") {
      return;
    }

    if (chosen.action === "startMission") {
      startMission(chosen.missionId);
    } else if (chosen.action === "emergencyTow") {
      emergencyTow();
      clearMessage();
    } else if (chosen.action === "payLoan") {
      payLoan(chosen.contractId, chosen.amount);
      clearMessage();
    }
  }

  function askConfirmation(speaker, text, acknowledgement) {
    say(speaker, text, acknowledgement);
    onChange(journey);
  }

  function pressJourneyButton(role = "confirm") {
    if (journey.pendingAcknowledgement) {
      acknowledge(role);
      return;
    }

    if (role === "confirm" && journey.mission?.status === "offered") {
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
      const line = grade?.line ?? completion.line ?? null;

      if (line) {
        say(completion.speaker ?? "Journey", line, completion.acknowledgement);
      }

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

    journey.pendingAcknowledgement = null;
    journey.messages = [];
    activeMission.destroy?.();
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
    const priority = options.priority ?? 0;

    journey.messages.push({
      id: messageId,
      speaker,
      text,
      priority,
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

    if (acknowledgement?.action === "startMission" && typeof globalThis.setTimeout === "function") {
      const pendingRef = acknowledgement;

      globalThis.setTimeout(() => {
        if (journey.pendingAcknowledgement === pendingRef) {
          acknowledge();
        }
      }, 45000);
    }
  }

  function sayAsNpc(speaker, text, acknowledgement = null, { priority = 0 } = {}) {
    if (journey.pendingAcknowledgement) {
      return false;
    }

    // Don't overwrite a strictly higher-priority active message with a lower-priority one.
    // Same-priority messages (e.g. mission beat advancing its own dialogue) always replace each other.
    const currentPriority = journey.messages[0]?.priority ?? -1;
    if (journey.messages.length > 0 && priority < currentPriority) {
      return false;
    }

    say(speaker, text, acknowledgement, {
      durationMs: acknowledgement ? null : NPC_MESSAGE_DURATION_MS,
      priority,
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
        dockComponent: (componentId) => dockComponent(componentId),
        recordEvent: (...args) => state.ledger.recordEvent(...args),
        runInspection,
        say: (speaker, text, acknowledgement) => sayAsNpc(speaker, text, acknowledgement, { priority: 0 }),
        spawnPatrolIntercept,
        enableHubPatrol: () => game?.enableHubPatrol(),
        startMission,
        requestAttention,
        updatePaperworkControls,
        setEnginePowerLock: (isLocked) => {
          state.components.engine.powerLocked = isLocked;

          if (isLocked) {
            game?.setShipPowered(false);
          }
        },
        showComponent: unlockComponent,
        spawnHunterNearShip: (reason) => game?.spawnHunterNearShip(reason),
        spawnPirateNearShip: (reason) => game?.spawnPirateNearShip(reason),
        unlockHubService,
        onChange: () => onChange(journey),
      },
    });
  }

  return {
    start,
    startFreeMode,
    isCommsFloorHeld,
    startMission,
    sayAsNpc,
    askConfirmation,
    update,
    acceptMission,
    acknowledge,
    pressJourneyButton,
    clearMessage,
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
