export const INSTITUTION_ARCHETYPES = Object.freeze({
  "repair-cooperative": Object.freeze({
    id: "repair-cooperative",
    capabilities: ["procure-input", "transform-input", "schedule-service", "allocate-project"],
    defaultPolicy: {
      protectedCash: 6000,
      priorityWeights: { routine: 10, urgent: 60, emergency: 100 },
      purposeWeights: { "restore-operating-reserve": 15, "complete-accepted-service": 40, growth: 5 },
    },
    recipes: [
      { id: "mill-hull-plate", capabilityId: "transform-input", facilityType: "recovery-mill", inputs: { "structural-feedstock": 2, "water-ice": 0.5 }, outputs: { "hull-plate": 1 }, durationSeconds: 15 },
      { id: "mill-machine-parts", capabilityId: "transform-input", facilityType: "recovery-mill", inputs: { silicate: 1, copper: 0.5 }, outputs: { "machine-part": 1 }, durationSeconds: 15 },
    ],
  }),
  farm: Object.freeze({
    id: "farm",
    capabilities: ["procure-input", "cultivate", "allocate-project"],
    defaultPolicy: {
      protectedCash: 3000,
      priorityWeights: { routine: 10, urgent: 55, emergency: 100 },
      purposeWeights: { "protect-growing-cycle": 45, "restore-operating-reserve": 15, growth: 5 },
    },
    recipes: [
      { id: "field-crop-cycle", capabilityId: "cultivate", inputs: { seed: 1, water: 3 }, outputs: { crop: 4 }, durationSeconds: 120 },
    ],
  }),
  "recovery-service": Object.freeze({
    id: "recovery-service",
    capabilities: ["quote-recovery", "dispatch-recovery", "tow-vehicle", "invoice-service"],
    defaultPolicy: {
      protectedCash: 2500,
      priorityWeights: { routine: 10, urgent: 65, emergency: 100 },
      purposeWeights: { "preserve-loaded-delivery": 50, "service-return": 35, "stranded-pilot": 40 },
      // What recovery COSTS anyone who does it, as opposed to what this
      // particular firm charges. A second recovery outfit inherits this and
      // differs only by its instance policy and its operator's temperament —
      // which is the whole claim an archetype makes.
      //
      // A callout is real: mobilising a rig costs the same whether the casualty
      // is close or far. The distance terms scale the rest, and maintenance is
      // amortized against what a service cycle actually costs, so recovery
      // reprices itself when repair prices move instead of being hand-tuned.
      calloutCost: 200,
      operatingCostPerDistance: 0.05,
      expectedWearPerDistance: 0.0002,
      maximumWear: 6,
      referenceServiceCost: 1800,
    },
    recipes: [],
  }),
  "mining-contractor": Object.freeze({
    id: "mining-contractor",
    capabilities: ["accept-extraction-order", "prospect", "mine", "collect", "deliver"],
    defaultPolicy: {
      protectedCash: 1200,
      priorityWeights: { routine: 20, urgent: 55, emergency: 100 },
      purposeWeights: { "earn-operating-income": 40, "supply-regional-inventory": 25, "return-for-maintenance": 45 },
    },
    recipes: [],
  }),
});
