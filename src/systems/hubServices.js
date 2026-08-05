import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260804-1903-50a9a01";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
