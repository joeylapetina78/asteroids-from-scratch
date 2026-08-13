// Pure carrier-market ranking. Domain systems build bids from live routes,
// accounts, policies, condition, and relationships; this module only compares
// the normalized records.
//
// MONEY LEADS, TEMPERAMENT COLOURS. A bid is worth what it pays over what the
// run costs this carrier — that is the real quantity, and it is the base of the
// score. How much a trusted issuer is worth ON TOP is the carrier's own
// judgement, carried on the bid as `relationshipWeight`; a carrier that only
// counts money supplies zero and gets pure surplus. The same split as
// `hubProcurement`'s clearing, where margin leads and goodwill only breaks what
// margin cannot.
//
// The weight rides on the BID rather than being passed in per call, because
// every bid in a ranking comes from a DIFFERENT carrier. It stays a number here
// so this module keeps knowing nothing about actors, traits or state.

// What the weight was for everybody before it became a carrier's own. A bid
// that does not carry one still scores exactly as it used to.
export const DEFAULT_RELATIONSHIP_WEIGHT = 10;

function relationshipPreference(relationship = null, weight = DEFAULT_RELATIONSHIP_WEIGHT) {
  if (!relationship) return 0;
  return ((relationship.trust ?? 0) * 0.35
    + (relationship.reliability ?? 0) * 0.35
    + (relationship.gratitude ?? 0) * 0.15
    + (relationship.familiarity ?? 0) * 0.05
    - (relationship.resentment ?? 0) * 0.4)
    * (Number.isFinite(weight) ? weight : DEFAULT_RELATIONSHIP_WEIGHT);
}

export function scoreCarrierBid(bid) {
  if (!bid?.eligible || bid.committed) return -Infinity;
  const offeredPrice = bid.offeredPrice ?? 0;
  const askingPrice = bid.askingPrice ?? offeredPrice;
  const economicSurplus = offeredPrice - askingPrice;
  return economicSurplus + relationshipPreference(bid.relationship, bid.relationshipWeight);
}

// A stable, arbitrary tiebreak for two bids a ranking values identically.
//
// This used to be `localeCompare` on `${carrierId}:${shipId}`, described as
// "stable IDs, never registry or update order". Stable it was, but sorting on
// an id IS an ordering: the carrier whose name sorts earliest wins every dead
// heat forever, which is the same systematic advantage `extractionMarket` was
// built to remove and `hubProcurement`'s clearing removed on the selling side.
// A hash of the pair is just as stable and belongs to nobody.
function bidTieHash(bid) {
  const key = `${bid.offerId ?? ""}|${bid.carrierId ?? ""}|${bid.shipId ?? ""}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function rankCarrierBids(bids = []) {
  return bids.map((bid) => ({ ...bid, selectionScore: scoreCarrierBid(bid) }))
    .sort((a, b) => {
      if (a.selectionScore !== b.selectionScore) return b.selectionScore - a.selectionScore;
      return bidTieHash(a) - bidTieHash(b);
    });
}

export function selectCarrierBid(bids = []) {
  return rankCarrierBids(bids).find((bid) => Number.isFinite(bid.selectionScore)) ?? null;
}
