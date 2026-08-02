// Pure carrier-market ranking. Domain systems build bids from live routes,
// accounts, policies, condition, and relationships; this module only compares
// the normalized records. Stable IDs are the final tie-breaker, never registry
// or update order.

function relationshipPreference(relationship = null) {
  if (!relationship) return 0;
  return ((relationship.trust ?? 0) * 0.35
    + (relationship.reliability ?? 0) * 0.35
    + (relationship.gratitude ?? 0) * 0.15
    + (relationship.familiarity ?? 0) * 0.05
    - (relationship.resentment ?? 0) * 0.4) * 10;
}

export function scoreCarrierBid(bid) {
  if (!bid?.eligible || bid.committed) return -Infinity;
  const offeredPrice = bid.offeredPrice ?? 0;
  const askingPrice = bid.askingPrice ?? offeredPrice;
  const economicSurplus = offeredPrice - askingPrice;
  return economicSurplus + relationshipPreference(bid.relationship);
}

export function rankCarrierBids(bids = []) {
  return bids.map((bid) => ({ ...bid, selectionScore: scoreCarrierBid(bid) }))
    .sort((a, b) => {
      if (a.selectionScore !== b.selectionScore) return b.selectionScore - a.selectionScore;
      return `${a.carrierId}:${a.shipId}`.localeCompare(`${b.carrierId}:${b.shipId}`);
    });
}

export function selectCarrierBid(bids = []) {
  return rankCarrierBids(bids).find((bid) => Number.isFinite(bid.selectionScore)) ?? null;
}
