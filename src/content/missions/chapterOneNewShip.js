export const chapterOneNewShipMission = {
  id: "chapter-1-new-ship",
  prologue: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
    speaker: "Rook",
    text:
      "I set up a relationship for you with Barvis at Yard Exchange Shipyard. Go see him about getting yourself a ship with a miner, and I'll have work for you.",
    title: "A New Ship?",
    objective: "Find Barvis at Yard Exchange Shipyard.",
    actionLabel: "Look for Barvis",
    helpText:
      "You are docked at Yard Exchange. Open the Hub panel and choose Shipyard to talk with Barvis.",
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
    helpText: "Your ship now has a miner and cargo hold. Rook has your first mining work lined up.",
    line:
      "Excellent choice. The papers are clean, the miner is installed, and the cargo hold is yours. I will tell Rook you are ready for work.",
    acknowledgement: {
      label: "Call Rook",
      action: "startMission",
      missionId: "chapter-1-red-work",
    },
  },
  startStepId: "find-barvis",
  steps: [
    {
      id: "find-barvis",
      objective: "Talk to Barvis at Yard Exchange Shipyard.",
      helpText:
        "While docked at Yard Exchange, open the Hub panel and choose Shipyard. That is Barvis's service window.",
      onEnter: [
        { type: "unlockHubService", siteId: "yard-exchange", serviceId: "yard-shipyard" },
      ],
      transitions: [
        {
          eventType: "hub.serviceOpened",
          payloadEquals: { siteId: "yard-exchange", serviceId: "yard-shipyard" },
          nextStepId: "show-merchant",
        },
      ],
    },
    {
      id: "show-merchant",
      objective: "Review ship offers.",
      helpText:
        "Use Barvis's Merchant panel to compare ships. Most are out of reach, but Rook arranged one starter mining ship near your price range.",
      onEnter: [
        { type: "showComponent", componentId: "merchant", componentName: "Merchant" },
        {
          type: "say",
          speaker: "Barvis",
          text:
            "Hello hello. Thank you for your prompt delivery of the potato you arrived in. Rook tells me you're starting work with his outfit and that he has a few mining contracts he'd like you to pick up. Here are the ships we can get you in right this moment. Take your time. Rook will have a mining rig installed if you take him up on his offer, at the price listed. We can also tune the engine for better fuel efficiency, no extra charge.",
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
          actions: [
            { type: "unlockHubService", siteId: "yard-exchange", serviceId: "rook-industries" },
            { type: "completeMission" },
          ],
        },
      ],
    },
    {
      id: "offer-loan",
      objective: "Ask Yard Exchange Finance for help.",
      helpText:
        "Press Call Mako, then use the Hub panel and choose Finance to review the loan contract.",
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
        { type: "unlockHubService", siteId: "yard-exchange", serviceId: "yard-finance" },
        { type: "goToStep", stepId: "find-mako" },
      ],
    },
    {
      id: "find-mako",
      objective: "Talk to Mr. Mako at Yard Exchange Finance.",
      helpText:
        "Open the Hub panel and choose Finance. Mr. Mako's contract appears there, not in Barvis's shipyard window.",
      transitions: [
        {
          eventType: "hub.serviceOpened",
          payloadEquals: { siteId: "yard-exchange", serviceId: "yard-finance" },
          nextStepId: "read-loan-contract",
        },
      ],
    },
    {
      id: "read-loan-contract",
      objective: "Review Mako's financing contract.",
      helpText:
        "Read the Starter Ship Financing contract. Accept it only if you want the 20,000-credit financing deposited into your account.",
      onEnter: [
        {
          type: "say",
          speaker: "Mr. Mako",
          text:
            "Yes, hello. Mr. Rook passed along the necessary information, and Yard Exchange Finance has worked up a pre-approval for a loan of 20 thousand credits.",
        },
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
        "Return to Barvis at the Shipyard and buy the Rook special. It includes a miner and cargo hold so you can take mining work.",
      onEnter: [
        {
          type: "say",
          speaker: "Barvis",
          text:
            "Funding is in place. Come back to the Shipyard and the Rook special will be ready with a miner and cargo hold. Select that offer and we'll put the ship in your name.",
        },
      ],
      transitions: [
        {
          eventType: "ship.purchased",
          payloadEquals: { offerId: "rook-yard-skiff-miner" },
          actions: [
            { type: "unlockHubService", siteId: "yard-exchange", serviceId: "rook-industries" },
            { type: "completeMission" },
          ],
        },
      ],
    },
  ],
};
