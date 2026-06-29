import { chapterOneInterviewMission } from "../content/missions/chapterOneInterview.js?v=contract-v1";
import { chapterOneNewShipMission } from "../content/missions/chapterOneNewShip.js?v=ship-market-v1";
import { createMissionRunner } from "./missionRunner.js?v=contract-v1";

const MISSION_DEFINITIONS = new Map(
  [chapterOneInterviewMission, chapterOneNewShipMission].map((missionDefinition) => [missionDefinition.id, missionDefinition]),
);

export function createJourneyDirector({ state, onChange = () => {}, offerContract = () => {}, showComponent = () => {} }) {
  const journey = state.journey;
  let lastEventId = 0;
  let activeMission = createMission(chapterOneInterviewMission);

  function start() {
    showOnlyInitialComponents();
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
    const bonusCredits = grade.bonusCredits ?? 0;
    const completion = missionDefinition.completion;

    if (!completion && bonusCredits > 0) {
      state.components.account.credits += bonusCredits;
      state.ledger.recordEvent("rook.bonusAwarded", {
        missionId: missionDefinition.id,
        missionName: missionDefinition.title,
        creditsPaid: bonusCredits,
        reason: grade.id,
        accountCredits: state.components.account.credits,
      });
    }

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
        bonusCredits,
      },
      { visible: true },
    );
    if (completion) {
      say(completion.speaker ?? "Journey", completion.line);
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

  function say(speaker, text, acknowledgement = null) {
    journey.messages.push({
      id: journey.nextMessageId,
      speaker,
      text,
      time: Date.now(),
    });
    journey.nextMessageId += 1;
    journey.messages = journey.messages.slice(-1);
    journey.pendingAcknowledgement = acknowledgement;
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
        recordEvent: (...args) => state.ledger.recordEvent(...args),
        say,
        showComponent: unlockComponent,
      },
    });
  }

  return {
    start,
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
      bonusCredits: 750,
      line:
        "Okay, we did it. Clean hull, good time, and the contract paid out. I can see you have what it takes.",
      followup:
        "I have a good feeling about you, so I'm throwing in a 750 credit surprise bonus. Anyway, get yourself your own ship, equipped with a miner, and I'll have work for you.",
    };
  }

  if (hull >= 90) {
    return {
      id: "careful",
      bonusCredits: 500,
      line:
        "Okay, we did it. Contract paid out, and the hull's still clean. Took us a minute, but careful beats expensive.",
      followup:
        "I'm throwing in a 500 credit surprise bonus for keeping the ship tidy. Anyway, get yourself your own ship, equipped with a miner, and I'll have work for you.",
    };
  }

  if (hull > 50) {
    return {
      id: "scuffed",
      bonusCredits: 250,
      line:
        "We got here and the contract paid out. We picked up some dents along the way, so next time let's keep the expensive parts farther from the rocks.",
      followup:
        "It's not worth much any more. You break it, you buy it. Right! I'm throwing in 250 credits against the price. Anyway, get yourself your own ship, equipped with a miner, and I'll have work for you.",
    };
  }

  return {
    id: "rough",
    bonusCredits: 0,
    line:
      "We made it, and the contract still paid out because those were the terms. But this hull had a rough ride, rookie. Let's not make that a habit.",
    followup:
      "It's not worth much any more. You break it, you buy it. Right! Anyway, get yourself your own ship, equipped with a miner, and I'll have work for you.",
  };
}
