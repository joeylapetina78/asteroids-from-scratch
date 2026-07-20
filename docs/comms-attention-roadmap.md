# Comms And Attention Roadmap

## Problem

The Journey sidebar is currently the durable home for mission speech, objectives, help, approvals, and some non-mission chatter. It is useful but visually peripheral, so important character speech and action prompts can be missed while the player watches the viewport.

The game also has partial attention behavior: panel pulses, gold highlights, VIN/license emphasis, hub-service highlights, and an overlay callout layer. These are not yet one reliable system. Some targets use semantic attention records, while others use direct CSS classes or mission-specific handling. As a result, a prompt can be visually weak, inconsistent, or fail to follow a moved panel.

## Goals

- Make important speech hard to miss without turning every message into an interruption.
- Preserve Journey as the durable mission/comms record and decision surface.
- Make attention targets reusable by missions, contracts, hub services, global events, and future world systems.
- Make prompts follow draggable, docked, collapsed, and responsive UI layouts.
- Support future portraits, comic treatments, on-screen source indicators, and world markers without rewriting message producers.

## Separation Of Responsibilities

### Comms Producer

Mission NPCs, hub authority, patrols, tow drivers, services, lifeforms, and global systems produce structured messages. They provide facts such as speaker, source, priority, text, whether a response is required, and optional attention requests.

They do not decide sidebar coordinates, arrow animation, portrait art, or which DOM element should glow.

### Comms Director

The Comms Director owns queueing, priority, expiration, and interruption rules. Approval-required mission speech must not be overwritten by flavor or ordinary considerations. Low-priority chatter may wait, expire, or collapse into a later summary.

### Journey

Journey remains the durable console. It shows the current mission, recent speaker line, help, acknowledgement/choice controls, and an accessible record of what needs doing. It must work before a viewport exists.

### Attention Layer

The attention layer resolves a semantic target to its current visual anchor and chooses how to draw attention. It owns arrows, labels, pulses, highlights, and future target brackets. It must be independent of individual missions and components.

## Attention API Direction

Use semantic target IDs, such as:

- `panel:flight-console`
- `panel:processor`
- `element:hull-vin`
- `document:pilot-license:ref`
- `hub-service:yard-exchange:shipyard`
- `viewport:portal:portal-12`

An attention request should be data-shaped, for example:

```js
{
  targetId: "hub-service:yard-exchange:shipyard",
  mode: "until-interacted",
  priority: "normal",
  label: "New ship offers",
  reason: "mission-handoff"
}
```

Initial modes:

- `once`: brief arrival pulse for a newly revealed target.
- `until-interacted`: persistent arrow/label/highlight until the target is clicked, opened, or otherwise acknowledged.
- `urgent`: stronger treatment for active patrol checks, tow offers, emergency warnings, or required approvals.

Targets should register an element resolver with the layer. The layer recalculates overlays during panel drag, layout changes, resize, scrolling, and target visibility changes. Overlay visuals must not intercept normal pointer input.

Avoid direct, special-case CSS attention for identity fields, hub services, or any individual mission beat. Those should become clients of this same target registry.

## Viewport Comms Prototype

When a viewport is available, important active speech should also appear as a transient **viewport comms banner**. This is deliberately a prototype, not the final art redesign.

- It slides from a viewport edge, carries speaker name and text, then retreats.
- It can visually distinguish radio, hub traffic, patrol authority, service windows, and local/on-screen sources through style.
- Journey still holds the full durable text, objective, help, and choices.
- Before the viewport exists, Journey remains the only speech surface.
- A message that requires an answer keeps Journey open and remains actionable there; the banner is not a second control surface.

Later visual directions can add portraits, comic panels, tails toward on-screen actors, target brackets, or environmental signal effects. Those should consume structured speaker/source metadata rather than branching mission logic.

## UX Rules

- Do not move text the player is reading unless there is no alternative.
- A target should be announced once, then persist calmly until interaction rather than constantly flashing.
- Use labels with arrows when the player must find something new, especially hub services and document fields.
- Use visual urgency sparingly. Routine flavor should not compete with patrol, tow, contract approval, or active safety prompts.
- The game should never require a player to infer which panel contains the next required action.
- Responsive layouts must preserve target IDs even when a capability moves into a console rack or a collapsed view.

## Incremental Delivery

1. Audit direct CSS attention paths and convert identity, hub-service, and component prompts to semantic targets.
2. Stabilize target anchoring during drag, responsive layout changes, and panel reveal/hide transitions.
3. Add the viewport comms banner for high-priority speech while retaining Journey as the record and control surface.
4. Define source styles for mission NPC, hub authority, patrol, tow, service NPC, and flavor speech.
5. Add future speaker art/portraits and optional on-screen comic treatments only after the message and attention contracts are stable.

## Avoid

- Do not make missions draw DOM arrows, banners, or speaker art directly.
- Do not replace Journey with transient viewport speech.
- Do not allow flavor chatter to interrupt approval-required mission messages.
- Do not rely on a brief gold glow as the only way to find a new required target.
- Do not make the attention layer assume a fixed panel location or a wide-screen layout.
