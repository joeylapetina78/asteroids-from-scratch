// Engine-specific condition data + pure helpers. The engine is the first panel
// wired into the shared panel-condition machine (panelMaintenance.js). Everything
// unique to how an ENGINE wears and misbehaves lives here or in the game-side
// effect handler — the shared machine stays panel-agnostic. Replicating this on
// another panel = a sibling config module + its own effect handler.

export const ENGINE_CONDITION_CONFIG = {
  // Cumulative wear (points) where each worse stage begins. The gap between
  // thresholds is that stage's grace window — extra use before it escalates.
  // Tuned so representative flying (~35-40% of the time thrusting) reaches
  // Degraded in ~40-55 min; continued use drives the rest of the chain, careful
  // use stretches it. Repair zeroes wear back to healthy.
  thresholds: { degraded: 100, emergency: 155, failed: 195 },

  // Use-driven wear rates. This is long-term operating wear, NOT a stamina
  // meter: ordinary travel is gentle so the player never feels punished for
  // flying. Thrust is the main driver; boost is hard on the drive.
  wear: {
    thrustPerSecond: 0.07, // ~24 min of pure continuous thrust → Degraded
    travelPerSecond: 0.015, // ordinary coasting/travel, deliberately mild
    boostPerSecond: 0.8, // boosting stresses the drive
    minTravelSpeed: 12, // below this the ship is idle/parked — no travel wear
  },

  // Per-stage symptoms. Each effect is independently tunable and can move to a
  // different stage after playtesting. thrustScale/maxSpeedScale multiply the
  // engine's output; misfireChance is per-second probability of a brief thrust
  // dropout of misfireDuration seconds; steerPull is a gentle unwanted drift.
  stages: {
    healthy: { thrustScale: 1, maxSpeedScale: 1, misfireChance: 0, misfireDuration: 0, steerPull: 0 },
    degraded: { thrustScale: 0.85, maxSpeedScale: 1, misfireChance: 0.11, misfireDuration: 0.4, steerPull: 0 },
    emergency: { thrustScale: 0.55, maxSpeedScale: 0.85, misfireChance: 0.34, misfireDuration: 0.75, steerPull: 0.16 },
    failed: { thrustScale: 0, maxSpeedScale: 0.85, misfireChance: 0, misfireDuration: 0, steerPull: 0 },
  },
};

export function getEngineStageEffects(stage) {
  return ENGINE_CONDITION_CONFIG.stages[stage] ?? ENGINE_CONDITION_CONFIG.stages.healthy;
}

// Wear this engine earns this frame from what the ship actually did. Returns a
// plain number so it is trivially unit-testable and free of game/DOM state.
export function computeEngineWearDelta({ thrusting, speed = 0, boosting = false, deltaSeconds }) {
  const wear = ENGINE_CONDITION_CONFIG.wear;
  let delta = 0;

  if (thrusting) {
    delta += wear.thrustPerSecond * deltaSeconds;
  }
  if (speed > wear.minTravelSpeed) {
    delta += wear.travelPerSecond * deltaSeconds;
  }
  if (boosting) {
    delta += wear.boostPerSecond * deltaSeconds;
  }

  return delta;
}
