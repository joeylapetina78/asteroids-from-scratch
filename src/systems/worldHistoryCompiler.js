import { FRONTIER_FREIGHT_CORRIDOR } from "../content/transportation/corridorArchetypes.js?v=fresh-20260906-1906-06d4afdc";
import { createRandom, hashNumbers } from "./random.js?v=fresh-20260906-1906-06d4afdc";
import { createProceduralSettlementSeed, registerGeneratedSettlement } from "./settlementSeedPipeline.js?v=fresh-20260906-1906-06d4afdc";
import { createValueNoise } from "./valueNoise.js?v=fresh-20260906-1906-06d4afdc";
import { getChunkTerrainProfile } from "./worldTerrain.js?v=fresh-20260906-1906-06d4afdc";
import { sampleEnvironment } from "./worldHazards.js?v=fresh-20260906-1906-06d4afdc";
import {
  ensureWorldNetwork, registerTradeCommunity, registerWorldConnection,
} from "./worldNetworkRegistry.js?v=fresh-20260906-1906-06d4afdc";

const YEAR = 365 * 24 * 60 * 60 * 1000;
const CLUSTER_ID = "ashfall-compact";
const CHRONICLE_ID = "chronicle:ashfall-founding";
const SPONSOR_SITE_ID = "ore-station-one";
const RESOURCE_OPPORTUNITIES = Object.freeze([
  { resourceId: "iron-nickel", resourceName: "Iron Nickel", family: "structural", noise: createValueNoise(91117) },
  { resourceId: "water-ice", resourceName: "Water Ice", family: "volatile", noise: createValueNoise(42737) },
  { resourceId: "silicate", resourceName: "Silicate", family: "industrial", noise: createValueNoise(68371) },
]);

