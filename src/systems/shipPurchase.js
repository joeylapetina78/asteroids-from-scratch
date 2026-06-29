export function purchaseShipOffer(state, offer) {
  if (state.components.merchant.purchasedOfferId) {
    return { ok: false, reason: "already-purchased" };
  }

  if (state.components.account.credits < offer.price) {
    state.ledger.recordEvent(
      "merchant.cannotAfford",
      {
        offerId: offer.id,
        shipName: offer.title,
        price: offer.price,
        credits: Math.floor(state.components.account.credits),
      },
      { visible: false },
    );
    return { ok: false, reason: "insufficient-credits" };
  }

  state.components.account.credits -= offer.price;
  state.components.merchant.purchasedOfferId = offer.id;
  state.ship.frameId = "yard-skiff-miner";
  state.ship.name = offer.title;
  state.ship.shape = "yard-skiff";
  state.components.hull.vin = "YRDSKF-M-2B7";
  state.components.hull.integrity = state.components.hull.maxIntegrity;
  state.components.engine.fuelBurnRate = 4.5;
  state.components.engine.maxFuel = 260;
  state.components.engine.fuel = Math.max(state.components.engine.fuel, 220);
  state.components.engine.powerLocked = false;
  state.components.miner.installed = true;
  state.components.miner.ammo = Math.max(state.components.miner.ammo, 150);
  state.components.cargoHold.installed = true;
  state.ledger.recordEvent("ship.purchased", {
    offerId: offer.id,
    shipName: offer.title,
    price: offer.price,
    creditsRemaining: Math.floor(state.components.account.credits),
    includedComponents: offer.includedComponents,
  });

  return { ok: true };
}
