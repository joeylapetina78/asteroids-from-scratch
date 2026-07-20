// The canonical world-tag vocabulary. A tag is a promise with a listener:
// every tag here names at least one system that changes behavior because of
// it, and zones/regions may only declare tags from this registry (enforced by
// contentValidation at startup). If a new tag has no listener yet, wire the
// listener in the same change that registers the tag — never register intent
// alone. See docs/tag-registry.md for the long-form authoring guide.
//
// Scope note: worldTerrain reads ZONE tags only. resourceField, survey
// contracts, and the incursion director read the merged zone + region set.

export const TAG_REGISTRY = {
  // ── Terrain archetypes (zone) — direct +4 score for that shape in worldTerrain
  "open-drift":    { axis: "navigation", listeners: ["worldTerrain"] },
  "cluster-pocket":{ axis: "navigation", listeners: ["worldTerrain"] },
  "stone-wall":    { axis: "navigation", listeners: ["worldTerrain"] },
  "maze-corridor": { axis: "navigation", listeners: ["worldTerrain"] },
  "debris-stream": { axis: "navigation", listeners: ["worldTerrain"] },
  "giant-garden":  { axis: "navigation", listeners: ["worldTerrain"] },
  "sparse-dead":   { axis: "navigation", listeners: ["worldTerrain"] },

  // ── Navigation character (zone)
  "dense-rocks":       { axis: "navigation", listeners: ["worldTerrain", "threadwyrmField"] },
  "sparse":            { axis: "navigation", listeners: ["worldTerrain", "lifeField", "threadwyrmField"] },
  "low-resource":      { axis: "navigation", listeners: ["worldTerrain"] },
  "navigation-hazard": { axis: "navigation", listeners: ["worldTerrain"] },
  "open-space":        { axis: "navigation", listeners: ["worldTerrain"] },

  // ── Geology character (zone) — nudges terrain shape selection
  "metallic":         { axis: "geology", listeners: ["worldTerrain"] },
  "industrial":       { axis: "geology", listeners: ["worldTerrain"] },
  "carbonaceous":     { axis: "geology", listeners: ["worldTerrain"] },
  "ancient":          { axis: "geology", listeners: ["worldTerrain"] },
  "volatile":         { axis: "geology", listeners: ["worldTerrain"] },
  "scrap":            { axis: "geology", listeners: ["worldTerrain"] },
  "scanner-interest": { axis: "geology", listeners: ["worldTerrain"] },

  // ── Survival-resource availability (zone or region) — resourceField floors,
  //    multipliers, and ambient travel-deposit weights
  "fuel-rich":       { axis: "survival", listeners: ["resourceField"] },
  "fuel-lean":       { axis: "survival", listeners: ["resourceField"] },
  "fuel-desert":     { axis: "survival", listeners: ["resourceField"] },
  "no-fuel":         { axis: "survival", listeners: ["resourceField"] },
  "volatile-rich":   { axis: "survival", listeners: ["resourceField"] },
  "charge-rich":     { axis: "survival", listeners: ["resourceField"] },
  "charge-lean":     { axis: "survival", listeners: ["resourceField"] },
  "charge-desert":   { axis: "survival", listeners: ["resourceField"] },
  "no-charges":      { axis: "survival", listeners: ["resourceField"] },
  "industrial-rich": { axis: "survival", listeners: ["resourceField"] },
  "scanergy-rich":   { axis: "survival", listeners: ["resourceField"] },
  "scanergy-lean":   { axis: "survival", listeners: ["resourceField"] },
  "scanergy-desert": { axis: "survival", listeners: ["resourceField"] },
  "no-scanergy":     { axis: "survival", listeners: ["resourceField"] },
  "conductor-rich":  { axis: "survival", listeners: ["resourceField"] },

  // ── Life (zone)
  "ambient-life": { axis: "life", listeners: ["lifeField", "threadwyrmField"] },
  "low-life":     { axis: "life", listeners: ["lifeField", "threadwyrmField"] },
  "strange-life": { axis: "life", listeners: ["driftMouthField"] },

  // ── Danger & encounters (zone or region)
  "starter":   { axis: "danger", listeners: ["worldTerrain", "driftMouthField", "incursionDirector"] },
  "safe":      { axis: "danger", listeners: ["worldTerrain", "driftMouthField", "incursionDirector"] },
  "dangerous": { axis: "danger", listeners: ["incursionDirector", "surveyContracts"] },
  "hunters":   { axis: "danger", listeners: ["incursionDirector", "surveyContracts"] },
  "anomaly":   { axis: "danger", listeners: ["driftMouthField"] },
  "strange":   { axis: "danger", listeners: ["driftMouthField", "lifeField"] },

  // ── Authority & economy (mostly region) — claim character and contract flavor
  "unclaimed":        { axis: "authority", listeners: ["surveyContracts"] },
  "rook-claims":      { axis: "authority", listeners: ["surveyContracts"] },
  "corporate-claims": { axis: "authority", listeners: ["surveyContracts"] },
  "mining-rush":      { axis: "economy", listeners: ["surveyContracts"] },
  "trade":            { axis: "economy", listeners: ["surveyContracts"] },
  "prospecting":      { axis: "economy", listeners: ["surveyContracts"] },
  "frontier":         { axis: "economy", listeners: ["surveyContracts"] },
};

export function isRegisteredTag(tag) {
  return Object.prototype.hasOwnProperty.call(TAG_REGISTRY, tag);
}

export function validateTagList(tags = [], ownerLabel = "unknown") {
  return tags
    .filter((tag) => !isRegisteredTag(tag))
    .map((tag) => `${ownerLabel} declares unregistered tag '${tag}' — add it to tagRegistry.js with a listener, or remove it.`);
}
