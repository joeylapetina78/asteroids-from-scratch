import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260802-1248-85b6ff4";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
