import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260801-1108-165333d";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
