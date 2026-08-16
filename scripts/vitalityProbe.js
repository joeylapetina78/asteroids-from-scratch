// Is the terrarium alive?
//
// WHY THIS EXISTS, AND WHY IT IS NOT A HEADLESS HARNESS. The obvious way to ask
// this question is to stand the economy up in Node and run it fast. That was
// tried, and it produced confident, coherent, completely wrong answers: mining
// workers are PHYSICAL — they fly to a rock, shoot it, collect what falls out
// and carry it home — and a harness that builds the institutions without the
// entities gets workers that report themselves busy and never move. Every number
// downstream then describes a world where nothing is ever mined. Zero deliveries
// reads as "the miners are capital-trapped"; empty shelves read as "demand is
// too high"; and the world's own diagnostics agree with all of it, because they
// are faithfully describing the broken harness.
//
// So this drives the REAL game. It is the same `Game` instance the player is
// looking at, updated through the same entry point the animation frame uses. The
// only things it changes are the ones that make an hour take a few seconds:
//
//   TIME IS VIRTUALISED. Almost every system reads `Date.now()` for deadlines,
//   demand intervals and cooldowns. Running the update loop fast without moving
//   the clock would give a world that physically flies around at high speed
//   while believing no time had passed. So `Date.now` is replaced by a counter
//   this advances by exactly the same step it advances the simulation.
//
//   THE CLOCK IS DRIVEN, NOT TIMED. `worldClock` normally fires on a
//   `setInterval`; here it is stopped and ticked in step, so institutional
//   decisions keep their real cadence relative to simulated seconds.
//
// Everything else — asteroids, tractor fields, pickups, freight, procurement,
// populations — is the live world untouched.
//
// MEASURED THROUGHPUT, AND THE HONEST LIMIT. The premise was that driving the
// loop directly would fast-forward the world. It does not, here: measured at
// roughly 0.26x real time in the preview pane — 157 simulated seconds in about
// ten wall minutes. A spot reading mid-chunk shows 2.9x, so the compute itself is
// faster than real time; the wall clock goes somewhere between chunks, and the
// tab appears to deprioritise this work heavily when it is not the focused
// surface. Simulating an hour would take hours.
//
// The cost is dominated by per-frame work over ~2,500 asteroids and ~400
// lifeforms, almost none of which affects whether a settlement eats. The obvious
// speedup is to skip the entity systems that do not feed the economy — but that
// is EXACTLY the compromise that produced the earlier confidently-wrong answers,
// so it may only be done by keeping the workers and the rocks they mine, and
// then proving the reduced world reports the same throughput as a full-fidelity
// run over the same span. Until that is done this probe is faithful but slow,
// which is the right way round: a slow instrument wastes time, a fast wrong one
// wastes decisions.
//
// Usage from the console:
//   await measureVitality({ minutes: 60 })

