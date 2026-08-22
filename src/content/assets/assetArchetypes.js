// Assets are the vocabulary from which actors acquire powers.
//
// An NPC does not need to know what a mine, farm, factory or ship is. It asks
// the capability layer what the things it controls permit it to do. Adding a
// new asset therefore means adding one data record here (or supplying explicit
// capability grants on the asset), not adding another branch to the NPC.

export const ASSET_ARCHETYPES = Object.freeze({
  "settlement-charter": Object.freeze({
    id: "settlement-charter",
    capabilities: [
      { id: "procure-input" },
      { id: "supply-material" },
      { id: "serve-population" },
      { id: "commission-service" },
      { id: "sponsor-operator" },
      { id: "form-department" },
    ],
    offerTypes: ["purchase", "freight"],
  }),

  "territory-charter": Object.freeze({
    id: "territory-charter",
    capabilities: [
      { id: "govern-territory" },
      { id: "issue-transit-right" },
      { id: "issue-docking-right" },
      { id: "issue-extraction-right" },
      { id: "patrol-territory" },
      { id: "survey-frontier" },
      { id: "propose-territorial-expansion" },
    ],
    offerTypes: ["permit", "lease", "charter"],
  }),

  "population-constituency": Object.freeze({
    id: "population-constituency",
    capabilities: [
      { id: "recruit-labor" },
      { id: "recruit-crew" },
      { id: "appoint-representative" },
    ],
  }),

  "mining-charter": Object.freeze({
    id: "mining-charter",
    capabilities: [
      { id: "commission-extraction" },
      { id: "issue-extraction-charter" },
      { id: "authorize-extraction" },
    ],
    offerTypes: ["extraction"],
  }),

  "municipal-capacity-charter": Object.freeze({
    id: "municipal-capacity-charter",
    capabilities: [
      { id: "commission-mining-operator", scope: { capacityType: "mining-operator" } },
      { id: "commission-freight-operator", scope: { capacityType: "freight-operator" } },
      { id: "commission-patrol-service", scope: { capacityType: "patrol-service" } },
      { id: "commission-maintenance-service", scope: { capacityType: "maintenance-service" } },
      { id: "commission-repair-facility", scope: { capacityType: "repair-facility" } },
      { id: "commission-parts-factory", scope: { capacityType: "parts-factory" } },
      { id: "commission-shipyard", scope: { capacityType: "shipyard" } },
    ],
  }),

  // A place that builds hulls. Sibling to the parts factory: today it sells what
  // it builds, and Stage 2 makes it consume that factory output. See
  // docs/shipbuilding.md.
  shipyard: Object.freeze({
    id: "shipyard",
    capabilities: [
      { id: "procure-production-input" },
      { id: "build-craft" },
      { id: "price-craft" },
      { id: "sell-craft" },
    ],
    offerTypes: ["purchase", "sale"],
  }),

  "parts-factory": Object.freeze({
    id: "parts-factory",
    capabilities: [
      { id: "procure-production-input" },
      { id: "manufacture-parts" },
      { id: "price-parts" },
      { id: "sell-parts" },
    ],
    offerTypes: ["purchase", "sale"],
  }),

  "repair-facility": Object.freeze({
    id: "repair-facility",
    capabilities: [
      { id: "schedule-service" },
      { id: "repair-craft" },
      { id: "price-service" },
    ],
    offerTypes: ["repair"],
  }),

  "recovery-mill": Object.freeze({
    id: "recovery-mill",
    capabilities: [
      { id: "reclaim-material" },
      { id: "manufacture-parts" },
      { id: "price-parts" },
      { id: "sell-parts" },
    ],
    offerTypes: ["sale", "salvage"],
  }),

  "freight-craft": Object.freeze({
    id: "freight-craft",
    capabilities: [
      { id: "accept-freight" },
      { id: "transport-goods" },
      { id: "offer-freight-capacity" },
    ],
    offerTypes: ["freight"],
  }),

  "mining-craft": Object.freeze({
    id: "mining-craft",
    capabilities: [
      { id: "prospect" },
      { id: "mine" },
      { id: "collect" },
      { id: "deliver" },
    ],
  }),

  farm: Object.freeze({
    id: "farm",
    capabilities: [
      { id: "procure-growing-input" },
      { id: "cultivate" },
      { id: "price-produce" },
      { id: "sell-produce" },
    ],
    offerTypes: ["purchase", "sale"],
  }),
});

export function getAssetArchetype(archetypeId) {
  return ASSET_ARCHETYPES[archetypeId] ?? null;
}
