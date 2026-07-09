import { chapterOneRoute, storySites } from "../storyWorld.js?v=fresh-20260708-patrol1";

const RESOURCE_CONTRACTS = [
  {
    id: "rook-red-resource-run-5",
    resourceType: "iron-nickel",
    resourceName: "red ore",
    title: "Red Ore Run",
    amount: 5,
    summary: (dest) => `Deliver 5 red ore to ${dest}. Red Teeth and the surrounding belt are the best source.`,
  },
  {
    id: "rook-red-resource-run-10",
    resourceType: "iron-nickel",
    resourceName: "red ore",
    title: "Heavy Red Ore Run",
    amount: 10,
    prerequisites: ["rook-red-resource-run-5"],
    summary: (dest) => `Deliver 10 red ore to ${dest}. Stock up from the dense belt past Red Teeth.`,
  },
  {
    id: "rook-copper-run-5",
    resourceType: "copper",
    resourceName: "copper ore",
    title: "Copper Drift Run",
    amount: 5,
    prerequisites: ["rook-red-resource-run-10"],
    summary: (dest) => `Deliver 5 copper ore to ${dest}. Head northwest into Copper Drift — it's closer than it looks.`,
  },
  {
    id: "rook-copper-run-10",
    resourceType: "copper",
    resourceName: "copper ore",
    title: "Heavy Copper Drift Run",
    amount: 10,
    prerequisites: ["rook-copper-run-5"],
    summary: (dest) => `Deliver 10 copper ore to ${dest}. Copper Drift is northwest — teal rocks, medium density field.`,
  },
];

export const chapterOneContracts = [
  {
    id: "rook-yard-exchange-delivery",
    type: "delivery",
    title: "Assessment Delivery",
    issuer: "Rook",
    summary: `Deliver the registered Yard Skiff to ${storySites.starterHub.name}.`,
    terms: {
      deliverShipVin: "YRDSKF-01-7A3",
      destinationSiteId: chapterOneRoute.destinationSite.id,
      destinationName: chapterOneRoute.destinationSite.name,
      requirePoweredDown: true,
      requires: [
        { type: "dockAt", siteId: chapterOneRoute.destinationSite.id },
        { type: "shipVinAttached", vin: "YRDSKF-01-7A3" },
        { type: "poweredDown" },
      ],
    },
    reward: {
      credits: 1000,
    },
    clauses: [
      "Terms are satisfied when the listed VIN docks at the destination hub with ship power down.",
      "Payment releases when the completed contract is confirmed.",
      "Damage penalties are waived for this assessment contract.",
    ],
  },
  {
    id: "mako-starter-ship-loan",
    type: "loan",
    title: "Starter Ship Financing",
    issuer: "Yard Exchange Finance Office",
    summary: "A financial loan for purchasing one approved starter mining ship.",
    terms: {
      principal: 20000,
      interestRate: 0.12,
      interestHours: 12,
      maxInterest: 4500,
      dueLabel: "12 in-game hours",
      fundingPurpose: "starter-ship-purchase",
    },
    reward: {
      credits: 20000,
    },
    clauses: [
      "20,000 credits are deposited to the cash account tied to your provisional ID.",
      "Accepting creates a loan obligation owed to Yard Exchange Finance Office.",
      "Interest accrues later up to a maximum of 4,500 credits.",
      "The financed hull title remains lien-held until the obligation is paid off.",
    ],
  },
  {
    id: "mako-emergency-fuel-loan",
    type: "loan",
    repeatable: true,
    title: "Emergency Fuel Note",
    issuer: "Yard Exchange Finance Office",
    summary: "A short emergency loan for stranded pilots who need fuel money.",
    terms: {
      principal: 5000,
      interestRate: 0.18,
      interestHours: 6,
      maxInterest: 1500,
      dueLabel: "6 in-game hours",
      fundingPurpose: "emergency-fuel",
    },
    reward: {
      credits: 5000,
    },
    clauses: [
      "5,000 credits are deposited to the cash account tied to your provisional ID.",
      "Accepting creates a short emergency fuel obligation.",
      "This note exists for pilots who made it back alive but not solvent.",
      "Interest accrues later up to a maximum of 1,500 credits.",
      "Use Supply to buy fuel after the note funds.",
    ],
  },
  ...RESOURCE_CONTRACTS.map((contract) => ({
    id: contract.id,
    type: "resource-delivery",
    group: "rook-resource-run",
    repeatable: true,
    title: contract.title,
    issuer: "Rook",
    summary: contract.summary ? contract.summary(storySites.starterHub.name) : `Deliver ${contract.amount} ${contract.resourceName} to ${storySites.starterHub.name}.`,
    terms: {
      resourceType: contract.resourceType,
      resourceName: contract.resourceName,
      amount: contract.amount,
      destinationSiteId: storySites.starterHub.id,
      destinationName: storySites.starterHub.name,
    },
    reward: {
      creditsPerUnit: 200,
      credits: contract.amount * 200,
    },
    clauses: [
      `Terms are satisfied when ${contract.amount} units of ${contract.resourceName} are delivered from cargo at ${storySites.starterHub.name}.`,
      "Payment releases when the completed contract is confirmed.",
      "Resources must be in the cargo hold, not loose in space.",
      "Return to Rook Industries for the next available job.",
    ],
  })),
];
