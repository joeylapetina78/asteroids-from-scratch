// Explorer and panorama are observation laboratories, not canonical new games.
// Start them in the middle of an ordinary operating cycle so measurements are
// not dominated by every mature institution discovering an empty shelf at once.

const RAW_RESERVE = Object.freeze({ "iron-nickel": 4, silicate: 4, "water-ice": 4 });
const FINISHED_SHELF = Object.freeze({
  "settlement-supply-unit": 1,
  "life-support-pack": 1,
  "household-goods-unit": 1,
});

export function seedDevOperatingContinuity(state, now = Date.now()) {
  if (!state || state._devOperatingContinuitySeeded) return false;

  const institutions = state.logistics?.institutions ?? {};
  Object.values(institutions)
    .filter((institution) => institution?.archetypeId === "settlement")
    .forEach((institution) => {
      institution.inventories ??= {};
      Object.entries(RAW_RESERVE).forEach(([itemId, units]) => {
        institution.inventories[itemId] = Math.max(units, institution.inventories[itemId] ?? 0);
      });
      institution.finishedGoods = { ...FINISHED_SHELF, ...(institution.finishedGoods ?? {}) };
    });

  // These mature works have prior output on the shelf and a real run underway.
  // Inputs and conversion cash are consumed before the sampler takes a baseline,
  // just as they would have been when those runs began before observation.
  const runFractions = [0.25, 0.55, 0.8];
  Object.values(state.industrial?.factories ?? {}).forEach((factory, index) => {
    const hub = institutions[factory.institutionId];
    const recipe = factory.recipes?.[0];
    if (!hub || !recipe || factory.activeRun) return;
    hub.inventories ??= {};
    hub.inventories[recipe.output] = Math.max(3, hub.inventories[recipe.output] ?? 0);
    Object.entries(recipe.inputs ?? {}).forEach(([itemId, units]) => {
      hub.inventories[itemId] = Math.max(units, hub.inventories[itemId] ?? 0) - units;
    });
    hub.accounts.operating.balance -= recipe.credits;
    const elapsed = recipe.seconds * 1000 * runFractions[index % runFractions.length];
    factory.completedRuns = Math.max(3, factory.completedRuns ?? 0);
    const rawPerRun = Object.values(recipe.inputs ?? {}).reduce((sum, units) => sum + units, 0);
    factory.operatingHistory ??= { ordersAccepted: 0, contractedRevenue: 0, firstRunAt: now - recipe.seconds * 4000, lastRunAt: now - recipe.seconds * 1000 };
    factory.operatingHistory.unitsProduced = Math.max(factory.completedRuns * recipe.amount, factory.operatingHistory.unitsProduced ?? 0);
    factory.operatingHistory.rawUnitsConsumed = Math.max((factory.completedRuns + 1) * rawPerRun, factory.operatingHistory.rawUnitsConsumed ?? 0);
    factory.status = "working";
    factory.activeRun = {
      id: `IND-OPEN-${index + 1}`, output: recipe.output, amount: recipe.amount, inputs: { ...recipe.inputs },
      startedAt: now - elapsed, completesAt: now + recipe.seconds * 1000 - elapsed,
    };
  });

  const yard = institutions["yard-shipyard"];
  const yardHub = institutions[yard?.ownerInstitutionId];
  if (yard && yardHub && !yard.build) {
    yardHub.inventories["hull-plate"] = Math.max(9, yardHub.inventories["hull-plate"] ?? 0) - 5;
    yardHub.inventories["machine-part"] = Math.max(6, yardHub.inventories["machine-part"] ?? 0) - 3;
    yard.build = { hullClass: "freight-craft", startedAt: now - 20_000, strokes: 1 };
  }

  const sprc = state.sprc?.inventories;
  if (sprc) {
    sprc.raw["iron-nickel"] = Math.max(4, sprc.raw["iron-nickel"] ?? 0);
    sprc.raw.silicate = Math.max(4, sprc.raw.silicate ?? 0);
    sprc.produced["hull-plate"] = Math.max(6, sprc.produced["hull-plate"] ?? 0);
    sprc.produced["machine-part"] = Math.max(5, sprc.produced["machine-part"] ?? 0);
  }

  state._devOperatingContinuitySeeded = true;
  return true;
}
