// Mining-laser condition data + pure helpers. The second panel wired into the
// shared panel-condition machine (panelMaintenance.js) after the engine — chosen
// because it wears from a completely DIFFERENT input (firing, not thrust) and its
// symptoms are gameplay-forward, which is what proves the machine is genuinely
// shared rather than an engine system with generic names. See
// docs/panel-wear-design.md for the failure ladder this implements.
//
// Everything unique to how a mining laser wears and misbehaves lives here or in
// the game-side effect handler; the shared machine stays panel-agnostic.

export const MINER_CONDITION_CONFIG = {
  // Cumulative wear (points) where each worse stage begins. At perShot 0.5 that
  // is ~200 shots of mining to Degraded, then the rest of the chain — enough
  // steady cutting to feel earned, not a per-session stamina meter. Repair zeroes
  // wear back to healthy.
  thresholds: { degraded: 100, emergency: 155, failed: 195 },

  // Firing is the wear input. Ordinary flying does nothing to the emitter.
  wear: { perShot: 0.5 },

  // Per-stage symptoms, each independently tunable and free to move stage after
  // playtesting:
  //   cooldownScale  — multiplies the fire cooldown (charges slower)
  //   ammoScale      — multiplies charge spent per shot (more energy per shot)
  //   misfireChance  — per-shot probability the charge sputters and no bolt fires
  //   aimDrift       — magnitude (radians) of a slow wandering aim bias off the
  //                    reticle; the player compensates with "Kentucky windage"
  stages: {
    healthy:   { cooldownScale: 1,    ammoScale: 1,    misfireChance: 0,    aimDrift: 0 },
    degraded:  { cooldownScale: 1.35, ammoScale: 1.25, misfireChance: 0.10, aimDrift: 0.06 },
    emergency: { cooldownScale: 1.9,  ammoScale: 1.7,  misfireChance: 0.28, aimDrift: 0.15 },
    // Not zeroed like the engine at Failed: a dead laser is just "OFF". A failing
    // one that mostly sputters, drifts badly, and drinks charge is more
    // interesting and still barely cuts rock.
    failed:    { cooldownScale: 2.8,  ammoScale: 2.4,  misfireChance: 0.55, aimDrift: 0.28 },
  },
};

export function getMinerStageEffects(stage) {
  return MINER_CONDITION_CONFIG.stages[stage] ?? MINER_CONDITION_CONFIG.stages.healthy;
}

export function computeMinerWearPerShot() {
  return MINER_CONDITION_CONFIG.wear.perShot;
}
