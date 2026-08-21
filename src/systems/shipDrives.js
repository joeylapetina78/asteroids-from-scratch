// What a hull's drive changes about the journey.
//
// Distance is a real constraint in this world: a carrier may only accept a run
// if the wear it will accumulate leaves it able to reach maintenance afterwards.
// With the authored normal-space drive that budget is about 31,875 units of
// round trip, and First Reach's shortest lane to an outer hub is 37,473 one way.
// The frontier is therefore not expensive to serve, it is unreachable — no
// amount of money moves cargo there, and three settlements starve behind it.
//
// The answer is a different DRIVE, not a different number. A subspace hull runs
// underspace, where the distance still has to be crossed but the crossing costs
// the hull far less, so range becomes something an operator can invest in rather
// than a constant somebody quietly raised.
//
// This is capability from a controlled asset, the same rule the rest of the
// world follows: the drive belongs to the hull, so selling the hull sells the
// range, and a carrier that owns no subspace hull simply cannot bid on frontier
// freight.

export const DRIVE_KIND = Object.freeze({
  NORMAL: "normal-space",
  SUBSPACE: "subspace",
});

export const SHIP_DRIVES = Object.freeze({
  // The authored fleet. Crosses ordinary space, wears at the authored rate, and
  // must steer around whatever is in the way.
  "normal-space": Object.freeze({
    id: "normal-space",
    kind: DRIVE_KIND.NORMAL,
    label: "Standard drive",
    wearMultiplier: 1,
    speedMultiplier: 1,
    // Normal-space craft share the map with rocks: they go around, and rocks
    // can hit them.
    phasesThroughObstacles: false,
  }),
  // Underspace. Deliberately NOT a teleport — the distance is still flown, just
  // faster and far more gently on the hull. A frontier run should still be a
  // journey somebody waits for.
  subspace: Object.freeze({
    id: "subspace",
    kind: DRIVE_KIND.SUBSPACE,
    label: "Subspace drive",
    // Chosen from the map, not taste: the longest authored lane is 84,953 units
    // (Morrow Shoal to Deep Research) and the nearest maintenance from there is
    // another ~3,000, so a round trip is ~173,000. At 0.15 the serviceable
    // distance becomes ~212,500 — the whole frontier is reachable, with margin,
    // and nothing beyond it is free.
    wearMultiplier: 0.15,
    speedMultiplier: 2.5,
    // Underspace has nothing in it to hit. This is also what makes the world's
    // collision rules honest: a craft either shares space with rocks or it does
    // not, and no craft is half of each.
    phasesThroughObstacles: true,
  }),
});

export function getShipDrive(shipInstitution) {
  return SHIP_DRIVES[shipInstitution?.driveId] ?? SHIP_DRIVES["normal-space"];
}

export function hasSubspaceDrive(shipInstitution) {
  return getShipDrive(shipInstitution).kind === DRIVE_KIND.SUBSPACE;
}

// The carrier decides its appetite for wear; the hull decides what a mile costs
// it. Both are real, so the plan is judged against the two combined rather than
// against the company's policy alone.
export function getEffectiveTransportPolicy(policy = {}, shipInstitution = null) {
  const drive = getShipDrive(shipInstitution);
  if (drive.wearMultiplier === 1) return policy;
  return {
    ...policy,
    expectedWearPerDistance: (policy.expectedWearPerDistance ?? 0) * drive.wearMultiplier,
    driveId: drive.id,
  };
}
