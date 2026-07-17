const DEFAULT_HISTORY_LIMIT = 250;

// EventLedger is the central memory spine for meaningful career/world events.
// Gameplay systems report facts here; future contracts, achievements, saves,
// and ship logs can read the same event history and compact stats.
export function createEventLedger(options = {}) {
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const events = [];
  const stats = {};
  const lastSeen = {};
  const signals = {};
  let nextEventId = 1;
  let version = 0;

  function recordEvent(type, payload = {}, options = {}) {
    const event = {
      id: nextEventId,
      type,
      time: Date.now(),
      message: options.message ?? getDefaultMessage(type, payload),
      visible: options.visible ?? true,
      payload,
    };

    nextEventId += 1;
    events.push(event);

    if (events.length > historyLimit) {
      events.splice(0, events.length - historyLimit);
    }

    incrementStat("events.total");
    incrementStat(`events.${type}`);
    lastSeen[type] = {
      id: event.id,
      time: event.time,
      payload: event.payload,
    };
    applyEventStats(event);
    applyEventSignals(event);
    version += 1;

    return event;
  }

  function incrementStat(key, amount = 1) {
    stats[key] = (stats[key] ?? 0) + amount;
    return stats[key];
  }

  function setStatMax(key, value) {
    stats[key] = Math.max(stats[key] ?? value, value);
    return stats[key];
  }

  function getStat(key, fallback = 0) {
    return stats[key] ?? fallback;
  }

  function getStatsSnapshot() {
    return { ...stats };
  }

  function setSignal(key, value = true) {
    signals[key] = value;
    return signals[key];
  }

  function setSignalAliases(keys, value = true) {
    keys.forEach((key) => setSignal(key, value));
  }

  function getSignal(key, fallback = false) {
    return signals[key] ?? fallback;
  }

  function getSignalsSnapshot() {
    return { ...signals };
  }

  function getLastSeen(type) {
    return lastSeen[type] ?? null;
  }

  function hasSeen(type) {
    return Boolean(lastSeen[type]);
  }

  function getRecentEvents(count = 5, options = {}) {
    const includeHidden = options.includeHidden ?? false;
    const sourceEvents = includeHidden ? events : events.filter((event) => event.visible);

    return sourceEvents.slice(-count).reverse();
  }

  function getRecentEventGroups(count = 5, options = {}) {
    const includeHidden = options.includeHidden ?? false;
    const sourceEvents = includeHidden ? events : events.filter((event) => event.visible);
    const groups = [];

    for (let index = sourceEvents.length - 1; index >= 0 && groups.length < count; index -= 1) {
      const event = sourceEvents[index];
      const groupKey = getEventGroupKey(event);
      const latestGroup = groups[groups.length - 1];

      if (latestGroup?.groupKey === groupKey) {
        latestGroup.count += 1;
        latestGroup.firstEvent = event;
        latestGroup.message = getGroupedMessage(latestGroup.latestEvent, latestGroup.count);
      } else {
        groups.push({
          groupKey,
          count: 1,
          firstEvent: event,
          latestEvent: event,
          message: event.message,
        });
      }
    }

    return groups;
  }

  function getEventsAfterId(eventId = 0, options = {}) {
    const includeHidden = options.includeHidden ?? false;

    return events.filter((event) => event.id > eventId && (includeHidden || event.visible));
  }

  function applyEventStats(event) {
    if (event.type === "site.docked") {
      incrementStat("site.docked.total");
      incrementStat(`site.docked.${event.payload.siteId}`);
    } else if (event.type === "ship.registryReviewed") {
      incrementStat("ship.registryReviewed.total");
      incrementStat(`ship.registryReviewed.${event.payload.siteId ?? "unknown"}`);
    } else if (event.type === "site.enteredViewport") {
      incrementStat("site.enteredViewport.total");
      incrementStat(`site.enteredViewport.${event.payload.siteId}`);
    } else if (event.type === "zone.entered") {
      incrementStat("zone.entered.total");
      incrementStat(`zone.entered.${event.payload.zoneId}`);

      (event.payload.tags ?? []).forEach((tag) => {
        incrementStat(`zone.entered.tags.${tag}`);
      });
    } else if (event.type === "ship.repaired") {
      incrementStat("ship.repaired.total");
      incrementStat("credits.spent.repairs", event.payload.creditsSpent ?? 0);
      incrementStat("ship.hull.repaired", event.payload.hullRestored ?? 0);
    } else if (event.type === "ship.refueled") {
      incrementStat("ship.refueled.total");
      incrementStat("ship.fuel.refueled", event.payload.fuelAdded ?? 0);
      incrementStat(`ship.refueled.${event.payload.siteId ?? "unknown"}`);
    } else if (event.type === "cargo.sold") {
      incrementStat("cargo.sold.total");
      incrementStat("credits.earned.sales", event.payload.creditsEarned ?? 0);
      incrementStat("cargo.sold.units.total", event.payload.totalUnits ?? 0);

      Object.entries(event.payload.units ?? {}).forEach(([type, count]) => {
        incrementStat(`cargo.sold.units.${type}`, count);
      });
    } else if (event.type === "weapon.fired") {
      incrementStat("weapon.fired.total");
      incrementStat(`weapon.fired.${event.payload.weaponType ?? "unknown"}`);
      incrementStat("ammo.spent", event.payload.ammoSpent ?? 0);
    } else if (event.type === "scanner.used") {
      incrementStat("scanner.used.total");
      incrementStat("scanergy.spent.scans", event.payload.scanergySpent ?? 0);
    } else if (event.type === "beaconLocator.used") {
      incrementStat("beaconLocator.used.total");
      incrementStat(`beaconLocator.used.${event.payload.siteId ?? "unknown"}`);
    } else if (event.type === "ship.moved") {
      incrementStat("ship.moved.total");
      incrementStat("ship.distance.logged", event.payload.distance ?? 0);
      setStatMax("ship.speed.max", event.payload.speed ?? 0);
    } else if (event.type === "ship.thrusted") {
      incrementStat("ship.thrusted.total");
      setStatMax("ship.thrusted.speed.max", event.payload.speed ?? 0);
    } else if (event.type === "ship.stranded") {
      incrementStat("ship.stranded.total");
      incrementStat(`ship.stranded.nearest.${event.payload.nearestSiteId ?? "unknown"}`);
    } else if (event.type === "ship.towed") {
      incrementStat("ship.towed.total");
      incrementStat("credits.spent.tows", event.payload.cost ?? 0);
      incrementStat(`ship.towed.${event.payload.siteId ?? "unknown"}`);
    } else if (event.type === "incursion.portalOpened") {
      incrementStat("incursion.portalOpened.total");
      incrementStat(`incursion.portalOpened.${event.payload.factionId ?? "unknown"}`);
    } else if (event.type === "incursion.waveSpawned") {
      incrementStat("incursion.waveSpawned.total");
      setStatMax("incursion.wave.max", event.payload.waveCount ?? 0);
      incrementStat("incursion.enemies.spawned", event.payload.enemyCount ?? 0);
    } else if (event.type === "incursion.portalDestroyed") {
      incrementStat("incursion.portalDestroyed.total");
      setStatMax("incursion.portalDestroyed.wave.max", event.payload.waveCount ?? 0);
      incrementStat("credits.earned.incursions", event.payload.reward ?? 0);
    } else if (event.type === "site.nearby") {
      incrementStat("site.nearby.total");
      incrementStat(`site.nearby.${event.payload.siteId ?? "unknown"}`);
    } else if (event.type === "ship.nearObject") {
      incrementStat("ship.nearObject.total");
      incrementStat(`ship.nearObject.${event.payload.targetType ?? "unknown"}`);
    } else if (event.type === "ship.collision") {
      incrementStat("ship.collision.total");
      incrementStat(`ship.collision.${event.payload.targetType ?? "unknown"}`);
      incrementStat("ship.collision.damage.total", event.payload.damage ?? 0);
      setStatMax("ship.collision.damage.max", event.payload.damage ?? 0);
    } else if (event.type === "asteroid.destroyed") {
      incrementStat("asteroid.destroyed.total");
      incrementStat(`asteroid.destroyed.${event.payload.resourceType ?? "unknown"}`);
      incrementStat(`asteroid.destroyed.tier.${event.payload.tier ?? "unknown"}`);

      if (event.payload.finalBreak) {
        incrementStat("asteroid.finalBreak.total");
        incrementStat(`asteroid.finalBreak.${event.payload.resourceType ?? "unknown"}`);
      }
    } else if (event.type === "resource.mined") {
      incrementStat("resource.mined.total");
      incrementStat("resource.mined.units.total", event.payload.totalUnits ?? 0);

      Object.entries(event.payload.units ?? {}).forEach(([type, count]) => {
        incrementStat(`resource.mined.${type}`, count);
      });
    } else if (event.type === "resource.collected") {
      const amount = event.payload.amount ?? 1;
      const sourceClaimId = event.payload.sourceClaimId ?? "unknown";
      incrementStat("resource.collected.total");
      incrementStat(`resource.collected.${event.payload.resourceType}`, amount);
      incrementStat(`resource.collected.sourceClaim.${sourceClaimId}.total`, amount);
      incrementStat(`resource.collected.sourceClaim.${sourceClaimId}.${event.payload.resourceType}`, amount);
    } else if (event.type === "pilot.debugMarker") {
      incrementStat("pilot.debugMarker.total");
      incrementStat(`pilot.debugMarker.${event.payload.markerKey ?? "unknown"}`);
    } else if (event.type === "resource.processed") {
      incrementStat("resource.processed.total");
      incrementStat(`resource.processed.input.${event.payload.resourceType}`);
      incrementStat(`resource.processed.output.${event.payload.output}`);

      if (event.payload.output !== "cargo") {
        incrementStat(`resource.created.${event.payload.output}`, event.payload.amount ?? 0);
      }
    } else if (event.type === "enemy.destroyed") {
      incrementStat("enemy.destroyed.total");
      incrementStat(`enemy.destroyed.${event.payload.enemyType ?? "unknown"}`);
      incrementStat(`enemy.destroyed.cause.${event.payload.cause ?? "unknown"}`);
    } else if (event.type === "npc.destroyed") {
      incrementStat("npc.destroyed.total");
      incrementStat(`npc.destroyed.${event.payload.npcType ?? "unknown"}`);
      incrementStat(`npc.destroyed.cause.${event.payload.cause ?? "unknown"}`);
    } else if (event.type === "npc.enteredViewport") {
      incrementStat("npc.enteredViewport.total");
      incrementStat(`npc.enteredViewport.${event.payload.npcType ?? "unknown"}`);
    } else if (event.type === "npc.carefulMode") {
      incrementStat("npc.carefulMode.total");
      incrementStat(`npc.carefulMode.${event.payload.npcType ?? "unknown"}`);
      incrementStat(`npc.carefulMode.reason.${event.payload.reason ?? "unknown"}`);
    } else if (event.type === "component.unlocked" || event.type === "component.shown") {
      incrementStat(`${event.type}.total`);
      incrementStat(`${event.type}.${event.payload.componentId ?? "unknown"}`);
    } else if (
      event.type === "contract.offered" ||
      event.type === "contract.accepted" ||
      event.type === "contract.resourceDeposited" ||
      event.type === "contract.fulfilled" ||
      event.type === "contract.paid"
    ) {
      incrementStat(`${event.type}.total`);
      incrementStat(`${event.type}.${event.payload.contractId ?? "unknown"}`);

      if (event.type === "contract.resourceDeposited") {
        incrementStat("contract.resourceDeposited.total", event.payload.unitsDeposited ?? 0);
        incrementStat(`contract.resourceDeposited.${event.payload.resourceType ?? "unknown"}`, event.payload.unitsDeposited ?? 0);
      }

      if (event.type === "contract.fulfilled" && event.payload.resourceType) {
        incrementStat("contract.resourceDelivered.total", event.payload.unitsDelivered ?? 0);
        incrementStat(`contract.resourceDelivered.${event.payload.resourceType}`, event.payload.unitsDelivered ?? 0);
      }

      if (event.type === "contract.paid") {
        incrementStat("credits.earned.contracts", event.payload.creditsPaid ?? 0);
      }
    } else if (event.type === "loan.disbursed") {
      incrementStat("loan.disbursed.total");
      incrementStat(`loan.disbursed.${event.payload.contractId ?? "unknown"}`);
      incrementStat("credits.borrowed.total", event.payload.principal ?? 0);
      setStatMax("credits.borrowed.largest", event.payload.principal ?? 0);
      setStatMax("credits.held.max", event.payload.accountCredits ?? 0);
    } else if (event.type === "rook.bonusAwarded") {
      incrementStat("rook.bonusAwarded.total");
      incrementStat("credits.earned.bonuses", event.payload.creditsPaid ?? 0);
      setStatMax("credits.held.max", event.payload.accountCredits ?? 0);
    } else if (event.type === "ship.purchased") {
      incrementStat("ship.purchased.total");
      incrementStat(`ship.purchased.${event.payload.offerId ?? "unknown"}`);
      incrementStat("credits.spent.ships", event.payload.price ?? 0);
    } else if (event.type === "ship.titleIssued" || event.type === "ship.registered" || event.type === "title.lienAttached") {
      incrementStat(`${event.type}.total`);
    } else if (event.type === "mission.accepted" || event.type === "mission.completed") {
      incrementStat(`${event.type}.total`);
      incrementStat(`${event.type}.${event.payload.missionId ?? "unknown"}`);
    }
  }

  function applyEventSignals(event) {
    if (event.type === "site.docked") {
      setSignalAliases(["player.hasEverDocked", "actor.hasEverDocked", "controlledShip.hasEverDocked"]);
      setSignalAliases([
        `player.hasDocked.${event.payload.siteId ?? "unknown"}`,
        `actor.hasDocked.${event.payload.siteId ?? "unknown"}`,
        `controlledShip.hasDocked.${event.payload.siteId ?? "unknown"}`,
      ]);
    } else if (event.type === "zone.entered") {
      setSignalAliases([
        `player.hasVisitedZone.${event.payload.zoneId ?? "unknown"}`,
        `actor.hasVisitedZone.${event.payload.zoneId ?? "unknown"}`,
        `controlledShip.hasVisitedZone.${event.payload.zoneId ?? "unknown"}`,
      ]);

      if ((event.payload.tags ?? []).includes("danger") || (event.payload.danger ?? 0) >= 0.45) {
        setSignalAliases(["player.hasVisitedDangerousSpace", "actor.hasVisitedDangerousSpace", "controlledShip.hasVisitedDangerousSpace"]);
      }
    } else if (event.type === "weapon.fired") {
      setSignalAliases(["player.hasEverFired", "actor.hasEverFired", "controlledShip.hasEverFired"]);

      if (getStat("weapon.fired.total") >= 10) {
        setSignalAliases(["player.isAggressive", "actor.isAggressive"]);
      }
    } else if (event.type === "scanner.used") {
      setSignalAliases(["player.hasEverScanned", "actor.hasEverScanned", "controlledShip.hasEverScanned"]);
    } else if (event.type === "beaconLocator.used") {
      setSignalAliases(["player.hasUsedBeaconLocator", "actor.hasUsedBeaconLocator", "controlledShip.hasUsedBeaconLocator"]);
    } else if (event.type === "ship.thrusted") {
      setSignalAliases(["player.hasEverThrusted", "actor.hasEverThrusted", "controlledShip.hasEverThrusted"]);
    } else if (event.type === "ship.collision") {
      setSignalAliases(["player.hasCrashed", "actor.hasCrashed", "controlledShip.hasCrashed"]);

      if (getStat("ship.collision.total") >= 3 || getStat("ship.collision.damage.total") >= 100) {
        setSignalAliases(["player.isReckless", "actor.isReckless"]);
      }

      if (getStat("ship.collision.damage.max") >= 50) {
        setSignalAliases(["player.hasTakenHeavyHit", "actor.hasTakenHeavyHit", "controlledShip.hasTakenHeavyHit"]);
      }
    } else if (event.type === "resource.mined") {
      setSignalAliases(["player.hasMinedResources", "actor.hasMinedResources"]);

      Object.keys(event.payload.units ?? {}).forEach((resourceType) => {
        setSignalAliases([`player.hasMined.${resourceType}`, `actor.hasMined.${resourceType}`]);
      });
    } else if (event.type === "resource.collected") {
      setSignalAliases(["player.hasCollectedResources", "actor.hasCollectedResources", "controlledShip.hasCollectedResources"]);
      setSignalAliases([
        `player.hasCollected.${event.payload.resourceType ?? "unknown"}`,
        `actor.hasCollected.${event.payload.resourceType ?? "unknown"}`,
        `controlledShip.hasCollected.${event.payload.resourceType ?? "unknown"}`,
      ]);
    } else if (event.type === "enemy.destroyed") {
      setSignalAliases(["player.hasDestroyedEnemy", "actor.hasDestroyedEnemy"]);

      if (getStat("enemy.destroyed.total") >= 3) {
        setSignalAliases(["player.isAggressive", "actor.isAggressive"]);
      }
    } else if (event.type === "npc.destroyed") {
      setSignalAliases(["player.hasDestroyedNpc", "actor.hasDestroyedNpc"]);
    } else if (event.type === "ship.repaired") {
      setSignalAliases(["player.hasRepairedShip", "actor.hasRepairedShip", "controlledShip.hasBeenRepaired"]);

      if (getStat("ship.repaired.total") >= 3) {
        setSignalAliases(["player.isRepairDependent", "actor.isRepairDependent"]);
      }
    } else if (event.type === "contract.paid") {
      setSignalAliases(["player.hasCompletedPaidContract", "actor.hasCompletedPaidContract"]);
      setSignalAliases([
        `player.hasCompletedContract.${event.payload.contractId ?? "unknown"}`,
        `actor.hasCompletedContract.${event.payload.contractId ?? "unknown"}`,
      ]);
    } else if (event.type === "loan.disbursed") {
      setSignalAliases(["player.hasDebt", "actor.hasDebt", "pilot.hasDebt"]);
    } else if (event.type === "ship.purchased") {
      setSignalAliases(["player.hasPurchasedShip", "actor.hasPurchasedShip"]);
      setSignalAliases([
        `player.hasPurchasedShip.${event.payload.offerId ?? "unknown"}`,
        `actor.hasPurchasedShip.${event.payload.offerId ?? "unknown"}`,
      ]);
    } else if (event.type === "ship.titleIssued") {
      setSignalAliases(["player.hasShipTitle", "actor.hasShipTitle"]);
      setSignalAliases([
        `player.hasShipTitle.${event.payload.shipVin ?? "unknown"}`,
        `actor.hasShipTitle.${event.payload.shipVin ?? "unknown"}`,
        `ship.hasTitle.${event.payload.shipVin ?? "unknown"}`,
      ]);
    } else if (event.type === "ship.registered") {
      setSignalAliases(["player.hasShipRegistration", "actor.hasShipRegistration"]);
      setSignalAliases([
        `player.hasShipRegistration.${event.payload.shipVin ?? "unknown"}`,
        `actor.hasShipRegistration.${event.payload.shipVin ?? "unknown"}`,
        `ship.hasRegistration.${event.payload.shipVin ?? "unknown"}`,
      ]);
    } else if (event.type === "title.lienAttached") {
      setSignalAliases(["player.hasLien", "actor.hasLien"]);
      setSignalAliases([
        `player.hasLien.${event.payload.shipVin ?? "unknown"}`,
        `actor.hasLien.${event.payload.shipVin ?? "unknown"}`,
        `ship.hasLien.${event.payload.shipVin ?? "unknown"}`,
      ]);
    } else if (event.type === "tow.dispatched" || event.type === "tow.attached") {
      setSignalAliases(["player.controlLocked", "actor.controlLocked", "controlledShip.controlLocked"]);
    } else if (event.type === "ship.towed") {
      setSignalAliases(["player.controlLocked", "actor.controlLocked", "controlledShip.controlLocked"], false);
    }
  }

  return {
    recordEvent,
    incrementStat,
    setStatMax,
    getStat,
    getStatsSnapshot,
    setSignal,
    getSignal,
    getSignalsSnapshot,
    getLastSeen,
    hasSeen,
    getRecentEvents,
    getRecentEventGroups,
    getEventsAfterId,
    get historyLimit() {
      return historyLimit;
    },
    get eventCount() {
      return events.length;
    },
    get version() {
      return version;
    },
  };
}

