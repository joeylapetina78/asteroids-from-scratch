import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260809-2057-53180b2";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
