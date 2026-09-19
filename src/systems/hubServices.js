import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260918-1912-aafa3d27";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
