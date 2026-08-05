import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260804-2128-90ed81d";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
