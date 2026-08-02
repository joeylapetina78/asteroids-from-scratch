// Minimal SVG chart primitives for the observatory's Economy tab.
//
// No chart library, for the same reason there is no game engine here: a
// dependency would decide what the data is allowed to look like. These draw
// exactly three shapes — a line, a stacked band, a bar — over the sample series
// the economy sampler produces, and nothing else.
//
// Three conventions the charts rely on and the callers must respect:
//
//   * A `null` value is a GAP, not a zero. A hub that did not exist yet, or a
//     rate with no previous sample to difference against, must not draw a line
//     down to the floor — that reads as a collapse that never happened.
//   * Charts are sized in a fixed viewBox and stretched by CSS, so one set of
//     coordinates works at any pane width.
//   * Colour is assigned per SERIES KEY and is stable across renders, so a hub
//     keeps its colour when another one appears or drops out.

const SVG_NS = "http://www.w3.org/2000/svg";

// Sized close to the real card width so uniform scaling keeps the axis type
// legible. Stretching a wider viewBox to fit (preserveAspectRatio="none") would
// distort every glyph, and shrinking a much wider one makes 9px text unreadable.
const VIEW_WIDTH = 420;
const DEFAULT_VIEW_HEIGHT = 170;
const PADDING = Object.freeze({ top: 12, right: 10, bottom: 18, left: 46 });

// Distinct at small sizes on a near-black background, and distinguishable
// without relying on hue alone being read precisely.
const PALETTE = Object.freeze([
  "#73d2ff", "#ffc46b", "#8ce99a", "#ff8f73", "#c792ff",
  "#4fd8c4", "#ffd9f0", "#a3b8ff", "#d8c34f", "#ff6b9d",
  "#6bd4ff", "#b5e853",
]);

// Fixed colours for things whose identity is already established elsewhere in
// the UI, so the charts do not invent a second visual language for them.
const NAMED_COLORS = Object.freeze({
  structural: "#ff9b6b",
  industrial: "#d8b24f",
  volatile: "#8ecfff",
  conductor: "#c792ff",
  populations: "#8ce99a",
  institutions: "#73d2ff",
  player: "#ffc46b",
  created: "#8ce99a",
  burned: "#ff8f73",
  residual: "#c792ff",
});

export function colorForKey(key, index = null) {
  if (NAMED_COLORS[key]) return NAMED_COLORS[key];
  if (index !== null) return PALETTE[index % PALETTE.length];
  let hash = 0;
  for (let position = 0; position < key.length; position += 1) {
    hash = (hash * 31 + key.charCodeAt(position)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function formatCredits(value) {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${sign}${(magnitude / 1_000_000).toFixed(magnitude >= 10_000_000 ? 0 : 1)}M`;
  if (magnitude >= 1_000) return `${sign}${(magnitude / 1_000).toFixed(magnitude >= 10_000 ? 0 : 1)}k`;
  return `${sign}${Math.round(magnitude)}`;
}

export function formatUnits(value) {
  if (value === null || !Number.isFinite(value)) return "—";
  return Math.abs(value) >= 1000 ? formatCredits(value) : String(Math.round(value * 10) / 10);
}

export function formatRate(value) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${formatCredits(value)}/min`;
}

export function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 90 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
}

// ── Element helpers ─────────────────────────────────────────────────────────

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    node.setAttribute(key, String(value));
  });
  return node;
}

function htmlElement(name, className, text = null) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

// ── Axis maths ──────────────────────────────────────────────────────────────

// Round tick steps so a reader can do arithmetic on the gridlines without
// squinting: 1, 2, 2.5 or 5 times a power of ten.
function niceStep(range, targetTicks) {
  if (!(range > 0)) return 1;
  const rough = range / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function computeBounds(series, { includeZero = true } = {}) {
  let min = Infinity;
  let max = -Infinity;
  series.forEach((entry) => {
    entry.points.forEach((point) => {
      if (point.v === null) return;
      if (point.v < min) min = point.v;
      if (point.v > max) max = point.v;
    });
  });
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    // A perfectly flat series still deserves a readable band rather than a
    // divide-by-zero or a line pinned to an edge.
    const padding = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= padding;
    max += padding;
  }
  return { min, max };
}

// ── Line chart ──────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.subtitle]
 * @param {Array<{key:string,label:string,color?:string,points:Array<{t:number,v:number|null}>,dashed?:boolean}>} options.series
 * @param {(value:number|null)=>string} [options.format]
 * @param {boolean} [options.includeZero] anchor the axis at zero
 * @param {number} [options.height]
 * @param {string} [options.empty] message when there is nothing to draw
 */
