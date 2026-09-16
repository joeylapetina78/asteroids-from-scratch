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
  // misfireKick is how hard a misfire shoves the ship sideways (units/s of
  // velocity) and misfireJolt how far it knocks the heading (radians): at
  // Emergency the drive does not just cough, it fires off-axis and puts the
  // ship off course. startupCough is the chance the drive coughs on power-up.
  stages: {
    healthy: { thrustScale: 1, maxSpeedScale: 1, misfireChance: 0, misfireDuration: 0, steerPull: 0, misfireKick: 0, misfireJolt: 0, startupCough: 0 },
    degraded: { thrustScale: 0.85, maxSpeedScale: 1, misfireChance: 0.11, misfireDuration: 0.4, steerPull: 0, misfireKick: 0, misfireJolt: 0, startupCough: 0.35 },
    emergency: { thrustScale: 0.55, maxSpeedScale: 0.85, misfireChance: 0.34, misfireDuration: 0.75, steerPull: 0.16, misfireKick: 38, misfireJolt: 0.28, startupCough: 1 },
    failed: { thrustScale: 0, maxSpeedScale: 0.85, misfireChance: 0, misfireDuration: 0, steerPull: 0, misfireKick: 0, misfireJolt: 0, startupCough: 1 },
  },
};

// Where the campaign skiff's drive starts: Emergency, well into it. The hull
// was written off after an incursion and the drive is the one thing on it
// nobody replaced. It should cough, pull, and kick the ship off course on the
// assessment flight and still have a few minutes of grace before it dies —
// enough to reach Yard Exchange, not enough to dawdle. Rook services it in
// The Deal, through the same seam Sal uses.
export const CAMPAIGN_ENGINE_START_WEAR = 168;
// A drive that has been serviced this many times and lost this much of its
// ceiling: a used machine, not a new one that happens to be worn.
export const CAMPAIGN_ENGINE_PRIOR_SERVICES = 5;
export const CAMPAIGN_ENGINE_LIFETIME_DEGRADATION = 7;

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
