import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260719-0017-40e07ff";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