export function createLineChart({
  title,
  subtitle = null,
  series = [],
  format = formatCredits,
  includeZero = true,
  height = DEFAULT_VIEW_HEIGHT,
  empty = "No samples yet.",
  note = null,
}) {
  const card = htmlElement("figure", "econ-chart");
  card.append(chartHeader(title, subtitle));

  const drawable = series.filter((entry) => entry.points.some((point) => point.v !== null));
  const bounds = computeBounds(drawable, { includeZero });
  if (!bounds || drawable.length === 0) {
    card.append(htmlElement("p", "econ-chart-empty", empty));
    return card;
  }

  const times = drawable.flatMap((entry) => entry.points.map((point) => point.t));
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const xOf = (t) => PADDING.left + (tMax === tMin ? plotWidth : ((t - tMin) / (tMax - tMin)) * plotWidth);
  const yOf = (v) => PADDING.top + plotHeight - ((v - bounds.min) / (bounds.max - bounds.min)) * plotHeight;

  const svg = svgElement("svg", {
    viewBox: `0 0 ${VIEW_WIDTH} ${height}`,
    class: "econ-svg",
    role: "img",
    "aria-label": title,
  });

  // Gridlines and value axis.
  const step = niceStep(bounds.max - bounds.min, 4);
  for (let value = Math.ceil(bounds.min / step) * step; value <= bounds.max + 1e-9; value += step) {
    const y = yOf(value);
    svg.append(svgElement("line", {
      x1: PADDING.left, x2: VIEW_WIDTH - PADDING.right, y1: y, y2: y,
      class: Math.abs(value) < 1e-9 ? "econ-gridline econ-gridline-zero" : "econ-gridline",
    }));
    const label = svgElement("text", { x: PADDING.left - 6, y: y + 3, class: "econ-axis-label", "text-anchor": "end" });
    label.textContent = format(value);
    svg.append(label);
  }

  // Time axis: relative, because absolute clock times mean nothing in a session.
  [0, 0.5, 1].forEach((fraction) => {
    const t = tMin + (tMax - tMin) * fraction;
    const label = svgElement("text", {
      x: xOf(t), y: height - 6, class: "econ-axis-label",
      "text-anchor": fraction === 0 ? "start" : fraction === 1 ? "end" : "middle",
    });
    label.textContent = fraction === 1 ? "now" : `-${formatAge(tMax - t)}`;
    svg.append(label);
  });

  drawable.forEach((entry, index) => {
    const color = entry.color ?? colorForKey(entry.key, index);
    // Split on gaps so a missing sample breaks the line instead of drawing a
    // straight segment across a period nothing was known.
    let path = "";
    let penDown = false;
    entry.points.forEach((point) => {
      if (point.v === null) { penDown = false; return; }
      path += `${penDown ? "L" : "M"}${xOf(point.t).toFixed(1)} ${yOf(point.v).toFixed(1)}`;
      penDown = true;
    });
    if (!path) return;
    const line = svgElement("path", {
      d: path, fill: "none", stroke: color, "stroke-width": 1.6,
      "stroke-linejoin": "round", "stroke-linecap": "round",
      "stroke-dasharray": entry.dashed ? "4 3" : null,
      class: "econ-line",
    });
    const tooltip = svgElement("title");
    tooltip.textContent = entry.label;
    line.append(tooltip);
    svg.append(line);
  });

  card.append(svg);
  card.append(legend(drawable, format));
  if (note) card.append(htmlElement("figcaption", "econ-chart-note", note));
  return card;
}

// ── Stacked area ────────────────────────────────────────────────────────────

