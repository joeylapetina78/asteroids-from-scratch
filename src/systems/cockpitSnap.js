export const COCKPIT_RECT_GRID = 24;

// Panels lock to lines AND to the midpoints between them, so the player can
// offset by half a column when they want to. That is only safe because the
// minor grid inside a panel is also 12: a panel parked on a midpoint shifts its
// whole interior by half a column, and if the interior rhythm were 8 every
// meter cell and baseline in it would come off the lattice — a misalignment
// that would appear ONLY on panels the player chose to offset, and so would
// read as their mistake rather than the system's.
export const COCKPIT_SNAP_STRIDE = COCKPIT_RECT_GRID / 2;

export const COCKPIT_RADIAL_DIVISIONS = 24;
export const COCKPIT_ALIGNMENT_THRESHOLD = 11;

// A panel's flange — its padding and border — is BLEED. It hangs outside the
// grid so that what the reader actually sees lined up, the CONTENT box, is what
// lands on a column. Snapping the border box instead put every meter, label and
// button a flange-width off the lattice on every panel at once.
//
// Must match `--panel-flange` in styles.css.
export const COCKPIT_PANEL_FLANGE = 4;

// One definition of the ring spacing, used by the snap AND published to CSS so
// the rings the player is aiming at are the rings that were drawn. These used to
// disagree — the snap computed this while the stylesheet drew a fixed 65px
// period, so at a 1000x640 desk the panel jumped to rings 48px apart under a
// guide that showed them 65px apart.
export function getCockpitRingStep(scopeRadius) {
  return Math.max(48, Math.round(scopeRadius / 7));
}

// The circular docking zone over the viewport: centre, radius and ring pitch.
// `main.js` hands the same numbers to the stylesheet.
export function getCockpitScope(deskSize) {
  const width = Math.max(1, deskSize?.width ?? 1);
  const height = Math.max(1, deskSize?.height ?? 1);
  const radius = Math.min(width, height) / 2;
  return { centerX: width / 2, centerY: height / 2, radius, ringStep: getCockpitRingStep(radius) };
}

export function snapCockpitPanel(position, panelSize, deskSize, { flange = COCKPIT_PANEL_FLANGE } = {}) {
  const panelCenter = {
    x: position.x + panelSize.width / 2,
    y: position.y + panelSize.height / 2,
  };
  const scope = getCockpitScope(deskSize);
  const scopeCenter = { x: scope.centerX, y: scope.centerY };
  const dx = panelCenter.x - scopeCenter.x;
  const dy = panelCenter.y - scopeCenter.y;
  const distance = Math.hypot(dx, dy);
  const scopeRadius = scope.radius;

  if (distance <= scopeRadius) {
    const ringStep = scope.ringStep;
    const angleStep = (Math.PI * 2) / COCKPIT_RADIAL_DIVISIONS;
    const snappedRadius = Math.round(distance / ringStep) * ringStep;
    const snappedAngle = Math.round(Math.atan2(dy, dx) / angleStep) * angleStep;
    return {
      x: Math.round(scopeCenter.x + Math.cos(snappedAngle) * snappedRadius - panelSize.width / 2),
      y: Math.round(scopeCenter.y + Math.sin(snappedAngle) * snappedRadius - panelSize.height / 2),
      region: "viewport",
    };
  }

  return {
    x: snapToColumn(position.x, flange),
    y: snapToColumn(position.y, flange),
    region: "bay",
  };
}

// The rectangular bay snap on its own, with no radial branch.
//
// Used for a panel's FIRST appearance, where the position came from the tray
// edge and an automatic search for a free slot rather than from the player's
// hand. Running that through the full snap would pull a newly opened
// instrument onto a viewport ring and undo the overlap search; running it
// through nothing at all is what left every never-dragged panel sitting 16px
// off the lattice with its meters and labels off every column.
export function snapCockpitPanelToBay(position, { flange = COCKPIT_PANEL_FLANGE } = {}) {
  return {
    x: snapToColumn(position.x, flange),
    y: snapToColumn(position.y, flange),
  };
}

