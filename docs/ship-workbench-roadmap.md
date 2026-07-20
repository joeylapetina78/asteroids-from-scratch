# Ship Workbench Roadmap

## Problem

The game deliberately treats ship operation as a physical workbench outside the viewport. Players should arrange instruments, operate different capabilities, process materials, and build ships with meaningful tradeoffs.

The current UI expresses every capability as an independent draggable panel. That works on a wide desktop but crowds a laptop, makes new components expensive in screen space, and risks turning the workbench into a collection of tiny browser windows.

The solution is not to shrink every panel. Small panels would preserve the crowding while making the game harder to read and operate.

## Invariants

- Ship hardware, installed capabilities, and UI panels remain separate concerns.
- A hull owns component slots and physical limits; it does not own a preferred screen layout.
- A component can expose a capability without requiring a permanent standalone panel.
- The player can still arrange and personalize the workbench.
- A laptop layout must remain playable without removing the physical-console fantasy.
- Missions can reveal, focus, or call attention to a console, but may not implement console behavior themselves.

## Proposed Model

Separate three layers:

1. **Ship capability**: the installed hardware and its game rules, such as an engine, miner, cargo bay, tow cable, shield, or beacon bay.
2. **Hull mount or slot**: the physical compatibility and capacity rule that limits which capabilities can coexist on a hull.
3. **Workbench console**: the UI surface through which one or more installed capabilities are operated.

This means a ship does not receive one window per component. It has installed components that publish controls and readouts to compatible consoles.

## Initial Console Families

These are design targets, not an immediate replacement for existing panels.

| Console | Candidate capabilities | Purpose |
|---|---|---|
| Flight | engine, hull, docking, beacon locator | Navigation and flight safety. |
| Extraction | miner, scanner, tractor field, processor, cargo routing | Mining and material handling. |
| Utility | tow cable, shield, cloak, beacon bay, moss seeder | Optional tools installed in utility mounts. |
| Paperwork | documents, contracts, obligations, filed records | Administrative work, normally in the drawer. |
| Hub / Mission | docked services and transient story context | Contextual rather than permanently occupying the desk. |

The Processor is the strongest first candidate for a canvas-backed console: collected units, compaction, routing, and fuel/charges/scannergy tubes can share one instrument instead of requiring separate small panels.

## Hull Slot Direction

Hull slots should create choices rather than universal ships. A starter hull might have mandatory flight and extraction mounts, a limited number of utility mounts, and perhaps one special mount. Two rear-mounted tools can compete for the same mount. Better hulls can add capacity, power, cargo, or specialized compatibility.

This should be implemented through the existing component/hull record direction, not as hardcoded ship types. A capability's world rules must continue to work independently of whether its console is detached, docked, hidden, or compact.

## Responsive Workbench

The same instrument should render differently by available space without changing the underlying game:

- **Wide workbench**: consoles may be detached, dragged, and layered freely.
- **Standard desktop**: consoles dock into stable workbench regions but can still be rearranged.
- **Laptop**: show a small number of rack consoles, with compact bays or tabs inside each console.
- **Small screen**: show the active console clearly, while Journey and task guidance point the player to the next required action.

Saved panel layouts should remain profile-specific. A panorama layout must not be reused for explorer, new-run, or laptop-sized layouts.

## Relationship To Attention And Comms

The attention/comms layer should target semantic IDs, not one-off CSS classes or mission-specific DOM logic. A task can request attention for a console, a button, a document field, a hub service, or a viewport position. The UI layer chooses the actual presentation: one-shot pulse, persistent arrow, label, banner, or future portrait/comic treatment.

This is required for responsive layouts because a target's screen position changes as consoles dock, collapse, or are dragged.

## Incremental Delivery

1. Audit current components into console families and define mount compatibility without changing the current UI.
2. Create a console registry that lets installed components contribute controls/readouts to a console.
3. Convert the Processor and its output controls into the first canvas-backed Extraction console.
4. Add a compact/docked workbench layout for laptop widths while preserving the existing wide-layout mode.
5. Introduce hull mount limits and utility-tool tradeoffs through component records.
6. Move remaining standalone panels into consoles only when their interaction remains clear and useful.

## Avoid

- Do not make UI layout determine installed hardware.
- Do not make every new component automatically create a new permanent panel.
- Do not solve laptop layout by uniformly shrinking text and controls.
- Do not make missions responsible for console mechanics.
- Do not remove the player's ability to personalize a wide-screen workbench.
