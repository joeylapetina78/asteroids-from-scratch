import { chapterOneRoute, yardExchangeServices } from "../storyWorld.js?v=fresh-20260916-1941-c4cee6d3";

// The deal. The hull the player just delivered is the Authority's: a wreck out
// of impound, released to Rook for one flight so the Authority could see it
// fly. Now it has. Rook makes it as much of a ship as he is willing to pay for
// — patches the hull, bolts the miner back on — and walks the player through
// what they've got. Then the money: not Finance, the Hub Authority window,
// with Commissioner Vey selling a hull she should not be selling, Mr. Mako
// fronting Sable Ledger's money, and Rook vouching for a pilot he found at the
// bottom of the ladder. The pilot signs and is the one who owes. Rook gets a
// working miner and a hand to fly it without owning either, and hands over the
// first job — and opens the bay on the three empty racks that first pay is
// meant to fill, the processor above all.
//
// The paperwork says the rest; the people say as little as they can.
//
// The mission id is unchanged from when this was a shipyard purchase, so
// nothing that refers to it by id had to move.
export const chapterOneNewShipMission = {
  id: "chapter-1-new-ship",
  autoAcceptOnStart: true,
  prologue: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
    speaker: "Rook",
    text:
      "Okay, look at what you've got. Hull's patched. I tuned the drive—she'll fly like new for a while. Beacon locator gets you where the work is. And I put the miner back on. Switch it on, have a look.",
    title: "The Deal",
    objective: "Look over the ship.",
    actionLabel: null,
    helpText:
      "Rook has patched the hull, tuned the drive, and racked a miner in the module bay. Open the bay and switch on the Miner to look it over.",
  },
  activeChapter: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
  },
  title: "The Deal",
  successCriteria: "Buy the hull out of impound.",
  completion: {
    speaker: "Rook",
    objective: "Take the first job.",
    helpText: "Rook Industries is open. Rook has your first mining contract waiting there.",
    line:
      "Your ship, your debt, my contracts. Let's get you paid.",
    acknowledgement: {
      label: "Talk Contract",
      action: "startMission",
      missionId: "chapter-1-red-work",
    },
  },
  startBeatId: "the-pitch",
  beats: [
    {
      id: "the-pitch",
      objective: "Look over the ship.",
      tasks: [
        { label: "Switch on the Miner", flag: "minerSwitchedOn", attention: "panel:miner" },
      ],
      helpText:
        "The MINER is racked in the module bay on the left. Click it to pop the Miner panel out onto the desk. Arm it there when you need it; leave it safe when you don't.",
      onEnter: [
        // Rook's bare minimum: the hull patched to full, the drive tuned (a
        // service, not a replacement — its ceiling stays where a year in the
        // lot left it), the miner racked. The processor stays dead; nobody
        // at Rook is paying for that.
        { type: "raiseComponentValue", componentId: "hull", key: "integrity", value: 100 },
        { type: "serviceComponent", componentId: "engine" },
        { type: "showComponent", componentId: "miner", componentName: "Miner" },
        { type: "dockComponent", componentId: "miner" },
        { type: "openModuleBay" },
      ],
      transitions: [
        {
          eventType: "cockpit.moduleToggled",
          payloadEquals: { componentId: "miner", expanded: true },
          setFlag: "minerSwitchedOn",
          nextStepId: "arm-the-miner",
        },
      ],
    },
    {
      id: "arm-the-miner",
      objective: "Arm the miner.",
      tasks: [
        { label: "Switch Blaster armed on", flag: "minerArmed", attention: "selector:.miner-panel .arm-toggle" },
      ],
      helpText:
        "On the Miner panel, switch Blaster armed on. Armed, Space fires a mining charge; safed, it does nothing.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Arm it. Blaster armed, on the panel. You'll want to know where that is.",
        },
      ],
      transitions: [
        {
          eventType: "miner.armedChanged",
          payloadEquals: { armed: true },
          setFlag: "minerArmed",
          delayMs: 600,
          nextStepId: "rack-the-miner",
        },
      ],
    },
    {
      // "Put it away" is the display, back into its rack — that is where the
      // charge count lives. A player who safes the switch instead has also
      // put it away, in the sense that matters, so either advances.
      id: "rack-the-miner",
      objective: "Put the Miner display away and check your charges.",
      tasks: [
        { label: "Put the Miner display back in the bay", flag: "minerRacked", attention: "selector:.cockpit-module-launcher[data-panel-id='miner']" },
      ],
      helpText:
        "Click MINER in the module bay again to put the display away. Its rack shows a readout of how many charges are loaded: 150.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Good. Now put the display away—MINER in the bay again. See the readout on its rack? 150 charges. Those are on account.",
        },
      ],
      transitions: [
        {
          eventType: "cockpit.moduleToggled",
          payloadEquals: { componentId: "miner", expanded: false },
          setFlag: "minerRacked",
          delayMs: 900,
          nextStepId: "pitch-the-deal",
        },
        {
          eventType: "miner.armedChanged",
          payloadEquals: { armed: false },
          setFlag: "minerRacked",
          delayMs: 900,
          nextStepId: "pitch-the-deal",
        },
      ],
    },
    {
      id: "pitch-the-deal",
      objective: "Hear Rook's plan.",
      helpText: "Click Rook's finished chatter box to continue.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Hull, drive, beacon locator, miner. Everything you need for the first job. She's cheaper than she's worth, and I can get her for less than that. Come on—let's go see somebody about a thing.",
          acknowledgement: { label: "Go Make the Deal" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "to-the-authority" },
      ],
    },
    {
      id: "to-the-authority",
      objective: "Go to the Hub Authority window with Rook.",
      tasks: [
        { label: "Open the Hub Authority window", flag: "openedAuthority", attention: "hub-service:yard-exchange:yard-travel-authority" },
      ],
      helpText:
        "While docked at Yard Exchange, open the service panel and choose Hub Authority. Rook will introduce the people involved and walk you through the transaction.",
      onEnter: [
        { type: "unlockHubService", siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.travelAuthority },
        {
          type: "say",
          speaker: "Rook",
          text: "Hub Authority window. I'll do the talking.",
        },
      ],
      transitions: [
        {
          // It is Vey's window: her greeting lands first, from the hub, the
          // way it does for anyone who walks up. Rook's turn comes when the
          // player has read it and closed her plate — not on a timer.
          eventType: "hub.serviceOpened",
          payloadEquals: { siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.travelAuthority },
          setFlag: "openedAuthority",
        },
        {
          eventType: "comms.lineClosed",
          payloadEquals: { speaker: "Commissioner Vey" },
          requiresFlags: ["openedAuthority"],
          delayMs: 500,
          nextStepId: "introduce-vey",
        },
      ],
    },
    {
      id: "introduce-vey",
      objective: "Meet Commissioner Vey.",
      helpText: "Rook is introducing the Authority representative. Click his finished chatter box to continue.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Vey. {pilotFirstName}, Commissioner Vey runs impound for the Yard. She's had my—she's had the ship in her lot for a year, and she reads every form to the bottom. We're here to buy the one we flew over. She flew, like we agreed. Right, Vey?",
          acknowledgement: { label: "Hear Vey" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "the-deal" },
      ],
    },
    {
      id: "the-deal",
      objective: "Hear the Authority's terms.",
      tasks: [
        { label: "Hear Commissioner Vey", flag: "authorityTermsHeard", attention: "selector:.viewport-transmission-accept" },
      ],
      helpText:
        "Commissioner Vey is explaining how the impounded hull is being released. Click her finished chatter box to continue.",
      onEnter: [
        {
          type: "say",
          speaker: "Commissioner Vey",
          text: "We are not supposed to sell impounded ships. But this one passed its assessment flight, and I can approve a sponsored disposition—if the extra fee we discussed is paid.",
          acknowledgement: { label: "Continue" },
        },
      ],
      onAcknowledge: [
        { type: "setFlag", flag: "authorityTermsHeard" },
        { type: "clearMessage" },
        { type: "goToStep", stepId: "name-the-fee" },
      ],
    },
    {
      id: "name-the-fee",
      objective: "Settle Vey's fee.",
      helpText: "Rook is confirming the unofficial part of the deal. Click his finished chatter box to continue.",
      onEnter: [{
        type: "say",
        speaker: "Rook",
        text: "We've got your bribe, like we agreed. What are we calling it?",
        acknowledgement: { label: "Hear Vey" },
      }],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "vey-names-the-fee" },
      ],
    },
    {
      id: "vey-names-the-fee",
      objective: "Hear Vey's terms.",
      helpText: "Commissioner Vey is putting an official name on the payment. Click her finished chatter box to continue.",
      onEnter: [{
        type: "say",
        speaker: "Commissioner Vey",
        text: "An expedited disposition fee. Management wants every bribe classified properly so the Authority gets its cut.",
        acknowledgement: { label: "Continue" },
      }],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "mako-aside" },
      ],
    },
    {
      id: "mako-aside",
      objective: "Hear Mako.",
      helpText: "Someone beside Rook approves of the arrangement. Click his finished chatter box to continue.",
      onEnter: [{
        type: "say",
        speaker: "Mr. Mako",
        text: "That's just good business.",
        acknowledgement: { label: "Continue" },
      }],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "introduce-mako" },
      ],
    },
    {
      id: "introduce-mako",
      objective: "Meet Mr. Mako.",
      helpText: "Rook is introducing the lender's representative. Click his finished chatter box to continue.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "{pilotFirstName}, this is Mako. He's with Sable Ledger, and he's here to front us the money. I told him he's investing in my business and in you as a pilot. We'll make good money, and you'll pay him back on time. You do not want to play games with this guy.",
          acknowledgement: { label: "Hear Mako" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "borrow-from-mako" },
      ],
    },
    {
      id: "borrow-from-mako",
      objective: "Borrow the purchase money from Mako.",
      tasks: [
        { label: "Accept Sable Ledger's loan", flag: "loanContractAccepted", attention: "element:contract-accept" },
      ],
      helpText:
        "Read Sable Ledger's Hull Purchase Note in the paperwork drawer. Accepting it puts the purchase money in your account and creates a debt in your name.",
      onEnter: [
        { type: "offerContract", contractId: "mako-starter-ship-loan" },
        {
          type: "say",
          speaker: "Mr. Mako",
          text: "We look forward to doing business with you, {pilotFirstName}. You keep your end of the deal, and everything will be fine. The terms are in the note.",
        },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "mako-starter-ship-loan" },
          setFlag: "loanContractAccepted",
          actions: [
            { type: "clearMessage" },
            { type: "filePaperwork", componentId: "contract" },
          ],
          nextStepId: "return-to-vey",
        },
      ],
    },
    {
      id: "return-to-vey",
      objective: "Return to the Authority's sale.",
      helpText: "Rook is handing the funded transaction back to Commissioner Vey. Click his finished chatter box to continue.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "There's the money. Vey, give us the bill of sale.",
          acknowledgement: { label: "Review Bill of Sale" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "buy-from-authority" },
      ],
    },
    {
      id: "buy-from-authority",
      objective: "Buy the impounded hull.",
      tasks: [
        { label: "Accept the Authority's bill of sale", flag: "hullSaleAccepted", attention: "element:contract-accept" },
      ],
      helpText:
        "Read the Authority Impound Sale in the paperwork drawer. This is separate from the loan: accepting it spends the borrowed money and transfers the hull's title to you.",
      onEnter: [
        { type: "offerContract", contractId: "authority-impound-hull-sale" },
        {
          type: "say",
          speaker: "Commissioner Vey",
          text: "The expedited disposition fee is included. Sign the bill of sale, and as long as I get my cut, I'm happy.",
        },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "authority-impound-hull-sale" },
          setFlag: "hullSaleAccepted",
          actions: [
            { type: "clearMessage" },
            { type: "buySalvageHull" },
            { type: "filePaperwork", componentId: "contract" },
          ],
          nextStepId: "rook-work-pass",
        },
      ],
    },
    {
      id: "rook-work-pass",
      objective: "Receive Rook's work pass.",
      tasks: [{ label: "Take the Yard Exchange work pass", flag: "workPassGranted", attention: "selector:.viewport-transmission-accept" }],
      helpText: "Click Rook's finished chatter box to receive the sponsored Yard Exchange work pass.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "Now you've got a ship, my operating authority, and a provisional license. That meets the Yard's rules. I'm countersigning your Yard Exchange work pass—transit, docking, trade, and mining inside their territory. Take it, rookie.",
          acknowledgement: { label: "Take Work Pass" },
        },
      ],
      onAcknowledge: [
        { type: "grantContract", contractId: "rook-sponsored-yard-exchange-work-pass" },
        { type: "setFlag", flag: "workPassGranted" },
        { type: "clearMessage" },
        { type: "goToStep", stepId: "yard-open" },
      ],
    },
    {
      id: "yard-open",
      objective: "See the Yard open up.",
      helpText: "Rook has granted your Yard Exchange work pass. Click his finished chatter box to continue.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text: "See the blue wash drop away? That's the work pass. This part of space is open to you now—fly it, trade in it, and mine it. Now let's get you paid.",
          acknowledgement: { label: "Take the First Job" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "goToStep", stepId: "first-job" },
      ],
    },
    {
      id: "first-job",
      objective: "Take the first job.",
      tasks: [
        { label: "Open Rook Industries", flag: "openedRookIndustries", attention: "hub-service:yard-exchange:rook-industries" },
      ],
      helpText:
        "The hull is in your name. Choose Rook Industries in the Yard Exchange service panel to take your first mining contract. Modworks is open too: your delivery pay covers two of the three parts Nara is holding, and the first job covers the third.",
      onEnter: [
        { type: "hideComponent", componentId: "contract" },
        { type: "unlockHubService", siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.rook },
        { type: "unlockHubService", siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.supply },
        { type: "unlockHubService", siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.modworks },
        {
          type: "say",
          speaker: "Rook",
          text: "That's your ship. I got the miner aboard. The processor's dead, and there's no tractor field and no scanner. Nara at Modworks is holding all three for you. What's left of your delivery pay covers two; the first job covers the third. Come get the job.",
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
