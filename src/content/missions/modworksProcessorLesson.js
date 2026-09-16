// Nara's processor lesson. An INTERLUDE: it starts when the processor is
// bought (global consideration), suspends whatever mission is running, and
// hands it back when done. Optional — the first beat is an offer the player
// can wave off.
//
// The processor in four moves: every ore picked up lands in the chamber; the
// plug picks which module it feeds; clicking an ore processes it; unplugged,
// everything goes to the hold. Nara announces each thing she is about to do
// to the ship BEFORE she does it, so the player sees it happen rather than
// wondering whether the hull was already at 70.

export const modworksProcessorLesson = {
  id: "modworks-processor-lesson",
  interlude: true,
  autoAcceptOnStart: true,
  prologue: {
    speaker: "Nara Coil",
    text: "Processor's in. Essential choice: every ore you pick up goes through it, and it's what turns rock into fuel, patches, charges and scanergy instead of dead weight. Need me to walk you through it, or are you good?",
    title: "The Processor",
    objective: "Nara's offer.",
    actionLabel: null,
    helpText: "Nara can walk you through the processor, or you can work it out yourself.",
  },
  activeChapter: {},
  title: "The Processor",
  successCriteria: "Route processed ore to the hull, the drive, and the hold.",
  completion: {
    speaker: "Nara Coil",
    objective: "Processor fitted.",
    // No line of its own: each way out of the lesson says its own goodbye.
    helpText: "Every ore you pick up lands in the processor chamber. Drag the plug to a module's socket to choose what it feeds, then click the ore to process it. Unplugged, ore goes to the cargo hold.",
  },
  startBeatId: "offer",
  considerations: [
    {
      // Iron into the drive, ice into the hull. The chamber spits it back;
      // Nara says why, once or twice.
      id: "wrong-socket",
      fromBeat: "patch",
      eventType: "resource.processingRejected",
      payloadEquals: { reason: "incompatible-resource-output" },
      repeatable: true,
      cooldownMs: 6000,
      maxRuns: 2,
      responses: [
        { speaker: "Nara Coil", text: "Wrong socket. That module can't use that ore—the plug shows what it wants. Move it." },
        { speaker: "Nara Coil", text: "Still the wrong socket. Move the plug." },
      ],
    },
  ],
  beats: [
    {
      id: "offer",
      objective: "Nara's offer.",
      helpText: "Take the walkthrough, or wave it off and work the processor out yourself.",
      onEnter: [
        {
          type: "say",
          speaker: "Nara Coil",
          text: "Processor's in. Essential choice: every ore you pick up goes through it, and it's what turns rock into fuel, patches, charges and scanergy instead of dead weight. Need me to walk you through it, or are you good?",
          acknowledgement: { label: "Walk Me Through It", decline: { label: "I'm Good", action: "dismiss" } },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "intake" },
      ],
      onDecline: [
        { type: "say", speaker: "Nara Coil", text: "Suit yourself. The plug picks the socket; click the ore to send it." },
        { type: "completeMission" },
      ],
    },
    {
      // She says what she is about to do. The dent happens on the click.
      id: "intake",
      objective: "Listen to Nara.",
      helpText: "Nara is about to damage the hull to demonstrate repair. Click her finished chatter box to let her.",
      onEnter: [
        { type: "showComponent", componentId: "processor", componentName: "Processor" },
        {
          type: "say",
          speaker: "Nara Coil",
          text: "All the ore you pick up comes in here, into the processor. I'm going to put a dent in your hull so you've got something to fix. Hold still.",
          acknowledgement: { label: "Go On" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "damageHull", amount: 30 },
        { type: "goToStep", stepId: "patch" },
      ],
    },
    {
      id: "patch",
      objective: "Patch the dent.",
      tasks: [
        { label: "Move the plug up to the Hull", flag: "routedHull", attention: "selector:.processor-claw" },
        { label: "Click the red ore in the chamber", flag: "ironProcessed", attention: "element:processor" },
      ],
      helpText:
        "Drag the processor plug up to the HULL panel's socket, then click the red ore in the chamber. Each unit fills the hull's repair reserve, and the hull draws on that paste to repair itself while there is any left.",
      onEnter: [
        { type: "giveResource", resourceType: "iron-nickel", amount: 3 },
        {
          type: "say",
          speaker: "Nara Coil",
          text: "Thirty off your hull, three iron in the chamber. Take the plug and move it up to the HULL—that's what we're repairing. Then click the red ore. Each one fills your repair reserve, and the hull draws on that paste until it's empty.",
        },
      ],
      considerations: [
        {
          id: "routed-hull",
          eventType: "processor.routed",
          payloadEquals: { output: "hull-repair" },
          setFlag: "routedHull",
          once: true,
        },
      ],
      transitions: [
        {
          eventType: "resource.processed",
          payloadEquals: { output: "hull-repair" },
          setFlag: "ironProcessed",
          actions: [{ type: "setFlag", flag: "routedHull" }],
          delayMs: 1200,
          nextStepId: "bleed",
        },
      ],
    },
    {
      id: "bleed",
      objective: "Listen to Nara.",
      helpText: "Nara is about to bleed fuel from the drive to demonstrate refuelling. Click her finished chatter box to let her.",
      onEnter: [
        {
          type: "say",
          speaker: "Nara Coil",
          text: "Patches going in? Good. Now I'm going to run your drive down.",
          acknowledgement: { label: "Go On" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "drainFuel", amount: 400 },
        { type: "giveResource", resourceType: "water-ice", amount: 2 },
        { type: "goToStep", stepId: "refuel" },
      ],
    },
    {
      id: "refuel",
      objective: "Refuel the drive.",
      tasks: [
        { label: "Move the plug to the Engine", flag: "routedEngine", attention: "selector:.processor-claw" },
        { label: "Click the ice in the chamber", flag: "iceProcessed", attention: "element:processor" },
      ],
      helpText:
        "Drag the processor plug to the ENGINE panel's socket, then click the ice in the chamber. Ice makes fuel; iron makes patches or charges.",
      onEnter: [
        {
          type: "say",
          speaker: "Nara Coil",
          text: "Four hundred off the tank, two ice in the chamber. Plug onto the ENGINE, click the ice. Ice makes fuel; iron doesn't.",
        },
      ],
      considerations: [
        {
          id: "routed-engine",
          eventType: "processor.routed",
          payloadEquals: { output: "fuel" },
          setFlag: "routedEngine",
          once: true,
        },
      ],
      transitions: [
        {
          eventType: "resource.processed",
          payloadEquals: { output: "fuel" },
          setFlag: "iceProcessed",
          actions: [{ type: "setFlag", flag: "routedEngine" }],
          delayMs: 1200,
          nextStepId: "hold",
        },
      ],
    },
    {
      // Not everything is for the ship. Crystal is money, and money goes in
      // the hold — by the plug, or by no plug at all.
      id: "hold",
      objective: "Send the crystal to the hold.",
      tasks: [
        { label: "Send the crystal to the cargo hold", flag: "crystalHeld", attention: "element:processor" },
      ],
      helpText:
        "Route the crystal to CARGO the same way—plug on the cargo hold's socket, click the crystal—or pull the plug off and click it: unplugged, everything goes to the hold. Finley at Supply buys what is in the hold.",
      onEnter: [
        { type: "giveResource", resourceType: "crystal-matrix", amount: 1 },
        {
          type: "say",
          speaker: "Nara Coil",
          text: "Last one. That's crystal—worth money, no use to the ship. Route it to CARGO like the others, or pull the plug off and just click it; unplugged, everything goes to the hold. Finley at Supply buys what's in the hold.",
        },
      ],
      transitions: [
        {
          eventType: "resource.processed",
          payloadEquals: { output: "cargo" },
          setFlag: "crystalHeld",
          actions: [
            {
              type: "say",
              speaker: "Nara Coil",
              text: "That's the processor. Every module with a socket takes a feed—repair paste, fuel, charges, scanergy—and the plug shows what it wants. The field guide tells you which ores make what. Route before you pick up, not after.",
            },
            { type: "completeMission" },
          ],
        },
      ],
    },
  ],
};
