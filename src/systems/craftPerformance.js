// How fast a craft goes, and how hard it pushes, composed from the parts that
// have a say in it.
//
// This exists because those two numbers used to be flat fields on the engine
// COMPONENT, which meant the same drive could mean two different things in two
// places. Explorer One flies a Vektor R/T and does 185; buying a Vektor R/T for
// the yard skiff left it at 105, because the speed lived on the component and
// the model carried only the control scheme. The player is right to expect the
// name to mean one thing.
//
// Contributors, innermost first:
//
//   engine model   the drive's own baseline — a Vektor is simply a better
//                  drive than a Rook Standard, wherever it is bolted
//   engine tune    scales fitted on top of that drive (a yard speed tune, and
//                  whatever a better-equipped ship was handed)
//   hull mass      a heavier craft accelerates and tops out lower
//
// Anything that should have a say later gets a line HERE, rather than another
// field consulted at the point of use. One flat number consulted in two places
// is how this drifted apart the first time.
//
// Everything downstream of this — cloak, environment, panel condition — stays
// where it is in `Ship`, because those are momentary states of a craft rather
// than properties of what it is built from.

// A drive with no baseline of its own, and a hull with no stated mass. These
// are the yard skiff's figures, so an unspecified craft flies like the cheapest
// thing in the world rather than like nothing at all.
export const BASE_THRUST_POWER = 95;
export const BASE_MAX_SPEED = 105;
export const REFERENCE_HULL_MASS = 100;

// How hard mass bites. At 1 a double-weight hull would fly at half speed, which
// makes hull choice the only decision that matters; at 0 it is decoration.
// 0.35 means doubling the mass costs about a fifth of the top speed — enough to
// feel, not enough to make a tough hull a punishment.
export const HULL_MASS_INFLUENCE = 0.35;

export function getHullMass(hull) {
  return Number.isFinite(hull?.mass) && hull.mass > 0 ? hull.mass : REFERENCE_HULL_MASS;
}

export function getHullMassScale(hull) {
  return (REFERENCE_HULL_MASS / getHullMass(hull)) ** HULL_MASS_INFLUENCE;
}

export function getCraftPerformance({ engine = null, engineModel = null, hull = null } = {}) {
  const massScale = getHullMassScale(hull);

  const thrustBase = Number.isFinite(engineModel?.thrustPower) ? engineModel.thrustPower : BASE_THRUST_POWER;
  const speedBase = Number.isFinite(engineModel?.maxSpeed) ? engineModel.maxSpeed : BASE_MAX_SPEED;

  const thrustScale = Number.isFinite(engine?.thrustPowerScale) ? engine.thrustPowerScale : 1;
  const speedScale = Number.isFinite(engine?.maxSpeedScale) ? engine.maxSpeedScale : 1;

  return {
    thrustPower: thrustBase * thrustScale * massScale,
    maxSpeed: speedBase * speedScale * massScale,
    // Reported so the cockpit and the diagnostics can show WHY a craft is slow,
    // rather than only that it is.
    driveThrust: thrustBase,
    driveMaxSpeed: speedBase,
    thrustScale,
    speedScale,
    hullMass: getHullMass(hull),
    hullMassScale: massScale,
  };
}
