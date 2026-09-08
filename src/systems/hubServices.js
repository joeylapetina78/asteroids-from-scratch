import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260908-1722-d2ce0f26";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
