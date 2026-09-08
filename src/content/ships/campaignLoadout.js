// What a Rook hand is issued on day one.
//
// This is not a new design. `shipOffers.js` has carried the
// `rook-yard-skiff-miner` since long before campaign mode existed — "a cheap
// working hull with a miner and cargo hold bolted in. Ugly, slow, and legal",
// with `includedComponents` of Engine, Hull, Docking, Beacon Locator, Miner,
// Cargo Hold and the tradeoff line "Eligible for Rook work". Campaign starts
// the player in exactly that ship, so the loadout lives here as one list rather
// than being spelled out again inside `main.js` where it would quietly drift
// from the offer it is supposed to be.
//
// `campaignLoadout.test.mjs` pins it against the offer in both directions.

export const CAMPAIGN_SHIP_OFFER_ID = "rook-yard-skiff-miner";
export const CAMPAIGN_SHIP_NAME = "Rook Yard Skiff";

// A hand flies a fleet miner, so the player's hull is the ORE WORKER every NPC
// miner in the world flies — same outline, same cab, painted in the operator's
// colours. A distinct silhouette would quietly tell the player they are a
// special case, which is the opposite of what campaign is for. The angular
// `yard-skiff-miner` frame is kept in `SHIP_FRAMES` for a later, better hull to
// earn; it is simply not what Rook issues on day one.
export const CAMPAIGN_SHIP_FRAME_ID = "mining-worker";

// Component state ids, as keyed on `state.components`.
export const CAMPAIGN_FITTED_COMPONENT_IDS = Object.freeze([
  "engine", "hull", "docking", "beaconLocator", "miner", "cargoHold",
]);

// Bolted in, and dead.
//
// The skiff HAS a processor; it does not work, and nobody at Rook has paid to
// fix it. That is the in-world reason a hand's ore drops straight into the hold
// instead of being refined on the way home — a visible broken panel rather than
// an unexplained absence. It is not in `includedComponents` on the offer because
// a dead unit is not something the yard advertises.
export const CAMPAIGN_BROKEN_COMPONENT_IDS = Object.freeze(["processor"]);

// Everything the skiff does not carry at all, listed explicitly rather than left
// to default to false. A restored save or a future default flip must not be able
// to quietly hand a Rook hand a scanner it never earned.
export const CAMPAIGN_UNFITTED_COMPONENT_IDS = Object.freeze([
  "scanner", "collector", "beaconBay", "towCable", "mossSeeder",
]);

// Panel ids, as used by `setComponentAvailable` and the journey director. A
// panel shown here that the hull does not carry is a promise the ship cannot
// keep, so this is derived from the fitted list plus the two frame panels every
// start needs.
// The processor panel IS shown, broken. Hiding it would leave the player with an
// unexplained routing rule; showing a dead one explains itself and puts a repair
// on the board as something to want.
export const CAMPAIGN_PANEL_IDS = Object.freeze([
  "viewport", "engine", "hull", "docking", "beacon-locator", "miner", "cargo", "processor", "contract",
]);

// The charge a company skiff leaves the yard with. Running dry is a real
// dependency on Rook rather than a fail state.
export const CAMPAIGN_MINER_AMMO = 150;

// How used the company laser is, expressed as prior trips through the SHARED
// wear ladder rather than as a special wear rate. A hidden "campaign lasers wear
// faster" rule would be invisible to the player and unserviceable; a much-repaired
// emitter most of the way to Degraded is the same machine everyone else uses,
// starting from a worse place, and Sal can fix it like any other panel.
export const CAMPAIGN_MINER_PRIOR_SERVICES = 3;
export const CAMPAIGN_MINER_WEAR_FRACTION = 0.72;
