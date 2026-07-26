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
    const authoredLateral = config.coursePoints ? sampleCourseProfile(config.coursePoints, t) * length : null;
    const naturalVariation = Math.sin(Math.PI * t) * Math.sin(Math.PI * 7 * t + variationPhase) * (config.naturalVariation ?? 0);
    const baseLateral = authoredLateral ?? (Math.sin(Math.PI * t) * bend + Math.sin(Math.PI * 2 * t) * Math.sin(Math.PI * t) * secondary);
    const lateral = baseLateral + naturalVariation;
    return { x: mix(from.position.x, to.position.x, t) + normal.x * lateral, y: mix(from.position.y, to.position.y, t) + normal.y * lateral };
  });
  const waypoints = samplePolylineByDistance(samples, config.waypointSpacing ?? 520);
  const courseLength = polylineLength(samples);
  return { id: config.id ?? `corridor:${connection.id}`, connectionId: connection.id, name: config.name ?? `${from.name}–${to.name} Freight Corridor`, fromId: from.id, toId: to.id, width: config.width ?? 480, endpointWidth: config.endpointWidth ?? 720, samples, waypoints, length: courseLength, directLength: length };
}

function sampleCourseProfile(points, progress) {
  const segmentIndex = Math.max(0, Math.min(points.length - 2, points.findIndex((point) => point.progress >= progress) - 1));
  const first = points[Math.max(0, segmentIndex - 1)];
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  const last = points[Math.min(points.length - 1, segmentIndex + 2)];
  const amount = (progress - start.progress) / Math.max(0.0001, end.progress - start.progress);
  return catmullRom(first.lateral, start.lateral, end.lateral, last.lateral, amount);
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
    if (distance < best.distance) best = { distance, progress: (index - 1 + t) / (samples.length - 1), point: projected };
  }
  return best;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

function mix(first, second, amount) { return first + (second - first) * amount; }
