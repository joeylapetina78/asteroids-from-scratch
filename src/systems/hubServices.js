import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260818-0644-d8d52fb";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
