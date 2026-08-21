import { chapterOneContracts } from "../content/contracts/chapterOneContracts.js?v=fresh-20260820-1911-46d9453";
import { depositCredits, getCredits, spendCredits } from "./accounts.js?v=fresh-20260820-1911-46d9453";
import { getContractFulfillmentFromEvent } from "./contractRules.js?v=fresh-20260820-1911-46d9453";
import { getRegistryEntityIdForSite, rememberRegistrySubject } from "./entityRegistry.js?v=fresh-20260820-1911-46d9453";
import { PLAYER_ATTRIBUTED_CAUSES } from "./eventLedger.js?v=fresh-20260820-1911-46d9453";
import { getPilotLicense } from "./legalRecords.js?v=fresh-20260820-1911-46d9453";
import { applyRuleMarkers, getRuleActions, matchesEventRule } from "./missionRules.js?v=fresh-20260820-1911-46d9453";
import { createLoanObligation, payObligation } from "./obligations.js?v=fresh-20260820-1911-46d9453";
import { createControlledShipPublicIdentity } from "./publicIdentity.js?v=fresh-20260820-1911-46d9453";
import { normalizeResourceType, resourceTypesMatch } from "./resourceDefinitions.js?v=fresh-20260820-1911-46d9453";
import { getStandingMiningOrderAvailability, settleStandingMiningOrder } from "./miningOperation.js?v=fresh-20260820-1911-46d9453";
import { payFromIssuer } from "./contractTreasury.js?v=fresh-20260820-1911-46d9453";
import { authorizeWreckSalvage } from "./wreckRegistry.js?v=fresh-20260820-1911-46d9453";
import { recordAuthorityRevenue } from "./rightsAuthority.js?v=fresh-20260820-1911-46d9453";
import { grantPlayerTerritoryRights } from "./hubTerritories.js?v=fresh-20260820-1911-46d9453";

const CONTRACT_DEFINITIONS = new Map(chapterOneContracts.map((contract) => [contract.id, contract]));

// Generated contracts (e.g. hub survey runs) register here at offer time.
// Their full definition is spread into the contract record, so a definition
// only needs to exist in this map for the offerContract call itself — active
// records loaded from a save never look definitions up again.
export function registerContractDefinition(definition) {
  CONTRACT_DEFINITIONS.set(definition.id, definition);
}

