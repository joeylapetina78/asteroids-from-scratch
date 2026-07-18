import { chapterOneRoute, storyRegions, storySites, storyZones } from "../storyWorld.js?v=fresh-20260717-2312-49de7be";

const yardExchangeIdentityCleared = ({ state }) =>
  Boolean(state.journey.flags.yardVinPresented && state.journey.flags.yardLicensePresented);

const yardExchangeIdentityNeedsReview = ({ state }) => !yardExchangeIdentityCleared({ state });

const ASSESSMENT_FLIGHT_CONSIDERATIONS = [
  {
    id: "docked-scrap-porch",
    fromBeat: "first-thrust",
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
    fromBeat: "first-thrust",
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
    fromBeat: "first-thrust",
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
    fromBeat: "first-thrust",
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
    fromBeat: "first-thrust",
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
    fromBeat: "first-thrust",
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
    fromBeat: "first-thrust",
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
  // Scrap Porch is the player's starting dock — patrol should not intercept them there during this mission.
  patrolExemptSiteIds: [storySites.originHub.id],
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
    helpText: "Open the Yard Exchange service panel and choose Shipyard. That opens Barvis's ship sale window.",
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
      tasks: [
        { label: "Review the ship controls", flag: "reviewedShipControls" },
      ],
      helpText:
        "This communicator rail shows mission dialogue, plain instructions, and your credits. The Hull panel shows ship health, VIN, and the Docking Lock. Your license is paperwork you can file in the drawer.",
      onEnter: [
        { type: "setPaperworkFiling", isEnabled: false },
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
        { type: "setFlag", flag: "reviewedShipControls" },
        { type: "clearMessage" },
        { type: "goToStep", stepId: "drag-panels" },
      ],
    },
    {
      id: "drag-panels",
      objective: "Move the License and Hull panels.",
      helpText:
        "Drag panels by their title bars. Move the License panel and the Hull panel anywhere comfortable in the display area.",
      tasks: [
        { label: "Move the License panel", flag: "licensePanelMoved" },
        { label: "Move the Hull panel", flag: "hullPanelMoved" },
      ],
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
          delayMs: 1200,
          nextStepId: "offer-contract",
        },
      ],
    },
    {
      id: "offer-contract",
      objective: "Review Rook's delivery contract.",
      tasks: [
        { label: "Accept the delivery contract", flag: "offerContractAccepted" },
      ],
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
          setFlag: "offerContractAccepted",
          delayMs: 1200,
          nextStepId: "file-contract",
        },
      ],
    },
    {
      id: "file-contract",
      objective: "File the Assessment Delivery contract.",
      tasks: [
        { label: "File the contract into the drawer", flag: "contractFiled" },
      ],
      helpText:
        "Click the FILE button on the Contract panel. It will move into the Paperwork drawer at the bottom, where you can pull it up anytime.",
      onEnter: [
        { type: "setPaperworkFiling", isEnabled: true },
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good, you're on the contract. File it away — press FILE on the Contract panel and it drops into your Paperwork drawer. We'll pull it up when we get to Yard Exchange. File it and I'll bring up your viewport.",
        },
      ],
      transitions: [
        {
          eventType: "component.filed",
          payloadEquals: { componentId: "contract", destination: "drawer" },
          setFlag: "contractFiled",
          delayMs: 1200,
          nextStepId: "show-scanner",
        },
      ],
    },
    {
      id: "show-scanner",
      objective: "Get your bearings.",
      tasks: [
        { label: "Add the Beacon Locator to controls", flag: "beaconLocatorAdded" },
      ],
      helpText:
        "Press Add Beacon Locator. It does not need power. It points toward hub beacons remembered by the ship.",
      onEnter: [
        { type: "showComponent", componentId: "viewport", componentName: "Viewport" },
        {
          type: "say",
          speaker: "Rook",
          text:
            "We're that unpowered ship in the center of the viewport. There's the hub we came from, Scrap Porch, in the lower left corner. Your job is to deliver this ship to the other hub in this zone, the Yard Exchange. Let me add the Beacon Locator so you can follow hub signals.",
          acknowledgement: { label: "Add Beacon Locator" },
        },
      ],
      onAcknowledge: [
        { type: "setFlag", flag: "beaconLocatorAdded" },
        { type: "clearMessage" },
        { type: "setComponentValue", componentId: "beaconLocator", key: "beaconMemoryIds", value: ["scrap-porch", "yard-exchange"] },
        { type: "setComponentValue", componentId: "beaconLocator", key: "activeBeaconId", value: "scrap-porch" },
        { type: "setComponentValue", componentId: "beaconLocator", key: "beaconLocatorUsed", value: true },
        { type: "showComponent", componentId: "beacon-locator", componentName: "Beacon Locator" },
        { type: "goToStep", stepId: "try-scanner" },
      ],
    },
    {
      id: "try-scanner",
      objective: "Check the beacon locator.",
      tasks: [
        { label: "Tune beacon to Yard Exchange", flag: "beaconTunedToYard" },
      ],
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
          requiresCondition: yardExchangeIdentityNeedsReview,
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          requiresCondition: yardExchangeIdentityNeedsReview,
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "beaconLocator.used",
          payloadEquals: { siteId: "yard-exchange" },
          setFlag: "beaconTunedToYard",
          delayMs: 1200,
          nextStepId: "show-engine",
        },
      ],
    },
    {
      id: "show-engine",
      objective: "Get the engine online.",
      tasks: [
        { label: "Add the Engine panel to controls", flag: "enginePanelAdded" },
      ],
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
        { type: "setFlag", flag: "enginePanelAdded" },
        { type: "clearMessage" },
        { type: "showComponent", componentId: "engine", componentName: "Engine" },
        { type: "goToStep", stepId: "power-on" },
      ],
    },
    {
      id: "power-on",
      objective: "Power the ship.",
      tasks: [
        { label: "Power the ship on", flag: "shipPoweredOn" },
      ],
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
          requiresCondition: yardExchangeIdentityNeedsReview,
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          requiresCondition: yardExchangeIdentityNeedsReview,
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "engine.powered",
          setFlag: "shipPoweredOn",
          delayMs: 1200,
          nextStepId: "first-thrust",
        },
      ],
    },
    {
      id: "first-thrust",
      objective: "Head for Yard Exchange.",
      tasks: [
        { label: "Thrust toward Yard Exchange", flag: "firstThrust" },
      ],
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
          requiresCondition: yardExchangeIdentityNeedsReview,
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          requiresCondition: yardExchangeIdentityNeedsReview,
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "ship.thrusted",
          setFlag: "firstThrust",
          delayMs: 800,
          nextStepId: "find-yard-exchange",
        },
      ],
    },
    {
      id: "find-yard-exchange",
      objective: "Find Yard Exchange.",
      tasks: [
        { label: "Fly to Yard Exchange", flag: "yardExchangeInView" },
      ],
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
        // Patrol cleared during approach — skip the traffic check beat entirely.
        {
          eventType: "patrol.cleared",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          once: true,
          setFlag: "yardVinPresented",
          actions: [{ type: "setFlag", flag: "yardLicensePresented" }],
          nextStepId: "dock-yard-exchange",
        },
        {
          eventType: "authority.identityCleared",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          once: true,
          setFlag: "yardVinPresented",
          actions: [{ type: "setFlag", flag: "yardLicensePresented" }],
          nextStepId: "dock-yard-exchange",
        },
        {
          eventType: "site.enteredViewport",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          requiresCondition: yardExchangeIdentityNeedsReview,
          setFlag: "yardExchangeInView",
          delayMs: 800,
          nextStepId: "yard-traffic-check",
        },
        {
          eventType: "site.nearby",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          requiresCondition: yardExchangeIdentityNeedsReview,
          setFlag: "yardExchangeInView",
          delayMs: 800,
          nextStepId: "yard-traffic-check",
        },
      ],
    },
    {
      id: "yard-traffic-check",
      objective: "Present ship and pilot identification.",
      tasks: [
        { label: "Present ship VIN", flag: "yardVinPresented" },
        { label: "Present pilot license", flag: "yardLicensePresented" },
      ],
      helpText:
        "Yard Exchange traffic control does not know this ship yet. Click the VIN on the Hull panel, then click the Ref number on your License paperwork to present both IDs.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Looks like Yard Exchange patrol is flagging you for a first-time arrival check. You'll need to show your VIN and pilot license before they let you through.",
        },
      ],
      considerations: [
        {
          id: "yd-vin-presented-first",
          eventType: "authority.documentPresented",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, documentKind: "ship-vin" },
          setFlag: "yardVinPresentedChatter",
          once: true,
          requiresCondition: ({ state }) => !state.journey.flags["yardLicensePresented"],
        },
        {
          id: "yd-license-presented-first",
          eventType: "authority.documentPresented",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, documentKind: "pilot-license" },
          setFlag: "yardLicensePresentedChatter",
          once: true,
          requiresCondition: ({ state }) => !state.journey.flags["yardVinPresented"],
        },
      ],
      transitions: [
        // Patrol auto-cleared the ship (already registered) — treat as both docs presented.
        {
          eventType: "patrol.cleared",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          once: true,
          setFlag: "yardVinPresented",
          delayMs: 600,
          actions: [{ type: "setFlag", flag: "yardLicensePresented" }],
          nextStepId: "dock-yard-exchange",
        },
        {
          eventType: "authority.identityCleared",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          once: true,
          setFlag: "yardVinPresented",
          delayMs: 600,
          actions: [{ type: "setFlag", flag: "yardLicensePresented" }],
          nextStepId: "dock-yard-exchange",
        },
        {
          eventType: "authority.documentPresented",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, documentKind: "pilot-license" },
          requiresFlags: ["yardVinPresented"],
          setFlag: "yardLicensePresented",
          delayMs: 1200,
          actions: [
            { type: "runInspection", siteId: chapterOneRoute.destinationSite.id, inspectionType: "arrival-clearance" },
          ],
          nextStepId: "dock-yard-exchange",
        },
        {
          eventType: "authority.documentPresented",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, documentKind: "ship-vin" },
          requiresFlags: ["yardLicensePresented"],
          setFlag: "yardVinPresented",
          delayMs: 1200,
          actions: [
            { type: "runInspection", siteId: chapterOneRoute.destinationSite.id, inspectionType: "arrival-clearance" },
          ],
          nextStepId: "dock-yard-exchange",
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
      id: "dock-yard-exchange",
      objective: "Dock and power down at Yard Exchange.",
      tasks: [
        { label: "Dock at Yard Exchange", flag: "dockedYardExchange" },
        { label: "Power ship down", flag: "shipPoweredDown" },
      ],
      helpText:
        "Dock at Yard Exchange, then power the ship down. The contract will not accept delivery until this VIN is docked and the ship is off.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good. Registration checked out under Rook Industries, just like it should. Your docking lock is on the Hull panel, right under the VIN. Get close enough, then use that to tether us in.",
        },
      ],
      considerations: [
        {
          id: "ship-powered-down-at-yard",
          eventType: "engine.poweredDown",
          setFlag: "shipPoweredDown",
          once: true,
        },
      ],
      transitions: [
        {
          eventType: "site.docked",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          setFlag: "dockedYardExchange",
          once: true,
        },
        {
          eventType: "contract.fulfilled",
          payloadEquals: { contractId: "rook-yard-exchange-delivery" },
          delayMs: 1400,
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
      tasks: [
        { label: "Collect your 500 cr payout", flag: "deliveryContractPaid" },
      ],
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
          setFlag: "deliveryContractPaid",
          actions: [{ type: "completeMission" }],
        },
      ],
    },
  ],
};
