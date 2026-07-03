import { chapterOneRoute, storyRegions, storySites, storyZones } from "../storyWorld.js?v=world-refs-v1";

const ASSESSMENT_FLIGHT_CONSIDERATIONS = [
  {
    id: "docked-scrap-porch",
    fromBeat: "show-scanner",
    eventType: "site.docked",
    payloadEquals: { siteId: storySites.originHub.id },
    setFlag: "dockedWrongHub",
    once: true,
    actions: [
      {
        type: "say",
        speaker: "Rook",
        text: "That is Scrap Porch, rookie. I appreciate the enthusiasm, but this job pays at Yard Exchange. Undock and follow the route.",
      },
    ],
  },
  {
    id: "first-hauler-seen",
    fromBeat: "show-scanner",
    eventType: "npc.enteredViewport",
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
    id: "near-hauler",
    fromBeat: "show-scanner",
    eventType: "ship.nearObject",
    payloadEquals: { targetType: "npc" },
    setFlag: "nearHauler",
    once: true,
    actions: [
      {
        type: "say",
        speaker: "Rook",
        text: "Give the haulers room. They're useful if you lose the route, but they are not road cones.",
      },
    ],
  },
  {
    id: "near-rock",
    fromBeat: "show-scanner",
    eventType: "ship.nearObject",
    payloadEquals: { targetType: "asteroid" },
    repeatable: true,
    cooldownMs: 12000,
    responses: [
      {
        speaker: "Rook",
        text: "Careful. Close to rocks is where interviews turn into invoices.",
      },
      {
        speaker: "Rook",
        text: "Rookie, rocks are cheaper when we do not personally inspect them with the hull.",
      },
      {
        speaker: "Rook",
        text: "Again with the rocks. Keep some daylight between us and the expensive crunching sounds.",
      },
      {
        speaker: "Rook",
        text: "I am begging you, with professional restraint, to stop flirting with the rocks.",
      },
    ],
  },
  {
    id: "hit-rock",
    fromBeat: "show-scanner",
    eventType: "ship.collision",
    payloadEquals: { targetType: "asteroid" },
    repeatable: true,
    cooldownMs: 8000,
    responses: [
      {
        speaker: "Rook",
        text: "Hey! This ship is still worth something. Try steering around the rocks, not through them.",
      },
      {
        speaker: "Rook",
        text: "That was a collision. Hull goes down, repair bill goes up. Simple math, bad math.",
      },
      {
        speaker: "Rook",
        text: "Every time you hit a rock, Yard Exchange gets a little richer and I get a little older.",
      },
      {
        speaker: "Rook",
        text: "Careful, rookie. If you keep breaking it, somebody is going to make you buy it.",
      },
    ],
  },
  {
    id: "hit-hauler",
    fromBeat: "show-scanner",
    eventType: "ship.collision",
    payloadEquals: { targetType: "npc" },
    setFlag: "hitHauler",
    once: true,
    actions: [
      {
        type: "say",
        speaker: "Rook",
        text: "You hit a working hauler. Let's not make enemies before we even get hired.",
      },
    ],
  },
  {
    id: "left-starter-drift",
    fromBeat: "show-scanner",
    eventType: "zone.entered",
    payloadEquals: { zoneId: `not:${storyZones.starterRoute.id}` },
    repeatable: true,
    cooldownMs: 20000,
    responses: [
      {
        speaker: "Rook",
        text:
          "Nope, this is not the way. Your provisional license only covers this starter route through Starter Drift. Turn us back toward Yard Exchange.",
      },
      {
        speaker: "Rook",
        text:
          "Provisional means provisional, rookie. You leave the cleared part of First Reach and the fines start looking for us.",
      },
      {
        speaker: "Rook",
        text:
          "Do not make me explain to station control why a temporary license is wandering around where it does not belong.",
      },
    ],
  },
];

