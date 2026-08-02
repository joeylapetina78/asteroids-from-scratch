const INSTALL_PRICE = 1400;
const INSTALL_REQUIREMENTS = Object.freeze({ "machine-part": 1, silicate: 1 });
const MAX_CHARGE = 72;
const RECHARGE_PRICE_PER_UNIT = 2;

export function createFleetProtectionManager({ state, ships = [], getShips = () => ships, now = () => Date.now() }) {
  state.fleetProtection ??= { installations: {}, transactions: [], counter: 0, lastLedgerEventId: 0 };
  const protection = state.fleetProtection;

  function update() {
    for (const event of state.ledger.getEventsAfterId(protection.lastLedgerEventId, { includeHidden: true })) {
      protection.lastLedgerEventId = Math.max(protection.lastLedgerEventId, event.id);
      if (event.type === "npc.routeCompleted") serviceAtStop(event.payload.npcId, event.payload.siteId);
      if (event.type === "mining.deliveryCompleted") serviceAtStop(event.payload.workerShipId ?? event.payload.shipId, event.payload.siteId);
      if (event.type === "insurance.claimSettled") markFleetHighRisk(event.payload.holderInstitutionId);
    }
    // Sal offers the first installations to craft physically at Scrap Porch.
    getShips().filter((ship) => ship.isAlive && (ship.dockedSiteId === "scrap-porch" || ship.state === "awaiting-service"))
      .forEach((ship) => maybeInstall(ship));
  }

  function ownerFor(ship) {
    const shipInstitutionId = state.logistics?.haulers?.[ship.id]?.shipInstitutionId ?? ship.institutionId;
    let shipInstitution = state.logistics?.institutions?.[shipInstitutionId];
    let miningOwner = null;
    for (const operation of Object.values(state.miningOperations ?? {})) {
      if (operation.ships?.[ship.id] || operation.ships?.[shipInstitutionId]) {
        shipInstitution ??= operation.ships[ship.id] ?? operation.ships[shipInstitutionId];
        miningOwner = operation.institution;
        break;
      }
    }
    const ownerId = shipInstitution?.controllerInstitutionId ?? ship.controllerInstitutionId;
    return state.logistics?.institutions?.[ownerId] ?? (miningOwner?.id === ownerId ? miningOwner : miningOwner);
  }

  function markFleetHighRisk(ownerId) {
    const owner = state.logistics?.institutions?.[ownerId] ?? Object.values(state.miningOperations ?? {}).find((operation) => operation.institution?.id === ownerId)?.institution;
    if (owner) owner.fleetProtectionPolicy = { ...(owner.fleetProtectionPolicy ?? {}), seekShieldInstallation: true };
  }

  function maybeInstall(ship) {
    if (ship.shield?.installed) return false;
    const owner = ownerFor(ship);
    if (!owner?.fleetProtectionPolicy?.seekShieldInstallation) return false;
    const account = owner.accounts?.operating;
    const reserve = owner.policies?.protectedCash ?? owner.policies?.transportation?.minimumOperatingCash ?? 0;
    const raw = state.sprc?.inventories?.raw ?? {};
    const produced = state.sprc?.inventories?.produced ?? {};
    if (!account || account.balance - INSTALL_PRICE < reserve) return false;
    if ((produced["machine-part"] ?? 0) < 1 || (raw.silicate ?? 0) < 1) return false;
    produced["machine-part"] -= 1; raw.silicate -= 1;
    account.balance -= INSTALL_PRICE;
    state.sprc.account.balance += INSTALL_PRICE;
    ship.installShield?.({ maxCharge: MAX_CHARGE });
    const id = `SHIELD-INSTALL-${String(++protection.counter).padStart(4, "0")}`;
    protection.installations[ship.id] = { id, shipId: ship.id, ownerInstitutionId: owner.id, providerInstitutionId: state.sprc.institution.id, price: INSTALL_PRICE, requirements: { ...INSTALL_REQUIREMENTS }, installedAt: now() };
    state.ledger.recordEvent("sprc.shieldInstalled", { institutionId: state.sprc.institution.id, actorInstitutionId: state.sprc.controller.id, shipId: ship.id, ownerInstitutionId: owner.id, price: INSTALL_PRICE }, { visible: true, message: `Sal installed a rechargeable impact shield on ${ship.name} for ${INSTALL_PRICE} cr; it must buy charge at stops after absorbing damage.` });
    return true;
  }

  function serviceAtStop(shipId, siteId) {
    const ship = getShips().find((candidate) => candidate.id === shipId);
    if (!ship?.shield?.installed || ship.shield.charge >= ship.shield.maxCharge) return false;
    const owner = ownerFor(ship);
    const account = owner?.accounts?.operating;
    const missing = ship.shield.maxCharge - ship.shield.charge;
    const affordableUnits = Math.floor((account?.balance ?? 0) / RECHARGE_PRICE_PER_UNIT);
    const units = Math.min(missing, affordableUnits);
    if (units <= 0) return false;
    const cost = units * RECHARGE_PRICE_PER_UNIT;
    account.balance -= cost;
    const hub = Object.values(state.logistics?.institutions ?? {}).find((institution) => institution.siteId === siteId && institution.accounts?.operating);
    if (hub) hub.accounts.operating.balance += cost;
    ship.rechargeShield?.(units);
    state.ledger.recordEvent("fleet.shieldRecharged", { shipId, ownerInstitutionId: owner.id, siteId, units, cost, charge: ship.shield.charge }, { visible: false });
    return true;
  }

  return { update, getState: () => protection };
}
