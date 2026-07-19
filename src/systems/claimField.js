import { createValueNoise } from "./valueNoise.js";
import { getRegionProfile } from "./worldRegions.js";
import { getZoneProfile } from "./worldZones.js?v=fresh-20260719-0052-baf9309";

const GRID_SIZE = 350;
const JITTER = 100;
const PLOT_EDGE_JITTER = 28;
const HEX_RADIUS = 360;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const HEX_ROW_STEP = HEX_RADIUS * 1.5;

const DOT_SPACING = 40;
const DOT_RADIUS_SQ = 13 * 13;
const BORDER_T = 0.86;

const FILL_BRIGHT = 0.50;
const DOT_BRIGHT = 1.00;

export function createClaimField() {
  const noise = createValueNoise(6247);
  const seedCache = new Map();
  const plotVertexCache = new Map();

  function getSeed(gi, gj) {
    const key = `${gi},${gj}`;
    let seed = seedCache.get(key);
    if (seed) return seed;

    const jx = (noise(gi, gj, 1) - 0.5) * 2 * JITTER;
    const jy = (noise(gi + 5000, gj + 5000, 1) - 0.5) * 2 * JITTER;
    const wx = gi * GRID_SIZE + jx;
    const wy = gj * GRID_SIZE + jy;

    const profile = getZoneProfile(wx, wy);
    const regionProfile = getRegionProfile(wx, wy);
    const neon = resolveNeon(regionProfile);
    const resourceIntensity = getResourceIntensity(regionProfile, noise(gi + 9000, gj - 9000, 2));

    seed = {
      id: `claim-${gi}-${gj}`,
      grid: { x: gi, y: gj },
      wx,
      wy,
      neon,
      profile,
      regionProfile,
      resourceIntensity,
      claimType: resourceIntensity > 0.64 ? "mining" : "frontier",
      authorityId: regionProfile.rights.mining?.authorityId ?? "unclaimed-space",
      ownerId: null,
      rights: {
        transit: regionProfile.rights.transit,
        mining: regionProfile.rights.mining,
        patrol: regionProfile.rights.patrol,
        salvage: regionProfile.rights.salvage,
        construction: regionProfile.rights.construction,
        trade: regionProfile.rights.trade,
        enforcement: regionProfile.rights.enforcement,
      },
    };

    seedCache.set(key, seed);
    return seed;
  }

  function sampleClaim(wx, wy) {
    const gi = Math.floor(wx / GRID_SIZE);
    const gj = Math.floor(wy / GRID_SIZE);

    let d1 = Infinity;
    let d2 = Infinity;
    let seed1 = null;
    let seed2 = null;

    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        const seed = getSeed(gi + di, gj + dj);
        const dx = wx - seed.wx;
        const dy = wy - seed.wy;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d < d1) {
          d2 = d1;
          seed2 = seed1;
          d1 = d;
          seed1 = seed;
        } else if (d < d2) {
          d2 = d;
          seed2 = seed;
        }
      }
    }

    return {
      seed1,
      seed2,
      edgeness: d2 > 0 ? Math.min(1, d1 / d2) : 0,
    };
  }

  function getClaimAt(wx, wy) {
    const { seed1 } = sampleClaim(wx, wy);

    return getClaimFromSeed(seed1);
  }

  function getClaimById(claimId) {
    const match = /^claim-(-?\d+)-(-?\d+)$/.exec(claimId ?? "");
    if (!match) {
      return null;
    }

    return getClaimFromSeed(getSeed(Number(match[1]), Number(match[2])));
  }

  function getPlotAt(wx, wy) {
    const row = Math.round(wy / HEX_ROW_STEP);
    const rowOffset = Math.abs(row % 2) * HEX_WIDTH * 0.5;
    const col = Math.round((wx - rowOffset) / HEX_WIDTH);

    return getPlot(col, row);
  }

  function getPlotById(plotId) {
    const match = /^plot-hex-(-?\d+)-(-?\d+)$/.exec(plotId ?? "");
    if (!match) {
      return null;
    }

    return getPlot(Number(match[1]), Number(match[2]));
  }

  function getClaimOrPlotById(id) {
    return getPlotById(id) ?? getClaimById(id);
  }

  function getClaimFromSeed(seed1) {
    return {
      id: seed1.id,
      center: { x: seed1.wx, y: seed1.wy },
      grid: seed1.grid,
      strongestZoneId: seed1.profile.strongestZoneId,
      strongestZoneName: seed1.profile.strongestZoneName,
      zoneInfluence: seed1.profile.influence,
      strongestRegionId: seed1.regionProfile.strongestRegionId,
      strongestRegionName: seed1.regionProfile.strongestRegionName,
      regionInfluence: seed1.regionProfile.influence,
      parcelKind: "plot",
      claimType: seed1.claimType,
      authorityId: seed1.authorityId,
      ownerId: seed1.ownerId,
      rights: cloneRights(seed1.rights),
      resourceIntensity: seed1.resourceIntensity,
      dominantFamilies: [...seed1.regionProfile.dominantFamilies],
      institutions: [...seed1.regionProfile.institutions],
      color: [...seed1.neon],
      tags: [...new Set([...(seed1.regionProfile.tags ?? []), ...(seed1.profile.tags ?? [])])],
    };
  }

  function getClaimColor(wx, wy) {
    const { seed1, seed2, edgeness } = sampleClaim(wx, wy);

    if (edgeness > BORDER_T) {
      const dotGx = Math.round(wx / DOT_SPACING);
      const dotGy = Math.round(wy / DOT_SPACING);

      if ((dotGx + dotGy) % 2 === 0) {
        const dxd = wx - dotGx * DOT_SPACING;
        const dyd = wy - dotGy * DOT_SPACING;

        if (dxd * dxd + dyd * dyd < DOT_RADIUS_SQ) {
          const [r1, g1, b1] = seed1.neon;
          const [r2, g2, b2] = seed2 ? seed2.neon : seed1.neon;

          return [
            Math.min(255, Math.round(((r1 + r2) * 0.5) * DOT_BRIGHT)),
            Math.min(255, Math.round(((g1 + g2) * 0.5) * DOT_BRIGHT)),
            Math.min(255, Math.round(((b1 + b2) * 0.5) * DOT_BRIGHT)),
          ];
        }
      }
    }

    const [r, g, b] = seed1.neon;

    return [
      Math.round(r * FILL_BRIGHT),
      Math.round(g * FILL_BRIGHT),
      Math.round(b * FILL_BRIGHT),
    ];
  }

  function getClaimGraph({ minX, minY, maxX, maxY }) {
    const pad = 1;
    const minGi = Math.floor(minX / GRID_SIZE) - pad;
    const maxGi = Math.floor(maxX / GRID_SIZE) + pad;
    const minGj = Math.floor(minY / GRID_SIZE) - pad;
    const maxGj = Math.floor(maxY / GRID_SIZE) + pad;
    const nodes = [];
    const links = [];

    for (let gi = minGi; gi <= maxGi; gi += 1) {
      for (let gj = minGj; gj <= maxGj; gj += 1) {
        const seed = getSeed(gi, gj);
        nodes.push({
          id: seed.id,
          grid: seed.grid,
          x: seed.wx,
          y: seed.wy,
          resourceIntensity: seed.resourceIntensity,
        });

        addLink(seed, getSeed(gi + 1, gj));
        addLink(seed, getSeed(gi, gj + 1));
        if ((gi + gj) % 2 === 0) {
          addLink(seed, getSeed(gi + 1, gj + 1));
        } else {
          addLink(seed, getSeed(gi + 1, gj - 1));
        }
      }
    }

    return { nodes, links };

    function addLink(a, b) {
      links.push({
        from: a.id,
        to: b.id,
        x1: a.wx,
        y1: a.wy,
        x2: b.wx,
        y2: b.wy,
      });
    }
  }

  function getPlotNetwork({ minX, minY, maxX, maxY }) {
    const pad = 2;
    const minRow = Math.floor(minY / HEX_ROW_STEP) - pad;
    const maxRow = Math.floor(maxY / HEX_ROW_STEP) + pad;
    const minCol = Math.floor(minX / HEX_WIDTH) - pad;
    const maxCol = Math.floor(maxX / HEX_WIDTH) + pad;
    const verticesById = new Map();
    const edgesById = new Map();
    const plots = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const plot = getHexPlot(col, row);

        plots.push(plot);
        plot.vertices.forEach((vertex) => verticesById.set(vertex.id, vertex));
        for (let i = 0; i < plot.vertices.length; i += 1) {
          addEdge(plot, plot.vertices[i], plot.vertices[(i + 1) % plot.vertices.length]);
        }
      }
    }

    return {
      plots,
      vertices: [...verticesById.values()],
      edges: [...edgesById.values()],
    };

    function addEdge(plot, a, b) {
      const id = [a.id, b.id].sort().join("|");
      const existing = edgesById.get(id);
      if (existing) {
        existing.plotIds.push(plot.id);
        return;
      }

      edgesById.set(id, {
        id,
        a,
        b,
        plotIds: [plot.id],
      });
    }
  }

  function getHexPlot(col, row) {
    const rowOffset = Math.abs(row % 2) * HEX_WIDTH * 0.5;
    const cx = col * HEX_WIDTH + rowOffset;
    const cy = row * HEX_ROW_STEP;
    const vertices = [];

    for (let i = 0; i < 6; i += 1) {
      const angle = Math.PI / 6 + i * Math.PI / 3;
      vertices.push(getPlotVertex(
        cx + Math.cos(angle) * HEX_RADIUS,
        cy + Math.sin(angle) * HEX_RADIUS,
      ));
    }

    return {
      id: `plot-hex-${col}-${row}`,
      center: { x: cx, y: cy },
      vertices,
    };
  }

  function getPlot(col, row) {
    const plot = getHexPlot(col, row);
    const claim = getClaimAt(plot.center.x, plot.center.y);

    return {
      ...claim,
      id: plot.id,
      center: plot.center,
      vertices: plot.vertices,
      parcelKind: "plot",
      sourceClaimId: claim.id,
      sourceClaimName: claim.strongestZoneName,
    };
  }

  function getPlotVertex(rawX, rawY) {
    const key = `${Math.round(rawX / 8)},${Math.round(rawY / 8)}`;
    let vertex = plotVertexCache.get(key);
    if (vertex) return vertex;

    const seedX = Math.round(rawX / PLOT_EDGE_JITTER);
    const seedY = Math.round(rawY / PLOT_EDGE_JITTER);
    vertex = {
      id: `plot-vertex-${key}`,
      x: rawX + (noise(seedX + 7100, seedY - 7100, 1) - 0.5) * 2 * PLOT_EDGE_JITTER,
      y: rawY + (noise(seedX - 8300, seedY + 8300, 1) - 0.5) * 2 * PLOT_EDGE_JITTER,
    };
    plotVertexCache.set(key, vertex);
    return vertex;
  }

  return { getClaimAt, getClaimById, getPlotAt, getPlotById, getClaimOrPlotById, getClaimColor, getClaimGraph, getPlotNetwork };
}

