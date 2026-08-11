import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260810-1926-e4ff78f";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
