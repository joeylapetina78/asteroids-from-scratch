// Who gets a click that lands on a chamber.
//
// A chamber is transparent to the pointer and claims clicks from the WINDOW in
// capture phase, so that material lying over the viewport can still be picked
// up. The cost is a race: every control the chamber passes under is competing
// with whatever rock happens to be drifting there, and capture phase means the
// rock wins. A button that fails only when a rock is behind it is the worst
// kind of button.
//
// The tie-break is what the player can see. Painted order decides it, and the
// z-index ladder at the top of styles.css is these same three statements in
// the same order — if one moves, the other has to move with it.

// Chrome: the module bay and the routing plug. Above every chamber in every
// state, so they are never in the race at all.
export const CHAMBER_CHROME_SELECTOR = ".cockpit-module-tray, .processor-claw";

// Ordinary controls. Above a resting chamber, below a raised one.
export const CHAMBER_CONTROL_SELECTOR =
  "button, select, input, textarea, a[href], label, [role='button'], .is-cockpit-module";

// The states in which the player has deliberately pointed a hold somewhere.
// The chamber is raised over the desk for these, so the ore is on top and the
// ore is what the click is for.
export const CHAMBER_RAISED_SELECTOR = ".is-deposit-target, .is-sell-target";

// `target` is the element the browser hit-tested; `panel` is the chamber's own
// panel, or null for a chamber that is never raised. Returns true when the
// chamber should keep its hands off the click.
export function chamberYieldsClick(target, panel = null) {
  if (!target?.closest) return false;
  if (target.closest(CHAMBER_CHROME_SELECTOR)) return true;
  if (panel?.matches?.(CHAMBER_RAISED_SELECTOR)) return false;
  return Boolean(target.closest(CHAMBER_CONTROL_SELECTOR));
}
