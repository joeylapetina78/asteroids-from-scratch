import { getRegionProfile } from "./worldRegions.js?v=fresh-20260721-2114-33b9943";
import { getChunkTerrainProfile } from "./worldTerrain.js?v=fresh-20260721-2114-33b9943";

// Procedural area identity. The authored zones near origin have handcrafted
// names, but the rest of infinite space does not — so every location also
// belongs to a deterministic "sector," and each sector gets a code built ONLY
// from information the world already generates: the region it sits in, its
// grid coordinates, and its dominant terrain feature. Same place → same code,
// forever, with no separate naming table to maintain. Neighboring sectors read
// as neighboring codes, so the code carries real spatial meaning.
const SECTOR_SIZE = 6000;

// Offset so grid labels stay positive across the playable world (~±2M units at
// cruise ≈ ±340 sectors, inside ±500). Keeps near-origin codes to two letters.
const GRID_OFFSET = 500;

const REGION_PREFIX = {
  "rook-frontier": "RF",
  "red-vein-belt": "RVB",
  "copper-wake": "CPW",
  "cold-reach": "CLR",
  "the-black": "BLK",
};

const FEATURE_LABEL = {
  "open-drift": "Open Drift",
  "cluster-pocket": "Cluster Field",
  "stone-wall": "Stone Ridge",
  "maze-corridor": "Maze Belt",
  "debris-stream": "Debris Stream",
  "giant-garden": "Boulder Garden",
  "sparse-dead": "Dead Reach",
};

export function getSectorDesignation(x, y) {
  const sectorX = Math.floor(x / SECTOR_SIZE);
  const sectorY = Math.floor(y / SECTOR_SIZE);
  const region = getRegionProfile(x, y);
  const prefix = REGION_PREFIX[region.strongestRegionId] ?? "SEC";
  const grid = `${toColumnLabel(sectorX)}${toRowLabel(sectorY)}`;

  // Sample terrain at the sector center so the descriptor names the sector's
  // dominant feel, not whatever chunk the ship happens to be sitting in.
  const centerX = sectorX * SECTOR_SIZE + SECTOR_SIZE / 2;
  const centerY = sectorY * SECTOR_SIZE + SECTOR_SIZE / 2;
  const terrain = getChunkTerrainProfile(centerX, centerY);
  const feature = FEATURE_LABEL[terrain.id] ?? "Open Space";

  return {
    id: `sector:${sectorX},${sectorY}`,
    code: `${prefix}-${grid}`,
    feature,
    sectorX,
    sectorY,
  };
}

// Spreadsheet-style column letters (…, Y, Z, AA, AB, …) so a step east/west is
// one step in the label. Offset keeps the argument positive.
function toColumnLabel(index) {
  let value = index + GRID_OFFSET;
  let label = "";

  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return label;
}

function toRowLabel(index) {
  return String(index + GRID_OFFSET).padStart(4, "0");
}
