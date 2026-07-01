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
          requiresCondition: ({ event }) => event.payload.contractGroup === "rook-resource-run",
          nextStepId: "mine-red-resources",
        },
      ],
    },
    {
      id: "mine-red-resources",
      objective: "Mine the contracted resources and return to Yard Exchange.",
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
      considerations: [
        {
          id: "near-rock-warning",
          eventType: "ship.nearObject",
          payloadEquals: { targetType: "asteroid" },
          repeatable: true,
          cooldownMs: 14000,
          responses: [
            {
              speaker: "Rook",
              text:
                "Easy on the hull. You mine with charges, not by wearing the rock as a hat. If you're unsure of the steps, check Need help below.",
            },
            {
              speaker: "Rook",
              text:
                "Too close to the rocks. Arm the miner, use Space to cut them, then fly over the loose squares. Hull-first mining is just crashing.",
            },
            {
              speaker: "Rook",
              text:
                "If you're trying to mine, shoot the rock. If you're trying to make Finley rich on repairs, keep doing that.",
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
                "Good, that's cargo now. Bring the contracted units back to Yard Exchange, dock, then deposit them into the contract.",
            },
          ],
        },
        {
          id: "low-fuel-warning",
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
          repeatable: true,
          cooldownMs: 45000,
          responses: [
            {
              speaker: "Yard Exchange Dispatch",
              text:
                "We show you out of fuel and drifting. A tow driver should be calling through your communicator. Accept the tow if you want a runner to haul you back to the nearest hub. It'll hurt the account, but it beats floating.",
            },
            {
              speaker: "Rook",
              text:
                "Stranded again? Listen, every tow is money you now have to earn back. Take the ride if you need it, then stay closer to the hub.",
            },
          ],
        },
        {
          id: "tow-attached",
          eventType: "tow.attached",
          allowWhileControlLocked: true,
          once: true,
          setFlag: "heard-tow-attached",
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text:
                "Tow runner has us. Hands off the controls and let the driver work. When we're back on the tether, refuel before you try another run.",
            },
          ],
        },
        {
          id: "tow-complete",
          eventType: "ship.towed",
          once: true,
          setFlag: "heard-tow-complete",
          actions: [
            {
              type: "say",
              speaker: "Rook",
              text:
                "We're back at a hub. Good news: you're not floating. Bad news: that tow is another bill. Refuel, check the contract, and keep the next run shorter.",
            },
          ],
        },
      ],
      transitions: [
        {
          eventType: "contract.paid",
          requiresCondition: ({ event }) => event.payload.contractGroup === "rook-resource-run",
          actions: [
            { type: "completeMission" },
          ],
        },
      ],
    },
  ],
};
