// How many hulls exist, and where they went.
//
// WHY THIS EXISTS: a thirteen-minute observation of a story run watched the
// world's mining fleet fall from fourteen hulls to thirteen and reported a
// runaway ratchet — too little work, so hulls stand down, so less ore, so less
// work. By twenty-six minutes the fleet had been flat for twelve minutes and
// four parts works had completed fifty-six runs. The shedding was a one-time
// correction to the real amount of work, not a spiral.
//
// That mistake was not a reasoning error. It was an instrument gap. Money has
// `economySampler` with a series and a reconciled residual; hulls had nothing,
// so the only way to see fleet size over time was to hand-write a sampler in
// the console and wait. This is the missing half: the same treatment for the
// physical fleet, so a transient is distinguishable from a trend at a glance
// rather than after twenty minutes of guessing.
//
// It owns nothing and decides nothing. It reads, records, and reports.

import { appendBoundedHistory } from "./boundedHistory.js?v=fresh-20260908-2037-c924cfc5";

export const FLEET_SAMPLE_INTERVAL_MS = 10_000;
const MAX_SAMPLES = 720;   // two hours at the sample interval
const MAX_EVENTS = 400;

export const HULL_EVENT = Object.freeze({
  COMMISSIONED: "commissioned",  // a hull entered service, and what it cost
  STOOD_DOWN: "stood-down",      // a hull left service, and what left with it
});

export function ensureFleetCensus(state) {
  state.fleetCensus ??= { samples: [], events: [], lastSampleAt: 0 };
  state.fleetCensus.samples ??= [];
  state.fleetCensus.events ??= [];
  return state.fleetCensus;
}

// Every fleet in the world that owns physical working craft.
//
// Mining operations are not the only owners. Yard Exchange Field Recovery flies
// hub-owned `MiningWorkerShip` collectors out of `state.ecologicalRecovery`, and
// the first version of this file did not know that — so it reported a perfectly
// healthy Yard Recovery 1 as "a craft in the world no operation claims" within
// ten minutes of being built. A conservation instrument that cries wolf is worse
// than none, because the ghost it invents costs an hour to chase. Any future
// domain that owns physical craft belongs in this list.
function collectFleets(state) {
  const fleets = [];

  Object.entries(state.miningOperations ?? {}).forEach(([stateKey, operation]) => {
    fleets.push({
      stateKey,
      name: operation?.institution?.name ?? stateKey,
      institutionId: operation?.institution?.id ?? null,
      ships: Object.values(operation?.ships ?? {}),
    });
  });

  const recovery = state.ecologicalRecovery;
  if (recovery?.ships && Object.keys(recovery.ships).length) {
    fleets.push({
      stateKey: "ecological-recovery",
      name: recovery.institution?.name ?? "Field Recovery",
      institutionId: recovery.institution?.id ?? null,
      ships: Object.values(recovery.ships),
    });
  }

  return fleets;
}

// Every hull the world currently believes it has, by operator. Read from the
// owning domains rather than from the physical entity list on purpose: the two
// disagreeing is itself a finding, and `auditFleetIntegrity` reports it.
export function readFleetCensus(state) {
  const byOperator = {};
  let total = 0;

  collectFleets(state).forEach((fleet) => {
    byOperator[fleet.stateKey] = {
      count: fleet.ships.length,
      name: fleet.name,
      institutionId: fleet.institutionId,
    };
    total += fleet.ships.length;
  });

  return { total, byOperator };
}

export function recordFleetSample(state, { now = Date.now(), intervalMs = FLEET_SAMPLE_INTERVAL_MS, force = false } = {}) {
  const census = ensureFleetCensus(state);
  if (!force && now - census.lastSampleAt < intervalMs) return null;

  const reading = readFleetCensus(state);
  census.lastSampleAt = now;
  return appendBoundedHistory(census.samples, {
    t: now,
    total: reading.total,
    byOperator: Object.fromEntries(Object.entries(reading.byOperator).map(([k, v]) => [k, v.count])),
  }, MAX_SAMPLES);
}

// A hull entering or leaving service.
//
// `bookValue` is what the hull was worth on the owner's books — its purchase
// price when it was bought from a yard, and null for a founding hull that was
// seeded rather than built. A null is honest: this world's opening fleet was
// never bought from anyone, so quoting a price for it would be inventing one.
export function recordHullEvent(state, kind, {
  shipId, shipName, operatorId, operatorName, bookValue = null, wear = null,
  idleSeconds = null, reason = null, now = Date.now(),
} = {}) {
  const census = ensureFleetCensus(state);
  return appendBoundedHistory(census.events, {
    t: now, kind, shipId, shipName, operatorId, operatorName,
    bookValue, wear, idleSeconds, reason,
  }, MAX_EVENTS);
}

