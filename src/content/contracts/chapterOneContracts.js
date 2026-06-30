const RESOURCE_CONTRACTS = [
  {
    id: "rook-red-resource-run-5",
    resourceType: "fuel",
    resourceName: "red resources",
    title: "Red Resource Run",
    amount: 5,
  },
  {
    id: "rook-red-resource-run-10",
    resourceType: "fuel",
    resourceName: "red resources",
    title: "Heavy Red Resource Run",
    amount: 10,
  },
  {
    id: "rook-blue-resource-run-5",
    resourceType: "crystal",
    resourceName: "blue crystals",
    title: "Blue Crystal Run",
    amount: 5,
  },
  {
    id: "rook-blue-resource-run-10",
    resourceType: "crystal",
    resourceName: "blue crystals",
    title: "Heavy Blue Crystal Run",
    amount: 10,
  },
];

export const chapterOneContracts = [
  {
    id: "rook-yard-exchange-delivery",
    type: "delivery",
    title: "Assessment Delivery",
    issuer: "Rook",
    summary: "Deliver the registered Yard Skiff to Yard Exchange.",
    terms: {
      deliverShipVin: "YRDSKF-01-7A3",
      destinationSiteId: "yard-exchange",
      destinationName: "Yard Exchange",
      requirePoweredDown: true,
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
    },
    reward: {
      credits: 20000,
    },
    clauses: [
      "20,000 credits are deposited immediately on acceptance.",
      "Interest accrues later up to a maximum of 4,500 credits.",
      "Payment controls will be added to this contract record as financing comes online.",
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
    },
    reward: {
      credits: 5000,
    },
    clauses: [
      "5,000 credits are deposited immediately on acceptance.",
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
    summary: `Deliver ${contract.amount} ${contract.resourceName} to Yard Exchange.`,
    terms: {
      resourceType: contract.resourceType,
      resourceName: contract.resourceName,
      amount: contract.amount,
      destinationSiteId: "yard-exchange",
      destinationName: "Yard Exchange",
    },
    reward: {
      creditsPerUnit: 200,
      credits: contract.amount * 200,
    },
    clauses: [
      `Terms are satisfied when ${contract.amount} ${contract.resourceName} are delivered from cargo at Yard Exchange.`,
      "Payment releases when the completed contract is confirmed.",
      "Resources must be in the cargo hold, not loose in space.",
      "Return to Rook Industries for the next available job.",
    ],
  })),
];
