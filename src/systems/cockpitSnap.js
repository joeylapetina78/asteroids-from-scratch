export const COCKPIT_RECT_GRID = 24;
export const COCKPIT_RADIAL_DIVISIONS = 24;

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
