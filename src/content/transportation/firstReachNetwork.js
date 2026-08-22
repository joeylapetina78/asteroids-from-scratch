import { FRONTIER_FREIGHT_CORRIDOR } from "./corridorArchetypes.js?v=fresh-20260822-0043-8abca575";

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

  // ── The long roads ────────────────────────────────────────────────────────
  //
  // Distances measured off the actual site positions in `worldSites`, not
  // chosen. The core huddles inside 10,000 units; these run 37,000 to 85,000,
  // and freight is quoted per unit of road — so a run out to Coldwater costs
  // roughly forty times the Yard-to-Porch hop. That is the point of them.
  //
  // Ore Station One now has TWO ways in: the existing Rook road from The Ledge
  // (38,328) and this shorter one from Kiln Crossing (37,473). The frontier
  // should not hang on a single lane, and two roads within 900 units of each
  // other is the first thing to exercise route selection with something other
  // than an obvious winner.
  {
    id: "lane-kiln-ore-station",
    fromId: "kiln-crossing",
    toId: "ore-station-one",
    distance: 37473,
    bidirectional: true,
    corridor: {
      ...FRONTIER_FREIGHT_CORRIDOR,
      id: "corridor-kiln-ore-station",
      name: "Kiln Reach",
      seed: 7731,
    },
  },
  // Beyond Ore Station the road runs on rather than back to the core: it is
  // shorter from there to Coldwater than from anywhere inside the huddle.
  { id: "lane-ore-station-coldwater", fromId: "ore-station-one", toId: "coldwater-depot", distance: 76158, bidirectional: true },
  { id: "lane-morrow-deep-research", fromId: "morrow-shoal", toId: "deep-research", distance: 84953, bidirectional: true },
]);

export const FIRST_REACH_CARRIER_POLICY = Object.freeze({
  knownDestinationIds: ["yard-exchange", "scrap-porch", "the-ledge", "blue-lantern", "morrow-shoal", "kiln-crossing", "ore-station-one", "coldwater-depot", "deep-research"],
  expectedWearPerDistance: 0.00016,
  maximumWear: 6,
  minimumReturnMargin: 0.9,
  maintenanceAdvisoryWear: 3.9,
  maintenancePlanningWear: 4.5,
  operatingCostPerDistance: 0.004,
  wearPenalty: 8,
  emergencyFleetFinance: {
    enabled: true,
    maximumPrincipal: 12000,
    repaymentShare: 0.25,
  },
});

export const FIRST_REACH_REPAIR_OPTIONS = Object.freeze([
  { institutionId: "sprc", destinationId: "scrap-porch", priority: 1 },
  { institutionId: "ore-station-service", destinationId: "ore-station-one", priority: 1 },
]);
