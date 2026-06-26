export function getProcessorOutputs(components) {
  const outputs = [];

  if (components.engine.installed) {
    outputs.push({
      id: "fuel",
      label: "Fuel",
      amountLabel: "+50 fuel",
    });
  }

  if (components.miner.installed) {
    outputs.push({
      id: "ammo",
      label: "Ammo",
      amountLabel: "+50 ammo",
    });
  }

  if (components.scanner.installed) {
    outputs.push({
      id: "scanergy",
      label: "Scanergy",
      amountLabel: "+50% scan",
    });
  }

  if (components.cargoHold.installed) {
    outputs.push({
      id: "cargo",
      label: "Cargo",
      amountLabel: "store unit",
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
