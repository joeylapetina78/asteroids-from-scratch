export function shouldShowMissionTaskAttention(task, { flags = {}, activeBeaconId = null } = {}) {
  if (!task?.attention || flags[task.flag]) return false;
  if (task.attentionRequiresFlag && !flags[task.attentionRequiresFlag]) return false;
  if (task.attentionUnlessActiveBeaconId && activeBeaconId === task.attentionUnlessActiveBeaconId) return false;
  return true;
}