export function getFleetSamples(state, { windowMs = Infinity, now = Date.now() } = {}) {
  const census = ensureFleetCensus(state);
  if (!Number.isFinite(windowMs)) return census.samples.slice();
  const from = now - windowMs;
  return census.samples.filter((sample) => sample.t >= from);
}

export function getHullEvents(state, { windowMs = Infinity, now = Date.now() } = {}) {
  const census = ensureFleetCensus(state);
  if (!Number.isFinite(windowMs)) return census.events.slice();
  const from = now - windowMs;
  return census.events.filter((event) => event.t >= from);
}

// The asset-side equivalent of `economySampler.reconcile()`.
//
// Money has a residual that says how much of it the books cannot explain. Hulls
// and the people who crew them had no such check, which is how four operators
// stayed employed on ships that had been deleted thirteen minutes earlier
// without anything noticing. Each finding below is a conservation question with
// a right answer, not a balance question:
//
//   orphanedEmployments  a person is assigned to an asset that no longer exists
//   uncrewedHulls        a hull in service with nobody aboard
//   phantomHulls         an operation lists a ship the physical world does not have
//   unlistedHulls        the physical world has a craft no operation claims
//
// `capitalStoodDown` totals the book value of hulls that left service. It is
// deliberately NOT money and must never be fed to the money reconciler: no
// credits moved when a hull was stood down, which is precisely the asymmetry
// worth looking at, since hulls ENTER the world by purchase from a shipyard.
export function auditFleetIntegrity(state, { physicalShipIds = null } = {}) {
  const liveShips = new Map();
  collectFleets(state).forEach((fleet) => {
    fleet.ships.forEach((ship) => {
      liveShips.set(ship.id, { ship, fleet });
    });
  });

  const orphanedEmployments = Object.values(state.population?.laborAssignments ?? {})
    .filter((assignment) => assignment?.status === "active"
      && typeof assignment.assetId === "string"
      && assignment.assetId.startsWith("worker:")
      && !liveShips.has(assignment.assetId))
    .map((assignment) => ({
      assignmentId: assignment.id,
      assetId: assignment.assetId,
      employerInstitutionId: assignment.employerInstitutionId,
      operatorId: assignment.operatorId,
      operatorName: state.population?.operators?.[assignment.operatorId]?.name ?? null,
      workers: assignment.workers ?? 1,
    }));

  // Only crewed domains can report an uncrewed hull. Recovery collectors are
  // hub equipment rather than a berth somebody is employed into, so counting
  // them here would report a permanent, unfixable shortfall.
  const uncrewedHulls = [...liveShips.values()]
    .filter(({ ship, fleet }) => fleet.stateKey !== "ecological-recovery" && !ship.operatorId)
    .map(({ ship, fleet }) => ({
      shipId: ship.id, shipName: ship.name, operatorName: fleet.name,
    }));

  let phantomHulls = [];
  let unlistedHulls = [];
  if (Array.isArray(physicalShipIds)) {
    const physical = new Set(physicalShipIds);
    phantomHulls = [...liveShips.values()]
      .filter(({ ship }) => !physical.has(ship.id))
      .map(({ ship, fleet }) => ({ shipId: ship.id, shipName: ship.name, operatorName: fleet.name }));
    unlistedHulls = physicalShipIds.filter((id) => !liveShips.has(id));
  }

  const events = ensureFleetCensus(state).events;
  const stoodDown = events.filter((event) => event.kind === HULL_EVENT.STOOD_DOWN);
  const commissioned = events.filter((event) => event.kind === HULL_EVENT.COMMISSIONED);

  return {
    hullsInService: liveShips.size,
    orphanedEmployments,
    uncrewedHulls,
    phantomHulls,
    unlistedHulls,
    standDowns: stoodDown.length,
    commissionings: commissioned.length,
    capitalStoodDown: stoodDown.reduce((total, event) => total + (event.bookValue ?? 0), 0),
    capitalStoodDownUnpriced: stoodDown.filter((event) => event.bookValue === null).length,
    clean: orphanedEmployments.length === 0 && phantomHulls.length === 0 && unlistedHulls.length === 0,
  };
}
