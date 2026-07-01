import { chapterOneInterviewMission } from "../content/missions/chapterOneInterview.js?v=consideration-cycles-v1";
import { chapterOneNewShipMission } from "../content/missions/chapterOneNewShip.js?v=consideration-cycles-v1";
import { chapterOneRedWorkMission } from "../content/missions/chapterOneRedWork.js?v=tow-stable-v1";
import { createMissionRunner } from "./missionRunner.js?v=tow-stable-v1";

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
    const grade = getMissionGrade(hull, elapsedSeconds);
    const completion = missionDefinition.completion;

    journey.mission = {
      ...journey.mission,
      status: "completed",
      objective: completion?.objective ?? "Assessment complete.",
      helpText: completion?.helpText ?? "Mission complete. You made it to Yard Exchange.",
      completedAt: Date.now(),
      elapsedSeconds,
      grade: grade.id,
    };
    state.ledger.recordEvent(
      "mission.completed",
      {
        missionId: missionDefinition.id,
        missionName: missionDefinition.title,
        grade: grade.id,
        hull,
        elapsedSeconds,
        bonusCredits: 0,
      },
      { visible: true },
    );
    if (completion) {
      say(completion.speaker ?? "Journey", completion.line, completion.acknowledgement);
      return;
    }

    if (missionDefinition.nextMissionId) {
      say("Rook", `${grade.line} ${grade.followup}`, {
        label: missionDefinition.nextMissionLabel ?? "Continue",
        action: "startMission",
        missionId: missionDefinition.nextMissionId,
      });
      return;
    }

    say("Rook", grade.line);
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
    if (state.components[componentId]) {
      state.components[componentId].installed = true;
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
    ["viewport", "engine", "scanner", "miner", "collector", "hull", "docking", "hub", "world", "processor", "cargo", "contract", "merchant"].forEach((componentId) => {
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
        say,
        startMission,
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
    startMission,
    sayAsNpc,
    update,
    acceptMission,
    acknowledge,
    pressJourneyButton,
  };
}

function getMissionGrade(hull, elapsedSeconds) {
  if (hull >= 90 && elapsedSeconds <= 120) {
    return {
      id: "good",
      bonusCredits: 0,
      line:
        "Okay, we did it. Clean hull, good time, and the contract paid out.",
      followup:
        "I have a good feeling about you. I set up a relationship for you with Barvis at Yard Exchange Shipyard. Go see him about getting yourself a ship with a miner, and I'll have work for you.",
    };
  }

  if (hull >= 90) {
    return {
      id: "careful",
      bonusCredits: 0,
      line:
        "Okay, we did it. Contract paid out, and the hull's still clean. Took us a minute, but careful beats expensive.",
      followup:
        "You kept the ship tidy. I like that. I set up a relationship for you with Barvis at Yard Exchange Shipyard. Go see him about getting yourself a ship with a miner, and I'll have work for you.",
    };
  }

  if (hull > 50) {
    return {
      id: "scuffed",
      bonusCredits: 0,
      line:
        "We got here and the contract paid out. We picked up some dents along the way, so next time let's keep the expensive parts farther from the rocks.",
      followup:
        "It's not worth much any more. You break it, you buy it. Right! I set up a relationship for you with Barvis at Yard Exchange Shipyard. Go see him about getting yourself a ship with a miner, and I'll have work for you.",
    };
  }

  return {
    id: "rough",
    bonusCredits: 0,
    line:
      "We made it, and the contract still paid out because those were the terms. But this hull had a rough ride, rookie. Let's not make that a habit.",
    followup:
      "It's not worth much any more. You break it, you buy it. Right! I set up a relationship for you with Barvis at Yard Exchange Shipyard. Go see him about getting yourself a ship with a miner, and I'll have work for you.",
  };
}
