import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260805-2142-0b6dcbe";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
