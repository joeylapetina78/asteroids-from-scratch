import { getRegionProfile } from "./worldRegions.js?v=fresh-20260721-2114-33b9943";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260721-2114-33b9943";

// Bounty contracts are the combat sibling of survey runs. Where a survey asks
// the world what ORE exists near a hub, a bounty asks where the DANGER is: the
// hub samples the danger field around it, finds the most hostile pocket inside
// a tier's range band, and writes a proof-of-kill contract for the hunters that
// haunt it. Same "ask the world what exists, then author around the answer"
// pattern as surveyContracts.js - this is the second procedural job archetype.
const BOUNTY_RADIUS = 7000;
// Pockets calmer than this stay survey work. Tuned against worldZones danger
// values: starter space sits ~0.04-0.18, hunter zones ~0.55+.
const BOUNTY_DANGER_THRESHOLD = 0.42;
const HOTSPOT_SAMPLES = 28;

// Keyed by the survey tier id so a board brief can be swapped 1:1 for a bounty
// in the same range band. Kills and pay climb with range the way survey haul
// and pay do.
const BOUNTY_TIERS = {
  quick: { minDistance: 0, maxDistance: 2600, kills: 2, rewardPerKill: 110, risk: "Low risk. Hostiles reported close to the hub." },
  standard: { minDistance: 1800, maxDistance: 5000, kills: 3, rewardPerKill: 160, risk: "Moderate range. Active hunter ground." },
  long: { minDistance: 4200, maxDistance: Infinity, kills: 5, rewardPerKill: 230, risk: "Long range. Dense predator territory, high pay." },
};

// Each qualifying tier has this chance to run a bounty instead of a survey, so a
// board stays mostly resource work with combat as the spice, not the staple.
const BOUNTY_TIER_CHANCE = 0.4;

const COMPASS_LABELS = ["east", "northeast", "north", "northwest", "west", "southwest", "south", "southeast"];

let bountyCounter = 0;

// Swap qualifying survey briefs for bounties in place. For each survey job whose
// tier rolls in AND has a real danger pocket in its range band, replace it with
// a bounty for the same hub. Returns a new array; survey jobs pass through
// untouched, so the board is still mostly ore work.
export function injectBountyJobs({ site, issuer, jobs, random = Math.random }) {
  return jobs.map((job) => {
    const tier = BOUNTY_TIERS[job.jobTier];

    if (!tier || random() > BOUNTY_TIER_CHANCE) {
      return job;
    }

    const bounty = generateBountyJobForTier({ site, issuer, tierId: job.jobTier, tierLabel: job.jobTierLabel, random });
    return bounty ?? job;
  });
}

function generateBountyJobForTier({ site, issuer, tierId, tierLabel, random }) {
  const tier = BOUNTY_TIERS[tierId];
  const origin = site.position;
  const hotspot = findDangerHotspot(origin, tier, random);

  if (!hotspot) {
    return null;
  }

  const kills = tier.kills;
  // A hotter pocket pays better - scaled off how far past the qualifying
  // threshold the sampled danger sits, capped so long hauls stay the top rate.
  const dangerMultiplier = clamp(1 + (hotspot.danger - BOUNTY_DANGER_THRESHOLD) * 0.8, 1, 1.6);
  const rewardPerKill = Math.round((tier.rewardPerKill * dangerMultiplier) / 5) * 5;
  const bearing = getCompassLabel(hotspot.position.x - origin.x, hotspot.position.y - origin.y);
  const distance = Math.hypot(hotspot.position.x - origin.x, hotspot.position.y - origin.y);
  const rangeLabel = getRangeLabel(distance);
  const context = getBountyWorldContext(hotspot);

  bountyCounter += 1;

  return {
    id: `bounty-${site.id}-${tierId}-${Date.now().toString(36)}-${bountyCounter}`,
    type: "bounty",
    group: "hub-bounty-run",
    jobKind: "bounty",
    repeatable: false,
    jobTier: tierId,
    jobTierLabel: tierLabel ?? "Bounty",
    title: `${tierLabel ? `${tierLabel}: ` : ""}Culling Contract`,
    issuer: issuer ?? "Rook",
    summary: `Clear ${kills} hunters for ${site.name}. ${context.reportLabel} logs a hunter pack ${rangeLabel} to the ${bearing}. ${tier.risk}`,
    terms: {
      targetType: "hunter",
      targetName: "hunters",
      amount: kills,
      destinationSiteId: site.id,
      destinationName: site.name,
      hotspotBearing: bearing,
      hotspotRange: rangeLabel,
      sourceZoneId: context.zoneId,
      sourceRegionId: context.regionId,
      sourceWorldTags: context.tags,
    },
    reward: { creditsPerUnit: rewardPerKill, credits: kills * rewardPerKill },
    clauses: [
      `Terms are satisfied when ${kills} hunters are destroyed by the contracted pilot.`,
      "Only kills you land yourself count - weapon fire or ramming. Environmental, patrol, and hub-defense kills do not.",
      context.clause,
      `Survey flags the pack roughly ${bearing} of the hub, ${rangeLabel}.`,
      "Payment releases when the completed contract is confirmed.",
      "Return to the issuing hub for a fresh board once this bounty pays out.",
    ],
  };
}

