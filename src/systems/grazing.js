import { getResourceFamily, normalizeResourceType } from "./resourceDefinitions.js?v=fresh-20260814-2122-cfc8bf2";
import { ROCKMOSS_CRAWLER_TYPE } from "./rockmossStrains.js?v=fresh-20260814-2122-cfc8bf2";
import { RIFT_TROPHY_RESOURCE_TYPE } from "./hostileLoot.js?v=fresh-20260814-2122-cfc8bf2";

// Something else out here is interested in what you left behind.
//
// WHY THIS EXISTS: dropped resources left the world in exactly three ways —
// scooped up by the player, scooped up by a worker, or (for spores) colonised
// onto a rock. So every gate a patrol cleared left its loot lying in space
// forever and the field only ever filled up.
//
// A despawn timer would fix the accounting and cost the world its life. Rockmoss
// spores already leave by a natural process rather than by expiry, and this is
// the same idea pointed at loose ore: rock-grazers eat it, in front of you.
//
// THE RULES THAT PROTECT YOUR LOOP.
//
//   A FRESH DROP IS NOT FOOD. Material has to sit unclaimed for a while before
//   anything will touch it, so cracking a rock and scooping it up is never
//   interfered with. What gets eaten is what was abandoned.
//
//   NOTHING FEEDS UNDER YOUR NOSE. Grazers flee the ship, and inside that same
//   radius they refuse to feed. Your presence protects your haul, so an emptied
//   field is always somewhere you chose to leave.
//
//   GRAZERS ARE ROCK-LIFE, SO THEY EAT ROCK. Volatile, structural and industrial
//   material is what a rock is made of. Refined and exotic material is not food —
//   the stars and diamonds you were flying back for are still there — and neither
//   is a rift trophy, which is a bounty claim rather than a substance.
//
// EATING IS A PERFORMANCE, NOT A DELETION. A drop that simply vanished when a
// creature touched it would read as a despawn timer wearing a costume. So a
// grazer approaches, darts in to taste, flinches back, circles, tries again, and
// only then settles and finishes. You can watch it decide.
//
// AND EATING GIVES SOMETHING BACK. A grazer that has fed enough goes ripe, and a
// ripe one can be shot for the spores it has been growing — the same spores that
// seed rock-life on a rock. The ore itself is genuinely gone; what returns is a
// farming input, so the field clears without the material reappearing in a hold.

export const GRAZING_DEFAULTS = Object.freeze({
  // How long material must lie unclaimed before anything considers it food.
  settleSeconds: 40,
  // Grazers notice a feast from a long way off and come to it. The old radius
  // was a creature's personal space; this is "there is a smorgasbord over there".
  senseRadius: 1900,
  // Matches the flee radius in `updateGrazer` — a creature running from you is
  // not also eating.
  shipShyRadius: 300,

  // ── The meal, as choreography ──
  // Close enough to start tasting rather than travelling.
  nibbleRange: 30,
  // Dart in, flinch back, repeat. Seeded per creature so no two eat alike.
  minNibbles: 2,
  maxNibbles: 4,
  nibbleSeconds: 0.3,
  recoilSeconds: 0.26,
  recoilDistance: 44,
  // The pause on the last bite, before it is gone.
  finishSeconds: 0.4,
  // How far around the drop each flinch carries it, so successive recoils read
  // as circling rather than as bouncing on one axis.
  circleStep: 2.1,
  // Give up on a meal it cannot reach.
  //
  // A drop resting against a rock can sit exactly where a creature's approach
  // and its asteroid-avoidance cancel out, and it will hang there at a fixed
  // distance forever — food claimed, never eaten, and invisible to everything
  // else because the claim is held. That is not hypothetical: it stranded the
  // last two units of a fourteen-unit spill indefinitely. Wanting something is
  // not the same as being able to get to it, so an approach that stops making
  // progress is abandoned and the drop goes back on the board.
  approachTimeoutSeconds: 9,
  // How long that creature avoids the drop it just failed to reach, so it tries
  // something else rather than immediately re-claiming the same trap.
  giveUpSeconds: 20,

  // ── Growth and harvest ──
  fullnessPerMeal: 1,
  ripeAt: 6,
  maxFullness: 12,
  // A ripe grazer is visibly fatter; this is the scale at maxFullness.
  maxGrowthScale: 2.1,

  // ── Emergence ──
  // A pile this big, sitting untouched, is worth surfacing for.
  clusterSize: 5,
  clusterRadius: 560,
  // Enough mouths for a big pile, but not a swarm. A real spill should look
  // like it is being descended on, not politely queued for.
  maxGrazersPerCluster: 7,
});

