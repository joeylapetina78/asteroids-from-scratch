import { NpcShip } from "../entities/NpcShip.js?v=fresh-20260818-0644-d8d52fb";
import { FIRST_REACH_CARRIERS } from "../content/transportation/firstReachCarriers.js?v=fresh-20260818-0644-d8d52fb";
import { createCommercialCraftPublicIdentity } from "./publicIdentity.js?v=fresh-20260818-0644-d8d52fb";

export const HAULER_PALETTES = Object.freeze(Object.fromEntries(FIRST_REACH_CARRIERS.map((seed) => [seed.institution.id, seed.palette])));
export const RELIEF_HAULER_PALETTE = Object.freeze({ hullStroke: "#a9a0ff", hullFill: "rgba(137, 125, 255, 0.14)", trainStroke: "#d1ccff", trainFill: "rgba(137, 125, 255, 0.18)", linkStroke: "rgba(190, 183, 255, 0.44)" });

// For now, routes are authored from existing world sites. Later this can become
// the same data layer that powers trade lanes, missions, patrols, and piracy.
export function createNpcRouteShips(sites) {
  const hubs = sites.filter((site) => site.type === "hub");

  if (hubs.length < 2) {
    return [];
  }

  const byId = new Map(hubs.map((hub) => [hub.id, hub]));
  return FIRST_REACH_CARRIERS.map((seed) => {
    const home = byId.get(seed.ship.homeSiteId);
    const destination = byId.get(seed.ship.initialDestinationSiteId);
    if (!home || !destination) return null;
    return createRouteShip(seed.ship.physicalId, seed.ship.name, [home, destination], seed.ship.seed, -140,
      seed.controller.name, "scrap-porch", seed.palette,
      createCommercialCraftPublicIdentity({ ship: seed.ship, owner: seed.institution, operator: seed.controller, registeredHubIds: seed.policy.knownDestinationIds, authorizedActivities: ["transport-freight"] }));
  }).filter(Boolean);
}

export function createRouteShip(id, name, route, seed, routeOffset, pilotName = `${name} Operator`, maintenanceSiteId = null, palette = null, publicIdentity = null) {
  const start = route[0].position;
  const next = route[1].position;
  const lane = normalize(next.x - start.x, next.y - start.y);
  const side = { x: -lane.y, y: lane.x };

  return new NpcShip({
    id,
    name,
    route,
    x: start.x + side.x * routeOffset,
    y: start.y + side.y * routeOffset,
    seed,
    laneOffset: routeOffset,
    maintenanceSiteId,
    palette,
    publicIdentity: publicIdentity ?? {
      pilotEntityId: `person:${id}-operator`,
      pilotName,
      pilotLicenseId: `HLC-${String(seed).padStart(3, "0")}-${id.toUpperCase()}`,
      shipVin: `HAUL-${String(seed).padStart(2, "0")}-${id.toUpperCase()}`,
      registeredHubIds: route.filter((site) => site.type === "hub").map((site) => site.id),
      manifestStatus: "routine-cargo",
      transponderStatus: "public",
      ownerInstitutionId: null,
      titleId: null,
      titleStatus: "unknown",
      registrationId: null,
      registrationStatus: "unknown",
      operatingLicenseStatus: "unknown",
    },
  });
}

function normalize(x, y) {
  const length = Math.hypot(x, y) || 1;

  return {
    x: x / length,
    y: y / length,
  };
}
