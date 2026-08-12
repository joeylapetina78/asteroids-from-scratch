import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260811-2000-0c0fe4d";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