export const GRAZING_STAGE = Object.freeze({
  APPROACH: "approach",
  NIBBLE: "nibble",
  RECOIL: "recoil",
  FINISH: "finish",
});

// What rock-life will browse. Keyed by resource FAMILY rather than by material,
// so a new ore joins the menu by belonging to a family instead of by being added
// to a list here.
const EDIBLE_FAMILIES = new Set(["volatile", "structural", "industrial"]);

export function isEdible(pickup) {
  if (!pickup) return false;
  const type = normalizeResourceType(pickup.type);
  // A living spore is the most obvious meal in the field.
  if (type === ROCKMOSS_CRAWLER_TYPE) return true;
  // Not a substance — it is a claim on the authority's bounty fund.
  if (type === RIFT_TROPHY_RESOURCE_TYPE) return false;
  return EDIBLE_FAMILIES.has(getResourceFamily(type));
}

export function isSettled(pickup, policy = GRAZING_DEFAULTS) {
  return (pickup?.age ?? 0) >= policy.settleSeconds;
}

export function isRipe(grazer, policy = GRAZING_DEFAULTS) {
  return (grazer?.fullness ?? 0) >= policy.ripeAt;
}

// How much bigger a grazer has grown from what it has eaten.
export function getGrowthScale(grazer, policy = GRAZING_DEFAULTS) {
  const fed = Math.min(1, (grazer?.fullness ?? 0) / Math.max(1, policy.maxFullness));
  return 1 + fed * (policy.maxGrowthScale - 1);
}

// What a harvested grazer is carrying.
//
// Spores, NOT the ore it ate. Handing the material back would undo the entire
// reason this system exists — the field would clear and then refill from the
// creature that cleared it. What you get instead is the input to rock-life
// farming, so a grazer converts abandoned bulk ore into something you can only
// get by letting the world eat it.
export function getGrazerSporeYield(grazer, policy = GRAZING_DEFAULTS) {
  if (!isRipe(grazer, policy)) return 0;
  const over = (grazer.fullness ?? 0) - policy.ripeAt;
  return 2 + Math.floor(over / 2);
}

function distanceSquared(first, second) {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return dx * dx + dy * dy;
}

function nibblesFor(grazer, policy) {
  const span = policy.maxNibbles - policy.minNibbles + 1;
  return policy.minNibbles + (Math.abs(Math.round(grazer.seed ?? 0)) % span);
}

// ── Choosing what to eat ────────────────────────────────────────────────────

