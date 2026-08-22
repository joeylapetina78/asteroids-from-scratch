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

import { creditPayee } from "./contractTreasury.js?v=fresh-20260822-1330-factories";
import { getRelationshipProjection } from "./relationshipProjections.js?v=fresh-20260822-1330-factories";
import { relationshipFactor } from "./valuation.js?v=fresh-20260822-1330-factories";
import { countHullStrokes, getHullOutline } from "../content/ships/hullOutlines.js?v=fresh-20260822-1330-factories";

export const SHIPYARD_REFUSAL = Object.freeze({
  NO_YARD: "no-shipyard-in-reach",
  NOT_BUILT_HERE: "yard-does-not-build-this",
  REFUSED: "yard-will-not-deal",
  CANNOT_PAY: "buyer-cannot-fund-hull",
  NONE_READY: "no-hull-ready-on-the-ways",
});

// What a hull is made of, and how long it takes to lay.
//
// Stage 2. Until now a yard sold hulls it had never built out of materials it
// never held; the price was a number and the ways were an animation. A hull is
// now assembled from parts the yard has to have, and it takes time, so a buyer
// can arrive to find nothing ready.
export const HULL_BILL_OF_MATERIALS = Object.freeze({
  "mining-craft": Object.freeze({ "hull-plate": 3, "machine-part": 2 }),
  "freight-craft": Object.freeze({ "hull-plate": 5, "machine-part": 3 }),
  "freight-craft-subspace": Object.freeze({ "hull-plate": 9, "machine-part": 7 }),
});

// Wall-clock time to lay one hull, whatever it is made of. Every class takes the
// same time and differs in what it consumes — a long-haul freighter is expensive
// because of what goes into it, not because the ways are slower.
export const HULL_BUILD_MS = 45_000;

// How many finished hulls a yard will hold before it stops laying more. A yard
// with idle ways builds stock; a yard with a full shed waits for a buyer.
export const HULL_STOCK_TARGET = 2;

export function getHullBillOfMaterials(hullClass) {
  return HULL_BILL_OF_MATERIALS[hullClass] ?? HULL_BILL_OF_MATERIALS["freight-craft"];
}

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

function ensureYardState(yard) {
  yard.inventories ??= { raw: {}, produced: {}, reserved: { raw: {}, produced: {} } };
  yard.inventories.produced ??= {};
  yard.readyHulls ??= {};
  yard.build ??= null;
  return yard;
}

// Can this yard start the hull it would most like to have on hand?
function nextHullToLay(yard) {
  const ready = yard.readyHulls ?? {};
  const wanted = (yard.hullCatalog ?? []).map((entry) => entry.id);
  // Keep a spread rather than two of one thing: lay whichever class the shed is
  // shortest of.
  return wanted
    .map((hullClass) => ({ hullClass, held: ready[hullClass] ?? 0 }))
    .filter((entry) => entry.held < HULL_STOCK_TARGET)
    .sort((first, second) => first.held - second.held)[0]?.hullClass ?? null;
}

// A yard draws on its hub warehouse, not a private store. The hub institution
// is where stock lives in this world — the plate works at Yard Exchange already
// delivers hull-plate straight into hub.inventories, and a department reaching
// into the same shelf is the Sal shop pattern applied to materials.
function ownerWarehouse(state, yard) {
  const owner = state.logistics?.institutions?.[yard.ownerInstitutionId ?? ""];
  if (!owner) return null;
  owner.inventories ??= {};
  return owner.inventories;
}

function heldParts(state, yard, partId) {
  return ownerWarehouse(state, yard)?.[partId] ?? 0;
}

function canAfford(state, yard, bill) {
  return Object.entries(bill).every(([partId, units]) => heldParts(state, yard, partId) >= units);
}

function consumeParts(state, yard, bill) {
  const shelf = ownerWarehouse(state, yard);
  if (!shelf) return;
  Object.entries(bill).forEach(([partId, units]) => {
    shelf[partId] = (shelf[partId] ?? 0) - units;
  });
}

