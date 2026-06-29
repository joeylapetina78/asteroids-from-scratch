import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=npc-registry-v1";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