// For quantities that genuinely sum to a meaningful total — cash by holder,
// material by family. Anything that does not sum should be a line chart; a
// stack of unrelated series implies an addition nobody performed.
export function createStackedAreaChart({
  title,
  subtitle = null,
  series = [],
  format = formatCredits,
  height = DEFAULT_VIEW_HEIGHT,
  empty = "No samples yet.",
  note = null,
}) {
  const card = htmlElement("figure", "econ-chart");
  card.append(chartHeader(title, subtitle));

  const drawable = series.filter((entry) => entry.points.some((point) => point.v !== null));
  if (drawable.length === 0) {
    card.append(htmlElement("p", "econ-chart-empty", empty));
    return card;
  }

  // Stack on the union of timestamps; a series missing a sample contributes
  // zero to the stack at that instant, which for a stock is what "no holdings"
  // means.
  const times = [...new Set(drawable.flatMap((entry) => entry.points.map((point) => point.t)))].sort((a, b) => a - b);
  const valueAt = (entry) => {
    const lookup = new Map(entry.points.map((point) => [point.t, point.v]));
    return times.map((t) => lookup.get(t) ?? 0);
  };
  const columns = drawable.map(valueAt);
  const totals = times.map((_, index) => columns.reduce((sum, column) => sum + (column[index] ?? 0), 0));
  const max = Math.max(...totals, 1);

  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const xOf = (t) => PADDING.left + (tMax === tMin ? plotWidth : ((t - tMin) / (tMax - tMin)) * plotWidth);
  const yOf = (v) => PADDING.top + plotHeight - (v / max) * plotHeight;

  const svg = svgElement("svg", {
    viewBox: `0 0 ${VIEW_WIDTH} ${height}`, class: "econ-svg", role: "img", "aria-label": title,
  });

  const step = niceStep(max, 4);
  for (let value = 0; value <= max + 1e-9; value += step) {
    const y = yOf(value);
    svg.append(svgElement("line", { x1: PADDING.left, x2: VIEW_WIDTH - PADDING.right, y1: y, y2: y, class: "econ-gridline" }));
    const label = svgElement("text", { x: PADDING.left - 6, y: y + 3, class: "econ-axis-label", "text-anchor": "end" });
    label.textContent = format(value);
    svg.append(label);
  }

  const baseline = new Array(times.length).fill(0);
  drawable.forEach((entry, index) => {
    const column = columns[index];
    const color = entry.color ?? colorForKey(entry.key, index);
    const upper = times.map((t, position) => `${xOf(t).toFixed(1)} ${yOf(baseline[position] + column[position]).toFixed(1)}`);
    const lower = times.map((t, position) => `${xOf(t).toFixed(1)} ${yOf(baseline[position]).toFixed(1)}`).reverse();
    const band = svgElement("path", {
      d: `M${upper.join("L")}L${lower.join("L")}Z`,
      fill: color, "fill-opacity": 0.45, stroke: color, "stroke-width": 1, class: "econ-band",
    });
    const tooltip = svgElement("title");
    tooltip.textContent = entry.label;
    band.append(tooltip);
    svg.append(band);
    times.forEach((_, position) => { baseline[position] += column[position]; });
  });

  [0, 1].forEach((fraction) => {
    const t = tMin + (tMax - tMin) * fraction;
    const label = svgElement("text", {
      x: xOf(t), y: height - 6, class: "econ-axis-label",
      "text-anchor": fraction === 0 ? "start" : "end",
    });
    label.textContent = fraction === 1 ? "now" : `-${formatAge(tMax - t)}`;
    svg.append(label);
  });

  card.append(svg);
  card.append(legend(drawable, format));
  if (note) card.append(htmlElement("figcaption", "econ-chart-note", note));
  return card;
}

// ── Bar chart ───────────────────────────────────────────────────────────────

