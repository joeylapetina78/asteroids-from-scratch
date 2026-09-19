import { getCurrentShipLegal, getPilotName, updateCurrentShipLegal } from "./legalRecords.js?v=fresh-20260919-1656-acd17d89";
import { canSpendCredits, getCredits, spendCredits } from "./accounts.js?v=fresh-20260919-1656-acd17d89";
import { registerHull, setActiveHull } from "./hulls.js?v=fresh-20260919-1656-acd17d89";
import {
  WORLD_RECORD_RELATIONSHIPS,
  ensureInstitution,
  ensurePerson,
  ensureShipAsset,
  getShipAssetId,
  issueWorldDocument,
  upsertWorldRelationship,
} from "./worldRecords.js?v=fresh-20260919-1656-acd17d89";

const YARD_EXCHANGE_AUTHORITY_ID = "institution:yard-exchange-authority";
const SABLE_LEDGER_ID = "institution:sable-ledger";

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
  // Stays an ORE WORKER. The purchased Skiff-M is the same class of working
  // hull the player flew in for Rook and the same one every NPC miner flies;
  // swapping it to the angular `yard-skiff` silhouette on purchase made buying
  // your own ship look like changing species. Drawn from the shared
  // `mining-craft` outline, so it cannot drift from the fleet around it.
  state.ship.frameId = "mining-worker";
  state.ship.name = offer.title;
  state.ship.shape = "mining-worker";
  const previousVin = state.components.hull.vin;
  const purchasedVin = "YRDSKF-M-2B7";
  const activeStarterLoan = state.contracts.records["mako-starter-ship-loan"];
  const hasStarterLoanLien = activeStarterLoan && ["active", "fulfilled"].includes(activeStarterLoan.status);

  state.components.hull.vin = purchasedVin;
  setActiveHull(state, purchasedVin);
  state.components.hull.integrity = state.components.hull.maxIntegrity;
  state.components.engine.fuelBurnRate = 4.5;
  state.components.engine.maxFuel = 2000;
  state.components.engine.fuel = Math.max(state.components.engine.fuel, 1200);
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

// The campaign purchase: not a new hull off a lot, but the impounded wreck the
// player just delivered, sold by the Authority through Rook's arrangement and
// paid for with Mako's money. The VIN does not change — it is the same ship —
// so the title moves from the Authority's impound to the pilot's name, the
// one-trip permit becomes a real registration, and the lien lands on it. The
// miner and hold were bolted on all along; they are the player's now.
export const SALVAGE_HULL_OFFER_ID = "authority-salvage-hull";
export const SALVAGE_HULL_PRICE = 20000;

export function purchaseSalvageHullFromAuthority(state, { price = SALVAGE_HULL_PRICE, loanContractId = "mako-starter-ship-loan" } = {}) {
  if (state.ship.purchasedOfferId) {
    return { ok: false, reason: "already-purchased" };
  }
  if (!canSpendCredits(state, price)) {
    state.ledger.recordEvent(
      "merchant.cannotAfford",
      { offerId: SALVAGE_HULL_OFFER_ID, shipName: state.ship.name, price, credits: Math.floor(getCredits(state)) },
      { visible: false },
    );
    return { ok: false, reason: "insufficient-credits" };
  }

  spendCredits(state, price);
  state.ship.purchasedOfferId = SALVAGE_HULL_OFFER_ID;
  const vin = state.components.hull.vin;
  const loan = state.contracts.records[loanContractId];
  const hasLien = Boolean(loan && ["active", "fulfilled"].includes(loan.status));
  const offer = {
    id: SALVAGE_HULL_OFFER_ID,
    title: state.ship.name,
    price,
    includedComponents: ["hull", "engine", "beacon-locator", "miner", "cargo"],
  };

  state.components.miner.installed = true;
  state.components.cargoHold.installed = true;
  state.components.engine.powerLocked = false;
  // The one-trip permit the hull flew in on expires on arrival, as it says.
  const permitId = getCurrentShipLegal(state).registrations?.flight?.id ?? null;
  registerHull(state, { vin, name: state.ship.name, frameId: state.ship.frameId, status: hasLien ? "financed" : "owned" });
  registerPurchasedShipLegalRecords(state, {
    offer,
    previousVin: vin,
    purchasedVin: vin,
    hasStarterLoanLien: hasLien,
    sourceContractId: hasLien ? loan.id : null,
    titleNotes: [
      "Recovered hull, sold out of Yard Exchange Authority impound.",
      "Sale arranged by Rook Industries, sponsoring operator of record.",
      hasLien ? "Purchase financed; lien held by Sable Ledger until paid." : "Purchase paid in full.",
    ],
  });
  const permit = permitId ? state.worldRecords?.documents?.[permitId] : null;
  if (permit && permit.status === "temporary") permit.status = "expired";
  state.ledger.recordEvent("ship.purchased", {
    offerId: SALVAGE_HULL_OFFER_ID,
    shipName: state.ship.name,
    price,
    creditsRemaining: Math.floor(getCredits(state)),
    includedComponents: offer.includedComponents,
    previousVin: vin,
    shipVin: vin,
  });

  return { ok: true };
}

