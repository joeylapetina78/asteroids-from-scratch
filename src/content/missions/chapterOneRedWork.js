export const chapterOneRedWorkMission = {
  id: "chapter-1-red-work",
  prologue: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
    speaker: "Rook",
    text:
      "Hey, you ended up with our baby. Good for you. I hope it serves you well in the days to come. To get you started, head starboard, east-ish from Yard Exchange, and find some resources. Mine red rocks and bring me back 5 red resources. Drive over the loose red squares to scoop them into cargo, but don't drive the ship into rocks. That's called crashing, not mining. Try to stay close to the hub if you can. If you hit Red Teeth, you've gone too far; there's stuff out there that'll tear you up.",
    title: "First Red Run",
    objective: "Take Rook's first mining contract.",
    actionLabel: "Talk Contract",
    helpText:
      "Rook wants 5 red resources delivered to Yard Exchange. Red resources are the red square pickups that come from breaking red rocks.",
  },
  activeChapter: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
  },
  title: "First Red Run",
  successCriteria: "Deliver 5 red resources to Yard Exchange.",
  completion: {
    speaker: "Rook",
    objective: "Red resource contract complete.",
    helpText:
      "The first red run is complete. Rook can offer more repeatable resource work from here.",
    line:
      "That's the stuff. Red comes in, credits go out. Bring me another batch whenever you're ready for more work.",
  },
  startStepId: "offer-red-contract",
  steps: [
    {
      id: "offer-red-contract",
      objective: "Review Rook's red resource contract.",
      helpText:
        "Open the Contract panel and accept Rook's Red Resource Run when you're ready. It pays 100 credits per red resource for 5 red resources.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Let's put a contract together. Five red resources, delivered here to Yard Exchange, one hundred credits each. Simple work, honest enough.",
          acknowledgement: { label: "Read Contract" },
        },
      ],
      onAcknowledge: [
        { type: "clearMessage" },
        { type: "offerContract", contractId: "rook-red-resource-run" },
      ],
      transitions: [
        {
          eventType: "contract.accepted",
          payloadEquals: { contractId: "rook-red-resource-run" },
          nextStepId: "mine-red-resources",
        },
      ],
    },
    {
      id: "mine-red-resources",
      objective: "Mine 5 red resources and return to Yard Exchange.",
      helpText:
        "Break red rocks with the miner, then fly over the loose red resource squares to collect them into cargo. Do not ram asteroids with your ship. Dock at Yard Exchange with at least 5 red resources. Head starboard/east from Yard Exchange, but turn back if you reach Red Teeth.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good. Keep the hub close until you know the neighborhood. Start starboard, east-ish from Yard Exchange. Arm the miner before you start blasting, fire charges into red rocks, then fly over the loose red squares to scoop them into cargo. Do not collect rocks with the hull. Dock here when you've got five. If you need specifics, open Need help below me. If the viewport says Red Teeth, turn around.",
        },
      ],
      considerations: [
        {
          id: "near-rock-warning",
          eventType: "ship.nearObject",
          payloadEquals: { targetType: "asteroid" },
          once: true,
          setFlag: "warned-near-rock",
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text:
                "Easy on the hull. You mine with charges, not by wearing the rock as a hat. If you're unsure of the steps, check Need help below.",
            },
          ],
        },
        {
          id: "first-red-mined",
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
          eventType: "resource.collected",
          payloadEquals: { resourceType: "fuel" },
          once: true,
          setFlag: "explained-collected-resource",
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text:
                "Good, that's cargo now. Bring five red units back to Yard Exchange, dock, then deposit them into the contract.",
            },
          ],
        },
        {
          id: "low-fuel-warning",
          eventType: "ship.lowFuel",
          once: true,
          setFlag: "warned-low-fuel",
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text:
                "Fuel's halfway gone, rookie. Scan again if you've got the power and keep Yard Exchange in mind. Docking at any hub refuels you free. Running dry means a tow someday, and a tow means debt.",
            },
          ],
        },
        {
          id: "arm-miner-reminder",
          eventType: "weapon.unarmedAttempt",
          once: true,
          setFlag: "warned-arm-miner",
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text:
                "You're squeezing the trigger with the miner safed, rookie. Flip Blaster armed on the Miner panel, then space will cut rock.",
            },
          ],
        },
        {
          id: "red-teeth-warning",
          eventType: "zone.entered",
          payloadEquals: { zoneId: "red-teeth" },
          once: true,
          setFlag: "warned-red-teeth",
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
          id: "stranded-dispatch",
          eventType: "ship.stranded",
          once: true,
          setFlag: "heard-stranded-dispatch",
          actions: [
            {
              type: "say",
              speaker: "Yard Exchange Dispatch",
              text:
                "We show you out of fuel and drifting. We can send a tow runner later, once the paperwork and debt hooks exist. For now, conserve fuel close to the hub and use red resources carefully.",
            },
          ],
        },
      ],
      transitions: [
        {
          eventType: "contract.paid",
          payloadEquals: { contractId: "rook-red-resource-run" },
          actions: [
            { type: "unlockHubService", siteId: "yard-exchange", serviceId: "yard-supply" },
            { type: "completeMission" },
          ],
        },
      ],
    },
  ],
};
