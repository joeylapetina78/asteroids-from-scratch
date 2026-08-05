import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260804-2058-2977c87";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