function registerPurchasedShipLegalRecords(state, { offer, previousVin, purchasedVin, hasStarterLoanLien, sourceContractId, titleNotes = null }) {
  const titleId = `title-${purchasedVin.toLowerCase()}`;
  const registrationId = `reg-flight-${purchasedVin.toLowerCase()}`;
  const lienId = `lien-${purchasedVin.toLowerCase()}-starter-finance`;
  const pilotName = getPilotName(state);
  const titleStatus = hasStarterLoanLien ? "lien-held" : "owned";
  const currentShipLegal = getCurrentShipLegal(state);

  updateCurrentShipLegal(state, {
    titleHolder: pilotName,
    titleStatus,
    lienHolder: hasStarterLoanLien ? "Sable Ledger" : null,
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
    lienHolder: hasStarterLoanLien ? "Sable Ledger" : null,
    sourceContractId,
    notes: titleNotes ?? undefined,
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
    heldBy: hasStarterLoanLien ? "Sable Ledger" : null,
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
    titleNotes,
  });

  state.ledger.recordEvent("ship.titleIssued", {
    titleId,
    shipVin: purchasedVin,
    shipName: offer.title,
    titleHolder: pilotName,
    status: titleStatus,
    lienHolder: hasStarterLoanLien ? "Sable Ledger" : null,
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
    holder: "Sable Ledger",
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
    holder: "Sable Ledger",
  });
}

function registerPurchasedShipWorldRecords(state, { offer, purchasedVin, titleId, registrationId, lienId, titleStatus, hasStarterLoanLien, sourceContractId, titleNotes = null }) {
  const pilotName = getPilotName(state);
  const pilotEntityId = getPilotEntityId(state);
  const shipEntityId = getShipAssetId(purchasedVin);
  const titleHolderEntityId = hasStarterLoanLien ? SABLE_LEDGER_ID : pilotEntityId;

  ensureInstitution(state, {
    id: YARD_EXCHANGE_AUTHORITY_ID,
    name: "Yard Exchange Authority",
    authorityScope: ["ship-registration", "yard-exchange", "first-reach"],
  });
  ensureInstitution(state, {
    id: SABLE_LEDGER_ID,
    name: "Sable Ledger",
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
      summary: hasStarterLoanLien
        ? "Title to a hull held in the pilot's name, with a lender's lien on it until the financing is paid."
        : "Title to a hull held outright in the pilot's name.",
      notes: titleNotes ?? undefined,
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
      holderEntityId: SABLE_LEDGER_ID,
      issuerEntityId: SABLE_LEDGER_ID,
      assetEntityId: shipEntityId,
      collateralDocumentId: titleId,
      contractId: sourceContractId,
      releaseWhen: {
        contractId: sourceContractId,
        status: "paid",
      },
      issuedAt: Date.now(),
    },
    issuerEntityId: SABLE_LEDGER_ID,
    holderEntityId: SABLE_LEDGER_ID,
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
