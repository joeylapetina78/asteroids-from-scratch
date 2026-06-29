export const chapterOneRedWorkMission = {
  id: "chapter-1-red-work",
  prologue: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
    speaker: "Rook",
    text:
      "Hey, you ended up with our baby. Good for you. I hope it serves you well in the days to come. To get you started, head starboard, east-ish from Yard Exchange, and find some resources. Mine red rocks and bring me back 10 red resources. Try to stay close to the hub if you can. If you hit Red Teeth, you've gone too far; there's stuff out there that'll tear you up.",
    title: "First Red Run",
    objective: "Take Rook's first mining contract.",
    actionLabel: "Talk Contract",
    helpText:
      "Rook wants 10 red resources delivered to Yard Exchange. Red resources are the red square pickups that come from breaking red rocks.",
  },
  activeChapter: {
    chapterId: "chapter-1",
    chapterName: "Chapter 1",
    episodeName: "Starting Out",
  },
  title: "First Red Run",
  successCriteria: "Deliver 10 red resources to Yard Exchange.",
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
        "Open the Contract panel and accept Rook's Red Resource Run when you're ready. It pays 100 credits per red resource for 10 red resources.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Let's put a contract together. Ten red resources, delivered here to Yard Exchange, one hundred credits each. Simple work, honest enough.",
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
      objective: "Mine 10 red resources and return to Yard Exchange.",
      helpText:
        "Break red rocks with the miner, collect the red square resources into your cargo hold, then dock at Yard Exchange with at least 10 red resources. Head starboard/east from Yard Exchange, but turn back if you reach Red Teeth.",
      onEnter: [
        {
          type: "say",
          speaker: "Rook",
          text:
            "Good. Keep the hub close until you know the neighborhood. Start starboard, east-ish from Yard Exchange. Arm the miner before you start blasting, mine red rocks, scoop the red squares into cargo, and dock here when you've got ten. If the viewport says Red Teeth, turn around.",
        },
      ],
      considerations: [
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
              type: "say",
              speaker: "Rook",
              text:
                "That's Red Teeth, rookie. Too far for this run. Turn us around, get back toward Yard Exchange, and find red rock closer to home.",
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
          actions: [{ type: "completeMission" }],
        },
      ],
    },
  ],
};
