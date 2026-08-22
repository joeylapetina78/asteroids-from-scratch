// Where a hull comes from.
//
// Before this, a fleet that wanted a ship subtracted the price from its own
// account and a hull record appeared. Nobody was paid and nobody built it — a
// money sink and a hull faucet in the same statement, which is also a candidate
// for the negative residual the economy could not account for.
//
// A hull is now bought from somebody. That somebody is a yard owned by a hub and
// run by a person, and it decides two things a seller decides: whether it will
// deal with you at all, and what it charges you.
//
// Stage 1 only. The yard does not consume materials yet and hull prices do not
// move; balance is deliberately held still so that any economic change observed
// after this lands is attributable to conservation rather than tangled with a
// retune. See docs/shipbuilding.md.

import { creditPayee } from "./contractTreasury.js?v=fresh-20260822-0043-8abca575";
import { getRelationshipProjection } from "./relationshipProjections.js?v=fresh-20260822-0043-8abca575";
import { relationshipFactor } from "./valuation.js?v=fresh-20260822-0043-8abca575";

export const SHIPYARD_REFUSAL = Object.freeze({
  NO_YARD: "no-shipyard-in-reach",
  NOT_BUILT_HERE: "yard-does-not-build-this",
  REFUSED: "yard-will-not-deal",
  CANNOT_PAY: "buyer-cannot-fund-hull",
});

// A yard will not sell to an enemy. Resentment is the dimension that says so,
// and `access.deniedServices` is the explicit form of the same refusal — the
// access shape has been declared in relationshipProjections since it was
// written and this is the first thing to enforce it.
const HOSTILE_RESENTMENT = 0.6;

// A stranger pays what the hull costs to build. That is deliberate for Stage 1:
// it is exactly what hiring used to cost, so a neutral buyer sees no change and
// any economic movement after this lands is attributable to conservation rather
// than to a repricing. What the relationship does is shade around that base --
// a friend of the yard pays less, somebody it merely tolerates pays more, and an
// enemy is refused outright. The margin a yard takes over cost belongs with
// Stage 2, when "cost" means materials it actually had to buy.
const SELLING_MARGIN = 1;

export function listShipyards(state) {
  return Object.values(state.logistics?.institutions ?? {})
    .filter((institution) => institution?.archetypeId === "shipyard");
}

export function getShipyard(state, shipyardId) {
  const found = state.logistics?.institutions?.[shipyardId];
  return found?.archetypeId === "shipyard" ? found : null;
}

// What a yard thinks of a buyer, in the two terms a seller actually acts on.
export function assessBuyer(state, shipyard, buyerInstitutionId) {
  const owner = shipyard.ownerInstitutionId ?? shipyard.id;
  // Its own hub is not a customer. A yard building for the hub that owns it
  // builds at cost — there is no margin to take from yourself.
  if (buyerInstitutionId === owner || buyerInstitutionId === shipyard.id) {
    return { willDeal: true, atCost: true, factor: 1, projection: null, tier: "owner" };
  }

  const projection = getRelationshipProjection(state, { fromId: owner, toId: buyerInstitutionId });
  const resentment = projection?.resentment ?? 0;
  const denied = projection?.access?.deniedServices ?? [];
  if (resentment >= HOSTILE_RESENTMENT || denied.includes("sell-craft")) {
    return { willDeal: false, atCost: false, factor: 1, projection, tier: projection?.access?.tier ?? "public" };
  }

  // Goodwill shades the price. `relationshipFactor` returns >1 for goodwill
  // because it was written for what a SELLER will pay a supplier; a buyer facing
  // a seller is the same relationship read from the other end, so it inverts.
  const factor = 1 / relationshipFactor(projection);
  return { willDeal: true, atCost: false, factor, projection, tier: projection?.access?.tier ?? "public" };
}

