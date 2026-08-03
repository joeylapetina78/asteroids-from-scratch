import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260802-1917-b5c9143";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
