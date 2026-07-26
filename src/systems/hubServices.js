import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260726-0115-cdea97e";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
