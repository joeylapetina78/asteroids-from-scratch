import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260802-2208-f8594ea";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
