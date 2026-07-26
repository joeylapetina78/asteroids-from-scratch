import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260726-1222-8d854b3";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
