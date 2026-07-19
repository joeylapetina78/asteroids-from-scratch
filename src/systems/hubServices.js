import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260719-1259-cb7d5ac";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
