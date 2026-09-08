import { facilityOffset } from "./hubLayout.js?v=fresh-20260908-1855-2f42a441";

// Industrial fixtures are scenery with real footprints. They do not damage an
// NPC on contact, but commercial pilots should still treat them as occupied
// space. These circles include maneuvering room for a hauler's cargo train.
const SHIPYARD_CLEARANCE = 92;
const FACTORY_CLEARANCE = 62;
const SERVICE_CLEARANCE = 58;

export function infrastructureNavigationObstacles(state, sites) {
  const siteById = new Map((sites ?? []).map((site) => [site.id, site]));
  const obstacles = [];

  Object.values(state.logistics?.institutions ?? {})
    .filter((institution) => institution?.archetypeId === "shipyard")
    .forEach((yard) => {
      const site = siteById.get(yard.siteId);
      if (site) obstacles.push(atFacility(site, facilityOffset("shipyard", 0), SHIPYARD_CLEARANCE, `infrastructure:${yard.id}`));
    });

  const factoryOrdinals = new Map();
  Object.values(state.industrial?.factories ?? {}).forEach((factory) => {
    const siteId = state.logistics?.institutions?.[factory.institutionId]?.siteId ?? factory.institutionId;
    const site = siteById.get(siteId);
    if (!site) return;
    const ordinal = factoryOrdinals.get(siteId) ?? 0;
    factoryOrdinals.set(siteId, ordinal + 1);
    obstacles.push(atFacility(site, facilityOffset("parts-factory", ordinal), FACTORY_CLEARANCE, `infrastructure:${factory.id}`));
  });

  // Scrap Porch's original facilities predate the radial layout, so their
  // navigation footprints deliberately mirror their drawn local offsets.
  const porch = siteById.get("scrap-porch");
  if (porch && state.sprc?.facilities) {
    if (state.sprc.facilities.maw) obstacles.push(atFacility(porch, { x: -72, y: 28 }, SERVICE_CLEARANCE, "infrastructure:sprc-maw"));
    if (state.sprc.facilities.berthTwo) obstacles.push(atFacility(porch, { x: 72, y: 28 }, SERVICE_CLEARANCE, "infrastructure:sprc-berth-two"));
  }

  return obstacles;
}

function atFacility(site, offset, radius, id) {
  return {
    id,
    type: "infrastructure-obstacle",
    position: { x: site.position.x + offset.x, y: site.position.y + offset.y },
    radius,
  };
}
