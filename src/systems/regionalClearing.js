import { TRADED_FAMILIES } from "./hubInventory.js?v=fresh-20260820-2144-6027e58";
import { FIRST_REACH_TRANSPORT_CONNECTIONS, FIRST_REACH_CARRIER_POLICY } from "../content/transportation/firstReachNetwork.js?v=fresh-20260820-2144-6027e58";
import { createTransportationNetwork, findTransportationRoute, maximumServiceableDistance } from "./transportationPlanning.js?v=fresh-20260820-2144-6027e58";
import { getEffectiveTransportPolicy } from "./shipDrives.js?v=fresh-20260820-2144-6027e58";

// Trade between two regions that are both being simulated as rates.
//
// Re-observation fixed the destructive half of this problem: an aggregate can no
// longer credit itself freight from a supplier that has stopped sending any. It
// left the constructive half missing, and an eight-hour run showed what that
// costs. Once every hub aggregated, procurement stopped running for BOTH sides
// of every order, so inter-hub commerce did not get cheaper — it stopped. Yard
// Exchange finished the night sitting on hundreds of units while Deep Research
// starved at zero served, and neither could reach the other.
//
// A distant region therefore needs a way to buy from another distant region. The
// rule this module holds to is that a cheap simulation of trade is still TRADE:
// every unit that arrives somewhere left somewhere else, every credit paid was
// received by somebody who exists, and the carrier that moved it is a real firm
// that could actually have made the trip.

export const CLEARING_DEFAULTS = Object.freeze({
  // What a region keeps back before it will sell to a neighbour. Selling down to
  // empty to serve somebody else's shortfall is how one starving hub becomes two.
  reserveSeconds: 240,
  // Credits per effective unit. Deliberately a single number: negotiation,
  // contention and relationship pricing are exactly what aggregation exists to
  // stop paying for, and inventing a second pricing model here would be a second
  // source of truth about what things cost.
  pricePerUnit: 160,
  freightPerUnitPerDistance: 0.0009,
});

let cachedNetwork = null;
function network() {
  cachedNetwork ??= createTransportationNetwork({
    destinations: Array.from(new Set(FIRST_REACH_TRANSPORT_CONNECTIONS.flatMap((connection) => [connection.fromId, connection.toId])))
      .map((id) => ({ id })),
    connections: FIRST_REACH_TRANSPORT_CONNECTIONS,
  });
  return cachedNetwork;
}

// Who could actually carry this, and what would they charge?
//
// Reachability is not decoration. The frontier is unreachable to a standard hull
// and reachable to a subspace one, and that must remain true when the trade is
// modelled rather than flown. Otherwise aggregation quietly repeals a constraint
// the detailed world enforces, and distance stops meaning anything the moment
// nobody is watching.
export function findRegionalCarrier(state, originSiteId, destinationSiteId) {
  const route = findTransportationRoute(network(), originSiteId, destinationSiteId);
  if (!route) return null;
  const carriers = Object.values(state.logistics?.institutions ?? {})
    .filter((institution) => institution.archetypeId === "hauling-business" && institution.accounts?.operating);

  let best = null;
  carriers.forEach((carrier) => {
    Object.values(state.logistics?.haulers ?? {})
      .filter((hauler) => hauler.carrierInstitutionId === carrier.id)
      .map((hauler) => state.logistics?.institutions?.[hauler.shipInstitutionId])
      .filter(Boolean)
      .forEach((hull) => {
        const policy = getEffectiveTransportPolicy(carrier.policies?.transportation ?? FIRST_REACH_CARRIER_POLICY, hull);
        // The same round-trip budget the detailed planner applies.
        if (route.distance * 2 > maximumServiceableDistance(policy)) return;
        if (!best) best = { carrier, hull, route };
      });
  });
  return best;
}

function familyStock(flow, family) {
  return Math.max(0, flow?.stock?.[family] ?? 0);
}

// What a region can spare: stock beyond the buffer it wants for its own people.
function sellableUnits(flow, family, policy) {
  const consumption = flow?.demand?.consumption?.[family] ?? 0;
  const reserve = consumption * policy.reserveSeconds;
  return Math.max(0, familyStock(flow, family) - reserve);
}

// One clearing round between the regions currently simulated as rates.
//
// Deliberately a single pass over shortfalls rather than an auction: haggling is
// the thing aggregation exists to stop paying for. What must survive is the
// accounting, not the negotiation.
export function clearRegionalTrade(state, records, { at = Date.now(), policy = CLEARING_DEFAULTS } = {}) {
  const aggregated = Object.values(records ?? {})
    .filter((record) => record.mode === "aggregate" && record.flow?.supply);
  if (aggregated.length < 2) return { trades: [], moved: 0, paid: 0 };

  const trades = [];
  let moved = 0;
  let paid = 0;

  TRADED_FAMILIES.forEach((family) => {
    const buyers = aggregated
      .filter((record) => (record.flow.shortfall?.[family] ?? 0) > 0)
      .sort((first, second) => (second.flow.shortfall[family] ?? 0) - (first.flow.shortfall[family] ?? 0));

    buyers.forEach((buyer) => {
      let wanted = buyer.flow.shortfall[family] ?? 0;
      if (!(wanted > 0)) return;

      const sellers = aggregated
        .filter((record) => record !== buyer && sellableUnits(record.flow, family, policy) > 0)
        .sort((first, second) => sellableUnits(second.flow, family, policy) - sellableUnits(first.flow, family, policy));

      sellers.forEach((seller) => {
        if (!(wanted > 0)) return;
        const spare = sellableUnits(seller.flow, family, policy);
        if (!(spare > 0)) return;

        const haulage = findRegionalCarrier(state, seller.siteId, buyer.siteId);
        // No firm in the world could make this trip, so the trade does not
        // happen — exactly as it would not happen in detail.
        if (!haulage) return;

        const units = Math.min(wanted, spare);
        const goods = units * policy.pricePerUnit;
        const freight = units * haulage.route.distance * policy.freightPerUnitPerDistance;
        const buyerInstitution = state.logistics?.institutions?.[buyer.institutionId];
        const sellerInstitution = state.logistics?.institutions?.[seller.institutionId];
        if (!buyerInstitution?.accounts?.operating || !sellerInstitution?.accounts?.operating) return;

        // A region cannot buy what it cannot pay for, and may not go negative
        // to do it.
        if (buyerInstitution.accounts.operating.balance < goods + freight) return;

        // Material: leaves one shelf, arrives on the other. One movement.
        seller.flow.stock[family] = familyStock(seller.flow, family) - units;
        buyer.flow.stock[family] = familyStock(buyer.flow, family) + units;
        buyer.flow.shortfall[family] = Math.max(0, wanted - units);
        wanted -= units;

        // Credits: the buyer pays and every credit is received by somebody who
        // exists. The carrier is a real firm with a hull that could have flown
        // it, so freight is income rather than a hole in the books.
        buyerInstitution.accounts.operating.balance -= goods + freight;
        sellerInstitution.accounts.operating.balance += goods;
        haulage.carrier.accounts.operating.balance += freight;

        moved += units;
        paid += goods + freight;
        trades.push({
          family,
          units: Math.round(units * 100) / 100,
          from: seller.institutionId,
          to: buyer.institutionId,
          carrierInstitutionId: haulage.carrier.id,
          hullId: haulage.hull.id,
          distance: Math.round(haulage.route.distance),
          goods: Math.round(goods),
          freight: Math.round(freight),
          at,
        });
      });
    });
  });

  return { trades, moved: Math.round(moved * 100) / 100, paid: Math.round(paid) };
}
