// One place to ask what an actor is and what it has.
//
// Actor records are spread across six state shapes that grew separately —
// `logistics.institutions`, `miningOperation.institution/controller/ships`,
// `sprc.institution/controller`, `population.populations`, `towService`, and
// the farm instance. Every caller that wanted a trait, a controller or a
// balance was hand-rolling its own lookup chain, and the read side had already
// started special-casing named institutions to find one.
//
// This module OWNS NOTHING. It resolves an id to the records that already
// exist, so behaviour comes from an actor's configuration rather than from a
// constant chosen by whichever system happens to be asking.
//
// The rule for traits: an institution decides through whoever runs it, so an
// institution's traits are its CONTROLLER's. A person carries their own. That
// is what makes Yard Exchange and The Ledge price differently without either
// of them having a bespoke code path.

const DEFAULT_TRAITS = Object.freeze({ caution: 0.5, growthBias: 0.3, urgencyBias: 0.5 });

// Every place an actor record can live, cheapest lookup first.
export function findActorRecord(state, actorId) {
  if (!actorId) return null;

  const logistics = state.logistics?.institutions?.[actorId];
  if (logistics) return logistics;

  const mining = state.miningOperation;
  if (mining?.institution?.id === actorId) return mining.institution;
  if (mining?.controller?.id === actorId) return mining.controller;
  if (mining?.ships?.[actorId]) return mining.ships[actorId];

  const sprc = state.sprc;
  if (sprc?.institution?.id === actorId) return sprc.institution;
  if (sprc?.controller?.id === actorId) return sprc.controller;

  const population = state.population?.populations?.[actorId];
  if (population) return population;

  // `towing`, not `towService` — the module is named one thing and its state
  // key another. Getting this wrong did not fail; it silently handed back the
  // framework default traits, which is exactly how a misconfigured actor hides.
  // The coverage test below `every seeded actor resolves` is what catches it.
  const tow = state.towing;
  if (tow?.institution?.id === actorId) return tow.institution;
  if (tow?.controller?.id === actorId) return tow.controller;

  return null;
}

// Who decides for this actor. A person controls themselves.
export function getControllerId(state, actorId) {
  const record = findActorRecord(state, actorId);
  if (!record) return null;
  return record.controllerInstitutionId ?? record.ownerInstitutionId ?? record.id ?? null;
}

// How this actor's decision-maker behaves. Resolution order is deliberate:
// the controller's traits, then the actor's own, then the caller's fallback —
// so an institution with no controller still behaves like something rather
// than silently taking the framework default.
export function getActorTraits(state, actorId, fallback = DEFAULT_TRAITS) {
  const record = findActorRecord(state, actorId);
  if (!record) return fallback;

  const controllerId = record.controllerInstitutionId ?? record.ownerInstitutionId ?? null;
  if (controllerId) {
    const controller = findActorRecord(state, controllerId);
    if (controller?.traits) return controller.traits;
  }
  return record.traits ?? fallback;
}

export function getActorAccount(state, actorId) {
  const record = findActorRecord(state, actorId);
  if (record?.accounts?.operating) return record.accounts.operating;
  // SPRC keeps its operating account beside the institution rather than on it.
  if (state.sprc?.institution?.id === actorId && state.sprc?.account) return state.sprc.account;
  return null;
}

// The float an actor keeps back — money it has but will not spend. Three
// different systems named this three different ways, and a reader that wanted
// it had to know which kind of actor it was looking at. Resolved in order of
// specificity; an account may always carry its own reserve, which is how an
// institution whose policy lives somewhere unusual reports one.
export function getActorProtectedCash(state, actorId) {
  // Live value first: an account that publishes a reserve is stating what it is
  // holding back RIGHT NOW, which is what an operating plan revises. Policy is
  // the configured default behind it.
  const onAccount = getActorAccount(state, actorId)?.protectedReserve;
  if (Number.isFinite(onAccount)) return onAccount;
  const record = findActorRecord(state, actorId);
  const explicit = record?.policies?.protectedCash;
  if (Number.isFinite(explicit)) return explicit;
  const carrierFloor = record?.policies?.transportation?.minimumOperatingCash;
  return Number.isFinite(carrierFloor) ? carrierFloor : 0;
}

// Everything the read side needs about one actor's money, in one call.
export function getActorFinances(state, actorId) {
  const account = getActorAccount(state, actorId);
  if (!account) return null;
  const protectedCash = getActorProtectedCash(state, actorId);
  const balance = account.balance ?? 0;
  const committed = account.committed ?? 0;
  return {
    balance,
    committed,
    protectedCash,
    available: Math.max(0, balance - committed - protectedCash),
  };
}

export { DEFAULT_TRAITS };
