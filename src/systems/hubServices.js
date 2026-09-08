import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260908-1855-2f42a441";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
