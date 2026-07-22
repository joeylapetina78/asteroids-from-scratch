import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260721-2114-33b9943";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
