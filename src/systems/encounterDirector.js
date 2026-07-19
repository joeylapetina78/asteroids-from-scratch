// Encounter Director — watches how the session is actually going and paces
// incursion encounters in response. See docs/encounter-director-roadmap.md.
//
// This is not journeyDirector.js: that system owns mission/story sequencing.
// This one owns encounter pressure. It is a read-only consumer of ledger
// stats; it never mutates game state. Systems ask it for pacing multipliers
// at their own decision points.
//
// The score is never shown to the player. It exists for the debug readout and
// for spawn-time decisions only.

const SAMPLE_SECONDS = 2;
const PRESSURE_BASELINE = 20;
// EWMA blend applied once per sample tick. ~0.1 per 2s gives a half-life of
// roughly 13 seconds toward whatever the session is currently doing.
const SAMPLE_BLEND = 0.1;
// How fast applied multipliers may move toward their targets per sample tick.
// One bad moment must not swing pacing from max to min in a single step.
const MULTIPLIER_SLEW_PER_TICK = 0.06;
// After a portal clears, hold a deliberate quiet stretch before the next one
// can feel imminent — the L4D-style relax phase.
const RELAX_SECONDS_AFTER_PORTAL_CLEAR = 45;
const RELAX_PORTAL_GAP_BONUS = 0.5;

const SENTRY_HIT_ESTIMATED_DAMAGE = 10;

// Pressure bands. Below LOW the world may lean in slightly; above HIGH it
// eases off hard. Between LOW and HIGH the authored baseline stands as-is.
const PRESSURE_LOW = 25;
const PRESSURE_HIGH = 45;
const PRESSURE_MAX_EFFECT = 80;

const WAVE_SIZE_MULTIPLIER_MIN = 0.45;
const WAVE_SIZE_MULTIPLIER_MAX = 1.15;
const WAVE_DELAY_MULTIPLIER_MAX = 1.6;
const PORTAL_GAP_MULTIPLIER_MAX = 2.0;

const TRACKED_STATS = [
  "ship.collision.damage.total",
  "events.incursion.sentryHit",
  "ship.stranded.total",
  "ship.towed.total",
  "enemy.destroyed.byPlayer",
  "incursion.portalDestroyed.total",
];

export function createEncounterDirector({ getStat }) {
  let pressure = PRESSURE_BASELINE;
  let sampleTimer = 0;
  let relaxTimer = 0;
  let lastSample = null;
  const lastStats = {};
  const applied = {
    waveSizeMultiplier: 1,
    waveDelayMultiplier: 1,
    portalGapMultiplier: 1,
  };

  TRACKED_STATS.forEach((key) => {
    lastStats[key] = getStat(key, 0);
  });

  function update(deltaSeconds, context = {}) {
    relaxTimer = Math.max(0, relaxTimer - deltaSeconds);
    sampleTimer += deltaSeconds;

    if (sampleTimer < SAMPLE_SECONDS) {
      return;
    }

    sampleTimer = 0;
    const deltas = {};

    TRACKED_STATS.forEach((key) => {
      const current = getStat(key, 0);
      deltas[key] = Math.max(0, current - lastStats[key]);
      lastStats[key] = current;
    });

    if (deltas["incursion.portalDestroyed.total"] > 0) {
      relaxTimer = RELAX_SECONDS_AFTER_PORTAL_CLEAR;
    }

    // Standing concern: a nearly-broken hull is stressful even in quiet space.
    const hullMax = context.hullMaxIntegrity ?? 100;
    const hullRatio = hullMax > 0 ? (context.hullIntegrity ?? hullMax) / hullMax : 1;
    const hullConcern = Math.pow(1 - hullRatio, 1.5) * 35;
    const exposure = Math.min(15, (context.nearbyHostileCount ?? 0) * 1.5);
    const damageStress =
      deltas["ship.collision.damage.total"] * 1.4 +
      deltas["events.incursion.sentryHit"] * SENTRY_HIT_ESTIMATED_DAMAGE * 1.4;
    const crisisSpike = deltas["ship.stranded.total"] * 30 + deltas["ship.towed.total"] * 20;
    const relief = deltas["enemy.destroyed.byPlayer"] * 3;

    const rawSample = clamp(hullConcern + exposure + damageStress + crisisSpike - relief, 0, 100);
    pressure = clamp(pressure + (rawSample - pressure) * SAMPLE_BLEND, 0, 100);
    lastSample = {
      rawSample: round1(rawSample),
      hullConcern: round1(hullConcern),
      exposure: round1(exposure),
      damageStress: round1(damageStress),
      crisisSpike: round1(crisisSpike),
      relief: round1(relief),
    };

    slewApplied();
  }

  function slewApplied() {
    const targets = getTargetMultipliers();

    Object.keys(applied).forEach((key) => {
      const difference = targets[key] - applied[key];
      const step = Math.max(-MULTIPLIER_SLEW_PER_TICK, Math.min(MULTIPLIER_SLEW_PER_TICK, difference));
      applied[key] += step;
    });
  }

  function getTargetMultipliers() {
    // 0 at the edge of the comfortable band, 1 at full effect.
    const strain = clamp((pressure - PRESSURE_HIGH) / (PRESSURE_MAX_EFFECT - PRESSURE_HIGH), 0, 1);
    const ease = clamp((PRESSURE_LOW - pressure) / PRESSURE_LOW, 0, 1);

    return {
      waveSizeMultiplier: strain > 0
        ? 1 - strain * (1 - WAVE_SIZE_MULTIPLIER_MIN)
        : 1 + ease * (WAVE_SIZE_MULTIPLIER_MAX - 1),
      waveDelayMultiplier: 1 + strain * (WAVE_DELAY_MULTIPLIER_MAX - 1),
      portalGapMultiplier:
        1 + strain * (PORTAL_GAP_MULTIPLIER_MAX - 1) + (relaxTimer > 0 ? RELAX_PORTAL_GAP_BONUS : 0),
    };
  }

  function getIncursionPacing() {
    return {
      waveSizeMultiplier: applied.waveSizeMultiplier,
      waveDelayMultiplier: applied.waveDelayMultiplier,
      portalGapMultiplier: applied.portalGapMultiplier,
    };
  }

  function getPressure() {
    return pressure;
  }

  function getDebugSnapshot() {
    return {
      pressure: round1(pressure),
      relaxSecondsLeft: round1(relaxTimer),
      pacing: {
        waveSizeMultiplier: round2(applied.waveSizeMultiplier),
        waveDelayMultiplier: round2(applied.waveDelayMultiplier),
        portalGapMultiplier: round2(applied.portalGapMultiplier),
      },
      lastSample,
    };
  }

  return {
    update,
    getPressure,
    getIncursionPacing,
    getDebugSnapshot,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
