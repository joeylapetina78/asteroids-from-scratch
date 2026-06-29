export const chapterOneNewShipMission = {
  id: "chapter-1-new-ship",
  prologue: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
    speaker: "Rook",
    text:
      "Shipyard access is open. Select Shipyard in the Yard Exchange service panel and talk to Barvis.",
    title: "A New Ship?",
    objective: "Find Barvis at Yard Exchange Shipyard.",
    actionLabel: "Thanks, Will Do",
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
    speaker: "Rook",
    objective: "Talk to Rook Industries.",
    helpText: "Rook Industries is open. Rook has your first mining contract waiting there.",
    line:
      "There you are. New ship, new debt, new chances. I've got your first mining contract waiting.",
    acknowledgement: {
      label: "Talk Contract",
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
            "Hello hello. Rook said you'd be coming. Here are the ships I can get you into right now. The Rook special has a miner installed and is the only one close to your price range.",
        },
      ],
      transitions: [
        {
          eventType: "merchant.cannotAfford",
          payloadEquals: { offerId: "rook-yard-skiff-miner" },
          nextStepId: "offer-loan",
        },
      ],
    },
    {
      id: "offer-loan",
      objective: "Talk to Mr. Mako at Yard Exchange Finance.",
      helpText:
        "Barvis closed the Shipyard window. Choose Finance in the Yard Exchange service panel to speak with Mr. Mako.",
      onEnter: [
        { type: "hideComponent", componentId: "merchant" },
        { type: "unlockHubService", siteId: "yard-exchange", serviceId: "yard-finance" },
        {
          type: "say",
          speaker: "Barvis",
          text:
            "Not enough credits. No shame in that, sir. I've opened Finance for you. Select Mr. Mako from the Yard Exchange service panel, then come back to me when the funds are in place.",
        },
      ],
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
            "Yes, hello. Yard Exchange Finance has a pre-approval for a 20,000-credit starter ship loan. Review the contract and accept it if the terms suit your situation.",
        },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "mako-starter-ship-loan" },
          nextStepId: "return-to-barvis",
        },
      ],
    },
    {
      id: "return-to-barvis",
      objective: "Return to Barvis at the Shipyard.",
      helpText:
        "The loan is active and the money is in your account. Choose Shipyard in the Yard Exchange service panel and buy the Rook special.",
      onEnter: [
        { type: "hideComponent", componentId: "contract" },
        {
          type: "say",
          speaker: "Mr. Mako",
          text:
            "Funds are deposited. Please return to Barvis at the Shipyard to complete the purchase.",
        },
      ],
      transitions: [
        {
          eventType: "hub.serviceOpened",
          payloadEquals: { siteId: "yard-exchange", serviceId: "yard-shipyard" },
          nextStepId: "buy-starter-ship",
        },
      ],
    },
    {
      id: "buy-starter-ship",
      objective: "Buy the Rook special starter ship.",
      helpText:
        "Use Barvis's Merchant panel to buy the Rook special. It includes a miner and cargo hold so you can take mining work.",
      onEnter: [
        { type: "showComponent", componentId: "merchant", componentName: "Merchant" },
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
          nextStepId: "find-rook",
          actions: [
            { type: "hideComponent", componentId: "merchant" },
            { type: "unlockHubService", siteId: "yard-exchange", serviceId: "rook-industries" },
          ],
        },
      ],
    },
    {
      id: "find-rook",
      objective: "Talk to Rook Industries.",
      helpText:
        "Barvis is done with the sale. Choose Rook Industries in the Yard Exchange service panel to get your first mining work.",
      onEnter: [
        {
          type: "say",
          speaker: "Barvis",
          text:
            "Congratulations, sir. The ship is yours. Rook is waiting in his office now; select Rook Industries from the service panel when you're ready.",
        },
      ],
      transitions: [
        {
          eventType: "hub.serviceOpened",
          payloadEquals: { siteId: "yard-exchange", serviceId: "rook-industries" },
          actions: [{ type: "completeMission" }],
        },
      ],
    },
  ],
};