function getDefaultMessage(type, payload) {
  if (type === "site.docked") {
    return `Docked at ${payload.siteName ?? payload.siteId}`;
  }

  if (type === "site.tetherBroken") {
    return `Docking tether snapped at ${payload.siteName ?? payload.siteId}`;
  }

  if (type === "ship.registryReviewed") {
    return `Registry reviewed for ${payload.vin ?? "unattached VIN"}`;
  }

  if (type === "site.enteredViewport") {
    return `${payload.siteName ?? payload.siteId} entered view`;
  }

  if (type === "ship.repaired") {
    return `Repaired hull for ${payload.creditsSpent ?? 0} credits`;
  }

  if (type === "ship.refueled") {
    return `Refueled at ${payload.siteName ?? payload.siteId ?? "hub"}`;
  }

  if (type === "cargo.sold") {
    return `Sold cargo for ${payload.creditsEarned ?? 0} credits`;
  }

  if (type === "zone.entered") {
    return `Entered ${payload.zoneName ?? payload.zoneId}`;
  }

  if (type === "scanner.used") {
    return "Scanner used";
  }

  if (type === "beaconLocator.used") {
    return `Beacon set to ${payload.siteName ?? payload.siteId ?? "unknown"}`;
  }

  if (type === "ship.moved") {
    return "Ship moved";
  }

  if (type === "ship.thrusted") {
    return "Ship thrust engaged";
  }

  if (type === "ship.stranded") {
    return `Stranded near ${payload.nearestSiteName ?? payload.nearestSiteId ?? "unknown hub"}`;
  }

  if (type === "ship.towed") {
    return `Emergency tow to ${payload.siteName ?? payload.siteId ?? "nearest hub"} for ${payload.cost ?? 0} credits`;
  }

  if (type === "pilot.debugMarker") {
    return `Pilot debug marker ${payload.markerKey ?? "?"}: ${payload.note ?? "input anomaly"}`;
  }

  if (type === "incursion.portalOpened") {
    return `Incursion portal opened with ${payload.enemyCount ?? 0} guards`;
  }

  if (type === "incursion.waveSpawned") {
    return `Incursion wave ${payload.waveCount ?? 0}: ${payload.enemyCount ?? 0} hunters`;
  }

  if (type === "incursion.portalDamaged") {
    return `Damaged incursion portal`;
  }

  if (type === "incursion.portalShielded") {
    return `Portal shield held: ${payload.guardCount ?? 0} guards remain`;
  }

  if (type === "incursion.portalDestroyed") {
    if (payload.cause === "hub-defense") {
      return `${payload.siteName ?? "Hub defense"} destroyed an incursion portal`;
    }

    return `Destroyed incursion portal for ${payload.reward ?? 0} credits`;
  }

  if (type === "site.nearby") {
    return `Near ${payload.siteName ?? payload.siteId}`;
  }

  if (type === "ship.nearObject") {
    return `Near ${payload.targetName ?? payload.targetType ?? "object"}`;
  }

  if (type === "ship.collision") {
    return `Collision with ${payload.targetName ?? payload.targetType ?? "object"}`;
  }

  if (type === "resource.mined") {
    return `Mined ${payload.totalUnits ?? 0} resources`;
  }

  if (type === "resource.processed") {
    return `Processed ${payload.resourceType} to ${payload.output}`;
  }

  if (type === "enemy.destroyed") {
    return `Destroyed ${payload.enemyType ?? "enemy"}`;
  }

  if (type === "npc.destroyed") {
    return `Destroyed ${payload.npcName ?? payload.npcType ?? "NPC ship"}`;
  }

  if (type === "npc.enteredViewport") {
    return `${payload.npcName ?? "NPC ship"} entered view`;
  }

  if (type === "npc.carefulMode") {
    return `${payload.npcName ?? "NPC ship"} switched to careful mode`;
  }

  if (type === "component.unlocked") {
    return `${payload.componentName ?? payload.componentId ?? "Component"} unlocked`;
  }

  if (type === "component.shown") {
    return `${payload.componentName ?? payload.componentId ?? "Component"} shown`;
  }

  if (type === "mission.accepted") {
    return `Accepted ${payload.missionName ?? payload.missionId ?? "mission"}`;
  }

  if (type === "mission.completed") {
    return `Completed ${payload.missionName ?? payload.missionId ?? "mission"}`;
  }

  if (type === "contract.offered") {
    return `Contract offered: ${payload.contractTitle ?? payload.contractId}`;
  }

  if (type === "contract.accepted") {
    return `Accepted contract: ${payload.contractTitle ?? payload.contractId}`;
  }

  if (type === "contract.resourceDeposited") {
    return `Deposited ${payload.resourceName ?? payload.resourceType} ${payload.deliveredAmount ?? 0}/${payload.requiredAmount ?? 0}`;
  }

  if (type === "contract.fulfilled") {
    if (payload.resourceType) {
      return `Delivered ${payload.unitsDelivered ?? 0} ${payload.resourceName ?? payload.resourceType}`;
    }

    return `Fulfilled contract: ${payload.contractTitle ?? payload.contractId}`;
  }

  if (type === "contract.paid") {
    return `Contract paid ${payload.creditsPaid ?? 0} credits`;
  }

  if (type === "loan.disbursed") {
    return `Loan funded ${payload.principal ?? 0} credits`;
  }

  if (type === "rook.bonusAwarded") {
    return `Rook bonus ${payload.creditsPaid ?? 0} credits`;
  }

  if (type === "ship.purchased") {
    return `Purchased ${payload.shipName ?? payload.offerId ?? "ship"}`;
  }

  if (type === "merchant.cannotAfford") {
    return `Cannot afford ${payload.shipName ?? payload.offerId ?? "ship"}`;
  }

  return type;
}

function getEventGroupKey(event) {
  if (event.type === "resource.processed") {
    return `${event.type}:${event.payload.resourceType}:${event.payload.output}`;
  }

  if (event.type === "zone.entered") {
    return `${event.type}:${event.payload.zoneId}`;
  }

  if (event.type === "site.docked") {
    return `${event.type}:${event.payload.siteId}`;
  }

  if (event.type === "cargo.sold") {
    return event.type;
  }

  return `${event.type}:${event.message}`;
}

function getGroupedMessage(event, count) {
  if (count <= 1) {
    return event.message;
  }

  if (event.type === "resource.processed") {
    return `Processed ${event.payload.resourceType} to ${event.payload.output} x${count}`;
  }

  return `${event.message} x${count}`;
}
