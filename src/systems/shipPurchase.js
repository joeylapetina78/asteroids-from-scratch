import { getCurrentShipLegal, getPilotName, updateCurrentShipLegal } from "./legalRecords.js?v=fresh-20260708-patrol4";
import { canSpendCredits, getCredits, spendCredits } from "./accounts.js?v=fresh-20260708-patrol4";
import { registerHull, setActiveHull } from "./hulls.js?v=fresh-20260708-patrol4";
import {
  WORLD_RECORD_RELATIONSHIPS,
  ensureInstitution,
  ensurePerson,
  ensureShipAsset,
  getShipAssetId,
  issueWorldDocument,
  upsertWorldRelationship,
} from "./worldRecords.js?v=fresh-20260708-patrol4";

const YARD_EXCHANGE_AUTHORITY_ID = "institution:yard-exchange-authority";
const YARD_EXCHANGE_FINANCE_ID = "institution:yard-exchange-finance";

export function purchaseShipOffer(state, offer) {
  if (state.ship.purchasedOfferId) {
    return { ok: false, reason: "already-purchased" };
  }

  if (!canSpendCredits(state, offer.price)) {
    state.ledger.recordEvent(
      "merchant.cannotAfford",
      {
        offerId: offer.id,
        shipName: offer.title,
        price: offer.price,
        credits: Math.floor(getCredits(state)),
      },
      { visible: false },
    );
    return { ok: false, reason: "insufficient-credits" };
  }

  spendCredits(state, offer.price);
  state.ship.purchasedOfferId = offer.id;
  state.ship.frameId = "yard-skiff-miner";
  state.ship.name = offer.title;
  state.ship.shape = "yard-skiff";
  const previousVin = state.components.hull.vin;
  const purchasedVin = "YRDSKF-M-2B7";
  const activeStarterLoan = state.contracts.records["mako-starter-ship-loan"];
  const hasStarterLoanLien = activeStarterLoan && ["active", "fulfilled"].includes(activeStarterLoan.status);

  state.components.hull.vin = purchasedVin;
  setActiveHull(state, purchasedVin);
  state.components.hull.integrity = state.components.hull.maxIntegrity;
  state.components.engine.fuelBurnRate = 4.5;
  state.components.engine.maxFuel = 260;
  state.components.engine.fuel = Math.max(state.components.engine.fuel, 220);
  state.components.engine.powerLocked = false;
  state.components.miner.installed = true;
  state.components.miner.ammo = Math.max(state.components.miner.ammo, 150);
  state.components.cargoHold.installed = true;
  registerHull(state, {
    vin: purchasedVin,
    name: offer.title,
    frameId: state.ship.frameId,
    status: "financed",
  });
  registerPurchasedShipLegalRecords(state, {
    offer,
    previousVin,
    purchasedVin,
    hasStarterLoanLien,
    sourceContractId: hasStarterLoanLien ? activeStarterLoan.id : null,
  });
  state.ledger.recordEvent("ship.purchased", {
    offerId: offer.id,
    shipName: offer.title,
    price: offer.price,
    creditsRemaining: Math.floor(getCredits(state)),
    includedComponents: offer.includedComponents,
    previousVin,
    shipVin: purchasedVin,
  });

  return { ok: true };
}

function registerPurchasedShipLegalRecords(state, { offer, previousVin, purchasedVin, hasStarterLoanLien, sourceContractId }) {
  const titleId = `title-${purchasedVin.toLowerCase()}`;
  const registrationId = `reg-flight-${purchasedVin.toLowerCase()}`;
  const lienId = `lien-${purchasedVin.toLowerCase()}-starter-finance`;
  const pilotName = getPilotName(state);
  const titleStatus = hasStarterLoanLien ? "lien-held" : "owned";
  const currentShipLegal = getCurrentShipLegal(state);

  updateCurrentShipLegal(state, {
    titleHolder: pilotName,
    titleStatus,
    lienHolder: hasStarterLoanLien ? "Yard Exchange Finance Office" : null,
    flightLicenseId: registrationId,
    registrations: {
      ...currentShipLegal.registrations,
      flight: {
        id: registrationId,
        status: "active",
        issuingHubId: "yard-exchange",
      },
      mining: {
        id: `reg-mining-${purchasedVin.toLowerCase()}`,
        status: "provisional",
        issuingHubId: "yard-exchange",
      },
    },
  });

  state.legal.shipTitles[titleId] = {
    id: titleId,
    shipVin: purchasedVin,
    previousVin,
    shipName: offer.title,
    titleHolder: pilotName,
    status: titleStatus,
    lienHolder: hasStarterLoanLien ? "Yard Exchange Finance Office" : null,
    sourceContractId,
    issuedAt: Date.now(),
  };
  state.legal.shipRegistrations[registrationId] = {
    id: registrationId,
    shipVin: purchasedVin,
    shipName: offer.title,
    issuingHubId: "yard-exchange",
    authority: "Yard Exchange Authority",
    status: "active",
    registrationType: "flight",
    regionId: "first-reach",
    heldByContractId: hasStarterLoanLien ? sourceContractId : null,
    issuedAt: Date.now(),
  };
  state.legal.paperwork[registrationId] = {
    id: registrationId,
    type: "ship-registration",
    title: `${offer.title} Flight Registration`,
    status: hasStarterLoanLien ? "held" : "released",
    heldBy: hasStarterLoanLien ? "Yard Exchange Finance Office" : null,
    visibleToPlayer: true,
    canFile: true,
    canRemove: !hasStarterLoanLien,
    linkedContractId: sourceContractId,
  };
  registerPurchasedShipWorldRecords(state, {
    offer,
    purchasedVin,
    titleId,
    registrationId,
    lienId,
    titleStatus,
    hasStarterLoanLien,
    sourceContractId,
  });

  state.ledger.recordEvent("ship.titleIssued", {
    titleId,
    shipVin: purchasedVin,
    shipName: offer.title,
    titleHolder: pilotName,
    status: titleStatus,
    lienHolder: hasStarterLoanLien ? "Yard Exchange Finance Office" : null,
    sourceContractId,
  });
  state.ledger.recordEvent("ship.registered", {
    registrationId,
    shipVin: purchasedVin,
    shipName: offer.title,
    authority: "Yard Exchange Authority",
    registrationType: "flight",
    status: "active",
    heldByContractId: hasStarterLoanLien ? sourceContractId : null,
  });

  if (!hasStarterLoanLien) {
    return;
  }

  state.legal.liens[lienId] = {
    id: lienId,
    holder: "Yard Exchange Finance Office",
    contractId: sourceContractId,
    attachedTo: {
      type: "ship-title",
      shipVin: purchasedVin,
      titleId,
    },
    status: "active",
    releaseWhen: {
      contractId: sourceContractId,
      status: "paid",
    },
    createdAt: Date.now(),
  };
  state.ledger.recordEvent("title.lienAttached", {
    lienId,
    contractId: sourceContractId,
    shipVin: purchasedVin,
    titleId,
    holder: "Yard Exchange Finance Office",
  });
}

