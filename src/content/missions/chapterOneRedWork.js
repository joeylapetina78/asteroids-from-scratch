import { chapterOneRoute, storyZones, yardExchangeServices } from "../storyWorld.js?v=fresh-20260718-1945-861127d";
import { resourceTypesMatch } from "../../systems/resourceDefinitions.js?v=fresh-20260718-1945-861127d";

const PLOT_CONTRACT_ID = "rook-red-teeth-claim-run-50";
const PLOT_CONTRACT_ZONE_ID = "ore-ridge";

function getActivePlotContract(state) {
  const contract = state.contracts?.records?.[PLOT_CONTRACT_ID];
  return contract?.status === "active" ? contract : null;
}

function hasActivePlotContract({ state }) {
  const contract = getActivePlotContract(state);
  return contract?.status === "active";
}

function doesNotHaveActivePlotContract(context) {
  return !hasActivePlotContract(context);
}

function isLegalPlotCollection(event, contract) {
  return (
    event?.type === "resource.collected" &&
    resourceTypesMatch(event.payload?.resourceType, contract.terms?.resourceType) &&
    (contract.terms?.sourceClaimIds ?? []).includes(event.payload?.sourceClaimId)
  );
}

function getLegalPlotCollectionCount(state, contract) {
  const resourceType = contract.terms?.resourceType;
  return (contract.terms?.sourceClaimIds ?? []).reduce((total, sourceClaimId) => {
    return total + state.ledger.getStat(`resource.collected.sourceClaim.${sourceClaimId}.${resourceType}`, 0);
  }, 0);
}

function hasHalfPlotCargoCollected({ event, state }) {
  const contract = getActivePlotContract(state);
  if (!contract || !isLegalPlotCollection(event, contract)) {
    return false;
  }

  const requiredAmount = contract.terms?.amount ?? 0;
  const halfAmount = Math.max(1, Math.ceil(requiredAmount / 2));
  return getLegalPlotCollectionCount(state, contract) >= halfAmount;
}

