import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260918-1918-133a739f";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
