import { storySites, yardExchangeServices } from "../content/storyWorld.js?v=world-refs-v1";

export const WORLD_SITES = [
  {
    id: storySites.starterHub.id,
    name: storySites.starterHub.name,
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
    type: "hub",
    position: { x: -1180, y: 860 },
    radius: 46,
    interactionRadius: 190,
    capabilities: ["repair"],
    services: ["scrap-porch-supply"],
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
