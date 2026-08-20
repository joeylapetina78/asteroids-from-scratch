import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260820-1824-9ef5720";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
