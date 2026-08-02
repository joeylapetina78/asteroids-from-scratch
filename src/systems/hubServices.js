import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260802-0005-942466e";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
