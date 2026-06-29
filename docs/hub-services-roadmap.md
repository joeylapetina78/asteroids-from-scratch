# Hub services and mission systems roadmap

This roadmap is the working track for moving from the current prototype toward scalable mission, contract, NPC, hub, and ship-service systems.

The main rule is:

> Build reusable game systems first, then make authored story content use those systems.

The story can introduce, unlock, restrict, or point toward systems. It should not fake the systems itself.

## Current situation

The game already has useful foundation pieces:

- `Journey` is the ship communicator and story surface.
- `Journey Director` owns the active mission runner.
- `Mission Runner` executes authored mission steps, event transitions, considerations, and actions.
- `Contract Manager` listens to the ledger and owns contract status, fulfillment, and payout.
- `Event Ledger` is the shared memory spine for world facts.
- `Hub`, `Merchant`, `Contract`, and ship component panels exist as draggable ship UI.

The rough edge is that mission content still directly drives too many service-like moments. Barvis, Mako, Rook contracts, ship sales, financing, and hub services are partly story beats and partly real game systems.

## Target model

### Mission NPCs

Mission NPCs speak through the ship communicator, currently the Journey panel.

They can:

- say authored lines
- respond when the active mission sees matching ledger events
- respond to considerations that do not advance the main mission path
- show or hide ship panels
- request ship/system updates through explicit actions
- offer contracts through the contract system
- point the player toward hub NPCs and services

They should not directly sell ships, repair hulls, sell fuel, sell charges, or run financing.

### Hub NPCs

Hub NPCs live at hub service windows. They belong to a hub and provide concrete services.

They can:

- open service panels
- sell ships
- offer loans
- offer repeatable contracts
- repair hulls
- sell supplies
- buy resources
- respond to the player's account, contracts, ship state, and ledger history

The same character can exist as both a mission NPC and a hub NPC, but those are separate roles in code. Rook can talk through Journey for a mission and also be a Yard Exchange service contact.

### Contracts

Contracts are formal game objects with:

- issuer
- status
- requirements
- fulfillment rules
- payout rules
- repeatability
- penalties or modifiers later
- optional links to hub NPCs or mission NPCs

Missions may offer or care about contracts, but contracts enforce contract rules.

### Hubs

Hubs should expose a menu of available services when docked.

For Yard Exchange, the first planned service roster is:

- `Rook / Rook Industries`: resource collection contracts
- `Barvis / Yard Exchange Shipyard`: ship sales
- `Mr. Mako / Yard Exchange Finance`: loan contracts and later payments
- `Finley / Yard Exchange Supply`: repair, mining charges, scanergy, fuel, and low-rate resource buying

## Today's track

### Step 1: Document and freeze the architecture direction

Status: next.

Deliverable:

- This roadmap exists in `docs/hub-services-roadmap.md`.
- `project-map.md` links to it.

Purpose:

- Keep us from solving every new problem with one-off story code.
- Give future changes a known direction.

### Step 2: Add hub service data

Goal:

- Create authored hub service definitions without changing the whole UI yet.

Likely files:

- `src/content/hubs/yardExchangeServices.js`
- maybe `src/systems/hubServices.js`
- `src/systems/worldSites.js`

Data shape proposal:

```js
export const hubServices = {
  "yard-exchange": [
    {
      id: "rook-industries",
      npcId: "rook",
      npcName: "Rook",
      organization: "Rook Industries",
      serviceType: "contracts",
      label: "Rook Industries",
      description: "Resource work and starter hauling jobs.",
    },
    {
      id: "yard-shipyard",
      npcId: "barvis",
      npcName: "Barvis",
      organization: "Yard Exchange Shipyard",
      serviceType: "shipyard",
      label: "Shipyard",
      description: "Ship sales and refits.",
    },
    {
      id: "yard-finance",
      npcId: "mako",
      npcName: "Mr. Mako",
      organization: "Yard Exchange Finance",
      serviceType: "finance",
      label: "Finance",
      description: "Loans and payments.",
    },
    {
      id: "yard-supply",
      npcId: "finley",
      npcName: "Finley",
      organization: "Yard Exchange Supply",
      serviceType: "supply",
      label: "Supply",
      description: "Repair, fuel, charges, scanergy, and resource buying.",
    },
  ],
};
```

Avoid:

- Do not rewrite Journey yet.
- Do not remove existing Merchant behavior yet.
- Do not create all service UIs in this step.

### Step 3: Convert the docked Hub panel into a service menu

Goal:

- When docked, the Hub panel lists available NPC/service windows for the current hub.

Likely files:

- `index.html`
- `src/main.js`
- `src/styles.css`
- new hub service data/system files

Behavior:

