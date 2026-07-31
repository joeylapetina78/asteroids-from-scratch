// Ledger querying: turn the raw event stream into a searchable historical
// record. Read-only — it never mutates events.
//
// The reference map below is built from the payload keys events ACTUALLY carry
// (surveyed live), so filters and entity links use real data. Relationships
// between events come only from explicit references or same-id structural
// links; nothing is inferred from timestamps.

import { classifyEvent, getRetentionClass, RETENTION_CLASS } from "./eventRetention.js?v=fresh-20260730-1920-f5dc6a1";

export const REFERENCE_KIND = Object.freeze({
  ACTOR: "actor",
  INSTITUTION: "institution",
  LOCATION: "location",
  CONTRACT: "contract",
  SERVICE: "service",
  ASSET: "asset",
});

// payload key -> { kind, nameKeys[] }. `nameKeys` supply a human label when the
// payload also carries one.
const REFERENCE_FIELDS = Object.freeze({
  // Actors / ships / people
  shipInstitutionId: { kind: REFERENCE_KIND.ACTOR, nameKeys: ["shipName"] },
  npcId: { kind: REFERENCE_KIND.ACTOR, nameKeys: ["npcName"] },
  subjectId: { kind: REFERENCE_KIND.ACTOR, nameKeys: ["subjectName", "shipName"] },
  haulerId: { kind: REFERENCE_KIND.ACTOR, nameKeys: ["shipName"] },
  workerShipId: { kind: REFERENCE_KIND.ACTOR, nameKeys: ["shipName"] },
  scannerId: { kind: REFERENCE_KIND.ACTOR, nameKeys: ["scannerName"] },
  pilotInstitutionId: { kind: REFERENCE_KIND.ACTOR, nameKeys: ["pilotName"] },
  actorInstitutionId: { kind: REFERENCE_KIND.ACTOR, nameKeys: ["actorName"] },
  // Institutions
  institutionId: { kind: REFERENCE_KIND.INSTITUTION, nameKeys: ["institutionName"] },
  carrierInstitutionId: { kind: REFERENCE_KIND.INSTITUTION, nameKeys: ["carrierName"] },
  buyerInstitutionId: { kind: REFERENCE_KIND.INSTITUTION, nameKeys: [] },
  populationId: { kind: REFERENCE_KIND.INSTITUTION, nameKeys: [] },
  hubInstitutionId: { kind: REFERENCE_KIND.INSTITUTION, nameKeys: [] },
  supplierInstitutionId: { kind: REFERENCE_KIND.INSTITUTION, nameKeys: [] },
  payerInstitutionId: { kind: REFERENCE_KIND.INSTITUTION, nameKeys: [] },
  issuerInstitutionId: { kind: REFERENCE_KIND.INSTITUTION, nameKeys: [] },
  // Locations
  siteId: { kind: REFERENCE_KIND.LOCATION, nameKeys: ["siteName"] },
  originSiteId: { kind: REFERENCE_KIND.LOCATION, nameKeys: ["originName"] },
  destinationSiteId: { kind: REFERENCE_KIND.LOCATION, nameKeys: ["destinationName"] },
  currentSiteId: { kind: REFERENCE_KIND.LOCATION, nameKeys: [] },
  locationSiteId: { kind: REFERENCE_KIND.LOCATION, nameKeys: [] },
  nearestSiteId: { kind: REFERENCE_KIND.LOCATION, nameKeys: ["nearestSiteName"] },
  zoneId: { kind: REFERENCE_KIND.LOCATION, nameKeys: [] },
  // Contracts
  contractId: { kind: REFERENCE_KIND.CONTRACT, nameKeys: ["contractTitle"] },
  templateId: { kind: REFERENCE_KIND.CONTRACT, nameKeys: [] },
  orderId: { kind: REFERENCE_KIND.CONTRACT, nameKeys: [] },
  // Services / operations
  repairOrderId: { kind: REFERENCE_KIND.SERVICE, nameKeys: [] },
  procurementOrderId: { kind: REFERENCE_KIND.SERVICE, nameKeys: [] },
  productionOrderId: { kind: REFERENCE_KIND.SERVICE, nameKeys: [] },
  shipmentId: { kind: REFERENCE_KIND.SERVICE, nameKeys: [] },
  allocationId: { kind: REFERENCE_KIND.SERVICE, nameKeys: [] },
  needId: { kind: REFERENCE_KIND.SERVICE, nameKeys: [] },
  responseId: { kind: REFERENCE_KIND.SERVICE, nameKeys: [] },
  towRequestId: { kind: REFERENCE_KIND.SERVICE, nameKeys: [] },
  serviceRequestId: { kind: REFERENCE_KIND.SERVICE, nameKeys: [] },
  // Assets
  shipVin: { kind: REFERENCE_KIND.ASSET, nameKeys: ["shipName"] },
  containerId: { kind: REFERENCE_KIND.ASSET, nameKeys: [] },
  portalId: { kind: REFERENCE_KIND.ASSET, nameKeys: [] },
  titleId: { kind: REFERENCE_KIND.ASSET, nameKeys: [] },
});

