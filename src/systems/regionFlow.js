import { TRADED_FAMILIES, getFamilyConsumptionRates } from "./hubInventory.js?v=fresh-20260822-1334-internal";
import { getResourceEffectiveYield, getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260822-1334-internal";
import { POPULATION_NEEDS, POPULATION_PROFILES, NEED_KIND, getScaledDemandInterval } from "./populationDemand.js?v=fresh-20260822-1334-internal";

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
// Phase C gives this model custody only after a hub's transactional work is
// quiescent, then writes the result back before detailed simulation resumes.
// The institutional actor itself is never serialized into this flow or replaced.

export const FLOW_MODEL_VERSION = 1;

// ── Demand: authored, exact ─────────────────────────────────────────────────

// Everything a settlement's population reliably does per second, from the same
// authored records the detailed simulation reads. If these disagree with the
// detailed path, one of them has a bug — they are not two estimates.
export function deriveDemandRates(institutionId, state = null) {
  const profiles = state
    ? Object.values(state.population?.populations ?? {}).filter((profile) => profile.hubInstitutionId === institutionId)
      .map((profile) => ({ ...profile, needIds: Object.keys(profile.needs ?? {}) }))
    : POPULATION_PROFILES.filter((profile) => profile.hubInstitutionId === institutionId);

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
    consumption: getFamilyConsumptionRates(institutionId, state),
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
export function minimumObservationSeconds(institutionId, state = null) {
  // Read through the SCALED interval, because that is the cycle the settlement
  // actually runs on. A small place waits proportionally longer between wanting
  // things, so watching it for the authored interval would once again be taking
  // a glance and calling it an observation — the exact mistake this floor exists
  // to prevent, just re-introduced by the population scaling.
  const profiles = state
    ? Object.values(state.population?.populations ?? {}).filter((profile) => profile.hubInstitutionId === institutionId)
      .map((profile) => ({ ...profile, needIds: Object.keys(profile.needs ?? {}) }))
    : POPULATION_PROFILES.filter((profile) => profile.hubInstitutionId === institutionId);
  const intervals = profiles
    .flatMap((profile) => profile.needIds
      .map((needId) => POPULATION_NEEDS[needId])
      .filter(Boolean)
      .map((need) => getScaledDemandInterval(need, profile)));
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
export function observeSupplyRates(samples, institutionId, state = null) {
  const seen = samples.filter((sample) => sample?.actors?.[institutionId]);
  if (seen.length < 2) return null;

  const first = seen[0];
  const last = seen[seen.length - 1];
  const seconds = (last.t - first.t) / 1000;
  if (!(seconds > 0)) return null;
  if (seconds < minimumObservationSeconds(institutionId, state)) return null;

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

  const earlyCash = first.actors[institutionId].cash ?? 0;
  const lateCash = last.actors[institutionId].cash ?? 0;
  return { supply, observedSeconds: seconds, samples: seen.length, consumed, observedCashPerSecond: (lateCash - earlyCash) / seconds };
}

// How much history a region actually has, against how much it needs.
//
// `observeSupplyRates` answers this with a null, which is the right answer for a
// caller deciding whether to advance and the wrong one for a reader asking why
// nothing has happened. "Not enough history" and "how much short am I" are
// different questions, and only the second one tells you whether to keep
// waiting or to go and look at something else.
export function describeObservation(samples, institutionId, state = null) {
  const seen = samples.filter((sample) => sample?.actors?.[institutionId]);
  const availableSeconds = seen.length >= 2 ? (seen[seen.length - 1].t - seen[0].t) / 1000 : 0;
  const requiredSeconds = minimumObservationSeconds(institutionId, state);
  return {
    availableSeconds,
    requiredSeconds,
    samples: seen.length,
    sufficient: seen.length >= 2 && availableSeconds >= requiredSeconds,
  };
}

// ── The flow state ──────────────────────────────────────────────────────────

export function createRegionFlow(state, institutionId, { samples = [], at = Date.now() } = {}) {
  const record = state.logistics?.institutions?.[institutionId] ?? null;
  const stock = Object.fromEntries(TRADED_FAMILIES.map((family) => [family, 0]));
  Object.entries(record?.inventories ?? {}).forEach(([resourceId, units]) => {
    const family = getResourceFamily(resourceId);
    if (stock[family] !== undefined && units > 0) stock[family] += units * getResourceEffectiveYield(resourceId);
  });

  const observed = observeSupplyRates(samples, institutionId, state);
  const populations = Object.fromEntries(Object.values(state.population?.populations ?? {})
    .filter((population) => population.hubInstitutionId === institutionId)
    .map((population) => [population.id, {
      cash: population.householdCash ?? 0,
      totalIncome: population.totalIncome ?? 0,
      totalSpent: population.totalSpent ?? 0,
      totalDiscarded: population.totalDiscarded ?? 0,
      // The income faucet's valve. Without it the aggregate keeps creating
      // credits the detailed path would have discarded, and the two models
      // disagree about how much money exists.
      cashCap: population.householdCashCap ?? null,
    }]));
  return {
    version: FLOW_MODEL_VERSION,
    institutionId,
    at,
    stock,
    cash: record?.accounts?.operating?.balance ?? 0,
    demand: deriveDemandRates(institutionId, state),
    // Null until the region has been watched long enough to know. Advancing a
    // flow with unknown supply is refused rather than assumed.
    supply: observed?.supply ?? null,
    observedCashPerSecond: observed?.observedCashPerSecond ?? null,
    populations,
    observedSeconds: observed?.observedSeconds ?? 0,
    // What the aggregate owes the world's books while it runs.
    burnedCumulative: 0,
    createdCumulative: 0,
    discardedCumulative: 0,
    revenueCumulative: 0,
  };
}

// Advance a region by elapsed time.
//
// Refuses rather than guesses when supply is unknown: an aggregate that assumes
// nothing arrives would drain a working settlement to empty and then report a
// famine that the detailed simulation never had.
// Blend what actually arrived into the rate, on the timescale the rate was
// measured over. `observedSeconds` is that timescale by construction, so a
// region re-learns its own supply at the speed it was originally learned.
//
// Returns the rate unchanged when there is nothing to learn from — a step with
// no inflow measurement at all is not evidence of zero, it is an absence of
// evidence, and the distinction is the same one `minimumObservationSeconds`
// exists to protect.
export function reobserveSupply(flow, seconds, externalInflow) {
  if (!externalInflow) return flow.supply;
  const window = Math.max(1, flow.observedSeconds || 0);
  const weight = Math.min(1, seconds / window);
  const blended = {};
  TRADED_FAMILIES.forEach((family) => {
    const held = flow.supply[family] ?? 0;
    const measured = Math.max(0, externalInflow[family] ?? 0) / seconds;
    blended[family] = held + (measured - held) * weight;
  });
  return blended;
}

// `externalInflow` is material that REALLY arrived at this region since the last
// step — a hauler that was already carrying its cargo, an extraction allocation
// finishing, a supplier shipping out. It is netted against the modelled supply
// rather than added to it.
//
// Without netting, a region with live freight still running would be credited
// twice: once by the rate this model observed, and once by the delivery that
// actually landed. The observed rate is a description of that same freight, not
// a second source of it. So reality is counted first and the model only makes up
// the difference — and when reality covers everything, the model adds nothing.
export function advanceRegionFlow(flow, seconds, { externalInflow = null } = {}) {
  if (!flow || !(seconds > 0)) return flow;
  if (!flow.supply) return { ...flow, blocked: "supply-rate-unknown" };

  // The supply rate is RE-OBSERVED, not held.
  //
  // A rate measured once and extrapolated forever is how an eight-hour run ends
  // with one settlement sitting on 700 units it was never sent and another
  // starved to nothing: the model kept crediting freight from a trade network
  // that had stopped running, because every hub in it was aggregated too.
  //
  // Reality is the only evidence there is, so it keeps being consulted. Each
  // step blends what actually arrived into the rate, over the timescale the rate
  // was originally measured on — long enough that a gap between lumpy deliveries
  // is not mistaken for a famine, short enough that a supplier which has genuinely
  // stopped is noticed within a window or two.
  //
  // This bounds staleness and cures aggregate-to-aggregate phantom supply with
  // the same mechanism, and it can only ever reduce invented material.
  const supply = reobserveSupply(flow, seconds, externalInflow);
  const stock = { ...flow.stock };
  const shortfall = {};
  let wantedTotal = 0;
  let drawnTotal = 0;

  const familyMovement = {};
  TRADED_FAMILIES.forEach((family) => {
    const modelled = (supply[family] ?? 0) * seconds;
    // Reality first; the model supplies only the shortfall.
    const arriving = Math.max(0, modelled - Math.max(0, externalInflow?.[family] ?? 0));
    const wanted = (flow.demand.consumption[family] ?? 0) * seconds;
    const available = stock[family] + arriving;
    // A shelf cannot go below empty, and what could not be consumed was not
    // consumed — the shortfall is reported rather than silently drawn.
    const drawn = Math.min(wanted, available);
    stock[family] = available - drawn;
    shortfall[family] = round2(wanted - drawn);
    wantedTotal += wanted;
    drawnTotal += drawn;
    familyMovement[family] = { available, wanted, drawn };
  });

  // A settlement only pays for what it is actually handed, and a hub only burns
  // production credits on goods it actually finishes. Booking either at the
  // authored rate would have an empty hub quietly earning full revenue, which
  // is precisely the starvation case this world spends most of its time in.
  const stockServed = wantedTotal > 0 ? drawnTotal / wantedTotal : 1;
  const populationEntries = Object.entries(flow.populations ?? {});
  const populationCash = populationEntries.reduce((sum, [, population]) => sum + population.cash, 0);
  const populationTotal = populationCash;
  const shareOf = (population, index) => (populationTotal > 0
    ? population.cash / populationTotal
    : 1 / Math.max(1, populationEntries.length));

  // INCOME IS SETTLED FIRST, and it is settled through the cap.
  //
  // The order matters and getting it wrong mints money. Income is credited only
  // up to each household's cash cap, exactly as the detailed path does, and the
  // surplus is DISCARDED — never created. What a settlement can then afford has
  // to be judged against the income it ACTUALLY received, not against the income
  // the rate would have paid an uncapped household.
  //
  // An eight-hour unattended run found the difference. Every household ends up
  // pinned at its cap; there the affordability test was still reading the
  // uncapped rate, so hubs were paid revenue out of income their people never
  // got. A poor household at its cap could be billed 900 while holding 50, and
  // the missing 850 was minted into the hub's treasury.
  let discarded = 0;
  let createdReceived = 0;
  const incomeByPopulation = populationEntries.map(([id, population], index) => {
    const income = flow.demand.householdIncomePerSecond * seconds * shareOf(population, index);
    const room = Number.isFinite(population.cashCap) ? Math.max(0, population.cashCap - population.cash) : income;
    const receivedIncome = Math.min(income, room);
    discarded += income - receivedIncome;
    createdReceived += receivedIncome;
    return { id, population, receivedIncome, refused: income - receivedIncome, share: shareOf(population, index) };
  });

  const wantedRevenue = flow.demand.householdSpendPerSecond * seconds * stockServed;
  // Households can only spend money that exists: what they already hold plus
  // what the faucet actually gave them.
  const payableRevenue = Math.min(wantedRevenue, populationCash + createdReceived);
  const affordableFraction = wantedRevenue > 0 ? payableRevenue / wantedRevenue : 1;
  const served = stockServed * affordableFraction;
  const revenue = payableRevenue;
  const burned = flow.demand.productionBurnPerSecond * seconds * served;
  // Stock reserved for an unaffordable purchase remains on the shelf.
  Object.entries(familyMovement).forEach(([family, movement]) => {
    const actuallyDrawn = movement.drawn * affordableFraction;
    stock[family] = movement.available - actuallyDrawn;
    shortfall[family] = round2(movement.wanted - actuallyDrawn);
  });
  // Income is not earned from the shelf — households are paid regardless of
  // whether there is anything to buy, which is why their cash piles up in a
  // starved settlement instead of vanishing with the goods.
  const populations = Object.fromEntries(incomeByPopulation.map((entry) => {
    const spend = revenue * entry.share;
    return [entry.id, {
      ...entry.population,
      cash: Math.max(0, entry.population.cash + entry.receivedIncome - spend),
      totalIncome: entry.population.totalIncome + entry.receivedIncome,
      totalSpent: entry.population.totalSpent + spend,
      totalDiscarded: (entry.population.totalDiscarded ?? 0) + entry.refused,
    }];
  }));

  return {
    ...flow,
    at: flow.at + seconds * 1000,
    supply,
    // Only stamped when the rate was actually re-measured against reality.
    resyncedAt: externalInflow ? flow.at + seconds * 1000 : (flow.resyncedAt ?? null),
    stock,
    shortfall,
    servedFraction: round2(served),
    // Observed cash drift is retained as a diagnostic, but is not replayed: it
    // can contain payments to detailed counterparties and applying only one
    // side would create or destroy credits at the aggregation boundary.
    cash: flow.cash + revenue - burned,
    populations,
    burnedCumulative: flow.burnedCumulative + burned,
    createdCumulative: flow.createdCumulative + createdReceived,
    discardedCumulative: (flow.discardedCumulative ?? 0) + discarded,
    revenueCumulative: (flow.revenueCumulative ?? 0) + revenue,
    blocked: null,
  };
}

// ── Is it close enough to be worth having? ──────────────────────────────────

// How far the model has drifted from what the detailed simulation actually did.
// The number the handoff continues to justify itself against: an aggregate nobody has
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

// ── How far can this flow be trusted right now? ─────────────────────────────
//
// `compareRegionFlow` answers that by MEASURING against a detailed run, which
// is only possible when a detailed run exists to compare with. A live aggregate
// has no such twin — that is the entire point of it — so the question it can
// still answer is "how far past its own evidence is this model being asked to
// run?".
//
// The coefficients are the measurement in docs/level-of-detail.md, not a guess:
// raced against a real detailed simulation, the model was ~5% off on shelf and
// ~8% off on cash by the time it had run for as long as it had been observed,
// and the error accumulated roughly LINEARLY beyond that — four times the span
// gave about four times the drift. So staleness is the ratio of run to
// observation, and the estimate is that ratio times the measured per-window
// error. It is an extrapolation of a measurement and is labelled as one; it is
// not a claim about this particular hub's actual divergence.
export const MEASURED_DRIFT_PER_WINDOW = Object.freeze({ stockFraction: 0.05, cashFraction: 0.08 });

// The band names are the decision, not the number. `within-window` is the case
// the measurement actually covers; everything past it is the model being asked
// for an answer nobody has checked.
export const DRIFT_BAND = Object.freeze({
  WITHIN_WINDOW: "within-window",
  STRETCHED: "stretched",
  BEYOND_WINDOW: "beyond-window",
});

export function driftBand(staleness) {
  if (!(staleness > 1)) return DRIFT_BAND.WITHIN_WINDOW;
  if (staleness <= 2) return DRIFT_BAND.STRETCHED;
  return DRIFT_BAND.BEYOND_WINDOW;
}

export function estimateFlowDrift(flow, runSeconds) {
  const observedSeconds = flow?.observedSeconds ?? 0;
  // A re-observed rate does not keep drifting away from reality: it is an
  // exponential blend whose time constant IS the observation window, so the
  // information in it is never older than about one window however long the
  // region has been aggregated. Staleness saturates instead of growing.
  //
  // This is read off the mechanism, not measured. The 5%/8%-per-window
  // coefficients below were derived against a HELD rate and have not been
  // re-derived for this mode; what has been checked is the pathology they were
  // there to catch — a held rate invents 20,000 units of phantom stock over
  // eight hours and a re-observed one does not move at all.
  const resynced = Boolean(flow?.resyncedAt);
  const ran = resynced
    ? Math.min(Math.max(0, runSeconds ?? 0), observedSeconds)
    : Math.max(0, runSeconds ?? 0);
  // Without an observation window there is no ratio to form. An unobserved flow
  // is not "zero drift"; it is a flow that should never have taken custody, and
  // saying so is more useful than printing 0%.
  if (!(observedSeconds > 0)) {
    return { observedSeconds: 0, runSeconds: ran, staleness: null, stockFraction: null, cashFraction: null, band: null, estimated: true, resynced };
  }
  const staleness = ran / observedSeconds;
  return {
    observedSeconds,
    runSeconds: ran,
    staleness: round2(staleness),
    stockFraction: round2(staleness * MEASURED_DRIFT_PER_WINDOW.stockFraction),
    cashFraction: round2(staleness * MEASURED_DRIFT_PER_WINDOW.cashFraction),
    band: driftBand(staleness),
    estimated: true,
    resynced,
  };
}
