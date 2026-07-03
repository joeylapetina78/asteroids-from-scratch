export const npcDefinitions = {
  "the-galaxy": {
    id: "the-galaxy",
    name: "The Storm",
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
  nara: {
    id: "nara",
    name: "Nara Coil",
    role: "ship component modification engineer",
    voiceFrequency: 585,
    homeHubIds: ["yard-exchange"],
    organizations: ["Yard Exchange Modworks"],
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
  sal: {
    id: "sal",
    name: "Sal",
    role: "supply counter operator",
    voiceFrequency: 490,
    homeHubIds: ["scrap-porch"],
    organizations: ["Scrap Porch Supply"],
  },
  "tow-truck": {
    id: "tow-truck",
    name: "Tow Truck",
    role: "emergency recovery pilot",
    voiceFrequency: 360,
    homeHubIds: [],
    organizations: ["Independent Tow Runner"],
  },
  murmur: {
    id: "murmur",
    name: "Murmur",
    role: "station drifter and half-credible prophet",
    voiceFrequency: 310,
    homeHubIds: ["yard-exchange"],
    organizations: ["Yard Exchange Back Corridor"],
  },
  cress: {
    id: "cress",
    name: "Cress",
    role: "supply counter operator",
    voiceFrequency: 530,
    homeHubIds: ["the-ledge"],
    organizations: ["The Ledge Supply Shack"],
  },
  dov: {
    id: "dov",
    name: "Dov",
    role: "supply counter operator",
    voiceFrequency: 445,
    homeHubIds: ["ore-station-one"],
    organizations: ["Ore Station One Industrial Supply"],
  },
  pella: {
    id: "pella",
    name: "Pella",
    role: "supply counter operator",
    voiceFrequency: 570,
    homeHubIds: ["coldwater-depot"],
    organizations: ["Coldwater Depot Supply"],
  },
  taske: {
    id: "taske",
    name: "Dr. Taske",
    role: "supply counter operator",
    voiceFrequency: 620,
    homeHubIds: ["deep-research"],
    organizations: ["Deep Research Outpost"],
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
