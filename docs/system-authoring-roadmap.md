# System Authoring Roadmap

This project should grow into a world of reusable systems, not a stack of one-off missions. Missions should introduce mechanics, contracts should represent work in the world, and NPCs should eventually use many of the same systems the player uses.

## Current Direction

The strongest foundation pieces are already in place:

- `eventLedger` records world facts and derives stats/signals.
- `missionRunner` advances authored mission beats from ledger events.
- `contractManager` owns contract records and payment state.
- `hubServices` exposes hub NPC/service windows from authored service data.
- `hubServiceBehaviors` maps service types to the current UI behavior they open.
- `hubServiceContracts` chooses the next contract a hub NPC/service should offer.
- `componentRegistry` separates UI panel availability from installed ship systems.
- `legalRecords` gathers pilot, title, registration, lien, and paperwork state.
- `worldRecords` stores the first shared entity/document/relationship facts for people, institutions, ship assets, licenses, registrations, titles, and liens.
- `accounts` stores the current cash account while keeping `state.credits` as a compatibility mirror.
- `obligations` stores loan/debt records and derives the old `state.debt` summary.

The main risk is not that these systems are wrong. The risk is that new behavior still sometimes gets attached to `main.js` or `game.js` as a special case before it has a reusable home.

## Authoring Goal

Future mission and contract tools should be able to create content from safe vocabulary, not arbitrary code.

That means authored data should eventually be built from:

- Event rules: what world fact does this beat care about?
- Conditions: what must be true before this rule can fire?
- Actions: what safe system command runs when it fires?
- Contract terms: what obligations make a contract fulfillable?
- Contract effects: what happens when a contract is accepted, fulfilled, paid, failed, or abandoned?

The current JavaScript mission files are still useful while the shape evolves, but they should keep moving toward data that could later be validated, edited, and stored by a web interface.

`contentValidation.js` and `npm run validate:content` are the first validation pass for that future. They check the authored Chapter 1 content for unknown mission actions, missing required action fields, missing beat references, unknown contract requirement predicates, missing contract references, missing hub service references, invalid service types, invalid service contract prerequisites, missing panel ids, missing component ids/keys, attention targets, and component shop offer references.

## Near-Term Refactor Track

### 1. Mission Vocabulary

`missionActions.js` now lists and runs the current mission action vocabulary. `missionRules.js` owns event matching, cooldowns, flags, response rotation, stat checks, recent-event checks, and signal checks.

This makes `missionRunner.js` more like an engine: it advances beats, but the rule/action vocabulary is no longer hidden inside it.

Next improvement:

- Extend validation warnings when mission data uses an unknown optional field or invalid event shape.
- Use the existing action metadata to generate editor labels and form fields.

### 2. Contract Vocabulary

`contractRules.js` now maps ledger events to fulfillment checks for current delivery contracts. The first delivery contract also has a `terms.requires` list, which is the seed of a reusable contract predicate language. Resource delivery still uses an explicit deposit action because it consumes cargo one unit at a time. The system is more readable, but it is not yet generic enough for loans, liens, registrations, salvage jobs, hauling jobs, bounty jobs, tow jobs, or patrol jobs.

Next improvement:

- Introduce contract term predicates such as `dockAt`, `shipVinAttached`, `poweredDown`, `resourceDelivered`, `cargoDelivered`, `titleHeldBy`, `licenseValid`, and `debtPaid`.
- Introduce contract lifecycle effects such as `addCredits`, `disburseLoan`, `attachLien`, `issueTitle`, `registerShip`, `unlockService`, and `offerFollowupContract`.
- Extend the content validator to check those predicates and effects before contracts are offered in game.

### 3. Comms Director

`commsDirector.js` now gives non-mission speech a front door. Journey remains the display and mission speech path, while hub authority, tow drivers, service NPCs, component shops, and world NPCs route through the comms director. It has a small priority queue so important non-mission speech can wait behind approval-required mission messages instead of disappearing.

Next improvement:

- Expand queueing for speech sources like `mission`, `hub-authority`, `tow`, `service-npc`, and `flavor`.
- Refine message priority, expiration, and interruption rules.
- Let low-priority flavor wait until approval-required mission messages are clear.
- Add source-specific styling or portraits without putting that logic into missions.
- Follow [comms-attention-roadmap.md](comms-attention-roadmap.md) for the separate attention-target contract, viewport banner prototype, and responsive anchoring rules.

### 4. Hub Service Controllers

Hub service data is already authored, and `hubServiceBehaviors.js` now centralizes the first behavior mapping: which panel a service type opens, whether it offers contracts, and what short prompt it shows. `hubServiceContracts.js` also owns the first reusable hub job-board decision: mission-first contracts, single-active boards, prerequisites, repeatable offers, and emergency finance. Some service behavior still lives in `main.js`, but the branch point is no longer scattered through the browser coordinator.

