import { ensureWorldRecords } from "./worldRecords.js?v=fresh-20260703-2223-8e8c574";

// A registry is any entity's memory of other entities: a hub traffic office,
// patrol faction, company, criminal network, or future creature intelligence.
// It is intentionally not hub-specific.
export function getRegistryEntityIdForSite(site) {
  return site ? `site:${site.id}:traffic-registry` : "registry:unknown";
}

export function rememberRegistrySubject(
  state,
  {
    registryEntityId,
    subjectEntityId,
    status = "known",
    disposition = "neutral",
    source = "unknown",
    data = {},
  },
) {
  if (!registryEntityId || !subjectEntityId) {
    return null;
  }

  const records = ensureWorldRecords(state);
  records.registries[registryEntityId] ??= {
    id: registryEntityId,
    subjects: {},
    updatedAt: Date.now(),
  };

  const registry = records.registries[registryEntityId];
  const previous = registry.subjects[subjectEntityId] ?? {};
  registry.subjects[subjectEntityId] = {
    ...previous,
    ...data,
    subjectEntityId,
    status,
    disposition,
    source,
    seenCount: (previous.seenCount ?? 0) + 1,
    firstSeenAt: previous.firstSeenAt ?? Date.now(),
    lastSeenAt: Date.now(),
  };
  registry.updatedAt = Date.now();

  return registry.subjects[subjectEntityId];
}

export function getRegistrySubject(state, { registryEntityId, subjectEntityId }) {
  return ensureWorldRecords(state).registries?.[registryEntityId]?.subjects?.[subjectEntityId] ?? null;
}

export function isKnownToRegistry(state, { registryEntityId, subjectEntityId }) {
  return Boolean(getRegistrySubject(state, { registryEntityId, subjectEntityId }));
}

export function hasRegistryStatus(state, { registryEntityId, subjectEntityId, status }) {
  return getRegistrySubject(state, { registryEntityId, subjectEntityId })?.status === status;
}