// Compile one old, causally developed neighboring community. This is the same
// pipeline live expansion will use later; the difference is only that these
// decisions are replayed before the first playable instant.
export function compileOldUniverseHistory(state, { seed = 77431 } = {}) {
  const history = ensureWorldHistory(state);
  if (history.chronicles[CHRONICLE_ID]) return history.chronicles[CHRONICLE_ID];
  const sponsor = ensureWorldNetwork(state).sites[SPONSOR_SITE_ID];
  if (!sponsor) throw new Error(`Historical compiler requires ${SPONSOR_SITE_ID}`);

  const survey = surveyExpansionRegion({ origin: sponsor.position, seed });
  const landing = survey[0];
  const sites = RESOURCE_OPPORTUNITIES.map((resource, index) => {
    const candidates = index === 0 ? [landing] : surveyLocality(landing.position, seed + index * 1031);
    const candidate = [...candidates].sort((a, b) => b.resources[resource.family] - a.resources[resource.family] || b.score - a.score)[0];
    return { ...candidate, resource, index, success: historicalSuccess(candidate, resource.family, seed + index) };
  });
  const capital = [...sites].sort((a, b) => b.success - a.success)[0];
  const names = historicalNames(seed);
  const times = {
    surveyed: -46 * YEAR, expedition: -43 * YEAR, landing: -41 * YEAR,
    satellites: -34 * YEAR, chartered: -27 * YEAR, capital: -18 * YEAR,
  };

  registerTradeCommunity(state, {
    id: CLUSTER_ID, name: "Ashfall Compact", siteIds: [],
    provenance: { kind: "historic-colony-cluster", foundedBy: SPONSOR_SITE_ID, chronicleId: CHRONICLE_ID },
    history: [{ id: "history:ashfall-compact", type: "community.compact-ratified", at: times.chartered }],
  });

  const chronicle = history.chronicles[CHRONICLE_ID] = {
    id: CHRONICLE_ID, seed, name: "The Ashfall Founding", status: "established",
    sponsorInstitutionId: SPONSOR_SITE_ID, motive: "balanced frontier resources and a survivable local trade circuit",
    communityId: CLUSTER_ID, discoveryId: "survey:ashfall-basin", projectId: "expedition:ashfall",
    evidence: { surveyedCandidates: survey.length, selectedScore: landing.score, selectedTerrain: landing.terrainId, selectedHazard: landing.hazardId },
    siteIds: [], connectionIds: [], eventIds: [],
  };

  appendHistoricalEvent(state, chronicle, "survey.departed", times.surveyed, {
    actorInstitutionId: SPONSOR_SITE_ID, candidateCount: survey.length,
  });
  appendHistoricalEvent(state, chronicle, "site.opportunity-discovered", times.surveyed + YEAR, {
    discoveryId: chronicle.discoveryId, position: { ...landing.position },
    score: landing.score, terrainId: landing.terrainId, hazardId: landing.hazardId,
  });
  appendHistoricalEvent(state, chronicle, "expedition.approved", times.expedition, {
    actorInstitutionId: SPONSOR_SITE_ID, projectId: chronicle.projectId,
  });

  const compiledSites = sites.map((site, index) => {
    const id = slug(names[index]);
    const isLanding = index === 0;
    const isCapital = site === capital;
    const foundedAt = isLanding ? times.landing : times.satellites + index * YEAR;
    const siteHistory = [
      { id: `history:${id}:surveyed`, type: "site.surveyed", at: times.surveyed + YEAR, discoveryId: chronicle.discoveryId },
      { id: `history:${id}:founded`, type: isLanding ? "outpost.founded" : "settlement.founded", at: foundedAt, projectId: chronicle.projectId },
      { id: `history:${id}:chartered`, type: "settlement.chartered", at: times.chartered + index * YEAR },
    ];
    if (isCapital) siteHistory.push({ id: `history:${id}:capital`, type: "community.capital-designated", at: times.capital });
    const populationSize = Math.round(55 + site.success * 115 + (isCapital ? 45 : 0));
    const compiled = registerGeneratedSettlement(state, createProceduralSettlementSeed({
      id, name: names[index], position: site.position, populationSize,
      resourceId: site.resource.resourceId, resourceName: site.resource.resourceName,
      resourceFamily: site.resource.family, openingResourceUnits: 8 + Math.round(site.success * 10),
      openingBalance: 24000 + Math.round(site.success * 32000),
      tradeCommunityId: CLUSTER_ID, tier: isCapital ? "capital" : "settlement",
      developmentStage: isCapital ? "regional-capital" : "mature-settlement",
      foundedAt, parentSiteId: isLanding ? SPONSOR_SITE_ID : slug(names[0]),
      capabilities: isCapital ? ["trade", "repair"] : ["trade"],
      foundedBy: SPONSOR_SITE_ID,
      foundingReason: `surveyed ${site.resource.resourceName.toLowerCase()} opportunity within a balanced locality`,
      discoveryId: chronicle.discoveryId, projectId: chronicle.projectId, history: siteHistory,
      organizationProfile: {
        organizationType: isCapital ? "expedition-successor-commonwealth" : "chartered-frontier-settlement",
        governance: isCapital ? "compact council" : "resident works assembly",
        mandate: `Keep ${names[index]} viable through local production and compact trade.`,
        values: ["continuity", "local sufficiency", "survey evidence"],
      },
    }), { now: 0 });
    chronicle.siteIds.push(compiled.institution.siteId);
    appendHistoricalEvent(state, chronicle, isLanding ? "outpost.founded" : "settlement.founded", foundedAt, {
      siteId: compiled.institution.siteId, resourceId: site.resource.resourceId,
    });
    return compiled;
  });

  const landingId = compiledSites[0].institution.siteId;
  registerHistoricalRoad(state, chronicle, {
    id: "corridor:ore-ashfall", name: "Ashfall Expedition Road",
    fromId: SPONSOR_SITE_ID, toId: landingId, at: times.landing - YEAR,
    kind: "founding-trunk", seed: seed + 41,
  });
  compiledSites.slice(1).forEach((settlement, index) => registerHistoricalRoad(state, chronicle, {
    id: `corridor:ashfall-${index + 2}`, name: `${names[0]}–${settlement.institution.name} Road`,
    fromId: landingId, toId: settlement.institution.siteId, at: times.satellites + index * YEAR - YEAR,
    kind: "compact-road", seed: seed + 83 + index,
  }));
  appendHistoricalEvent(state, chronicle, "community.capital-designated", times.capital, {
    siteId: compiledSites.find((site) => site.geography.tier === "capital").institution.siteId,
  });
  compiledSites.forEach((settlement, index) => appendHistoricalEvent(state, chronicle, "capacity.extraction-commissioned", times.chartered + index * YEAR + YEAR, {
    siteId: settlement.institution.siteId,
    operatorInstitutionId: `miner:${settlement.institution.siteId}-municipal-works`,
    sponsorInstitutionId: settlement.institution.id,
    resourceId: settlement.extraction.resourceId,
  }));
  const eventOrder = new Map(history.events.map((event, index) => [event.id, index]));
  chronicle.eventIds.sort((a, b) => eventOrder.get(a) - eventOrder.get(b));
  return chronicle;
}

