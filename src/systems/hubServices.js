import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260810-2024-1d54855";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
