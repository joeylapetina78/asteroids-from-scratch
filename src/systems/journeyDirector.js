import { chapterOneInterviewMission } from "../content/missions/chapterOneInterview.js?v=contract-v1";
import { createMissionRunner } from "./missionRunner.js?v=contract-v1";

export function createJourneyDirector({ state, onChange = () => {}, offerContract = () => {}, showComponent = () => {} }) {
  const journey = state.journey;
  let lastEventId = 0;
  const activeMission = createMissionRunner({
    missionDefinition: chapterOneInterviewMission,
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
    if (!activeMission.acknowledge()) {
      return;
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

    journey.mission = {
      ...journey.mission,
      status: "completed",
      objective: "Assessment complete.",
      helpText: "Mission complete. You made it to Yard Exchange.",
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
      },
      { visible: true },
    );
    say("Rook", grade.line);
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
    ["viewport", "engine", "scanner", "miner", "collector", "hull", "docking", "hub", "world", "processor", "cargo", "contract"].forEach((componentId) => {
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
      line:
        "Okay, we did it. I can see you have what it takes. Here's a little investment from me for a job well done. Don't need to pay this back, you earned it.",
    };
  }

  if (hull > 50 && elapsedSeconds <= 300) {
    return {
      id: "okay",
      line:
        "We got here, but we're pretty banged up. This is gonna cost me money. But you did the job, so here's a little bit to get you started.",
    };
  }

  return {
    id: "bad",
    line:
      "I don't think I'm gonna make any money on this job. I shouldn't hire you, but I need work done and you're what I got.",
  };
}
