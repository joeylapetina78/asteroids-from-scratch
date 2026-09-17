import { chapterOneRoute, storyRegions, storySites, storyZones } from "../storyWorld.js?v=fresh-20260917-1715-cca5018f";

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
    // Route advice is for the route. Once the ship is at Yard Exchange the
    // haulers passing the dock are not going to get anyone anywhere, so this
    // and the next one end with the traffic check, before docking.
    id: "first-hauler-seen",
    fromBeat: "first-thrust",
    throughBeat: "yard-traffic-check",
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
    throughBeat: "yard-traffic-check",
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
    // Misfires under load: the flame goes out, a puff comes out instead, and at
    // this stage the ship gets shoved. Rook coaches through it rather than
    // apologising for it.
    id: "engine-misfire",
    fromBeat: "first-thrust",
    eventType: "engine.misfired",
    repeatable: true,
    cooldownMs: 9000,
    maxRuns: 4,
    responses: [
      {
        speaker: "Rook",
        text: "That's the drive cutting out. She'll catch. Keep the throttle on and correct for the kick.",
      },
      {
        speaker: "Rook",
        text: "She fires off-axis when she coughs. Point her back at the beacon.",
      },
      {
        speaker: "Rook",
        text: "Cough, kick, catch. You're getting the rhythm of her.",
      },
      {
        speaker: "Rook",
        text: "Still coughing. Still flying.",
      },
    ],
  },
  {
    id: "engine-died",
    fromBeat: "first-thrust",
    eventType: "ship.panelConditionChanged",
    payloadEquals: { panel: "engine", to: "failed" },
    once: true,
    actions: [
      {
        type: "say",
        speaker: "Rook",
        text: "There she goes. Call the tow. The fee goes on your paper—I'll keep track.",
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
    speaker: "Rook",
    text: "The universe is looking out for us, oh yes! Here you are at rock bottom, and here I am in need of cheap labor.",
    title: "Starting Out",
    objective: "Meet Rook.",
    actionLabel: "Continue",
  },
  activeChapter: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
  },
  // Rook speaks alone until the player has actually flown. Everything else the
  // world wants to say is queued behind this, not lost.
  exclusiveCommsUntilStepId: "first-thrust",
  title: "The Interview",
  successCriteria: `Dock at ${chapterOneRoute.destinationSite.name}.`,
  nextMissionId: "chapter-1-new-ship",
  nextMissionLabel: "Thanks, Will Do",
  completion: {
    speaker: "Rook",
    objective: "Assessment complete.",
    helpText: "Open the Yard Exchange service panel and choose Finance. Mr. Mako has the hull financing ready.",
    acknowledgement: {
      label: "Let's Hear It",
      action: "startMission",
      missionId: "chapter-1-new-ship",
    },
    grades: [
      {
        id: "good",
        minHull: 90,
        maxElapsedSeconds: 120,
        line:
          "Okay. We did it. Clean hull, good time, contract paid out. On that drive. Huh. Okay. The Authority's seen her fly, which means she's for sale. Here's the part where you get a ship.",
      },
      {
        id: "careful",
        minHull: 90,
        line:
          "Okay. We did it. Contract paid out and the hull's still clean. Took us a minute, but careful beats expensive. You kept her tidy. I notice that sort of thing. And the Authority's seen her fly, which means she's for sale. Here's the part where you get a ship.",
      },
      {
        id: "scuffed",
        minHull: 51,
        line:
          "We got here and the contract paid out. We picked up some dents along the way, so next time let's keep the expensive parts farther from the rocks. But she got here. The Authority's seen her fly, which means she's for sale. Dents and all. Here's the part where you get a ship.",
      },
      {
        id: "rough",
        line:
          "We made it, and the contract still paid out because those were the terms. But this hull had a rough ride, rookie. Let's not make that a habit. The Authority's seen her fly, so she's for sale—and you break it, you buy it. Here's the part where you get a ship.",
      },
    ],
  },
  // The two opening lines are presented before the license application. Once
  // the player submits it, the issued license lands on the desk here.
  startBeatId: "show-license",
  // Quick start: Rook's first line is the whole cold open, and the mission
  // itself says the second one while it turns the ship on. The flag is set by
  // the start mode, before the mission is accepted.
  selectStartBeat: ({ state }) => (state.journey.globalFlags?.quickStart ? "quick-start" : null),
  considerations: [
    {
      // The delivery is the mission's real end condition, and it can be met
      // from any of the arrival beats: a patrol that starts its check before
      // the player docks puts the mission in the traffic-check beat, and a
      // player who docks, powers down and collects from there used to leave
      // the contract's events landing in a beat that did not listen for them
      // — paid, and stuck forever short of the shipyard. Whatever beat the
      // arrival is in, a fulfilled delivery moves to collection and a paid one
      // completes the interview. `dock-yard-exchange` has its own transitions
      // for these, so the range stops short of it.
      id: "delivery-fulfilled-anywhere-on-arrival",
      fromBeat: "find-yard-exchange",
      throughBeat: "yard-traffic-check",
      eventType: "contract.fulfilled",
      payloadEquals: { contractId: "rook-yard-exchange-delivery" },
      once: true,
      allowWhilePending: true,
      actions: [{ type: "goToStep", stepId: "complete-delivery-contract" }],
    },
    {
      // Docked is half of it. The contract wants the ship OFF as well, and a
      // player who tethers in and waits is waiting on nothing.
      id: "docked-yard-power-down-reminder",
      fromBeat: "find-yard-exchange",
      throughBeat: "dock-yard-exchange",
      eventType: "site.docked",
      payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
      once: true,
      forbidFlag: "shipPoweredDown",
      allowWhilePending: true,
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "Docked. Now power her down—the delivery only counts with the ship off. Power Ship, on the Engine panel.",
        },
      ],
    },
    {
      id: "delivery-paid-anywhere-on-arrival",
      fromBeat: "find-yard-exchange",
      throughBeat: "yard-traffic-check",
      eventType: "contract.paid",
      payloadEquals: { contractId: "rook-yard-exchange-delivery" },
      once: true,
      allowWhilePending: true,
      actions: [{ type: "setFlag", flag: "deliveryContractPaid" }, { type: "completeMission" }],
    },
    {
      // Switching the hull readout on from the bay. This is the cockpit's
      // replacement for the old desk's "Add panel" button.
      id: "hull-module-added",
      fromBeat: "show-hull-module",
      throughBeat: "show-hull-module",
      eventType: "cockpit.moduleToggled",
      payloadEquals: { componentId: "hull", expanded: true },
      setFlag: "hullPanelAdded",
      once: true,
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "That's her. Now drag it by the title bar over to the far side, clear of the bay.",
        },
      ],
    },
    {
      // Quick start's engine lesson, the hull lesson's shape.
      id: "qs-engine-module-added",
      fromBeat: "qs-engine-fitted",
      throughBeat: "qs-engine-fitted",
      eventType: "cockpit.moduleToggled",
      payloadEquals: { componentId: "engine", expanded: true },
      setFlag: "enginePanelAdded",
      once: true,
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "That's it. Now drag it over by the hull.",
        },
      ],
    },
    {
      id: "qs-engine-panel-moved",
      fromBeat: "qs-engine-fitted",
      throughBeat: "qs-engine-fitted",
      eventType: "component.dragged",
      payloadEquals: { componentId: "engine" },
      setFlag: "enginePanelMoved",
      once: true,
      actions: [],
    },
    {
      // Once floating, a cockpit module is an ordinary draggable panel, so the
      // hull CAN satisfy a drag gate here — unlike in the bay, where it never
      // could.
      id: "hull-panel-moved",
      fromBeat: "show-hull-module",
      throughBeat: "show-hull-module",
      eventType: "component.dragged",
      payloadEquals: { componentId: "hull" },
      setFlag: "hullPanelMoved",
      once: true,
      actions: [
      ],
    },
    {
      // Both documents have to be stowed, and either can go first, so each gets
      // its own consideration rather than a single ordered transition.
      id: "contract-filed",
      // Observed even while Rook is waiting on an acknowledgement: a player can
      // file paperwork during any of these beats, and it has to count.
      allowWhilePending: true,
      // Listening from the moment the drawer is taught, not only during the beat
      // that asks. A player who files as soon as they can was being made to pull
      // the paper back out and file it again, because the flag only counted
      // inside one beat.
      fromBeat: "reveal-drawer",
      throughBeat: "reveal-drawer",
      eventType: "component.filed",
      payloadEquals: { componentId: "contract", destination: "drawer" },
      setFlag: "contractFiled",
      once: true,
    },
    {
      id: "license-filed",
      // Observed even while Rook is waiting on an acknowledgement: a player can
      // file paperwork during any of these beats, and it has to count.
      allowWhilePending: true,
      fromBeat: "reveal-drawer",
      throughBeat: "reveal-drawer",
      eventType: "component.filed",
      payloadEquals: { componentId: "license", destination: "drawer" },
      setFlag: "licenseFiled",
      once: true,
    },
    ...ASSESSMENT_FLIGHT_CONSIDERATIONS,
  ],
  beats: [
    {
      // Quick start's whole induction, in one beat. Everything the first leg
      // needs — the papers signed and filed, the bay open, the viewport lit,
      // the hull and locator out on the desk where the pilot keeps them, the
      // locator already on Yard Exchange — arrives with Rook's second line,
      // because he says he has it all right here. The engine is the one thing
      // left racked: getting that wreck of a drive lit is still the lesson.
      id: "quick-start",
      objective: "Listen to Rook.",
      helpText: "Click the finished chatter box to continue.",
      onEnter: [
        { type: "setFlag", flag: "drawerRevealed" },
        { type: "setFlag", flag: "moduleBayRevealed" },
        { type: "setFlag", flag: "moduleBayOpened" },
        { type: "setPaperworkFiling", isEnabled: true },
        { type: "showComponent", componentId: "viewport", componentName: "Viewport" },
        // The two chambers too: the hold is the hull's and works; the
        // processor chamber is the hull's but the unit in it died in the
        // incursion, so it is shown as the empty rack it is and reads ERR.
        { type: "showComponent", componentId: "cargo", componentName: "Cargo Hold" },
        { type: "showEmptyRack", componentId: "processor", componentName: "Processor" },
        { type: "showComponent", componentId: "hull", componentName: "Hull" },
        { type: "setFlag", flag: "hullPanelAdded" },
        { type: "setFlag", flag: "hullPanelMoved" },
        { type: "setComponentValue", componentId: "beaconLocator", key: "beaconMemoryIds", value: ["scrap-porch", "yard-exchange"] },
        { type: "setComponentValue", componentId: "beaconLocator", key: "activeBeaconId", value: "yard-exchange" },
        { type: "setComponentValue", componentId: "beaconLocator", key: "beaconLocatorUsed", value: true },
        { type: "showComponent", componentId: "beacon-locator", componentName: "Beacon Locator" },
        { type: "setFlag", flag: "beaconLocatorAdded" },
        { type: "setFlag", flag: "beaconTunedToYard" },
        { type: "openModuleBay" },
        { type: "floatComponent", componentId: "hull" },
        { type: "floatComponent", componentId: "beacon-locator" },
        {
          type: "say", speaker: "Rook",
          text: "You wanna take to the stars, see what's out there, explore the black? You'll need a ship and the proper paperwork, and I have both right here.",
          acknowledgement: { label: "Continue" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "qs-rundown" },
      ],
    },
    {
      // The papers, out on the glass: the license the Authority signed for
      // them at the door, and Rook's contract, unsigned. Rook gives the
      // rundown over them. Nothing here teaches filing; the sheets stay out
      // once signed and it is the player's to work out how to put them away.
      id: "qs-rundown",
      objective: "Listen to Rook.",
      helpText: "Click the finished chatter box to continue.",
      onEnter: [
        { type: "showComponent", componentId: "license", componentName: "License" },
        { type: "placePaperworkOnDesk", componentId: "license" },
        { type: "offerContract", contractId: "rook-yard-exchange-delivery" },
        {
          type: "say", speaker: "Rook",
          text: "Here's how it is. The Authority put you on the labor roll. Nobody asked you, and nobody's asking why you're here—I'm not, anyway. What I've got is a ship that needs flying, and what you've got is nothing else on.",
          acknowledgement: { label: "Continue" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "qs-sign" },
      ],
    },
    {
      id: "qs-sign",
      objective: "Sign Rook's contract.",
      tasks: [
        { label: "Accept the delivery contract", flag: "offerContractAccepted", attention: "element:contract-accept" },
      ],
      helpText:
        "Rook's contract is on the glass beside your license. Press Accept Contract on it. The job pays when this hull docks at Yard Exchange and is powered down.",
      onEnter: [
        {
          type: "say", speaker: "Rook",
          text: "And it's a sweet gig, believe me. Pass one test: get that scrapped hull running and over to Yard Exchange, so the Authority sees she flies. After that they'll let her go for a steal, and you're a contractor with Rook Industries—I've got plenty more work where this came from. Sign the paperwork and let's get going.",
        },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "rook-yard-exchange-delivery" },
          setFlag: "offerContractAccepted",
          actions: [{ type: "clearMessage" }],
          delayMs: 900,
          nextStepId: "qs-fit-engine",
        },
      ],
    },
    {
      id: "qs-fit-engine",
      objective: "Listen to Rook.",
      helpText: "Click the finished chatter box to continue.",
      onEnter: [
        {
          type: "say", speaker: "Rook",
          text: "Good. Now—I think I can get this thing going. She just needs a drive. Let me put one in.",
          acknowledgement: { label: "Continue" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "qs-engine-fitted" },
      ],
    },
    {
      // The one lesson quick start keeps: what the module bay is. The drive
      // goes in and its control module appears in the bay, racked; the
      // player brings its display out and puts it by the hull's.
      id: "qs-engine-fitted",
      objective: "Bring the Engine display out.",
      tasks: [
        { label: "Click the Engine module's face", flag: "enginePanelAdded", attention: "panel:engine" },
        { label: "Drag the display over by the hull", flag: "enginePanelMoved", attention: "panel:engine" },
      ],
      helpText:
        "The ENGINE control module is racked in the module bay on the left, under the hull and the locator. Click its face to bring the display out onto the desk, then drag the display over beside the hull readout.",
      onEnter: [
        { type: "showComponent", componentId: "engine", componentName: "Engine" },
        { type: "dockComponent", componentId: "engine" },
        { type: "openModuleBay" },
        {
          type: "say", speaker: "Rook",
          text: "There. Drive's in—well, it's a drive. See the module bay on the left? Every part of this ship has a control module racked in there; that's the drive's, under the hull's. Click its face to bring the display out, then drag it over by the hull readout where you can keep an eye on it.",
        },
      ],
      transitions: [
        {
          eventType: "component.dragged",
          requiresFlags: ["enginePanelAdded", "enginePanelMoved"],
          actions: [{ type: "clearMessage" }],
          delayMs: 600,
          nextStepId: "power-on",
        },
      ],
    },
    {
      id: "want-stars",
      objective: "Listen to Rook.",
      helpText: "Click the finished chatter box to continue.",
      onEnter: [
        { type: "setPaperworkFiling", isEnabled: false },
        {
          type: "say", speaker: "Rook",
          text: "You wanna take to the stars, see what's out there, explore the black? You'll need a ship and the proper paperwork to get anywhere.",
          acknowledgement: { label: "Continue" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "show-license" },
      ],
    },
    {
      id: "show-license",
      objective: "Look over your license.",
      helpText: "Your provisional license is centered on the desk. It carries your identity, employment status and credits.",
      onEnter: [
        { type: "showComponent", componentId: "license", componentName: "License" },
        { type: "placePaperworkOnDesk", componentId: "license" },
        {
          type: "say", speaker: "Rook",
          text: "The good news is, I've got your paperwork right here. Look, it shows you're broke, and it shows that if you're working—you’re working for me.",
          acknowledgement: { label: "Continue" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "offer-contract" },
      ],
    },
    {
      id: "show-hull-module",
      objective: "Switch on the Hull display.",
      tasks: [
        { label: "Switch on the Hull display", flag: "hullPanelAdded", attention: "panel:hull" },
        { label: "Move it clear of the bay", flag: "hullPanelMoved", attention: "panel:hull" },
      ],
      helpText:
        "Click HULL in the module bay to pop it out onto the desk, then drag it by its title bar over to the other side of the screen so the bay is not covering it.",
      onEnter: [
        { type: "showComponent", componentId: "hull", componentName: "Hull" },
        // The cockpit preset floats the hull onto the desk by default, so it has
        // to be racked before the player can be asked to switch it on.
        { type: "dockComponent", componentId: "hull" },
        {
          type: "say",
          speaker: "Rook",
          text: "The hull readout is in the module bay. Activate it, then drag the display over to the right side of the dashboard where you can keep an eye on it.",
        },
      ],
      transitions: [
        {
          eventType: "component.dragged",
          requiresFlags: ["hullPanelAdded", "hullPanelMoved"],
          nextStepId: "hull-display-placed",
        },
      ],
    },
    {
      id: "hull-display-placed",
      objective: "Listen to Rook.",
      helpText: "Click the finished chatter box to continue.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Good. Somewhere you'll actually look at it. Now let me see if I can get the viewport back.",
          acknowledgement: { label: "Continue" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "reveal-viewport" },
      ],
    },
    {
      id: "offer-contract",
      objective: "Review Rook's delivery contract.",
      tasks: [
        { label: "Accept the delivery contract", flag: "offerContractAccepted", attention: "element:contract-accept" },
      ],
      helpText:
        "Use the Contract panel to accept the delivery terms. The job pays when this VIN docks at Yard Exchange and the ship is powered down.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "And the other good news is the ship. The Authority's got one in impound they've written off as scrap, and they'll let her go for a steal—if she runs, and if they see somebody fly her. Here's your contract. Sign it and I'll put a few credits on your paper up front. Then we show them she flies. Ore Worker 7A3, by the way. Not 'it'.",
        },
        { type: "offerContract", contractId: "rook-yard-exchange-delivery" },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "rook-yard-exchange-delivery" },
          setFlag: "offerContractAccepted",
          delayMs: 1200,
          nextStepId: "reveal-drawer",
        },
      ],
    },
    {
      // CAMPAIGN PAUSED (2026-09-16). The paperwork drawer became the paperwork
      // bay on the right edge, and sheets no longer carry a FILE button: they
      // are filed and unfiled from their cards in the bay, like instruments
      // from their rack units. This beat still asks for FILE and points the
      // attention arrow at a button that no longer exists. If the campaign is
      // picked back up, reword Rook's line and the tasks to "put them away in
      // the paperwork bay" (attention: the file cards), and have the offered
      // contract land beside the license as it does now. Quick start skips
      // this beat entirely and is unaffected.
      id: "reveal-drawer",
      objective: "File your paperwork.",
      tasks: [
        { label: "File the contract", flag: "contractFiled", attention: "selector:[data-panel-id='contract'] .paper-file-button" },
        { label: "File the license", flag: "licenseFiled", attention: "selector:[data-panel-id='license'] .paper-file-button" },
      ],
      helpText: "Press FILE on both documents. The PAPERWORK drawer will hold them until you need them again.",
      onEnter: [
        { type: "setFlag", flag: "drawerRevealed" },
        { type: "setPaperworkFiling", isEnabled: true },
        {
          type: "say",
          speaker: "Rook",
          text: "Welcome to working for me. Rook—Rook Enterprises. Okay, file all the paperwork by clicking the FILE button on each. They'll pop into your paperwork drawer, which you can open when you need them later.",
        },
      ],
      transitions: [
        {
          eventType: "component.filed",
          requiresFlags: ["contractFiled", "licenseFiled"],
          actions: [{ type: "clearMessage" }],
          delayMs: 900,
          nextStepId: "reveal-module-bay",
        },
      ],
    },
    {
      id: "reveal-module-bay",
      objective: "Open the module bay.",
      tasks: [{ label: "Open the module bay", flag: "moduleBayOpened", attention: "selector:.cockpit-module-tray-tab" }],
      helpText: "Click the MODULES tab on the left to open the newly revealed module bay.",
      onEnter: [
        { type: "setFlag", flag: "moduleBayRevealed" },
        {
          type: "say", speaker: "Rook",
          text: "She's been condemned. Lost a fight with an incursion, got scrapped here at the Porch, and the Authority's been sitting on her for a year. Good bones, though. Pop open the module bay and let me get to work.",
        },
      ],
      transitions: [
        {
          eventType: "cockpit.moduleBayOpened",
          setFlag: "moduleBayOpened",
          actions: [{ type: "clearMessage" }],
          delayMs: 700,
          nextStepId: "show-hull-module",
        },
      ],
    },
    {
      id: "reveal-viewport",
      objective: "Look through the viewport.",
      helpText: "Click the finished chatter box to continue when you have your bearings.",
      onEnter: [
        { type: "showComponent", componentId: "viewport", componentName: "Viewport" },
        {
          type: "say",
          speaker: "Rook",
          text: "Boom, got the viewport working! There we are in the center; that's Scrap Porch in the lower left. We're headed to Yard Exchange. It's not far—which is good, because this thing won't make it far.",
          acknowledgement: { label: "Continue" },
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
      objective: "Set a course for Yard Exchange.",
      tasks: [
        {
          label: "Tune beacon to Yard Exchange",
          flag: "beaconTunedToYard",
          attention: "selector:.beacon-locator-panel .system-readout",
          attentionUnlessActiveBeaconId: "yard-exchange",
        },
      ],
      helpText:
        "The Beacon Locator starts on Scrap Porch, the hub you came from. Press Next Beacon until it tracks Yard Exchange, your destination.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "I got the beacon locator working. Activate it and put it where you want it. Click it to switch through the saved locations it can get you to. Set it to Yard Exchange.",
        },
      ],
      transitions: [
        {
          eventType: "authority.identityRequested",
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
      objective: "Switch on the Engine.",
      tasks: [
        { label: "Switch on the Engine module", flag: "enginePanelAdded", attention: "panel:engine" },
      ],
      // This beat used to say "Press Add Engine" and hand the player an
      // acknowledgement button. In the cockpit there is no Add button: an
      // instrument is racked in the module bay and switched on from there. The
      // engine is REVEALED into the bay on enter, and the beat then waits for
      // the player to actually switch it on.
      helpText:
        "The ENGINE module is now racked in the module bay on the left. Click it to pop the Engine panel out onto the desk.",
      onEnter: [
        { type: "showComponent", componentId: "engine", componentName: "Engine" },
        { type: "dockComponent", componentId: "engine" },
        {
          type: "say",
          speaker: "Rook",
          text: "Okay... well. That's not so good. Drive's online. It's original—the only thing on her that is. Fire it up and we'll see what we're dealing with.",
        },
      ],
      transitions: [
        {
          eventType: "cockpit.moduleToggled",
          payloadEquals: { componentId: "engine", expanded: true },
          setFlag: "enginePanelAdded",
          delayMs: 800,
          nextStepId: "power-on",
        },
      ],
    },
    {
      id: "power-on",
      objective: "Power the ship.",
      tasks: [
        { label: "Power the ship on", flag: "shipPoweredOn", attention: "element:ship-power" },
      ],
      helpText:
        "Use the Engine panel and click Power Ship. W thrusts, A/D rotate, and S brakes after the ship is powered.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Power it on. Let's see whether it holds together.",
        },
      ],
      transitions: [
        {
          eventType: "authority.identityRequested",
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
          text: "There. Still turns over. She'll cut out on you and she'll pull—nurse her. Follow the beacon to Yard Exchange, and if she dies on us, we call a tow.",
        },
      ],
      transitions: [
        {
          eventType: "authority.identityRequested",
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
          // The paperwork beat begins when the world's patrol actually scans
          // this ship and asks for identity. Merely seeing the destination is
          // not an inspection and must not let the mission stage one early.
          eventType: "authority.identityRequested",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
          requiresCondition: yardExchangeIdentityNeedsReview,
          setFlag: "yardExchangeInView",
          nextStepId: "yard-traffic-check",
        },
      ],
    },
    {
      id: "yard-traffic-check",
      objective: "Present ship and pilot identification.",
      tasks: [
        { label: "Present ship VIN", flag: "yardVinPresented", attention: "element:hull-vin" },
        { label: "Present pilot license", flag: "yardLicensePresented", attention: "element:license-id" },
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
        { label: "Dock at Yard Exchange", flag: "dockedYardExchange", attention: "element:dock-toggle" },
        { label: "Power ship down", flag: "shipPoweredDown", attention: "element:ship-power" },
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
        { label: "Collect your 500 cr payout", flag: "deliveryContractPaid", attention: "element:contract-accept" },
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
