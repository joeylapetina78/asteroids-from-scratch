import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260915-2057-ac0a9fc1";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
