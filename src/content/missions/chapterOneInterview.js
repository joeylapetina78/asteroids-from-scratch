export const chapterOneInterviewMission = {
  id: "chapter-1-yard-exchange",
  targetSiteId: "yard-exchange",
  prologue: {
    chapterId: "prologue",
    chapterName: "Prologue",
    episodeName: "Do you want to play?",
    speaker: "The Galaxy",
    text: "Welcome to Asteroids RPG. The adventure is waiting. Let's go?",
    title: "Do you want to play?",
    objective: "Yes you do.",
    actionLabel: "Play Asteroids RPG",
  },
  activeChapter: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
  },
  title: "The Interview",
  successCriteria: "Dock at Yard Exchange.",
  startStepId: "show-viewport",
  steps: [
    {
      id: "show-viewport",
      objective: "Get your bearings.",
      helpText: "Press Okay to bring up the viewport. The viewport is the big space view where the ship, rocks, and hubs appear.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "All right, rookie. First I'll bring up your viewport. It is your local space view, not just a window. Try to keep the expensive parts of the ship inside it.",
          acknowledgement: { label: "Okay" },
        },
      ],
      onAcknowledge: [{ type: "showComponent", componentId: "viewport", componentName: "Viewport" }, { type: "goToStep", stepId: "show-engine" }],
    },
    {
      id: "show-engine",
      objective: "Get your bearings.",
      helpText:
        "Press Okay to activate the engine panel. Power the ship means click Power Ship on that panel. You can drag panels by their titles.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Okay, consider this your assessment test, training, and interview all in one. Get this hunk of junk to the Yard Exchange in one piece and that'll be good enough. You can move panels by dragging their titles. Now I'll activate your engine component.",
          acknowledgement: { label: "Okay" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "showComponent", componentId: "engine", componentName: "Engine" },
        { type: "goToStep", stepId: "first-thrust" },
      ],
    },
    {
      id: "first-thrust",
      objective: "Power the ship and reach Yard Exchange.",
      helpText:
        "Find the Engine panel and click Power Ship. Then press W to thrust, A/D to rotate, and S to brake. Yard Exchange is a hub: a large circle in the space view.",
      transitions: [
        {
          eventType: "site.enteredViewport",
          payloadEquals: { siteId: "yard-exchange" },
          nextStepId: "show-docking",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: "yard-exchange" },
          nextStepId: "show-docking",
        },
        {
          eventType: "ship.thrusted",
          setFlag: "firstThrust",
          nextStepId: "show-scanner",
        },
      ],
      considerations: [
        {
          id: "first-hauler-seen",
          eventType: "npc.enteredViewport",
          requiresFlag: "firstThrust",
          setFlag: "firstHaulerSeen",
          once: true,
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text: "Look, these haulers are working our route. They can get you where we're going if you get lost.",
            },
          ],
        },
        {
          id: "left-starter-drift",
          eventType: "zone.entered",
          payloadEquals: { zoneId: "not:starter-drift" },
          setFlag: "leftStarterDrift",
          once: true,
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text: "Nope, this is not the way. Turn us around and head back to the Drift. Yard Exchange is back that way.",
            },
          ],
        },
      ],
    },
    {
      id: "show-scanner",
      objective: "Power the ship and reach Yard Exchange.",
      helpText:
        "Press Okay to activate the scanner. For this job it only looks for Yard Exchange. Press Scan and follow the pale hub marker.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Great, and we're off. Fantastic. Now I'll turn on the scanner. This loaner only looks for our destination, Yard Exchange. Press Scan and follow the pale hub marker if you get turned around.",
          acknowledgement: { label: "Okay" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "setComponentValue", componentId: "scanner", key: "maxScanergy", value: 400 },
        { type: "setComponentValue", componentId: "scanner", key: "targets", value: ["sites"] },
        { type: "raiseComponentValue", componentId: "scanner", key: "scanergy", value: 400 },
        { type: "showComponent", componentId: "scanner", componentName: "Scanner" },
        { type: "goToStep", stepId: "find-yard-exchange" },
      ],
      transitions: [
        {
          eventType: "site.enteredViewport",
          payloadEquals: { siteId: "yard-exchange" },
          nextStepId: "show-docking",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: "yard-exchange" },
          nextStepId: "show-docking",
        },
      ],
    },
    {
      id: "find-yard-exchange",
      objective: "Find Yard Exchange.",
      helpText:
        "Fly toward Yard Exchange. Scan if you need help. The scanner marker points to the hub, which looks like a large circle or ring.",
      transitions: [
        {
          eventType: "site.enteredViewport",
          payloadEquals: { siteId: "yard-exchange" },
          nextStepId: "show-docking",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: "yard-exchange" },
          nextStepId: "show-docking",
        },
      ],
      considerations: [
        {
          id: "first-hauler-seen",
          eventType: "npc.enteredViewport",
          requiresFlag: "firstThrust",
          setFlag: "firstHaulerSeen",
          once: true,
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text: "Look, these haulers are working our route. They can get you where we're going if you get lost.",
            },
          ],
        },
        {
          id: "left-starter-drift",
          eventType: "zone.entered",
          payloadEquals: { zoneId: "not:starter-drift" },
          setFlag: "leftStarterDrift",
          once: true,
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text: "Nope, this is not the way. Turn us around and head back to the Drift. Yard Exchange is back that way.",
            },
          ],
        },
      ],
    },
    {
      id: "show-docking",
      objective: "Find Yard Exchange.",
      helpText: "Press Okay to bring the docking panel online. If Dock is disabled, fly closer to the Yard Exchange hub circle.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "There it is. When we're close enough, I'll bring your docking lock online.",
          acknowledgement: { label: "Okay" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "showComponent", componentId: "docking", componentName: "Docking" },
        { type: "goToStep", stepId: "dock-yard-exchange" },
      ],
    },
    {
      id: "dock-yard-exchange",
      objective: "Dock at Yard Exchange.",
      helpText: "Move close to Yard Exchange, then use the Docking panel or press E to dock.",
      transitions: [
        {
          eventType: "site.docked",
          payloadEquals: { siteId: "yard-exchange" },
          actions: [{ type: "completeMission" }],
        },
      ],
    },
  ],
};
