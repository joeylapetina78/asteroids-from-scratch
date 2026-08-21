import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260820-2121-992690e";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
