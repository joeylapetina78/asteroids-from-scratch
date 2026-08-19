// One actor table.
//
// WHY THIS EXISTS: an actor record could live in seven different state shapes,
// each invented by whichever domain got there first — `logistics.institutions`,
// `miningOperations.{institution,controller,ships}`, `sprc.{institution,controller}`,
// `population.populations`, `towing.{institution,controller,vehicle}`,
// `fleetInsurance.institution` and `farm.{institution,controller}`. `actorConfig`
// papered over that with a hand-written lookup chain, which answered ONE
// question ("given an id, find the record") and quietly made the more important
// one unanswerable: *who is in this world?*
//
// You cannot generate a mining company procedurally while "being a mining
// company" means a new branch in a lookup chain and a new global in `main.js`.
// This module makes the cast enumerable and extensible, which is the
// precondition for the world growing without the code growing with it.
//
// THIS MODULE OWNS NOTHING. Every entry holds a LIVE REFERENCE to the record
// the domain already owns, so mutating through the index and mutating through
// the domain are the same act. It is an index, not a second copy — a second
// copy would be a second truth, and the save would eventually restore them as
// two different objects.
//
// SOURCES ARE DATA. The seven built-in homes below are ordinary source records,
// not a code path. A new kind of actor registers a source and is immediately
// visible to every consumer — no edit here, and none in `actorConfig`.
//
// Registered sources live on `state` for the reason `extractionOffers` documents
// at length: a bare and a `?v=`-suffixed specifier are DIFFERENT modules, so a
// module-level registry silently forks between the game and the tests. The
// derived index is cached beside them; `state.actorRegistry` is not one of the
// keys `saveManager` persists, so none of this reaches a save file.

export const ACTOR_ROLE = Object.freeze({
  INSTITUTION: "institution",   // a body that owns things and holds accounts
  CONTROLLER: "controller",     // the person who decides for an institution
  SHIP: "ship",                 // a craft that can be committed to work
  VEHICLE: "vehicle",           // a craft that is a service in itself
  POPULATION: "population",     // people considered as a demand centre
});

// A record's role comes from WHAT IT IS, not from which container it happens to
// sit in. `logistics.institutions` holds fourteen people alongside nineteen
// organisations — quartermasters and factors filed under "institutions" because
// that table was the only one going when they were added. Trusting the
// container would tell a generic consumer that Yard Exchange's quartermaster is
// a body that can hold an account and post work, which is how "list every
// institution" quietly becomes wrong.
//
// This is a rule, not a special case: a record that declares itself a person is
// a person wherever it is stored.
function classifyRole(record, containerRole) {
  if (record?.archetypeId === "person" || record?.type === "person") return ACTOR_ROLE.CONTROLLER;
  return containerRole;
}

function entry({ id, record, role, domain, path }) {
  if (!id || !record) return null;
  return { id, record, role: classifyRole(record, role), domain, path };
}

// Every mining operation in the world, tolerating the pre-multi-company shape.
function miningOperations(state) {
  return Object.entries(
    state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}),
  );
}

// The homes that existed before this module did. Each is an ordinary source;
// none of them is special-cased anywhere below.
const BUILT_IN_SOURCES = Object.freeze([
  {
    id: "logistics",
    collect: (state) => Object.values(state.logistics?.institutions ?? {}).map((record) =>
      entry({ id: record?.id, record, role: ACTOR_ROLE.INSTITUTION, domain: "logistics", path: `logistics.institutions.${record?.id}` })),
  },
  {
    id: "mining",
    collect: (state) => miningOperations(state).flatMap(([key, mining]) => [
      entry({ id: mining?.institution?.id, record: mining?.institution, role: ACTOR_ROLE.INSTITUTION, domain: "mining", path: `miningOperations.${key}.institution` }),
      entry({ id: mining?.controller?.id, record: mining?.controller, role: ACTOR_ROLE.CONTROLLER, domain: "mining", path: `miningOperations.${key}.controller` }),
      ...Object.entries(mining?.ships ?? {}).map(([shipId, ship]) =>
        entry({ id: shipId, record: ship, role: ACTOR_ROLE.SHIP, domain: "mining", path: `miningOperations.${key}.ships.${shipId}` })),
    ]),
  },
  {
    id: "sprc",
    collect: (state) => [
      entry({ id: state.sprc?.institution?.id, record: state.sprc?.institution, role: ACTOR_ROLE.INSTITUTION, domain: "sprc", path: "sprc.institution" }),
      entry({ id: state.sprc?.controller?.id, record: state.sprc?.controller, role: ACTOR_ROLE.CONTROLLER, domain: "sprc", path: "sprc.controller" }),
    ],
  },
  {
    id: "population",
    collect: (state) => [
      ...Object.entries(state.population?.populations ?? {}).map(([id, record]) =>
        entry({ id, record, role: ACTOR_ROLE.POPULATION, domain: "population", path: `population.populations.${id}` })),
      ...Object.entries(state.population?.operators ?? {}).map(([id, record]) =>
        entry({ id, record, role: ACTOR_ROLE.CONTROLLER, domain: "population-labor", path: `population.operators.${id}` })),
    ],
  },
  {
    // `towing`, not `towService` — the module is named one thing and its state
    // key another. Getting this wrong does not fail; it hands back framework
    // default traits, which is exactly how a misconfigured actor hides. The
    // coverage test is what catches it.
    id: "towing",
    collect: (state) => [
      entry({ id: state.towing?.institution?.id, record: state.towing?.institution, role: ACTOR_ROLE.INSTITUTION, domain: "towing", path: "towing.institution" }),
      entry({ id: state.towing?.controller?.id, record: state.towing?.controller, role: ACTOR_ROLE.CONTROLLER, domain: "towing", path: "towing.controller" }),
      entry({ id: state.towing?.vehicle?.id, record: state.towing?.vehicle, role: ACTOR_ROLE.VEHICLE, domain: "towing", path: "towing.vehicle" }),
    ],
  },
  {
    id: "fleet-insurance",
    collect: (state) => [
      entry({ id: state.fleetInsurance?.institution?.id, record: state.fleetInsurance?.institution, role: ACTOR_ROLE.INSTITUTION, domain: "fleetInsurance", path: "fleetInsurance.institution" }),
    ],
  },
  {
    id: "farm",
    collect: (state) => [
      entry({ id: state.farm?.institution?.id, record: state.farm?.institution, role: ACTOR_ROLE.INSTITUTION, domain: "farm", path: "farm.institution" }),
      entry({ id: state.farm?.controller?.id, record: state.farm?.controller, role: ACTOR_ROLE.CONTROLLER, domain: "farm", path: "farm.controller" }),
    ],
  },
]);

