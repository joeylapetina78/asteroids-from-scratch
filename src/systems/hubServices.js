import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260909-2143-e03b84d2";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
