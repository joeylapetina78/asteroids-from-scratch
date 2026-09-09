import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260908-2045-17af468e";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
