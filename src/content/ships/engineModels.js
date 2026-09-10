// Engine models are a CONTROL SCHEME and a performance figure: what the down
// input does, and how hard the drive pushes.
//
// The performance half is new. It used to live only on the engine COMPONENT,
// which meant a Vektor R/T was a 185-top-speed drive in Explorer One and a
// 105 drive in the yard skiff — the same name for two different things, and a
// player who bought one reasonably expected the faster one. A drive is now
// simply better or worse wherever it is bolted; see craftPerformance.js for
// how these compose with a tune and with hull mass.
//
// A brake is forgiving — worst case you stop. Reverse thrust is not: it lets a
// craft back away while still pointed at what it was working on, which is
// exactly what a miner needs to retreat without losing its firing arc, and
// exactly the kind of handling that goes wrong in inexperienced hands. So a
// reversing drive states the flying it asks for, and `operatorSkills` decides
// whether the person at the controls has been shown to have it.
export const ENGINE_MODELS = Object.freeze({
  "rook-standard-drive": Object.freeze({
    id: "rook-standard-drive",
    brand: "Rook",
    name: "Standard Drive",
    downControl: "brake",
    downControlLabel: "S brake",
    // The floor of the world. Everything else is measured against this.
    thrustPower: 95,
    maxSpeed: 105,
  }),
  "vektor-reversing-drive": Object.freeze({
    id: "vektor-reversing-drive",
    brand: "Vektor",
    name: "R/T Reversing Drive",
    downControl: "reverse-thrust",
    downControlLabel: "S reverse",
    reverseThrusterMultiplier: 0.72,
    // A real drive, not just a different pedal. Comfortably above the Rook and
    // deliberately below what a fully tuned ship reaches, so a bolted-on drive
    // never quite equals a craft that was built around one.
    thrustPower: 140,
    maxSpeed: 155,
    // Demonstrated precision flying, not a licence somebody was handed.
    requiresSkill: { skill: "precision-flight", level: 45 },
  }),
});

export const DEFAULT_ENGINE_MODEL_ID = "rook-standard-drive";

export function getEngineModel(engineOrId = null) {
  const id = typeof engineOrId === "string" ? engineOrId : engineOrId?.engineModelId;
  return ENGINE_MODELS[id] ?? ENGINE_MODELS[DEFAULT_ENGINE_MODEL_ID];
}

export function listEngineModels() {
  return Object.values(ENGINE_MODELS);
}
