import { FIRST_REACH_CARRIER_POLICY, FIRST_REACH_REPAIR_OPTIONS } from "./firstReachNetwork.js?v=fresh-20260815-0037-8f1e3cc";

export const FIRST_REACH_CARRIERS = Object.freeze([
  Object.freeze({
    institution: { id: "carrier:yard-hauler", name: "Quill Independent Freight", referenceId: "FR-CARR-014", archetypeId: "hauling-business", controllerInstitutionId: "person:yard-hauler-operator", accounts: { operating: { id: "FR-ACCT-014", balance: 4000, committed: 0, transactions: [] } } },
    controller: { id: "person:yard-hauler-operator", name: "Dara Quill", referenceId: "HLC-001-HAULER-YARD-SCRAP", archetypeId: "person", controls: ["carrier:yard-hauler"], traits: { caution: 0.35, growthBias: 0.5, urgencyBias: 0.6 }, license: { id: "HLC-001-HAULER-YARD-SCRAP", class: "commercial-hauler", status: "active" } },
    ship: { id: "ship:hauler-yard-scrap", physicalId: "hauler-yard-scrap", name: "Yard Hauler", referenceId: "HAUL-01-HAULER-YARD-SCRAP", archetypeId: "cargo-ship", controllerInstitutionId: "carrier:yard-hauler", wear: 0.4, issueCount: 0, homeSiteId: "yard-exchange", initialDestinationSiteId: "scrap-porch", seed: 1 },
    policy: { ...FIRST_REACH_CARRIER_POLICY, minimumOperatingCash: 1800 }, repairOptions: FIRST_REACH_REPAIR_OPTIONS,
    palette: { hullStroke: "#ffd36b", hullFill: "rgba(255, 211, 107, 0.14)", trainStroke: "#ffe7a8", trainFill: "rgba(255, 211, 107, 0.18)", linkStroke: "rgba(255, 231, 168, 0.44)" },
  }),
  Object.freeze({
    institution: { id: "carrier:porch-runner", name: "Mara Venn Freight", referenceId: "FR-CARR-022", archetypeId: "hauling-business", controllerInstitutionId: "person:hauler-scrap-yard-operator", accounts: { operating: { id: "FR-ACCT-022", balance: 3500, committed: 0, transactions: [] } } },
    controller: { id: "person:hauler-scrap-yard-operator", name: "Mara Venn", referenceId: "HLC-002-HAULER-SCRAP-YARD", archetypeId: "person", controls: ["carrier:porch-runner"], traits: { caution: 0.65, growthBias: 0.25, urgencyBias: 0.45 }, license: { id: "HLC-002-HAULER-SCRAP-YARD", class: "commercial-hauler", status: "active" } },
    ship: { id: "ship:hauler-scrap-yard", physicalId: "hauler-scrap-yard", name: "Porch Runner Two", referenceId: "HAUL-02-HAULER-SCRAP-YARD", archetypeId: "cargo-ship", controllerInstitutionId: "carrier:porch-runner", wear: 0.72, issueCount: 0, homeSiteId: "scrap-porch", initialDestinationSiteId: "yard-exchange", seed: 2 },
    policy: { ...FIRST_REACH_CARRIER_POLICY, minimumOperatingCash: 1800 }, repairOptions: FIRST_REACH_REPAIR_OPTIONS,
    palette: { hullStroke: "#ff8ac8", hullFill: "rgba(255, 92, 174, 0.14)", trainStroke: "#ffc0e2", trainFill: "rgba(255, 92, 174, 0.18)", linkStroke: "rgba(255, 160, 211, 0.44)" },
  }),
  Object.freeze({
    institution: { id: "carrier:lantern-cartage", name: "Lantern Cartage", referenceId: "FR-CARR-037", archetypeId: "hauling-business", controllerInstitutionId: "person:oren-vale", accounts: { operating: { id: "FR-ACCT-037", balance: 5200, committed: 0, transactions: [] } } },
    controller: { id: "person:oren-vale", name: "Oren Vale", referenceId: "HLC-037-LANTERN", archetypeId: "person", controls: ["carrier:lantern-cartage"], traits: { caution: 0.52, growthBias: 0.4, urgencyBias: 0.7 }, license: { id: "HLC-037-LANTERN", class: "commercial-hauler", status: "active" } },
    ship: { id: "ship:lantern-runner", physicalId: "hauler-lantern-runner", name: "Lantern Runner", referenceId: "HAUL-037-LANTERN", archetypeId: "cargo-ship", controllerInstitutionId: "carrier:lantern-cartage", wear: 0.56, issueCount: 0, homeSiteId: "blue-lantern", initialDestinationSiteId: "yard-exchange", seed: 3 },
    policy: { ...FIRST_REACH_CARRIER_POLICY, minimumOperatingCash: 2200 }, repairOptions: FIRST_REACH_REPAIR_OPTIONS,
    palette: { hullStroke: "#9f98ff", hullFill: "rgba(128, 115, 255, 0.15)", trainStroke: "#cbc7ff", trainFill: "rgba(128, 115, 255, 0.2)", linkStroke: "rgba(184, 177, 255, 0.46)" },
  }),
]);

export function carrierInstitutionRecords() {
  return FIRST_REACH_CARRIERS.flatMap((seed) => [
    { ...structuredClone(seed.institution), policies: { transportation: structuredClone(seed.policy) }, repairOptions: structuredClone(seed.repairOptions) },
    structuredClone(seed.controller),
    structuredClone(seed.ship),
  ]);
}
