import assert from "node:assert/strict";
import test from "node:test";

import { createClaimField } from "../src/systems/claimField.js";

// The plot network's one structural promise: neighbouring hexes SHARE a corner,
// and therefore share the edge between them.
//
// When they do not, an edge that is interior to a region records only one plot,
// and everything downstream that reads "one plot on this edge" as "this is the
// outer boundary" draws a line through the middle of a solid region. The rights
// overlay did exactly that — stroking plot sides inside Yard Exchange's own
// jurisdiction — because `HEX_RADIUS * sin(30 degrees)` is 180 and 180 / 8 is a
// rounding tie, so the two hexes touching that corner disagreed about its id.

function networkFor(bounds) {
  return createClaimField().getPlotNetwork(bounds);
}

const VIEW = { minX: -2000, minY: -1500, maxX: 2000, maxY: 1500 };

test("no two edges describe the same piece of ground", () => {
  const network = networkFor(VIEW);
  const byGeometry = new Map();
  network.edges.forEach((edge) => {
    const key = [[Math.round(edge.a.x), Math.round(edge.a.y)], [Math.round(edge.b.x), Math.round(edge.b.y)]]
      .sort((first, second) => first[0] - second[0] || first[1] - second[1])
      .map((point) => point.join(","))
      .join("|");
    byGeometry.set(key, (byGeometry.get(key) ?? 0) + 1);
  });
  const duplicated = [...byGeometry.entries()].filter(([, count]) => count > 1);
  assert.deepEqual(duplicated, [],
    `every edge is recorded once; duplicates mean two hexes disagreed about a shared corner`);
});

test("an edge between two known plots knows about both of them", () => {
  // The perimeter of the queried patch legitimately has one-plot edges — their
  // neighbour was never generated. Everything inside must have two.
  const network = networkFor(VIEW);
  const plotIds = new Set(network.plots.map((plot) => plot.id));
  const centreById = new Map(network.plots.map((plot) => [plot.id, plot.center]));

  const interior = network.plots.filter((plot) => {
    const { x, y } = centreById.get(plot.id);
    // A plot is interior if it sits well inside the queried bounds.
    return x > VIEW.minX + 800 && x < VIEW.maxX - 800 && y > VIEW.minY + 800 && y < VIEW.maxY - 800;
  });
  assert.ok(interior.length > 0, "the fixture contains interior plots");

  const lonely = [];
  network.edges.forEach((edge) => {
    if (edge.plotIds.length >= 2) return;
    const [onlyPlot] = edge.plotIds;
    if (!plotIds.has(onlyPlot)) return;
    if (interior.some((plot) => plot.id === onlyPlot)) lonely.push({ edge: edge.id, plot: onlyPlot });
  });
  assert.deepEqual(lonely, [],
    "an interior plot's every edge is shared with the neighbour across it");
});

test("hexes that touch a corner all resolve it to one vertex", () => {
  const network = networkFor(VIEW);
  const byPosition = new Map();
  network.plots.forEach((plot) => {
    plot.vertices.forEach((vertex) => {
      const key = `${Math.round(vertex.x)},${Math.round(vertex.y)}`;
      const seen = byPosition.get(key);
      if (seen && seen !== vertex.id) {
        byPosition.set(key, `CONFLICT:${seen}/${vertex.id}`);
      } else if (!seen) {
        byPosition.set(key, vertex.id);
      }
    });
  });
  const conflicts = [...byPosition.entries()].filter(([, id]) => String(id).startsWith("CONFLICT"));
  assert.deepEqual(conflicts, [], "one place on the map is one vertex");
});
