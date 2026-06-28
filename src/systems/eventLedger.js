const DEFAULT_HISTORY_LIMIT = 250;

// EventLedger is the central memory spine for meaningful career/world events.
// Gameplay systems report facts here; future contracts, achievements, saves,
// and ship logs can read the same event history and compact stats.
export function createEventLedger(options = {}) {
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const events = [];
  const stats = {};
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
    applyEventStats(event);
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

  function applyEventStats(event) {
    if (event.type === "site.docked") {
      incrementStat("site.docked.total");
      incrementStat(`site.docked.${event.payload.siteId}`);
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
    } else if (event.type === "asteroid.destroyed") {
      incrementStat("asteroid.destroyed.total");
      incrementStat(`asteroid.destroyed.${event.payload.resourceType ?? "unknown"}`);
      incrementStat(`asteroid.destroyed.tier.${event.payload.tier ?? "unknown"}`);

      if (event.payload.finalBreak) {
        incrementStat("asteroid.finalBreak.total");
        incrementStat(`asteroid.finalBreak.${event.payload.resourceType ?? "unknown"}`);
      }
    } else if (event.type === "resource.collected") {
      incrementStat("resource.collected.total");
      incrementStat(`resource.collected.${event.payload.resourceType}`);
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
    } else if (event.type === "npc.carefulMode") {
      incrementStat("npc.carefulMode.total");
      incrementStat(`npc.carefulMode.${event.payload.npcType ?? "unknown"}`);
      incrementStat(`npc.carefulMode.reason.${event.payload.reason ?? "unknown"}`);
    }
  }

  return {
    recordEvent,
    incrementStat,
    setStatMax,
    getStat,
    getStatsSnapshot,
    getRecentEvents,
    getRecentEventGroups,
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

  if (type === "ship.repaired") {
    return `Repaired hull for ${payload.creditsSpent ?? 0} credits`;
  }

  if (type === "cargo.sold") {
    return `Sold cargo for ${payload.creditsEarned ?? 0} credits`;
  }

  if (type === "zone.entered") {
    return `Entered ${payload.zoneName ?? payload.zoneId}`;
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

  if (type === "npc.carefulMode") {
    return `${payload.npcName ?? "NPC ship"} switched to careful mode`;
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
