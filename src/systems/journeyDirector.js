const CHAPTER_ONE_MISSION_ID = "chapter-1-yard-exchange";

export function createJourneyDirector({ state, game, onChange = () => {}, showComponent = () => {} }) {
  const journey = state.journey;
  let lastEventId = 0;

  function start() {
    showOnlyInitialComponents();

    if (journey.messages.length === 0) {
      say(
        "The Galaxy",
        "Welcome to Asteroids RPG. The adventure is waiting. Let's go?",
      );
    }

    setMission({
      id: CHAPTER_ONE_MISSION_ID,
      title: "Do you want to play?",
      status: "offered",
      objective: "Yes you do.",
      actionLabel: "Play Asteroids RPG",
      successCriteria: "Dock at Yard Exchange.",
    });
    onChange(journey);
  }

  function acceptMission() {
    if (journey.mission?.status !== "offered") {
      return;
    }

    journey.chapterId = "chapter-1";
    journey.chapterName = "Chapter 1";
    journey.episodeName = "Starting Out";
    setMission({
      ...journey.mission,
      title: "The Interview",
      status: "active",
      objective: "Get your bearings.",
      actionLabel: null,
      acceptedAt: Date.now(),
    });
    state.ledger.recordEvent(
      "mission.accepted",
      {
        missionId: CHAPTER_ONE_MISSION_ID,
        missionName: journey.mission.title,
      },
      { visible: false },
    );
      say(
        "Rook",
        "All right, rookie. First I'll bring up your viewport. It is your local space view, not just a window. Try to keep the expensive parts of the ship inside it.",
        { action: "show-viewport", label: "Okay" },
      );
    onChange(journey);
  }

  function acknowledge() {
    const acknowledgement = journey.pendingAcknowledgement;

    if (!acknowledgement) {
      return;
    }

    journey.pendingAcknowledgement = null;

    if (acknowledgement.action === "show-viewport") {
      showComponent("viewport");
      state.ledger.recordEvent(
        "component.shown",
        {
          componentId: "viewport",
          componentName: "Viewport",
        },
        { visible: false },
      );
      say(
        "Rook",
        "Okay, consider this your assessment test, training, and interview all in one. Get this hunk of junk to the Yard Exchange in one piece and that'll be good enough. You can move panels by dragging their titles. Now I'll activate your engine component.",
        { action: "show-engine", label: "Okay" },
      );
    } else if (acknowledgement.action === "show-engine") {
      clearMessage();
      unlockComponent("engine", "Engine");
      setMission({
        ...journey.mission,
        objective: "Power the ship and reach Yard Exchange.",
      });
    } else if (acknowledgement.action === "show-scanner") {
      clearMessage();
      state.components.scanner.maxScanergy = 400;
      state.components.scanner.scanergy = Math.max(state.components.scanner.scanergy, 400);
      unlockComponent("scanner", "Scanner");
    } else if (acknowledgement.action === "show-docking") {
      clearMessage();
      unlockComponent("docking", "Docking");
      setMission({
        ...journey.mission,
        objective: "Dock at Yard Exchange.",
      });
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
    if (journey.pendingAcknowledgement) {
      return;
    }

    const events = state.ledger.getEventsAfterId(lastEventId, { includeHidden: true });

    events.forEach((event) => {
      lastEventId = Math.max(lastEventId, event.id);
      handleEvent(event);
    });
  }

  function handleEvent(event) {
    if (journey.mission?.id !== CHAPTER_ONE_MISSION_ID || journey.mission.status !== "active") {
      return;
    }

    if (event.type === "ship.thrusted" && !journey.flags.firstThrust) {
      journey.flags.firstThrust = true;
      journey.flags.firstMovement = true;
      say(
        "Rook",
        "Great, and we're off. Fantastic. Now I'll turn on the scanner. We only have enough for a few scans, so make them count. Look for hub circles and follow the haulers if you get turned around.",
        { action: "show-scanner", label: "Okay" },
      );
      onChange(journey);
      return;
    }

    if (event.type === "npc.enteredViewport" && journey.flags.firstThrust && !journey.flags.firstHaulerSeen) {
      journey.flags.firstHaulerSeen = true;
      say("Rook", "Look, these haulers are working our route. They can get you where we're going if you get lost.");
      onChange(journey);
      return;
    }

    if (event.type === "zone.entered" && event.payload.zoneId !== "starter-drift" && !journey.flags.leftStarterDrift) {
      journey.flags.leftStarterDrift = true;
      say("Rook", "Nope, this is not the way. Turn us around and head back to the Drift. Yard Exchange is back that way.");
      onChange(journey);
      return;
    }

    if (
      (event.type === "site.enteredViewport" || event.type === "site.nearby") &&
      event.payload.siteId === "yard-exchange" &&
      !journey.flags.yardExchangeSeen
    ) {
      journey.flags.yardExchangeSeen = true;
      say("Rook", "There it is. When we're close enough, I'll bring your docking lock online.", {
        action: "show-docking",
        label: "Okay",
      });
      onChange(journey);
      return;
    }

    if (event.type === "site.docked" && event.payload.siteId === "yard-exchange") {
      completeMission();
    }
  }

  function completeMission() {
    if (journey.mission?.status === "completed") {
      return;
    }

    const elapsedSeconds = Math.round((Date.now() - journey.mission.acceptedAt) / 1000);
    const hull = Math.round(state.components.hull.integrity);
    const grade = getMissionGrade(hull, elapsedSeconds);

    setMission({
      ...journey.mission,
      status: "completed",
      objective: "Assessment complete.",
      completedAt: Date.now(),
      elapsedSeconds,
      grade: grade.id,
    });
    state.ledger.recordEvent(
      "mission.completed",
      {
        missionId: CHAPTER_ONE_MISSION_ID,
        missionName: journey.mission.title,
        grade: grade.id,
        hull,
        elapsedSeconds,
      },
      { visible: true },
    );
    say("Rook", grade.line);
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
    ["viewport", "engine", "scanner", "miner", "collector", "hull", "docking", "hub", "world", "processor", "cargo"].forEach((componentId) => {
      showComponent(componentId, false);
    });
  }

  function setMission(mission) {
    journey.mission = mission;
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
