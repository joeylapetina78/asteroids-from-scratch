import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260818-2212-559e0fe";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
