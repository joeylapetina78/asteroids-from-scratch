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
      width: 300,
      endpointWidth: 480,
      waypointSpacing: 230,
      sampleSpacing: 72,
      naturalVariation: 54,
      seed: 4187,
      coursePoints: [
        { progress: 0, lateral: 0 },
        { progress: 0.09, lateral: 0.02 },
        { progress: 0.17, lateral: -0.12 },
        { progress: 0.25, lateral: 0.17 },
        { progress: 0.32, lateral: -0.1 },
        { progress: 0.38, lateral: 0.13 },
        { progress: 0.49, lateral: -0.2 },
        { progress: 0.6, lateral: -0.24 },
        { progress: 0.69, lateral: 0.15 },
        { progress: 0.76, lateral: -0.12 },
        { progress: 0.82, lateral: 0.14 },
        { progress: 0.91, lateral: -0.05 },
        { progress: 1, lateral: 0 },
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
