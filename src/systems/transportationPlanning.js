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

// The furthest a hull of this class can be sent and still come back to service.
// A route longer than this is not expensive, it is impossible.
export function maximumServiceableDistance(policy = {}) {
  const wearPerDistance = policy.expectedWearPerDistance ?? 0;
  if (!(wearPerDistance > 0)) return Infinity;
  return ((policy.maximumWear ?? Infinity) - (policy.minimumReturnMargin ?? 0)) / wearPerDistance;
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
  const budget = maximumWear - minimumReturnMargin;
  if (projectedWear > budget) {
    // Two very different refusals used to share one name, and the difference is
    // the difference between "later" and "never":
    //
    //   maintenance-policy   this SHIP is too worn for this trip right now.
    //                        Service it and the same run becomes legal.
    //   beyond-fleet-range   this ROUTE cannot be survived by a fresh hull of
    //                        this class at all. No amount of servicing helps;
    //                        it needs a different craft or a service stop
    //                        somewhere along the way.
    //
    // Reported separately because a world can sit for hours emitting hundreds of
    // the second kind while every reader assumes it is seeing the first. First
    // Reach ships a fleet whose budget is 31,875 units of round trip against an
    // outer lane of 37,473, so its frontier is unreachable rather than expensive.
    const reason = tripWear + returnWear > budget ? "beyond-fleet-range" : "maintenance-policy";
    return {
      eligible: false,
      reason,
      score: -Infinity,
      route,
      projectedWear,
      maintenance,
      tripWear,
      returnWear,
      budget,
      // How far this class of hull could actually serve, for the reader who has
      // to decide whether to buy a different ship or move the destination.
      serviceableDistance: wearPerDistance > 0 ? budget / wearPerDistance : Infinity,
    };
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
import { createTransportCorridors, expandTransportationPath } from "./transportCorridors.js?v=fresh-20260821-2344-8ca142c4";
