import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260815-0037-8f1e3cc";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