// What this yard is short of, for the hull it would lay next.
//
// Shipbuilding has to ASK for parts through the same procurement channel repair
// work uses. It cannot simply take what the factory produces: a live run showed
// every plate the Yard Plate Works made being reserved against an accepted order
// the moment it existed, so free stock at the hub was permanently zero and the
// ways never started. Yard Exchange was selling its own plate to Scrap Porch and
// had committed to doing so — the answer is to bid for parts, not to break a
// commitment.
export function shipyardPartShortage(state, yard, partId) {
  if (!yard) return 0;
  const hullClass = nextHullToLay(yard);
  if (!hullClass) return 0;
  const needed = getHullBillOfMaterials(hullClass)[partId] ?? 0;
  if (needed <= 0) return 0;
  return Math.max(0, needed - heldParts(state, yard, partId));
}

// The ways, advanced one tick.
//
// A build starts only when the yard has the parts for it and room in the shed,
// so the ways are still when there is nothing to do — which is the point. The
// animation used to run forever and meant nothing.
export function advanceShipyards(state, now = Date.now()) {
  const laid = [];
  listShipyards(state).forEach((raw) => {
    const yard = ensureYardState(raw);

    if (yard.build) {
      if (now - yard.build.startedAt < HULL_BUILD_MS) return;
      yard.readyHulls[yard.build.hullClass] = (yard.readyHulls[yard.build.hullClass] ?? 0) + 1;
      state.ledger?.recordEvent?.("shipyard.hullLaunched", {
        shipyardId: yard.id, hullClass: yard.build.hullClass,
        ready: yard.readyHulls[yard.build.hullClass],
      }, { visible: true, message: `${getHullOutline(yard.build.hullClass).label} completed at ${yard.siteId} and moved to the shed.` });
      laid.push({ shipyardId: yard.id, hullClass: yard.build.hullClass });
      yard.build = null;
      return;
    }

    const hullClass = nextHullToLay(yard);
    if (!hullClass) return;
    const bill = getHullBillOfMaterials(hullClass);
    if (!canAfford(state, yard, bill)) {
      yard.waitingOnParts = hullClass;
      return;
    }
    consumeParts(state, yard, bill);
    yard.waitingOnParts = null;
    yard.build = { hullClass, startedAt: now, strokes: countHullStrokes(hullClass) };
    state.ledger?.recordEvent?.("shipyard.keelLaid", {
      shipyardId: yard.id, hullClass, consumed: bill,
    }, { visible: false });
  });
  return laid;
}

// How far along the hull on the ways is, 0..1. Nothing on the ways is null,
// which the renderer reads as "draw the shed, not a build".
export function getBuildProgress(yard, now = Date.now()) {
  if (!yard?.build) return null;
  return Math.min(1, (now - yard.build.startedAt) / HULL_BUILD_MS);
}

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

  // You cannot buy a hull nobody has built. This is the whole weight of Stage 2:
  // a fleet that wants to grow now waits on a yard that has to have made the
  // thing, out of parts somebody had to supply.
  const ready = (shipyard.readyHulls ?? {})[hullClass] ?? 0;
  if (ready <= 0) {
    return { available: false, reason: SHIPYARD_REFUSAL.NONE_READY, shipyardId, hullClass };
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
  const shipyard = getShipyard(state, quote.shipyardId);
  if (shipyard) {
    const held = (shipyard.readyHulls ?? {})[quote.hullClass] ?? 0;
    if (held <= 0) return { bought: false, reason: SHIPYARD_REFUSAL.NONE_READY };
    shipyard.readyHulls[quote.hullClass] = held - 1;
  }

  const paid = creditPayee(state, {
    payeeEntityId: quote.ownerInstitutionId,
    amount: quote.price,
    referenceId: referenceId ?? quote.hullClass,
    kind: "hull-sale",
    now,
  });

  // The yard remembers when it last launched something. The renderer reads this
  // to show the ways lit; it is state rather than an event subscription because
  // a cosmetic flash is not worth a wire into the game loop.
  if (shipyard) {
    shipyard.lastSaleAt = now;
    shipyard.lastSaleClass = quote.hullClass;
  }

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
