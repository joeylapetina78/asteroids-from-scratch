import { getResourceFamily, normalizeResourceType } from "./resourceDefinitions.js?v=fresh-20260820-0654-6716a5f";
import { ROCKMOSS_CRAWLER_TYPE } from "./rockmossStrains.js?v=fresh-20260820-0654-6716a5f";
import { RIFT_TROPHY_RESOURCE_TYPE } from "./hostileLoot.js?v=fresh-20260820-0654-6716a5f";

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

  // ── The mouth: a grown one stops nibbling and starts filtering ──
  //
  // A small grazer picks at one drop at a time. A big one opens a field and
  // hoovers as it swims, the way a whale stops chasing individual animals and
  // just holds its mouth open. The glow IS the field — what you can see is
  // exactly what it can reach, so a fat one cruising a spill visibly clears a
  // lane through it.
  fieldFromFullness: 3,
  fieldRadiusMin: 60,
  fieldRadiusMax: 210,
  // Matched to the ship's collector so a grazer's pull reads as the same kind of
  // machinery the player already understands.
  fieldPullForce: 380,
  // Close enough to the mouth to be gone.
  swallowRange: 24,

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

// How far a grazer's feeding field reaches. Zero until it has grown into one,
// then it opens up with fullness — this is the radius the glow is drawn at, so
// the creature's reach is never a hidden number.
export function getGrazeFieldRadius(grazer, policy = GRAZING_DEFAULTS) {
  const fullness = grazer?.fullness ?? 0;
  if (fullness < policy.fieldFromFullness) return 0;
  const span = Math.max(1, policy.maxFullness - policy.fieldFromFullness);
  const grown = Math.min(1, (fullness - policy.fieldFromFullness) / span);
  return policy.fieldRadiusMin + grown * (policy.fieldRadiusMax - policy.fieldRadiusMin);
}

export function isFilterFeeder(grazer, policy = GRAZING_DEFAULTS) {
  return getGrazeFieldRadius(grazer, policy) > 0;
}

