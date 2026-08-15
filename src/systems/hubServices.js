import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260814-2033-3b23f7e";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
