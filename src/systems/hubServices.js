import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260910-1801-b84b485f";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
