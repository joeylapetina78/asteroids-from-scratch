import { actorHasCapability } from "./assetCapabilities.js?v=fresh-20260821-2304-60f29300";
import { appendHubHistory, getHubActor, listHubActors, upsertHubProject } from "./hubActors.js?v=fresh-20260821-2304-60f29300";
import { getActorProtectedCash } from "./actorConfig.js?v=fresh-20260821-2304-60f29300";
import { isHubAggregated } from "./simulationMode.js?v=fresh-20260821-2304-60f29300";

export const HUB_RESPONSE_KIND = Object.freeze({
  IMPORT: "import",
  SUBSIDIZE: "subsidize",
  BUILD: "build",
  COMMISSION: "commission",
  DELAY: "delay",
  BORROW: "borrow",
  ACCEPT_SHORTAGE: "accept-shortage",
});

const BASE_RESPONSE_SCORES = Object.freeze({
  [HUB_RESPONSE_KIND.IMPORT]: 70,
  [HUB_RESPONSE_KIND.SUBSIDIZE]: 64,
  [HUB_RESPONSE_KIND.BUILD]: 58,
  [HUB_RESPONSE_KIND.COMMISSION]: 60,
  [HUB_RESPONSE_KIND.BORROW]: 32,
  [HUB_RESPONSE_KIND.DELAY]: 16,
  [HUB_RESPONSE_KIND.ACCEPT_SHORTAGE]: 4,
});
const URGENCY_SCORES = Object.freeze({ routine: 0, urgent: 18, emergency: 40 });

function requirementsFor(option) {
  return {
    credits: Math.max(0, option.requirements?.credits ?? option.estimatedCost ?? 0),
    labor: Math.max(0, option.requirements?.labor ?? 0),
    materials: { ...(option.requirements?.materials ?? {}) },
    durationSeconds: Math.max(0, option.requirements?.durationSeconds ?? 0),
  };
}

function evaluateOption(state, hub, option) {
  const requirements = requirementsFor(option);
  const blockers = [];
  if (option.capabilityId && !actorHasCapability(state, hub.id, option.capabilityId)) {
    blockers.push({ kind: "missing-capability", capabilityId: option.capabilityId });
  }
  const availableCash = Math.max(0, (hub.treasury?.balance ?? 0) - (hub.treasury?.committed ?? 0)
    - getActorProtectedCash(state, hub.id));
  if (requirements.credits > availableCash && option.kind !== HUB_RESPONSE_KIND.BORROW) {
    blockers.push({ kind: "insufficient-cash", required: requirements.credits, available: availableCash });
  }
  if (requirements.labor > (hub.labor?.available ?? 0)) {
    blockers.push({ kind: "insufficient-labor", required: requirements.labor, available: hub.labor?.available ?? 0 });
  }
  Object.entries(requirements.materials).forEach(([itemId, units]) => {
    const available = hub.inventory?.[itemId] ?? 0;
    if (available < units) blockers.push({ kind: "insufficient-material", itemId, required: units, available });
  });
  if (option.kind === HUB_RESPONSE_KIND.BORROW && option.allowDebt !== true
    && hub.institution.policies?.finance?.allowBorrowing !== true) {
    blockers.push({ kind: "borrowing-not-authorized" });
  }
  return { feasible: blockers.length === 0, blockers, requirements, availableCash };
}

function scoreOption(hub, need, option) {
  const traits = hub.policies.institutional ?? {};
  let score = option.priority ?? BASE_RESPONSE_SCORES[option.kind] ?? 0;
  score += URGENCY_SCORES[need.urgency] ?? 0;
  if ([HUB_RESPONSE_KIND.BUILD, HUB_RESPONSE_KIND.COMMISSION].includes(option.kind)) score += (traits.growthBias ?? 0) * 24;
  if ([HUB_RESPONSE_KIND.DELAY, HUB_RESPONSE_KIND.ACCEPT_SHORTAGE].includes(option.kind)) score += (traits.caution ?? 0) * 8;
  if (option.kind === HUB_RESPONSE_KIND.BORROW) score -= (traits.caution ?? 0) * 22;
  if (option.kind === HUB_RESPONSE_KIND.IMPORT) score += (traits.caution ?? 0) * 6;
  return score;
}

function defaultOptions(need) {
  return [
    { kind: HUB_RESPONSE_KIND.IMPORT, capabilityId: "procure-input", executor: "procurement" },
    { kind: HUB_RESPONSE_KIND.SUBSIDIZE, capabilityId: "sponsor-operator", executor: need.executor ?? null },
    { kind: HUB_RESPONSE_KIND.DELAY, executor: null },
    { kind: HUB_RESPONSE_KIND.ACCEPT_SHORTAGE, executor: null },
  ];
}

export function planHubNeed(state, hubId, needId, at = Date.now()) {
  const hub = getHubActor(state, hubId, { at });
  const need = hub?.durable?.needs?.[needId];
  if (!hub || !need || need.status !== "open") return null;
  const existing = need.projectId ? hub.durable.projects[need.projectId] : null;
  if (existing && !["failed", "canceled"].includes(existing.status)) return existing;
  const options = (need.responseOptions?.length ? need.responseOptions : defaultOptions(need))
    .map((option, index) => {
      const normalized = { id: option.id ?? `${need.id}:response:${index + 1}`, ...option };
      return { ...normalized, score: scoreOption(hub, need, normalized), feasibility: evaluateOption(state, hub, normalized) };
    })
    .sort((first, second) => second.score - first.score || first.id.localeCompare(second.id));
  const selected = options.find((option) => option.feasibility.feasible) ?? null;
  const projectId = `hub-project:${hubId}:${need.id}`;
  const project = upsertHubProject(state, hubId, {
    id: projectId, kind: "institutional-response", needId: need.id,
    responseKind: selected?.kind ?? null, capabilityId: selected?.capabilityId ?? null,
    executor: selected?.executor ?? null, requirements: selected?.feasibility.requirements ?? {},
    status: selected ? (selected.kind === HUB_RESPONSE_KIND.DELAY ? "delayed"
      : selected.kind === HUB_RESPONSE_KIND.ACCEPT_SHORTAGE ? "shortage-accepted" : "planned") : "blocked",
    decision: {
      selectedOptionId: selected?.id ?? null,
      rationale: selected?.rationale ?? (selected ? `${selected.kind} was the highest-ranked feasible response.` : "No authorized response is currently feasible."),
      consideredAt: at,
      candidates: options.map((option) => ({ id: option.id, kind: option.kind, capabilityId: option.capabilityId ?? null,
        executor: option.executor ?? null, score: option.score, feasible: option.feasibility.feasible,
        blockers: option.feasibility.blockers, requirements: option.feasibility.requirements })),
    },
  }, at);
  need.projectId = project.id;
  need.selectedResponseKind = project.responseKind;
  need.lastPlannedAt = at;
  appendHubHistory(state, hubId, {
    type: selected ? "hub.responseSelected" : "hub.responseBlocked", subjectId: need.id,
    detail: { projectId: project.id, responseKind: project.responseKind, considered: options.length },
  }, at);
  return project;
}

export function createHubPlanningOperation({ state, now = () => Date.now() } = {}) {
  function decide() {
    listHubActors(state, { at: now() }).filter((hub) => !isHubAggregated(state, hub.id)).forEach((hub) => {
      Object.values(hub.durable.needs).filter((need) => need.status === "open")
        .forEach((need) => planHubNeed(state, hub.id, need.id, now()));
    });
  }
  return { observe() {}, decide, update: decide };
}
