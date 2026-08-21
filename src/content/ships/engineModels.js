// Engine models are a CONTROL SCHEME as much as a performance figure: what the
// down input does, and therefore what the pilot has to be able to do with it.
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
  }),
  "vektor-reversing-drive": Object.freeze({
    id: "vektor-reversing-drive",
    brand: "Vektor",
    name: "R/T Reversing Drive",
    downControl: "reverse-thrust",
    downControlLabel: "S reverse thrust",
    reverseThrusterMultiplier: 0.72,
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
