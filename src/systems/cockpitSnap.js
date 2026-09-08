export const COCKPIT_RECT_GRID = 24;
export const COCKPIT_RADIAL_DIVISIONS = 24;
export const COCKPIT_ALIGNMENT_THRESHOLD = 11;

export function snapCockpitPanel(position, panelSize, deskSize) {
  const panelCenter = {
    x: position.x + panelSize.width / 2,
    y: position.y + panelSize.height / 2,
  };
  const scopeCenter = { x: deskSize.width / 2, y: deskSize.height / 2 };
  const dx = panelCenter.x - scopeCenter.x;
  const dy = panelCenter.y - scopeCenter.y;
  const distance = Math.hypot(dx, dy);
  const scopeRadius = Math.min(deskSize.width, deskSize.height) / 2;

  if (distance <= scopeRadius) {
    const ringStep = Math.max(48, Math.round(scopeRadius / 7));
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
    x: Math.round(position.x / COCKPIT_RECT_GRID) * COCKPIT_RECT_GRID,
    y: Math.round(position.y / COCKPIT_RECT_GRID) * COCKPIT_RECT_GRID,
    region: "bay",
  };
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
