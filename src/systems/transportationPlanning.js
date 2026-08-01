export function createTransportationNetwork({ destinations = [], connections = [] } = {}) {
  return {
    destinations: Object.fromEntries(destinations.map((destination) => [destination.id, destination])),
    connections: connections.map((connection) => ({ ...connection })),
  };
}

export function findTransportationRoute(network, originId, destinationId, knownDestinationIds = null) {
  if (!network?.destinations?.[originId] || !network.destinations[destinationId]) return null;
  const known = knownDestinationIds ? new Set(knownDestinationIds) : null;
  if (known && (!known.has(originId) || !known.has(destinationId))) return null;
  const frontier = [{ destinationId: originId, distance: 0, path: [originId] }];
  const bestDistance = new Map([[originId, 0]]);
  while (frontier.length > 0) {
    frontier.sort((a, b) => a.distance - b.distance);
    const current = frontier.shift();
    if (current.destinationId === destinationId) return current;
    network.connections.forEach((connection) => {
      const nextId = connection.fromId === current.destinationId
        ? connection.toId
        : connection.bidirectional !== false && connection.toId === current.destinationId
          ? connection.fromId
          : null;
      if (!nextId || (known && !known.has(nextId))) return;
      const nextDistance = current.distance + connection.distance;
      if (nextDistance >= (bestDistance.get(nextId) ?? Infinity)) return;
      bestDistance.set(nextId, nextDistance);
      frontier.push({ destinationId: nextId, distance: nextDistance, path: [...current.path, nextId] });
    });
  }
  return null;
}

export function buildPhysicalTransportationRoute(network, route) {
  if (!route?.path) return [];
  const destinations = Object.values(network.destinations);
  const corridors = createTransportCorridors({ destinations, connections: network.connections });
  return expandTransportationPath(route.path, network.destinations, network.connections, corridors);
}

export function evaluateTransportPlan({ network, originId, destinationId, payment = 0, currentWear = 0, policy = {}, repairOptions = [] }) {
  const route = findTransportationRoute(network, originId, destinationId, policy.knownDestinationIds);
  if (!route) return { eligible: false, reason: "destination-unreachable", score: -Infinity };
  const wearPerDistance = policy.expectedWearPerDistance ?? 0;
  const tripWear = route.distance * wearPerDistance;
  const repairRoutes = repairOptions
    .map((option) => ({ option, route: findTransportationRoute(network, destinationId, option.destinationId, policy.knownDestinationIds) }))
    .filter((entry) => entry.route)
    .sort((a, b) => (a.option.priority ?? 0) - (b.option.priority ?? 0) || a.route.distance - b.route.distance);
  if (repairRoutes.length === 0) return { eligible: false, reason: "no-reachable-maintenance", score: -Infinity, route };
  const maintenance = repairRoutes[0];
  const returnWear = maintenance.route.distance * wearPerDistance;
  const projectedWear = currentWear + tripWear + returnWear;
  const maximumWear = policy.maximumWear ?? Infinity;
  const minimumReturnMargin = policy.minimumReturnMargin ?? 0;
  if (projectedWear > maximumWear - minimumReturnMargin) {
    return { eligible: false, reason: "maintenance-policy", score: -Infinity, route, projectedWear, maintenance };
  }
  const distanceCost = route.distance * (policy.operatingCostPerDistance ?? 0);
  return {
    eligible: true,
    reason: "eligible",
    route,
    maintenance,
    projectedWear,
    score: payment - distanceCost - projectedWear * (policy.wearPenalty ?? 0),
  };
}
import { createTransportCorridors, expandTransportationPath } from "./transportCorridors.js?v=fresh-20260801-1152-2b2fe1f";