export function ensureActorRegistry(state) {
  state.actorRegistry ??= { sources: {}, index: null, signature: null };
  state.actorRegistry.sources ??= {};
  return state.actorRegistry;
}

// `fn(state) => ActorEntry[]`, where an entry is `{ id, record, role, domain }`.
// Keyed by id, so a source registered twice against the same world registers
// once. This is the door a procedurally-generated actor walks through.
export function registerActorSource(state, id, fn) {
  if (!state || !id || typeof fn !== "function") return;
  const registry = ensureActorRegistry(state);
  registry.sources[id] = fn;
  registry.signature = null;
}

export function unregisterActorSource(state, id) {
  const registry = ensureActorRegistry(state);
  delete registry.sources[id];
  registry.signature = null;
}

export function listActorSources(state) {
  return [...BUILT_IN_SOURCES.map((source) => source.id), ...Object.keys(ensureActorRegistry(state).sources)];
}

// ── The index ──────────────────────────────────────────────────────────────
//
// Rebuilt when the world's actor population changes, detected by a cheap count
// of what each home holds. An index that went stale would be worse than no
// index at all — it would answer confidently and wrongly, which is the failure
// mode `actorConfig` documents as the most expensive one in this system. The
// signature costs a handful of `Object.keys().length` calls, against the
// seven-branch walk with array allocation that every single lookup used to pay.

function computeSignature(state) {
  const mining = miningOperations(state)
    .map(([key, operation]) => `${key}:${Object.keys(operation?.ships ?? {}).length}:${operation?.institution?.id ?? ""}:${operation?.controller?.id ?? ""}`)
    .join(",");
  return [
    Object.keys(state.logistics?.institutions ?? {}).length,
    mining,
    state.sprc?.institution?.id ?? "",
    state.sprc?.controller?.id ?? "",
    Object.keys(state.population?.populations ?? {}).length,
    Object.keys(state.population?.operators ?? {}).length,
    state.towing?.institution?.id ?? "",
    state.towing?.vehicle?.id ?? "",
    state.fleetInsurance?.institution?.id ?? "",
    state.farm?.institution?.id ?? "",
    Object.keys(ensureActorRegistry(state).sources).sort().join("|"),
  ].join("/");
}

function build(state) {
  const registry = ensureActorRegistry(state);
  const index = new Map();

  const sources = [
    ...BUILT_IN_SOURCES,
    ...Object.entries(registry.sources).map(([id, collect]) => ({ id, collect })),
  ];

  sources.forEach((source) => {
    let produced = [];
    try {
      produced = source.collect(state) ?? [];
    } catch (error) {
      console.warn(`[actorRegistry] source '${source.id}' failed: ${error.message}`);
      return;
    }
    produced.forEach((record) => {
      // First source to claim an id keeps it. Built-ins run first, so a
      // registered source cannot silently shadow an existing actor.
      if (record && !index.has(record.id)) index.set(record.id, record);
    });
  });

  registry.index = index;
  registry.signature = computeSignature(state);
  return index;
}

function getIndex(state) {
  const registry = ensureActorRegistry(state);
  if (!registry.index || registry.signature !== computeSignature(state)) return build(state);
  return registry.index;
}

// Force a rebuild on the next read. Only needed if a domain mutates an actor's
// identity in a way the signature cannot see; adding or removing actors is
// detected on its own.
export function invalidateActorRegistry(state) {
  ensureActorRegistry(state).signature = null;
}

// The full entry — record plus where it lives and what part it plays.
export function getActorEntry(state, actorId) {
  if (!actorId) return null;
  return getIndex(state).get(actorId) ?? null;
}

// The live record itself. This is what `actorConfig.findActorRecord` returns.
export function getActorRecord(state, actorId) {
  return getActorEntry(state, actorId)?.record ?? null;
}

// WHO IS IN THIS WORLD. The question the lookup chain could not answer, and the
// one every generic capability, market clearing and generator needs.
export function listActors(state, { role = null, domain = null } = {}) {
  return [...getIndex(state).values()].filter((candidate) => {
    if (role && candidate.role !== role) return false;
    if (domain && candidate.domain !== domain) return false;
    return true;
  });
}

export function listActorIds(state, filter = {}) {
  return listActors(state, filter).map((candidate) => candidate.id);
}

export function countActors(state, filter = {}) {
  return listActors(state, filter).length;
}
