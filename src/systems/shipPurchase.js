import { getCurrentShipLegal, getPilotName, updateCurrentShipLegal } from "./legalRecords.js?v=legal-single-home-v1";

export function purchaseShipOffer(state, offer) {
  if (state.ship.purchasedOfferId) {
    return { ok: false, reason: "already-purchased" };
  }

  if (state.credits < offer.price) {
    state.ledger.recordEvent(
      "merchant.cannotAfford",
      {
        offerId: offer.id,
        shipName: offer.title,
        price: offer.price,
        credits: Math.floor(state.credits),
      },
      { visible: false },
    );
    return { ok: false, reason: "insufficient-credits" };
  }

  state.credits -= offer.price;
  state.ship.purchasedOfferId = offer.id;
  state.ship.frameId = "yard-skiff-miner";
  state.ship.name = offer.title;
  state.ship.shape = "yard-skiff";
  const previousVin = state.components.hull.vin;
  const purchasedVin = "YRDSKF-M-2B7";
  const activeStarterLoan = state.contracts.records["mako-starter-ship-loan"];
  const hasStarterLoanLien = activeStarterLoan && ["active", "fulfilled"].includes(activeStarterLoan.status);

  state.components.hull.vin = purchasedVin;
  state.components.hull.integrity = state.components.hull.maxIntegrity;
  state.components.engine.fuelBurnRate = 4.5;
  state.components.engine.maxFuel = 260;
  state.components.engine.fuel = Math.max(state.components.engine.fuel, 220);
  state.components.engine.powerLocked = false;
  state.components.miner.installed = true;
  state.components.miner.ammo = Math.max(state.components.miner.ammo, 150);
  state.components.cargoHold.installed = true;
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
    creditsRemaining: Math.floor(state.credits),
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