// A stuffed one stops hunting. It still drags material around in its field —
// that is just physics, and it looks right — but it claims nothing and eats
// nothing, so it stops competing with hungrier neighbours for a spill it has no
// room for. Being full is also the point at which it is worth the most to shoot.
export function isSated(grazer, policy = GRAZING_DEFAULTS) {
  return (grazer?.fullness ?? 0) >= policy.maxFullness;
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
export function planGrazing(grazers, pickups, {
  shipPosition = null,
  policy = GRAZING_DEFAULTS,
  assignNew = true,
} = {}) {
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
    if (!held || !available.has(held) || guarded(grazer.position) || isSated(grazer, policy)) return;
    available.delete(held);
    busy.add(grazer);
    assignments.push({ grazer, pickup: held, distance: Math.sqrt(distanceSquared(grazer.position, held.position)) });
  });

  // Existing meals still advance every frame, but the expensive all-pairs
  // auction only needs to run a few times per second.
  if (!assignNew) return assignments;

  const candidates = [];
  grazers.forEach((grazer) => {
    if (busy.has(grazer) || guarded(grazer.position) || isSated(grazer, policy)) return;
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

// A grown grazer feeding by suction rather than by picking.
//
// It does NOT claim what it eats. A filter feeder does not pick a target and
// negotiate for it — it swims with its mouth open and whatever it passes goes
// in. So this runs outside the ranked clearing entirely: no assignment, no
// choreography, just physics. Two big ones crossing the same spill both pull at
// it and whichever mouth reaches it first gets it, which is what should happen.
//
// The pull is the same shape the ship's collector uses, so a grazer's field
// reads as the same kind of machinery the player already has a feel for.
function applyGrazeFields(grazers, pickups, { deltaSeconds, guarded, policy }) {
  const swallowed = new Set();
  const swallowRangeSquared = policy.swallowRange * policy.swallowRange;

  grazers.forEach((grazer) => {
    const radius = getGrazeFieldRadius(grazer, policy);
    if (radius <= 0 || guarded(grazer.position)) return;
    const radiusSquared = radius * radius;
    let room = policy.maxFullness - (grazer.fullness ?? 0);

    pickups.forEach((pickup) => {
      if (swallowed.has(pickup) || !isEdible(pickup) || !isSettled(pickup, policy)) return;
      if (guarded(pickup.position)) return;

      // Suction reaches THROUGH the rock face it is browsing. Material settles
      // deep inside boulders and a creature is held well off a big one's surface
      // by its own rock-shyness, so a field measured only from the creature can
      // fall short of ore it is parked right beside. Extending it by how deeply
      // the drop is buried is what lets a grown one draw buried material out
      // instead of hovering next to it — which is the whole reason the field
      // beats picking.
      const buried = Math.max(0, (pickup.grazeReach ?? policy.nibbleRange) - policy.nibbleRange);
      const reachSquared = (radius + buried) * (radius + buried);

      const dx = grazer.position.x - pickup.position.x;
      const dy = grazer.position.y - pickup.position.y;
      const separation = dx * dx + dy * dy;
      if (separation === 0 || separation > reachSquared) return;

      const gap = Math.sqrt(separation);
      const pullRadius = radius + buried;

      // Sweep rather than test a point. The pull accelerates material hard and
      // nothing damps it, so a drop can cross the entire mouth between two
      // frames — tunnelling straight through, getting yanked back, and orbiting
      // forever without ever being measured as "close enough". Anything that
      // would pass through the mouth this frame is eaten by it.
      const closingSpeed = Math.hypot(pickup.velocity?.x ?? 0, pickup.velocity?.y ?? 0);
      const mouth = policy.swallowRange + closingSpeed * deltaSeconds;

      if (separation <= swallowRangeSquared || gap <= mouth) {
        // A full one still drags material along without eating it, which is why
        // `room` gates the swallow rather than the pull.
        if (room <= 0) return;
        swallowed.add(pickup);
        grazer.fullness = Math.min(policy.maxFullness, (grazer.fullness ?? 0) + policy.fullnessPerMeal);
        room -= policy.fullnessPerMeal;
        return;
      }

      // Stronger the closer it gets, so material accelerates into the mouth
      // instead of drifting in at a constant crawl.
      const strength = Math.max(0.45, 1 - gap / pullRadius) * 1.35;
      const force = policy.fieldPullForce * strength * deltaSeconds;
      pickup.velocity.x += (dx / gap) * force;
      pickup.velocity.y += (dy / gap) * force;
    });
  });

  return swallowed;
}

// Advance every grazer's meal by a frame. Returns the drops that were finished,
// for the caller to remove from the world — this module never mutates the pickup
// list itself, the same way the mining clearing hands back awards rather than
// applying them.
export function advanceGrazing(grazers, pickups, {
  deltaSeconds,
  shipPosition = null,
  policy = GRAZING_DEFAULTS,
  assignNew = true,
} = {}) {
  const shyRadiusSquared = policy.shipShyRadius * policy.shipShyRadius;
  const guarded = (point) => Boolean(shipPosition) && distanceSquared(point, shipPosition) < shyRadiusSquared;

  // Suction first, and outside the clearing entirely: a grown one eats what it
  // swims through rather than what it was awarded.
  const swallowed = applyGrazeFields(grazers, pickups, { deltaSeconds, guarded, policy });
  const eaten = [...swallowed];

  const assignments = planGrazing(grazers, pickups, { shipPosition, policy, assignNew })
    // Anything a mouth already closed on this frame is not still a meal to walk
    // toward — including somebody else's.
    .filter(({ pickup }) => !swallowed.has(pickup));
  const assigned = new Map(assignments.map((assignment) => [assignment.grazer, assignment]));

  // Anything that lost its meal — scared off, outbid before it started, or
  // hoovered up by a bigger neighbour — forgets the whole performance rather
  // than resuming mid-bite later.
  grazers.forEach((grazer) => {
    if (!assigned.has(grazer) && grazer.grazingTarget) clearMeal(grazer);
  });

  assignments.forEach(({ grazer, pickup, distance }) => {
    // A filter feeder still swims at food, but it has stopped picking at things:
    // it takes its target in one gulp on arrival rather than tasting it.
    //
    // The gulp happens at `grazeReach`, not at the mouth, and that is not a
    // detail — ore settles deep inside rocks, and a creature can never physically
    // get its mouth within a couple of dozen units of something buried a hundred
    // deep in a boulder. Leaving suction as the only way a grown one eats made it
    // WORSE at buried material than a small one that nibbles from the rock face.
    // Growing up should never cost a creature food it used to be able to reach.
    if (isFilterFeeder(grazer, policy)) {
      if (grazer.grazingTarget !== pickup) beginMeal(grazer, pickup, policy);
      grazer.grazingStage = GRAZING_STAGE.APPROACH;
      // This branch returns before the shared timer below, so it has to run its
      // own clock — without it a filter feeder parked next to something it can
      // never reach would hold that claim forever, which is exactly the freeze
      // the give-up rule exists to prevent.
      grazer.grazingStageSeconds = (grazer.grazingStageSeconds ?? 0) + deltaSeconds;

      if (distance <= (pickup.grazeReach ?? policy.nibbleRange)) {
        eaten.push(pickup);
        grazer.fullness = Math.min(policy.maxFullness, (grazer.fullness ?? 0) + policy.fullnessPerMeal);
        clearMeal(grazer);
        return;
      }

      // Still subject to giving up on something it genuinely cannot get to.
      if (grazer.grazingStageSeconds >= policy.approachTimeoutSeconds) {
        grazer.grazingAvoid = pickup;
        grazer.grazingAvoidUntil = (grazer.age ?? 0) + policy.giveUpSeconds;
        clearMeal(grazer);
      }
      return;
    }

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
