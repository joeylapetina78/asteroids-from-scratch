import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260804-1857-0735c8c";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