function resolveNeon(profile) {
  const influence = Math.min(1, profile.influence * 1.6);
  const blend = Math.pow(influence, 0.5);
  const zc = profile.color;
  const oR = 20;
  const oG = 10;
  const oB = 40;

  if (!zc) return [oR, oG, oB];

  return [
    Math.round(oR + (zc[0] - oR) * blend),
    Math.round(oG + (zc[1] - oG) * blend),
    Math.round(oB + (zc[2] - oB) * blend),
  ];
}

function getResourceIntensity(profile, localNoise) {
  const resourcePressure = Math.max(
    profile.volatileBias ?? 0,
    profile.structuralBias ?? 0,
    profile.industrialBias ?? 0,
    profile.conductorBias ?? 0,
    profile.energyBias ?? 0,
    profile.advancedBias ?? 0,
    profile.strangeBias ?? 0,
    profile.redOreBias ?? 0,
    profile.blueOreBias ?? 0,
  );

  return clamp01(
    localNoise * 0.55
    + resourcePressure * 0.20
    + (profile.asteroidDensityMultiplier ?? 1) * 0.15
    + (profile.influence ?? 0) * 0.10,
  );
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function cloneRights(rights) {
  return Object.fromEntries(
    Object.entries(rights).map(([rightType, right]) => [rightType, { ...right }]),
  );
}
