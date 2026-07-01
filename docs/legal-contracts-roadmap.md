# Legal, Contracts, And Ownership Roadmap

This note captures the direction for licenses, ship registration, title, liens, restricted loan funds, and contract-driven ownership. The goal is to make these reusable game systems, not one-off mission tricks.

The story should introduce these systems. It should not be the hidden machinery that makes them work.

## Core Rule

If a legal/economy behavior could happen outside the tutorial, it belongs in a system.

Examples:

- A loan should know what it funds.
- A ship purchase should produce ownership and registration records.
- A hub should be able to inspect ship VIN, registration, pilot license, and title holder.
- A lender should be able to hold title or registration until the debt is paid.
- A contract should be able to create, lock, release, or transfer paperwork.
- Missions should point the player toward those systems and listen to their ledger events.

## Current Prototype State

The game already has useful pieces:

- `contractManager` owns contract records, statuses, fulfillment, loan disbursement, and payout.
- `eventLedger` records `contract.accepted`, `loan.disbursed`, `ship.purchased`, `ship.registryReviewed`, and related events.
- `state.ship.legal` already has a title holder, flight license id, and registration slots.
- The hull has a VIN and a `vinPlateAttached` flag.
- The license and contract panels are now paperwork panels that can live on the desktop or in the drawer.
- Hub authority can already greet/check the ship with VIN and license language.

The main gap:

- Loans currently just add credits.
- Ship purchase currently spends normal credits and directly updates ship state.
- Registration/title/lien behavior exists mostly as state shape and story idea, not as a reusable system.

That is okay for the prototype, but the next foundation should move those rules into reusable contract/economy/legal systems.

## Important Terms

### Pilot License

Permission for the pilot to operate in some scope. This is about the person.

```js
{
  id: "RTC-P2026-77918",
  holderName: "Joey Lapetina",
  issuingAuthority: "Reach Transit Commission",
  status: "active",
  class: "provisional",
  authorizedRegions: ["first-reach"],
  authorizedZones: ["starter-drift"],
  expiresAt: null
}
```

### Ship Title

Who owns the ship. This is about ownership.

```js
{
  shipVin: "YRDSKF-M-2B7",
  titleHolder: "Joey Lapetina",
  status: "lien-held",
  lienHolder: "Yard Exchange Finance Office",
  sourceContractId: "mako-starter-ship-loan"
}
```

### Ship Registration

Permission for a ship VIN to operate in a place or role. This is about the ship being recognized by hubs/authorities.

```js
{
  id: "YR-FLIGHT-TEMP-7A3",
  shipVin: "YRDSKF-M-2B7",
  issuingHubId: "yard-exchange",
  authority: "Yard Exchange Authority",
  status: "active",
  registrationType: "flight",
  regionId: "first-reach",
  heldByContractId: null
}
```

### Lien

A claim against a ship, title, registration, or account until an obligation is paid.

```js
{
  id: "lien-mako-starter-ship",
  holder: "Yard Exchange Finance Office",
  contractId: "mako-starter-ship-loan",
  attachedTo: {
    type: "ship-title",
    shipVin: "YRDSKF-M-2B7"
  },
  status: "active",
  releaseWhen: {
    contractId: "mako-starter-ship-loan",
    status: "paid"
  }
}
```

This is the useful game mechanic: you can fly the ship, but someone else can still have a legal hook in it.

### Restricted Account / Escrow

Money that exists, but can only be used for specific purposes.

```js
{
  id: "acct-mako-starter-purchase",
  accountType: "restricted-credit",
  holder: "Joey Lapetina",
  balance: 20000,
  allowedUses: [
    {
      type: "ship-purchase",
      offerIds: ["rook-yard-skiff-miner"],
      serviceId: "yard-shipyard"
    }
  ],
  sourceContractId: "mako-starter-ship-loan"
}
```

This solves the question: "What if the player spends the loan money on something else?"

First implementation can be simpler: keep normal credits, but mark a contract as `fundingPurpose: "starter-ship-purchase"`. Later, split accounts.

## Contract Capabilities

Contracts should grow from "accept/pay" into formal rule objects.

```js
{
  id: "mako-starter-ship-loan",
  type: "loan",
  issuer: "Yard Exchange Finance Office",
  terms: {
    principal: 20000,
    interestRate: 0.12,
    fundingPurpose: "starter-ship-purchase",
    restrictedToOfferIds: ["rook-yard-skiff-miner"],
    requiredPurchaseServiceId: "yard-shipyard"
  },
  onAccepted: [
    { type: "openRestrictedAccount", accountId: "acct-mako-starter-purchase", amount: 20000 },
    { type: "createLien", lienId: "lien-mako-starter-ship" }
  ],
  onPaid: [
    { type: "releaseLien", lienId: "lien-mako-starter-ship" },
    { type: "releasePaperwork", paperworkId: "title-yrdskf-m-2b7" }
  ]
}
```

This is not meant to be built all at once. It is the target shape.

## Starter Ship Purchase

The story version:

1. Rook sends player to Barvis.
2. Barvis shows ships.
3. Player cannot afford the Rook special.
4. Barvis sends player to Mako.
5. Mako offers starter financing.
6. Player accepts loan.
7. Player returns to Barvis.
8. Player buys ship.
9. Barvis registers the ship.
10. Rook offers mining work.

