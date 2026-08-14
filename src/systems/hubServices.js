import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260813-2131-ea0bc9d";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
