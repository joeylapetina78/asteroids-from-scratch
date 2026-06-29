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
  nextMissionId: "chapter-1-new-ship",
  nextMissionLabel: "Meet Barvis",
  startStepId: "show-hull",
  steps: [
    {
      id: "show-hull",
      objective: "Get your bearings.",
      helpText:
        "This is the Journey panel. The other panel is the Hull panel. Hull integrity is ship health. If it reaches 0%, the ship is wrecked.",
      onEnter: [
        { type: "showComponent", componentId: "hull", componentName: "Hull" },
        {
          type: "say",
          speaker: "Rook",
          text:
            "All right, rookie. Here are our ship controls and displays. You can see the hull of this ship's at 100%. You better keep it that way, ya hear? Consider this your assessment test, training, and interview all in one.",
          acknowledgement: { label: "Okay" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "drag-panels" },
      ],
    },
    {
      id: "drag-panels",
      objective: "Move the Journey and Hull panels.",
      helpText:
        "Drag panels by their titles. Move the Journey panel and the Hull panel anywhere comfortable in the display area.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "People have preferences, who am I to stand in the way of them. Go ahead and drag this panel and the Hull panel around the display area. Get a feel for how it works.",
        },
      ],
      transitions: [
        {
          eventType: "component.dragged",
          requiresFlags: ["journeyPanelMoved", "hullPanelMoved"],
          nextStepId: "show-viewport",
        },
      ],
      considerations: [
        {
          id: "journey-panel-moved",
          eventType: "component.dragged",
          payloadEquals: { componentId: "journey" },
          setFlag: "journeyPanelMoved",
          once: true,
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text: "There you go. Even my voice box moves. Now give the Hull panel a try too.",
            },
          ],
        },
        {
          id: "hull-panel-moved",
          eventType: "component.dragged",
          payloadEquals: { componentId: "hull" },
          setFlag: "hullPanelMoved",
          once: true,
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text: "Good, that's the Hull panel. Move the Journey panel too, then we'll get to the flying part.",
            },
          ],
        },
      ],
    },
    {
      id: "show-viewport",
      objective: "Get your bearings.",
      helpText: "Press Add Viewport to bring up the big space view where the ship, rocks, and hubs appear.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good good. Now let's bring in your viewport so you can get a feel for things. Ready?",
          acknowledgement: { label: "Add Viewport" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "showComponent", componentId: "viewport", componentName: "Viewport" },
        { type: "goToStep", stepId: "offer-contract" },
      ],
    },
    {
      id: "offer-contract",
      objective: "Review Rook's delivery contract.",
      helpText:
        "Use the Contract panel to accept the delivery terms. The job pays when this VIN docks at Yard Exchange.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Before we fly, agree to the contract for this job. It just says when you deliver this ship to Yard Exchange, I'll pay you 500 credits. Simple terms, clean paper, real promise.",
          acknowledgement: { label: "Read Contract" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "offerContract", contractId: "rook-yard-exchange-delivery" },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "rook-yard-exchange-delivery" },
          nextStepId: "show-scanner",
        },
      ],
    },
    {
      id: "show-scanner",
      objective: "Get your bearings.",
      helpText:
        "Press Add Scanner to install the starter scanner. This scanner only points toward the mission hub.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "We're that unpowered ship in the center of the viewport. There's the hub we came from, Scrap Porch, in the lower left corner. Your Job is to deliver this ship to the other hub in this zone, the Yard Exchange. Let me add the scanner so you know which way to go.",
          acknowledgement: { label: "Add Scanner" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "setComponentValue", componentId: "scanner", key: "maxScanergy", value: 400 },
        { type: "setComponentValue", componentId: "scanner", key: "targets", value: ["sites"] },
        { type: "raiseComponentValue", componentId: "scanner", key: "scanergy", value: 400 },
        { type: "showComponent", componentId: "scanner", componentName: "Scanner" },
        { type: "goToStep", stepId: "try-scanner" },
      ],
    },
    {
      id: "try-scanner",
      objective: "Use the scanner once.",
      helpText:
        "Press Scan once. The pale marker points toward Yard Exchange. The scanner has limited scanergy, so do not burn it all at once.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Go ahead and hit it once to see which way we're headed. You can see it only has so much power. If you run out and still haven't made it to the hub, follow some space truckers.",
        },
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
        {
          eventType: "scanner.used",
          nextStepId: "show-engine",
        },
      ],
    },
    {
      id: "show-engine",
      objective: "Get the engine online.",
      helpText:
        "Press Add Engine to bring up the Engine panel. Power Ship turns the ship on. W thrusts, A/D rotate, and S brakes.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Good. Let me get you the Engine panel so you can get going.",
          acknowledgement: { label: "Add Engine" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "showComponent", componentId: "engine", componentName: "Engine" },
        { type: "goToStep", stepId: "power-on" },
      ],
    },
    {
      id: "power-on",
      objective: "Power the ship.",
      helpText:
        "Use the Engine panel and click Power Ship. The controls are shown on that same panel.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "All right, power this baby on and let's get going. Time is money. Controls are on the engine panel.",
        },
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
        {
          eventType: "engine.powered",
          nextStepId: "first-thrust",
        },
      ],
    },
    {
      id: "first-thrust",
      objective: "Head for Yard Exchange.",
      helpText:
        "Press W to thrust, A/D to rotate, and S to brake. Yard Exchange is the hub your scanner pointed toward.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Good, good. Head out when you're ready.",
        },
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
        {
          eventType: "ship.thrusted",
          setFlag: "firstThrust",
          nextStepId: "find-yard-exchange",
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
      id: "find-yard-exchange",
      objective: "Find Yard Exchange.",
      helpText:
        "Fly toward Yard Exchange. Scan if you need help. The scanner marker points to the hub, which looks like a large circle or ring.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Great, and we're off. Fantastic. Yard Exchange, here we come.",
        },
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
          acknowledgement: { label: "Add Docking Panel" },
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
          eventType: "contract.paid",
          payloadEquals: { contractId: "rook-yard-exchange-delivery" },
          actions: [{ type: "completeMission" }],
        },
      ],
    },
  ],
};
