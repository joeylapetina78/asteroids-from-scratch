import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260716-2155-47b6461";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
