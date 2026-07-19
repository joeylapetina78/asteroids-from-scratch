// Hostile loot stays data-driven so new enemies can declare what they carry
// without teaching the simulation about one more special enemy subtype.
export const RIFT_TROPHY_RESOURCE_TYPE = "rift-trophy";

const HOSTILE_LOOT_TABLES = {
  hunter: [
    { type: "water-ice", weight: 4 },
    { type: "iron-nickel", weight: 4 },
    { type: "methane-ice", weight: 1 },
    { type: "crystal-matrix", weight: 2 },
  ],
  fighter: [
    { type: "copper", weight: 4 },
    { type: "cobalt", weight: 2 },
    { type: "silver", weight: 1 },
    { type: "crystal-matrix", weight: 2 },
  ],
};

export function getHostileLootCount(enemyType, random = Math.random) {
  const base = normalizeEnemyType(enemyType) === "fighter" ? 3 : 2;
  return base + Math.floor(random() * 3);
}

export function rollHostileLoot(enemyType, random = Math.random) {
  const table = HOSTILE_LOOT_TABLES[normalizeEnemyType(enemyType)] ?? HOSTILE_LOOT_TABLES.hunter;
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  let remaining = random() * totalWeight;

  for (const entry of table) {
    remaining -= entry.weight;
    if (remaining <= 0) return entry.type;
  }

  return table[table.length - 1].type;
}

export function createPortalTrophy({ waveCount, tradeValue }) {
  return {
    type: RIFT_TROPHY_RESOURCE_TYPE,
    label: `Rift trophy - wave ${waveCount}`,
    tradeValue,
    quantity: 1,
  };
}

function normalizeEnemyType(enemyType) {
  return enemyType === "rift-fighter" ? "fighter" : enemyType;
}
