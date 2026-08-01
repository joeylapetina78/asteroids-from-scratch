// What a KIND of institution knows how to do, and what that costs anyone doing
// it. An instance overrides; a controller supplies temperament. Between the
// three, two otherwise identical settlements can behave differently with no
// code anywhere naming either of them.
//
// An archetype must OWN something operational — capabilities, a cost model,
// offer types, a protected-cash default, commitment behaviour. A row that only
// restates its own name is worse than no row, because it reads as configured
// while deciding nothing.
//
// Deliberately NOT listed here: persons, ships and populations. Their
// configuration is genuinely per-record (a person IS their traits, a worker IS
// its capabilities, a population IS its profile in `populationDemand.js`), and
// inventing archetype rows for them would be the label-only pattern above. When
// a second ship CLASS exists, hold capacity belongs in a ship archetype — that
// is the first real candidate, and `MINING_ALLOCATION_SIZE` is the constant it
// should claim.
export const INSTITUTION_ARCHETYPES = Object.freeze({
  // One archetype for all three settlements. They post extraction, buy what
  // they may not mine, sell what they may, hold stock and manufacture for a
  // population — identical capabilities in every case. What makes Yard Exchange
  // unlike The Ledge is its quartermaster, its mining rights and its shelf, all
  // of which are instance data. A fourth settlement is a seed entry, not a row.
  settlement: Object.freeze({
    id: "settlement",
    capabilities: ["commission-extraction", "procure-input", "transform-input", "supply-material", "serve-population"],
    // The kinds of work a settlement can put on a public board. The extraction
    // offer surface reads this to decide whether an institution may post at all.
    offerTypes: ["extraction", "purchase", "freight"],
    defaultPolicy: {
      // A settlement keeps a working float back so buying ore never leaves it
      // unable to pay for the production the ore was for. Instances that run
      // closer to the edge say so themselves.
      protectedCash: 4000,
      priorityWeights: { routine: 10, urgent: 55, emergency: 100 },
      purposeWeights: { "serve-population": 45, "restore-operating-reserve": 20, growth: 10 },
    },
    recipes: [],
  }),

  "hauling-business": Object.freeze({
    id: "hauling-business",
    capabilities: ["accept-freight", "transport-goods", "request-recovery"],
    offerTypes: ["freight"],
    defaultPolicy: {
      // What hauling COSTS anyone who does it. Instances still carry their own
      // known destinations and repair options; this is the shared physics.
      protectedCash: 1800,
      operatingCostPerDistance: 0.004,
      expectedWearPerDistance: 0.00016,
      maximumWear: 6,
      minimumReturnMargin: 0.9,
      wearPenalty: 8,
      // Until a carrier has actually paid for a repair, assume upkeep costs
      // about what any other craft's service cycle does.
      referenceServiceCost: 1800,
      priorityWeights: { routine: 15, urgent: 55, emergency: 100 },
      purposeWeights: { "earn-operating-revenue": 40, "return-for-maintenance": 45 },
    },
    recipes: [],
  }),

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