export function createContractManager({ state, onChange = () => {} }) {
  let lastEventId = 0;

  function offerContract(contractId, offerSource = null) {
    const definition = getContractDefinition(contractId);
    const unmetPrereqs = (definition.prerequisites ?? []).filter(
      (prereqId) => state.contracts.records[prereqId]?.status !== "paid",
    );

    if (unmetPrereqs.length > 0) {
      console.warn(`[contractManager] Cannot offer ${contractId}: prerequisites not met: ${unmetPrereqs.join(", ")}`);
      return;
    }

    const existingContract = state.contracts.records[contractId];

    if (existingContract?.status === "offered") {
      state.contracts.currentContractId = contractId;
      onChange(getCurrentContract());
      return;
    }

    if (existingContract?.status === "active" || existingContract?.status === "fulfilled" || existingContract?.status === "paid") {
      if (existingContract.status === "paid" && definition.repeatable) {
        state.contracts.records[contractId] = createContractRecord(definition, existingContract.runCount ?? 1, offerSource);
        state.contracts.currentContractId = contractId;
        recordContractOffered(contractId, definition, offerSource);
        onChange(getCurrentContract());
        return;
      }

      state.contracts.currentContractId = contractId;
      onChange(getCurrentContract());
      return;
    }

    state.contracts.records[contractId] = createContractRecord(definition, 0, offerSource);
    state.contracts.currentContractId = contractId;
    recordContractOffered(contractId, definition, offerSource);
    onChange(getCurrentContract());
  }

  function createContractRecord(definition, completedRunCount = 0, offerSource = null) {
    return {
      ...definition,
      status: "offered",
      runCount: completedRunCount + 1,
      deliveredAmount: 0,
      flags: {},
      offerSource,
      offeredAt: Date.now(),
      acceptedAt: null,
      fulfilledAt: null,
      paidAt: null,
    };
  }

  function recordContractOffered(contractId, definition, offerSource = null) {
    state.ledger.recordEvent(
      "contract.offered",
      {
        contractId,
        contractTitle: definition.title,
        issuer: definition.issuer,
        offerSource,
      },
      { visible: false },
    );
  }

  function acceptContract(contractId = state.contracts.currentContractId) {
    const contract = state.contracts.records[contractId];

    if (!contract || contract.status !== "offered") {
      return false;
    }

    if (contract.type === "permit") {
      return purchasePermit(contract);
    }

    contract.status = "active";
    contract.acceptedAt = Date.now();
    if (contract.type === "wreck-salvage") {
      const authorization = authorizeWreckSalvage(state, {
        wreckId: contract.terms.wreckId,
        authorizationId: `SALVAGE-AUTH:${contract.id}`,
        salvagerId: "player",
        destinationSiteId: contract.terms.destinationSiteId,
      });
      if (!authorization) {
        contract.status = "offered";
        contract.acceptedAt = null;
        return false;
      }
    }
    if (contract.type === "loan" && !contract.disbursedAt) {
      disburseLoan(contract);
    }
    state.ledger.recordEvent(
      "contract.accepted",
      {
        contractId: contract.id,
        contractTitle: contract.title,
        issuer: contract.issuer,
        contractType: contract.type,
        contractGroup: contract.group,
      },
      { visible: true },
    );
    onChange(contract);
    return true;
  }

  function purchasePermit(contract) {
    const cost = contract.terms.cost ?? 0;

    if (!spendCredits(state, cost)) {
      state.ledger.recordEvent(
        "contract.cannotAfford",
        { contractId: contract.id, contractTitle: contract.title, cost },
        { visible: false },
      );
      return false;
    }

    contract.status = "paid";
    contract.acceptedAt = Date.now();
    contract.paidAt = Date.now();
    // The fee leaves the player and accrues to the issuing authority (the capital
    // that controls the territory), rather than simply vanishing.
    recordAuthorityRevenue(state, {
      authorityId: contract.terms.authorityId ?? "yard-exchange-authority",
      amount: cost, referenceId: contract.id, description: contract.title,
    });
    applyPermitGrant(contract);

    state.ledger.recordEvent(
      "contract.accepted",
      {
        contractId: contract.id,
        contractTitle: contract.title,
        issuer: contract.issuer,
        contractType: contract.type,
        contractGroup: contract.group,
      },
      { visible: true },
    );
    state.ledger.recordEvent(
      "permit.granted",
      {
        contractId: contract.id,
        contractTitle: contract.title,
        permitType: contract.terms.permitType,
        zoneId: contract.terms.zoneId ?? null,
        zoneName: contract.terms.zoneName ?? null,
        siteId: contract.terms.siteId ?? null,
        siteName: contract.terms.siteName ?? null,
        beaconId: contract.terms.beaconId ?? null,
        cost,
      },
      { visible: true },
    );

    if (!getOpenContractIds().includes(contract.id)) {
      state.contracts.currentContractId = getOpenContractIds()[0] ?? null;
      onChange(getCurrentContract());
      return true;
    }

    onChange(contract);
    return true;
  }

  function applyPermitGrant(contract) {
    const { permitType, zoneId, siteId, grantZones, grantMiningAuthorities, grantTerritoryRights } = contract.terms;
    const license = getPilotLicense(state);

    // Flight clearance: a single legacy zoneId and/or a bundled set of zones (a
    // work pass clears the whole home territory at once).
    const zonesToGrant = [...(zoneId ? [zoneId] : []), ...(grantZones ?? [])];
    zonesToGrant.forEach((zone) => {
      if (!license.authorizedZones.includes(zone)) license.authorizedZones.push(zone);
    });

    // Mining clearance: a work pass or mining permit opens ground under the
    // subsidiary claims offices it names, added to the pilot's held authorities.
    if (grantMiningAuthorities?.length) {
      state.legal.operatingRights ??= { mining: { authorityIds: [] } };
      state.legal.operatingRights.mining ??= { authorityIds: [] };
      const held = state.legal.operatingRights.mining.authorityIds;
      grantMiningAuthorities.forEach((authorityId) => {
        if (!held.includes(authorityId)) held.push(authorityId);
      });
    }

    (grantTerritoryRights ?? []).forEach((grant) => {
      grantPlayerTerritoryRights(state, {
        territoryId: grant.territoryId,
        rights: grant.rights,
        issuerId: contract.terms.authorityId ?? contract.issuer,
        basisDocumentId: contract.id,
      });
    });

    if (permitType === "hub-docking" && siteId) {
      const identity = createControlledShipPublicIdentity(state);

      rememberRegistrySubject(state, {
        registryEntityId: getRegistryEntityIdForSite({ id: siteId }),
        subjectEntityId: identity.entityId,
        status: "cleared",
        disposition: "cleared",
        source: "permit-purchase",
        data: {
          siteId,
          pilotLicenseId: identity.pilotLicenseId,
          shipVin: identity.shipVin,
        },
      });
    }
  }

  function update() {
    const events = state.ledger.getEventsAfterId(lastEventId, { includeHidden: true });

    events.forEach((event) => {
      lastEventId = Math.max(lastEventId, event.id);

      if (event.type === "site.docked") {
        fulfillContractsFromEvent(event);
      } else if (event.type === "engine.poweredDown" && event.payload.dockedSiteId) {
        fulfillContractsFromEvent(event);
      } else if (event.type === "site.undocked") {
        closeUnacceptedHubServiceOffers(event.payload.siteId);
      } else if (event.type === "enemy.destroyed") {
        progressBountiesFromEvent(event);
      } else if (event.type === "wreck.salvageDelivered") {
        fulfillWreckSalvageFromEvent(event);
      } else if (event.type === "protection.playerContractCompleted") {
        fulfillPlayerProtectionFromEvent(event);
      }

      runContractConsiderationsForEvent(event);
    });
  }

  function fulfillPlayerProtectionFromEvent(event) {
    const contract = Object.values(state.contracts.records).find((candidate) =>
      candidate.type === "protection-response"
      && candidate.status === "active"
      && candidate.terms?.protectionRequestId === event.payload.requestId,
    );
    if (!contract) return;
    contract.reward.credits = event.payload.payment ?? contract.reward.credits ?? 0;
    contract.protectionSettlement = {
      requestId: event.payload.requestId,
      payerInstitutionId: event.payload.institutionId,
      threatId: event.payload.threatId,
      payment: contract.reward.credits,
    };
    fulfillContract(contract, { destinationSiteId: event.payload.siteId, unitsDelivered: 1 });
  }

  function fulfillWreckSalvageFromEvent(event) {
    const contract = Object.values(state.contracts.records).find((candidate) =>
      candidate.type === "wreck-salvage" && candidate.status === "active" &&
      candidate.terms.wreckId === event.payload.wreckId &&
      candidate.terms.destinationSiteId === event.payload.destinationSiteId,
    );
    if (!contract) return;
    fulfillContract(contract, { destinationSiteId: event.payload.destinationSiteId, unitsDelivered: 1 });
  }

  function runContractConsiderationsForEvent(event) {
    Object.values(state.contracts.records)
      .filter((contract) => contract.status === "active" && contract.considerations?.length)
      .forEach((contract) => {
        contract.flags ??= {};

        const consideration = contract.considerations.find((candidate) =>
          matchesEventRule(candidate, event, { state, flags: contract.flags }),
        );

        if (!consideration) {
          return;
        }

        const considerationActions = getRuleActions(consideration, { state, flags: contract.flags });
        applyRuleMarkers(consideration, { state, flags: contract.flags });
        runContractActions(considerationActions, contract);
        onChange(contract);
      });
  }

  function runContractActions(actionList, contract) {
    actionList.forEach((action) => {
      if (action.type === "setContractFlag") {
        contract.flags ??= {};
        contract.flags[action.flag] = true;
      }
    });
  }

  function closeUnacceptedHubServiceOffers(siteId) {
    const closingContractIds = Object.values(state.contracts.records)
      .filter((contract) => contract.status === "offered" && contract.offerSource?.type === "hub-service" && contract.offerSource.siteId === siteId)
      .map((contract) => contract.id);

    if (closingContractIds.length === 0) {
      return;
    }

    closingContractIds.forEach((contractId) => {
      const contract = state.contracts.records[contractId];

      delete state.contracts.records[contractId];
      state.ledger.recordEvent(
        "contract.offerClosed",
        {
          contractId,
          contractTitle: contract.title,
          siteId,
          serviceId: contract.offerSource.serviceId,
        },
        { visible: false },
      );
    });

    if (closingContractIds.includes(state.contracts.currentContractId)) {
      state.contracts.currentContractId = getOpenContractIds()[0] ?? null;
    }

    onChange(getCurrentContract());
  }

  function fulfillContractsFromEvent(event) {
    Object.values(state.contracts.records)
      .filter((contract) => contract.status === "active")
      .forEach((contract) => {
        const fulfillment = getContractFulfillmentFromEvent(contract, event, {
          state,
          getAttachedShipVin,
        });

        if (!fulfillment) {
          return;
        }

        fulfillContract(contract, fulfillment);
      });
  }

  function depositResourceUnit({ contractId = state.contracts.currentContractId, resourceType, siteId, sourceClaimId = null, amount = 1 }) {
    const contract = state.contracts.records[contractId];

    if (
      !contract ||
      contract.type !== "resource-delivery" ||
      contract.status !== "active" ||
      !resourceTypesMatch(contract.terms.resourceType, resourceType) ||
      contract.terms.destinationSiteId !== siteId
    ) {
      return false;
    }

    if (contract.terms.standingMiningOrderId) {
      const availability = getStandingMiningOrderAvailability({ state, orderId: contract.terms.standingMiningOrderId, amount: contract.terms.amount });
      if (!availability.available) {
        const reason = availability.reason ?? "buyer-cannot-fund";
        const resourceLabel = contract.terms.resourceName ?? normalizeResourceType(resourceType).replaceAll("-", " ");
        const message = reason === "buyer-cannot-fund"
          ? `${contract.issuer} can't fund this purchase right now; your ${resourceLabel} stays aboard.`
          : `${contract.issuer} has enough ${resourceLabel} for now and isn't buying; your cargo stays aboard.`;
        state.ledger.recordEvent("contract.resourceRejected", { contractId: contract.id, contractTitle: contract.title, resourceType: normalizeResourceType(resourceType), reason }, { visible: true, message });
        return false;
      }
    }

    const requiredAmount = contract.terms.amount ?? 0;

    if ((contract.deliveredAmount ?? 0) >= requiredAmount) {
      return false;
    }

    if (contract.terms.sourceClaimIds?.length && !contract.terms.sourceClaimIds.includes(sourceClaimId)) {
      state.ledger.recordEvent(
        "contract.resourceRejected",
        {
          contractId: contract.id,
          contractTitle: contract.title,
          resourceType: normalizeResourceType(resourceType),
          sourceClaimId,
          reason: "outside-source-claims",
        },
        { visible: false },
      );
      return false;
    }

    const unitsDeposited = Math.min(amount, requiredAmount - (contract.deliveredAmount ?? 0));
    contract.deliveredAmount = (contract.deliveredAmount ?? 0) + unitsDeposited;
    state.ledger.recordEvent("contract.resourceDeposited", {
      contractId: contract.id,
      contractTitle: contract.title,
      contractGroup: contract.group,
      resourceType: normalizeResourceType(resourceType),
      requestedResourceType: contract.terms.resourceType,
      resourceName: contract.terms.resourceName,
      unitsDeposited,
      deliveredAmount: contract.deliveredAmount,
      requiredAmount,
      destinationSiteId: contract.terms.destinationSiteId,
      sourceClaimId,
    });

    if (contract.deliveredAmount >= requiredAmount) {
      fulfillContract(contract, {
        destinationSiteId: contract.terms.destinationSiteId,
        resourceType: normalizeResourceType(resourceType),
        requestedResourceType: contract.terms.resourceType,
        resourceName: contract.terms.resourceName,
        unitsDelivered: requiredAmount,
      });
    } else {
      onChange(contract);
    }

    return unitsDeposited;
  }

  // Bounties are the kill-counting sibling of resource delivery: instead of
  // cargo deposited at a hub, they tally the pilot's own hostile kills. Only
  // player-attributed causes count (same rule the ledger uses for kill stats),
  // and a bounty fulfills in the field on the final kill - the pilot then
  // collects at the contract panel like any fulfilled run.
  function progressBountiesFromEvent(event) {
    if (!PLAYER_ATTRIBUTED_CAUSES.has(event.payload.cause)) {
      return;
    }

    const enemyType = event.payload.enemyType;

    Object.values(state.contracts.records)
      .filter((contract) => contract.type === "bounty" && contract.status === "active")
      .forEach((contract) => {
        if (contract.terms.targetType && contract.terms.targetType !== enemyType) {
          return;
        }

        const requiredAmount = contract.terms.amount ?? 0;

        if ((contract.killCount ?? 0) >= requiredAmount) {
          return;
        }

        contract.killCount = (contract.killCount ?? 0) + 1;
        state.ledger.recordEvent(
          "contract.bountyProgress",
          {
            contractId: contract.id,
            contractTitle: contract.title,
            contractGroup: contract.group,
            targetType: enemyType,
            killCount: contract.killCount,
            requiredAmount,
          },
          { visible: false },
        );

        if (contract.killCount >= requiredAmount) {
          fulfillContract(contract, {
            destinationSiteId: contract.terms.destinationSiteId,
            targetType: enemyType,
            unitsDelivered: requiredAmount,
          });
        } else {
          onChange(contract);
        }
      });
  }

  // Cargo runs are delivered by a manual unload at the destination hub (main.js
  // pulls the sealed container from the hold and calls this). Fulfills in place
  // so the pilot then collects at the contract panel, same as any delivery.
  function deliverCargoRun(contractId, siteId) {
    const contract = state.contracts.records[contractId];

    if (!contract || contract.type !== "cargo-run" || contract.status !== "active") {
      return false;
    }

    if (contract.terms.destinationSiteId !== siteId) {
      return false;
    }

    fulfillContract(contract, {
      destinationSiteId: contract.terms.destinationSiteId,
      resourceName: contract.terms.commodityName,
      unitsDelivered: contract.terms.amount,
    });
    return true;
  }

  function collectPayment(contractId = state.contracts.currentContractId) {
    const contract = state.contracts.records[contractId];

    if (!contract || contract.status !== "fulfilled") {
      return false;
    }

    payContract(contract);
    return true;
  }

  function payLoan(contractId = state.contracts.currentContractId, requestedAmount = Infinity) {
    const contract = state.contracts.records[contractId];

    if (!contract || contract.type !== "loan" || !contract.obligationId) {
      return false;
    }

    const result = payObligation(state, contract.obligationId, requestedAmount);

    if (!result.ok) {
      return false;
    }

    contract.balance = result.balance;
    contract.maxBalance = result.obligation.maxBalance;
    if (result.balance <= 0) {
      contract.status = "paid";
      contract.paidAt = Date.now();
    }

    onChange(contract);
    return true;
  }

  function disburseLoan(contract) {
    const principal = contract.terms.principal ?? contract.reward.credits ?? 0;
    const maxInterest = contract.terms.maxInterest ?? 0;

    // A lender lends its OWN money. This used to conjure the principal, which
    // meant the Finance Office could write a twenty-thousand credit loan out of
    // an empty office and the world's money supply grew every time you borrowed.
    const advance = payFromIssuer(state, {
      issuer: contract.issuer, institutionId: contract.issuerInstitutionId ?? null,
      amount: principal, referenceId: contract.id, kind: "loan-principal",
    });

    if (!advance.funded && principal > 0) {
      state.ledger.recordEvent("loan.declined", {
        contractId: contract.id,
        contractTitle: contract.title,
        issuer: contract.issuer,
        principal,
        shortfall: advance.shortfall,
        reason: advance.reason ?? "lender-underfunded",
      }, { visible: true, message: `${contract.issuer} does not have ${principal} cr to lend right now.` });
      return;
    }

    contract.disbursedAt = Date.now();
    const obligation = createLoanObligation(state, contract);
    contract.obligationId = obligation.id;
    contract.balance = obligation.balance;
    contract.maxBalance = obligation.maxBalance;
    depositCredits(state, advance.paid);
    state.ledger.recordEvent("loan.disbursed", {
      contractId: contract.id,
      contractTitle: contract.title,
      obligationId: obligation.id,
      principal,
      maxInterest,
      accountCredits: getCredits(state),
    });
  }

  function fulfillContract(contract, fulfillment = {}) {
    if (contract.terms?.standingMiningOrderId && !contract.standingMiningSettlement) {
      const settlement = settleStandingMiningOrder({
        state,
        orderId: contract.terms.standingMiningOrderId,
        resourceId: normalizeResourceType(fulfillment.resourceType ?? contract.terms.resourceType),
        amount: fulfillment.unitsDelivered ?? contract.terms.amount,
        referenceId: contract.id,
      });
      if (settlement) {
        contract.standingMiningSettlement = { orderId: settlement.order.id, buyerInstitutionId: settlement.order.buyerInstitutionId, resourceType: settlement.order.resourceId, quantity: settlement.delivered, payment: settlement.payment };
        contract.reward.credits = settlement.payment;
        state.ledger.recordEvent("mining.contractFulfilled", {
          institutionId: "player",
          institutionName: state.character?.name ?? "Player",
          orderId: settlement.order.id,
          siteId: settlement.order.siteId,
          resourceId: settlement.order.resourceId,
          quantity: settlement.delivered,
          payment: settlement.payment,
          buyerInstitutionId: settlement.order.buyerInstitutionId,
        }, { visible: true, message: `${state.character?.name ?? "Player"} delivered ${settlement.delivered} ${settlement.order.resourceName} to ${settlement.order.siteName}; it entered the hub's freight inventory.` });
      }
    }
    contract.status = "fulfilled";
    contract.fulfilledAt = Date.now();
    state.contracts.currentContractId = contract.id;
    state.ledger.recordEvent("contract.fulfilled", {
      contractId: contract.id,
      contractTitle: contract.title,
      contractGroup: contract.group,
      destinationSiteId: fulfillment.destinationSiteId ?? contract.terms.destinationSiteId,
      shipVin: fulfillment.shipVin ?? contract.terms.deliverShipVin,
      resourceType: fulfillment.resourceType,
      resourceName: fulfillment.resourceName,
      unitsDelivered: fulfillment.unitsDelivered,
    });
    onChange(contract);
  }

  function payContract(contract) {
    const credits = contract.reward.credits ?? 0;

    contract.status = "paid";
    contract.paidAt = Date.now();

    // WHO IS ACTUALLY OUT OF POCKET FOR THIS.
    //
    // A delivery settled through a standing mining order was ALREADY funded:
    // `settleStandingMiningOrder` debited the buying hub and put the ore on its
    // shelf, and the reward was set to exactly what the hub paid. Charging the
    // issuer as well would take the money twice for one delivery. Everything
    // else — story rewards, bounties, courier work — had no payer at all, and
    // now comes out of the issuer's own treasury.
    const alreadyFunded = Boolean(contract.standingMiningSettlement);
    const settlement = alreadyFunded
      ? { paid: credits, funded: true, institutionId: contract.standingMiningSettlement.buyerInstitutionId }
      : payFromIssuer(state, { issuer: contract.issuer, institutionId: contract.issuerInstitutionId ?? null, amount: credits, referenceId: contract.id, kind: "contract-reward" });

    if (!settlement.funded && credits > 0) {
      // Never silently conjure the difference. A contract that cannot be paid
      // stays unpaid and says who could not pay it.
      contract.status = "fulfilled";
      state.ledger.recordEvent("contract.paymentBlocked", {
        contractId: contract.id,
        contractTitle: contract.title,
        issuer: contract.issuer,
        creditsOwed: credits,
        shortfall: settlement.shortfall,
        reason: settlement.reason ?? "issuer-underfunded",
      }, { visible: true, message: `${contract.issuer} cannot cover ${credits} cr right now; the payment is outstanding.` });
      onChange(contract);
      return;
    }

    depositCredits(state, settlement.paid);
    state.ledger.recordEvent("contract.paid", {
      contractId: contract.id,
      contractTitle: contract.title,
      contractGroup: contract.group,
      creditsPaid: settlement.paid,
      payerInstitutionId: settlement.institutionId,
      accountCredits: getCredits(state),
    });

    if (!getOpenContractIds().includes(contract.id)) {
      state.contracts.currentContractId = getOpenContractIds()[0] ?? null;
      onChange(getCurrentContract());
      return;
    }

    onChange(contract);
  }

  function getAttachedShipVin() {
    const hull = state.components.hull;
    return hull.vinPlateAttached ? hull.vin : null;
  }

  function getCurrentContract() {
    const contract = state.contracts.records[state.contracts.currentContractId] ?? null;

    if (contract && ["expired", "canceled"].includes(contract.status)) {
      state.contracts.currentContractId = getOpenContractIds()[0] ?? null;
      return state.contracts.records[state.contracts.currentContractId] ?? null;
    }

    if (!contract || contract.status !== "paid" || (contract.type === "loan" && (contract.balance ?? 0) > 0)) {
      return contract;
    }

    state.contracts.currentContractId = getOpenContractIds()[0] ?? null;
    return state.contracts.records[state.contracts.currentContractId] ?? null;
  }

  function getOpenContractIds() {
    return Object.values(state.contracts.records)
      .filter((contract) => !["expired", "canceled"].includes(contract.status))
      .filter((contract) => contract.status !== "paid" || (contract.type === "loan" && (contract.balance ?? 0) > 0))
      .map((contract) => contract.id);
  }

  function getVisibleContractIds(siteId = null) {
    return getOpenContractIds().filter((contractId) => {
      const contract = state.contracts.records[contractId];
      const offerSiteId = contract.presentation?.offerSiteId ?? null;
      return contract.status !== "offered" || !offerSiteId || offerSiteId === siteId;
    });
  }

  function showNextContract(siteId = undefined) {
    const contractIds = siteId === undefined ? getOpenContractIds() : getVisibleContractIds(siteId);

    if (contractIds.length === 0) {
      state.contracts.currentContractId = null;
      onChange(null);
      return null;
    }

    const currentIndex = contractIds.indexOf(state.contracts.currentContractId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % contractIds.length : 0;

    state.contracts.currentContractId = contractIds[nextIndex];
    onChange(getCurrentContract());
    return getCurrentContract();
  }

  function focusContract(contractId) {
    if (!state.contracts.records[contractId]) {
      return;
    }

    state.contracts.currentContractId = contractId;
    onChange(getCurrentContract());
  }

  function getContractDefinition(contractId) {
    const definition = CONTRACT_DEFINITIONS.get(contractId);

    if (!definition) {
      throw new Error(`Unknown contract: ${contractId}`);
    }

    return definition;
  }

  return {
    acceptContract,
    closeUnacceptedHubServiceOffers,
    collectPayment,
    deliverCargoRun,
    depositResourceUnit,
    focusContract,
    getCurrentContract,
    getOpenContractIds,
    getVisibleContractIds,
    offerContract,
    payLoan,
    showNextContract,
    update,
  };
}
