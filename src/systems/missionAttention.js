// Whether a task's arrow should be up right now. An arrow points at the
// next useful click, so a task whose control cannot usefully be clicked
// yet keeps its arrow down: a dock button out of range of the hub it is
// for, a power switch on a ship that is not docked yet. The gates are read
// live, so the arrow comes on as the ship arrives and goes off again if it
// leaves before clicking.
export function shouldShowMissionTaskAttention(task, { flags = {}, activeBeaconId = null, nearbySiteId = null, dockedSiteId = null } = {}) {
  if (!task?.attention || flags[task.flag]) return false;
  if (task.attentionRequiresFlag && !flags[task.attentionRequiresFlag]) return false;
  if (task.attentionUnlessActiveBeaconId && activeBeaconId === task.attentionUnlessActiveBeaconId) return false;
  if (task.attentionWhenNearSiteId && nearbySiteId !== task.attentionWhenNearSiteId && dockedSiteId !== task.attentionWhenNearSiteId) return false;
  if (task.attentionWhenDockedAtSiteId && dockedSiteId !== task.attentionWhenDockedAtSiteId) return false;
  return true;
}
