export const chapterOneNewShipMission = {
  id: "chapter-1-new-ship",
  prologue: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
    speaker: "Barvis",
    text:
      "Hello hello. Thank you for your prompt delivery of the potato you arrived in. Rook tells me you're starting work with his outfit and that he has a few mining contracts he'd like you to pick up. Let me show you what we have on offer.",
    title: "A New Ship?",
    objective: "Talk with Barvis at Yard Exchange.",
    actionLabel: "See Ships",
    helpText: "Barvis is the shipyard salesman. He can show ships for sale and the special Rook starter offer.",
  },
  activeChapter: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
  },
  title: "A New Ship?",
  successCriteria: "Purchase a ship with a miner component.",
  completion: {
    speaker: "Barvis",
    objective: "Starter ship purchased.",
    helpText: "Your ship now has a miner and cargo hold. Rook can start offering mining work next.",
    line:
      "Excellent choice. The papers are clean, the miner is installed, and the cargo hold is yours. I will tell Rook you are ready for work.",
  },
  startStepId: "show-merchant",
  steps: [
    {
      id: "show-merchant",
      objective: "Review ship offers.",
      helpText:
        "Use the Merchant panel to compare ships. Most are out of reach, but Rook arranged one starter mining ship near your price range.",
      onEnter: [
        { type: "showComponent", componentId: "merchant", componentName: "Merchant" },
        {
          type: "say",
          speaker: "Barvis",
          text:
            "Here are the ships we can get you in right this moment. Take your time. Rook will have a mining rig installed if you take him up on his offer, at the price listed. We can also tune the engine for better fuel efficiency, no extra charge.",
        },
      ],
      transitions: [
        {
          eventType: "merchant.cannotAfford",
          payloadEquals: { offerId: "rook-yard-skiff-miner" },
          nextStepId: "offer-loan",
        },
        {
          eventType: "ship.purchased",
          payloadEquals: { offerId: "rook-yard-skiff-miner" },
          actions: [{ type: "completeMission" }],
        },
      ],
    },
    {
      id: "offer-loan",
      objective: "Review Mako's financing contract.",
      helpText:
        "Press Read Contract to see the loan terms. The loan gives you enough credits to buy Rook's starter mining ship.",
      onEnter: [
        {
          type: "say",
          speaker: "Barvis",
          text:
            "I completely understand, sir. Of course we would never expect everyone who enters to have cash on hand. That's why we have our financing department. Please, let me call Mr. Mako over.",
          acknowledgement: { label: "Call Mako" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "read-loan-contract" },
      ],
    },
    {
      id: "read-loan-contract",
      objective: "Review Mako's financing contract.",
      helpText:
        "Press Read Contract to open Mako's loan contract. Accepting it deposits 20,000 credits into your account.",
      onEnter: [
        {
          type: "say",
          speaker: "Mr. Mako",
          text:
            "Yes, hello. Mr. Rook passed along the necessary information, and we have worked up a pre-approval for a loan of 20 thousand credits.",
          acknowledgement: { label: "Read Contract" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "offerContract", contractId: "mako-starter-ship-loan" },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "mako-starter-ship-loan" },
          nextStepId: "buy-starter-ship",
        },
      ],
    },
    {
      id: "buy-starter-ship",
      objective: "Buy the Rook special starter ship.",
      helpText:
        "Use the Merchant panel to buy the Rook special. It includes a miner and cargo hold so you can take mining work.",
      onEnter: [
        {
          type: "say",
          speaker: "Barvis",
          text:
            "Funding is in place. The Rook special is ready with a miner and cargo hold. Select that offer and we'll put the ship in your name.",
        },
      ],
      transitions: [
        {
          eventType: "ship.purchased",
          payloadEquals: { offerId: "rook-yard-skiff-miner" },
          actions: [{ type: "completeMission" }],
        },
      ],
    },
  ],
};