// Materialize the extraction companies the historical chronicle says these
// mature settlements commissioned. They are ordinary mining-operation seeds:
// the history explains why they exist at the playable instant, while the live
// market still decides what their crews actually do from then on.
export function getHistoricalMiningSeeds(state) {
  const chronicle = compileOldUniverseHistory(state);
  return chronicle.siteIds.map((siteId, index) => {
    const settlement = state.settlements.generated[siteId];
    const operatorId = `miner:${siteId}-municipal-works`;
    const controllerId = `person:${siteId}-works-superintendent`;
    return {
      stateKey: `${siteId}-municipal-works`,
      institution: {
        id: operatorId, name: `${settlement.institution.name} Municipal Works`,
        archetypeId: "mining-contractor", controllerInstitutionId: controllerId,
        sponsoredByInstitutionId: settlement.institution.id, homeSiteId: siteId,
        serviceCharter: { sponsorInstitutionId: settlement.institution.id, homeSiteId: siteId, duty: "local-extraction" },
        accounts: { operating: { id: `HIST-MIN-${index + 1}`, balance: 4200, committed: 0, transactions: [] } },
      },
      controller: {
        id: controllerId, name: `${settlement.institution.name} Works Superintendent`, archetypeId: "person",
        controls: [operatorId], traits: { ...settlement.controller.traits },
        license: { id: `MEX-${siteId.toUpperCase()}`, class: "commercial-extraction", status: "active" },
      },
      fleetPrefix: `${siteId}-works`, fleetName: `${settlement.institution.name} Works`,
      shipPalette: historicalMiningPalette(index), homeSiteId: siteId,
      operatingCosts: { crewPayPerContract: 70, consumablesPerContract: 30 },
      workers: [{
        id: `worker:${siteId}-works-one`, name: `${settlement.institution.name} Works One`,
        referenceId: `MW-${String(index + 1).padStart(3, "0")}-ASH`, currentSiteId: siteId,
        initialWear: 0.18 + index * 0.07, offset: { x: -80 + index * 75, y: 65 - index * 55 },
      }],
      expansionWorker: null, expansionProject: null,
    };
  });
}

function historicalMiningPalette(index) {
  return [
    { hullStroke: "#e5b56d", hullFill: "rgba(213, 155, 74, 0.18)", cabStroke: "#fff0c4", tractorStroke: "rgba(255, 211, 126, 0.44)" },
    { hullStroke: "#91cbe8", hullFill: "rgba(92, 177, 218, 0.18)", cabStroke: "#e5f7ff", tractorStroke: "rgba(126, 231, 255, 0.44)" },
    { hullStroke: "#d59adf", hullFill: "rgba(189, 113, 204, 0.18)", cabStroke: "#fae5ff", tractorStroke: "rgba(226, 151, 255, 0.44)" },
  ][index % 3];
}

