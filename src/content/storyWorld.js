export const storySites = {
  originHub: {
    id: "scrap-porch",
    name: "Scrap Porch",
  },
  starterHub: {
    id: "yard-exchange",
    name: "Yard Exchange",
  },
};

export const storyZones = {
  starterRoute: {
    id: "starter-drift",
    name: "Starter Drift",
  },
  dangerBoundary: {
    id: "red-teeth",
    name: "Red Teeth",
  },
};

export const storyRegions = {
  starterRegion: {
    id: "first-reach",
    name: "First Reach",
  },
  deepSpace: {
    id: "the-black",
    name: "The Black",
  },
};

export const yardExchangeServices = {
  rook: "rook-industries",
  shipyard: "yard-shipyard",
  finance: "yard-finance",
  supply: "yard-supply",
  modworks: "yard-modworks",
  roadmap: "yard-murmur-roadmap",
  travelAuthority: "yard-travel-authority",
};

export const chapterOneRoute = {
  startSite: storySites.originHub,
  destinationSite: storySites.starterHub,
  starterZone: storyZones.starterRoute,
  dangerZone: storyZones.dangerBoundary,
};
