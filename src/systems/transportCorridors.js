export function createTransportCorridors({ destinations = [], connections = [] } = {}) {
  const destinationById = new Map(destinations.map((destination) => [destination.id, destination]));
  return connections.flatMap((connection) => {
    if (!connection.corridor) return [];
    const from = destinationById.get(connection.fromId);
    const to = destinationById.get(connection.toId);
    if (!from?.position || !to?.position) return [];
    return [createCorridor(connection, from, to)];
  });
}

export function expandTransportationPath(path, destinations, connections, corridors) {
  if (!Array.isArray(path) || path.length < 2) return [];
  const destinationById = destinations instanceof Map ? destinations : new Map(Object.values(destinations).map((destination) => [destination.id, destination]));
  const corridorByConnectionId = new Map(corridors.map((corridor) => [corridor.connectionId, corridor]));
  const result = [destinationById.get(path[0])];
  for (let index = 1; index < path.length; index += 1) {
    const fromId = path[index - 1];
    const toId = path[index];
    const connection = connections.find((candidate) => (candidate.fromId === fromId && candidate.toId === toId) || (candidate.bidirectional !== false && candidate.fromId === toId && candidate.toId === fromId));
    const corridor = corridorByConnectionId.get(connection?.id);
    if (corridor) {
      const forward = connection.fromId === fromId;
      const samples = forward ? corridor.waypoints : [...corridor.waypoints].reverse();
      result.push(...samples.map((waypoint, waypointIndex) => ({
        id: `corridor-waypoint:${corridor.id}:${forward ? waypointIndex : samples.length - 1 - waypointIndex}`,
        name: corridor.name,
        type: "corridor-waypoint",
        corridorId: corridor.id,
        position: waypoint,
        interactionRadius: 80,
      })));
    }
    result.push(destinationById.get(toId));
  }
  return result.filter(Boolean);
}

export function getCorridorClearance(position, bodyRadius, corridors = []) {
  for (const corridor of corridors) {
    const nearest = nearestPointOnPolyline(position, corridor.samples);
    const endpointFactor = Math.min(nearest.progress, 1 - nearest.progress) / 0.12;
    const width = mix(corridor.endpointWidth, corridor.width, Math.min(1, endpointFactor));
    if (nearest.distance <= width * 0.5 + bodyRadius) return { corridor, width, nearest };
  }
  return null;
}

export function applyCorridorMaintenance(asteroid, corridors, deltaSeconds) {
  const clearance = getCorridorClearance(asteroid.position, 0, corridors);
  if (!clearance || clearance.nearest.distance >= clearance.width * 0.5) return false;
  const tangent = clearance.nearest.tangent;
  const relative = { x: asteroid.position.x - clearance.nearest.point.x, y: asteroid.position.y - clearance.nearest.point.y };
  let side = Math.sign(tangent.x * relative.y - tangent.y * relative.x);
  if (side === 0) side = Math.sin(asteroid.origin.x * 0.017 + asteroid.origin.y * 0.011) < 0 ? -1 : 1;
  const normal = { x: -tangent.y * side, y: tangent.x * side };
  const halfWidth = clearance.width * 0.5;
  const centerPressure = 1 - clearance.nearest.distance / Math.max(1, halfWidth);
  const push = 4 + centerPressure * 8;
  asteroid.velocity.x += normal.x * push * deltaSeconds;
  asteroid.velocity.y += normal.y * push * deltaSeconds;
  const targetDistance = halfWidth + asteroid.radius + 28;
  const originRelative = { x: asteroid.origin.x - clearance.nearest.point.x, y: asteroid.origin.y - clearance.nearest.point.y };
  const originDistance = originRelative.x * normal.x + originRelative.y * normal.y;
  const anchorShift = Math.min(Math.max(0, targetDistance - originDistance), 11 * deltaSeconds);
  asteroid.origin.x += normal.x * anchorShift;
  asteroid.origin.y += normal.y * anchorShift;
  return true;
}

