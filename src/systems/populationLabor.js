// Population is both a demand centre and the human foundation from which new
// institutions recruit. Residents are not consumed when they take a job: a
// durable assignment reserves part of the finite working population until the
// work is released. This keeps households, employment and named operators as
// one truth without turning every resident into a fully simulated person.

const WORKFORCE_SHARE = 0.42;
const COMMUNITY_RESERVE_SHARE = 0.18;

const GIVEN_NAMES = Object.freeze([
  "Ari", "Belen", "Corin", "Dessa", "Eli", "Fara", "Galen", "Hollis", "Iona", "Jori", "Kade", "Luma",
]);
const SURNAMES = Object.freeze([
  "Ash", "Brindle", "Cairn", "Dovetail", "Ember", "Fenn", "Gorse", "Hale", "Ivory", "Junction", "Keel", "Lark",
]);
const ROLE_MOTIVATIONS = Object.freeze({
  "freight-operator": [
    "keep the home hub supplied even when the margin is thin",
    "build trusted repeat trade with a small circle of ports",
    "turn reliable local freight into an independent livelihood",
    "connect overlooked settlements before larger carriers notice them",
  ],
  "factory-supervisor": [
    "build dependable local capacity instead of waiting through shortages",
    "make the settlement known for careful, consistent industrial work",
    "turn local material advantages into durable skilled employment",
    "prove that a small works can become a regional supplier",
  ],
});

function deterministicUnit(value) {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function ensurePopulationLaborState(state) {
  state.population ??= { populations: {}, productionOrders: {}, counter: 0 };
  state.population.operators ??= {};
  state.population.laborAssignments ??= {};
  state.population.operatorCounter ??= 0;
  return state.population;
}

export function findHubPopulation(state, hubInstitutionId) {
  return Object.values(ensurePopulationLaborState(state).populations ?? {})
    .find((population) => population.hubInstitutionId === hubInstitutionId) ?? null;
}

export function getPopulationLaborSummary(state, populationOrId) {
  const labor = ensurePopulationLaborState(state);
  const population = typeof populationOrId === "string"
    ? labor.populations?.[populationOrId]
    : populationOrId;
  if (!population) return null;
  const workforce = Math.max(1, Math.floor((population.size ?? 0) * WORKFORCE_SHARE));
  const communityReserve = Math.max(1, Math.floor((population.size ?? 0) * COMMUNITY_RESERVE_SHARE));
  const employable = Math.max(0, workforce - communityReserve);
  const assignments = Object.values(labor.laborAssignments)
    .filter((assignment) => assignment.populationId === population.id && assignment.status === "active");
  const assigned = assignments.reduce((sum, assignment) => sum + (assignment.workers ?? 0), 0);
  return { populationId: population.id, residents: population.size ?? 0, workforce, communityReserve,
    employable, assigned, available: Math.max(0, employable - assigned), assignments };
}

export function recruitPopulationLabor(state, {
  hubInstitutionId, assignmentId, role, workers = 1, employerInstitutionId = hubInstitutionId,
  assetId = null, charter = {}, at = Date.now(), createOperator = true,
} = {}) {
  const labor = ensurePopulationLaborState(state);
  if (!hubInstitutionId || !assignmentId || !role || workers <= 0) return { ok: false, reason: "invalid-request" };
  const existing = labor.laborAssignments[assignmentId];
  if (existing?.status === "active") return { ok: true, assignment: existing, operator: labor.operators[existing.operatorId] ?? null };
  const population = findHubPopulation(state, hubInstitutionId);
  if (!population) return { ok: false, reason: "no-population" };
  const summary = getPopulationLaborSummary(state, population);
  if (summary.available < workers) return { ok: false, reason: "insufficient-labor", available: summary.available, required: workers };

  let operator = null;
  if (createOperator) {
    const sequence = ++labor.operatorCounter;
    const seed = `${population.id}:${role}:${sequence}`;
    const given = GIVEN_NAMES[Math.floor(deterministicUnit(`${seed}:given`) * GIVEN_NAMES.length)];
    const surname = SURNAMES[Math.floor(deterministicUnit(`${seed}:surname`) * SURNAMES.length)];
    const motivations = ROLE_MOTIVATIONS[role] ?? ["make a durable place in the settlement's working life"];
    const id = `person:${population.siteId}:${role}:${sequence}`;
    operator = labor.operators[id] = {
      id, name: `${given} ${surname}`, archetypeId: "person", actorKind: "operational-npc",
      homePopulationId: population.id, homeInstitutionId: hubInstitutionId, homeSiteId: population.siteId,
      employerInstitutionId, role, assignmentId, operatesAssetId: assetId,
      motivation: motivations[Math.floor(deterministicUnit(`${seed}:motivation`) * motivations.length)],
      traits: {
        caution: 0.25 + deterministicUnit(`${seed}:caution`) * 0.55,
        growthBias: 0.2 + deterministicUnit(`${seed}:growth`) * 0.6,
        urgencyBias: 0.3 + deterministicUnit(`${seed}:urgency`) * 0.55,
      },
      charter: { id: `charter:${assignmentId}`, issuerInstitutionId: hubInstitutionId, role, assetId, ...charter },
      createdAt: at, status: "active",
    };
  }
  const assignment = labor.laborAssignments[assignmentId] = {
    id: assignmentId, populationId: population.id, hubInstitutionId, employerInstitutionId,
    role, workers, operatorId: operator?.id ?? null, assetId, charter: operator?.charter ?? charter,
    status: "active", startedAt: at, endedAt: null,
  };
  return { ok: true, assignment, operator };
}

export function releasePopulationLabor(state, assignmentId, { at = Date.now(), reason = "released" } = {}) {
  const labor = ensurePopulationLaborState(state);
  const assignment = labor.laborAssignments[assignmentId];
  if (!assignment || assignment.status !== "active") return false;
  assignment.status = "released";
  assignment.endedAt = at;
  assignment.releaseReason = reason;
  const operator = labor.operators[assignment.operatorId];
  if (operator) { operator.status = "available"; operator.assignmentId = null; operator.employerInstitutionId = null; }
  return true;
}
