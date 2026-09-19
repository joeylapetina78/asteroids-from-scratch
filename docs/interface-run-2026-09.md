# The interface run — September 2026 (IN PROGRESS)

Handoff note for whoever picks this up next, human or AI. This run is a
sequence of cockpit/interface changes made between 2026-09-15 and 2026-09-19
on branch `campaign-mode-and-cockpit-bays` (fast-forwarded to `main` after
every commit; the public build tracks `main`). It is **not finished** — see
"Open threads" at the end. Read [state-of-development.md](state-of-development.md)
first if you are new to the project; this note assumes it.

Play it: `?resetSave=1&devStart=quickstart` (the live way in) or
`?resetSave=1&devStart=explorer` (free play). **Campaign is paused** — see below.

## The rules this run established

1. **Story vs guidance vs help.** Chatter (Rook, hubs, patrols) says *what*,
   from inside the world, and never mentions a click, key, display or button.
   A mission task's `prompt` — a two-or-three-word *power phrase* — rides
   beside the attention arrow and says *how* on the controls ("SIGN THE
   CONTRACT", "POWER SHIP ON", "W,A,S,D TO FLY SHIP"). `helpText` is the deep
   reference, out of the way. `tests/quickStart.test.mjs` fails if a
   quick-start `say` mentions the interface or a task with an arrow has no
   prompt.
2. **The `?v=` trap still bites, and now has a cousin.** A `let`/`const`
   declared in `main.js` *below* a function that is called during boot hits
   the temporal dead zone and halts boot silently (form submits natively,
   license comes up blank). It happened four times this run
   (`PAPER_BAND_COLORS`, `toolbarLcdMeasured`, `lastStampedContractId`, and a
   duplicate `countingElements`). Put module-level state up near
   `PAPERWORK_PANEL_IDS`. Also: `index.html` itself can be served from the
   browser cache after a bump — add a throwaway query param when testing.
3. **Bays are full-height; the status bar fits between them.** Anything
   positioned off the top of the screen must not assume a solid bar (the old
   88px floor on the plug, the 18px scope margin — both gone).
4. **Stamps are a mechanic.** The labor roll (ENTERED, ROOK INDUSTRIES),
   the signed contract (pilot's name across the action). Issuer colours:
   Rook amber `#ff9f5a`, RTC teal `#6fd9c9`, Porch magenta `[255,48,168]`.
5. **Money is seen to move** (`countTo`): reward down, credits up, in
   lockstep. Use it for any figure that changes because of a transaction.

## What landed (in order)

- **Processor crush dust** is drawn back into the pipe as a phosphor swirl;
  every figure is a dial (Configure cockpit → Sparkle; `dustDials.js`).
- **Quick Start** (`devStart=quickstart`): campaign world, Porch labor roll
  at the door (two-faced form chosen by a root class before first paint),
  Rook's line 1 as the cold open, then `qs-rundown` → `qs-sign` (or
  `qs-eager` if signed early) → `qs-fit-engine` → `qs-engine-fitted`
  (the one lesson: bring the engine's display out, drag it to the hull;
  the engine's remembered spot is *staged away* for the run like the
  campaign's hull) → `qs-power-on` → `qs-drive-lit` (or `qs-drive-surprise`
  if powered before dragging) → `find-yard-exchange` and the shared run.
  `selectStartBeat` on the mission definition picks the opening beat; a
  jump now ends an action list.
- **Paperwork bay** replaced the bottom drawer: right edge, module bay's
  mirror, cards file/unfile sheets, no FILE/DESK buttons. Sheets are
  redressed (`.paper-sheet`: issuer colour band, three facts, one action,
  DETAILS flip; `+ | ▶` pill). Paper animates: handed in from above, filed
  into the bay (ghost), the bay pops to catch.
- **Status bar**: Log/Help first, the feed on an LCD (reel of title /
  outstanding task / target, walks off left and in from right), region
  uncut, glass background, fits between the bays.
- **Scope** runs edge to edge (`VIEWPORT_SCOPE_MARGIN` = 2, one constant,
  seven former copies of 18).
- **Guidance arrow**: four sides, dodges chatter/sheets/instruments/bays
  (own panel at half weight), hysteresis; chatter dodges the arrow back.
  Prompt face/size/weight/glow/opacity are dials (Configure → Guidance;
  `guidanceDials.js`; fonts loaded from Google: Michroma, Orbitron,
  Audiowide, VT323, Press Start 2P).
- **Arrows gated on place**: `attentionWhenNearSiteId` /
  `attentionWhenDockedAtSiteId` on a task.
- **Contract reward** reads whole (1,000) until signed, then Balance (750);
  spent clauses are struck through and stamped COMPLETED (`{ text, done }`).
- **Dead processor**: plug connects to nothing (`isProcessorDead`), chamber
  wears hazard paint; the socket sits at the chamber's plug layer (under
  bay and chatter).
- **Scrap Porch** territory is magenta, not orange.

## Open threads (where this stopped)

- The guidance phrase's default face/size is still being tuned by feel;
  the dials exist so the user can settle it. Ask before changing defaults.
- Quick Start stops being authored after `find-yard-exchange`; from there
  it runs the campaign's shared beats (traffic check, dock, deliver). Those
  beats' Rook lines still contain some interface talk (e.g. the tune-beacon
  beat); the `qs-` tests do not cover them.
- **Campaign is paused** (user playtested: too slow). Its `reveal-drawer`
  beat asks for a FILE button that no longer exists; noted in the mission
  file. Do not invest there unless asked.
- Reloading mid-induction (no `resetSave`) floats every remembered-open
  instrument, engine included — pre-existing; the user always plays fresh.
- Procedural universe: assessed, not started. Phase 1 (relocate/rename the
  two starter hubs through `chapterOneRoute`, template Rook's hub names)
  is the recommended first step. See the conversation note in memory.
- The "FILE PAPERWORK" prompts land over the sheet bands when the ▶ is
  hemmed in; a dark halo keeps them legible, but a better anchor for tiny
  band controls would help.

## Verification at handoff

`npm test`: 1291 passing. `npm run validate:content`: passes. Browser: fresh
Quick Start walks end to end with no console errors (labor roll → rundown →
sign → drive → display out → drag → power → fly). Public build:
`https://joeylapetina78.github.io/asteroids-from-scratch/` at the tag in
`index.html`.
