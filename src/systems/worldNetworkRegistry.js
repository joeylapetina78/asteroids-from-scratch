import { FIRST_REACH_TRADE_COMMUNITIES, FIRST_REACH_TRANSPORT_CONNECTIONS } from "../content/transportation/firstReachNetwork.js?v=fresh-20260909-2018-af9ff726";
import { WORLD_SITES } from "./worldSites.js?v=fresh-20260909-2018-af9ff726";

// The durable physical/economic graph. Authored First Reach is merely its first
// registered history; procedural founding projects add records through the same
// boundary instead of teaching every consumer another content list.
export function createInitialWorldNetwork() {
  return {
    version: 1,
    revision: 1,
    sites: Object.fromEntries(WORLD_SITES.map((site) => [site.id, historicalSite(site)])),
    connections: Object.fromEntries(FIRST_REACH_TRANSPORT_CONNECTIONS.map((connection) => [connection.id, historicalConnection(connection)])),
    communities: Object.fromEntries(Object.entries(FIRST_REACH_TRADE_COMMUNITIES).map(([id, siteIds]) => [id, {
      id, name: titleCase(id), siteIds: [...siteIds], origin: "authored",
      provenance: { kind: "established-community", sourceId: "first-reach" }, history: [],
    }])),
  };
}

export function ensureWorldNetwork(state) {
  state.worldNetwork ??= createInitialWorldNetwork();
  state.worldNetwork.sites ??= {};
  state.worldNetwork.connections ??= {};
  state.worldNetwork.communities ??= {};
  state.worldNetwork.revision ??= 1;
  return state.worldNetwork;
}

export function registerWorldSite(state, site, { origin = "procedural", provenance = null, history = null } = {}) {
  if (!site?.id || !site.position) throw new Error("World site requires id and position");
  const world = ensureWorldNetwork(state);
  const existing = world.sites[site.id];
  world.sites[site.id] = {
    ...(existing ?? {}), ...structuredClone(site), origin: site.origin ?? existing?.origin ?? origin,
    provenance: structuredClone(site.provenance ?? provenance ?? existing?.provenance ?? null),
    history: structuredClone(site.history ?? history ?? existing?.history ?? []),
  };
  world.revision += 1;
  return world.sites[site.id];
}

export function registerWorldConnection(state, connection, { origin = "procedural", provenance = null, history = null } = {}) {
  if (!connection?.id || !connection.fromId || !connection.toId) throw new Error("World connection requires id, fromId, and toId");
  const world = ensureWorldNetwork(state);
  if (!world.sites[connection.fromId] || !world.sites[connection.toId]) throw new Error(`World connection ${connection.id} has an unregistered endpoint`);
  const from = world.sites[connection.fromId].position;
  const to = world.sites[connection.toId].position;
  world.connections[connection.id] = {
    ...structuredClone(connection), distance: connection.distance ?? Math.round(Math.hypot(to.x - from.x, to.y - from.y)),
    origin: connection.origin ?? origin,
    provenance: structuredClone(connection.provenance ?? provenance ?? null),
    history: structuredClone(connection.history ?? history ?? []),
  };
  world.revision += 1;
  return world.connections[connection.id];
}

export function registerTradeCommunity(state, community, { origin = "procedural", provenance = null, history = null } = {}) {
  if (!community?.id) throw new Error("Trade community requires id");
  const world = ensureWorldNetwork(state);
  const siteIds = [...new Set(community.siteIds ?? [])];
  siteIds.forEach((siteId) => {
    if (!world.sites[siteId]) throw new Error(`Trade community ${community.id} names unregistered site ${siteId}`);
  });
  world.communities[community.id] = {
    ...structuredClone(community), siteIds, origin: community.origin ?? origin,
    provenance: structuredClone(community.provenance ?? provenance ?? null),
    history: structuredClone(community.history ?? history ?? []),
  };
  world.revision += 1;
  return world.communities[community.id];
}

export function addSiteToTradeCommunity(state, communityId, siteId) {
  const world = ensureWorldNetwork(state);
  const community = world.communities[communityId];
  if (!community || !world.sites[siteId]) return false;
  if (!community.siteIds.includes(siteId)) {
    community.siteIds.push(siteId);
    world.revision += 1;
  }
  return true;
}

export function getRuntimeWorldSites(state) {
  return Object.values(ensureWorldNetwork(state).sites);
}

export function getRuntimeWorldConnections(state) {
  return Object.values(ensureWorldNetwork(state).connections);
}

export function getRuntimeTradeCommunities(state) {
  return Object.values(ensureWorldNetwork(state).communities);
}

export function runtimeTradeCommunityForSite(state, siteId) {
  return getRuntimeTradeCommunities(state).find((community) => community.siteIds.includes(siteId))?.id ?? null;
}

function historicalSite(site) {
  return {
    ...structuredClone(site), origin: "authored",
    provenance: { kind: "established-settlement", sourceId: "first-reach", foundedBy: null, foundingReason: "preexisting-community" },
    history: [],
  };
}

function historicalConnection(connection) {
  return {
    ...structuredClone(connection), origin: "authored",
    provenance: { kind: "established-route", sourceId: "first-reach", projectId: null },
    history: [],
  };
}

function titleCase(value) {
  return String(value).split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
