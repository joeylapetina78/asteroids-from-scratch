// Small shared seam for actors that can promise several pieces of work while
// still executing one step at a time. Domain systems decide compatibility;
// this layer only accounts for finite capacity and preserves ordering.

export function createCommitmentPortfolio({ capacity = 1 } = {}) {
  return { capacity: Math.max(0, capacity), entries: [] };
}

export function reservedCapacity(portfolio) {
  return (portfolio?.entries ?? []).reduce((sum, entry) => sum + Math.max(0, entry.reservedCapacity ?? 0), 0);
}

export function remainingCapacity(portfolio) {
  return Math.max(0, (portfolio?.capacity ?? 0) - reservedCapacity(portfolio));
}

export function canAddCommitment(portfolio, commitment, { compatible = () => true } = {}) {
  if (!portfolio || !commitment) return false;
  const required = Math.max(0, commitment.reservedCapacity ?? 0);
  if (required <= 0 || required > remainingCapacity(portfolio)) return false;
  return portfolio.entries.every((existing) => compatible(existing, commitment));
}

export function addCommitment(portfolio, commitment, options = {}) {
  if (!canAddCommitment(portfolio, commitment, options)) return false;
  portfolio.entries.push(commitment);
  return true;
}

export function removeCommitment(portfolio, id) {
  const index = portfolio?.entries?.findIndex((entry) => entry.id === id) ?? -1;
  if (index < 0) return null;
  return portfolio.entries.splice(index, 1)[0] ?? null;
}

export function moveCommitmentToFront(portfolio, id) {
  const entry = removeCommitment(portfolio, id);
  if (!entry) return false;
  portfolio.entries.unshift(entry);
  return true;
}
