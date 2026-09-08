import { chapterOneRoute, storyRegions, storySites, storyZones } from "../storyWorld.js?v=fresh-20260908-1855-2f42a441";

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
  startBeatId: "show-hull",
  considerations: [
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
        {
          type: "say",
          speaker: "Rook",
          text: "Good. Somewhere you'll actually look at it. Paperwork next.",
        },
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
      fromBeat: "open-drawer",
      throughBeat: "file-contract",
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
      fromBeat: "open-drawer",
      throughBeat: "file-contract",
      eventType: "component.filed",
      payloadEquals: { componentId: "license", destination: "drawer" },
      setFlag: "licenseFiled",
      once: true,
    },
    ...ASSESSMENT_FLIGHT_CONSIDERATIONS,
  ],
  beats: [
    {
      id: "show-hull",
      objective: "Open the module bay.",
      tasks: [
        { label: "Open the module bay", flag: "moduleBayOpened" },
      ],
      helpText:
        "The module bay is the tab labelled MODULES down the left edge of the viewport. Click it to slide the bay out. Every instrument this ship carries is listed there.",
      onEnter: [
        { type: "setPaperworkFiling", isEnabled: false },
        {
          type: "say",
          speaker: "Rook",
          text:
            "All right, rookie. Consider this your assessment test, training and interview all in one. Start by opening the module bay — that MODULES tab on the left. Everything this skiff carries is racked in there.",
        },
      ],
      transitions: [
        {
          eventType: "cockpit.moduleBayOpened",
          setFlag: "moduleBayOpened",
          delayMs: 900,
          nextStepId: "broken-processor",
        },
      ],
    },
    {
      id: "broken-processor",
      objective: "Look over the bay.",
      helpText:
        "The PROCESSOR module is marked NOT FUNCTIONING with hazard stripes. A working processor refines what you cut into fuel, charges or hull patch; this one cannot, so everything you collect drops straight into cargo.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "See the processor there, flagged up amber? It's dead. Has been a while. Don't worry about it for now — not important. It just means whatever you cut goes straight into the hold as ore instead of getting refined on the way home.",
          acknowledgement: { label: "Understood" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "show-hull-module" },
      ],
    },
    {
      id: "show-hull-module",
      objective: "Switch on the Hull display.",
      tasks: [
        { label: "Switch on the Hull display", flag: "hullPanelAdded" },
        { label: "Move it clear of the bay", flag: "hullPanelMoved" },
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
          text:
            "Click the Hull readout in the bay to switch it on, then drag it over to the far side of the desk where you can keep an eye on it. She's at 100%. You better keep it that way, ya hear?",
        },
      ],
      transitions: [
        {
          eventType: "component.dragged",
          requiresFlags: ["hullPanelAdded", "hullPanelMoved"],
          delayMs: 1000,
          nextStepId: "open-drawer",
        },
      ],
    },
    {
      id: "open-drawer",
      objective: "Open the paperwork drawer.",
      tasks: [
        { label: "Open the paperwork drawer", flag: "drawerOpened" },
      ],
      helpText:
        "The PAPERWORK tab sits along the bottom edge of the screen. Click it to slide the drawer open.",
      onEnter: [
        { type: "setPaperworkFiling", isEnabled: true },
        {
          type: "say",
          speaker: "Rook",
          text:
            "Now the paperwork. That tab along the bottom — PAPERWORK — open it up. Your license is filed in there.",
        },
      ],
      transitions: [
        {
          eventType: "paperwork.drawerOpened",
          setFlag: "drawerOpened",
          delayMs: 700,
          nextStepId: "license-to-desk",
        },
      ],
    },
    {
      id: "license-to-desk",
      objective: "Put your license on the desk.",
      tasks: [
        { label: "Move the license to the desk", flag: "licenseOnDesk" },
      ],
      helpText:
        "Find the License in the open drawer and press DESK on its title bar. The drawer holds every document you carry — licenses, contracts, anything a patrol might ask to see.",
      onEnter: [
        { type: "showComponent", componentId: "license", componentName: "License" },
        {
          type: "say",
          speaker: "Rook",
          text:
            "Find your license in there and press DESK to pull it out. That drawer is where you store and manage every document you carry. Keep it tidy — when a patrol asks, they don't wait long.",
        },
      ],
      transitions: [
        {
          eventType: "component.filed",
          payloadEquals: { componentId: "license", destination: "desk" },
          setFlag: "licenseOnDesk",
          delayMs: 900,
          nextStepId: "read-your-balance",
        },
      ],
    },
    {
      id: "read-your-balance",
      objective: "Read your balance.",
      helpText:
        "Credits are printed on the license itself, near the bottom. It is the only place your balance is shown — the license IS your account.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "There she is. Look down the bottom — Credits. That's your money, and the license is where you read it. Go on, have a look at what you're worth.",
          acknowledgement: { label: "Zero" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "offer-contract" },
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
            "Zero. That's why you're here. So — work. Take this ship to Yard Exchange and it's a thousand credits: two-fifty in your hand the moment you sign, seven-fifty when she's docked and powered down. Read it, then accept it.",
        },
        { type: "offerContract", contractId: "rook-yard-exchange-delivery" },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "rook-yard-exchange-delivery" },
          setFlag: "offerContractAccepted",
          delayMs: 1200,
          nextStepId: "advance-paid",
        },
      ],
    },
    {
      id: "advance-paid",
      objective: "Check your license.",
      helpText:
        "Credits on the license has gone from 0 to 250. That is the signing advance, paid out of Rook Industries' own account the moment you accepted.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Signed. Now look at your license again — two-fifty, right there. That's real money out of my account and into yours. The rest lands when this ship is on the pad at Yard Exchange.",
          acknowledgement: { label: "Got it" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "file-contract" },
      ],
    },
    {
      id: "file-contract",
      objective: "File your paperwork.",
      tasks: [
        { label: "File the contract", flag: "contractFiled" },
        { label: "File the license", flag: "licenseFiled" },
      ],
      helpText:
        "Press FILE on the Contract, and FILE on the License. Both drop into the Paperwork drawer, where you can pull either back out whenever you need it.",
      onEnter: [
        { type: "setPaperworkFiling", isEnabled: true },
        // Checked BEFORE Rook speaks, so a player who already put everything
        // away hears the right line instead of being asked to do it again.
        { type: "goToStepIfFlags", flags: ["contractFiled", "licenseFiled"], stepId: "paperwork-already-filed" },
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good, you're on the contract. Now stow both of them — FILE on the contract, FILE on the license. Clean desk before we fly. Do that and I'll get your viewport up.",
        },
      ],
      transitions: [
        {
          eventType: "component.filed",
          requiresFlags: ["contractFiled", "licenseFiled"],
          delayMs: 1200,
          nextStepId: "show-scanner",
        },
      ],
    },
    {
      // Reached only when the desk was already clear on arrival. Rook has
      // nothing to teach here, so he says so and moves on.
      id: "paperwork-already-filed",
      objective: "Ready to fly.",
      helpText:
        "Both documents are already in the Paperwork drawer. Open it any time with the PAPERWORK tab along the bottom.",
      onEnter: [
        { type: "setPaperworkFiling", isEnabled: true },
        {
          type: "say",
          speaker: "Rook",
          text:
            "Desk's already clear. You filed them without being told — good. That's the last thing I was going to teach you about paper. Let's get your viewport up.",
          acknowledgement: { label: "Ready" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "show-scanner" },
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
      objective: "Switch on the Engine.",
      tasks: [
        { label: "Switch on the Engine module", flag: "enginePanelAdded" },
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
          text: "Good. I've racked the engine in your bay — click it to bring the panel out, and let's get going. Time is money.",
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
