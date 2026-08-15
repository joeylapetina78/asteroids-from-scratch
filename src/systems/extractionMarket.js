import { filterUncommittedOffers, listExtractionOffers } from "./extractionOffers.js?v=fresh-20260814-2122-cfc8bf2";

// One clearing for every miner's idle ships against every open offer.
//
// WHY THIS EXISTS: before it, each mining company picked its own work inside its
// own `update()`. Cinder's operation updated first, so it took first refusal on
// every newly posted order and Flint only ever saw the remainder. That is not a
// market — it is an allocation rule that happens to be written as one, and it
// produced a wealth gap (84k vs 23k over a soak) that read as business judgment
// when it was really call order in `main.js`.
//
// So selection moves out of the individual operation and into a round that all
// participants share. Every idle ship's bid on every open offer is ranked in ONE
// list, and the offer goes to whoever values it highest — regardless of who
// updates first, and regardless of who registered first.
//
// A bid is the bidder's OWN valuation. Nothing here knows how a miner prices a
// run; it only knows how to rank what everyone said and hand back the winners.
// That keeps traits, cost basis and deposit knowledge with the actor that has
// them, which is the same split the offer surface made on the issuing side.
//
// Registry lives on `state` for the reason `extractionOffers` documents at
// length: a bare and a `?v=`-suffixed specifier are DIFFERENT modules, so a
// module-level registry silently forks between the game and the tests. No
// module-level mutable state anywhere under src/.

export function ensureExtractionMarket(state) {
  state.extractionMarket ??= { participants: {} };
  state.extractionMarket.participants ??= {};
  return state.extractionMarket;
}

// `fn(state, context) => Bidder[]`, where a Bidder is
// `{ id, controllerId, waitingSince, bid(offer) => valuation }`.
// Keyed by id, so a participant constructed twice against the same world
// registers once.
export function registerExtractionMarketParticipant(state, id, fn) {
  if (!state || !id || typeof fn !== "function") return;
  ensureExtractionMarket(state).participants[id] = fn;
}

export function unregisterExtractionMarketParticipant(state, id) {
  delete ensureExtractionMarket(state).participants[id];
}

export function listExtractionMarketParticipants(state) {
  return Object.keys(ensureExtractionMarket(state).participants);
}

// The clearing, ranked over every participant's idle ships and every open
// offer. A caller reads its OWN ships out of it and leaves the rest alone.
//
// Deliberately NOT cached between callers. A cached round is only valid while
// the world it was computed from holds still, and there is no clock-independent
// way to know that here — a company constructed mid-tick, a ship freed, an order
// withdrawn all invalidate it, and reusing one that a participant's ships were
// busy during silently denies them the whole tick. That failure is the exact bug
// this module exists to remove, so it does not get a second door in.
//
// Re-clearing costs nothing in fairness terms: this greedy is "repeatedly take
// the highest remaining bid", and re-running it after the winners have committed
// hands everyone else the same orders it would have. It costs one clearing per
// company per tick, against the one per IDLE SHIP per tick the per-operation
// selection loop was doing before.
export function clearExtractionMarket(state, context = {}) {
  return runClearing(state, context, Object.keys(ensureExtractionMarket(state).participants));
}

export function getMarketAssignment(round, bidderId) {
  return round?.assignments?.[bidderId] ?? null;
}

// Why a bidder that wanted work did not get any: the offer it valued most, who
// took it, and by how much. Without this an outbid ship reports only "nothing
// worth taking", which is false and hides the competition entirely.
export function getMarketOutbid(round, bidderId) {
  return round?.outbid?.[bidderId] ?? null;
}

