import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260719-2120-67e79b8";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
