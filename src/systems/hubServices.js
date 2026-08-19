import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260819-0621-e0ba4c1";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
