// Rules that let the ship interface emerge from installed components. The
// processor asks this file what outputs exist instead of hardcoding them in UI.
export function getProcessorOutputs(components) {
  const outputs = [];

  // A failed processor cannot route anywhere but the hold.
  //
  // The conversion side of the unit is dead, so nothing can be turned into fuel,
  // charges, scanergy or patch reserve. The mag link physically reaches only the
  // cargo chamber, and raw material passes straight through unrefined — which is
  // the visible, in-world reason a Rook hand's ore arrives as ore. There is no
  // wear ladder driving the processor to this stage yet; today it is authored,
  // and this is the behaviour of that final stage when one exists.
  if (components.processor?.condition?.stage === "failed") {
    return components.cargoHold?.installed ? [buildCargoOutput()] : [];
  }

  if (components.engine.installed) {
    outputs.push({
      id: "fuel",
      label: "Fuel",
      amountLabel: "matching materials",
      acceptedShapes: ["circle", "triangle", "octagon"],
      color: "#29b6d8",
    });
  }

  if (components.miner.installed) {
    outputs.push({
      id: "ammo",
      label: "Charges",
      amountLabel: "matching materials",
      acceptedShapes: ["square", "triangle", "diamond"],
      color: "#d93b24",
    });
  }

  if (components.scanner.installed || components.collector?.installed) {
    outputs.push({
      id: "scanergy",
      label: "Scanergy",
      amountLabel: "matching materials",
      acceptedShapes: ["hexagon", "diamond"],
      color: "#7a2bd1",
    });
  }

  if (components.hull?.installed) {
    outputs.push({
      id: "hull-repair",
      label: "Repair Hull",
      amountLabel: "structural = efficient",
      // Every material can be jury-rigged into patch reserve in a pinch, so all
      // shapes are accepted; structural (square) just converts far better.
      acceptedShapes: ["square", "triangle", "circle", "hexagon", "octagon", "diamond", "shard"],
      color: "#d93b24",
    });
  }

  if (components.cargoHold.installed) {
    outputs.push(buildCargoOutput());
  }

  return outputs;
}

// The hold takes anything, which is why it is the one destination a dead
// processor can still reach.
function buildCargoOutput() {
  return {
    id: "cargo",
    label: "Cargo",
    amountLabel: "store unit",
    acceptedShapes: ["circle", "square", "triangle", "hexagon", "octagon", "diamond", "shard"],
    color: "#82909e",
  };
}

export function normalizeProcessorOutput(components) {
  const outputs = getProcessorOutputs(components);
  const selectedOutput = outputs.find((output) => output.id === components.processor.output);

  if (selectedOutput || outputs.length === 0) {
    return;
  }

  components.processor.output = outputs[0].id;
}
