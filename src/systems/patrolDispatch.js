export function listPendingPatrolResponses(requests, activePatrols = []) {
  const activeRequestIds = new Set(activePatrols.map((patrol) => patrol.protectionRequestId).filter(Boolean));
  return Object.values(requests ?? {})
    .filter((request) => ["contracted", "covered-internally"].includes(request.status))
    .filter((request) => !request.dispatchedAt && !activeRequestIds.has(request.id))
    .sort((left, right) => (right.severity ?? 0) - (left.severity ?? 0) || left.createdAt - right.createdAt);
}
