import { getRegionProfile } from "./worldRegions.js?v=fresh-20260721-2114-33b9943";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260721-2114-33b9943";

// Cargo runs are the courier archetype: instead of mining ore (survey) or
// culling hunters (bounty), a hub hands you a sealed manifest bound for another
// REAL hub and pays for the delivery. "Reads the world" two ways - it only
// routes to hubs that actually exist, and it names the manifest after what the
// source region actually produces. Distance-scaled pay makes the long frontier
// hauls the ones worth chasing. Third procedural job archetype; see
// surveyContracts.js and bountyContracts.js for the siblings.

// Bands are keyed by survey tier id so a board brief swaps 1:1, but the numbers
// are hub-to-hub distances (hubs sit thousands to tens-of-thousands of units
// apart, unlike the ore-cluster ranges survey uses).
const CARGO_TIERS = {
  quick: { minDistance: 0, maxDistance: 6000, base: 120, perK: 14, risk: "Short hop between neighbouring hubs." },
  standard: { minDistance: 6000, maxDistance: 30000, base: 260, perK: 8, risk: "Cross-region haul. Routine freight." },
  long: { minDistance: 30000, maxDistance: Infinity, base: 520, perK: 6, risk: "Deep frontier haul. Long time exposed, top pay." },
};

// Each still-survey tier has this chance to become a cargo run when a hub sits
// in its band. Runs after bounty injection and only touches tiers bounty left
// alone, so a board stays mostly ore work with combat and freight as spice.
const CARGO_TIER_CHANCE = 0.35;

// Manifest flavour keyed by the tags generation already stamps on the source's
// zone/region. First matching pool wins; a source can read as more than one, so
// order is rough priority. Amounts are a cosmetic manifest size, not cargo-hold
// units - the run is a sealed delivery, not a mining job.
const COMMODITY_BY_TAG = [
  ["scrap", ["reclaimed scrap", "salvaged components"]],
  ["metallic", ["refined alloy", "machine parts", "structural plate"]],
  ["volatile", ["fuel canisters", "sealed volatiles"]],
  ["fuel-rich", ["fuel canisters", "reactant drums"]],
  ["scanergy-rich", ["sensor cells", "charge cells"]],
  ["ambient-life", ["hydroponic stock", "biological samples"]],
  ["prospecting", ["survey equipment", "bonded ore samples"]],
];
const DEFAULT_COMMODITIES = ["general supplies", "bonded freight", "station parts"];

const COMPASS_LABELS = ["east", "northeast", "north", "northwest", "west", "southwest", "south", "southeast"];

let cargoCounter = 0;

// Swap qualifying survey briefs for cargo runs in place. Only touches jobs still
// typed resource-delivery so it never clobbers a bounty the previous pass made.
export function injectCargoRuns({ site, issuer, jobs, sites, random = Math.random }) {
  return jobs.map((job) => {
    if (job.type !== "resource-delivery") {
      return job;
    }

    const tier = CARGO_TIERS[job.jobTier];

    if (!tier || random() > CARGO_TIER_CHANCE) {
      return job;
    }

    const run = generateCargoRunForTier({ site, issuer, tierId: job.jobTier, tierLabel: job.jobTierLabel, sites, random });
    return run ?? job;
  });
}

