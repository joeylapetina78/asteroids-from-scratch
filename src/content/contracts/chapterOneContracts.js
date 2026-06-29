export const chapterOneContracts = [
  {
    id: "rook-yard-exchange-delivery",
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
];
