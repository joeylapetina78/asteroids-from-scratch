// Rock-life strains: visual + zone-affinity varieties that all grow on the same
// rockmoss growth sim (patches/crawlers/glow). Each is a distinct growth-SHAPE +
// colour tied to a zone identity, so you read a rock's biome by what grows on it
// — the same "reads the world" pattern as ore clusters and ambient creatures.
//
// `yieldHint` records the intended farm output per strain for the DEFERRED
// economy step (wiring harvest -> a valued resource -> a buyer); nothing consumes
// it yet. See the survival-loop project memory.
export const ROCKMOSS_STRAINS = {
  moss: { id: "moss", shape: "blob", color: [107, 255, 178], accent: [213, 255, 188], yieldHint: "biomass" },
  crystal: { id: "crystal", shape: "crystal", color: [176, 130, 255], accent: [230, 210, 255], yieldHint: "charge" },
  tube: { id: "tube", shape: "tube", color: [255, 150, 90], accent: [255, 214, 150], yieldHint: "volatiles" },
  crust: { id: "crust", shape: "crust", color: [150, 190, 160], accent: [205, 232, 205], yieldHint: "biomass" },
  glow: { id: "glow", shape: "glow", color: [120, 236, 255], accent: [232, 255, 255], yieldHint: "lumen" },
  pod: { id: "pod", shape: "pod", color: [255, 158, 214], accent: [255, 224, 242], yieldHint: "seedstock" },
};

// Choose a strain from the zone's identity — mirrors pickAmbientType. Always
// falls back to plain green moss so nothing is ever strainless. `random` is
// passed in so callers control determinism (start-field vs per-rock chunk seed).
export function pickRockmossStrain(zone, random = Math.random) {
  const tags = zone?.tags ?? [];
  const danger = zone?.danger ?? 0.5;
  const fertile = tags.includes("ambient-life") || tags.includes("safe");
  const weights = [
    ["moss", 1.0],
    ["crust", 0.6], // hardy filler, grows widely
    ["crystal", tags.includes("scanergy-rich") || tags.includes("cluster-pocket") ? 1.4 : 0.08],
    ["tube", tags.includes("volatile") || tags.includes("fuel-rich") ? 1.3 : 0.08],
    ["glow", fertile && danger < 0.2 ? 0.9 : 0.12],
    ["pod", fertile ? 1.0 : 0.2],
  ];

  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [id, weight] of weights) {
    roll -= weight;
    if (roll <= 0) {
      return id;
    }
  }

  return "moss";
}
