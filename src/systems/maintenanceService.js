export function matchMaintenanceService({ request, institution, facilities = [], repairRecipe = null, inventories = {}, procurableItemIds = [] }) {
  if (!request?.subjectId || !request.issueType || !request.craftClass) return { eligible: false, reason: "invalid-request" };
  if (request.conditionStatus === "resolved" || request.activeConditionIssue === false) return { eligible: false, reason: "no-active-condition" };
  const capability = (institution?.serviceCapabilities ?? []).find((candidate) => (
    candidate.craftClasses.includes(request.craftClass) &&
    candidate.issueTypes.includes(request.issueType) &&
    (request.requiredCapabilities ?? []).every((required) => candidate.repairCapabilities.includes(required))
  ));
  if (!capability) return { eligible: false, reason: "unsupported-repair" };
  const facility = facilities.find((candidate) => candidate.facilityType === capability.facilityType && candidate.status !== "offline");
  if (!facility) return { eligible: false, reason: "incompatible-facility", capability };
  if (request.locationSiteId !== institution.siteId && request.mobility !== "self-return") return { eligible: false, reason: "cannot-reach-facility", capability, facility };
  const availableCash = (request.payer?.balance ?? 0) - (request.payer?.committed ?? 0) - (request.payer?.protectedCash ?? 0);
  if (availableCash < (request.servicePrice ?? capability.servicePrice ?? 0)) return { eligible: false, reason: "payer-cannot-afford", capability, facility };
  if (!repairRecipe) return { eligible: false, reason: "no-compatible-recipe", capability, facility };
  const unavailable = Object.entries(repairRecipe).flatMap(([bucket, requirements]) => Object.entries(requirements ?? {}).filter(([itemId, amount]) => {
    const available = inventories[bucket]?.[itemId] ?? 0;
    return available < amount && !procurableItemIds.includes(itemId);
  }).map(([itemId]) => itemId));
  if (unavailable.length) return { eligible: false, reason: "materials-unavailable", capability, facility, unavailable };
  return { eligible: true, reason: "matched", capability, facility, materials: "available-or-procurable" };
}
