// Routine wear: what ordinary work and travel cost a hull.
//
// Wear was previously three unrelated sets of hardcoded numbers — per-delivery
// wear in the mining operation, per-distance wear on NPC ships, and seeded
// starting values in logistics. This module is the single place the pace of the
// maintenance economy is tuned.
//
// ROUTINE_WEAR_SCALE is the one dial. Rates below are written at their original
// full strength, so the table still reads as the designed cost of a trip, and
// the scale says how much of that cost the fleet actually pays.
//
// This covers ROUTINE wear only: ordinary travel and ordinary completed work.
// There is currently no damage-driven or fault-driven wear in the simulation —
// wear causes faults, not the other way round — so there is nothing
// extraordinary here to hold separate yet. When that system exists it should
// get its own scale rather than riding on this one.
//
// There is deliberately no accelerated/debug variant. Wear acceleration used to
// be implied by any dev start, which quietly meant free-play sessions ran at up
// to 12x wear and could never feel a change to these numbers. One rate for
// everyone is easier to reason about and to tune.

export const ROUTINE_WEAR_SCALE = 0.25;

// Wear a mining worker books on completing one delivery.
const MINING_WORK_WEAR = 0.125;

// Wear an NPC ship books per unit of distance travelled. Corridor travel is the
// maintained route; open field is everything else.
const TRAVEL_WEAR = Object.freeze({
  corridor: { standard: 0.00004, careful: 0.000088 },
  openField: { standard: 0.000064, careful: 0.000136 },
});

// Wear booked by finishing one mining delivery.
export function getMiningWorkWear() {
  return MINING_WORK_WEAR * ROUTINE_WEAR_SCALE;
}

// Wear booked per unit distance travelled.
export function getTravelWearRate({ corridor = false, careful = false } = {}) {
  const lane = corridor ? TRAVEL_WEAR.corridor : TRAVEL_WEAR.openField;
  return (careful ? lane.careful : lane.standard) * ROUTINE_WEAR_SCALE;
}

// Exposed so tests and tuning can read the unscaled design values.
export function getBaseRates() {
  return { miningWork: MINING_WORK_WEAR, travel: TRAVEL_WEAR };
}
