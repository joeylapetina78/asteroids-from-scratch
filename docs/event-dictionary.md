# Event Dictionary

The event ledger is the shared memory spine for missions, contracts, NPCs, stats, and future saves. Systems should record facts here without knowing every possible listener.

This document is a living manual for authoring. It should grow whenever a new event becomes part of mission, contract, NPC, legal, economy, or world behavior.

## Authoring Rules

- Event names use `domain.verb`, such as `site.docked` or `contract.paid`.
- Payloads should use stable ids, not just display names.
- Fast/noisy events can be hidden with `{ visible: false }` while still feeding stats and listeners.
- Missions and contracts should prefer ledger events over direct calls when possible.
- If an event becomes important to content authors, document it here.
- New mission content should prefer `actor.*`, `pilot.*`, `controlledShip.*`, or entity-scoped signals. Legacy `player.*` signals still exist as compatibility aliases for older prototype code.

## Common Mission Events

| Event | Important Payload | Meaning |
| --- | --- | --- |
| `mission.accepted` | `missionId`, `missionName` | A mission became active. |
| `mission.completed` | `missionId`, `missionName` | A mission finished. |
| `component.shown` | `componentId`, `componentName` | A panel/component was revealed in the cockpit UI. |
| `component.unlocked` | `componentId`, `componentName` | A panel/component became available. |
| `component.dragged` | `componentId` | The player moved a panel. |
| `component.filed` | `componentId`, `destination` | A paperwork-style panel was filed into the drawer. |
| `comms.message` | `speaker`, `source`, `priority`, `requiresAcknowledgement` | A non-mission speaker sent text through the comms director. Hidden by default. |

## Ship And Control Events

| Event | Important Payload | Meaning |
| --- | --- | --- |
| `engine.powered` | none required | Ship power came on. |
| `engine.poweredDown` | `dockedSiteId` when docked | Ship power went off. |
| `ship.thrusted` | `speed` | The controlled ship used thrust. |
| `ship.moved` | `distance`, `speed` | Movement was logged for stats. |
| `ship.stranded` | `nearestSiteId`, `nearestSiteName` | Ship is out of fuel or otherwise stranded. |
| `ship.towed` | `siteId`, `siteName`, `cost` | Tow service delivered the ship. |
| `ship.collision` | `targetType`, `targetName`, `damage` | Ship hit something. |
| `ship.nearObject` | `targetType`, `targetName` | Ship came close to something noteworthy. |

## Site, Hub, And Zone Events

| Event | Important Payload | Meaning |
| --- | --- | --- |
| `site.nearby` | `siteId`, `siteName` | A site is close enough to matter. |
| `site.enteredViewport` | `siteId`, `siteName` | A site entered the player view. |
| `site.docked` | `siteId`, `siteName` | The controlled ship docked at a site. |
| `site.undocked` | `siteId`, `siteName` | The controlled ship undocked from a site. |
| `site.tetherBroken` | `siteId`, `siteName` | The controlled ship broke a docking tether. |
| `ship.registryReviewed` | `siteId`, `vin`, `pilotLicenseId`, `checkedDocuments`, `clearance` | A hub reviewed ship/pilot documents through the inspection report. |
| `zone.entered` | `zoneId`, `zoneName`, `danger`, `tags` | The controlled ship entered a zone profile. |

## Contract And Economy Events

| Event | Important Payload | Meaning |
| --- | --- | --- |
| `contract.offered` | `contractId`, `contractTitle`, `issuer`, `offerSource` | A contract was offered. |
| `contract.offerClosed` | `contractId`, `siteId`, `serviceId` | An unaccepted hub-service offer was removed. |
| `contract.accepted` | `contractId`, `contractType`, `contractGroup` | A contract was accepted by the current actor/account. |
| `contract.resourceDeposited` | `contractId`, `resourceType`, `deliveredAmount`, `requiredAmount` | One resource unit was deposited toward a contract. |
| `contract.fulfilled` | `contractId`, `destinationSiteId`, `shipVin`, `resourceType`, `unitsDelivered` | Terms are satisfied, payment is ready. |
| `contract.paid` | `contractId`, `creditsPaid`, `accountCredits` | Contract payment was collected into the current account. |
| `payment.made` | `paymentId`, `payableType`, `payableId`, `payeeEntityId`, `amountPaid`, `accountCredits` | Generic payment receipt. Loans, fees, fines, purchases, and future payouts should move toward this path. |
| `loan.disbursed` | `contractId`, `obligationId`, `principal`, `maxInterest`, `accountCredits` | Loan funds were added and a loan obligation was created. |
| `loan.paymentMade` | `obligationId`, `sourceContractId`, `amountPaid`, `balance`, `accountCredits` | Credits were paid from the current account toward a loan obligation. |
| `loan.paidOff` | `obligationId`, `sourceContractId`, `creditorEntityId`, `accountCredits` | A loan obligation reached zero balance and its collateral can be released. |
| `rook.bonusAwarded` | `creditsPaid`, `accountCredits` | Rook paid a non-contract bonus. |
| `cargo.sold` | `creditsEarned`, `units` | Cargo was sold for credits. |
| `ship.purchased` | `offerId`, `shipName`, `price` | A ship package was purchased for the current pilot/account. |

