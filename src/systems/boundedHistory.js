export function appendBoundedHistory(history, entry, limit = 500) {
  history.push(entry);
  if (history.length > limit) history.splice(0, history.length - limit);
  return entry;
}
