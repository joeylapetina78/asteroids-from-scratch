import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260712-1345-a8d335f";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