// Horizontal bars, because the labels are place names and reading them
// vertically at this size is not a choice anyone would defend. Handles negative
// values (an institution can be in the red) by drawing from a zero line.
export function createBarChart({
  title,
  subtitle = null,
  bars = [],
  format = formatCredits,
  empty = "Nothing to show.",
  note = null,
}) {
  const card = htmlElement("figure", "econ-chart econ-chart-bars");
  card.append(chartHeader(title, subtitle));
  if (bars.length === 0) {
    card.append(htmlElement("p", "econ-chart-empty", empty));
    return card;
  }

  // Markers share the bars' scale, so one that sits past the longest bar still
  // lands inside the track rather than off the end of it.
  const values = bars.map((bar) => bar.value ?? 0);
  const markers = bars.map((bar) => (Number.isFinite(bar.marker) ? bar.marker : 0));
  const max = Math.max(...values, ...markers, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const zeroFraction = (0 - min) / span;

  const list = htmlElement("div", "econ-bar-list");
  bars.forEach((bar, index) => {
    const row = htmlElement("div", "econ-bar-row");
    row.append(htmlElement("span", "econ-bar-label", bar.label));

    const track = htmlElement("div", "econ-bar-track");
    const value = bar.value ?? 0;
    const fill = htmlElement("div", value < 0 ? "econ-bar-fill is-negative" : "econ-bar-fill");
    const magnitudeFraction = Math.abs(value) / span;
    fill.style.width = `${(magnitudeFraction * 100).toFixed(2)}%`;
    fill.style.left = value < 0
      ? `${((zeroFraction - magnitudeFraction) * 100).toFixed(2)}%`
      : `${(zeroFraction * 100).toFixed(2)}%`;
    fill.style.background = bar.color ?? colorForKey(bar.key ?? bar.label, index);
    track.append(fill);

    // A target line, for the bars where "enough" is a defined number rather
    // than a comparison with the other bars.
    if (Number.isFinite(bar.marker)) {
      const target = htmlElement("div", "econ-bar-marker");
      target.style.left = `${(((bar.marker - min) / span) * 100).toFixed(2)}%`;
      target.title = `target ${format(bar.marker)}`;
      track.append(target);
    }
    row.append(track);
    row.append(htmlElement("span", "econ-bar-value", bar.note ? `${format(value)} · ${bar.note}` : format(value)));
    list.append(row);
  });

  card.append(list);
  if (note) card.append(htmlElement("figcaption", "econ-chart-note", note));
  return card;
}

// Several measures per place, side by side — inventory by family, say. Each
// group is one place, each key one measure.
export function createGroupedBarChart({
  title,
  subtitle = null,
  groups = [],
  keys = [],
  format = formatUnits,
  empty = "Nothing to show.",
  note = null,
}) {
  const card = htmlElement("figure", "econ-chart econ-chart-bars");
  card.append(chartHeader(title, subtitle));
  if (groups.length === 0 || keys.length === 0) {
    card.append(htmlElement("p", "econ-chart-empty", empty));
    return card;
  }

  const max = Math.max(1, ...groups.flatMap((group) => keys.map((key) => group.values[key.key] ?? 0)));
  const list = htmlElement("div", "econ-bar-list");
  groups.forEach((group) => {
    const block = htmlElement("div", "econ-bar-group");
    block.append(htmlElement("div", "econ-bar-group-label", group.label));
    keys.forEach((key, index) => {
      const value = group.values[key.key] ?? 0;
      const row = htmlElement("div", "econ-bar-row");
      row.append(htmlElement("span", "econ-bar-label is-sub", key.label));
      const track = htmlElement("div", "econ-bar-track");
      const fill = htmlElement("div", "econ-bar-fill");
      fill.style.left = "0%";
      fill.style.width = `${((Math.max(0, value) / max) * 100).toFixed(2)}%`;
      fill.style.background = key.color ?? colorForKey(key.key, index);
      track.append(fill);
      const target = group.markers?.[key.key];
      if (Number.isFinite(target) && target > 0) {
        const line = htmlElement("div", "econ-bar-marker");
        line.style.left = `${((Math.min(target, max) / max) * 100).toFixed(2)}%`;
        line.title = `target ${format(target)}`;
        track.append(line);
      }
      row.append(track);
      row.append(htmlElement("span", "econ-bar-value", Number.isFinite(target)
        ? `${format(value)} / ${format(target)}`
        : format(value)));
      block.append(row);
    });
    list.append(block);
  });

  card.append(list);
  if (note) card.append(htmlElement("figcaption", "econ-chart-note", note));
  return card;
}

// ── Shared parts ────────────────────────────────────────────────────────────

function chartHeader(title, subtitle) {
  const head = htmlElement("figcaption", "econ-chart-head");
  head.append(htmlElement("strong", null, title));
  if (subtitle) head.append(htmlElement("span", "econ-chart-sub", subtitle));
  return head;
}

// The legend carries each series' CURRENT value, because a colour swatch alone
// makes the reader hunt for the right line to answer "what is it now".
function legend(series, format) {
  const wrap = htmlElement("div", "econ-legend");
  series.forEach((entry, index) => {
    const item = htmlElement("span", "econ-legend-item");
    const swatch = htmlElement("i", "econ-swatch");
    swatch.style.background = entry.color ?? colorForKey(entry.key, index);
    item.append(swatch);
    item.append(htmlElement("span", "econ-legend-label", entry.label));
    const last = [...entry.points].reverse().find((point) => point.v !== null);
    item.append(htmlElement("b", "econ-legend-value", format(last ? last.v : null)));
    wrap.append(item);
  });
  return wrap;
}

// A single headline number with its trend, for the row of tent poles above the
// charts. The sparkline is deliberately unlabelled: it is shape, not reading.
export function createStatTile({ label, value, delta = null, points = [], format = formatCredits, hint = null }) {
  const tile = htmlElement("div", "econ-tile");
  tile.append(htmlElement("span", "econ-tile-label", label));
  tile.append(htmlElement("strong", "econ-tile-value", format(value)));

  if (delta !== null && Number.isFinite(delta)) {
    const direction = delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat";
    const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
    tile.append(htmlElement("span", `econ-tile-delta ${direction}`, `${arrow} ${format(Math.abs(delta))}`));
  }

  const values = points.filter((point) => point.v !== null);
  if (values.length >= 2) {
    const min = Math.min(...values.map((point) => point.v));
    const max = Math.max(...values.map((point) => point.v));
    const span = max - min || 1;
    const path = values.map((point, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 20 - ((point.v - min) / span) * 18 - 1;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join("");
    const svg = svgElement("svg", { viewBox: "0 0 100 20", class: "econ-spark", preserveAspectRatio: "none" });
    svg.append(svgElement("path", { d: path, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
    tile.append(svg);
  }

  if (hint) tile.append(htmlElement("span", "econ-tile-hint", hint));
  return tile;
}
