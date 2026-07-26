export const FIRST_REACH_TRANSPORT_CONNECTIONS = Object.freeze([
  { id: "lane-yard-scrap", fromId: "yard-exchange", toId: "scrap-porch", distance: 1875, bidirectional: true },
  {
    id: "lane-yard-ledge",
    fromId: "yard-exchange",
    toId: "the-ledge",
    distance: 8400,
    bidirectional: true,
    corridor: {
      id: "corridor-yard-ledge",
      name: "First Reach Freight Corridor",
      width: 270,
      endpointWidth: 440,
      waypointSpacing: 250,
      sampleSpacing: 72,
      naturalVariation: 42,
      shoulderDensity: 0.74,
      outerShoulderDensity: 0.38,
      seed: 4187,
      coursePoints: [
        { progress: 0, along: 0, lateral: 0 },
        { progress: 0.12, along: 0.12, lateral: 0.015 },
        { progress: 0.25, along: 0.26, lateral: -0.055 },
        { progress: 0.39, along: 0.43, lateral: 0.075 },
        { progress: 0.52, along: 0.56, lateral: 0.11 },
        { progress: 0.64, along: 0.66, lateral: -0.035 },
        { progress: 0.74, along: 0.61, lateral: -0.115 },
        { progress: 0.84, along: 0.79, lateral: -0.085 },
        { progress: 0.93, along: 0.91, lateral: 0.025 },
        { progress: 1, along: 1, lateral: 0 },
      ],
    },
  },
]);

export const FIRST_REACH_CARRIER_POLICY = Object.freeze({
  knownDestinationIds: ["yard-exchange", "scrap-porch", "the-ledge"],
  expectedWearPerDistance: 0.00016,
  maximumWear: 6,
  minimumReturnMargin: 0.9,
  operatingCostPerDistance: 0.004,
  wearPenalty: 8,
});

export const FIRST_REACH_REPAIR_OPTIONS = Object.freeze([
  { institutionId: "sprc", destinationId: "scrap-porch", priority: 1 },
]);
