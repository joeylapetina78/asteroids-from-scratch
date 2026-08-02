// Pure target selection for hostile actors. The combat entity knows how to
// fly and shoot; this module decides which visible economic actor is worth
// pursuing without naming a particular ship, company, hub, or faction.

export function selectIncursionTarget(origin, candidates = [], {
  maximumRange = Infinity,
  preferredTargetId = null,
} = {}) {
  return candidates
    .filter((candidate) => candidate?.attackable !== false && candidate?.detectable !== false)
    .filter((candidate) => candidate?.position && candidate.id)
    .map((candidate) => {
      const distance = Math.hypot(candidate.position.x - origin.x, candidate.position.y - origin.y);
      const value = Math.max(0.1, candidate.strategicValue ?? 1);
      const vulnerability = Math.max(0.1, candidate.vulnerability ?? 1);
      const preferred = candidate.id === preferredTargetId ? 0.82 : 1;
      return {
        ...candidate,
        distance,
        score: (distance / (value * vulnerability)) * preferred,
      };
    })
    .filter((candidate) => candidate.distance <= maximumRange)
    .sort((first, second) => first.score - second.score || first.distance - second.distance || first.id.localeCompare(second.id))[0] ?? null;
}

