import { FRONTIER_FREIGHT_CORRIDOR } from "./corridorArchetypes.js?v=fresh-20260801-1152-2b2fe1f";

export const FIRST_REACH_TRANSPORT_CONNECTIONS = Object.freeze([
  { id: "lane-yard-scrap", fromId: "yard-exchange", toId: "scrap-porch", distance: 1875, bidirectional: true },
  {
    id: "lane-yard-ledge",
    fromId: "yard-exchange",
    toId: "the-ledge",
    distance: 8400,
    bidirectional: true,
    corridor: {
      ...FRONTIER_FREIGHT_CORRIDOR,
      id: "corridor-yard-ledge",
      name: "First Reach Freight Corridor",
      seed: 4187,
    },
  },
  {
    id: "lane-ledge-ore-station",
    fromId: "the-ledge",
    toId: "ore-station-one",
    distance: 38328,
    bidirectional: true,
    corridor: {
      ...FRONTIER_FREIGHT_CORRIDOR,
      id: "corridor-ledge-ore-station",
      name: "Rook Frontier Freight Road",
      sampleSpacing: 110,
      waypointSpacing: 340,
      seed: 7291,
    },
  },
]);

export const FIRST_REACH_CARRIER_POLICY = Object.freeze({
  knownDestinationIds: ["yard-exchange", "scrap-porch", "the-ledge", "ore-station-one"],
  expectedWearPerDistance: 0.00016,
  maximumWear: 6,
  minimumReturnMargin: 0.9,
  operatingCostPerDistance: 0.004,
  wearPenalty: 8,
});

export const FIRST_REACH_REPAIR_OPTIONS = Object.freeze([
  { institutionId: "sprc", destinationId: "scrap-porch", priority: 1 },
]);
