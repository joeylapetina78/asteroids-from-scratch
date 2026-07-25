import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260724-2215-9e3a5f2";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