// What this yard would charge this buyer for this hull, or why it would not.
export function quoteHull(state, { shipyardId, buyerInstitutionId, hullClass }) {
  const shipyard = getShipyard(state, shipyardId);
  if (!shipyard) return { available: false, reason: SHIPYARD_REFUSAL.NO_YARD };

  const listing = (shipyard.hullCatalog ?? []).find((entry) => entry.id === hullClass);
  if (!listing) return { available: false, reason: SHIPYARD_REFUSAL.NOT_BUILT_HERE, shipyardId };

  const standing = assessBuyer(state, shipyard, buyerInstitutionId);
  if (!standing.willDeal) {
    return { available: false, reason: SHIPYARD_REFUSAL.REFUSED, shipyardId, tier: standing.tier };
  }

  const price = Math.round(listing.buildCost * (standing.atCost ? 1 : SELLING_MARGIN * standing.factor));
  return {
    available: true,
    shipyardId,
    ownerInstitutionId: shipyard.ownerInstitutionId ?? shipyard.id,
    siteId: shipyard.siteId,
    hullClass,
    label: listing.label,
    price,
    buildCost: listing.buildCost,
    atCost: standing.atCost,
    tier: standing.tier,
    // Stage 1 shorthand. The hull records what it was built at; nothing derives
    // this from materials yet. It exists now because quality has to be stamped
    // at the moment of construction — adding it later means migrating every
    // hull built without it. See docs/shipbuilding.md.
    quality: listing.quality ?? 1,
  };
}


// The best quote available to this buyer, across every yard that will deal.
export function findHullQuote(state, { buyerInstitutionId, hullClass }) {
  const quotes = listShipyards(state)
    .map((shipyard) => quoteHull(state, { shipyardId: shipyard.id, buyerInstitutionId, hullClass }))
    .filter((quote) => quote.available);
  if (quotes.length === 0) {
    return { available: false, reason: SHIPYARD_REFUSAL.NO_YARD, hullClass };
  }
  return quotes.sort((first, second) => first.price - second.price)[0];
}

// Move the money. The hull itself is created by whichever domain owns that kind
// of craft — this records the sale and returns what the buyer needs to stamp on
// the hull it makes.
export function purchaseHull(state, { quote, buyerInstitutionId, buyerAccount, now = Date.now(), referenceId = null }) {
  if (!quote?.available) return { bought: false, reason: quote?.reason ?? SHIPYARD_REFUSAL.NO_YARD };
  if ((buyerAccount?.balance ?? 0) < quote.price) {
    return { bought: false, reason: SHIPYARD_REFUSAL.CANNOT_PAY, price: quote.price };
  }

  buyerAccount.balance -= quote.price;
  buyerAccount.transactions ??= [];
  buyerAccount.transactions.push({
    id: `HULL-BUY-${now}-${referenceId ?? quote.hullClass}`,
    at: now, type: "capital-expense", amount: -quote.price,
    balance: buyerAccount.balance, referenceId: referenceId ?? quote.shipyardId,
  });

  // A yard owned by its hub banks into the hub's own account, which is the same
  // account SPRC uses. That is deliberate: `economySampler.listAccountHolders`
  // deduplicates by account identity, so a shared account is not double counted.
  const paid = creditPayee(state, {
    payeeEntityId: quote.ownerInstitutionId,
    amount: quote.price,
    referenceId: referenceId ?? quote.hullClass,
    kind: "hull-sale",
    now,
  });

  state.ledger?.recordEvent?.("shipyard.hullSold", {
    shipyardId: quote.shipyardId, buyerInstitutionId, hullClass: quote.hullClass,
    price: quote.price, buildCost: quote.buildCost, atCost: quote.atCost,
    tier: quote.tier, quality: quote.quality, credited: paid.credited,
  }, { visible: true, message: `${quote.label} built at ${quote.siteId} for ${buyerInstitutionId} — ${quote.price} cr${quote.atCost ? " at cost" : ""}.` });

  return {
    bought: true,
    price: quote.price,
    builtBy: quote.shipyardId,
    builtAt: quote.siteId,
    quality: quote.quality,
    purchasedAt: now,
  };
}
