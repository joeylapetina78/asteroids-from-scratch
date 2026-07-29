import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260728-2032-8e0cc22";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
