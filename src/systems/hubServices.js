import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260804-1934-c7f9eb5";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