- Docking at Yard Exchange shows a service menu.
- Clicking `Shipyard` opens the existing Merchant panel.
- Clicking `Finance` focuses/offers finance-related contract UI.
- Clicking `Rook Industries` focuses/offers work contracts.
- Clicking `Supply` can initially show "coming soon" or a simple supply window.

Avoid:

- Do not make mission files directly open Barvis/Mako sales forever.
- Do not duplicate service behavior inside every mission.

### Step 4: Move Barvis ship sales behind the Shipyard service

Goal:

- Barvis becomes a hub service NPC, not a Journey-only story puppet.

Likely files:

- `src/content/ships/shipOffers.js`
- `src/main.js`
- hub service files
- `src/content/missions/chapterOneNewShip.js`

Behavior:

- The mission tells the player to talk to Barvis at the Shipyard.
- The Shipyard service opens the Merchant panel.
- Barvis reacts based on account credits, ship ownership, and existing financing.
- Buying a ship records `ship.purchased`.
- The mission listens for `ship.purchased` and moves forward.

Avoid:

- Do not have the mission directly sell the ship.
- Do not have the mission directly decide if the player can afford it.

### Step 5: Move Mako financing behind the Finance service

Goal:

- Mako becomes a hub finance service NPC.

Likely files:

- `src/content/contracts/chapterOneContracts.js`
- `src/systems/contractManager.js`
- hub service files
- `src/content/missions/chapterOneNewShip.js`

Behavior:

- Barvis can direct the player to Finance if they cannot afford the ship.
- Finance service offers the starter loan contract.
- Loan acceptance deposits credits and records debt.
- Later, this service owns payment controls.

Avoid:

- Do not make Barvis create money.
- Do not make Journey directly disburse money.

### Step 6: Move Rook repeatable work behind Rook Industries

Goal:

- Rook's red-resource work becomes a hub service offer.

Likely files:

- `src/content/contracts/chapterOneContracts.js`
- `src/content/missions/chapterOneRedWork.js`
- hub service files

Behavior:

- Mission Rook can say "come see me for work."
- Hub Rook can offer resource contracts from the service menu.
- The contract system handles requirements, deposits, fulfillment, and payout.
- The mission can listen for the first accepted/completed Rook work contract if it needs to teach the loop.

Avoid:

- Do not make the mission permanently own repeatable work.

### Step 7: Add Finley and the Supply service

Goal:

- Basic supplies and repairs become hub services.

Likely files:

- hub service files
- `src/main.js`
- `src/game.js` only if needed for docking/refuel behavior
- maybe `src/systems/shopManager.js`

First services:

- repair hull
- buy mining charges
- buy scanergy
- refuel
- buy red resources at 50 credits each

Design note:

- Rook's contract pays better than Finley's resource buying. That makes contracts feel valuable without making loose selling useless.

Avoid:

- Do not overbuild inventory pricing or reputation yet.

### Step 8: Add formal action adapters for missions

Goal:

- Missions request system actions through a small stable action layer instead of mutating details directly.

Examples:

- `showPanel(componentId)`
- `hidePanel(componentId)`
- `setComponentLocked(componentId, locked)`
- `grantResource(resourceId, amount)`
- `setResource(resourceId, amount)`
- `offerContract(contractId)`
- `setShipPowerAllowed(false)`
- `setMissionTarget(siteId)`

Why:

- Mission authors should be able to script beats without knowing how every system stores state.
- Future JSON mission files become easier.

Avoid:

- Do not build a huge scripting engine yet.
- Add only actions that current missions actually need.

## Recommended immediate next coding step

Build Step 2 and the smallest useful part of Step 3:

1. Add Yard Exchange service data.
2. Add a small hub service resolver.
3. Update the Hub panel to list services when docked.
4. Make `Shipyard` open/focus the existing Merchant panel.
5. Leave Barvis/Mako story flow mostly intact until the service menu works.

This gives us the new architecture without breaking the current mission.

## Things to avoid for now

- Do not rewrite all Chapter 1 missions in one pass.
- Do not replace the Contract Manager.
- Do not move every Barvis/Mako/Rook behavior at once.
- Do not build a full shop/economy UI before the service menu exists.
- Do not make Journey responsible for hub service details.

## Long-term content shape

The future content model should look roughly like:

```text
Hub
  services
    service NPC
      available interactions
      conditions
      offered contracts
      opened panels

Mission
  mission NPCs
  ordered steps
  ledger transitions
  considerations
  helper text
  requested system actions

Contract
  issuer
  requirements
  fulfillment listener
  payout
  status
```

That lets the same world support authored story, repeatable jobs, emergent hub visits, future factions, and player choice without every mission becoming custom glue.
