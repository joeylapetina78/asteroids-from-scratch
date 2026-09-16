// Considerations that are not scoped to a mission or a beat. They use the
// same rule shape as mission considerations (eventType, payloadEquals, once,
// repeatable, responses...) and the same action vocabulary, but their flags
// live in `journey.globalFlags`, so they survive mission changes and a
// "once" here means once in the pilot's career, not once per mission.
//
// The journey director runs these after the active mission has had its look
// at each event, with the same courtesies: nothing speaks over a pending
// acknowledgement, and nothing speaks while a mission holds the comms floor.

export const GLOBAL_CONSIDERATIONS = [
  {
    // Nara opens the good shelf once the starter three are bought. Rook has
    // one thing on it he wants the player to own, because a ship that can
    // fly backwards is a ship that stops crashing forwards — and a ship that
    // stops crashing is a ship that keeps earning him money.
    id: "rook-pushes-reversing-drive",
    eventType: "hub.shopShelfOpened",
    payloadEquals: { serviceId: "yard-modworks", stockGroup: "restock-1" },
    once: true,
    setFlag: "rookPushedReversingDrive",
    actions: [
      {
        type: "say",
        speaker: "Rook",
        text:
          "Nara's showing you the real shelf. Ignore most of it. The Vektor reversing drive—get that the minute you can afford it. A ship that can stop is a ship that keeps working.",
      },
    ],
  },
  {
    // The Ledge is past Red Teeth. It is worth knowing about the first time
    // a job actually sends the player out that way — Ore Ridge — and not
    // before, when the next run is copper in the opposite direction.
    id: "rook-mentions-the-ledge",
    eventType: "contract.accepted",
    payloadEquals: { contractId: "rook-red-teeth-claim-run-50" },
    once: true,
    setFlag: "rookMentionedTheLedge",
    actions: [
      {
        type: "say",
        speaker: "Rook",
        text: "Ore Ridge is out past Red Teeth. So is The Ledge—east-northeast, past the teeth. Fuel stop, if you're running low out there and the Yard's a long way back.",
      },
    ],
  },
  {
    // Nara offers the processor lesson the moment the unit is bought. It runs
    // as an interlude, so whatever mission is open is put aside and handed
    // back afterwards.
    id: "nara-processor-lesson",
    eventType: "component.purchased",
    payloadEquals: { offerId: "processor-mk1" },
    once: true,
    setFlag: "naraOfferedProcessorLesson",
    actions: [{ type: "startInterludeMission", missionId: "modworks-processor-lesson" }],
  },
  {
    id: "rook-approves-reversing-drive",
    eventType: "component.purchased",
    payloadEquals: { offerId: "vektor-reversing-drive" },
    once: true,
    setFlag: "rookSawReversingDrive",
    actions: [
      {
        type: "say",
        speaker: "Rook",
        text: "Now she's got a proper drive. S is reverse thrust, not a brake—she'll back off a rock instead of bouncing off it. Go earn it back.",
      },
    ],
  },
  {
    // Nosing a bloom bursts it across the hull. It is free crystal, and it is
    // also the thing that, in numbers, brings the big one up.
    id: "rook-bloom-splatter",
    eventType: "life.harvested",
    payloadEquals: { type: "bloom" },
    repeatable: true,
    cooldownMs: 12000,
    maxRuns: 4,
    responses: [
      {
        speaker: "Rook",
        text:
          "That's a bloom across the hood. It doesn't wash off. They drop crystal, and crystal sells—but do enough of that and something bigger comes up to ask about it. Steer around them.",
      },
      {
        speaker: "Rook",
        text:
          "Another bloom. Something under the rocks is counting. Pick your moments.",
      },
      {
        speaker: "Rook",
        text:
          "Three. I hope the crystal's worth it.",
      },
      {
        speaker: "Rook",
        text:
          "I've stopped counting. The big one's yours.",
      },
    ],
  },
  {
    id: "rook-greatbloom-surfacing",
    eventType: "life.greatbloomSurfacing",
    once: true,
    // `setFlag` lands in globalFlags here, because that is the flag store the
    // director hands these rules. `once` reads the same key.
    setFlag: "rookWarnedGreatbloom",
    actions: [
      {
        type: "say",
        speaker: "Rook",
        text:
          "There it is. Told you they get big. Don't let it close around you—if it does, the eye's the only soft part. Otherwise, run.",
      },
    ],
  },
];
