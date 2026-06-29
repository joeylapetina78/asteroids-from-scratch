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
    },
    reward: {
      credits: 500,
    },
    clauses: [
      "Payment releases when the listed VIN docks at the destination hub.",
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
];
