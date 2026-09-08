import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260908-1824-319e9c79";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
