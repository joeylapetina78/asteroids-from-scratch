import { storySites, yardExchangeServices } from "../content/storyWorld.js?v=fresh-20260703-2158-e64ecf8";

export const WORLD_SITES = [
  // ── STORY HUBS ───────────────────────────────────────────────────────────────
  // These are the Chapter 1 anchor points. Positions are story-fixed.
  {
    id: storySites.starterHub.id,
    name: storySites.starterHub.name,
    beaconId: "beacon-yard-exchange",
    type: "hub",
    position: { x: 380, y: -180 },
    radius: 58,
    interactionRadius: 230,
    capabilities: ["repair"],
    services: [
      yardExchangeServices.rook,
      yardExchangeServices.shipyard,
      yardExchangeServices.finance,
      yardExchangeServices.supply,
      yardExchangeServices.modworks,
      yardExchangeServices.roadmap,
    ],
  },
  {
    id: storySites.originHub.id,
    name: storySites.originHub.name,
    beaconId: "beacon-scrap-porch",
    type: "hub",
    position: { x: -1180, y: 860 },
    radius: 46,
    interactionRadius: 190,
    capabilities: ["repair"],
    services: ["scrap-porch-supply"],
  },

  // ── INNER BELT OUTPOST ───────────────────────────────────────────────────────
  // Positioned past Red Teeth on the way to Ore Ridge. Reachable in the starter
  // ship — first hub the player can discover on their own.
  {
    id: "the-ledge",
    name: "The Ledge",
    beaconId: "beacon-the-ledge",
    type: "hub",
    position: { x: 7000, y: -4500 },
    radius: 42,
    interactionRadius: 180,
    capabilities: ["repair"],
    services: [],
  },

  // ── OUTER HUBS ───────────────────────────────────────────────────────────────
  // These require a faster ship or serious fuel planning to reach.
  {
    id: "ore-station-one",
    name: "Ore Station One",
    beaconId: "beacon-ore-station-one",
    type: "hub",
    position: { x: 40000, y: -24000 },
    radius: 52,
    interactionRadius: 210,
    capabilities: ["repair"],
    services: [],
  },
  {
    id: "coldwater-depot",
    name: "Coldwater Depot",
    beaconId: "beacon-coldwater-depot",
    type: "hub",
    position: { x: 70000, y: 46000 },
    radius: 44,
    interactionRadius: 185,
    capabilities: ["repair"],
    services: [],
  },
  {
    id: "deep-research",
    name: "Deep Research",
    beaconId: "beacon-deep-research",
    type: "hub",
    position: { x: -72000, y: 53000 },
    radius: 38,
    interactionRadius: 175,
    capabilities: ["repair"],
    services: [],
  },
];

export function getWorldSites() {
  return WORLD_SITES;
}

export function getNearbyWorldSite(position, sites = WORLD_SITES) {
  return sites
    .map((site) => ({
      site,
      distance: getDistance(position, site.position),
    }))
    .filter(({ site, distance }) => distance <= site.interactionRadius)
    .sort((first, second) => first.distance - second.distance)[0] ?? null;
}

export function getNearestWorldSite(position, sites = WORLD_SITES) {
  return sites
    .map((site) => ({
      site,
      distance: getDistance(position, site.position),
    }))
    .sort((first, second) => first.distance - second.distance)[0] ?? null;
}

export function isInSiteRange(position, site) {
  return getDistance(position, site.position) <= site.interactionRadius;
}

function getDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