(function installVitalityProbe(global) {
  // The step is a CALIBRATED choice, not a convenience. Per-frame cost is
  // dominated by fixed work over a few thousand asteroids and a few hundred
  // lifeforms, so it barely changes with the step — which means a coarser step
  // buys close to linear speedup. It also risks workers stepping straight past
  // the rock or the pickup they were aiming at, so `calibrateVitality` exists to
  // check that economic throughput at a coarse step still matches the fine one
  // before any number from it is believed.
  const DEFAULT_STEP_SECONDS = 1 / 10;
  const CLOCK_TICK_MS = 1000;
  // Yield occasionally so a long run does not wedge the tab. Deliberately NOT
  // `setTimeout`: browsers clamp timers to about a second in a tab that is not
  // focused, which turned thirty polite yields into thirty seconds of doing
  // nothing and made the probe run SLOWER than the world it was measuring — the
  // virtual clock fell 53 seconds behind real time. A MessageChannel task is not
  // clamped, so this stays a yield rather than a nap.
  const FRAMES_PER_CHUNK = 600;
  const channel = typeof MessageChannel === "function" ? new MessageChannel() : null;
  function yieldToBrowser() {
    if (!channel) return Promise.resolve();
    return new Promise((resolve) => {
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(0);
    });
  }

  function settlements(state) {
    return Object.values(state.logistics?.institutions ?? {})
      .filter((institution) => institution.archetypeId === "settlement");
  }

  // What a settlement looks like from the outside, in the terms that decide
  // whether it is living or dying.
  function readSettlement(state, institution) {
    const population = Object.values(state.population?.populations ?? {})
      .find((record) => record.hubInstitutionId === institution.id);
    const needs = Object.values(population?.needs ?? {});

    return {
      id: institution.id,
      size: population?.size ?? null,
      shelf: Object.values(institution.inventories ?? {}).reduce((sum, units) => sum + Math.max(0, units), 0),
      cash: Math.round(institution.accounts?.operating?.balance ?? 0),
      householdCash: Math.round(population?.householdCash ?? 0),
      bought: needs.reduce((sum, need) => sum + (need.purchased ?? 0), 0),
      backlog: needs.reduce((sum, need) => sum + (need.backlog ?? 0), 0),
      debt: Math.round(population?.emergencyDebt ?? 0),
    };
  }

  function snapshot(game) {
    const state = game.state;
    return {
      settlements: settlements(state).map((institution) => readSettlement(state, institution)),
      miners: Object.values(state.miningOperations ?? {}).map((operation) => ({
        id: operation.institution?.id,
        cash: Math.round(operation.institution?.accounts?.operating?.balance ?? 0),
        ships: Object.keys(operation.ships ?? {}).length,
      })),
      shipments: Object.keys(state.logistics?.shipments ?? {}).length,
    };
  }

  global.measureVitality = async function measureVitality({ minutes = 30, report = 6, stepSeconds = DEFAULT_STEP_SECONDS } = {}) {
    const asteroids = global.__asteroids;
    const game = asteroids?.game ?? asteroids;
    const clock = asteroids?.clock;
    if (!game?.update) throw new Error("no live game to measure");

    const steps = Math.round((minutes * 60) / stepSeconds);
    const reportEvery = Math.max(1, Math.floor(steps / report));

    // ── Take over time itself ──
    const realNow = Date.now;
    let virtualNow = realNow.call(Date);
    Date.now = () => virtualNow;
    clock?.stop?.();

    const started = snapshot(game);
    const trace = [];
    let clockDebtMs = 0;
    let frameErrors = 0;

    try {
      for (let step = 0; step < steps; step += 1) {
        virtualNow += stepSeconds * 1000;
        clockDebtMs += stepSeconds * 1000;

        try {
          game.update(stepSeconds);
        } catch (error) {
          frameErrors += 1;
          if (frameErrors < 3) console.warn("[vitality] frame error", error);
        }

        while (clockDebtMs >= CLOCK_TICK_MS) {
          clockDebtMs -= CLOCK_TICK_MS;
          clock?.tick?.();
        }

        // Hand the browser back a slice so the tab stays responsive.
        if (step % FRAMES_PER_CHUNK === 0) await yieldToBrowser();

        if (step % reportEvery === 0) {
          global.__vitalityProgress = { step, steps, percent: Math.round((step / steps) * 100) };
          const now = snapshot(game);
          trace.push({
            minute: Math.round((step * stepSeconds) / 60),
            bought: now.settlements.reduce((sum, s) => sum + s.bought, 0),
            backlog: now.settlements.reduce((sum, s) => sum + s.backlog, 0),
            shelves: Math.round(now.settlements.reduce((sum, s) => sum + s.shelf, 0)),
            shipments: now.shipments,
          });
        }
      }
    } finally {
      // Always give time back, even if the world threw.
      Date.now = realNow;
      clock?.start?.();
    }

    const ended = snapshot(game);
    const alive = ended.settlements.map((after) => {
      const before = started.settlements.find((entry) => entry.id === after.id) ?? after;
      return {
        hub: after.id,
        size: after.size,
        bought: after.bought - before.bought,
        backlog: after.backlog,
        shelf: Math.round(after.shelf),
        hubCash: after.cash - before.cash,
        debt: after.debt,
      };
    }).sort((first, second) => second.bought - first.bought);

    const totalBought = alive.reduce((sum, row) => sum + row.bought, 0);
    const totalBacklog = alive.reduce((sum, row) => sum + row.backlog, 0);

    return {
      simulatedMinutes: minutes,
      stepSeconds,
      frameErrors,
      verdict: {
        // Survives: anyone buying at all. Thrives: somewhere keeping up.
        thriving: alive.filter((row) => row.bought > 0 && row.backlog === 0).map((row) => row.hub),
        surviving: alive.filter((row) => row.bought > 0 && row.backlog > 0).map((row) => row.hub),
        starving: alive.filter((row) => row.bought === 0).map((row) => row.hub),
        served: totalBought + totalBacklog > 0
          ? Math.round((totalBought / (totalBought + totalBacklog)) * 100)
          : null,
      },
      settlements: alive,
      miners: ended.miners,
      shipments: ended.shipments,
      trace,
    };
  };
})(window);

// Does a coarse step still describe the same economy as a fine one?
//
// A step large enough to be fast is also large enough for a worker to jump past
// the rock it was aiming at, and that would show up as a quietly poorer world
// rather than as an error. This runs the same span at several steps and reports
// what each one thinks happened. Trust the coarsest step that still agrees with
// the finest — and if none do, the instrument is only honest at 1/30.
//
// KNOWN FLAW, STATED SO IT IS NOT MISREAD. These runs are SEQUENTIAL on one
// world: each starts from wherever the last one left off, so a difference
// between steps confounds step size with the world simply having moved on. The
// first attempt also ran only two simulated minutes, where the whole world makes
// single-digit purchases — far too small a signal to separate from noise.
// A trustworthy calibration needs each step measured from an IDENTICAL starting
// state (a page reload between runs) over a span long enough for purchases to be
// counted in dozens. Until that is done, treat any step coarser than 1/30 as
// unvalidated.
(function installCalibration(global) {
  global.calibrateVitality = async function calibrateVitality({ minutes = 3, steps = [1 / 30, 1 / 10, 1 / 5] } = {}) {
    const rows = [];
    for (const stepSeconds of steps) {
      const started = performance.now();
      const result = await global.measureVitality({ minutes, report: 1, stepSeconds });
      rows.push({
        step: `1/${Math.round(1 / stepSeconds)}`,
        wallSeconds: Math.round((performance.now() - started) / 1000),
        bought: result.settlements.reduce((sum, row) => sum + row.bought, 0),
        backlog: result.settlements.reduce((sum, row) => sum + row.backlog, 0),
        shipments: result.shipments,
        frameErrors: result.frameErrors,
      });
    }
    return rows;
  };
})(window);
