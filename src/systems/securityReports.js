// The distress channel: where the economy reports being attacked so security
// can respond.
//
// A report is a live FACT about a place under threat, not an order. Patrols
// read it to decide where to go, the observatory can surface it, and the same
// set answers "is anyone calling for help right now?". Reports are keyed by
// threat so repeated hits from one gate or one raider coalesce into a single
// strengthening report instead of a flood.
//
// The channel is deliberately BLOCKABLE. Every report is filed on a named
// channel, and `jamSecurityChannel` marks a region where reports do not
// propagate — so a future raider can cut a hub off from help by jamming its
// call before it reaches a patrol. Nothing jams yet; the hook is here, inert,
// so the reporting side is built against it from the start rather than
// retrofitted onto an assumption that the call always gets through.
//
// Lives on `state.security`, not in module scope: a bare specifier and a
// `?v=`-suffixed one are different module instances, so a module-level store
// would fork between the game and the tests. Same rule as the other registries.

const REPORT_TTL_MS = 30_000;            // a report goes stale if nothing refreshes it
const SEVERITY_BY_KIND = Object.freeze({ gate: 0.7, raid: 0.5, distress: 0.4 });

export function ensureSecurityReports(state) {
  state.security ??= { reports: {}, jams: [], nextId: 1 };
  state.security.reports ??= {};
  state.security.jams ??= [];
  state.security.nextId ??= 1;
  return state.security;
}

// File or refresh a report. A second hit from the same threat strengthens the
// existing report rather than opening a new one, so a gate under sustained
// assault reads as one escalating call, not fifty.
export function fileAttackReport(state, { threatId = null, position, kind = "raid", severity = null, reporterId = null, siteId = null, at = Date.now() } = {}) {
  if (!position) return null;
  const security = ensureSecurityReports(state);
  if (isPositionJammed(security, position, at)) {
    // The call never made it out. Recorded so the silence is legible rather
    // than looking like nothing happened.
    state.ledger?.recordEvent("security.reportJammed", {
      threatId, kind, reporterId, x: Math.round(position.x), y: Math.round(position.y),
    }, { visible: false });
    return null;
  }
  const key = threatId ?? `loc:${Math.round(position.x)}:${Math.round(position.y)}`;
  const sev = clamp01(severity ?? SEVERITY_BY_KIND[kind] ?? 0.5);
  const existing = security.reports[key];
  if (existing) {
    existing.lastSeenAt = at;
    existing.expiresAt = at + REPORT_TTL_MS;
    existing.hits = (existing.hits ?? 1) + 1;
    existing.severity = Math.max(existing.severity, sev);
    existing.position = { x: position.x, y: position.y };
    if (siteId && !existing.siteId) existing.siteId = siteId;
    return existing;
  }
  const report = {
    id: `report:${security.nextId++}`, key, threatId,
    position: { x: position.x, y: position.y }, kind, severity: sev,
    reporterId, siteId, channel: "open", hits: 1,
    reportedAt: at, lastSeenAt: at, expiresAt: at + REPORT_TTL_MS,
  };
  security.reports[key] = report;
  state.ledger?.recordEvent("security.attackReported", {
    reportId: report.id, threatId, kind, reporterId, siteId,
    severity: sev, x: Math.round(position.x), y: Math.round(position.y),
  }, { visible: true });
  return report;
}

// The threat is dealt with; drop every report it raised.
export function resolveAttackReport(state, threatId, { at = Date.now() } = {}) {
  const security = ensureSecurityReports(state);
  let removed = 0;
  Object.entries(security.reports).forEach(([key, report]) => {
    if (report.threatId === threatId || key === threatId) {
      delete security.reports[key];
      removed += 1;
    }
  });
  return removed;
}

// Every live report, expiring stale ones as we read. A report only stays alive
// while its threat keeps refreshing it; a gate that was quietly cleared by
// something we did not observe still ages out on its own.
export function listActiveAttackReports(state, at = Date.now()) {
  const security = ensureSecurityReports(state);
  Object.entries(security.reports).forEach(([key, report]) => {
    if (report.expiresAt <= at) delete security.reports[key];
  });
  return Object.values(security.reports);
}

// The nearest report worth answering within `range` of a point — what a patrol
// asks to decide where to go. Ranked by severity first, then proximity, so a
// serious gate a little further out still outranks a mild raid underfoot.
export function nearestActiveReport(state, position, range = Infinity, at = Date.now()) {
  let best = null;
  let bestScore = -Infinity;
  listActiveAttackReports(state, at).forEach((report) => {
    const distance = Math.hypot(report.position.x - position.x, report.position.y - position.y);
    if (distance > range) return;
    const score = report.severity * 4000 - distance;
    if (score > bestScore) { bestScore = score; best = { report, distance }; }
  });
  return best;
}

// ── Jamming: the raider hook, inert today ─────────────────────────────────
//
// A jam is a region and a lifetime. While it is live, reports filed inside it
// never propagate. No raider raises one yet — this exists so `fileAttackReport`
// already consults it, and the day a pirate learns to jam a hub's call for
// help, the reporting side does not have to change.

export function jamSecurityChannel(state, { position, radius, expiresAt }) {
  if (!position || !(radius > 0)) return null;
  const security = ensureSecurityReports(state);
  const jam = { position: { x: position.x, y: position.y }, radius, expiresAt };
  security.jams.push(jam);
  return jam;
}

export function isChannelJammedAt(state, position, at = Date.now()) {
  return isPositionJammed(ensureSecurityReports(state), position, at);
}

function isPositionJammed(security, position, at) {
  security.jams = security.jams.filter((jam) => jam.expiresAt > at);
  return security.jams.some((jam) => Math.hypot(jam.position.x - position.x, jam.position.y - position.y) <= jam.radius);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