function registerPurchasedShipWorldRecords(state, { offer, purchasedVin, titleId, registrationId, lienId, titleStatus, hasStarterLoanLien, sourceContractId }) {
  const pilotName = getPilotName(state);
  const pilotEntityId = getPilotEntityId(state);
  const shipEntityId = getShipAssetId(purchasedVin);
  const titleHolderEntityId = hasStarterLoanLien ? YARD_EXCHANGE_FINANCE_ID : pilotEntityId;

  ensureInstitution(state, {
    id: YARD_EXCHANGE_AUTHORITY_ID,
    name: "Yard Exchange Authority",
    authorityScope: ["ship-registration", "yard-exchange", "first-reach"],
  });
  ensureInstitution(state, {
    id: YARD_EXCHANGE_FINANCE_ID,
    name: "Yard Exchange Finance Office",
    authorityScope: ["loan", "lien", "ship-title-collateral"],
  });
  ensurePerson(state, {
    id: pilotEntityId,
    name: pilotName,
    licenseId: state.legal.pilotLicense.licenseId ?? null,
  });
  ensureShipAsset(state, {
    vin: purchasedVin,
    name: offer.title,
    frameId: state.ship.frameId,
  });

  issueWorldDocument(state, {
    document: {
      id: titleId,
      type: "ship-title",
      title: `${offer.title} Title`,
      status: titleStatus,
      assetEntityId: shipEntityId,
      holderEntityId: titleHolderEntityId,
      beneficialOwnerEntityId: pilotEntityId,
      issuerEntityId: YARD_EXCHANGE_AUTHORITY_ID,
      sourceContractId,
      issuedAt: Date.now(),
    },
    issuerEntityId: YARD_EXCHANGE_AUTHORITY_ID,
    holderEntityId: titleHolderEntityId,
    assetEntityId: shipEntityId,
  });
  issueWorldDocument(state, {
    document: {
      id: registrationId,
      type: "ship-registration",
      title: `${offer.title} Flight Registration`,
      status: "active",
      assetEntityId: shipEntityId,
      holderEntityId: pilotEntityId,
      issuerEntityId: YARD_EXCHANGE_AUTHORITY_ID,
      grants: [
        {
          permission: "operate-ship",
          regionId: "first-reach",
        },
      ],
      heldByContractId: hasStarterLoanLien ? sourceContractId : null,
      issuedAt: Date.now(),
    },
    issuerEntityId: YARD_EXCHANGE_AUTHORITY_ID,
    holderEntityId: pilotEntityId,
    assetEntityId: shipEntityId,
  });
  upsertWorldRelationship(state, {
    fromId: pilotEntityId,
    toId: shipEntityId,
    type: WORLD_RECORD_RELATIONSHIPS.OWNS,
    sourceDocumentId: titleId,
    status: titleStatus,
  });

  if (!hasStarterLoanLien) {
    return;
  }

  issueWorldDocument(state, {
    document: {
      id: lienId,
      type: "lien",
      title: `${offer.title} Starter Finance Lien`,
      status: "active",
      holderEntityId: YARD_EXCHANGE_FINANCE_ID,
      issuerEntityId: YARD_EXCHANGE_FINANCE_ID,
      assetEntityId: shipEntityId,
      collateralDocumentId: titleId,
      contractId: sourceContractId,
      releaseWhen: {
        contractId: sourceContractId,
        status: "paid",
      },
      issuedAt: Date.now(),
    },
    issuerEntityId: YARD_EXCHANGE_FINANCE_ID,
    holderEntityId: YARD_EXCHANGE_FINANCE_ID,
    assetEntityId: shipEntityId,
  });
  upsertWorldRelationship(state, {
    fromId: lienId,
    toId: titleId,
    type: WORLD_RECORD_RELATIONSHIPS.COLLATERALIZES,
  });
}

function getPilotEntityId(state) {
  const licenseId = state.legal.pilotLicense.licenseId;
  if (licenseId) {
    return `person:${licenseId}`;
  }

  return "person:unlicensed-pilot";
}
