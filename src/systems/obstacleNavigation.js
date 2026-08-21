// The collision law, for craft that share space with the field.
//
// Whether a craft can pass through a rock used to be an accident of which entity
// happened to get collision code. Haulers politely steered around obstacles they
// could not have hit; miners and patrols flew straight through them; a tow
// truck's cable collided while the truck it was attached to did not. Three
// different answers to one question, none of them stated anywhere.
//
// The rule is now single and physical:
//
//   A craft is either in NORMAL SPACE, where it must work around what is in the
//   way, or in SUBSPACE, where there is nothing to work around. Nothing is half
//   of each.
//
// This module is the normal-space half: a steering force that pushes a craft
// around nearby obstacles. It deliberately governs TRAVERSAL — whether you must
// go around — and not damage. Whether contact hurts is a separate hazard rule
// that already distinguishes combatants from working craft, and a miner has to
// be able to park against the rock it is cutting.
//
// Haulers keep their own richer version, which also reasons about corridors and
// careful mode. Same law, more capable navigator.

const DEFAULTS = Object.freeze({
  // How far out a rock starts pushing back, beyond its own radius.
  clearance: 150,
  // Look-ahead along the current heading, so a craft turns before it arrives
  // rather than scraping along the surface.
  feeler: 130,
  maxForce: 0.4,
});

export function steerAroundObstacles(craft, obstacles = [], options = {}) {
  const { clearance, feeler, maxForce } = { ...DEFAULTS, ...options };
  // Something the craft is deliberately approaching — its mining target, its
  // dock — is not an obstacle. Without this a miner would push itself away from
  // the very rock it was sent to cut.
  const exempt = options.exempt ?? null;
  if (!obstacles.length) return { x: 0, y: 0 };

  const speed = Math.hypot(craft.velocity?.x ?? 0, craft.velocity?.y ?? 0);
  const forward = speed > 0.001
    ? { x: (craft.velocity.x) / speed, y: (craft.velocity.y) / speed }
    // Craft spell their facing differently: `heading` on haulers and patrols,
    // `angle` on worker hulls. Reading only one silently points a stationary
    // craft due east and makes its look-ahead meaningless.
    : (() => { const facing = craft.heading ?? craft.angle ?? 0; return { x: Math.cos(facing), y: Math.sin(facing) }; })();
  const ahead = {
    x: craft.position.x + forward.x * feeler,
    y: craft.position.y + forward.y * feeler,
  };
  const side = options.side ?? 1;

  let pushX = 0;
  let pushY = 0;
  let count = 0;

  obstacles.forEach((obstacle) => {
    if (!obstacle || obstacle === exempt || !obstacle.position) return;
    const safeRadius = (obstacle.radius ?? 0) + (craft.radius ?? 0) + clearance;
    const here = Math.hypot(craft.position.x - obstacle.position.x, craft.position.y - obstacle.position.y);
    const there = Math.hypot(ahead.x - obstacle.position.x, ahead.y - obstacle.position.y);
    const nearest = Math.min(here, there);
    if (nearest > safeRadius || nearest === 0) return;

    const strength = Math.max(0, (safeRadius - nearest) / safeRadius) ** 1.25;
    const awayX = (craft.position.x - obstacle.position.x) / Math.max(1, here);
    const awayY = (craft.position.y - obstacle.position.y) / Math.max(1, here);
    // Straight away from a rock stalls a craft against it; a consistent sideways
    // component makes it slide past instead of standing off.
    const passX = -forward.y * side;
    const passY = forward.x * side;

    pushX += awayX * strength * 0.7 + passX * strength * 0.9;
    pushY += awayY * strength * 0.7 + passY * strength * 0.9;
    count += 1;
  });

  if (count === 0) return { x: 0, y: 0 };
  pushX /= count;
  pushY /= count;

  const magnitude = Math.hypot(pushX, pushY);
  if (magnitude <= maxForce || magnitude === 0) return { x: pushX, y: pushY };
  return { x: (pushX / magnitude) * maxForce, y: (pushY / magnitude) * maxForce };
}

// Is anything solid close enough to matter? Cheap pre-check for callers that
// only want to pay for steering when there is something to steer around.
export function hasNearbyObstacle(craft, obstacles = [], radius = 420) {
  return obstacles.some((obstacle) => obstacle?.position
    && Math.hypot(craft.position.x - obstacle.position.x, craft.position.y - obstacle.position.y)
      <= radius + (obstacle.radius ?? 0));
}
