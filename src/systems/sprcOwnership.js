export const SCRAP_PORCH_INSTITUTION_ID = "scrap-forge";

// SPRC remains a named operation because contracts, queues and world records
// already address it. Economically it is a department of Scrap Porch: the hub
// owns the money and capital while Sal directs the work delegated to the shop.
export function consolidateSprcOwnership(state, { mergeLegacyTreasury = false, legacyTreasury = null, at = Date.now() } = {}) {
  const sprc = state?.sprc;
  const hub = state?.logistics?.institutions?.[SCRAP_PORCH_INSTITUTION_ID];
  if (!sprc || !hub?.accounts?.operating) return sprc ?? null;

  const legacyAccount = sprc.account;
  const accountToMerge = legacyTreasury ?? legacyAccount;
  if (mergeLegacyTreasury && accountToMerge && (legacyTreasury || accountToMerge !== hub.accounts.operating)) {
    hub.accounts.operating.balance = (hub.accounts.operating.balance ?? 0) + (accountToMerge.balance ?? 0);
    hub.accounts.operating.committed = (hub.accounts.operating.committed ?? 0) + (accountToMerge.committed ?? 0);
  }

  const departmentReserve = sprc.operatingPlan?.protectedCashReserve ?? legacyAccount?.protectedReserve ?? 900;
  hub.accounts.operating.id ??= "account:scrap-forge-operating";
  hub.accounts.operating.currency ??= "credits";
  hub.accounts.operating.committed ??= 0;
  hub.accounts.operating.protectedReserve = departmentReserve;
  sprc.account = hub.accounts.operating;

  sprc.ownership = {
    ...(sprc.ownership ?? {}),
    consolidated: true,
    ownerInstitutionId: SCRAP_PORCH_INSTITUTION_ID,
    operatorInstitutionId: "sprc",
    delegatedRepresentativeId: "sal",
    fundingModel: "municipal-department",
    consolidatedAt: sprc.ownership?.consolidatedAt ?? at,
  };
  Object.assign(sprc.institution, {
    ownerInstitutionId: SCRAP_PORCH_INSTITUTION_ID,
    // Sal controls shop-floor choices under delegation. Scrap Porch owns the
    // operation and makes institutional strategy through its own actor record.
    controllerInstitutionId: "sal",
    departmentHeadPersonId: "sal",
    organizationRole: "department",
  });
  if (sprc.controller) {
    sprc.controller.controls = [];
    sprc.controller.delegatedRoles = [{
      ownerInstitutionId: SCRAP_PORCH_INSTITUTION_ID,
      operationId: "sprc",
      role: "mechanic-and-recovery-factor",
    }];
  }

  Object.values(sprc.facilities ?? {}).forEach((facility) => {
    facility.ownerInstitutionId = SCRAP_PORCH_INSTITUTION_ID;
    facility.operatorInstitutionId = "sprc";
  });
  Object.values(sprc.projects ?? {}).forEach((project) => {
    project.ownerInstitutionId = SCRAP_PORCH_INSTITUTION_ID;
    project.operatorInstitutionId = "sprc";
  });
  sprc.inventoryCustody = {
    ownerInstitutionId: SCRAP_PORCH_INSTITUTION_ID,
    custodianOperationId: "sprc",
  };

  // Do not ask the actor registry while initial state is still being assembled:
  // tests and scenario loaders may replace a whole domain before first use.
  // Warming the registry here would retain records from the discarded domain.
  hub.hubState ??= { version: 1, populationId: "population:scrap-porch", needs: {}, projects: {}, history: [], counters: { need: 0, project: 0, history: 0 } };
  hub.hubState.departments ??= {};
  hub.hubState.departments.sprc = {
      id: "sprc",
      name: sprc.actor?.name ?? "Scrap Porch Recovery Cooperative",
      kind: "repair-and-recovery",
      representativeIds: ["sal"],
      facilityIds: Object.values(sprc.facilities ?? {}).map((facility) => facility.id),
      projectIds: Object.keys(sprc.projects ?? {}),
      inventoryCustody: sprc.inventoryCustody,
      status: "operating",
  };
  return sprc;
}
