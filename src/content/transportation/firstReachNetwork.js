import { FRONTIER_FREIGHT_CORRIDOR } from "./corridorArchetypes.js?v=fresh-20260803-1827-46bd67b";

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
    id: "lane-yard-blue-lantern",
    fromId: "yard-exchange",
    toId: "blue-lantern",
    distance: 3400,
    bidirectional: true,
    corridor: {
      ...FRONTIER_FREIGHT_CORRIDOR,
      id: "corridor-yard-blue-lantern",
      name: "Blue Lantern Spur",
      sampleSpacing: 100,
      waypointSpacing: 300,
      seed: 5521,
    },
  },
  {
    id: "lane-scrap-morrow",
    fromId: "scrap-porch",
    toId: "morrow-shoal",
    distance: 3000,
    bidirectional: true,
    corridor: {
      ...FRONTIER_FREIGHT_CORRIDOR,
      id: "corridor-scrap-morrow",
      name: "Morrow Shoal Cut",
      sampleSpacing: 95,
      waypointSpacing: 280,
      seed: 6813,
    },
  },
  {
    id: "lane-ledge-kiln",
    fromId: "the-ledge",
    toId: "kiln-crossing",
    distance: 2800,
    bidirectional: true,
    corridor: {
      ...FRONTIER_FREIGHT_CORRIDOR,
      id: "corridor-ledge-kiln",
      name: "Kiln Crossing Trace",
      sampleSpacing: 95,
      waypointSpacing: 290,
      seed: 8149,
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
  knownDestinationIds: ["yard-exchange", "scrap-porch", "the-ledge", "blue-lantern", "morrow-shoal", "kiln-crossing", "ore-station-one"],
  expectedWearPerDistance: 0.00016,
  maximumWear: 6,
  minimumReturnMargin: 0.9,
  operatingCostPerDistance: 0.004,
  wearPenalty: 8,
  emergencyFleetFinance: {
    enabled: true,
    maximumPrincipal: 8000,
    repaymentShare: 0.25,
  },
});

export const FIRST_REACH_REPAIR_OPTIONS = Object.freeze([
  { institutionId: "sprc", destinationId: "scrap-porch", priority: 1 },
]);
