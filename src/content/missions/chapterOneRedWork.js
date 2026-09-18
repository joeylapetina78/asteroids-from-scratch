import { chapterOneRoute, storyZones, yardExchangeServices } from "../storyWorld.js?v=fresh-20260918-1754-895838cd";

// First Red Run. The player owns a ship, owes Mako, and has a miner, a beacon
// locator, and no scanner. Rook's job is to get five red ore into the hold and
// back to the Yard, and his chatter is a coach's: where to look, what to
// look for, which key fires the charge. Every line here is keyed to
// something the PLAYER did — `byPlayer`, `resourceId`, the lead pin — so
// Rook does not congratulate a hauler's break or a patrol's kill.

// The first contract on Rook's ladder. Its lead pin is what the locator is
// tuned to for this run.
const FIRST_RUN_CONTRACT_ID = "rook-red-resource-run-5";
const FIRST_RUN_LEAD_BEACON_ID = `contract-${FIRST_RUN_CONTRACT_ID}-lead`;
const RED_ORE = "iron-nickel";

export const chapterOneRedWorkMission = {
  id: "chapter-1-red-work",
  autoAcceptOnStart: true,
  prologue: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
    speaker: "Rook",
    text:
      "Well, look at that. She's yours now—yours and Mako's, until you pay him off. I hope she serves you well. Rook Industries has your first job: red ore, back here to the Yard. Read the contract before you sign it.",
    title: "First Red Run",
    objective: "Take Rook's first mining contract.",
    actionLabel: null,
    helpText:
      "Open Rook Industries from the Yard Exchange service panel and read the resource contract. It says which ore to bring back and how many units.",
  },
  activeChapter: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
  },
  title: "First Red Run",
  successCriteria: "Complete one resource delivery contract for Rook.",
  completion: {
    objective: "Red resource contract complete.",
    helpText:
      "The first red run is complete. Rook can offer more repeatable resource work from here.",
  },
  startBeatId: "offer-red-contract",
  considerations: [
    // ── Getting there ──────────────────────────────────────────────────────
    {
      id: "undocked-for-run",
      fromBeat: "follow-the-lead",
      throughBeat: "follow-the-lead",
      eventType: "site.undocked",
      once: true,
      setFlag: "undockedForRun",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good. The locator arrow is my lead: northeast, up and to the right of your viewport. Keep the Yard behind you and close enough to run home to.",
        },
      ],
    },
    {
      // Cycled the locator off the lead. Any other target — Scrap Porch, the
      // Yard itself — points the wrong way for this job.
      id: "beacon-off-the-lead",
      fromBeat: "follow-the-lead",
      throughBeat: "follow-the-lead",
      eventType: "beaconLocator.used",
      payloadEquals: { beaconId: `not:${FIRST_RUN_LEAD_BEACON_ID}` },
      repeatable: true,
      cooldownMs: 15000,
      maxRuns: 3,
      responses: [
        {
          speaker: "Rook",
          text: "That's not my lead. Click the locator until it reads Rook's red ore lead, then follow the arrow.",
        },
        {
          speaker: "Rook",
          text: "Still not the lead. Keep clicking—it cycles through what it knows. You want the one with my name on it.",
        },
        {
          speaker: "Rook",
          text: "If you'd rather find red rock without me, be my guest. Northeast. Up and to the right of the viewport.",
        },
      ],
    },
    {
      id: "beacon-on-the-lead",
      fromBeat: "follow-the-lead",
      throughBeat: "follow-the-lead",
      eventType: "beaconLocator.used",
      payloadEquals: { beaconId: FIRST_RUN_LEAD_BEACON_ID },
      once: true,
      setFlag: "beaconTunedToLead",
      actions: [
        { type: "say", speaker: "Rook", text: "There. That's the lead. Follow the arrow." },
      ],
    },
    // ── Arriving ───────────────────────────────────────────────────────────
    {
      // The pin found nothing and moved. The Yard's own miners work this
      // rock; a rookie who gets there second should be told so, not left
      // staring at gravel.
      id: "lead-moved",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "contract.leadMoved",
      payloadEquals: { contractGroup: "rook-resource-run" },
      repeatable: true,
      cooldownMs: 5000,
      maxRuns: 2,
      responses: [
        {
          speaker: "Rook",
          text: "Picked clean. The Yard runs its own miners on this rock and they got here first. I've moved the pin—follow the arrow.",
        },
        {
          speaker: "Rook",
          text: "Gone again. Busy neighbourhood. Pin's moved once more; after this you're on your own eyes—red outlines.",
        },
      ],
    },
    {
      // No scanner on this hull yet. The red outline is the only instrument.
      id: "lead-reached-no-scanner",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "contract.leadReached",
      payloadEquals: { contractGroup: "rook-resource-run", hasScanner: false },
      once: true,
      forbidFlag: "explained-mined-resource",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "This is the area. No scanner on this hull yet, so use your eyes: rocks with a red outline have the ore in them. Line one up, tap Space to fire a mining charge into it, and keep hitting it until it breaks down into loose squares.",
        },
      ],
    },
    {
      id: "lead-reached-scanner",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "contract.leadReached",
      payloadEquals: { contractGroup: "rook-resource-run", hasScanner: true },
      once: true,
      forbidFlag: "explained-mined-resource",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "This is the area. Fire off a scan and it'll show you what's in the rocks—red is what we're after. Then Space puts a mining charge into it. Keep hitting it until it breaks into squares.",
        },
      ],
    },
    // ── Finding and breaking rock ──────────────────────────────────────────
    {
      // Drifting past a red rock without shooting it. Stops nagging the
      // moment one has been broken.
      id: "near-red-rock-unmined",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "ship.nearObject",
      payloadEquals: { targetType: "asteroid", resourceId: RED_ORE },
      forbidFlag: "explained-mined-resource",
      repeatable: true,
      cooldownMs: 14000,
      maxRuns: 3,
      responses: [
        {
          speaker: "Rook",
          text: "That one—see the red outline? That's ore. Point the nose at it and tap Space. Charges into the rock, not the hull.",
        },
        {
          speaker: "Rook",
          text: "Red outline, right there. Space fires a charge. Big rocks break into smaller rocks first; keep at it until the squares come out.",
        },
        {
          speaker: "Rook",
          text: "You're looking at a red rock and not shooting it. Arm the miner, then Space, rookie.",
        },
      ],
    },
    {
      id: "first-red-mined",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "resource.mined",
      payloadEquals: { resourceId: RED_ORE, byPlayer: true },
      once: true,
      setFlag: "explained-mined-resource",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "That's the break. Those little red squares are the ore. Fly over them and they go into the hold.",
        },
      ],
    },
    {
      // Breaking plain stone. Nothing in it, so it never fires
      // `resource.mined`; the break itself is the event. Once per rock, on
      // the final break, so a big stone does not earn three lectures.
      id: "plain-rock-broken",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "asteroid.destroyed",
      payloadEquals: { resourceId: "common", byPlayer: true, method: "charge", finalBreak: true },
      forbidFlag: "explained-mined-resource",
      repeatable: true,
      cooldownMs: 12000,
      maxRuns: 2,
      responses: [
        {
          speaker: "Rook",
          text: "That was plain rock—no colour, nothing in it. You're paying charges for gravel. The red outlines, rookie.",
        },
        {
          speaker: "Rook",
          text: "Gravel again. Charges cost money. Save them for the rocks with red around the edge.",
        },
      ],
    },
    {
      // Some other ore. Real, sellable, not the job.
      id: "other-ore-mined",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "resource.mined",
      payloadEquals: { byPlayer: true },
      payloadNotEquals: { resourceId: [RED_ORE, "common"] },
      repeatable: true,
      cooldownMs: 20000,
      maxRuns: 2,
      responses: [
        {
          speaker: "Rook",
          text: "That's ore, but it's not red. Supply will buy it, and it won't count toward my contract. Red outlines for this job.",
        },
        {
          speaker: "Rook",
          text: "More of the wrong colour. Scoop it if you like—Finley pays for anything—but the count on my contract only moves for red.",
        },
      ],
    },
    {
      id: "first-red-collected",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "resource.collected",
      payloadEquals: { resourceType: RED_ORE },
      once: true,
      setFlag: "explained-collected-resource",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "In the hold. That's one. I'm counting along with the Contract panel—keep going until I tell you to head back.",
        },
      ],
    },
    // ── Rook watching the count ────────────────────────────────────────────
    // `contract.cargoProgress` is emitted for every matching unit that lands in
    // the hold, with a milestone; `contract.cargoReady` once, when the count
    // is met. Rook keeps watch and says when it is time to go home.
    {
      id: "cargo-half",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "contract.cargoProgress",
      payloadEquals: { contractGroup: "rook-resource-run", milestone: "half" },
      once: true,
      forbidFlag: "cargoReady",
      actions: [
        { type: "say", speaker: "Rook", text: "Halfway. She scoops clean. Keep at it." },
      ],
    },
    {
      id: "cargo-one-more",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "contract.cargoProgress",
      payloadEquals: { contractGroup: "rook-resource-run", milestone: "one-more" },
      once: true,
      forbidFlag: "cargoReady",
      actions: [
        { type: "say", speaker: "Rook", text: "One more and that's the contract. Find one last square." },
      ],
    },
    {
      id: "cargo-ready",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "contract.cargoReady",
      payloadEquals: { contractGroup: "rook-resource-run" },
      once: true,
      setFlag: "cargoReady",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "That's the count. Tune the locator back to Yard Exchange, head home, and dock. I'll have the next one ready.",
        },
      ],
    },
    {
      // Still scooping after the count is full. Not wrong, not paid.
      id: "cargo-over",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "resource.collected",
      payloadEquals: { resourceType: RED_ORE },
      requiresFlag: "cargoReady",
      repeatable: true,
      cooldownMs: 25000,
      maxRuns: 2,
      responses: [
        { speaker: "Rook", text: "You've got the count. Extra's fine—Finley at Supply buys anything—but the contract doesn't pay more for more. Head back." },
        { speaker: "Rook", text: "Hold's getting heavy for a five-unit job. Bring it home before something out here decides it wants it." },
      ],
    },
    // ── Flying badly ───────────────────────────────────────────────────────
    {
      id: "hull-on-rock",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "ship.collision",
      payloadEquals: { targetType: "asteroid" },
      repeatable: true,
      cooldownMs: 10000,
      maxRuns: 3,
      responses: [
        {
          speaker: "Rook",
          text: "Hull on rock. That's not mining, that's crashing. The charges are free of dents; the hull isn't.",
        },
        {
          speaker: "Rook",
          text: "Again with the hull. Every one of those is a repair bill with Mako's name on the envelope. Space, then wait for the squares.",
        },
        {
          speaker: "Rook",
          text: "I patched that hull. Stop testing the patches.",
        },
      ],
    },
    {
      id: "arm-miner-reminder",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "weapon.unarmedAttempt",
      once: true,
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "You're pressing Space with the miner safed. On the Miner panel, switch Blaster armed on. Then Space fires a charge.",
        },
      ],
    },
    {
      id: "low-fuel-no-scanner",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "ship.lowFuel",
      payloadEquals: { hasScanner: false },
      repeatable: true,
      cooldownMs: 30000,
      maxRuns: 3,
      responses: [
        {
          speaker: "Rook",
          text: "Fuel's half gone. Tune the locator back to Yard Exchange and head in; docking at any hub fills the tank. Running dry means a tow, and a tow means more debt.",
        },
        {
          speaker: "Rook",
          text: "Fuel's thin again. Locator to Yard Exchange, follow the arrow, dock. This does not need to become a finance problem.",
        },
        {
          speaker: "Rook",
          text: "Last free reminder: empty tanks do not care about ambition. Get to a hub.",
        },
      ],
    },
    {
      id: "low-fuel-scanner",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "ship.lowFuel",
      payloadEquals: { hasScanner: true },
      repeatable: true,
      cooldownMs: 30000,
      maxRuns: 3,
      responses: [
        {
          speaker: "Rook",
          text: "Fuel's half gone. Scan if you've got the power, or tune the locator to Yard Exchange and head in. Docking fills the tank; running dry means a tow, and a tow means debt.",
        },
        {
          speaker: "Rook",
          text: "Fuel's thin again. Find a hub and dock before this turns into a finance problem.",
        },
        {
          speaker: "Rook",
          text: "Last free reminder: empty tanks do not care about ambition. Get to a hub.",
        },
      ],
    },
    // ── Too far ────────────────────────────────────────────────────────────
    {
      // Red Teeth is where the red rock IS: its fringe reaches to within a
      // few screens of the Yard, and Rook's lead will sit on that fringe when
      // nothing closer exists. So this is a "mind the edge" line, not a
      // "turn around" — and no scripted hunter, because the zone's own
      // hunter bias already climbs with every screen the player goes deeper.
      id: "red-teeth-warning",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "zone.entered",
      payloadEquals: { zoneId: storyZones.dangerBoundary.id },
      once: true,
      setFlag: "warned-red-teeth",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "That's Red Teeth. The edge of it is where the red rock starts—and where the hunters start. Mine the edge, keep the Yard at your back, and do not go deeper than you can run home from.",
        },
      ],
    },
    {
      id: "hunter-seen-warning",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "ship.nearObject",
      payloadEquals: { targetType: "hunter" },
      once: true,
      setFlag: "warned-hunter-seen",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "Hunter. Red thing with teeth, and it's seen you. If you're light on hull or charges, don't be a hero—back toward Yard Exchange.",
        },
      ],
    },
    {
      // The player's kills only. Patrols and hub guns kill hunters too, and
      // Rook used to hand the rookie credit for all of them.
      id: "hunter-kill-commentary",
      fromBeat: "follow-the-lead",
      throughBeat: "mine-red-resources",
      eventType: "enemy.destroyed",
      payloadEquals: { enemyType: "hunter", byPlayer: true },
      repeatable: true,
      cooldownMs: 1200,
      maxRuns: 3,
      responses: [
        {
          speaker: "Rook",
          text: "You got it? Huh. Not bad, rookie. Eyes up; they don't usually travel alone.",
        },
        {
          speaker: "Rook",
          text: "Another one down. Useful. Still cheaper to avoid them than to fix the ship after every scrap.",
        },
        {
          speaker: "Rook",
          text: "Ace. I'll leave you to it.",
        },
      ],
    },
    // ── Coming home ────────────────────────────────────────────────────────
    {
      id: "docked-with-ore",
      fromBeat: "mine-red-resources",
      throughBeat: "mine-red-resources",
      eventType: "site.docked",
      payloadEquals: { siteId: chapterOneRoute.destinationSite.id },
      requiresFlag: "explained-collected-resource",
      once: true,
      setFlag: "explained-deposit",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text: "Dock's on. Open the Contract panel, press Deposit Cargo, then click the red squares in your hold. When the count is full, complete the contract and the pay is yours.",
        },
      ],
    },
  ],
  beats: [
    {
      id: "offer-red-contract",
      objective: "Review Rook's red resource contract.",
      tasks: [
        { label: "Open Rook Industries", flag: "openedRookForRun", attention: "hub-service:yard-exchange:rook-industries" },
        { label: "Accept Rook's resource contract", flag: "redContractAccepted", attention: "element:contract-accept", attentionRequiresFlag: "openedRookForRun" },
      ],
      helpText:
        "Open Rook Industries from the Yard Exchange service panel. Read the offered contract, then accept it to start the mining job.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Welcome to Rook Industries. First job's on the board: five red ore, back here to the Yard. Read it before you sign—I won't be the only one ever handing you paper.",
        },
      ],
      considerations: [
        {
          // Coming off The Deal the window is already open and the contract
          // already offered by the time this mission starts, so "opened" is
          // read off the offer, which lands after the start.
          id: "opened-rook-for-run",
          eventType: "contract.offered",
          payloadEquals: { contractId: FIRST_RUN_CONTRACT_ID },
          setFlag: "openedRookForRun",
          once: true,
          allowWhilePending: true,
        },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractGroup: "rook-resource-run" },
          setFlag: "redContractAccepted",
          delayMs: 1200,
          nextStepId: "follow-the-lead",
        },
      ],
    },
    {
      id: "follow-the-lead",
      objective: "Follow Rook's lead northeast.",
      tasks: [
        { label: "Undock from Yard Exchange", flag: "undockedForRun", attention: "element:dock-toggle" },
        {
          label: "Reach Rook's red ore lead",
          flag: "leadReached",
          attention: "selector:.beacon-locator-panel .system-readout",
          attentionUnlessActiveBeaconId: FIRST_RUN_LEAD_BEACON_ID,
        },
      ],
      helpText:
        "Undock, then follow the Beacon Locator arrow. It is tuned to Rook's lead: red rock northeast of the Yard, up and to the right of the viewport. If the locator reads something else, click it until it shows Rook's red ore lead. Rocks with a red outline are the ones with ore in them.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "I've pinned my best guess at red rock on your beacon locator. It's northeast of the Yard—up and to the right of your viewport—and not far. Red Teeth starts right about there, so don't push past it. Undock and follow the arrow. When you're out there, look for rocks with a red outline. That's the ore.",
        },
      ],
      transitions: [
        {
          eventType: "contract.leadReached",
          payloadEquals: { contractGroup: "rook-resource-run" },
          setFlag: "leadReached",
          nextStepId: "mine-red-resources",
        },
        // Found red rock without the lead. Fine — the job is the ore, not
        // the pin.
        {
          eventType: "resource.mined",
          payloadEquals: { resourceId: RED_ORE, byPlayer: true },
          setFlag: "leadReached",
          nextStepId: "mine-red-resources",
        },
        {
          eventType: "resource.collected",
          payloadEquals: { resourceType: RED_ORE },
          setFlag: "leadReached",
          nextStepId: "mine-red-resources",
        },
      ],
    },
    {
      id: "mine-red-resources",
      objective: "Mine red ore and bring it back to Yard Exchange.",
      tasks: [
        { label: "Break a red-outlined rock with a charge", flag: "explained-mined-resource" },
        { label: "Scoop red ore into cargo", flag: "explained-collected-resource" },
        { label: "Fill the contract count", flag: "cargoReady" },
        // The contract button only exists on the desk once docked; the arrow
        // appears with it.
        { label: "Deliver and collect payment", flag: "redContractPaid", attention: "element:contract-accept" },
      ],
      helpText:
        "Check the Contract panel for the exact ore and amount. Switch Blaster armed on in the Miner panel, point at a rock with a red outline, and press Space to fire mining charges until it breaks into loose squares. Fly over the squares to scoop them into cargo. Then tune the locator to Yard Exchange, dock, choose Deposit Cargo on the contract, and click the matching cargo squares. Press Help on the toolbar for this text any time.",
      // Rook's arrival line comes from the considerations above, keyed to
      // how the player got here (the lead pin, or a rock they found alone),
      // so this beat has nothing of its own to say on enter.
      onEnter: [],
      transitions: [
        {
          eventType: "contract.paid",
          payloadEquals: { contractGroup: "rook-resource-run" },
          setFlag: "redContractPaid",
          nextStepId: "rook-wrap-up",
        },
      ],
    },
    {
      id: "rook-wrap-up",
      objective: "Red resource contract complete.",
      tasks: [
        { label: "Visit Modworks or undock to continue", flag: "rookWrapUpDone", attention: "hub-service:yard-exchange:yard-modworks" },
      ],
      helpText:
        "Rook has introduced Nara Coil and unlocked Modworks. Visit her shop to see the three starter modules he selected, or undock to keep exploring.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "That's the stuff. First run, first payout, and it came in clean. Whatever you're still short of Nara's three parts, this covers—get the processor first. Modworks is open when you're ready.",
        },
      ],
      transitions: [
        {
          eventType: "hub.serviceOpened",
          payloadEquals: { serviceId: yardExchangeServices.modworks },
          setFlag: "rookWrapUpDone",
          actions: [{ type: "clearMessage" }, { type: "completeMission" }],
        },
        {
          eventType: "site.undocked",
          setFlag: "rookWrapUpDone",
          actions: [{ type: "completeMission" }],
        },
      ],
    },
  ],
};