export function surveyExpansionRegion({ origin, seed = 77431, candidateCount = 72 } = {}) {
  const random = createRandom(seed);
  return Array.from({ length: candidateCount }, (_, index) => {
    const angle = random() * Math.PI * 2;
    const distance = 26000 + random() * 34000;
    return evaluateCandidate({
      x: origin.x + Math.cos(angle) * distance,
      y: origin.y + Math.sin(angle) * distance,
    }, seed + index);
  }).sort((a, b) => b.score - a.score);
}

function surveyLocality(center, seed) {
  const random = createRandom(seed);
  return Array.from({ length: 28 }, (_, index) => {
    const angle = random() * Math.PI * 2;
    const distance = 4200 + random() * 7200;
    return evaluateCandidate({ x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance }, seed + index);
  });
}

function evaluateCandidate(position, salt) {
  const terrain = getChunkTerrainProfile(position.x, position.y);
  const hazard = sampleEnvironment(position.x, position.y);
  const resources = Object.fromEntries(RESOURCE_OPPORTUNITIES.map((resource, index) => [
    resource.family,
    resource.noise(position.x + salt * (index + 1), position.y - salt * (index + 2), 7600),
  ]));
  const values = Object.values(resources).sort((a, b) => b - a);
  const balance = Math.min(...values);
  const safety = hazard?.field?.harmful ? 1 - hazard.intensity : 1;
  const access = Math.max(0, 1 - Math.abs((terrain.densityMultiplier ?? 1) - 1) * 0.35);
  const score = balance * 0.38 + values[0] * 0.27 + (terrain.resourceMultiplier ?? 1) * 0.12 + safety * 0.15 + access * 0.08;
  return {
    position: { x: Math.round(position.x), y: Math.round(position.y) }, resources,
    score: Number(score.toFixed(5)), terrainId: terrain.id,
    hazardId: hazard?.field?.id ?? null, safety: Number(safety.toFixed(4)),
  };
}

function historicalSuccess(site, family, seed) {
  const fortune = (hashNumbers(seed, Math.round(site.position.x), Math.round(site.position.y)) >>> 0) / 4294967295;
  return Math.max(0.1, Math.min(1, site.resources[family] * 0.6 + site.safety * 0.2 + fortune * 0.2));
}

function registerHistoricalRoad(state, chronicle, spec) {
  const connection = registerWorldConnection(state, {
    id: spec.id, name: spec.name, fromId: spec.fromId, toId: spec.toId, bidirectional: true,
    corridor: { ...FRONTIER_FREIGHT_CORRIDOR, id: spec.id, name: spec.name, seed: spec.seed },
  }, {
    provenance: { kind: spec.kind, foundedBy: SPONSOR_SITE_ID, chronicleId: CHRONICLE_ID, projectId: chronicle.projectId },
    history: [{ id: `history:${spec.id}:opened`, type: "route.opened", at: spec.at }],
  });
  chronicle.connectionIds.push(connection.id);
  appendHistoricalEvent(state, chronicle, "route.opened", spec.at, { connectionId: connection.id, fromId: spec.fromId, toId: spec.toId });
}

function ensureWorldHistory(state) {
  state.worldHistory ??= { version: 1, chronicles: {}, events: [], counters: { event: 0 } };
  state.worldHistory.chronicles ??= {};
  state.worldHistory.events ??= [];
  state.worldHistory.counters ??= { event: 0 };
  return state.worldHistory;
}

function appendHistoricalEvent(state, chronicle, type, at, payload) {
  const history = ensureWorldHistory(state);
  const id = `world-history:${++history.counters.event}`;
  history.events.push({ id, chronicleId: chronicle.id, type, at, ...structuredClone(payload) });
  history.events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  chronicle.eventIds.push(id);
  return id;
}

function historicalNames(seed) {
  const first = ["Ashfall", "Cinder", "Far Ember", "Glasswake", "Rimeward"];
  const second = ["Hearth", "Crossing", "Rest", "Basin", "Moor"];
  const random = createRandom(seed ^ 0x9e3779b9);
  const names = [];
  while (names.length < 3) {
    const name = `${first[Math.floor(random() * first.length)]} ${second[Math.floor(random() * second.length)]}`;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