// Sample the danger field at random points inside the tier's range band and
// keep the most hostile one that clears the threshold. Random sampling (not a
// fixed grid) keeps successive boards from always flagging the same pocket.
function findDangerHotspot(origin, tier, random) {
  const maxRadius = Math.min(tier.maxDistance, BOUNTY_RADIUS);
  const minRadius = Math.min(tier.minDistance, maxRadius - 1);
  let best = null;

  for (let sample = 0; sample < HOTSPOT_SAMPLES; sample += 1) {
    const angle = random() * Math.PI * 2;
    const radius = minRadius + random() * (maxRadius - minRadius);
    const x = origin.x + Math.cos(angle) * radius;
    const y = origin.y + Math.sin(angle) * radius;
    const zone = getZoneProfile(x, y);
    const score = dangerScore(zone);

    if (score >= BOUNTY_DANGER_THRESHOLD && (!best || score > best.danger)) {
      best = { position: { x, y }, danger: score, zone };
    }
  }

  return best;
}

function dangerScore(zone) {
  const tagBonus = zone.tags?.includes("hunters") || zone.tags?.includes("dangerous") ? 0.18 : 0;
  return (zone.danger ?? 0) + (zone.hunterBias ?? 0) * 0.12 + tagBonus;
}

// Bounties read the same blended zone and region tags generation uses, then turn
// those facts into a briefing line - no separate danger taxonomy invented here.
function getBountyWorldContext(hotspot) {
  const zone = hotspot.zone;
  const region = getRegionProfile(hotspot.position.x, hotspot.position.y);
  const tags = [...new Set([...(zone.tags ?? []), ...(region.tags ?? [])])];
  const notes = [];

  if (tags.includes("hunters")) {
    notes.push("Local traffic reports repeated hunter attacks in the pocket.");
  }
  if (tags.includes("dangerous")) {
    notes.push("The route carries an elevated hostile-contact rating.");
  }
  if (tags.includes("frontier")) {
    notes.push("Frontier distance and limited support are reflected in the rate.");
  }

  const zoneName = zone.strongestZoneName ?? "Local survey";

  return {
    zoneId: zone.strongestZoneId,
    regionId: region.strongestRegionId,
    tags,
    reportLabel: zoneName,
    clause: notes.join(" ") || `Hostile activity logged near ${zoneName}.`,
  };
}

// Screen coordinates: north is -y.
function getCompassLabel(dx, dy) {
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const index = Math.round(((angle + 360) % 360) / 45) % 8;
  return COMPASS_LABELS[index];
}

function getRangeLabel(distance) {
  if (distance < 2500) return "close by";
  if (distance < 5000) return "a medium run out";
  return "a long haul out";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
