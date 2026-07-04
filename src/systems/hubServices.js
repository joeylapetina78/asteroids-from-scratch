import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260704-0155-737ee43";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