Next improvement:

- Move service-specific behavior into small controllers: `shipyardService`, `financeService`, `supplyService`, `contractBoardService`, and `componentShopService`.
- Let hub services declare which controller/behavior they use instead of relying only on `serviceType`.
- Let missions unlock services and point players toward them, without directly simulating the service interaction.
- Let service controllers use `hubServiceContracts` instead of rebuilding contract-board logic in each NPC window.

### 5. Accounts, Economy, And Legal Records

The game currently has a cash account bridge, debt summary, pilot license data, ship title/registration records, liens, and a generic `worldRecords` bridge. Pilot license issuance and starter ship purchase now write both compatibility legal state and generic entity/document/relationship records.

`state.accounts` is the first real money container. `state.credits` still exists as a compatibility mirror for current UI and old code, but new credit changes should go through `accounts.js`. When the provisional license is issued, the current cash account is assigned to that person entity. That keeps the fiction pointed toward "this licensed person holds this account" instead of "the player has money."

`payments.js` is the first generic payment doorway. It creates payment requests and receipts for any payable thing, then records `payment.made` in the ledger. Loan repayment now uses this path, and future fines, fees, purchases, bribes, contract deposits, tolls, and service charges should move through the same payment request/receipt shape.

`state.obligations` is the first real debt container. Loan contracts now create obligation records with debtor, creditor, principal, balance, max balance, and source contract. Finance can take payments against those obligation records, and a paid-off obligation releases starter lien/title paperwork in the compatibility legal records. `state.debt` remains a compatibility summary derived from obligations.

The paperwork drawer now separates contract records from the contract reader. Open contracts appear as small file cards in the drawer, while the full contract panel acts as a reader/editor for whichever file is selected. That is a bridge toward real document instances without duplicating every full document UI panel immediately.

Next improvement:

- Add more account types: restricted loan funds, escrow, held cargo value, institutional accounts, and contract-specific accounts.
- Make loan contracts able to restrict funds to a purchase purpose.
- Expand payment actions into a fuller finance/payment UI with custom amounts and payment history.
- Let ship purchase produce title, registration, and lien paperwork as contract/legal effects.
- Let hubs review registration/licensing through legal records instead of mission-specific checks.

### 6. World Simulation Levels

The world should eventually support NPCs doing player-like work without simulating every object at full fidelity.

Next improvement:

- Keep near-world physics in `game.js`.
- Add lightweight job/route records for far-away NPC work.
- Promote local NPCs into full simulation when they enter the active area.
- Demote them back to records when they leave.

## What To Avoid For Now

- Do not build every future career yet.
- Do not replace the working world with streaming until fixed-field limits actually block testing.
- Do not turn mission files into strict JSON too early if JavaScript predicates are still helping discovery.
- Do not keep adding service-specific branches to `main.js` when a new service controller would be clearer.

## Design Rule

If the player can do a thing and an NPC might eventually do the same thing, build it as a world system first. Then let missions, contracts, hubs, and NPCs use that system.

## Ownership Audit Notes

The current mission/content split is moving in the right direction:

- Missions define beats, rules, conditions, and requested actions.
- `missionRunner` listens to ledger events and runs the authored actions.
- `missionActions` is the bridge from authored mission data into shared systems.
- Entities such as ships, NPC ships, asteroids, pickups, and lifeforms mostly hold local physical state and behavior. They do not own mission, contract, economy, legal, or document systems.
- Contracts, paperwork inspections, hub services, world records, zones, fields, audio, and rendering live as shared systems.

The remaining weak points are naming and a few bridge actions:

- Ledger signals named `player.*` are now compatibility aliases for the single controlled pilot/ship. New mission content should prefer actor/entity-scoped signals such as `actor.hasDocked`, `controlledShip.hasThrusted`, `pilot.hasDebt`, or relationship-specific facts keyed by entity id.
- `missionActions` still has low-level component mutation actions such as `setComponentValue` and `raiseComponentValue`. They are useful for Chapter 1 scripting, but future mission actions should prefer higher-level system commands like `grantComponentCharge`, `setShipPowerLock`, `issueDocument`, `offerContract`, or `depositToAccount`.
- Obligation payment is not implemented yet. Loans can create obligations, but repayment schedules, payment allocation, paid-off events, lien release, and title release still need a reusable obligation/economy system pass.

The guiding test is: if the same action could be done by an NPC, company, hub, repo crew, patrol, stolen ship, or future multiplayer pilot, it should not become `player.whatever`. It should become a relationship, event, document, account entry, component state, or system command that any valid actor/entity can use.
