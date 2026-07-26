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
  const push = 4.1 + centerPressure * 8;
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
  const coursePoints = config.coursePoints ?? generateCourseProfile(config.generator, config.seed ?? 1, length, config.sampleSpacing ?? 180);
  const variationPhase = random() * Math.PI * 2;
  const sampleCount = Math.max(24, Math.ceil(length / (config.sampleSpacing ?? 180)));
  const samples = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const t = index / sampleCount;
    const authoredPoint = sampleCourseProfile(coursePoints, t);
    const authoredLateral = authoredPoint.lateral * length;
    const naturalVariation = Math.sin(Math.PI * t) * Math.sin(Math.PI * 7 * t + variationPhase) * (config.naturalVariation ?? 0);
    const lateral = authoredLateral + naturalVariation;
    const along = authoredPoint.along;
    return { x: mix(from.position.x, to.position.x, along) + normal.x * lateral, y: mix(from.position.y, to.position.y, along) + normal.y * lateral };
  });
  const waypoints = samplePolylineByDistance(samples, config.waypointSpacing ?? 520);
  const courseLength = polylineLength(samples);
  const id = config.id ?? `corridor:${connection.id}`;
  const boostProgress = config.boostPatchProgress ?? deriveBoostPatchProgress(samples, config.boostPads);
  return { id, archetypeId: config.archetypeId ?? null, connectionId: connection.id, name: config.name ?? `${from.name}–${to.name} Freight Corridor`, fromId: from.id, toId: to.id, width: config.width ?? 480, endpointWidth: config.endpointWidth ?? 720, shoulderDensity: config.shoulderDensity ?? 0, outerShoulderDensity: config.outerShoulderDensity ?? 0, slipstreamSpeedMultiplier: config.slipstreamSpeedMultiplier ?? 1, slipstreamThrustMultiplier: config.slipstreamThrustMultiplier ?? 1, boostPatches: createBoostPatches(id, samples, boostProgress), seed: config.seed ?? 1, samples, waypoints, length: courseLength, directLength: length, generation: { procedural: !config.coursePoints, coursePoints } };
}

function generateCourseProfile(generator = {}, seed, directLength, sampleSpacing) {
  const candidateCount = generator.candidateCount ?? 16;
  let best = null;
  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
    const random = seededRandom((seed + candidateIndex * 2654435761) >>> 0);
    const pointCount = generator.controlPointCount ?? 9;
    const points = Array.from({ length: pointCount }, (_, index) => {
      const progress = index / (pointCount - 1);
      if (index === 0 || index === pointCount - 1) return { progress, along: progress, lateral: 0 };
      const envelope = Math.sin(Math.PI * progress);
      const alternating = index % 2 === 0 ? 1 : -1;
      const lateral = envelope * (generator.lateralScale ?? 0.1) * (0.38 + random() * 0.62) * (random() < 0.72 ? alternating : -alternating);
      const alongJitter = (random() * 2 - 1) * 0.018 * envelope;
      return { progress, along: Math.max(0, Math.min(1, progress + alongJitter)), lateral };
    });
    const evaluation = evaluateCourseProfile(points, directLength, sampleSpacing, generator);
    if (!best || evaluation.score < best.score) best = { points, ...evaluation };
  }
  return best.points;
}

function evaluateCourseProfile(points, directLength, sampleSpacing, generator) {
  const sampleCount = Math.max(32, Math.ceil(directLength / sampleSpacing));
  const normalized = Array.from({ length: sampleCount + 1 }, (_, index) => sampleCourseProfile(points, index / sampleCount));
  const lengthRatio = polylineLength(normalized.map((point) => ({ x: point.along, y: point.lateral })));
  const lateralSigns = normalized.map((point) => Math.sign(point.lateral)).filter(Boolean);
  const lateralTurns = lateralSigns.slice(1).filter((sign, index) => sign !== lateralSigns[index]).length;
  const maximumTurn = maximumPolylineTurn(normalized);
  const rangePenalty = Math.max(0, (generator.minimumLengthRatio ?? 1.08) - lengthRatio) * 30 + Math.max(0, lengthRatio - (generator.maximumLengthRatio ?? 1.45)) * 30;
  const turnPenalty = Math.max(0, (generator.minimumLateralTurns ?? 2) - lateralTurns) * 2 + Math.max(0, lateralTurns - (generator.maximumLateralTurns ?? 8)) * 2;
  const sharpnessPenalty = Math.max(0, maximumTurn - (generator.maximumSampleTurn ?? 0.4)) * 20;
  return { score: Math.abs(lengthRatio - (generator.targetLengthRatio ?? 1.22)) + rangePenalty + turnPenalty + sharpnessPenalty };
}

function deriveBoostPatchProgress(samples, boostPads = {}) {
  const desiredCount = boostPads?.count ?? 0;
  if (desiredCount <= 0) return [];
  const turnCount = Math.max(1, boostPads.turnCount ?? Math.ceil(desiredCount / 2));
  const minimumSpacing = boostPads.minimumTurnSpacing ?? 0.18;
  const window = Math.max(2, Math.round(samples.length * 0.025));
  const candidates = [];
  for (let index = window; index < samples.length - window; index += 1) {
    const progress = index / (samples.length - 1);
    if (progress < 0.1 || progress > 0.9) continue;
    const before = samples[index - window];
    const center = samples[index];
    const after = samples[index + window];
    const firstAngle = Math.atan2(center.y - before.y, center.x - before.x);
    const secondAngle = Math.atan2(after.y - center.y, after.x - center.x);
    candidates.push({ progress, curvature: Math.abs(normalizeAngle(secondAngle - firstAngle)) });
  }
  const selected = [];
  candidates.sort((a, b) => b.curvature - a.curvature).forEach((candidate) => {
    if (selected.length >= turnCount || selected.some((turn) => Math.abs(turn.progress - candidate.progress) < minimumSpacing)) return;
    selected.push(candidate);
  });
  const offset = boostPads.turnExitOffset ?? 0.05;
  return selected.flatMap((turn) => [Math.max(0.04, turn.progress - offset), Math.min(0.96, turn.progress + offset)]).sort((a, b) => a - b).slice(0, desiredCount).map((progress) => Number(progress.toFixed(4)));
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

function maximumPolylineTurn(samples) {
  let maximum = 0;
  for (let index = 1; index < samples.length - 1; index += 1) {
    const before = samples[index - 1];
    const center = samples[index];
    const after = samples[index + 1];
    const incoming = Math.atan2(center.lateral - before.lateral, center.along - before.along);
    const outgoing = Math.atan2(after.lateral - center.lateral, after.along - center.along);
    maximum = Math.max(maximum, Math.abs(normalizeAngle(outgoing - incoming)));
  }
  return maximum;
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
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
