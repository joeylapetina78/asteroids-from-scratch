import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260719-2051-2f47cca";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