// Pair hungry grazers with abandoned drops in ONE ranked pass.
//
// Deliberately not a loop over creatures taking whatever each finds first: that
// hands the grazer earliest in the array its pick of the field, the same
// update-order privilege the extraction market had. Every candidate pair is
// ranked by distance and awarded once.
//
// A grazer already working on something KEEPS it. Re-running a fair auction
// every frame would have creatures abandoning a half-eaten drop the instant a
// marginally closer one appeared, which is how you get a field full of animals
// twitching between meals and finishing none of them.
export function planGrazing(grazers, pickups, { shipPosition = null, policy = GRAZING_DEFAULTS } = {}) {
  const shyRadiusSquared = policy.shipShyRadius * policy.shipShyRadius;
  const senseRadiusSquared = policy.senseRadius * policy.senseRadius;
  const guarded = (point) => Boolean(shipPosition) && distanceSquared(point, shipPosition) < shyRadiusSquared;

  const available = new Set(pickups.filter((pickup) => isEdible(pickup)
    && isSettled(pickup, policy)
    && !guarded(pickup.position)));

  const assignments = [];
  const busy = new Set();

  // Sitting meals first, so nobody's dinner is auctioned out from under them.
  grazers.forEach((grazer) => {
    const held = grazer.grazingTarget;
    if (!held || !available.has(held) || guarded(grazer.position)) return;
    available.delete(held);
    busy.add(grazer);
    assignments.push({ grazer, pickup: held, distance: Math.sqrt(distanceSquared(grazer.position, held.position)) });
  });

  const candidates = [];
  grazers.forEach((grazer) => {
    if (busy.has(grazer) || guarded(grazer.position)) return;
    available.forEach((pickup) => {
      // Something it recently failed to reach is somebody else's problem for a
      // while. Another creature coming from a different angle may well manage it.
      if (grazer.grazingAvoid === pickup && (grazer.age ?? 0) < (grazer.grazingAvoidUntil ?? 0)) return;
      const separation = distanceSquared(grazer.position, pickup.position);
      if (separation > senseRadiusSquared) return;
      candidates.push({ grazer, pickup, separation });
    });
  });

  candidates.sort((first, second) => first.separation - second.separation
    // Ties break on identity rather than array position, so a dead heat does not
    // silently fall back to seed order.
    || String(first.grazer.seed).localeCompare(String(second.grazer.seed)));

  candidates.forEach(({ grazer, pickup, separation }) => {
    if (busy.has(grazer) || !available.has(pickup)) return;
    busy.add(grazer);
    available.delete(pickup);
    assignments.push({ grazer, pickup, distance: Math.sqrt(separation) });
  });

  return assignments;
}

// ── Eating, as something you can watch ──────────────────────────────────────

function beginMeal(grazer, pickup, policy) {
  grazer.grazingTarget = pickup;
  grazer.grazingStage = GRAZING_STAGE.APPROACH;
  grazer.grazingStageSeconds = 0;
  grazer.grazingBitesLeft = nibblesFor(grazer, policy);
  grazer.grazingCircle = (grazer.seed ?? 0) % (Math.PI * 2);
}

export function clearMeal(grazer) {
  grazer.grazingTarget = null;
  grazer.grazingStage = null;
  grazer.grazingStageSeconds = 0;
  grazer.grazingBitesLeft = 0;
}

// Where the creature should be steering right now. The entity does the moving;
// this only says where, so the whole performance stays testable.
export function getGrazingSteerTarget(grazer) {
  const pickup = grazer?.grazingTarget;
  if (!pickup) return null;
  if (grazer.grazingStage !== GRAZING_STAGE.RECOIL) return pickup.position;

  // Flinch back to a point beside the drop, advancing around it each time.
  const reach = grazer.grazingRecoilDistance ?? GRAZING_DEFAULTS.recoilDistance;
  return {
    x: pickup.position.x + Math.cos(grazer.grazingCircle) * reach,
    y: pickup.position.y + Math.sin(grazer.grazingCircle) * reach,
  };
}

