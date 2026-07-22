import { createValueNoise } from "./valueNoise.js";
import { limitVelocity } from "./flightPhysics.js?v=fresh-20260721-2114-33b9943";

// The environment field: colored regions of open space that act on the ship
// each frame. This is the "substance" of hazards and boons — spatial fields,
// not tags — driven by low-frequency noise so they exist everywhere
// procedurally. Each entry below is one self-contained field: a color, a noise
// channel, a rarity threshold, and an `effect` that mutates the ship. Adding a
// new one to this list makes it render and apply automatically.
//
// Origin-clearance: benign fields (wind/slick/mending) start fairly close so
// they're discoverable right outside the starter hubs; harmful fields stay
// farther out so the tutorial route can't wander into a hull-burning cloud.
const SAFE_RADIUS = 3600;
const HARMFUL_SAFE_RADIUS = 6500;
const SAFE_RAMP = 2600;

// Wind/slipstream flow direction. A separate low-frequency channel so a
// current's push is coherent — a whole region drifts the same way.
const flowNoise = createValueNoise(88011);

export const ENVIRONMENT_FIELDS = [
  {
    id: "corrosive",
    label: "Corrosive Drift",
    hint: "hull corroding — clear the cloud",
    color: [140, 205, 78], // sickly green
    harmful: true,
    noise: createValueNoise(70223),
    scale: 5200,
    threshold: 0.75,
    full: 0.87,
    effect({ hull, intensity, deltaSeconds }) {
      hull.integrity = Math.max(0, hull.integrity - 5 * intensity * deltaSeconds);
    },
  },
  {
    id: "mending",
    label: "Mending Haze",
    hint: "hull knitting back together",
    color: [235, 120, 205], // pink
    noise: createValueNoise(24107),
    scale: 4600,
    threshold: 0.79,
    full: 0.89,
    effect({ hull, intensity, deltaSeconds }) {
      hull.integrity = Math.min(hull.maxIntegrity ?? hull.integrity, hull.integrity + 4 * intensity * deltaSeconds);
    },
  },
  {
    id: "wind",
    label: "Solar Wind",
    hint: "a current is carrying you",
    color: [96, 156, 240], // blue
    flow: true,
    noise: createValueNoise(51899),
    scale: 5000,
    threshold: 0.62,
    full: 0.8,
    effect({ ship, intensity, deltaSeconds, flowAngle, maxSpeed }) {
      ship.velocity.x += Math.cos(flowAngle) * 95 * intensity * deltaSeconds;
      ship.velocity.y += Math.sin(flowAngle) * 95 * intensity * deltaSeconds;
      // Wind can carry you faster than your own thrust, but stays bounded.
      limitVelocity(ship.velocity, maxSpeed * 1.5);
    },
  },
  {
    id: "slick",
    label: "Slipstream",
    hint: "friction falls away — you glide",
    color: [170, 110, 240], // purple
    noise: createValueNoise(63311),
    scale: 4800,
    threshold: 0.66,
    full: 0.82,
    effect({ ship, intensity, deltaSeconds, maxSpeed }) {
      // Counter the ship's coasting drag so momentum is preserved — slippery,
      // hard to slow. Tuned near drag-neutral, never a runaway accelerator.
      const gain = 1 + 0.35 * intensity * deltaSeconds;
      ship.velocity.x *= gain;
      ship.velocity.y *= gain;
      limitVelocity(ship.velocity, maxSpeed * 1.3);
    },
  },
];

// The strongest field active at a world point, or null. Only the dominant
// field applies/renders at a given spot, so overlaps read as one clean color
// and effects never fight (e.g. corrosive vs mending cancelling out).
export function sampleEnvironment(x, y) {
  const homeDistance = Math.hypot(x, y);
  let best = null;

  for (const field of ENVIRONMENT_FIELDS) {
    const safeRadius = field.harmful ? HARMFUL_SAFE_RADIUS : SAFE_RADIUS;

    if (homeDistance < safeRadius) {
      continue;
    }

    const safeRamp = clamp01((homeDistance - safeRadius) / SAFE_RAMP);
    const intensity = fieldIntensity(field, x, y) * safeRamp;

    if (intensity > 0 && (!best || intensity > best.intensity)) {
      best = { field, intensity };
    }
  }

  return best;
}

export function getFlowAngle(x, y) {
  return flowNoise(x, y, 4200) * Math.PI * 2;
}

function fieldIntensity(field, x, y) {
  const raw = field.noise(x, y, field.scale) * 0.65
    + field.noise(x + 1300, y - 800, field.scale * 0.4) * 0.35;

  if (raw <= field.threshold) {
    return 0;
  }

  return clamp01((raw - field.threshold) / (field.full - field.threshold));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
