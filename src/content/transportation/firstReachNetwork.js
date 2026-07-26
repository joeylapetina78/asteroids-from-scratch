export const FIRST_REACH_TRANSPORT_CONNECTIONS = Object.freeze([
  { id: "lane-yard-scrap", fromId: "yard-exchange", toId: "scrap-porch", distance: 1875, bidirectional: true },
  { id: "lane-yard-ledge", fromId: "yard-exchange", toId: "the-ledge", distance: 8400, bidirectional: true, corridor: { id: "corridor-yard-ledge", name: "First Reach Freight Corridor", width: 520, endpointWidth: 780, waypointSpacing: 540, curvature: 0.13, secondaryCurvature: 0.04, seed: 4187 } },
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
