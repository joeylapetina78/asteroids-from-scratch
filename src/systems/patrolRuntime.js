// A physical patrol actor is a temporary viewport representation of a durable
// institution-owned craft and its current assignment. All patrol roles use the
// same shape so combat and lifecycle fields cannot drift apart.
export function createPatrolRuntimeActor({
  craft, site, homeSite = null, reason, phase, position,
  velocity = { x: 0, y: 0 }, heading = 0, waypoints = [], waypointIndex = 0,
  requiresManualClearance = false, protectionRequestId = null,
  contractedThreatId = null, protectionInternal = false,
}) {
  if (!craft?.id || !site || !position) return null;
  return {
    id: craft.id, name: craft.name, institutionId: craft.ownerInstitutionId,
    publicIdentity: craft.publicIdentity, hull: craft.hull, maxHull: craft.maxHull,
    radius: 22, isAlive: craft.hull > 0,
    damage(amount) { this.hull = Math.max(0, this.hull - amount); this.isAlive = this.hull > 0; },
    site, homeSite, protectionRequestId, contractedThreatId, protectionInternal,
    reason, phase, position: { ...position }, velocity: { ...velocity }, heading,
    pulse: 0, hasArrived: false, scanTimer: 0, hasScanned: false, orbitAngle: null,
    requiresManualClearance, departTarget: null, waypoints, waypointIndex,
    waypointDwellTimer: 0, passiveScanTimer: 0, flaggedDismissTimer: 0,
    weaponCooldown: 0, flybyTarget: null, flybyCheckTimer: 0, flybyHasScanned: false,
  };
}
