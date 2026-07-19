import { chapterOneRoute, yardExchangeServices } from "../storyWorld.js?v=fresh-20260719-0052-baf9309";

export const chapterOneNewShipMission = {
  id: "chapter-1-new-ship",
  autoAcceptOnStart: true,
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
      "You are docked at Yard Exchange. Open the Yard Exchange service panel and choose Shipyard to talk with Barvis.",
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
  startBeatId: "find-barvis",
  beats: [
    {
      id: "find-barvis",
      objective: "Talk to Barvis at Yard Exchange Shipyard.",
      tasks: [
        { label: "Open Yard Exchange Shipyard", flag: "openedShipyard" },
      ],
      helpText:
        "While docked at Yard Exchange, open the Yard Exchange service panel and choose Shipyard. That opens Barvis's ship sale window.",
      onEnter: [
        { type: "clearMessage" },
        { type: "unlockHubService", siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.shipyard },
      ],
      transitions: [
        {
          eventType: "hub.serviceOpened",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.shipyard },
          setFlag: "openedShipyard",
          delayMs: 1200,
          nextStepId: "show-merchant",
        },
      ],
    },
    {
      id: "show-merchant",
      objective: "Review ship offers.",
      tasks: [
        { label: "Try to buy a ship from Barvis", flag: "triedToBuyShip" },
      ],
      helpText:
        "Use Barvis's Merchant panel to compare ships. You cannot afford most of them yet. Click the Rook special, then use I don't have enough if you need financing.",
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
          setFlag: "triedToBuyShip",
          delayMs: 1200,
          nextStepId: "offer-loan",
        },
      ],
    },
    {
      id: "offer-loan",
      objective: "Talk to Mr. Mako at Yard Exchange Finance.",
      tasks: [
        { label: "Open Yard Exchange Finance", flag: "openedFinance" },
      ],
      helpText:
        "Barvis closed the Shipyard window. Choose Finance in the Yard Exchange service panel to speak with Mr. Mako about a loan.",
      onEnter: [
        { type: "hideComponent", componentId: "merchant" },
        { type: "unlockHubService", siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.finance },
        {
          type: "say",
          speaker: "Barvis",
          text:
            "Not enough credits. No shame in that, sir. I've opened Finance for you. Select Mr. Mako from the Yard Exchange service panel, then come back to me when the funds are in place.",
        },
      ],
      considerations: [
        {
          id: "offer-loan-shipyard-redirect",
          eventType: "hub.serviceOpened",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.shipyard },
          repeatable: true,
          cooldownMs: 8000,
          actions: [
            { type: "hideComponent", componentId: "merchant" },
            {
              type: "say",
              speaker: "Barvis",
              text: "The sale has to go through Finance first. Select Mr. Mako from the service panel to arrange the loan, then come back here.",
            },
          ],
        },
      ],
      transitions: [
        {
          eventType: "hub.serviceOpened",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.finance },
          setFlag: "openedFinance",
          delayMs: 1200,
          nextStepId: "read-loan-contract",
        },
      ],
    },
    {
      id: "read-loan-contract",
      objective: "Review Mako's financing contract.",
      tasks: [
        { label: "Accept the financing contract", flag: "loanContractAccepted" },
      ],
      helpText:
        "Open the Starter Ship Financing file from your paperwork drawer, read the terms, and accept it to create a loan obligation. The credits go to the account tied to your provisional ID.",
      onEnter: [
        { type: "offerContract", contractId: "mako-starter-ship-loan" },
        {
          type: "say",
          speaker: "Mr. Mako",
          text:
            "Yes, hello. Yard Exchange Finance has a pre-approval for a 20,000-credit starter ship loan. The contract file is in your paperwork drawer. The account is tied to your provisional ID, and accepting creates a formal obligation with this office. Review the contract and accept it if the terms suit your situation.",
        },
      ],
      considerations: [
        {
          id: "read-loan-shipyard-redirect",
          eventType: "hub.serviceOpened",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.shipyard },
          repeatable: true,
          cooldownMs: 8000,
          actions: [
            { type: "hideComponent", componentId: "merchant" },
            {
              type: "say",
              speaker: "Barvis",
              text: "The contract with Mako needs to be signed before I can process the purchase. Check your contract panel and accept the financing.",
            },
          ],
        },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "mako-starter-ship-loan" },
          setFlag: "loanContractAccepted",
          delayMs: 1200,
          nextStepId: "return-to-barvis",
        },
      ],
    },
    {
      id: "return-to-barvis",
      objective: "Return to Barvis at the Shipyard.",
      tasks: [
        { label: "Return to Yard Exchange Shipyard", flag: "returnedToBarvis" },
      ],
      helpText:
        "The loan obligation is active and the money is in your ID-linked account. You can return to Finance later to make payments on that paperwork. Choose Shipyard again, then buy the Rook special starter mining ship.",
      onEnter: [
        { type: "hideComponent", componentId: "contract" },
        {
          type: "say",
          speaker: "Mr. Mako",
          text:
            "Funds are deposited and the obligation is recorded. When you have credits later, Finance can take payments against that record. Please return to Barvis at the Shipyard to complete the purchase.",
        },
      ],
      transitions: [
        {
          eventType: "hub.serviceOpened",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.shipyard },
          setFlag: "returnedToBarvis",
          delayMs: 1200,
          nextStepId: "buy-starter-ship",
        },
      ],
    },
    {
      id: "buy-starter-ship",
      objective: "Buy the Rook special starter ship.",
      tasks: [
        { label: "Purchase the Rook special starter ship", flag: "starterShipPurchased" },
      ],
      helpText:
        "Use Barvis's Merchant panel to buy the Rook special. It includes a miner and cargo hold, which you need for Rook's mining work.",
      onEnter: [
        { type: "showComponent", componentId: "merchant", componentName: "Merchant" },
        {
          type: "say",
          speaker: "Barvis",
          text:
            "Funding is in place. The Rook special is ready with a miner and cargo hold. Select that offer and we'll put the hull in your name, lien and all.",
        },
      ],
      transitions: [
        {
          eventType: "ship.purchased",
          payloadEquals: { offerId: "rook-yard-skiff-miner" },
          setFlag: "starterShipPurchased",
          delayMs: 1200,
          nextStepId: "find-rook",
          actions: [
            { type: "hideComponent", componentId: "merchant" },
            { type: "unlockHubService", siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.rook },
            { type: "unlockHubService", siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.supply },
          ],
        },
      ],
    },
    {
      id: "find-rook",
      objective: "Talk to Rook Industries.",
      tasks: [
        { label: "Open Rook Industries", flag: "openedRookIndustries" },
      ],
      helpText:
        "Barvis is done with the sale. Choose Rook Industries in the Yard Exchange service panel to get your first mining contract.",
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
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.rook },
          setFlag: "openedRookIndustries",
          actions: [{ type: "completeAndStartMission", missionId: "chapter-1-red-work" }],
        },
      ],
    },
  ],
};
