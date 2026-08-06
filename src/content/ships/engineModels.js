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
