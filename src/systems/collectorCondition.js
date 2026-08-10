// Collector / tractor-field condition data + pure helpers. The third panel on the
// shared panel-condition machine (panelMaintenance.js), after engine and mining
// laser. It wears from a third distinct input — holding the field active — and its
// symptoms are gameplay-forward: a shrinking, weakening, flickering field that
// swirls objects instead of drawing them in, and at worst shoves them away. See
// docs/panel-wear-design.md for the failure ladder this implements.

export const COLLECTOR_CONDITION_CONFIG = {
  // Cumulative wear where each worse stage begins.
  thresholds: { degraded: 100, emergency: 155, failed: 195 },

  // Holding the field on is the wear input. At 0.09/s that is ~18 min of ACTIVE
  // collecting to Degraded — and collecting happens in bursts, so it takes real
  // use. Ordinary flying does nothing to it.
  wear: { perSecondActive: 0.09 },

  // Per-stage symptoms, each independently tunable:
  //   radiusScale    — multiplies the field's reach (also shrinks the drawn ring)
  //   strengthScale  — multiplies the pull force
  //   dropoutChance  — per-second probability the field flickers off for a beat
  //   dropoutDuration— how long a flicker lasts (seconds)
  //   swirl          — tangential force fraction; objects orbit/wobble instead of
  //                    coming straight in
  //   pushChance     — per-second probability of a brief pulse that REVERSES the
  //                    pull and shoves objects away (severe malfunction)
  stages: {
    healthy:   { radiusScale: 1,    strengthScale: 1,    dropoutChance: 0,    dropoutDuration: 0,   swirl: 0,    pushChance: 0 },
    degraded:  { radiusScale: 0.85, strengthScale: 0.85, dropoutChance: 0.15, dropoutDuration: 0.4, swirl: 0.15, pushChance: 0 },
    emergency: { radiusScale: 0.65, strengthScale: 0.6,  dropoutChance: 0.4,  dropoutDuration: 0.7, swirl: 0.4,  pushChance: 0 },
    // Still grips a little between flickers — a barely-working field that mostly
    // swirls and occasionally shoves is more interesting than an OFF one.
    failed:    { radiusScale: 0.5,  strengthScale: 0.4,  dropoutChance: 0.6,  dropoutDuration: 1.0, swirl: 0.7,  pushChance: 0.25 },
  },
};

export function getCollectorStageEffects(stage) {
  return COLLECTOR_CONDITION_CONFIG.stages[stage] ?? COLLECTOR_CONDITION_CONFIG.stages.healthy;
}

export function computeCollectorWearPerSecond() {
  return COLLECTOR_CONDITION_CONFIG.wear.perSecondActive;
}