// Explicit CAUSE fields: the payload names the thing that produced this event.
// These are the only links treated as causal.
const CAUSE_FIELDS = Object.freeze(["sourceNeedId", "sourceRepairOrderId", "emergencyNeedId", "sourceContractId", "referenceId"]);

// Money / quantity fields worth surfacing in a detail view.
const AMOUNT_FIELDS = Object.freeze([
  "payment", "paid", "paidAmount", "creditsPaid", "creditsSpent", "cost", "amount", "units",
  "quantity", "unitPrice", "pricePerEquivalent", "servicePrice", "referencePrice", "serviceRevenue",
  "accountBalance", "balance", "equivalentUnits", "acceptedUnits", "owed", "reward", "carrierCost",
  "carrierAsk", "previousPayment", "wear", "shipWear", "projectedWear", "unitCost", "trophyValue",
]);

export function getEventVisibility(event) {
  // Events do not yet carry their own integrity state; fall back to the default
  // from the retention classifier so the UI can already display the column.
  return event?.payload?.visibility ?? classifyEvent(event?.type).visibility;
}

export function describeEventRetention(event) {
  return getRetentionClass(event?.type);
}

// Normalized references for one event, deduplicated per kind.
export function extractEventReferences(event) {
  const payload = event?.payload ?? {};
  const byKind = { actor: [], institution: [], location: [], contract: [], service: [], asset: [] };
  const seen = new Set();

  Object.entries(REFERENCE_FIELDS).forEach(([key, spec]) => {
    const value = payload[key];
    if (value === undefined || value === null || value === "") return;
    const id = String(value);
    const dedupeKey = `${spec.kind}:${id}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const name = spec.nameKeys.map((nameKey) => payload[nameKey]).find(Boolean) ?? id;
    byKind[spec.kind].push({ id, name: String(name), field: key });
  });

  return byKind;
}

export function extractEventAmounts(event) {
  const payload = event?.payload ?? {};
  const amounts = {};
  AMOUNT_FIELDS.forEach((field) => {
    const value = payload[field];
    if (typeof value === "number" && Number.isFinite(value)) amounts[field] = value;
  });
  return amounts;
}

export function extractEventCauses(event) {
  const payload = event?.payload ?? {};
  return CAUSE_FIELDS
    .filter((field) => payload[field])
    .map((field) => ({ field, id: String(payload[field]) }));
}

export function hasCausalLinks(event) {
  return extractEventCauses(event).length > 0;
}

// Every id this event mentions, for structural same-id grouping.
function collectAllReferenceIds(event) {
  const references = extractEventReferences(event);
  const ids = new Set();
  Object.values(references).forEach((list) => list.forEach((entry) => ids.add(entry.id)));
  extractEventCauses(event).forEach((cause) => ids.add(cause.id));
  return ids;
}

function referencesId(event, id) {
  return collectAllReferenceIds(event).has(String(id));
}

// A one-line readable summary. Prefers the ledger's own message.
export function summarizeEvent(event) {
  if (event?.message) return event.message;
  const references = extractEventReferences(event);
  const actor = references.actor[0]?.name;
  return [event?.type, actor].filter(Boolean).join(" — ");
}

// ── Filtering (all filters combine) ────────────────────────────────────────

export function filterEvents(events, filters = {}) {
  const {
    search = "",
    actorId = "",
    institutionId = "",
    locationId = "",
    type = "",
    contractId = "",
    serviceId = "",
    retentionClass = "",
    visibility = "",
    sinceMs = null,
    untilMs = null,
    onlyCausal = false,
    onlyDurable = false,
  } = filters;

  const needle = search.trim().toLowerCase();

  return events.filter((event) => {
    if (type && event.type !== type) return false;
    if (retentionClass && describeEventRetention(event) !== retentionClass) return false;
    if (visibility && getEventVisibility(event) !== visibility) return false;
    if (onlyDurable && describeEventRetention(event) !== RETENTION_CLASS.DURABLE) return false;
    if (onlyCausal && !hasCausalLinks(event)) return false;
    if (sinceMs && event.time < sinceMs) return false;
    if (untilMs && event.time > untilMs) return false;

    const references = extractEventReferences(event);
    if (actorId && !references.actor.some((entry) => entry.id === actorId)) return false;
    if (institutionId && !references.institution.some((entry) => entry.id === institutionId)) return false;
    if (locationId && !references.location.some((entry) => entry.id === locationId)) return false;
    if (contractId && !references.contract.some((entry) => entry.id === contractId)) return false;
    if (serviceId && !references.service.some((entry) => entry.id === serviceId)) return false;

    if (needle) {
      const haystack = [
        event.type,
        summarizeEvent(event),
        JSON.stringify(event.payload ?? {}),
      ].join(" ").toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

export function sortEvents(events, direction = "newest") {
  const sorted = [...events];
  sorted.sort((first, second) => (direction === "oldest" ? first.id - second.id : second.id - first.id));
  return sorted;
}

// Real options for the filter dropdowns, drawn from the events themselves so
// nothing has to be typed exactly.
export function collectFilterOptions(events) {
  const actors = new Map();
  const institutions = new Map();
  const locations = new Map();
  const contracts = new Map();
  const services = new Map();
  const types = new Map();

  events.forEach((event) => {
    types.set(event.type, (types.get(event.type) ?? 0) + 1);
    const references = extractEventReferences(event);
    references.actor.forEach((entry) => actors.set(entry.id, entry.name));
    references.institution.forEach((entry) => institutions.set(entry.id, entry.name));
    references.location.forEach((entry) => locations.set(entry.id, entry.name));
    references.contract.forEach((entry) => contracts.set(entry.id, entry.name));
    references.service.forEach((entry) => services.set(entry.id, entry.name));
  });

  const toList = (map) => [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((first, second) => first.name.localeCompare(second.name));

  return {
    actors: toList(actors),
    institutions: toList(institutions),
    locations: toList(locations),
    contracts: toList(contracts),
    services: toList(services),
    types: [...types.entries()]
      .map(([id, count]) => ({ id, name: `${id} (${count})` }))
      .sort((first, second) => first.id.localeCompare(second.id)),
  };
}

// ── Relationships between events ───────────────────────────────────────────
//
// Groups are labelled precisely so a structural link is never presented as
// proven causation:
//   causedBy  — this event's payload explicitly names a prior record
//   caused    — later events that explicitly name a record THIS event created
//   followed  — later events sharing a primary reference (a sequence)
//   preceded  — earlier events sharing a primary reference
//   sameContract / sameActor / sameAsset — structural co-reference
export function findRelatedEvents(events, event, { limit = 12 } = {}) {
  if (!event) return { causedBy: [], caused: [], preceded: [], followed: [], sameContract: [], sameActor: [], sameAsset: [] };

  const causes = extractEventCauses(event);
  const references = extractEventReferences(event);
  const primaryIds = [
    ...references.service.map((entry) => entry.id),
    ...references.contract.map((entry) => entry.id),
  ];
  const actorIds = references.actor.map((entry) => entry.id);
  const assetIds = references.asset.map((entry) => entry.id);
  const contractIds = references.contract.map((entry) => entry.id);
  const ownIds = collectAllReferenceIds(event);

  const causedBy = causes.flatMap((cause) =>
    events.filter((candidate) => candidate.id < event.id && referencesId(candidate, cause.id))
      .map((candidate) => ({ event: candidate, via: cause.field, id: cause.id })),
  );

  // Later events whose explicit cause field names something this event mentions.
  const caused = events.filter((candidate) =>
    candidate.id > event.id && extractEventCauses(candidate).some((cause) => ownIds.has(cause.id)),
  ).map((candidate) => ({ event: candidate, via: "explicit-cause" }));

  const sharesPrimary = (candidate) => primaryIds.some((id) => referencesId(candidate, id));
  const preceded = primaryIds.length
    ? events.filter((candidate) => candidate.id < event.id && sharesPrimary(candidate)).map((candidate) => ({ event: candidate, via: "same-record" }))
    : [];
  const followed = primaryIds.length
    ? events.filter((candidate) => candidate.id > event.id && sharesPrimary(candidate)).map((candidate) => ({ event: candidate, via: "same-record" }))
    : [];

  const co = (ids) => ids.length
    ? events.filter((candidate) => candidate.id !== event.id && ids.some((id) => referencesId(candidate, id))).map((candidate) => ({ event: candidate, via: "co-reference" }))
    : [];

  const trim = (list) => dedupeByEventId(list).slice(0, limit);

  return {
    causedBy: trim(causedBy),
    caused: trim(caused),
    preceded: trim(preceded),
    followed: trim(followed),
    sameContract: trim(co(contractIds)),
    sameActor: trim(co(actorIds)),
    sameAsset: trim(co(assetIds)),
  };
}

function dedupeByEventId(list) {
  const seen = new Set();
  return list.filter((entry) => {
    if (seen.has(entry.event.id)) return false;
    seen.add(entry.event.id);
    return true;
  });
}

// Everything the detail view needs for one event, assembled in one place.
export function describeEvent(events, event) {
  if (!event) return null;
  return {
    id: event.id,
    type: event.type,
    time: event.time,
    summary: summarizeEvent(event),
    visible: event.visible,
    retentionClass: describeEventRetention(event),
    visibility: getEventVisibility(event),
    references: extractEventReferences(event),
    amounts: extractEventAmounts(event),
    causes: extractEventCauses(event),
    related: findRelatedEvents(events, event),
    payload: event.payload ?? {},
  };
}
