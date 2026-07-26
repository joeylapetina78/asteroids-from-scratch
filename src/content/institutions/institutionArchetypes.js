export const INSTITUTION_ARCHETYPES = Object.freeze({
  "repair-cooperative": Object.freeze({
    id: "repair-cooperative",
    capabilities: ["procure-input", "transform-input", "schedule-service", "allocate-project"],
    defaultPolicy: {
      protectedCash: 600,
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
      protectedCash: 300,
      priorityWeights: { routine: 10, urgent: 55, emergency: 100 },
      purposeWeights: { "protect-growing-cycle": 45, "restore-operating-reserve": 15, growth: 5 },
    },
    recipes: [
      { id: "field-crop-cycle", capabilityId: "cultivate", inputs: { seed: 1, water: 3 }, outputs: { crop: 4 }, durationSeconds: 120 },
    ],
  }),
});