// Advance every grazer's meal by a frame. Returns the drops that were finished,
// for the caller to remove from the world — this module never mutates the pickup
// list itself, the same way the mining clearing hands back awards rather than
// applying them.
export function advanceGrazing(grazers, pickups, { deltaSeconds, shipPosition = null, policy = GRAZING_DEFAULTS } = {}) {
  const assignments = planGrazing(grazers, pickups, { shipPosition, policy });
  const assigned = new Map(assignments.map((assignment) => [assignment.grazer, assignment]));
  const eaten = [];

  // Anything that lost its meal — scared off, or outbid before it started —
  // forgets the whole performance rather than resuming mid-bite later.
  grazers.forEach((grazer) => {
    if (!assigned.has(grazer) && grazer.grazingTarget) clearMeal(grazer);
  });

  assignments.forEach(({ grazer, pickup, distance }) => {
    if (grazer.grazingTarget !== pickup || !grazer.grazingStage) beginMeal(grazer, pickup, policy);
    grazer.grazingRecoilDistance = policy.recoilDistance;
    grazer.grazingStageSeconds = (grazer.grazingStageSeconds ?? 0) + deltaSeconds;

    if (grazer.grazingStage === GRAZING_STAGE.APPROACH) {
      // Still travelling. Arriving is what starts the meal, not a clock.
      //
      // `grazeReach` is how close the creature can actually GET, which is not
      // always how close the drop is: material settles inside and against rocks,
      // and nothing is going to fly into a boulder to reach an ore pebble buried
      // sixty units deep in it. The world computes the reachable distance (it is
      // the thing that knows where the rocks are) and a grazer browses the rock
      // face instead — which is what rock-life does anyway.
      if (distance <= (pickup.grazeReach ?? policy.nibbleRange)) {
        grazer.grazingStage = GRAZING_STAGE.NIBBLE;
        grazer.grazingStageSeconds = 0;
        return;
      }
      // Unless it is never going to arrive, in which case it stops holding a
      // claim on food it cannot reach.
      if (grazer.grazingStageSeconds >= policy.approachTimeoutSeconds) {
        grazer.grazingAvoid = pickup;
        grazer.grazingAvoidUntil = (grazer.age ?? 0) + policy.giveUpSeconds;
        clearMeal(grazer);
      }
      return;
    }

    if (grazer.grazingStage === GRAZING_STAGE.NIBBLE) {
      if (grazer.grazingStageSeconds < policy.nibbleSeconds) return;
      grazer.grazingBitesLeft -= 1;
      grazer.grazingStageSeconds = 0;
      // The last taste turns into settling on it; the others into a flinch.
      grazer.grazingStage = grazer.grazingBitesLeft > 0 ? GRAZING_STAGE.RECOIL : GRAZING_STAGE.FINISH;
      grazer.grazingCircle += policy.circleStep;
      return;
    }

    if (grazer.grazingStage === GRAZING_STAGE.RECOIL) {
      if (grazer.grazingStageSeconds < policy.recoilSeconds) return;
      grazer.grazingStage = GRAZING_STAGE.NIBBLE;
      grazer.grazingStageSeconds = 0;
      return;
    }

    if (grazer.grazingStageSeconds < policy.finishSeconds) return;

    eaten.push(pickup);
    grazer.fullness = Math.min(policy.maxFullness, (grazer.fullness ?? 0) + policy.fullnessPerMeal);
    clearMeal(grazer);
  });

  return { eaten, assignments };
}

// ── Emergence: a feast should draw a crowd ──────────────────────────────────

// Piles of abandoned material that nobody is working on yet.
//
// The point is that a big spill should not sit there politely waiting for
// whichever creature happened to spawn nearby. Somewhere with five untouched
// drops and no mouths on them is a reason for rock-life to surface.
export function findGrazingClusters(pickups, grazers, { shipPosition = null, policy = GRAZING_DEFAULTS } = {}) {
  const shyRadiusSquared = policy.shipShyRadius * policy.shipShyRadius;
  const clusterRadiusSquared = policy.clusterRadius * policy.clusterRadius;

  const food = pickups.filter((pickup) => isEdible(pickup)
    && isSettled(pickup, policy)
    && !(shipPosition && distanceSquared(pickup.position, shipPosition) < shyRadiusSquared));

  if (food.length < policy.clusterSize) return [];

  const clusters = [];
  const claimed = new Set();

  // Seed a cluster on the drop with the most neighbours, so the crowd surfaces
  // at the middle of the spill rather than at whichever end came first.
  const ranked = food
    .map((pickup) => ({
      pickup,
      neighbours: food.filter((other) => distanceSquared(pickup.position, other.position) <= clusterRadiusSquared),
    }))
    .sort((first, second) => second.neighbours.length - first.neighbours.length
      || String(first.pickup.type).localeCompare(String(second.pickup.type)));

  ranked.forEach(({ pickup, neighbours }) => {
    if (claimed.has(pickup)) return;
    const members = neighbours.filter((other) => !claimed.has(other));
    if (members.length < policy.clusterSize) return;

    members.forEach((member) => claimed.add(member));
    const centre = members.reduce((sum, member) => ({
      x: sum.x + member.position.x / members.length,
      y: sum.y + member.position.y / members.length,
    }), { x: 0, y: 0 });

    const attending = grazers.filter((grazer) => distanceSquared(grazer.position, centre) <= clusterRadiusSquared).length;
    const wanted = Math.min(policy.maxGrazersPerCluster, Math.ceil(members.length / 3));

    if (attending >= wanted) return;
    clusters.push({ centre, units: members.length, attending, wanted, missing: wanted - attending });
  });

  return clusters;
}