The system version:

1. Shipyard service offers ship purchase packages.
2. Purchase package can require enough credits or restricted funds, pilot license, registration fee, title paperwork, and optional permits.
3. Finance service can offer a loan contract.
4. Loan contract can create debt balance, restricted purchase funds, and a lien against future title/registration.
5. Ship purchase action can create title, registration, installed components, and ledger events.
6. The mission listens for `loan.disbursed`, `ship.purchased`, `ship.registered`, and `title.lienAttached`.

The mission does not manually grant the ship.

## Paperwork Flow

Paperwork should become a visible version of important records.

Current paperwork:

- pilot license
- contract

Future paperwork:

- ship title
- ship registration
- lien notice
- restricted account agreement
- mining permit
- insurance certificate
- debt statement

Important rule:

Paperwork can be visible, filed, held, locked, or released.

```js
{
  id: "registration-yrdskf-m-2b7",
  type: "ship-registration",
  title: "Yard Skiff-M Flight Registration",
  status: "held",
  heldBy: "Yard Exchange Finance Office",
  visibleToPlayer: true,
  canFile: true,
  canRemove: false,
  linkedContractId: "mako-starter-ship-loan"
}
```

This matches the feeling: the player signs off on registration, but Mako keeps the controlling document until the debt is paid.

## Staged Implementation

### Stage 1: Document The Foundation

Status: this file.

No gameplay changes. Keep testers moving.

### Stage 2: Add Legal Record Shape To Game State

Status: started.

Add structured state, but keep existing gameplay behavior.

Likely files:

- `src/state/gameState.js`
- `src/systems/saveManager.js`

Possible shape:

```js
legal: {
  pilotLicenses: {},
  shipTitles: {},
  shipRegistrations: {},
  liens: {},
  paperwork: {}
}
```

Risk: low if only initialized and saved.

### Stage 3: Make Ship Purchase Emit Registration/Title Events

Status: started for the Rook special starter ship.

Keep Barvis flow intact, but make `purchaseShipOffer` create real legal records.

Likely files:

- `src/systems/shipPurchase.js`
- `src/state/gameState.js`
- `src/systems/eventLedger.js`

Add events:

- `ship.titleIssued`
- `ship.registered`
- `title.lienAttached`

Risk: low to medium. This is the first real behavior change.

### Stage 4: Add Registration Paperwork

Show a registration document after ship purchase. For first pass, it can be read-only and filed like the license/contract.

Likely files:

- `index.html`
- `src/main.js`
- `src/styles.css`

Risk: medium because paperwork layout is young.

### Stage 5: Add Loan Intent

Give the Mako starter loan a funding purpose and bind it to the Rook special ship purchase.

First simple version:

- Loan still deposits credits.
- Contract record stores `fundingPurpose`.
- Ship purchase records that the Mako loan funded the ship if active.
- Title/registration are marked lien-held.

Later version:

- Loan creates restricted account/escrow.
- Ship purchase can spend from restricted account only on approved offers.

Likely files:

- `src/content/contracts/chapterOneContracts.js`
- `src/systems/contractManager.js`
- `src/systems/shipPurchase.js`

Risk: medium. Keep the simple version first so testers can still buy the ship.

### Stage 6: Make Debt Payoff Release Paperwork

When loan balance reaches zero:

- release lien
- transfer title status from `lien-held` to `owned`
- release held registration/title paperwork
- record `title.lienReleased`

Likely files:

- future finance/payment system
- `src/systems/contractManager.js`
- `src/systems/eventLedger.js`
- paperwork UI

Risk: medium to high because payment UI is not finished yet.

## Recommended Next Playable Chunk

Do not build restricted accounts yet.

The best next playable step is:

1. Add legal records for title, registration, and liens to `gameState`.
2. Update ship purchase so buying the Rook special creates:
   - title record
   - registration record
   - lien-held status tied to Mako loan if that loan is active
3. Record ledger events for those records.
4. Add a short Barvis/Mako line that explains:
   - the ship is registered
   - the finance office holds title paperwork until the starter loan is paid

This gives the world the right legal skeleton without blocking testers behind a stack of forms.

After that, add the actual registration paperwork card as a visual/paperwork pass.

## What To Avoid Right Now

- Do not make every document its own panel immediately.
- Do not create a full banking UI before the loan payoff loop exists.
- Do not make the first mission require too many approvals before the player can fly.
- Do not let missions directly mutate title/registration records.
- Do not make Mako-only logic inside Barvis or Rook.

## Useful Future Event Names

- `pilot.licenseIssued`
- `pilot.licenseRestricted`
- `ship.titleIssued`
- `ship.titleTransferred`
- `ship.registered`
- `ship.registrationHeld`
- `ship.registrationReleased`
- `title.lienAttached`
- `title.lienReleased`
- `account.opened`
- `account.fundsRestricted`
- `account.fundsReleased`
- `loan.disbursed`
- `loan.paymentMade`
- `loan.paidOff`

These events let missions, hub authorities, NPCs, contracts, achievements, and future reputation systems listen without knowing each other's internals.
