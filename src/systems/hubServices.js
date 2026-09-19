import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260919-1551-7192aadf";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
