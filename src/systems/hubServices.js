import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260717-2003-fcd6b0d";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
