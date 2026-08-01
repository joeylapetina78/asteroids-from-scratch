import { NpcShip } from "../entities/NpcShip.js?v=fresh-20260801-1117-855d6c2";

// For now, routes are authored from existing world sites. Later this can become
// the same data layer that powers trade lanes, missions, patrols, and piracy.
export function createNpcRouteShips(sites) {
  const hubs = sites.filter((site) => site.type === "hub");

  if (hubs.length < 2) {
    return [];
  }

  const firstRoute = [hubs[0], hubs[1]];
  const secondRoute = [hubs[1], hubs[0]];

  return [
    createRouteShip("hauler-yard-scrap", "Yard Hauler", firstRoute, 1, -140, "Yard Hauler Operator", hubs[1].id),
    createRouteShip("hauler-scrap-yard", "Porch Runner Two", secondRoute, 2, -140, "Mara Venn", hubs[1].id),
  ];
}

export function createRouteShip(id, name, route, seed, routeOffset, pilotName = `${name} Operator`, maintenanceSiteId = null) {
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
    publicIdentity: {
      pilotEntityId: `person:${id}-operator`,
      pilotName,
      pilotLicenseId: `HLC-${String(seed).padStart(3, "0")}-${id.toUpperCase()}`,
      shipVin: `HAUL-${String(seed).padStart(2, "0")}-${id.toUpperCase()}`,
      registeredHubIds: route.filter((site) => site.type === "hub").map((site) => site.id),
      manifestStatus: "routine-cargo",
      transponderStatus: "public",
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
