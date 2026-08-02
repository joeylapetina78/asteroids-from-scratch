import { INSTITUTION_ARCHETYPES } from "../content/institutions/institutionArchetypes.js?v=fresh-20260801-2313-adfc7a9";
// One place to ask what an actor is and what it has.
//
// Actor records are spread across seven state shapes that grew separately —
// `logistics.institutions`, `miningOperation.{institution,controller,ships}`,
// `sprc.{institution,controller}`, `population.populations`,
// `towing.{institution,controller,vehicle}` and `farm.{institution,controller}`.
// Every caller that wanted a trait, a controller or a balance was hand-rolling
// its own lookup chain, and the read side had already started special-casing
// named institutions to find one.
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

  const miningOperations = Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}));
  for (const mining of miningOperations) {
    if (mining?.institution?.id === actorId) return mining.institution;
    if (mining?.controller?.id === actorId) return mining.controller;
    if (mining?.ships?.[actorId]) return mining.ships[actorId];
  }

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
  if (tow?.vehicle?.id === actorId) return tow.vehicle;

  const farm = state.farm;
  if (farm?.institution?.id === actorId) return farm.institution;
  if (farm?.controller?.id === actorId) return farm.controller;

  return null;
}

// Who decides for this actor. A person controls themselves.
export function getControllerId(state, actorId) {
  const record = findActorRecord(state, actorId);
  if (!record) return null;
  return record.controllerInstitutionId ?? record.ownerInstitutionId ?? record.id ?? null;
}

// ── Resolution with provenance ─────────────────────────────────────────────
//
// Every resolver below reports WHICH LAYER answered, because the two worst bugs
// in this system so far shared one shape: a lookup failed, a plausible default
// took its place, and nothing looked wrong. `urgency: "critical"` quietly became
// routine; Nell quietly got generic traits. A value and its provenance together
// are falsifiable in a way the value alone is not.
//
// `get*` returns the value for call sites that just want to price something.
// `resolve*` returns `{ value, source, reason }` for anything explaining itself.

export const RESOLUTION_SOURCE = Object.freeze({
  CONTROLLER: "controller-configuration",
  OWN: "actor-record",
  ACTOR_POLICY: "actor-policy",
  TRANSPORT_POLICY: "actor-policy:transport",
  ARCHETYPE: "archetype-default",
  LIVE: "live-operating-plan",
  CALLER_FALLBACK: "caller-fallback",
  FRAMEWORK: "framework-default",
  UNRESOLVED: "unresolved",
});

export function getArchetypeId(state, actorId) {
  return findActorRecord(state, actorId)?.archetypeId ?? null;
}

// How this actor's decision-maker behaves. The controller's traits, then the
// actor's own, then the caller's fallback — so an institution with no
// controller still behaves like something rather than silently taking the
// framework default without saying so.
export function resolveActorTraits(state, actorId, fallback = DEFAULT_TRAITS) {
  const record = findActorRecord(state, actorId);
  if (!record) {
    return { value: fallback, source: RESOLUTION_SOURCE.UNRESOLVED, reason: `No record found for '${actorId}' in any state shape.` };
  }

  const controllerId = record.controllerInstitutionId ?? record.ownerInstitutionId ?? null;
  if (controllerId) {
    const controller = findActorRecord(state, controllerId);
    if (controller?.traits) {
      return { value: controller.traits, source: RESOLUTION_SOURCE.CONTROLLER, reason: `Decided by ${controller.name ?? controllerId}.` };
    }
    if (!controller) {
      return { value: record.traits ?? fallback, source: RESOLUTION_SOURCE.UNRESOLVED, reason: `Controller '${controllerId}' is named but could not be found.` };
    }
    if (!record.traits) {
      return { value: fallback, source: RESOLUTION_SOURCE.UNRESOLVED, reason: `Controller ${controller.name ?? controllerId} carries no traits.` };
    }
  }
  if (record.traits) return { value: record.traits, source: RESOLUTION_SOURCE.OWN, reason: null };
  return {
    value: fallback,
    source: fallback === DEFAULT_TRAITS ? RESOLUTION_SOURCE.FRAMEWORK : RESOLUTION_SOURCE.CALLER_FALLBACK,
    reason: `${actorId} has nobody running it and no traits of its own.`,
  };
}

export function getActorTraits(state, actorId, fallback = DEFAULT_TRAITS) {
  return resolveActorTraits(state, actorId, fallback).value;
}

// A default an actor's KIND supplies, behind whatever the instance says.
export function getArchetype(state, actorId) {
  return INSTITUTION_ARCHETYPES[getArchetypeId(state, actorId)] ?? null;
}

export function getArchetypeDefault(state, actorId, key) {
  return getArchetype(state, actorId)?.defaultPolicy?.[key];
}

