import { getOreClusterSeedsInRadius } from "./asteroidField.js?v=fresh-20260719-2129-6f18a9a";
import { getResourceDefinition, getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260719-2129-6f18a9a";
import { getRegionProfile } from "./worldRegions.js?v=fresh-20260719-2129-6f18a9a";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260719-2129-6f18a9a";

// Survey contracts are the contract-reads-world layer: instead of authored
// resource runs naming a fixed ore and place, the issuing hub surveys the ore
// clusters that actually exist around it (the same seeds chunk generation
// uses) and writes a contract for one of them - amount and pay scaled to the
// material's value, with an honest bearing hint. This is the pattern missions
// should eventually follow too: ask the world what exists, then author around
// the answer.
const SURVEY_RADIUS = 7000;
// Cheap ore means a big haul, rare ore a short shopping list - target value
// over unit value, clamped to the authored contracts' 3-20 unit scale.
const SURVEY_TARGET_HAUL_VALUE = 400;
const SURVEY_MIN_AMOUNT = 3;
const SURVEY_MAX_AMOUNT = 20;

const SURVEY_JOB_TIERS = [
  { id: "quick", label: "Quick Run", minDistance: 0, maxDistance: 2600, targetHaulValue: 240, rewardMultiplier: 0.85, risk: "Low risk. Nearby concentration." },
  { id: "standard", label: "Working Run", minDistance: 1800, maxDistance: 5000, targetHaulValue: 520, rewardMultiplier: 1.15, risk: "Moderate distance. Routine field work." },
  { id: "long", label: "Long Haul", minDistance: 4200, maxDistance: Infinity, targetHaulValue: 820, rewardMultiplier: 1.55, risk: "Long range. Higher pay and more time exposed." },
];

const COMPASS_LABELS = ["east", "northeast", "north", "northwest", "west", "southwest", "south", "southeast"];

let surveyCounter = 0;

export function generateSurveyContractDefinition({ site, issuer, resourceField, chunkSize, random = Math.random }) {
  const origin = site.position;
  const seeds = getOreClusterSeedsInRadius(origin.x, origin.y, SURVEY_RADIUS, chunkSize, resourceField);

  if (seeds.length === 0) {
    return null;
  }

  const tallies = tallySeedsByResource(seeds, origin);
  const picked = pickSurveyResource(tallies, random);

  if (!picked) {
    return null;
  }

  const definition = getResourceDefinition(picked.resourceId);
  const value = Math.max(10, definition?.value ?? 10);
  const amount = clamp(Math.round(SURVEY_TARGET_HAUL_VALUE / value), SURVEY_MIN_AMOUNT, SURVEY_MAX_AMOUNT);
  const creditsPerUnit = Math.round((100 + value * 4) / 5) * 5;
  const resourceName = formatResourceName(picked.resourceId);
  const bearing = getCompassLabel(picked.nearest.x - origin.x, picked.nearest.y - origin.y);
  const rangeLabel = getRangeLabel(picked.nearestDistance);
  const context = getSurveyWorldContext(picked.nearest);
  const contextualCreditsPerUnit = Math.round((creditsPerUnit * context.payMultiplier) / 5) * 5;

  surveyCounter += 1;

  return {
    id: `survey-${site.id}-${picked.resourceId}-${Date.now().toString(36)}-${surveyCounter}`,
    type: "resource-delivery",
    group: "hub-survey-run",
    repeatable: false,
    title: `${context.titlePrefix}Field Survey: ${toTitleCase(resourceName)}`,
    issuer: issuer ?? "Rook",
    summary: `Deliver ${amount} ${resourceName} to ${site.name}. Survey flags ${withArticle(resourceName)} concentration ${rangeLabel} to the ${bearing}. ${context.summary}`,
    terms: {
      resourceType: picked.resourceId,
      resourceName,
      amount,
      destinationSiteId: site.id,
      destinationName: site.name,
      sourceClaimIds: [],
      sourceClaimLabel: null,
      sourceZoneId: context.zoneId,
      sourceRegionId: context.regionId,
      sourceWorldTags: context.tags,
    },
    reward: {
      creditsPerUnit: contextualCreditsPerUnit,
      credits: amount * contextualCreditsPerUnit,
    },
    clauses: [
      `Terms are satisfied when ${amount} units of ${resourceName} are delivered from cargo at ${site.name}.`,
      "Payment releases when the completed contract is confirmed.",
      context.clause,
      "Resources must be in the cargo hold, not loose in space.",
      `Survey data is current as of this offer - the concentration sits roughly ${bearing} of the hub, ${rangeLabel}.`,
      "Return for a fresh survey once this job pays out.",
    ],
  };
}

// A board is three briefs, not three unsolicited files. A brief turns into an
// offer only when the pilot chooses it, keeping the contract drawer truthful.
export function generateSurveyJobBoardDefinitions({ site, issuer, resourceField, chunkSize, random = Math.random }) {
  const origin = site.position;
  const allSeeds = getOreClusterSeedsInRadius(origin.x, origin.y, SURVEY_RADIUS, chunkSize, resourceField);
  const usedResourceIds = new Set();

  return SURVEY_JOB_TIERS.map((tier) => {
    const tierSeeds = allSeeds.filter((seed) => {
      const distance = Math.hypot(seed.x - origin.x, seed.y - origin.y);
      return distance >= tier.minDistance && distance < tier.maxDistance;
    });
    const tallies = tallySeedsByResource(tierSeeds.length > 0 ? tierSeeds : allSeeds, origin);
    const unusedTallies = tallies.filter((tally) => !usedResourceIds.has(tally.resourceId));
    const picked = pickSurveyResource(unusedTallies.length > 0 ? unusedTallies : tallies, random);

    if (!picked) return null;

    usedResourceIds.add(picked.resourceId);
    return createSurveyJobDefinition({ site, issuer, picked, tier });
  }).filter(Boolean);
}

function createSurveyJobDefinition({ site, issuer, picked, tier }) {
  const definition = getResourceDefinition(picked.resourceId);
  const value = Math.max(10, definition?.value ?? 10);
  const amount = clamp(Math.round(tier.targetHaulValue / value), SURVEY_MIN_AMOUNT, SURVEY_MAX_AMOUNT);
  const creditsPerUnit = Math.round((100 + value * 4) / 5) * 5;
  const resourceName = formatResourceName(picked.resourceId);
  const bearing = getCompassLabel(picked.nearest.x - site.position.x, picked.nearest.y - site.position.y);
  const rangeLabel = getRangeLabel(picked.nearestDistance);
  const context = getSurveyWorldContext(picked.nearest);
  const payoutPerUnit = Math.round((creditsPerUnit * context.payMultiplier * tier.rewardMultiplier) / 5) * 5;

  surveyCounter += 1;

  return {
    id: `survey-${site.id}-${tier.id}-${picked.resourceId}-${Date.now().toString(36)}-${surveyCounter}`,
    type: "resource-delivery",
    group: "hub-survey-run",
    repeatable: false,
    jobTier: tier.id,
    jobTierLabel: tier.label,
    title: `${tier.label}: ${context.titlePrefix}${toTitleCase(resourceName)}`,
    issuer: issuer ?? "Rook",
    summary: `Deliver ${amount} ${resourceName} to ${site.name}. Survey flags ${withArticle(resourceName)} concentration ${rangeLabel} to the ${bearing}. ${tier.risk}`,
    terms: {
      resourceType: picked.resourceId,
      resourceName,
      amount,
      destinationSiteId: site.id,
      destinationName: site.name,
      sourceClaimIds: [],
      sourceClaimLabel: null,
      sourceZoneId: context.zoneId,
      sourceRegionId: context.regionId,
      sourceWorldTags: context.tags,
    },
    reward: { creditsPerUnit: payoutPerUnit, credits: amount * payoutPerUnit },
    clauses: [
      `Terms are satisfied when ${amount} units of ${resourceName} are delivered from cargo at ${site.name}.`,
      "Payment releases when the completed contract is confirmed.",
      context.clause,
      "Resources must be in the cargo hold, not loose in space.",
      `Survey data is current: the concentration sits roughly ${bearing} of the hub, ${rangeLabel}.`,
      "Return to Rook Industries for a fresh board once this job pays out.",
    ],
  };
}

// Survey offers do not invent a separate place taxonomy. They read the same
// blended zone and region tags used by generation, then turn those facts into
// a small, visible payout and briefing difference.
function getSurveyWorldContext(position) {
  const zone = getZoneProfile(position.x, position.y);
  const region = getRegionProfile(position.x, position.y);
  const tags = [...new Set([...zone.tags, ...region.tags])];
  let payMultiplier = 1;
  let titlePrefix = "";
  const notes = [];

  if (tags.includes("dangerous") || tags.includes("hunters")) {
    payMultiplier *= 1.25;
    titlePrefix = "Hazard ";
    notes.push("The route has an elevated hostile-contact rating.");
  }
  if (tags.includes("mining-rush")) {
    payMultiplier *= 1.1;
    notes.push("Local buyers are competing for fresh survey data.");
  }
  if (tags.includes("prospecting")) {
    payMultiplier *= 1.15;
    notes.push("This is prospecting ground; verify the concentration before it shifts.");
  }
  if (tags.includes("frontier")) {
    payMultiplier *= 1.1;
    notes.push("Frontier distance and limited support are reflected in the rate.");
  }
  if (tags.includes("rook-claims")) {
    notes.push("Rook Industries reports an active work charter in the area.");
  } else if (tags.includes("corporate-claims")) {
    notes.push("Corporate claim markings are reported near the survey site.");
  } else if (tags.includes("unclaimed")) {
    notes.push("No active claim record is attached to this survey area.");
  }

  return {
    zoneId: zone.strongestZoneId,
    regionId: region.strongestRegionId,
    tags,
    payMultiplier: clamp(payMultiplier, 1, 1.65),
    titlePrefix,
    summary: notes[0] ?? `Survey source: ${zone.strongestZoneName}, ${region.strongestRegionName}.`,
    clause: notes.join(" ") || `Survey source: ${zone.strongestZoneName}, ${region.strongestRegionName}.`,
  };
}

function tallySeedsByResource(seeds, origin) {
  const tallies = new Map();

  seeds.forEach((seed) => {
    const distance = Math.hypot(seed.x - origin.x, seed.y - origin.y);
    const tally = tallies.get(seed.resourceId) ?? { resourceId: seed.resourceId, count: 0, nearest: seed, nearestDistance: Infinity };

    tally.count += 1;
    if (distance < tally.nearestDistance) {
      tally.nearestDistance = distance;
      tally.nearest = seed;
    }
    tallies.set(seed.resourceId, tally);
  });

  return [...tallies.values()];
}

// Frequency-weighted with a value tilt: common local ore is the usual job, but
// a rare cluster nearby sometimes becomes the interesting offer.
function pickSurveyResource(tallies, random) {
  const weighted = tallies.map((tally) => ({
    tally,
    weight: tally.count * Math.sqrt(Math.max(10, getResourceDefinition(tally.resourceId)?.value ?? 10)),
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;

  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.tally;
  }

  return weighted[weighted.length - 1]?.tally ?? null;
}

function formatResourceName(resourceId) {
  const plain = resourceId.replace(/-/g, " ");
  return getResourceFamily(resourceId) === "volatile" || plain.endsWith("ore") ? plain : `${plain} ore`;
}

function toTitleCase(text) {
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function withArticle(noun) {
  return `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
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
