import { TRADED_FAMILIES, getFamilyConsumptionRates } from "./hubInventory.js?v=fresh-20260814-0656-3b0bba2";
import { getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260814-0656-3b0bba2";
import { POPULATION_NEEDS, POPULATION_PROFILES, NEED_KIND } from "./populationDemand.js?v=fresh-20260814-0656-3b0bba2";

// A place simulated as RATES rather than as transactions. Step 4, Phase B.
//
// Phase A stopped distant places acting every tick. This is the next question:
// what would it even mean to simulate one without contracts, orders, carriers
// and haggling at all — and would the answer be close enough to the real thing
// to be worth having?
//
// TWO SOURCES, AND THE SPLIT IS THE WHOLE DESIGN.
//
//   DEMAND IS DERIVED, and it is exact. What a settlement's population consumes
//   and what it earns are authored numbers that `hubInventory` and
//   `populationDemand` already publish as rates. Nothing here estimates them.
//
//   SUPPLY IS OBSERVED, because it genuinely is not knowable from the data. How
//   fast ore actually reaches a hub is the outcome of a market — who bid, who
//   had a free ship, how long the road is. So a region's supply rate is MEASURED
//   from what that region was recently seen doing, out of the sampler's own
//   history. A region is aggregated from its observed behaviour, never from a
//   guess about it.
//
// WHAT THIS DELIBERATELY THROWS AWAY, which is the point of it: negotiation,
// contention for a supplier's book, individual carriers and their wear, and
// every blocker. Those are what make a place interesting to watch, and they are
// exactly what nobody is watching six jumps out.
//
// NOT WIRED TO REPLACE ANYTHING, and that is not timidity. A place cannot stop
// being simulated in detail until that detail can be RESTORED — drop a far
// settlement to rates today and the moment the player flies out there it has no
// contracts, no orders, no carrier mid-run, just a number. Restoring it is
// Phase C's job. So this phase builds the model and measures how far it drifts
// from the truth, which is the evidence Phase C needs before anything is
// switched over.

export const FLOW_MODEL_VERSION = 1;

// ── Demand: authored, exact ─────────────────────────────────────────────────

// Everything a settlement's population reliably does per second, from the same
// authored records the detailed simulation reads. If these disagree with the
// detailed path, one of them has a bug — they are not two estimates.
export function deriveDemandRates(institutionId) {
  const profiles = POPULATION_PROFILES.filter((profile) => profile.hubInstitutionId === institutionId);

  let householdIncomePerSecond = 0;
  let householdSpendPerSecond = 0;
  let productionBurnPerSecond = 0;

  profiles.forEach((profile) => {
    householdIncomePerSecond += (profile.incomeAmount ?? 0) / Math.max(1, profile.incomeIntervalSeconds ?? 1);
    profile.needIds.forEach((needId) => {
      const need = POPULATION_NEEDS[needId];
      if (!need) return;
      const perSecond = 1 / Math.max(1, need.demandIntervalSeconds ?? 1);
      // What the population pays the hub — a transfer, not creation.
      householdSpendPerSecond += (need.price ?? 0) * perSecond;
      // What the hub destroys converting material into the finished good. The
      // one credit sink this layer knows of, and the reason an aggregated
      // region can still be reconciled: `burned` has to keep accruing even
      // when nobody is watching the transactions that cause it.
      if (need.kind === NEED_KIND.MANUFACTURED) {
        productionBurnPerSecond += (need.productionCost ?? 0) * perSecond;
      }
    });
  });

  return {
    // Units of each family leaving the shelf per second.
    consumption: getFamilyConsumptionRates(institutionId),
    householdIncomePerSecond,
    householdSpendPerSecond,
    productionBurnPerSecond,
  };
}

// ── Supply: observed, never guessed ─────────────────────────────────────────

// What the population actually managed to buy over a span, converted into the
// material that drawing it off the shelf really cost.
//
// THE AUTHORED RATE IS WHAT A SETTLEMENT WOULD CONSUME IF IT COULD. It is not
// what it did consume. A hub with an empty shelf consumes nothing, however much
// its people want, and the difference between those two is the entire subject of
// this game's economy — a starving settlement is the interesting case, not an
// edge case. So this counts fulfilled purchases and prices them at the same
// per-need material cost `getFamilyConsumptionRates` uses, rather than
// re-deriving a second opinion about what a need costs.
function measureConsumed(first, last, institutionId) {
  const consumed = Object.fromEntries(TRADED_FAMILIES.map((family) => [family, 0]));

  Object.values(last.populations ?? {}).forEach((late) => {
    if (late.hubInstitutionId !== institutionId) return;
    const early = first.populations?.[late.id];
    Object.entries(late.byNeed ?? {}).forEach(([needId, lateNeed]) => {
      const need = POPULATION_NEEDS[needId];
      if (!need) return;
      const purchased = (lateNeed.purchased ?? 0) - (early?.byNeed?.[needId]?.purchased ?? 0);
      if (!(purchased > 0)) return;
      const families = need.families ?? TRADED_FAMILIES;
      const share = (purchased * (need.materialUnits ?? 0)) / families.length;
      families.forEach((family) => {
        if (consumed[family] === undefined) return;
        consumed[family] += share;
      });
    });
  });

  return consumed;
}

// How long a place has to be watched before what it was seen doing counts as a
// rate. Derived, not picked: below one full cycle of a settlement's slowest
// need, no purchase was even due, so an empty span is not evidence of famine —
// it is evidence of having looked too briefly.
//
// This matters because "known to be zero" and "not yet known" lead the model to
// opposite behaviour: the first drains a working hub to empty, the second
// refuses to advance. A freshly booted world is the second, and reporting it as
// the first is exactly the kind of false certainty this module exists to avoid.
export function minimumObservationSeconds(institutionId) {
  const intervals = POPULATION_PROFILES
    .filter((profile) => profile.hubInstitutionId === institutionId)
    .flatMap((profile) => profile.needIds.map((needId) => POPULATION_NEEDS[needId]?.demandIntervalSeconds ?? 0));
  return intervals.length > 0 ? Math.max(...intervals) : 0;
}

// How fast material actually arrived, read out of the region's own history.
//
// Deliberately measured over the WHOLE window rather than the last step: supply
// arrives in six-unit lots at irregular intervals, so any short window reports
// either a spike or a drought and neither is the rate.
//
// Returns null rather than zero when there is not enough history. A region that
// has never been watched has an UNKNOWN supply rate, and treating unknown as
// "nothing arrives" would starve it on contact with the aggregate model.
export function observeSupplyRates(samples, institutionId) {
  const seen = samples.filter((sample) => sample?.actors?.[institutionId]);
  if (seen.length < 2) return null;

  const first = seen[0];
  const last = seen[seen.length - 1];
  const seconds = (last.t - first.t) / 1000;
  if (!(seconds > 0)) return null;
  if (seconds < minimumObservationSeconds(institutionId)) return null;

  const consumed = measureConsumed(first, last, institutionId);
  const supply = {};
  TRADED_FAMILIES.forEach((family) => {
    const from = first.actors[institutionId].byFamily?.[family] ?? 0;
    const to = last.actors[institutionId].byFamily?.[family] ?? 0;
    // Net change plus what was OBSERVED to be consumed is what arrived. Reading
    // the stock delta alone would report a hub that is exactly keeping up as
    // producing nothing; crediting the authored rate instead of the measured one
    // does the opposite and reports an empty shelf as perfectly supplied, which
    // is how this was first written and how it read six starving hubs as healthy.
    supply[family] = Math.max(0, (to - from + (consumed[family] ?? 0)) / seconds);
  });

  return { supply, observedSeconds: seconds, samples: seen.length, consumed };
}

// ── The flow state ──────────────────────────────────────────────────────────

export function createRegionFlow(state, institutionId, { samples = [], at = Date.now() } = {}) {
  const record = state.logistics?.institutions?.[institutionId] ?? null;
  const stock = Object.fromEntries(TRADED_FAMILIES.map((family) => [family, 0]));
  Object.entries(record?.inventories ?? {}).forEach(([resourceId, units]) => {
    const family = getResourceFamily(resourceId);
    if (stock[family] !== undefined && units > 0) stock[family] += units;
  });

  const observed = observeSupplyRates(samples, institutionId);
  return {
    version: FLOW_MODEL_VERSION,
    institutionId,
    at,
    stock,
    cash: record?.accounts?.operating?.balance ?? 0,
    demand: deriveDemandRates(institutionId),
    // Null until the region has been watched long enough to know. Advancing a
    // flow with unknown supply is refused rather than assumed.
    supply: observed?.supply ?? null,
    observedSeconds: observed?.observedSeconds ?? 0,
    // What the aggregate owes the world's books while it runs.
    burnedCumulative: 0,
    createdCumulative: 0,
  };
}

// Advance a region by elapsed time.
//
// Refuses rather than guesses when supply is unknown: an aggregate that assumes
// nothing arrives would drain a working settlement to empty and then report a
// famine that the detailed simulation never had.
export function advanceRegionFlow(flow, seconds) {
  if (!flow || !(seconds > 0)) return flow;
  if (!flow.supply) return { ...flow, blocked: "supply-rate-unknown" };

  const stock = { ...flow.stock };
  const shortfall = {};
  let wantedTotal = 0;
  let drawnTotal = 0;

  TRADED_FAMILIES.forEach((family) => {
    const arriving = (flow.supply[family] ?? 0) * seconds;
    const wanted = (flow.demand.consumption[family] ?? 0) * seconds;
    const available = stock[family] + arriving;
    // A shelf cannot go below empty, and what could not be consumed was not
    // consumed — the shortfall is reported rather than silently drawn.
    const drawn = Math.min(wanted, available);
    stock[family] = available - drawn;
    shortfall[family] = round2(wanted - drawn);
    wantedTotal += wanted;
    drawnTotal += drawn;
  });

  // A settlement only pays for what it is actually handed, and a hub only burns
  // production credits on goods it actually finishes. Booking either at the
  // authored rate would have an empty hub quietly earning full revenue, which
  // is precisely the starvation case this world spends most of its time in.
  const served = wantedTotal > 0 ? drawnTotal / wantedTotal : 1;
  const revenue = flow.demand.householdSpendPerSecond * seconds * served;
  const burned = flow.demand.productionBurnPerSecond * seconds * served;
  // Income is not earned from the shelf — households are paid regardless of
  // whether there is anything to buy, which is why their cash piles up in a
  // starved settlement instead of vanishing with the goods.
  const created = flow.demand.householdIncomePerSecond * seconds;

  return {
    ...flow,
    at: flow.at + seconds * 1000,
    stock,
    shortfall,
    servedFraction: round2(served),
    cash: flow.cash + revenue - burned,
    burnedCumulative: flow.burnedCumulative + burned,
    createdCumulative: flow.createdCumulative + created,
    blocked: null,
  };
}

// ── Is it close enough to be worth having? ──────────────────────────────────

// How far the model has drifted from what the detailed simulation actually did.
// The number Phase C has to justify itself against: an aggregate nobody has
// measured is a guess with extra steps.
export function compareRegionFlow(flow, snapshot) {
  const actual = snapshot?.actors?.[flow.institutionId];
  if (!actual) return null;

  const stockDrift = {};
  let worstStockDrift = 0;
  TRADED_FAMILIES.forEach((family) => {
    const modelled = flow.stock[family] ?? 0;
    const real = actual.byFamily?.[family] ?? 0;
    const drift = modelled - real;
    stockDrift[family] = round2(drift);
    const relative = real > 0 ? Math.abs(drift) / real : (modelled > 0 ? 1 : 0);
    worstStockDrift = Math.max(worstStockDrift, relative);
  });

  const cashDrift = flow.cash - (actual.cash ?? 0);
  return {
    institutionId: flow.institutionId,
    stockDrift,
    cashDrift: Math.round(cashDrift),
    cashDriftFraction: actual.cash ? round2(Math.abs(cashDrift) / actual.cash) : null,
    worstStockDriftFraction: round2(worstStockDrift),
  };
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
