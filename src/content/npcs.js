export const npcDefinitions = {
  "the-galaxy": {
    id: "the-galaxy",
    name: "The Galaxy",
    role: "opening narrator",
    voiceFrequency: 620,
    homeHubIds: [],
    organizations: [],
  },
  rook: {
    id: "rook",
    name: "Rook",
    role: "mission handler and resource contractor",
    voiceFrequency: 470,
    homeHubIds: ["yard-exchange"],
    organizations: ["Rook Industries"],
  },
  barvis: {
    id: "barvis",
    name: "Barvis",
    role: "shipyard salesman",
    voiceFrequency: 540,
    homeHubIds: ["yard-exchange"],
    organizations: ["Yard Exchange Shipyard"],
  },
  mako: {
    id: "mako",
    name: "Mr. Mako",
    role: "finance officer",
    voiceFrequency: 420,
    homeHubIds: ["yard-exchange"],
    organizations: ["Yard Exchange Finance Office"],
  },
  finley: {
    id: "finley",
    name: "Finley",
    role: "supply counter operator",
    voiceFrequency: 500,
    homeHubIds: ["yard-exchange"],
    organizations: ["Yard Exchange Supply"],
  },
  "yard-dispatch": {
    id: "yard-dispatch",
    name: "Yard Exchange Dispatch",
    role: "hub traffic control",
    voiceFrequency: 700,
    homeHubIds: ["yard-exchange"],
    organizations: ["Yard Exchange"],
  },
  "porch-dispatch": {
    id: "porch-dispatch",
    name: "Scrap Porch Dispatch",
    role: "hub traffic control",
    voiceFrequency: 700,
    homeHubIds: ["scrap-porch"],
    organizations: ["Scrap Porch"],
  },
};

const npcsByDisplayName = new Map(
  Object.values(npcDefinitions).map((npc) => [npc.name.toLowerCase(), npc])
);

export function getNpc(npcId) {
  return npcDefinitions[npcId] ?? null;
}

export function getNpcByIdOrName(npcIdOrName) {
  if (!npcIdOrName) {
    return null;
  }

  return getNpc(npcIdOrName) ?? npcsByDisplayName.get(String(npcIdOrName).toLowerCase()) ?? null;
}

export function getNpcName(npcId, fallback = "Unknown Contact") {
  return getNpc(npcId)?.name ?? fallback;
}

export function getNpcVoiceFrequency(npcIdOrName, fallback = 470) {
  return getNpcByIdOrName(npcIdOrName)?.voiceFrequency ?? fallback;
}