## Contract Terms

Contract definitions can keep simple display fields in `terms`, but reusable fulfillment should move toward a `terms.requires` list. The current supported requirement types are:

| Requirement | Fields | Meaning |
| --- | --- | --- |
| `dockAt` | `siteId` | Contract can be fulfilled only at this hub/site. |
| `shipVinAttached` | `vin` | The active hull must have this VIN plate attached. |
| `poweredDown` | none | The engine must be powered down. |

Example:

```js
terms: {
  requires: [
    { type: "dockAt", siteId: "yard-exchange" },
    { type: "shipVinAttached", vin: "YRDSKF-01-7A3" },
    { type: "poweredDown" },
  ],
}
```

The older delivery fields still exist for display and compatibility. Future contracts should add predicates rather than asking `contractManager` to learn another one-off shape.

## Resource And Mining Events

| Event | Important Payload | Meaning |
| --- | --- | --- |
| `weapon.fired` | `weaponType`, `ammoSpent` | Miner/blaster fired. |
| `asteroid.destroyed` | `resourceType`, `tier`, `finalBreak` | Rock was broken or destroyed. |
| `resource.mined` | `units`, `totalUnits` | Mining produced resource units. |
| `resource.collected` | `resourceType`, `amount` | Ship collected a loose resource. |
| `resource.processed` | `resourceType`, `output`, `amount` | Processor converted a resource. |

## NPC And Combat Events

| Event | Important Payload | Meaning |
| --- | --- | --- |
| `npc.enteredViewport` | `npcType`, `npcName` | NPC ship entered view. |
| `npc.carefulMode` | `npcType`, `npcName`, `reason` | NPC switched route behavior. |
| `npc.destroyed` | `npcType`, `npcName`, `cause` | NPC ship was destroyed. |
| `enemy.destroyed` | `enemyType`, `cause` | Hostile life/enemy was destroyed. |

## Legal Events

| Event | Important Payload | Meaning |
| --- | --- | --- |
| `ship.titleIssued` | `shipVin`, `titleHolder` | A title record was issued. |
| `ship.registered` | `shipVin`, `registrationId`, `registrationType` | A registration was issued. |
| `title.lienAttached` | `shipVin`, `lienHolder`, `contractId` | A debt/legal claim was attached to a title. |

## Mission Rule Conditions

Mission rules can currently use:

- `eventType`
- `payloadEquals`
- `once`
- `repeatable`
- `cooldownMs`
- `maxRuns`
- `setFlag`
- `requiresFlag`
- `requiresFlags`
- `requiresSignal`
- `requiresSignals`
- `forbidSignal`
- `forbidSignals`
- `requiresStat`
- `requiresStats`
- `requiresRecentEvent`
- `requiresCondition`
- `responses`
- `responseMode`
- `beforeResponseActions`
- `afterResponseActions`

`requiresCondition` is still JavaScript-only. It is useful while discovering the system shape, but it should be avoided for content that we want a future web editor to handle cleanly.

## Mission Actions

The current mission action vocabulary lives in `src/systems/missionActions.js`. It exports `MISSION_ACTION_DEFINITIONS`, which is the first machine-readable seed for a future editor form.

Current action types:

- `say`
- `clearMessage`
- `showComponent`
- `hideComponent`
- `offerContract`
- `setComponentValue`
- `raiseComponentValue`
- `unlockHubService`
- `requestAttention`
- `setEnginePowerLock`
- `goToStep`
- `completeMission`
- `completeAndStartMission`
- `spawnHunterNearShip`

Next documentation pass should add required fields and examples for each action.
