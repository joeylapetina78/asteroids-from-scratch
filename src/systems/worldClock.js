// One clock for the whole simulation.
//
// WHY THIS EXISTS: the economy ran on EIGHT independent `setInterval(..., 1000)`
// timers, staggered by hand — sprc at +0ms, population at +125, procurement at
// +250, logistics at +375, mining at +500, towing at +625, fleet services at
// +750. The order those systems ran in was real and load-bearing, and it was
// written down nowhere except as offsets in `main.js`.
//
// That is the same hazard `extractionMarket` was built to remove, one level up.
// There, whichever mining company's `update()` ran first took first refusal on
// every order, and it read as business judgement when it was really call order.
// Here the call order is not even guaranteed: eight independent timers are
// eight independent things a throttled background tab can delay, so the
// sequence a system was written against can silently change while nobody is
// looking at the page.
//
// So: one timer, one declared order, run in full every tick.
//
// ERROR ISOLATION IS NOT OPTIONAL HERE. With eight timers, a system that threw
// killed only itself and the rest of the world carried on. Collapsing them into
// one loop would turn any single throw into a total simulation stop, which
// would be a strictly worse world — so every system runs inside its own guard
// and a failure is recorded against that system rather than propagated.
//
// ON PHASES: the honest position is that these managers are not yet phase-pure.
// Each one observes, decides and settles inside its own `update()`, so sorting
// them into OBSERVE/DECIDE/SETTLE today would be a label rather than a fact.
// The mechanism is here and works — systems sort by phase, then by registration
// order — but every system currently registers in one phase, which makes this
// tick byte-identical to the eight timers it replaces. Splitting the managers
// so the phases mean something is the next piece of work, and it can happen one
// manager at a time against this seam.

export const TICK_PHASE = Object.freeze({
  // Derive what is true this tick, before anybody acts on it.
  OBSERVE: "observe",
  // Commit: choose work, place orders, dispatch.
  DECIDE: "decide",
  // Outcomes land: deliveries, payments, completions.
  SETTLE: "settle",
});

const PHASE_ORDER = [TICK_PHASE.OBSERVE, TICK_PHASE.DECIDE, TICK_PHASE.SETTLE];

export const DEFAULT_TICK_MS = 1000;

export function createWorldClock({
  now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  onSystemError = null,
} = {}) {
  const systems = [];
  const metrics = {};
  let tickCount = 0;
  let skippedTicks = 0;
  let running = false;
  let handle = null;

  // `run` is called with `{ tick }`. `everyTicks` lets a system run less often
  // than the clock without needing a timer of its own — deliberately counted in
  // TICKS rather than milliseconds, so "less often" stays deterministic and
  // stays in step with everything else.
  function register(id, run, { phase = TICK_PHASE.DECIDE, everyTicks = 1 } = {}) {
    if (!id || typeof run !== "function") return;
    if (!PHASE_ORDER.includes(phase)) throw new Error(`[worldClock] unknown phase '${phase}' for system '${id}'`);
    if (systems.some((system) => system.id === id)) throw new Error(`[worldClock] system '${id}' is already registered`);
    systems.push({ id, run, phase, everyTicks: Math.max(1, Math.floor(everyTicks)), order: systems.length });
    metrics[id] = { runs: 0, totalMs: 0, lastMs: 0, maxMs: 0, averageMs: 0, errors: 0, lastError: null };
  }

  function unregister(id) {
    const index = systems.findIndex((system) => system.id === id);
    if (index >= 0) systems.splice(index, 1);
  }

  // Phase first, then the order they were registered in. Stable, and the same
  // every tick — which is the whole point.
  function scheduled() {
    return [...systems].sort((first, second) =>
      PHASE_ORDER.indexOf(first.phase) - PHASE_ORDER.indexOf(second.phase) || first.order - second.order);
  }

  function tick() {
    // A tick that overruns must not be re-entered. Eight timers could overlap
    // each other silently; one loop says so instead.
    if (running) {
      skippedTicks += 1;
      return { tick: tickCount, ran: [], skipped: true };
    }
    running = true;
    tickCount += 1;
    const ran = [];

    try {
      for (const system of scheduled()) {
        if (tickCount % system.everyTicks !== 0) continue;
        const metric = metrics[system.id];
        const startedAt = now();
        try {
          system.run({ tick: tickCount });
        } catch (error) {
          metric.errors += 1;
          metric.lastError = { message: error?.message ?? String(error), at: tickCount };
          // Reported, never rethrown: one broken system must not stop the world.
          if (onSystemError) onSystemError(system.id, error);
          else console.warn(`[worldClock] system '${system.id}' threw: ${error?.message ?? error}`);
        }
        const elapsedMs = now() - startedAt;
        metric.runs += 1;
        metric.totalMs += elapsedMs;
        metric.lastMs = elapsedMs;
        metric.maxMs = Math.max(metric.maxMs, elapsedMs);
        metric.averageMs = metric.totalMs / metric.runs;
        ran.push(system.id);
      }
    } finally {
      running = false;
    }

    return { tick: tickCount, ran, skipped: false };
  }

  function start({ intervalMs = DEFAULT_TICK_MS, setInterval: setIntervalFn = globalThis.setInterval } = {}) {
    if (handle != null) return handle;
    handle = setIntervalFn(tick, intervalMs);
    return handle;
  }

  function stop({ clearInterval: clearIntervalFn = globalThis.clearInterval } = {}) {
    if (handle == null) return;
    clearIntervalFn(handle);
    handle = null;
  }

  return {
    register,
    unregister,
    tick,
    start,
    stop,
    // The declared order, for anyone who wants to see it rather than infer it.
    getSchedule: () => scheduled().map(({ id, phase, everyTicks }) => ({ id, phase, everyTicks })),
    getMetrics: () => metrics,
    getStats: () => ({ ticks: tickCount, skippedTicks, systemCount: systems.length }),
  };
}