// What kinds of work this actor may put on a public board. An archetype that
// declares none can still act, but it cannot post.
export function getActorOfferTypes(state, actorId) {
  return getArchetype(state, actorId)?.offerTypes ?? [];
}

export function getActorAccount(state, actorId) {
  const record = findActorRecord(state, actorId);
  if (record?.accounts?.operating) return record.accounts.operating;
  // SPRC keeps its operating account beside the institution rather than on it.
  if (state.sprc?.institution?.id === actorId && state.sprc?.account) return state.sprc.account;
  return null;
}

// The float an actor keeps back — money it has but will not spend. Three
// systems named this three different ways, and a reader had to know what kind
// of actor it was looking at to find it.
//
// Four layers, most specific first, and the layer that answered is reported.
// Deliberately NOT strategic: nothing here reacts to distress, obligations or
// expected revenue. It is configuration, so two otherwise identical settlements
// can have different financial temperaments without a line of code.
export function resolveActorProtectedCash(state, actorId) {
  const onAccount = getActorAccount(state, actorId)?.protectedReserve;
  if (Number.isFinite(onAccount)) {
    return { value: onAccount, source: RESOLUTION_SOURCE.LIVE, reason: "An operating plan is currently holding this back." };
  }
  const record = findActorRecord(state, actorId);
  if (!record) return { value: 0, source: RESOLUTION_SOURCE.UNRESOLVED, reason: `No record found for '${actorId}'.` };

  const explicit = record.policies?.protectedCash;
  if (Number.isFinite(explicit)) return { value: explicit, source: RESOLUTION_SOURCE.ACTOR_POLICY, reason: null };

  const carrierFloor = record.policies?.transportation?.minimumOperatingCash;
  if (Number.isFinite(carrierFloor)) return { value: carrierFloor, source: RESOLUTION_SOURCE.TRANSPORT_POLICY, reason: null };

  const fromArchetype = getArchetypeDefault(state, actorId, "protectedCash");
  if (Number.isFinite(fromArchetype)) {
    return { value: fromArchetype, source: RESOLUTION_SOURCE.ARCHETYPE, reason: `Default for a ${record.archetypeId}.` };
  }
  return { value: 0, source: RESOLUTION_SOURCE.FRAMEWORK, reason: `${actorId} names no float and its kind supplies none.` };
}

export function getActorProtectedCash(state, actorId) {
  return resolveActorProtectedCash(state, actorId).value;
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

// Where each configured value for this actor actually came from.
//
// Small on purpose — this is not a general provenance framework, it is the
// handful of fields that have already hidden a bug. Read it when an actor is
// behaving like somebody else: a `source` of `unresolved` or `framework-default`
// on anything that decides is the tell.
export function describeActorResolution(state, actorId) {
  const record = findActorRecord(state, actorId);
  if (!record) {
    return { actorId, found: false, traits: { source: RESOLUTION_SOURCE.UNRESOLVED, reason: `No record for '${actorId}'.` } };
  }
  const traits = resolveActorTraits(state, actorId);
  const protectedCash = resolveActorProtectedCash(state, actorId);
  const archetypeId = record.archetypeId ?? null;
  const archetype = getArchetype(state, actorId);
  const controllerId = record.controllerInstitutionId ?? record.ownerInstitutionId ?? null;

  return {
    actorId,
    found: true,
    archetype: {
      id: archetypeId,
      defined: Boolean(archetype),
      // A row that owns nothing decides nothing, however configured it looks.
      owns: archetype
        ? [
          archetype.capabilities?.length ? `capabilities(${archetype.capabilities.length})` : null,
          archetype.offerTypes?.length ? `offerTypes(${archetype.offerTypes.length})` : null,
          archetype.recipes?.length ? `recipes(${archetype.recipes.length})` : null,
          Object.keys(archetype.defaultPolicy ?? {}).length ? `defaultPolicy(${Object.keys(archetype.defaultPolicy).length})` : null,
        ].filter(Boolean)
        : [],
      reason: archetype ? null : (archetypeId ? `Archetype '${archetypeId}' is named but not defined.` : "This actor names no archetype."),
    },
    controller: {
      id: controllerId,
      resolved: controllerId ? Boolean(findActorRecord(state, controllerId)) : null,
    },
    traits: { value: traits.value, source: traits.source, reason: traits.reason },
    protectedCash: { value: protectedCash.value, source: protectedCash.source, reason: protectedCash.reason },
    account: getActorAccount(state, actorId) ? RESOLUTION_SOURCE.ACTOR_POLICY : RESOLUTION_SOURCE.UNRESOLVED,
    offerTypes: getActorOfferTypes(state, actorId),
  };
}

export { DEFAULT_TRAITS };