// Clamp bounds, quantized. A floor rounds UP and a ceiling rounds DOWN, so
// snapping a bound can never push a panel back past the limit it was clamped to.
export function ceilToColumn(edge, flange = COCKPIT_PANEL_FLANGE) {
  return Math.ceil((edge + flange) / COCKPIT_SNAP_STRIDE) * COCKPIT_SNAP_STRIDE - flange;
}

export function floorToColumn(edge, flange = COCKPIT_PANEL_FLANGE) {
  return Math.floor((edge + flange) / COCKPIT_SNAP_STRIDE) * COCKPIT_SNAP_STRIDE - flange;
}

// Round the CONTENT edge onto a lattice line, then hand back where the border
// box has to sit for that to be true.
function snapToColumn(edge, flange) {
  const content = edge + flange;
  return Math.round(content / COCKPIT_SNAP_STRIDE) * COCKPIT_SNAP_STRIDE - flange;
}

export function alignCockpitPanel(position, movingAnchors, referenceAnchors, threshold = COCKPIT_ALIGNMENT_THRESHOLD) {
  const xMatch = closestAlignment(position.x, movingAnchors.x, referenceAnchors.x, threshold);
  const yMatch = closestAlignment(position.y, movingAnchors.y, referenceAnchors.y, threshold);

  return {
    x: xMatch ? Math.round(position.x + xMatch.delta) : position.x,
    y: yMatch ? Math.round(position.y + yMatch.delta) : position.y,
    guideX: xMatch?.reference ?? null,
    guideY: yMatch?.reference ?? null,
  };
}

// Save the relationship that was snapped, rather than only today's pixels.
// If a control matched a guide, `offset` is that control's center inside its
// panel. Otherwise the panel center is used. Either way the reference point is
// stored as a desk fraction, so smaller desks pull the arrangement inward.
export function createResponsiveCockpitPosition(position, panelSize, deskSize, alignment = {}) {
  const width = Math.max(1, deskSize?.width ?? 1);
  const height = Math.max(1, deskSize?.height ?? 1);
  const panelWidth = Math.max(0, panelSize?.width ?? 0);
  const panelHeight = Math.max(0, panelSize?.height ?? 0);
  const guideX = Number.isFinite(alignment.guideX) ? alignment.guideX : position.x + panelWidth / 2;
  const guideY = Number.isFinite(alignment.guideY) ? alignment.guideY : position.y + panelHeight / 2;

  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
    anchorX: { fraction: guideX / width, offset: guideX - position.x },
    anchorY: { fraction: guideY / height, offset: guideY - position.y },
  };
}

export function restoreResponsiveCockpitPosition(record, panelSize, deskSize) {
  if (!isResponsiveAxis(record?.anchorX) || !isResponsiveAxis(record?.anchorY)) {
    return { x: Number(record?.x) || 0, y: Number(record?.y) || 0 };
  }
  const width = Math.max(1, deskSize?.width ?? 1);
  const height = Math.max(1, deskSize?.height ?? 1);
  return {
    x: record.anchorX.fraction * width - record.anchorX.offset,
    y: record.anchorY.fraction * height - record.anchorY.offset,
  };
}

function isResponsiveAxis(axis) {
  return Number.isFinite(axis?.fraction) && Number.isFinite(axis?.offset);
}

function closestAlignment(origin, movingOffsets = [], references = [], threshold) {
  let closest = null;
  movingOffsets.forEach((offset) => {
    references.forEach((reference) => {
      const delta = reference - (origin + offset);
      if (Math.abs(delta) > threshold || (closest && Math.abs(delta) >= Math.abs(closest.delta))) return;
      closest = { delta, reference };
    });
  });
  return closest;
}