function runClearing(state, context = {}, participants = []) {
  const offers = filterUncommittedOffers(listExtractionOffers(state, context), context.allocations ?? {});
  const bidders = collectBidders(state, context);
  const bids = [];

  bidders.forEach((bidder) => {
    offers.forEach((offer) => {
      let valuation = null;
      try {
        valuation = bidder.bid(offer);
      } catch (error) {
        console.warn(`[extractionMarket] bidder '${bidder.id}' failed to value '${offer.id}': ${error.message}`);
        return;
      }
      if (!valuation?.acceptable) return;
      bids.push({
        bidderId: bidder.id,
        bidderName: bidder.name ?? bidder.id,
        controllerId: bidder.controllerId ?? null,
        waitingSince: bidder.waitingSince ?? null,
        offer,
        netValue: valuation.metrics?.netValue ?? 0,
        reasons: valuation.reasons ?? [],
      });
    });
  });

  bids.sort(compareBids);

  // Each bidder's own book, in the same descending order, so the alternatives a
  // winner rejected come straight off the shared ranking rather than a second
  // sort with its own tie-breaks.
  const byBidder = new Map();
  bids.forEach((bid) => {
    if (!byBidder.has(bid.bidderId)) byBidder.set(bid.bidderId, []);
    byBidder.get(bid.bidderId).push(bid);
  });

  const assignments = {};
  const offerWinner = new Map();
  bids.forEach((bid) => {
    if (assignments[bid.bidderId]) return;
    // One winner per offer, unless the issuer said it can take several
    // suppliers at once. A concurrent offer sizes itself against what is
    // already reserved and its `reserve()` clamps to what is genuinely left, so
    // a second winner in the same round is held to the remainder rather than
    // double-booking it — the same protection that already covered two
    // companies racing for the same units.
    if (!bid.offer.concurrent && offerWinner.has(bid.offer.id)) return;
    if (!offerWinner.has(bid.offer.id)) offerWinner.set(bid.offer.id, bid);
    assignments[bid.bidderId] = {
      offer: bid.offer,
      netValue: bid.netValue,
      reasons: bid.reasons,
      rejected: (byBidder.get(bid.bidderId) ?? [])
        .filter((entry) => entry.offer.id !== bid.offer.id)
        .slice(0, 3)
        .map((entry) => ({ orderId: entry.offer.id, netValue: Math.round(entry.netValue) })),
    };
  });

  const outbid = {};
  byBidder.forEach((book, bidderId) => {
    if (assignments[bidderId]) return;
    const best = book[0];
    const winner = offerWinner.get(best.offer.id);
    outbid[bidderId] = {
      orderId: best.offer.id,
      ownNetValue: Math.round(best.netValue),
      winnerId: winner?.bidderId ?? null,
      winnerName: winner?.bidderName ?? null,
      winnerControllerId: winner?.controllerId ?? null,
      winningNetValue: winner ? Math.round(winner.netValue) : null,
    };
  });

  return {
    at: context.at ?? null,
    participants,
    offerCount: offers.length,
    bidderCount: bidders.length,
    bidCount: bids.length,
    assignments,
    outbid,
  };
}

function collectBidders(state, context) {
  const bidders = [];
  Object.entries(ensureExtractionMarket(state).participants).forEach(([participantId, fn]) => {
    let produced = [];
    try {
      produced = fn(state, context) ?? [];
    } catch (error) {
      console.warn(`[extractionMarket] participant '${participantId}' failed: ${error.message}`);
      return;
    }
    produced.forEach((bidder) => {
      if (bidder && typeof bidder.bid === "function") bidders.push({ ...bidder, participantId });
    });
  });
  return bidders;
}

// Highest bid wins. Ties go to whoever has been waiting longest, and a genuine
// dead heat is broken by a hash of the pair rather than by comparing ids —
// comparing ids would put every tie back where this module started, since
// "cinder" sorts before "flint".
function compareBids(first, second) {
  if (second.netValue !== first.netValue) return second.netValue - first.netValue;
  const firstWait = first.waitingSince ?? Number.POSITIVE_INFINITY;
  const secondWait = second.waitingSince ?? Number.POSITIVE_INFINITY;
  if (firstWait !== secondWait) return firstWait - secondWait;
  return pairHash(first) - pairHash(second);
}

function pairHash({ bidderId, offer }) {
  const key = `${bidderId}|${offer?.id ?? ""}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
