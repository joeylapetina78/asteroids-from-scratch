// Rules that let the ship interface emerge from installed components. The
// processor asks this file what outputs exist instead of hardcoding them in UI.
export function getProcessorOutputs(components) {
  const outputs = [];

  if (components.engine.installed) {
    outputs.push({
      id: "fuel",
      label: "Fuel",
      amountLabel: "matching materials",
      acceptedShapes: ["circle", "triangle", "octagon"],
      color: "#b8eaff",
    });
  }

  if (components.miner.installed) {
    outputs.push({
      id: "ammo",
      label: "Charges",
      amountLabel: "matching materials",
      acceptedShapes: ["square", "triangle", "diamond"],
      color: "#ff7452",
    });
  }

  if (components.scanner.installed) {
    outputs.push({
      id: "scanergy",
      label: "Scanergy",
      amountLabel: "matching materials",
      acceptedShapes: ["hexagon", "diamond"],
      color: "#a066ff",
    });
  }

  if (components.cargoHold.installed) {
    outputs.push({
      id: "cargo",
      label: "Cargo",
      amountLabel: "store unit",
      acceptedShapes: ["circle", "square", "triangle", "hexagon", "octagon", "diamond", "shard"],
      color: "#d9deea",
    });
  }

  return outputs;
}

export function normalizeProcessorOutput(components) {
  const outputs = getProcessorOutputs(components);
  const selectedOutput = outputs.find((output) => output.id === components.processor.output);

  if (selectedOutput || outputs.length === 0) {
    return;
  }

  components.processor.output = outputs[0].id;
}
