import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260820-0645-f8c9397";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
