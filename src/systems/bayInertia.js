// Ship motion, felt as weight inside a bay.
//
// Loose material in a hold has no engine of its own. When the ship accelerates,
// the bay walls accelerate with it and the material floating inside does not —
// so from the cockpit it appears to slide the other way. That pseudo-force is
// the only thing a body in an inertial frame can feel, and supplying it is what
// makes a hold read as part of a ship rather than an aquarium bolted to the
// side of one. Under thrust, cargo leans aft. On the brakes, it comes forward.
//
// The bays are drawn in a viewport that does not rotate with the hull, so world
// axes and bay axes are the same and no rotation is needed here.
//
// Acceleration is derived from the ship's VELOCITY rather than read off the
// throttle, so anything that changes the ship's motion is felt: thrust, brakes,
// boost, a tether snapping taut, a rock hitting the hull.

// How quickly the felt force catches up with the real one, per second. This is
// the lag — the bay does not snap to a new force, it leans into it, the same
// quality the camera spring gives the viewport.
const CATCH_UP_PER_SECOND = 6;
// Ship acceleration is in world units per second squared; bay units are canvas
// pixels. This converts between them, and it is the dial for how heavily the
// hold reacts.
const DEFAULT_SCALE = 1.6;
// A collision changes velocity within a single frame, which divides out to an
// enormous instantaneous acceleration. Without a ceiling one bump would fire
// every unit through a wall.
const DEFAULT_MAX_ACCELERATION = 600;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createBayInertia({
  getVelocity,
  scale = DEFAULT_SCALE,
  maxAcceleration = DEFAULT_MAX_ACCELERATION,
  catchUpPerSecond = CATCH_UP_PER_SECOND,
} = {}) {
  let previous = null;
  const felt = { x: 0, y: 0 };

  return {
    // Called once per bay frame with that frame's delta. Returns the pseudo-
    // acceleration to apply to every loose unit, in bay pixels per second
    // squared.
    sample(deltaSeconds) {
      const velocity = getVelocity?.();

      if (!velocity || !Number.isFinite(velocity.x) || !Number.isFinite(velocity.y)) {
        // No ship to feel — docked, destroyed, or not built yet. Let whatever
        // is still leaning fall back to neutral rather than freezing mid-lean.
        previous = null;
        felt.x = 0;
        felt.y = 0;
        return felt;
      }

      if (previous && deltaSeconds > 0) {
        const targetX = clamp(-((velocity.x - previous.x) / deltaSeconds) * scale, -maxAcceleration, maxAcceleration);
        const targetY = clamp(-((velocity.y - previous.y) / deltaSeconds) * scale, -maxAcceleration, maxAcceleration);
        // Frame-rate independent exponential approach, so the lag is a duration
        // rather than a number of frames.
        const catchUp = 1 - Math.exp(-catchUpPerSecond * deltaSeconds);

        felt.x += (targetX - felt.x) * catchUp;
        felt.y += (targetY - felt.y) * catchUp;
      }

      previous = { x: velocity.x, y: velocity.y };
      return felt;
    },
  };
}
