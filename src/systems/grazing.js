import { getResourceFamily, normalizeResourceType } from "./resourceDefinitions.js?v=fresh-20260814-2016-6d4590b";
import { ROCKMOSS_CRAWLER_TYPE } from "./rockmossStrains.js?v=fresh-20260814-2016-6d4590b";
import { RIFT_TROPHY_RESOURCE_TYPE } from "./hostileLoot.js?v=fresh-20260814-2016-6d4590b";

// Something else out here is interested in what you left behind.
//
// WHY THIS EXISTS: dropped resources were removed from the world in exactly
// three places — collected by the player, collected by a worker ship, or (for
// rockmoss spores) colonised onto a rock. Nothing else. So every gate a patrol
// cleared and every rock anyone cracked left its loot lying in space forever,
// and the field slowly filled with free material that only ever accumulated.
//
// A despawn timer would fix the accounting and cost the world its life. Rockmoss
// spores already leave by a natural process rather than by expiry, and this is
// the same idea pointed at loose ore: rock-grazers eat it.
//
// THREE RULES DO ALL THE DESIGN WORK HERE.
//
//   A FRESH DROP IS NOT FOOD. Material has to sit unclaimed for a while before
//   anything will touch it, so the ordinary loop of cracking a rock and scooping
//   it up is never interfered with. What gets eaten is what was abandoned.
//
//   NOTHING FEEDS UNDER YOUR NOSE. Grazers already flee the ship inside 300
//   units; that same radius makes them refuse to feed. Your presence protects
//   your haul, which means the frustrating case — coming back to an emptied
//   field — is always something you chose by leaving.
//
//   GRAZERS ARE ROCK-LIFE, SO THEY EAT ROCK. Volatiles, structural and
//   industrial material is what a rock is made of and it is what they browse.
//   Refined and exotic material is not food, and neither is a rift trophy, which
//   is a bearer token for a bounty rather than a substance. The rare thing you
//   were flying back for is still there; the bulk ore you abandoned is not.

export const GRAZING_DEFAULTS = Object.freeze({
  // How long material must lie unclaimed before anything considers it food.
  settleSeconds: 40,
  // How far a grazer notices a settled drop.
  senseRadius: 430,
  // Close enough to be feeding on it.
  reachRadius: 30,
  // Matches the flee radius in `updateGrazer` — a creature that is running from
  // you is not also eating.
  shipShyRadius: 300,
  // How long one drop takes to finish.
  biteSeconds: 6,
  // How fast interrupted feeding is forgotten, per second. A grazer scared off
  // mid-meal does not get to resume where it left off.
  forgetPerSecond: 0.5,
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

function distanceSquared(first, second) {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return dx * dx + dy * dy;
}

// Pair hungry grazers with abandoned drops in ONE ranked pass.
//
// Deliberately not a loop over grazers taking whatever each finds first: that
// hands the creature earliest in the array its pick of the field, the same
// update-order privilege the extraction market had. Every candidate pair is
// ranked by distance and awarded once, so who eats what depends on where things
// are rather than on what order they happen to sit in memory.
export function planGrazing(grazers, pickups, { shipPosition = null, policy = GRAZING_DEFAULTS } = {}) {
  const shyRadiusSquared = policy.shipShyRadius * policy.shipShyRadius;
  const senseRadiusSquared = policy.senseRadius * policy.senseRadius;

  const food = pickups.filter((pickup) => isEdible(pickup)
    && isSettled(pickup, policy)
    // Anything close to the ship is under your protection, not on the menu.
    && !(shipPosition && distanceSquared(pickup.position, shipPosition) < shyRadiusSquared));

  if (food.length === 0) return [];

  const candidates = [];
  grazers.forEach((grazer) => {
    // A grazer fleeing the ship is not feeding.
    if (shipPosition && distanceSquared(grazer.position, shipPosition) < shyRadiusSquared) return;
    food.forEach((pickup) => {
      const separation = distanceSquared(grazer.position, pickup.position);
      if (separation > senseRadiusSquared) return;
      candidates.push({ grazer, pickup, separation });
    });
  });

  candidates.sort((first, second) => first.separation - second.separation
    // Ties break on identity rather than position in the array, so a dead heat
    // does not silently fall back to seed order.
    || String(first.grazer.seed).localeCompare(String(second.grazer.seed)));

  const claimedGrazers = new Set();
  const claimedFood = new Set();
  const assignments = [];

  candidates.forEach(({ grazer, pickup, separation }) => {
    if (claimedGrazers.has(grazer) || claimedFood.has(pickup)) return;
    claimedGrazers.add(grazer);
    claimedFood.add(pickup);
    assignments.push({ grazer, pickup, distance: Math.sqrt(separation) });
  });

  return assignments;
}

// Advance feeding by a frame. Returns the drops that were finished, for the
// caller to remove from the world — this module never mutates the pickup list
// itself, the same way the mining clearing hands back awards rather than
// applying them.
export function advanceGrazing(grazers, pickups, { deltaSeconds, shipPosition = null, policy = GRAZING_DEFAULTS } = {}) {
  const assignments = planGrazing(grazers, pickups, { shipPosition, policy });
  const feeding = new Map(assignments.map((assignment) => [assignment.pickup, assignment]));
  const eaten = [];

  assignments.forEach(({ grazer, pickup, distance }) => {
    // Steering is the entity's job; this only says what it is going for.
    grazer.grazingTarget = pickup;
    if (distance > policy.reachRadius) return;
    pickup.grazedSeconds = (pickup.grazedSeconds ?? 0) + deltaSeconds;
    if (pickup.grazedSeconds >= policy.biteSeconds) eaten.push(pickup);
  });

  grazers.forEach((grazer) => {
    if (!assignments.some((assignment) => assignment.grazer === grazer)) grazer.grazingTarget = null;
  });

  // A half-eaten drop nobody is working on recovers, so wandering past something
  // is not the same as having started on it.
  pickups.forEach((pickup) => {
    if (feeding.has(pickup) || !(pickup.grazedSeconds > 0)) return;
    pickup.grazedSeconds = Math.max(0, pickup.grazedSeconds - policy.forgetPerSecond * deltaSeconds);
  });

  return { eaten, assignments };
}