export const chapterOneRedWorkMission = {
  id: "chapter-1-red-work",
  autoAcceptOnStart: true,
  prologue: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
    speaker: "Rook",
    text:
      "Hey, you ended up with our baby. Good for you. I hope it serves you well in the days to come. To get you started, head starboard, east-ish from Yard Exchange, and find some resources. Rook Industries will have the current contract terms. Drive over loose resource squares to scoop them into cargo, but don't drive the ship into rocks. That's called crashing, not mining. Try to stay close to the hub if you can. If you hit Red Teeth, you've gone too far; there's stuff out there that'll tear you up.",
    title: "First Red Run",
    objective: "Take Rook's first mining contract.",
    actionLabel: null,
    helpText:
      "Dock at Yard Exchange, open Rook Industries, and read the resource contract. It will tell you which color resource to bring back and how many units are needed.",
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
    {
      id: "first-red-mined",
      fromBeat: "mine-red-resources",
      eventType: "resource.mined",
      payloadEquals: { resourceType: "fuel" },
      once: true,
      setFlag: "explained-mined-resource",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "That's the break. The little red squares are the useful stuff. Fly over them to scoop them into the cargo hold.",
        },
      ],
    },
    {
      id: "first-red-collected",
      fromBeat: "mine-red-resources",
      eventType: "resource.collected",
      payloadEquals: { resourceType: "fuel" },
      once: true,
      setFlag: "explained-collected-resource",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good, that's cargo now. Bring the contracted units back to Yard Exchange, dock, then deposit them into the contract.",
        },
      ],
    },
    {
      id: "low-fuel-warning",
      fromBeat: "mine-red-resources",
      eventType: "ship.lowFuel",
      repeatable: true,
      cooldownMs: 30000,
      maxRuns: 3,
      responses: [
        {
          speaker: "Rook",
          text:
            "Fuel's halfway gone, rookie. Scan again if you've got the power and keep Yard Exchange in mind. Docking at any hub refuels you free. Running dry means a tow someday, and a tow means debt.",
        },
        {
          speaker: "Rook",
          text:
            "Fuel is getting thin again. If you can see Yard Exchange, head home. If not, scan, find a hub, and dock before this turns into a finance problem.",
        },
        {
          speaker: "Rook",
          text:
            "Last friendly reminder from me: empty tanks do not care about ambition. Get to a hub or start thinking about tow fees.",
        },
      ],
    },
    {
      id: "arm-miner-reminder",
      fromBeat: "mine-red-resources",
      eventType: "weapon.unarmedAttempt",
      repeatable: true,
      cooldownMs: 10000,
      responses: [
        {
          speaker: "Rook",
          text:
            "You're squeezing the trigger with the miner safed, rookie. Flip Blaster armed on the Miner panel, then space will cut rock.",
        },
        {
          speaker: "Rook",
          text:
            "Still safed. On the Miner panel, check Blaster armed. Then Space fires a mining charge.",
        },
        {
          speaker: "Rook",
          text:
            "No shame in safety, but there is no mining with the switch off. Arm the miner first.",
        },
      ],
    },
    {
      id: "red-teeth-warning",
      fromBeat: "mine-red-resources",
      eventType: "zone.entered",
      payloadEquals: { zoneId: storyZones.dangerBoundary.id },
      once: true,
      setFlag: "warned-red-teeth",
      requiresCondition: doesNotHaveActivePlotContract,
      actions: [
        {
          type: "spawnHunterNearShip",
          reason: "red-teeth-warning",
        },
        {
          type: "say",
          speaker: "Rook",
          text:
            "That's Red Teeth, rookie. Too far for this run. And now you've got company. Turn us around, get back toward Yard Exchange, and find red rock closer to home.",
        },
      ],
    },
    {
      id: "ore-ridge-plot-warning",
      fromBeat: "mine-red-resources",
      eventType: "zone.entered",
      payloadEquals: { zoneId: PLOT_CONTRACT_ZONE_ID },
      once: true,
      setFlag: "oreRidgePlotWarningGiven",
      requiresCondition: hasActivePlotContract,
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "That's Ore Ridge. Farther out, richer rock, fewer friendly eyes. Stay inside the marked plots. Off-plot ore won't count, and claim jumpers love catching rookies with half a hold.",
        },
      ],
    },
    {
      id: "ore-ridge-plot-jumper-pressure",
      fromBeat: "mine-red-resources",
      eventType: "resource.collected",
      repeatable: true,
      cooldownMs: 22000,
      maxRuns: 4,
      requiresCondition: hasHalfPlotCargoCollected,
      beforeResponseActions: [
        {
          type: "spawnPirateNearShip",
          reason: "ore-ridge-plot-jumper",
        },
      ],
      responses: [
        {
          speaker: "Rook",
          text:
            "Plot jumper ping. They saw enough legal ore go into your hold and decided you're worth stealing from. Keep mining if you can, but don't let them box you in.",
        },
        {
          speaker: "Rook",
          text:
            "Another jumper coming in. That's the cost of working marked ground out here: the rocks are better and so are the thieves.",
        },
        {
          speaker: "Rook",
          text:
            "You've got company again. Finish the count or run home with what you've got, but don't drift off the charter plots.",
        },
        {
          speaker: "Rook",
          text:
            "Last warning I'm giving for free: Ore Ridge is awake now. Mine clean, fly mean, get paid.",
        },
      ],
    },
    {
      id: "hunter-seen-warning",
      fromBeat: "mine-red-resources",
      eventType: "ship.nearObject",
      payloadEquals: { targetType: "hunter" },
      once: true,
      setFlag: "warned-hunter-seen",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Hunter in sight. Red little problem with teeth. If you're light on hull or charges, do not be a hero; get back toward Yard Exchange.",
        },
      ],
    },
    {
      id: "pirate-kill-commentary",
      fromBeat: "mine-red-resources",
      eventType: "enemy.destroyed",
      payloadEquals: { enemyType: "pirate" },
      once: true,
      setFlag: "plotPirateDestroyed",
      actions: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Pirate down. Good. The legal ore is the job, but staying alive is the part that keeps us both paid.",
        },
      ],
    },
    {
      id: "hunter-kill-commentary",
      fromBeat: "mine-red-resources",
      eventType: "enemy.destroyed",
      payloadEquals: { enemyType: "hunter" },
      repeatable: true,
      cooldownMs: 1200,
      maxRuns: 3,
      responses: [
        {
          speaker: "Rook",
          text:
            "You got it? Huh. Not bad, rookie. Keep your eyes up; those things do not usually travel alone.",
        },
        {
          speaker: "Rook",
          text:
            "Another hunter down. I'll admit, that's useful. Still cheaper to avoid them than repair the ship after every scrap.",
        },
        {
          speaker: "Rook",
          text:
            "Ace. I'll leave you to it.",
        },
      ],
    },
  ],
  beats: [
    {
      id: "offer-red-contract",
      objective: "Review Rook's red resource contract.",
      tasks: [
        { label: "Accept Rook's resource contract", flag: "redContractAccepted" },
      ],
      helpText:
        "Open Rook Industries from the Yard Exchange service panel. Read the offered contract, then accept it to start the mining job.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Come see me at Rook Industries and I'll show you what's on the board. The job might be red, might be blue, small haul or a bigger one. Read the contract before you sign.",
        },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractGroup: "rook-resource-run" },
          setFlag: "redContractAccepted",
          delayMs: 1200,
          nextStepId: "mine-red-resources",
        },
      ],
    },
    {
      id: "mine-red-resources",
      objective: "Mine the contracted resources and return to Yard Exchange.",
      tasks: [
        { label: "Mine a resource", flag: "explained-mined-resource" },
        { label: "Collect resource into cargo", flag: "explained-collected-resource" },
        { label: "Deliver and collect payment", flag: "redContractPaid" },
      ],
      helpText:
        "Check the Contract panel for the exact resource type and amount. Turn on Blaster armed in the Miner panel, press Space to fire charges at matching rocks, fly over loose squares to collect cargo, dock at Yard Exchange, choose Deposit Cargo on the contract, then click matching cargo squares.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good. Keep the hub close until you know the neighborhood. Start starboard, east-ish from Yard Exchange. Arm the miner before you start blasting, fire charges into the right color rocks, then fly over the loose squares to scoop them into cargo. Do not collect rocks with the hull. Dock here when the contract count is full. If you need specifics, open Need help below me. If the viewport says Red Teeth, turn around.",
        },
      ],
      transitions: [
        {
          eventType: "contract.paid",
          payloadEquals: { contractGroup: "rook-resource-run" },
          setFlag: "redContractPaid",
          actions: [
            { type: "unlockHubService", siteId: chapterOneRoute.destinationSite.id, serviceId: yardExchangeServices.modworks },
          ],
          nextStepId: "rook-wrap-up",
        },
      ],
    },
    {
      id: "rook-wrap-up",
      objective: "Red resource contract complete.",
      tasks: [
        { label: "Visit Modworks or undock to continue", flag: "rookWrapUpDone" },
      ],
      helpText:
        "Visit Modworks to see what Nara Coil has, or undock to keep exploring.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "That's the stuff. Red comes in, credits go out. I also told Nara Coil at Modworks you might be worth selling to. She's got a tractor field rig if you want to make pickup work less annoying. One more thing — there's an outpost called The Ledge, east-northeast past Red Teeth. Small place, nothing fancy, but it's a fuel stop if you're pushing further out. Worth knowing it's there.",
        },
      ],
      transitions: [
        {
          eventType: "hub.serviceOpened",
          payloadEquals: { serviceId: yardExchangeServices.modworks },
          setFlag: "rookWrapUpDone",
          actions: [{ type: "completeMission" }],
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
