// Turns live, non-mission work into the same target vocabulary used by authored
// mission tasks. Keeping this pure makes each new task source declare its next
// useful action without teaching the arrow renderer about gameplay systems.
export function getTaskAttentionTargets({ contracts = [], patrol = null, presentedDocumentKinds = new Set() } = {}) {
  const targets = [];

  contracts
    .filter((contract) => contract.status === "fulfilled")
    .forEach((contract) => {
      targets.push({ targetId: "element:contract-accept", label: `Collect payment from ${contract.issuer ?? "contractor"}` });
    });

  if (!patrol || !["standoff", "approach", "hold"].includes(patrol.phase)) return dedupe(targets);

  if (!patrol.hasScanned) {
    return dedupe(targets);
  }

  const reasons = patrol.flaggedReasons ?? [];
  const flagged = patrol.flaggedDismissTimer > 0;
  if (flagged) {
    if (reasons.includes("missing-vin")) targets.push({ targetId: "panel:hull", label: "Attach ship VIN plate" });
    if (reasons.includes("missing-pilot-license")) targets.push({ targetId: "panel:license", label: "Obtain a pilot license" });
    if (reasons.includes("unauthorized-zone-history")) targets.push({ targetId: "element:rights-overlay-toggle", label: "Review the zone violation" });
    return dedupe(targets);
  }

  if (!presentedDocumentKinds.has("ship-vin")) {
    targets.push({ targetId: "element:hull-vin", label: "Present ship VIN" });
  }
  if (!presentedDocumentKinds.has("pilot-license")) {
    targets.push({ targetId: "element:license-id", label: "Present pilot authorization" });
  }
  return dedupe(targets);
}

function dedupe(targets) {
  return [...new Map(targets.map((target) => [target.targetId, target])).values()];
}