export const chapterOneInterviewMission = {
  id: "chapter-1-yard-exchange",
  targetSiteId: chapterOneRoute.destinationSite.id,
  prologue: {
    chapterId: "prologue",
    chapterName: "Prologue",
    episodeName: "Do you want to play?",
    speaker: "Murmur",
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
  successCriteria: `Dock at ${chapterOneRoute.destinationSite.name}.`,
  nextMissionId: "chapter-1-new-ship",
  nextMissionLabel: "Thanks, Will Do",
  completion: {
    speaker: "Rook",
    objective: "Assessment complete.",
    helpText: "Mission complete. You made it to Yard Exchange.",
    acknowledgement: {
      label: "Thanks, Will Do",
      action: "startMission",
      missionId: "chapter-1-new-ship",
    },
    grades: [
      {
        id: "good",
        minHull: 90,
        maxElapsedSeconds: 120,
        line:
          "Okay, we did it. Clean hull, good time, and the contract paid out. I have a good feeling about you. I set up a relationship for you with Barvis at Yard Exchange Shipyard. Go see him about getting yourself a ship with a miner, and I'll have work for you.",
      },
      {
        id: "careful",
        minHull: 90,
        line:
          "Okay, we did it. Contract paid out, and the hull's still clean. Took us a minute, but careful beats expensive. You kept the ship tidy. I like that. I set up a relationship for you with Barvis at Yard Exchange Shipyard. Go see him about getting yourself a ship with a miner, and I'll have work for you.",
      },
      {
        id: "scuffed",
        minHull: 51,
        line:
          "We got here and the contract paid out. We picked up some dents along the way, so next time let's keep the expensive parts farther from the rocks. It's not worth much any more. You break it, you buy it. Right! I set up a relationship for you with Barvis at Yard Exchange Shipyard. Go see him about getting yourself a ship with a miner, and I'll have work for you.",
      },
      {
        id: "rough",
        line:
          "We made it, and the contract still paid out because those were the terms. But this hull had a rough ride, rookie. Let's not make that a habit. It's not worth much any more. You break it, you buy it. Right! I set up a relationship for you with Barvis at Yard Exchange Shipyard. Go see him about getting yourself a ship with a miner, and I'll have work for you.",
      },
    ],
  },
  startBeatId: "drag-panels",
  considerations: [
    {
      id: "license-panel-moved",
      fromBeat: "drag-panels",
      throughBeat: "drag-panels",
      eventType: "component.dragged",
      payloadEquals: { componentId: "license" },
      setFlag: "licensePanelMoved",
      once: true,
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "There you go. That's your provisional license. It lets you make this run under my authority, in this zone only. Now move the Hull panel too.",
        },
      ],
    },
    {
      id: "hull-panel-moved",
      fromBeat: "drag-panels",
      throughBeat: "drag-panels",
      eventType: "component.dragged",
      payloadEquals: { componentId: "hull" },
      setFlag: "hullPanelMoved",
      once: true,
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "Good, that's the Hull panel. Move the License too, then we'll get to the flying part.",
        },
      ],
    },
    ...ASSESSMENT_FLIGHT_CONSIDERATIONS,
  ],
  beats: [
    {
      id: "show-hull",
      objective: "Get your bearings.",
      helpText:
        "This communicator rail shows mission dialogue, plain instructions, and your credits. The Hull panel shows ship health, VIN, and the Docking Lock. Your license is paperwork you can file in the drawer.",
      onEnter: [
        { type: "showComponent", componentId: "license", componentName: "License" },
        { type: "showComponent", componentId: "hull", componentName: "Hull" },
        { type: "showComponent", componentId: "docking", componentName: "Docking Lock" },
        {
          type: "say",
          speaker: "Rook",
          text:
            "All right, rookie. Here are our ship controls and displays. You can see the hull of this ship's at 100%. You better keep it that way, ya hear? You've got a provisional license for this starter route, so stay in bounds. Consider this your assessment test, training, and interview all in one.",
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
      objective: "Move the License and Hull panels.",
      helpText:
        "Drag panels by their title bars. Move the License panel and the Hull panel anywhere comfortable in the display area.",
      onEnter: [
        { type: "showComponent", componentId: "license", componentName: "License" },
        { type: "showComponent", componentId: "hull", componentName: "Hull" },
        { type: "showComponent", componentId: "docking", componentName: "Docking Lock" },
        {
          type: "say",
          speaker: "Rook",
          text:
            "All right, rookie. Here are our ship controls and displays. You can see the hull of this ship's at 100%. You better keep it that way, ya hear? You've got a provisional license for this starter route, so stay in bounds. People have preferences, who am I to stand in the way of them. Go ahead and drag the License and Hull panels around the display area. Get a feel for how it works.",
        },
      ],
      transitions: [
        {
          eventType: "component.dragged",
          requiresFlags: ["licensePanelMoved", "hullPanelMoved"],
          nextStepId: "file-license",
        },
      ],
    },
    {
      id: "file-license",
      objective: "File your provisional license.",
      helpText:
        "Click the FILE button on the License panel. It will move into the Paperwork drawer at the bottom, where you can retrieve paperwork anytime.",
      onEnter: [
        { type: "setPaperworkFiling", isEnabled: true },
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good. Now file that license away. Press FILE on the License panel and it will drop into the Paperwork drawer at the bottom. You will not need to wave it around, but it says you are provisionally authorized under my authority for this First Reach run only. No wandering into other zones.",
        },
      ],
      transitions: [
        {
          eventType: "component.filed",
          payloadEquals: { componentId: "license", destination: "drawer" },
          nextStepId: "offer-contract",
        },
      ],
    },
    {
      id: "offer-contract",
      objective: "Review Rook's delivery contract.",
      helpText:
        "Use the Contract panel to accept the delivery terms. The job pays when this VIN docks at Yard Exchange and the ship is powered down.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Before we fly, agree to the contract for this job. It just says when you deliver this ship to Yard Exchange, I'll pay you 500 credits. Simple terms, clean paper, real promise.",
        },
        { type: "offerContract", contractId: "rook-yard-exchange-delivery" },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "rook-yard-exchange-delivery" },
          nextStepId: "show-viewport",
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
            "Good. Paper's clean. Now let's bring in your viewport so you can see the ship, the hub, and all the ways this job can get expensive.",
          acknowledgement: { label: "Add Viewport" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "showComponent", componentId: "viewport", componentName: "Viewport" },
        { type: "goToStep", stepId: "show-scanner" },
      ],
    },
    {
      id: "show-scanner",
      objective: "Get your bearings.",
      helpText:
        "Press Add Beacon Locator. It does not need power. It points toward hub beacons remembered by the ship.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "We're that unpowered ship in the center of the viewport. There's the hub we came from, Scrap Porch, in the lower left corner. Your job is to deliver this ship to the other hub in this zone, the Yard Exchange. Let me add the Beacon Locator so you can follow hub signals.",
          acknowledgement: { label: "Add Beacon Locator" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "setComponentValue", componentId: "scanner", key: "beaconMemoryIds", value: ["scrap-porch", "yard-exchange"] },
        { type: "setComponentValue", componentId: "scanner", key: "activeBeaconId", value: "scrap-porch" },
        { type: "setComponentValue", componentId: "scanner", key: "beaconLocatorUsed", value: true },
        { type: "showComponent", componentId: "scanner", componentName: "Beacon Locator" },
        { type: "goToStep", stepId: "try-scanner" },
      ],
    },
    {
      id: "try-scanner",
      objective: "Check the beacon locator.",
      helpText:
        "The Beacon Locator starts on Scrap Porch, the hub you came from. Press Next Beacon until it tracks Yard Exchange, your destination.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "The locator knows the hub beacons in this zone. Right now it is tuned to Scrap Porch, where we came from. Press Next Beacon until it tracks Yard Exchange. Once it is pointing at Yard Exchange, I'll get you the Engine panel so you can get going.",
        },
      ],
      transitions: [
        {
          eventType: "site.enteredViewport",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "beaconLocator.used",
          payloadEquals: { siteId: "yard-exchange" },
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
        "Use the Engine panel and click Power Ship. W thrusts, A/D rotate, and S brakes after the ship is powered.",
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
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          nextStepId: "yard-traffic-check",
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
        "Press W to thrust, A/D to rotate, and S to brake. Keep the ship inside the cleared Starter Drift route and head for Yard Exchange.",
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
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "ship.thrusted",
          setFlag: "firstThrust",
          nextStepId: "find-yard-exchange",
        },
      ],
    },
    {
      id: "find-yard-exchange",
      objective: "Find Yard Exchange.",
      helpText:
        "Fly toward Yard Exchange. The Beacon Locator points to remembered hub beacons. Yard Exchange looks like a large circle or ring.",
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
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          nextStepId: "yard-traffic-check",
        },
      ],
    },
    {
      id: "yard-traffic-check",
      objective: "Present ship and pilot identification.",
      helpText:
        "Yard Exchange traffic control does not know this ship yet. Click the VIN on the Hull panel, then click the Ref number on your License paperwork to present both IDs.",
      onEnter: [
        {
          type: "spawnPatrolIntercept",
          siteId: chapterOneRoute.destinationSite.id,
          reason: "arrival-clearance",
        },
        {
          type: "say",
          speaker: "Yard Exchange Traffic",
          text:
            "Inbound skiff, hold your line. Present ship VIN and pilot authorization for first-time registry review before docking clearance.",
        },
      ],
      transitions: [
        {
          eventType: "authority.documentPresented",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, documentKind: "pilot-license" },
          requiresFlags: ["yardVinPresented"],
          actions: [
            { type: "runInspection", siteId: chapterOneRoute.destinationSite.id, inspectionType: "arrival-clearance" },
            { type: "goToStep", stepId: "yard-traffic-cleared" },
          ],
        },
        {
          eventType: "authority.documentPresented",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, documentKind: "ship-vin" },
          requiresFlags: ["yardLicensePresented"],
          actions: [
            { type: "runInspection", siteId: chapterOneRoute.destinationSite.id, inspectionType: "arrival-clearance" },
            { type: "goToStep", stepId: "yard-traffic-cleared" },
          ],
        },
        {
          eventType: "authority.documentPresented",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, documentKind: "ship-vin" },
          setFlag: "yardVinPresented",
        },
        {
          eventType: "authority.documentPresented",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, documentKind: "pilot-license" },
          setFlag: "yardLicensePresented",
        },
      ],
    },
    {
      id: "yard-traffic-cleared",
      objective: "Proceed to docking.",
      helpText:
        "Yard Exchange reviewed the VIN, your provisional license, and the ship registration on file. Move close enough to dock, then power down for delivery.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good. They have your provisional ID and the VIN. Registration checked out under Rook Industries, just like it should. Now get us close enough to dock.",
          acknowledgement: { label: "Proceed to Docking" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "dock-yard-exchange" },
      ],
    },
    {
      id: "dock-yard-exchange",
      objective: "Dock and power down at Yard Exchange.",
      helpText:
        "Dock at Yard Exchange, then power the ship down. The contract will not accept delivery until this VIN is docked and the ship is off.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "There it is. Your docking lock is on the Hull panel, right under the VIN. Get close enough, then use that to tether us in.",
        },
      ],
      transitions: [
        {
          eventType: "contract.fulfilled",
          payloadEquals: { contractId: "rook-yard-exchange-delivery" },
          nextStepId: "complete-delivery-contract",
        },
        {
          eventType: "contract.paid",
          payloadEquals: { contractId: "rook-yard-exchange-delivery" },
          actions: [{ type: "completeMission" }],
        },
      ],
    },
    {
      id: "complete-delivery-contract",
      objective: "Complete the delivery contract.",
      helpText: "The delivery terms are satisfied. Use the Contract panel and press Complete Contract to receive the 500-credit payout.",
      onEnter: [
        { type: "setEnginePowerLock", isLocked: true },
        {
          type: "say",
          speaker: "Rook",
          text: "Good. The Yard Exchange has the VIN and the contract terms are met. Complete the contract and the pay is yours.",
        },
      ],
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
