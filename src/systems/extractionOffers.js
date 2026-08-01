// Work somebody wants dug up, in the one shape a miner values.
//
// Before this, a miner's world was two hardcoded lists: the hubs' posted orders,
// and an adapter that reached into `state.sprc.procurementOrders` by name. For
// anyone else — a farm short of water ice, a fourth settlement, the player
// posting a job — to hire a miner, somebody had to edit the mining system.
//
// An offer source is registered, not enumerated. The miner does not know who
// issued the work it is looking at, and adding an issuer is a registration
// rather than a branch. What stays in the mining system is how to VALUE and
// EXECUTE an offer; what leaves is the assumption about who can make one.
//
// WHY THE REGISTRY LIVES ON `state` AND NOT IN THIS MODULE:
// every relative import under src/ carries a cache-busting version query, and
// Node and the browser both treat a bare specifier and a versioned one as
// DIFFERENT modules with separate scopes. Source files import the versioned
// form; tests import the bare one. A module-level registry therefore silently
// forks in two — the game registers into one copy and the tests read an empty
// other one, so it works in the browser and not under test. Keeping it on
// `state` is the same reason `costBasis`, `diagnostics` and `relationships`
// keep theirs there. Runtime-only, and deliberately absent from the save
// whitelist, since sources are functions.
//
// The rule this generalises to: NO MODULE-LEVEL MUTABLE STATE anywhere under
// src/. Pure functions and frozen constants are safe; a registry, cache or
// counter is not.
//
// Two things an issuer may need that a plain price cannot express:
//
//   reserve()      a chance to hold the units before a worker commits, so two
//                  miners cannot both be dispatched against the same order.
//                  Returns false to withdraw the offer at the last moment.
//   harvestTarget  how much the worker actually fills its hold with, which may
//                  exceed what the offer buys. A miner sells the remainder into
//                  local supply, which is what keeps small remainder orders
//                  worth taking.

export function ensureExtractionOffers(state) {
  state.extractionOffers ??= { sources: {} };
  state.extractionOffers.sources ??= {};
  return state.extractionOffers;
}

export function createExtractionOffer({
  id,
  issuerInstitutionId = null,
  siteId,
  siteName = null,
  resourceId,
  resourceName = null,
  amount = 0,
  paymentPerUnit = 0,
  contractId = null,
  // Denomination: some issuers buy in their own equivalent units rather than
  // in units of the material, so the two are tracked separately.
  equivalentAmount = null,
  pricePerEquivalent = null,
  harvestTarget = null,
  sellsSurplus = false,
  reserve = null,
  // Exclusive by default: one worker per offer. A naive issuer that keeps
  // re-offering the same units gets protected from dispatching a second worker
  // against them without having to think about it. An issuer that genuinely
  // supports several suppliers at once — one that sizes each offer against what
  // is still unreserved — opts in.
  concurrent = false,
  // Which settlement path closes this once the material is delivered. Kept as
  // the existing strings so stored allocations and their consumers are
  // unchanged; renaming these is follow-up work, not part of opening the list.
  kind = "standing",
  source = null,
} = {}) {
  return {
    id, issuerInstitutionId, siteId, siteName: siteName ?? siteId,
    resourceId, resourceName: resourceName ?? String(resourceId ?? "").replaceAll("-", " "),
    amount, paymentPerUnit, contractId,
    equivalentAmount, pricePerEquivalent,
    harvestTarget: harvestTarget ?? amount,
    sellsSurplus, reserve, concurrent, kind, source,
  };
}

// Offers a worker may still be dispatched against, given what is already
// committed. Exclusivity is enforced here rather than in each issuer, so a new
// issuer cannot forget it.
export function filterUncommittedOffers(offers, allocations = {}) {
  const active = new Set(Object.values(allocations)
    .filter((allocation) => allocation.status === "active")
    .map((allocation) => allocation.orderId));
  return offers.filter((offer) => offer.concurrent || !active.has(offer.id));
}

// `fn(state, context) => ExtractionOffer[]`. Keyed by id, so an issuer that is
// constructed twice against the same world registers once.
export function registerExtractionOfferSource(state, id, fn) {
  if (!state || !id || typeof fn !== "function") return;
  ensureExtractionOffers(state).sources[id] = fn;
}

export function unregisterExtractionOfferSource(state, id) {
  delete ensureExtractionOffers(state).sources[id];
}

export function listExtractionOfferSources(state) {
  return Object.keys(ensureExtractionOffers(state).sources);
}

// Everything on offer right now, from every issuer. A source that throws is
// skipped rather than taking the miner down with it: one badly-behaved issuer
// must not stop the others being seen.
export function listExtractionOffers(state, context = {}) {
  const offers = [];
  Object.entries(ensureExtractionOffers(state).sources).forEach(([id, fn]) => {
    let produced = [];
    try {
      produced = fn(state, context) ?? [];
    } catch (error) {
      console.warn(`[extractionOffers] source '${id}' failed: ${error.message}`);
      return;
    }
    produced.forEach((offer) => { if (offer) offers.push(offer); });
  });
  return offers;
}
