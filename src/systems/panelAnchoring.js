// Where a panel sits on a desk of a different size.
//
// Panel positions used to be saved as absolute pixel offsets, which is fine
// until the window changes size. A desk arranged on a wide screen collapses into
// a heap on a laptop: a panel tucked into the bottom-right corner keeps its
// pixel offset and ends up floating in the middle, and one pushed out near the
// right edge lands off the desk entirely and gets clamped back into a pile.
//
// The fix is to remember what a panel was arranged RELATIVE TO. A panel tucked
// into a corner should stay in that corner; one placed just right of centre
// should stay just right of centre. So a position is stored as:
//
//   anchor   one of nine reference points on the desk — four corners, four edge
//            midpoints, and the centre — whichever the panel's top-left corner
//            was nearest when it was put down
//   fx, fy   the remaining distance from that anchor to the panel's top-left
//            corner, as a FRACTION of desk width and height
//
// On a bigger desk everything spreads out from its own anchor; on a smaller one
// it draws in. A corner panel's fractions are near zero, so it stays welded to
// its corner at any size, which is the behaviour that matters most.
//
// The viewport is not anchored. It has one place and keeps it.
//
// Pure geometry, no DOM: `main.js` measures and applies, this decides.

export const PANEL_ANCHORS = Object.freeze([
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
]);

const ANCHOR_FRACTIONS = Object.freeze({
  "top-left": { x: 0, y: 0 },
  "top-center": { x: 0.5, y: 0 },
  "top-right": { x: 1, y: 0 },
  "middle-left": { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  "middle-right": { x: 1, y: 0.5 },
  "bottom-left": { x: 0, y: 1 },
  "bottom-center": { x: 0.5, y: 1 },
  "bottom-right": { x: 1, y: 1 },
});

export function isPanelAnchor(anchor) {
  return Object.prototype.hasOwnProperty.call(ANCHOR_FRACTIONS, anchor);
}

export function getAnchorPoint(anchor, viewport) {
  const fractions = ANCHOR_FRACTIONS[anchor] ?? ANCHOR_FRACTIONS["top-left"];
  return {
    x: fractions.x * (viewport?.width ?? 0),
    y: fractions.y * (viewport?.height ?? 0),
  };
}

// Which reference point was this panel arranged against?
//
// Distances are measured in FRACTIONS of the desk rather than pixels. On a
// 3440-wide monitor a pixel-distance comparison makes every anchor look
// horizontally close and the choice collapses onto whichever is vertically
// nearest; normalising first keeps the answer about proportion, which is what
// the reader meant when they put the panel there.
export function chooseAnchor({ left, top }, viewport) {
  const width = Math.max(1, viewport?.width ?? 1);
  const height = Math.max(1, viewport?.height ?? 1);

  return PANEL_ANCHORS.reduce((best, anchor) => {
    const point = getAnchorPoint(anchor, { width, height });
    const dx = (left - point.x) / width;
    const dy = (top - point.y) / height;
    const distance = Math.hypot(dx, dy);
    return !best || distance < best.distance ? { anchor, distance } : best;
  }, null).anchor;
}

// Absolute position → a record that survives a resize.
export function toAnchoredPosition({ left, top }, viewport, { anchor = null } = {}) {
  const width = Math.max(1, viewport?.width ?? 1);
  const height = Math.max(1, viewport?.height ?? 1);
  const chosen = anchor && isPanelAnchor(anchor) ? anchor : chooseAnchor({ left, top }, { width, height });
  const point = getAnchorPoint(chosen, { width, height });

  return {
    anchor: chosen,
    fx: (left - point.x) / width,
    fy: (top - point.y) / height,
  };
}

// …and back again, on whatever desk we now have.
export function fromAnchoredPosition(anchored, viewport) {
  const width = Math.max(1, viewport?.width ?? 1);
  const height = Math.max(1, viewport?.height ?? 1);
  const anchor = isPanelAnchor(anchored?.anchor) ? anchored.anchor : "top-left";
  const point = getAnchorPoint(anchor, { width, height });
  const fx = Number.isFinite(anchored?.fx) ? anchored.fx : 0;
  const fy = Number.isFinite(anchored?.fy) ? anchored.fy : 0;

  return { left: point.x + fx * width, top: point.y + fy * height };
}

// Keep a restored panel on the desk.
//
// Anchoring preserves arrangement, but it cannot invent room that is not there:
// a panel arranged near the right edge of a wide desk can still overhang a
// narrow one once its own width is accounted for. Clamping is the last step and
// deliberately does not write back to the stored record, so widening the window
// again restores the intended position rather than the squeezed one.
export function clampToViewport({ left, top }, size, viewport, { padding = 12 } = {}) {
  const width = viewport?.width ?? 0;
  const height = viewport?.height ?? 0;
  const panelWidth = size?.width ?? 0;
  const panelHeight = size?.height ?? 0;

  const maxLeft = Math.max(padding, width - padding - panelWidth);
  const maxTop = Math.max(padding, height - padding - panelHeight);

  return {
    left: Math.min(maxLeft, Math.max(padding, left)),
    top: Math.min(maxTop, Math.max(padding, top)),
  };
}

export function hasAnchoredPosition(record) {
  return Boolean(record) && isPanelAnchor(record.anchor)
    && Number.isFinite(record.fx) && Number.isFinite(record.fy);
}