function createCorridor(connection, from, to) {
  const config = connection.corridor;
  const dx = to.position.x - from.position.x;
  const dy = to.position.y - from.position.y;
  const length = Math.hypot(dx, dy);
  const normal = { x: -dy / length, y: dx / length };
  const random = seededRandom(config.seed ?? 1);
  const bend = length * (config.curvature ?? 0.12) * (random() < 0.5 ? -1 : 1);
  const secondary = length * (config.secondaryCurvature ?? 0.045) * (random() * 2 - 1);
  const variationPhase = random() * Math.PI * 2;
  const sampleCount = Math.max(24, Math.ceil(length / (config.sampleSpacing ?? 180)));
  const samples = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const t = index / sampleCount;
    const authoredPoint = config.coursePoints ? sampleCourseProfile(config.coursePoints, t) : null;
    const authoredLateral = authoredPoint ? authoredPoint.lateral * length : null;
    const naturalVariation = Math.sin(Math.PI * t) * Math.sin(Math.PI * 7 * t + variationPhase) * (config.naturalVariation ?? 0);
    const baseLateral = authoredLateral ?? (Math.sin(Math.PI * t) * bend + Math.sin(Math.PI * 2 * t) * Math.sin(Math.PI * t) * secondary);
    const lateral = baseLateral + naturalVariation;
    const along = authoredPoint?.along ?? t;
    return { x: mix(from.position.x, to.position.x, along) + normal.x * lateral, y: mix(from.position.y, to.position.y, along) + normal.y * lateral };
  });
  const waypoints = samplePolylineByDistance(samples, config.waypointSpacing ?? 520);
  const courseLength = polylineLength(samples);
  const id = config.id ?? `corridor:${connection.id}`;
  return { id, connectionId: connection.id, name: config.name ?? `${from.name}–${to.name} Freight Corridor`, fromId: from.id, toId: to.id, width: config.width ?? 480, endpointWidth: config.endpointWidth ?? 720, shoulderDensity: config.shoulderDensity ?? 0, outerShoulderDensity: config.outerShoulderDensity ?? 0, slipstreamSpeedMultiplier: config.slipstreamSpeedMultiplier ?? 1, slipstreamThrustMultiplier: config.slipstreamThrustMultiplier ?? 1, boostPatches: createBoostPatches(id, samples, config.boostPatchProgress ?? []), seed: config.seed ?? 1, samples, waypoints, length: courseLength, directLength: length };
}

function createBoostPatches(corridorId, samples, progressValues) {
  return progressValues.map((progress, index) => {
    const sampleIndex = Math.max(1, Math.min(samples.length - 2, Math.round(progress * (samples.length - 1))));
    const previous = samples[sampleIndex - 1];
    const next = samples[sampleIndex + 1];
    const tangentLength = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
    return { id: `${corridorId}:boost:${index}`, progress, position: { ...samples[sampleIndex] }, tangent: { x: (next.x - previous.x) / tangentLength, y: (next.y - previous.y) / tangentLength }, radius: 72 };
  });
}

function sampleCourseProfile(points, progress) {
  const segmentIndex = Math.max(0, Math.min(points.length - 2, points.findIndex((point) => point.progress >= progress) - 1));
  const first = points[Math.max(0, segmentIndex - 1)];
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  const last = points[Math.min(points.length - 1, segmentIndex + 2)];
  const amount = (progress - start.progress) / Math.max(0.0001, end.progress - start.progress);
  return {
    along: catmullRom(first.along ?? first.progress, start.along ?? start.progress, end.along ?? end.progress, last.along ?? last.progress, amount),
    lateral: catmullRom(first.lateral, start.lateral, end.lateral, last.lateral, amount),
  };
}

function samplePolylineByDistance(samples, spacing) {
  const waypoints = [];
  let distanceSinceWaypoint = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const segmentLength = Math.hypot(samples[index].x - samples[index - 1].x, samples[index].y - samples[index - 1].y);
    distanceSinceWaypoint += segmentLength;
    if (distanceSinceWaypoint >= spacing && index < samples.length - 1) {
      waypoints.push(samples[index]);
      distanceSinceWaypoint = 0;
    }
  }
  return waypoints;
}

function polylineLength(samples) {
  return samples.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - samples[index].x, point.y - samples[index].y), 0);
}

function catmullRom(first, start, end, last, amount) {
  const amountSquared = amount * amount;
  const amountCubed = amountSquared * amount;
  return 0.5 * ((2 * start) + (-first + end) * amount + (2 * first - 5 * start + 4 * end - last) * amountSquared + (-first + 3 * start - 3 * end + last) * amountCubed);
}

function nearestPointOnPolyline(point, samples) {
  let best = { distance: Infinity, progress: 0, point: samples[0] };
  for (let index = 1; index < samples.length; index += 1) {
    const start = samples[index - 1];
    const end = samples[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const projected = { x: start.x + dx * t, y: start.y + dy * t };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance < best.distance) {
      const segmentLength = Math.hypot(dx, dy) || 1;
      best = { distance, progress: (index - 1 + t) / (samples.length - 1), point: projected, tangent: { x: dx / segmentLength, y: dy / segmentLength } };
    }
  }
  return best;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

function mix(first, second, amount) { return first + (second - first) * amount; }