function generateCargoRunForTier({ site, issuer, tierId, tierLabel, sites, random }) {
  const tier = CARGO_TIERS[tierId];
  const destination = pickDestinationHub(site, sites, tier, random);

  if (!destination) {
    return null;
  }

  const distance = Math.hypot(destination.position.x - site.position.x, destination.position.y - site.position.y);
  const pay = Math.round((tier.base + (distance / 1000) * tier.perK) / 5) * 5;
  const bearing = getCompassLabel(destination.position.x - site.position.x, destination.position.y - site.position.y);
  const rangeLabel = getRangeLabel(distance);
  const amount = 6 + Math.floor(random() * 15); // 6-20 unit manifest, cosmetic
  const commodity = pickCommodity(site.position, random);
  const context = getCargoWorldContext(site.position);

  cargoCounter += 1;

  return {
    id: `cargo-${site.id}-${tierId}-${destination.id}-${Date.now().toString(36)}-${cargoCounter}`,
    type: "cargo-run",
    group: "hub-cargo-run",
    jobKind: "freight",
    repeatable: false,
    jobTier: tierId,
    jobTierLabel: tierLabel ?? "Cargo Run",
    title: `${tierLabel ? `${tierLabel}: ` : ""}Freight to ${destination.name}`,
    issuer: issuer ?? "Rook",
    summary: `Carry ${amount} ${commodity} from ${site.name} to ${destination.name}, ${rangeLabel} to the ${bearing}. ${tier.risk}`,
    terms: {
      commodity,
      commodityName: commodity,
      amount,
      originSiteId: site.id,
      originName: site.name,
      destinationSiteId: destination.id,
      destinationName: destination.name,
      destinationBearing: bearing,
      destinationRange: rangeLabel,
      // Delivery is a manual unload at the destination (see main.js) - the hub
      // hands you the sealed container here, you carry it, and you unload it
      // there. No auto-fulfill on docking, so no `requires` rule.
      sourceZoneId: context.zoneId,
      sourceRegionId: context.regionId,
      sourceWorldTags: context.tags,
    },
    reward: { credits: pay },
    clauses: [
      `Load the sealed manifest here at ${site.name}, then unload it at ${destination.name} to complete the run.`,
      "The manifest is sealed freight - it rides in your cargo hold and can't be sold or refined.",
      `Destination bearing: ${bearing} of ${site.name}, ${rangeLabel}.`,
      "Payment releases when the completed contract is confirmed at the destination.",
      "Return to any work board for the next run once this one pays out.",
    ],
  };
}

// Pick a real hub (never the issuing one) whose distance sits in the tier's
// band. Nearer hubs inside the band are weighted a little heavier so quick runs
// feel local, but any qualifying hub can come up.
function pickDestinationHub(site, sites, tier, random) {
  const candidates = (sites ?? [])
    .filter((candidate) => candidate.id !== site.id && candidate.position)
    .map((candidate) => ({
      candidate,
      distance: Math.hypot(candidate.position.x - site.position.x, candidate.position.y - site.position.y),
    }))
    .filter(({ distance }) => distance >= tier.minDistance && distance < tier.maxDistance);

  if (candidates.length === 0) {
    return null;
  }

  const weighted = candidates.map(({ candidate, distance }) => ({ candidate, weight: 1 / (1 + distance / 4000) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;

  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.candidate;
    }
  }

  return weighted[weighted.length - 1].candidate;
}

function pickCommodity(position, random) {
  const zone = getZoneProfile(position.x, position.y);
  const region = getRegionProfile(position.x, position.y);
  const tags = new Set([...(zone.tags ?? []), ...(region.tags ?? [])]);
  const pool = [];

  for (const [tag, commodities] of COMMODITY_BY_TAG) {
    if (tags.has(tag)) {
      pool.push(...commodities);
    }
  }

  const options = pool.length > 0 ? pool : DEFAULT_COMMODITIES;
  return options[Math.floor(random() * options.length)];
}

function getCargoWorldContext(position) {
  const zone = getZoneProfile(position.x, position.y);
  const region = getRegionProfile(position.x, position.y);

  return {
    zoneId: zone.strongestZoneId,
    regionId: region.strongestRegionId,
    tags: [...new Set([...(zone.tags ?? []), ...(region.tags ?? [])])],
  };
}

// Screen coordinates: north is -y.
function getCompassLabel(dx, dy) {
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const index = Math.round(((angle + 360) % 360) / 45) % 8;
  return COMPASS_LABELS[index];
}

function getRangeLabel(distance) {
  if (distance < 6000) return "a short hop";
  if (distance < 30000) return "a cross-region run";
  return "a long frontier haul";
}
